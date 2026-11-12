/**
 * Replay review (AI Eyes, Project 7, Layer 3 — Nova lane).
 *
 * After a match, each side gets a strip of its own-POV frames: one every
 * N ticks, plus every hit, knockout, command, round end, and match end.
 * The AI reads the strip through `suggestReviewPrompt` — a plain-text
 * description of what it *saw* (visibility only, never a dumped stat
 * sheet) — and writes what it learned back with `applyReview`.
 *
 * Deterministic throughout: the strip is built by re-simulating the
 * recorded inputs (same seed + inputs => same strip), with no wall
 * clock, no randomness, and no secrets anywhere in the output.
 *
 * Notes format: Dee owns `src/eyes/notes.ts` (parseNotes / mergeNotes)
 * on the sandbox lane. It is not on this branch yet, so `applyReview`
 * delegates to the minimal id-keyed merge in `mergeReviewNotes` below.
 * TODO(Dee): when notes.ts lands, replace `mergeReviewNotes` with a
 * thin call to `parseNotes` / `mergeNotes`, keeping the same
 * (notes, update) shape and the same id-keyed merge semantics — new
 * facts replace same-id facts, older facts with different ids are kept.
 */

import { createMatch, stepMatch } from "../engine/sim.ts";
import { NEUTRAL_ACTION, type MatchEvent, type MatchState, type Replay, type Side } from "../engine/types.ts";
import { describePov, encodePovPng, renderPov, type PovVisibility } from "./pov.ts";

export type ReviewReason = "interval" | "hit" | "ko" | "command" | "round_end" | "match_end";

export interface ReviewFrame {
  tick: number;
  side: Side;
  reason: ReviewReason;
  visibility: PovVisibility;
  /** Optional PNG bytes or a data URL, generated on demand so tests can skip encoding. */
  png?: Uint8Array;
}

export interface ReviewStrip {
  side: Side;
  seed: number;
  frames: ReviewFrame[];
  result: { winner: "p1" | "p2" | null; p1Wins: number; p2Wins: number; ticks: number };
}

export interface ReviewFact {
  id: string;
  text: string;
  evidenceTick: number;
}

export interface ReviewNotesUpdate {
  side: Side;
  facts: ReviewFact[];
}

export interface ReviewNotesDoc {
  version: number;
  side: Side;
  facts: ReviewFact[];
}

export type ReviewCommandTick = number | { tick: number; side?: Side };

export interface ReviewOptions {
  /** Interval between sampled frames, in ticks. Default 30 (0.5s at 60Hz). */
  everyTicks?: number;
  /** Attach encoded PNG bytes to each frame. Default false (strips stay light). */
  includePng?: boolean;
  /** Ticks at which a commander command was applied. A frame is added with reason "command". */
  commandTicks?: ReviewCommandTick[];
  /** POV render size for PNG frames. Defaults to the prototype 160x120. */
  width?: number;
  height?: number;
}

export type ReviewSource = Replay | MatchState | MatchState[];

const REASON_PRIORITY: Record<ReviewReason, number> = {
  interval: 0,
  command: 1,
  hit: 2,
  ko: 3,
  round_end: 4,
  match_end: 5,
};

function isReplay(value: ReviewSource): value is Replay {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Array.isArray((value as Replay).inputs) &&
    typeof (value as Replay).seed === "number"
  );
}

function normalizeCommandTicks(
  raw: ReviewCommandTick[] | undefined,
  side: Side,
): Set<number> {
  const out = new Set<number>();
  if (!raw) return out;
  for (const entry of raw) {
    if (typeof entry === "number") {
      if (Number.isSafeInteger(entry) && entry >= 0) out.add(entry);
      continue;
    }
    if (typeof entry === "object" && entry !== null && Number.isSafeInteger(entry.tick) && entry.tick >= 0) {
      // A command for the other side is not this side's moment to review.
      if (entry.side === undefined || entry.side === side) out.add(entry.tick);
    }
  }
  return out;
}

interface TickRecord {
  tick: number;
  visibility: PovVisibility;
  events: MatchEvent[];
  phase: MatchState["phase"];
}

