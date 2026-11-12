import { createBot, type Bot } from "./bots/index.ts";
import {
  commentOnEvents,
  matchStartLine,
  type CommentaryContext,
} from "./commentary/index.ts";
import { momentLine, roundIntroLine, type OverlayInput } from "./commentary/overlay.ts";
import "./spectator/spectator.css";
import { drawPortraitToCanvas } from "./spectator/pixelArt.ts";
import { mountSpectatorArtBoard } from "./spectator/mountBoard.ts";
import {
  TICK_MS,
  appendInput,
  createMatch,
  emptyReplay,
  observe,
  serializeReplay,
  stepMatch,
  type MatchState,
  type Replay,
} from "./engine/index.ts";
import { renderMatch, resizeCanvas } from "./render/canvas.ts";
import { bootLeaderboard } from "./ui/leaderboard.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
const momentEl = document.querySelector<HTMLDivElement>("#moment")!;
const logEl = document.querySelector<HTMLDivElement>("#log")!;
const clockEl = document.querySelector<HTMLDivElement>("#clock")!;
const p1Name = document.querySelector<HTMLDivElement>("#p1-name")!;
const p2Name = document.querySelector<HTMLDivElement>("#p2-name")!;
const p1Health = document.querySelector<HTMLSpanElement>("#p1-health span")!;
const p2Health = document.querySelector<HTMLSpanElement>("#p2-health span")!;
const p1Meter = document.querySelector<HTMLSpanElement>("#p1-meter span")!;
const p2Meter = document.querySelector<HTMLSpanElement>("#p2-meter span")!;
const roundsEl = document.querySelector<HTMLDivElement>("#rounds")!;
const pauseBtn = document.querySelector<HTMLButtonElement>("#pause")!;
const downloadBtn = document.querySelector<HTMLButtonElement>("#download")!;
const form = document.querySelector<HTMLFormElement>("#controls")!;
const p1Sel = document.querySelector<HTMLSelectElement>("#p1-bot")!;
const p2Sel = document.querySelector<HTMLSelectElement>("#p2-bot")!;
const seedInput = document.querySelector<HTMLInputElement>("#seed")!;

const ctx = canvas.getContext("2d")!;
resizeCanvas(canvas);
window.addEventListener("resize", () => {
  resizeCanvas(canvas);
  if (match) renderMatch(ctx, match);
});

let match: MatchState | null = null;
let bots: { p1: Bot; p2: Bot } | null = null;
let replay: Replay | null = null;
let playing = false;
let acc = 0;
let last = 0;

function resetLog(): void {
  logEl.innerHTML = "";
}

/** Public match state the commentary / overlay read. No hidden randomness. */
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

function overlayInput(state: MatchState): OverlayInput {
  return {
    phase: state.phase,
    round: state.round.number,
    p1Name: state.p1.character,
    p2Name: state.p2.character,
    p1HealthFrac: state.p1.health / state.p1.maxHealth,
    p2HealthFrac: state.p2.health / state.p2.maxHealth,
    p1Wins: state.p1Wins,
    p2Wins: state.p2Wins,
  };
}

/**
 * Overlay callout over the stage (text only — the canvas banner in
 * src/render/canvas.ts still owns round / match results). Shows the round
 * intro for the first 90 ticks of a round, a low-health callout mid-fight,
 * and nothing during round_end / match_end.
 */
function updateMoment(): void {
  if (!match) return;
  const input = overlayInput(match);
  const moment = momentLine(input);
  if (moment) {
    momentEl.textContent = moment.text;
    momentEl.classList.toggle("danger", moment.tone === "danger");
    return;
  }
  if (match.phase === "fight" && match.round.tick <= 90) {
    momentEl.textContent = roundIntroLine(input);
    momentEl.classList.remove("danger");
    return;
  }
  momentEl.textContent = "";
}

function logLine(text: string, kind: string): void {
  const line = document.createElement("div");
  line.className = `line ${kind}`;
  line.textContent = text;
  logEl.prepend(line);
}

function paintPortraits(p1Character: string, p2Character: string): void {
  const p1 = document.querySelector<HTMLCanvasElement>("#p1-portrait");
  const p2 = document.querySelector<HTMLCanvasElement>("#p2-portrait");
  if (p1) drawPortraitToCanvas(p1, p1Character, 3);
  if (p2) drawPortraitToCanvas(p2, p2Character, 3);
}

function fillBar(el: HTMLSpanElement, value: number, max: number, flip = false): void {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  el.style.width = `${pct}%`;
  if (flip) el.style.marginLeft = "auto";
  const hue = value / max > 0.3 ? undefined : "#ff5d73";
  if (el.parentElement?.classList.contains("health")) {
    el.style.background = value / max > 0.3 ? "#5dffb0" : (hue ?? "#ff5d73");
  }
}

