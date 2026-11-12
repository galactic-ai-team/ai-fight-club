import { createCommanderAutopilot, initialFromBotId, type Autopilot } from "./autopilot.ts";
import { createBot } from "../bots/index.ts";
import {
  claimHost,
  getState,
  markApplied,
  publishState,
  pullCommands,
  saveHostToken,
  volunteerHost,
} from "./client.ts";
import { parseCommand } from "./parse.ts";
import { actionLabel, publicFromMatch, pushMove } from "./summary.ts";
import {
  closeWindow,
  createWindowState,
  markSubmitted,
  openWindow,
  shouldCloseWindow,
  shouldOpenWindow,
  snapshotWindow,
  type DecisionWindowState,
} from "./windows.ts";
import { TICK_MS, appendInput, createMatch, emptyReplay, observe, stepMatch } from "../engine/index.ts";
import { commentOnEvents, type CommentaryContext } from "../commentary/index.ts";
import { attackPhaseOf, ATTACKS } from "../engine/attacks.ts";
import { renderMatch, resizeCanvas } from "../render/canvas.ts";
import { renderSpectatorFrame } from "../spectator/index.ts";
import type { MatchState, Replay, Side } from "../engine/types.ts";
import type {
  CommandRecord,
  CommanderDirective,
  MatchPublicState,
  OpenSeat,
  WindowMode,
} from "./types.ts";

export interface LiveMeta {
  id: string;
  seed: number;
  window: WindowMode;
  openSeat?: OpenSeat;
  p1: { controller: string; character: string; bot: string };
  p2: { controller: string; character: string; bot: string };
}

export interface HostHandle {
  stop: () => void;
  isHost: true;
  getMatch: () => MatchState | null;
  getPublic: () => MatchPublicState | null;
}

function commentaryContext(state: MatchState): CommentaryContext {
  return {
    p1HealthFrac: state.p1.health / state.p1.maxHealth,
    p2HealthFrac: state.p2.health / state.p2.maxHealth,
    p1Wins: state.p1Wins,
    p2Wins: state.p2Wins,
    round: state.round.number,
    timeLeftSeconds: Math.ceil(state.round.timeLeftTicks / 60),
  };
}

function phaseOf(f: MatchState["p1"]): string | null {
  if (f.state !== "attack" || !f.attack) return null;
  return attackPhaseOf(ATTACKS[f.attack], f.attackT);
}


function require2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  return ctx;
}

function underlyingBot(botId: string) {
  try {
    return createBot(botId);
  } catch {
    return undefined;
  }
}