function reasonFor(rec: TickRecord, everyTicks: number, commandTicks: Set<number>, isFinal: boolean): ReviewReason | null {
  let reason: ReviewReason | null = null;
  const take = (candidate: ReviewReason): void => {
    if (reason === null || REASON_PRIORITY[candidate] > REASON_PRIORITY[reason]) reason = candidate;
  };
  if (rec.tick % everyTicks === 0 || isFinal) take("interval");
  if (commandTicks.has(rec.tick)) take("command");
  for (const ev of rec.events) {
    if (ev.type === "hit") take("hit");
    else if (ev.type === "ko") take("ko");
    else if (ev.type === "round_end") take("round_end");
    else if (ev.type === "match_end") take("match_end");
  }
  return reason;
}

/** Re-simulate a replay, calling `onTick` at tick 0 and after every step. */
function simulateReplay(replay: Replay, onTick: (state: MatchState) => void): MatchState {
  const state = createMatch({
    seed: replay.seed,
    p1Character: replay.p1.character,
    p2Character: replay.p2.character,
  });
  onTick(state);
  for (const pair of replay.inputs) {
    const a = pair[0] ?? NEUTRAL_ACTION;
    const b = pair[1] ?? NEUTRAL_ACTION;
    stepMatch(state, a, b);
    onTick(state);
    if (state.over) break;
  }
  return state;
}

function collectRecords(source: ReviewSource, side: Side): { records: TickRecord[]; final: MatchState } {
  if (isReplay(source)) {
    const records: TickRecord[] = [];
    const final = simulateReplay(source, (state) => {
      records.push({
        tick: state.tick,
        visibility: describePov(state, side),
        events: state.lastEvents.slice(),
        phase: state.phase,
      });
    });
    return { records, final };
  }
  const snapshots = Array.isArray(source) ? source : [source];
  if (snapshots.length === 0) {
    throw new Error("buildReviewStrip: need at least one match snapshot");
  }
  const records = snapshots.map((state) => ({
    tick: state.tick,
    visibility: describePov(state, side),
    events: state.lastEvents.slice(),
    phase: state.phase,
  }));
  return { records, final: snapshots[snapshots.length - 1]! };
}

/**
 * Build a deterministic own-POV review strip.
 *
 * From a Replay: re-simulates the recorded inputs and samples the
 * reviewed side's view. From a MatchState (or an array of per-tick
 * snapshots, e.g. captured live by the host): samples those snapshots
 * directly. Always includes interval frames plus every hit, knockout,
 * command tick (when provided), round end, and match end. One frame
 * per tick at most — when several events land on the same tick, the
 * highest-priority reason wins (match_end > round_end > ko > hit >
 * command > interval).
 */
export function buildReviewStrip(
  source: ReviewSource,
  side: Side,
  opts: ReviewOptions = {},
): ReviewStrip {
  const everyTicks = opts.everyTicks ?? 30;
  if (!Number.isSafeInteger(everyTicks) || everyTicks <= 0) {
    throw new Error("buildReviewStrip: everyTicks must be a positive integer");
  }
  const commandTicks = normalizeCommandTicks(opts.commandTicks, side);
  const { records, final } = collectRecords(source, side);
  const finalTick = records[records.length - 1]!.tick;

  const reasons = new Map<number, ReviewReason>();
  for (const rec of records) {
    const reason = reasonFor(rec, everyTicks, commandTicks, rec.tick === finalTick);
    if (reason) reasons.set(rec.tick, reason);
  }

  // PNGs need the pixels at the selected ticks. Re-simulating a replay is
  // deterministic, so a second pass reproduces the exact same states;
  // snapshot sources already hold the states to render from.
  const pngByTick = new Map<number, Uint8Array>();
  if (opts.includePng) {
    const selected = new Set(reasons.keys());
    if (isReplay(source)) {
      simulateReplay(source, (state) => {
        if (selected.has(state.tick)) {
          pngByTick.set(state.tick, encodePovPng(renderPov(state, side, { width: opts.width, height: opts.height })));
        }
      });
    } else {
      const snapshots = Array.isArray(source) ? source : [source];
      for (const state of snapshots) {
        if (selected.has(state.tick)) {
          pngByTick.set(state.tick, encodePovPng(renderPov(state, side, { width: opts.width, height: opts.height })));
        }
      }
    }
  }

  const frames: ReviewFrame[] = records
    .filter((rec) => reasons.has(rec.tick))
    .map((rec) => {
      const frame: ReviewFrame = {
        tick: rec.tick,
        side,
        reason: reasons.get(rec.tick)!,
        visibility: rec.visibility,
      };
      const png = pngByTick.get(rec.tick);
      if (png) frame.png = png;
      return frame;
    });

  return {
    side,
    seed: final.seed,
    frames,
    result: {
      winner: final.matchWinner,
      p1Wins: final.p1Wins,
      p2Wins: final.p2Wins,
      ticks: final.tick,
    },
  };
}