function renderHud(state: MatchState): void {
  const seconds = Math.ceil(state.round.timeLeftTicks / 60);
  clockEl.textContent = String(Math.max(0, seconds)).padStart(2, "0");
  fillBar(p1Health, state.p1.health, state.p1.maxHealth);
  fillBar(p2Health, state.p2.health, state.p2.maxHealth, true);
  fillBar(p1Meter, state.p1.meter, state.p1.maxMeter);
  fillBar(p2Meter, state.p2.meter, state.p2.maxMeter, true);
  const p1dots = `<span class="dot p1${state.p1Wins >= 1 ? " on" : ""}" data-n="1">●</span> <span class="dot p1${state.p1Wins >= 2 ? " on" : ""}" data-n="2">●</span>`;
  const p2dots = `<span class="dot p2${state.p2Wins >= 1 ? " on" : ""}" data-n="1">●</span> <span class="dot p2${state.p2Wins >= 2 ? " on" : ""}" data-n="2">●</span>`;
  roundsEl.innerHTML = `${p1dots}&nbsp;R${state.round.number}&nbsp;${p2dots}`;
}

function startMatch(): void {
  const seed = Number(seedInput.value) || 1;
  const p1 = createBot(p1Sel.value);
  const p2 = createBot(p2Sel.value);
  match = createMatch({ seed });
  bots = { p1, p2 };
  replay = emptyReplay({
    seed,
    p1BotId: p1.id,
    p2BotId: p2.id,
    p1Character: match.p1.character,
    p2Character: match.p2.character,
  });
  p1.start?.({ side: "p1", seed, opponentId: p2.id });
  p2.start?.({ side: "p2", seed, opponentId: p1.id });
  p1Name.textContent = `${match.p1.character} · ${p1.name}`;
  p2Name.textContent = `${match.p2.character} · ${p2.name}`;
  paintPortraits(match.p1.character, match.p2.character);
  resetLog();
  logLine(
    matchStartLine(
      { p1: match.p1.character, p2: match.p2.character },
      { seed, p1Bot: p1.name, p2Bot: p2.name },
    ),
    "start",
  );
  updateMoment();
  playing = true;
  acc = 0;
  last = performance.now();
  downloadBtn.disabled = true;
  pauseBtn.textContent = "Pause";
}

function tick(): void {
  if (!match || !bots || !replay || match.over) return;
  const a1 = bots.p1.act(observe(match, "p1"));
  const a2 = bots.p2.act(observe(match, "p2"));
  appendInput(replay, a1, a2);
  stepMatch(match, a1, a2);
  const names = { p1: match.p1.character, p2: match.p2.character };
  for (const line of commentOnEvents(match.lastEvents, names, commentaryContext(match))) {
    logLine(line.text, line.kind);
  }
  updateMoment();
  if (match.over && replay) {
    replay.result = {
      winner: match.matchWinner,
      p1Wins: match.p1Wins,
      p2Wins: match.p2Wins,
      ticks: match.tick,
    };
    playing = false;
    downloadBtn.disabled = false;
    logLine(`Match over in ${match.tick} ticks.`, "match_end");
    if (match.matchWinner === "p1" || match.matchWinner === "p2") {
      leaderboard?.recordMatch({
        seed: replay.seed,
        p1: bots.p1.id,
        p2: bots.p2.id,
        winner: match.matchWinner,
        p1Wins: match.p1Wins,
        p2Wins: match.p2Wins,
      });
      artBoard?.refresh();
    }
  }
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  if (!match) return;
  if (playing) {
    const dt = Math.min(100, now - last);
    last = now;
    acc += dt;
    let steps = 0;
    while (acc >= TICK_MS && steps < 8) {
      tick();
      acc -= TICK_MS;
      steps += 1;
      if (match?.over) break;
    }
  } else {
    last = now;
  }
  renderHud(match);
  renderMatch(ctx, match);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  startMatch();
});

pauseBtn.addEventListener("click", () => {
  if (!match || match.over) return;
  playing = !playing;
  pauseBtn.textContent = playing ? "Pause" : "Resume";
  last = performance.now();
});

downloadBtn.addEventListener("click", () => {
  if (!replay) return;
  const blob = new Blob([serializeReplay(replay)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `afc-replay-${replay.seed}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Show a still of the opening positions before the first fight.
match = createMatch({ seed: Number(seedInput.value) || 1 });
paintPortraits(match.p1.character, match.p2.character);
renderHud(match);
renderMatch(ctx, match);
const leaderboard = bootLeaderboard();
const artBoard = mountSpectatorArtBoard(
  leaderboard ? { getTable: () => leaderboard.getTable() } : null,
);
requestAnimationFrame(frame);