export async function startHost(
  canvas: HTMLCanvasElement,
  meta: LiveMeta,
  hostToken: string,
  hooks: {
    onPublic: (s: MatchPublicState) => void;
    onLog: (text: string, kind: string) => void;
  },
): Promise<HostHandle> {
  const claimed = await claimHost(meta.id, hostToken);
  const ctx = require2d(canvas);
  resizeCanvas(canvas);

  const p1 = createCommanderAutopilot({
    id: "p1-commander",
    name: claimed.p1.controller,
    initial: initialFromBotId(claimed.p1.bot),
    underlying: underlyingBot(claimed.p1.bot),
  });
  const p2 = createCommanderAutopilot({
    id: "p2-commander",
    name: claimed.p2.controller,
    initial: initialFromBotId(claimed.p2.bot),
    underlying: underlyingBot(claimed.p2.bot),
  });
  const match = createMatch({
    seed: claimed.seed,
    p1Character: claimed.p1.character,
    p2Character: claimed.p2.character,
  });
  const replay: Replay = emptyReplay({
    seed: claimed.seed,
    p1BotId: p1.id,
    p2BotId: p2.id,
    p1Character: match.p1.character,
    p2Character: match.p2.character,
  });
  p1.start?.({ side: "p1", seed: claimed.seed, opponentId: p2.id });
  p2.start?.({ side: "p2", seed: claimed.seed, opponentId: p1.id });

  const win: DecisionWindowState = createWindowState(claimed.window);
  const lastMoves: { p1: string[]; p2: string[] } = { p1: [], p2: [] };
  const lastCmd: { p1: CommandRecord | null; p2: CommandRecord | null } = { p1: null, p2: null };
  const events: string[] = [];
  let lastSeq = 0;
  let incoming: CommandRecord[] = [];
  let playing = true;
  let stopped = false;
  let acc = 0;
  let lastTs = performance.now();
  let lastPublish = 0;
  let lastPull = 0;
  let pub: MatchPublicState | null = null;
  const startedAtMs = Date.now();
  const pendingMarks: Array<{ seq: number; tick: number }> = [];

  function applyIncoming(tick: number): void {
    if (!incoming.length) return;
    const rest: CommandRecord[] = [];
    for (const c of incoming) {
      const parsed = parseCommand(c.raw);
      if (!parsed.ok) continue;
      const pilot: Autopilot = c.side === "p1" ? p1 : p2;
      pilot.setCommand(parsed.partial, tick);
      c.appliedTick = tick;
      lastCmd[c.side] = c;
      if (win.open) markSubmitted(win, c.side);
      pendingMarks.push({ seq: c.seq, tick });
      hooks.onLog(
        `${c.controller} → ${c.side.toUpperCase()} ${parsed.partial.stance ?? "plan"}` +
          (parsed.partial.taunt ? ` “${parsed.partial.taunt}”` : "") +
          (c.latencyMs ? ` (${(c.latencyMs / 1000).toFixed(2)}s)` : ""),
        "cmd",
      );
    }
    incoming = rest;
  }

  function buildPublic(nowMs: number): MatchPublicState {
    return publicFromMatch(meta.id, match, {
      seed: claimed.seed,
      window: snapshotWindow(win, nowMs),
      p1: {
        controller: claimed.p1.controller,
        lastMoves: lastMoves.p1,
        command: p1.getDirective(),
        commandSeq: lastCmd.p1?.seq ?? null,
        latencyMs: lastCmd.p1?.latencyMs ?? null,
        attackPhase: phaseOf(match.p1),
      },
      p2: {
        controller: claimed.p2.controller,
        lastMoves: lastMoves.p2,
        command: p2.getDirective(),
        commandSeq: lastCmd.p2?.seq ?? null,
        latencyMs: lastCmd.p2?.latencyMs ?? null,
        attackPhase: phaseOf(match.p2),
      },
      p1Bot: claimed.p1.bot,
      p2Bot: claimed.p2.bot,
      events,
      hostPresent: true,
      updatedAtMs: nowMs,
      startedAtMs,
      phaseOverride: win.open ? "window" : undefined,
      openSeat: claimed.openSeat ?? meta.openSeat ?? "none",
    });
  }

  function tick(): void {
    if (match.over) return;
    applyIncoming(match.tick);
    const nowMs = Date.now();
    if (shouldOpenWindow(match.tick, win)) {
      openWindow(win, match.tick, nowMs);
      playing = false;
      hooks.onLog(`Decision window #${win.index} — commanders, send a plan.`, "window");
      return;
    }
    const a1 = p1.act(observe(match, "p1"));
    const a2 = p2.act(observe(match, "p2"));
    appendInput(replay, a1, a2);
    stepMatch(match, a1, a2);
    lastMoves.p1 = pushMove(lastMoves.p1, actionLabel({
      state: match.p1.state, attack: match.p1.attack, blocking: match.p1.blocking,
    }));
    lastMoves.p2 = pushMove(lastMoves.p2, actionLabel({
      state: match.p2.state, attack: match.p2.attack, blocking: match.p2.blocking,
    }));
    const names = { p1: match.p1.character, p2: match.p2.character };
    for (const line of commentOnEvents(match.lastEvents, names, commentaryContext(match))) {
      events.push(line.text);
      hooks.onLog(line.text, line.kind);
    }
    if (match.over) {
      replay.result = {
        winner: match.matchWinner,
        p1Wins: match.p1Wins,
        p2Wins: match.p2Wins,
        ticks: match.tick,
      };
      playing = false;
      hooks.onLog(`Match over in ${match.tick} ticks.`, "match_end");
    }
  }

  function frame(now: number): void {
    if (stopped) return;
    requestAnimationFrame(frame);
    const nowMs = Date.now();
    if (win.open && shouldCloseWindow(win, nowMs)) {
      closeWindow(win);
      playing = !match.over;
      lastTs = now;
      acc = 0;
      hooks.onLog("Window closed — last plan stands.", "window");
    }
    if (playing && !match.over && !win.open) {
      const dt = Math.min(100, now - lastTs);
      lastTs = now;
      acc += dt;
      let steps = 0;
      while (acc >= TICK_MS && steps < 8) {
        tick();
        acc -= TICK_MS;
        steps += 1;
        if (match.over || win.open) break;
      }
    } else {
      lastTs = now;
      applyIncoming(match.tick);
    }
    pub = buildPublic(nowMs);
    hooks.onPublic(pub);
    renderMatch(ctx, match);

    if (now - lastPull > 200) {
      lastPull = now;
      void pullCommands(meta.id, hostToken, lastSeq)
        .then((cmds) => {
          for (const c of cmds) {
            if (c.seq > lastSeq) {
              incoming.push(c);
              lastSeq = c.seq;
            }
          }
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : "";
          if (/invalid host|unauthorized|401/i.test(msg)) {
            stopped = true;
            hooks.onLog("Host lease lost — this tab is no longer in control.", "warn");
          }
        });
      if (pendingMarks.length) {
        const batch = pendingMarks.splice(0, pendingMarks.length);
        for (const m of batch) {
          void markApplied(meta.id, hostToken, m.seq, m.tick).catch(() => undefined);
        }
      }
    }
    if (now - lastPublish > 250 && pub) {
      lastPublish = now;
      void publishState(meta.id, hostToken, pub).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "";
        if (/invalid host|unauthorized|401/i.test(msg)) {
          stopped = true;
          hooks.onLog("Host lease lost — this tab is no longer in control.", "warn");
        }
      });
    }
  }
  requestAnimationFrame(frame);

  return {
    isHost: true,
    stop() {
      stopped = true;
    },
    getMatch: () => match,
    getPublic: () => pub,
  };
}