const ATTACK_WORDS: Record<string, string> = {
  light: "quick jab",
  heavy: "heavy swing",
  special: "burst",
};

const STATE_WORDS: Record<string, string> = {
  idle: "standing",
  walk: "closing in",
  crouch: "crouched low",
  jump: "in the air",
  attack: "mid-swing",
  block: "guarding",
  hitstun: "staggered",
  knockdown: "down on the floor",
};

const REASON_WORDS: Record<ReviewReason, string> = {
  interval: "look",
  hit: "hit landed",
  ko: "knockout",
  command: "new plan",
  round_end: "round over",
  match_end: "match over",
};

function describeFrame(frame: ReviewFrame): string {
  const vis = frame.visibility;
  const parts: string[] = [`Tick ${frame.tick} (${REASON_WORDS[frame.reason]}):`];
  if (vis.behindThreat) {
    parts.push("opponent behind you — rear-threat cue only, nothing in front of you.");
  } else {
    parts.push(
      `opponent in front, about ${Math.max(0, Math.round(vis.forwardDistance))} steps away, ${STATE_WORDS[vis.opponentState] ?? vis.opponentState}.`,
    );
  }
  if (vis.opponentAirborne && !vis.behindThreat) {
    parts.push("They are off the floor.");
  }
  if (vis.incomingAttack && vis.incomingPhase) {
    parts.push(`Incoming ${ATTACK_WORDS[vis.incomingAttack] ?? vis.incomingAttack} in ${vis.incomingPhase}.`);
  }
  if (vis.wallAhead > 0) {
    parts.push("A wall is close ahead of you.");
  }
  return parts.join(" ");
}

/**
 * A plain-text prompt an AI can read, describing the own-POV sequence.
 * Built from visibility only — no stat sheet, no numbers about the
 * fighters, no secrets, and only original wording (no borrowed move
 * names). Behind-threat and incoming-attack moments are called out
 * explicitly so the reviewer can see what its eyes actually caught.
 */
export function suggestReviewPrompt(strip: ReviewStrip): string {
  const behind = strip.frames.filter((f) => f.visibility.behindThreat).length;
  const incoming = strip.frames.filter((f) => f.visibility.incomingAttack !== null).length;
  const hits = strip.frames.filter((f) => f.reason === "hit").length;
  const winnerText =
    strip.result.winner === null
      ? "no winner yet"
      : `${strip.result.winner.toUpperCase()} takes it ${strip.result.p1Wins}-${strip.result.p2Wins}`;
  const lines: string[] = [
    `Review your own view — you are ${strip.side.toUpperCase()}.`,
    `Seed ${strip.seed}. Result: ${winnerText} after ${strip.result.ticks} ticks.`,
    `This strip holds ${strip.frames.length} first-person frames: one every half-second, plus every hit, knockout, new plan, round end, and match end.`,
  ];
  if (behind > 0) lines.push(`${behind} frame${behind === 1 ? "" : "s"} show the opponent behind you — rear-threat cue only.`);
  if (incoming > 0) lines.push(`${incoming} frame${incoming === 1 ? "" : "s"} show an attack incoming toward you.`);
  if (hits > 0) lines.push(`${hits} frame${hits === 1 ? "" : "s"} mark a hit landing.`);
  lines.push("", "Moments, in order:");

  const key = strip.frames.filter(
    (f) => f.reason !== "interval" || f.visibility.behindThreat || f.visibility.incomingAttack !== null,
  );
  const shown = key.slice(0, 40);
  for (const frame of shown) lines.push(`- ${describeFrame(frame)}`);
  if (key.length > shown.length) {
    lines.push(`- ... and ${key.length - shown.length} more moments like these.`);
  }
  if (shown.length === 0) {
    lines.push("- No hits, no attacks incoming, and nothing behind you in this strip — a quiet stretch.");
  }
  lines.push(
    "",
    "What did you see just before each hit you took? What would you change next time — spacing, stance, or timing?",
    "Answer with at most 3 short notes, each tied to a tick above.",
  );
  return lines.join("\n");
}