export function startSpectator(
  canvas: HTMLCanvasElement,
  id: string,
  hooks: {
    onPublic: (s: MatchPublicState) => void;
    onStatus: (text: string) => void;
    onLog?: (text: string, kind: string) => void;
    onBecameHost?: () => void;
  },
): { stop: () => void; isHost: boolean } {
  const ctx = require2d(canvas);
  resizeCanvas(canvas);
  let stopped = false;
  let last: MatchPublicState | null = null;
  let promoting = false;
  let hostHandle: HostHandle | null = null;

  function paint(s: MatchPublicState): void {
    renderSpectatorFrame(ctx, {
      tick: s.tick,
      timerSeconds: Math.ceil(s.timeLeftTicks / 60),
      p1: snapshotToInput(s.p1, 1),
      p2: snapshotToInput(s.p2, -1),
    });
  }

  async function poll(): Promise<void> {
    if (stopped || hostHandle) return;
    try {
      const r = await getState(id);
      if (!r.hostPresent && !promoting && !r.state?.over) {
        promoting = true;
        try {
          const v = await volunteerHost(id);
          saveHostToken(id, v.volunteerToken);
          hooks.onStatus("This tab volunteered as host — running the fight.");
          hooks.onLog?.("Volunteer host claimed. Autopilot is running in this tab.", "host");
          hostHandle = await startHost(
            canvas,
            { id, seed: v.seed, window: (v.window === "3s" || v.window === "5s" || v.window === "5s-wait" ? v.window : "off"), openSeat: v.openSeat ?? "none", p1: v.p1, p2: v.p2 },
            v.volunteerToken,
            {
              onPublic: hooks.onPublic,
              onLog: (text, kind) => hooks.onLog?.(text, kind),
            },
          );
          hooks.onBecameHost?.();
          hooks.onStatus("Live host (volunteer) · commanders can send plans now.");
          return;
        } catch (err) {
          promoting = false;
          const msg = err instanceof Error ? err.message : "";
          if (!/already active|409/i.test(msg)) {
            hooks.onStatus(msg || "could not volunteer as host");
          }
        }
      }
      if (r.state) {
        last = r.state;
        hooks.onPublic(r.state);
        paint(r.state);
        hooks.onStatus(
          r.hostPresent ? (r.state.over ? "Match over" : "Live — watching the host") : "Waiting for host…",
        );
      } else {
        hooks.onStatus(r.hostPresent ? "Host is starting…" : "Waiting for host to start the fight…");
      }
    } catch (err) {
      hooks.onStatus(err instanceof Error ? err.message : "lost connection");
    }
    if (!stopped) window.setTimeout(() => void poll(), 150);
  }
  void poll();

  function loop(): void {
    if (stopped) return;
    requestAnimationFrame(loop);
    if (last) paint(last);
  }
  requestAnimationFrame(loop);

  return {
    get isHost() {
      return !!hostHandle;
    },
    stop() {
      stopped = true;
      hostHandle?.stop();
    },
  };
}

function snapshotToInput(
  f: MatchPublicState["p1"],
  fallbackFacing: 1 | -1,
): {
  id: string; name: string; x: number; y: number; vx: number; vy: number;
  health: number; maxHealth: number; facing: 1 | -1; state: string;
  attacking: boolean; blocking: boolean; hit: boolean;
} {
  const facing: 1 | -1 = f.facing === 1 || f.facing === -1 ? f.facing : fallbackFacing;
  return {
    id: f.character,
    name: f.character,
    x: f.x,
    y: f.y,
    vx: f.vx,
    vy: f.vy,
    health: f.health,
    maxHealth: f.maxHealth,
    facing,
    state: f.state === "knockdown" ? "ko" : f.state,
    attacking: f.state === "attack",
    blocking: f.blocking || f.state === "block",
    hit: f.state === "hitstun",
  };
}

export type { Side, CommanderDirective };