function isFactLike(value: unknown): value is ReviewFact {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ReviewFact).id === "string" &&
    typeof (value as ReviewFact).text === "string" &&
    typeof (value as ReviewFact).evidenceTick === "number"
  );
}

function normalizeFacts(facts: unknown): ReviewFact[] {
  if (!Array.isArray(facts)) return [];
  const byId = new Map<string, ReviewFact>();
  const order: string[] = [];
  for (const raw of facts) {
    if (!isFactLike(raw)) continue;
    const id = raw.id.trim();
    const text = raw.text.trim();
    if (!id || !text) continue;
    const fact: ReviewFact = {
      id,
      text,
      evidenceTick: Number.isFinite(raw.evidenceTick) ? Math.trunc(raw.evidenceTick) : 0,
    };
    if (!byId.has(id)) order.push(id);
    byId.set(id, fact); // Last write wins for a repeated id.
  }
  return order.map((id) => byId.get(id)!);
}

function readOldFacts(notes: unknown): ReviewFact[] {
  if (Array.isArray(notes)) return normalizeFacts(notes);
  if (typeof notes === "object" && notes !== null && "facts" in notes) {
    return normalizeFacts((notes as { facts: unknown }).facts);
  }
  return [];
}

function readVersion(notes: unknown): number {
  if (
    typeof notes === "object" &&
    notes !== null &&
    typeof (notes as { version: unknown }).version === "number" &&
    Number.isFinite((notes as { version: number }).version)
  ) {
    return (notes as { version: number }).version;
  }
  return 1;
}

/**
 * Minimal id-keyed merge for review notes — the documented stand-in
 * until Dee's `src/eyes/notes.ts` (parseNotes / mergeNotes) lands.
 * New facts replace same-id facts in place; older facts with different
 * ids are always kept; brand-new facts append in update order.
 * Deterministic and idempotent: applying the same update twice changes
 * nothing the second time.
 */
export function mergeReviewNotes(notes: unknown, update: ReviewNotesUpdate): ReviewNotesDoc {
  const incoming = normalizeFacts(update.facts);
  const old = readOldFacts(notes);
  const merged = new Map<string, ReviewFact>();
  const order: string[] = [];
  for (const fact of old) {
    merged.set(fact.id, fact);
    order.push(fact.id);
  }
  for (const fact of incoming) {
    if (!merged.has(fact.id)) order.push(fact.id);
    merged.set(fact.id, fact);
  }
  const facts = order.map((id) => merged.get(id)!);
  const base =
    typeof notes === "object" && notes !== null && !Array.isArray(notes)
      ? (notes as Record<string, unknown>)
      : {};
  return { ...base, version: readVersion(notes), side: update.side, facts } as ReviewNotesDoc;
}

/**
 * Apply a review update to a notes document. Uses Dee's parseNotes /
 * mergeNotes when `src/eyes/notes.ts` exists; until then, the minimal
 * merge in `mergeReviewNotes` (see the TODO at the top of this file).
 * Accepts a notes object, a facts array, a JSON string, or null.
 */
export function applyReview(notes: unknown, update: ReviewNotesUpdate): unknown {
  let parsed: unknown = notes;
  if (typeof notes === "string") {
    try {
      parsed = JSON.parse(notes) as unknown;
    } catch {
      parsed = null;
    }
  }
  return mergeReviewNotes(parsed, update);
}
