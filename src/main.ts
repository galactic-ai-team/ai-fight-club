import { createBot, type Bot } from "./bots/index.ts";
import {
  NEXT_MATCH_DELAY_MS,
  characterPairAt,
  pairingAt,
} from "./spectator/autoplay.ts";
import {
  GPT6_BOT_ID,
  LUMI_BOT_ID,
  WAITING_MESSAGE,
  applyDuelMatch,
  duelScoreLine,
  duelStatusLine,
  emptyDuelSet,
  gpt6IsReady,
  hudName,
  isDuelQuery,
  winnerToDuelFighter,
  type DuelSetState,
} from "./spectator/duel.ts";
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
const p1CharSel = document.querySelector<HTMLSelectElement>("#p1-char");
const p2CharSel = document.querySelector<HTMLSelectElement>("#p2-char");
const seedInput = document.querySelector<HTMLInputElement>("#seed")!;
const autoplayBox = document.querySelector<HTMLInputElement>("#autoplay");
const autoplayStatus = document.querySelector<HTMLDivElement>("#autoplay-status");
const tagline = document.querySelector<HTMLParagraphElement>("#tagline");
const duelBanner = document.querySelector<HTMLDivElement>("#duel-banner");
const duelScoreEl = document.querySelector<HTMLSpanElement>("#duel-score");
const duelStatusEl = document.querySelector<HTMLDivElement>("#duel-status");

const duelMode = isDuelQuery(window.location.search);
let duelSet: DuelSetState = emptyDuelSet();
let duelWaiting = duelMode && !gpt6IsReady();

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
let pairingIndex = 0;
let nextTimer: number | null = null;

function autoPlayEnabled(): boolean {
  return autoplayBox ? autoplayBox.checked : true;
}

function setAutoStatus(text: string): void {
  if (autoplayStatus) autoplayStatus.textContent = text;
}

function clearNextTimer(): void {
  if (nextTimer !== null) {
    window.clearTimeout(nextTimer);
    nextTimer = null;
  }
}

function applyPairing(p1Bot: string, p2Bot: string, p1Char: string, p2Char: string): void {
  p1Sel.value = p1Bot;
  p2Sel.value = p2Bot;
  if (p1CharSel) p1CharSel.value = p1Char;
  if (p2CharSel) p2CharSel.value = p2Char;
}

function selectedCharacter(sel: HTMLSelectElement | null, fallback: string): string {
  const value = sel?.value?.trim();
  return value ? value : fallback;
}

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

function refreshDuelHud(live = false): void {
  if (!duelMode) return;
  if (duelScoreEl) duelScoreEl.textContent = duelScoreLine(duelSet);
  if (duelStatusEl) {
    const waiting = duelWaiting || !gpt6IsReady();
    duelStatusEl.textContent = waiting
      ? WAITING_MESSAGE
      : duelStatusLine({ ready: true, set: duelSet, live });
    duelStatusEl.classList.toggle("waiting", waiting);
    duelStatusEl.classList.toggle("over", duelSet.over);
  }
}

function lockDuelControls(): void {
  if (!duelMode) return;
  document.body.classList.add("duel-mode");
  if (duelBanner) duelBanner.hidden = false;
  if (tagline) {
    tagline.textContent = gpt6IsReady()
      ? "Featured first-to-3 set. Lumi and GPT-6 each wrote their own fighter. Nothing is scripted."
      : "Featured first-to-3 set. Lumi is ready. GPT-6's fighter has not been dropped in yet.";
  }
  document.title = "AI Fight Club — Featured: Lumi vs GPT-6";
  applyPairing(LUMI_BOT_ID, GPT6_BOT_ID, "Ion", "Quark");
  p1Sel.disabled = true;
  p2Sel.disabled = true;
  p1Sel.closest("label")?.classList.add("duel-lock");
  p2Sel.closest("label")?.classList.add("duel-lock");
  if (autoplayBox) {
    autoplayBox.checked = false;
    autoplayBox.disabled = true;
  }
}

function showWaitingStage(): void {
  clearNextTimer();
  duelWaiting = true;
  const seed = Number(seedInput.value) || 1;
  applyPairing(LUMI_BOT_ID, GPT6_BOT_ID, "Ion", "Quark");
  match = createMatch({
    seed,
    p1Character: selectedCharacter(p1CharSel, "Ion"),
    p2Character: selectedCharacter(p2CharSel, "Quark"),
  });
  bots = null;
  replay = null;
  playing = false;
  p1Name.textContent = hudName("lumi", match.p1.character);
  p2Name.textContent = hudName("gpt6", match.p2.character);
  paintPortraits(match.p1.character, match.p2.character);
  resetLog();
  logLine(WAITING_MESSAGE, "start");
  momentEl.textContent = WAITING_MESSAGE;
  momentEl.classList.remove("danger");
  downloadBtn.disabled = true;
  pauseBtn.textContent = "Pause";
  refreshDuelHud(false);
  setAutoStatus(WAITING_MESSAGE);
}

function startMatch(): void {
  clearNextTimer();
  if (duelMode && !gpt6IsReady()) {
    showWaitingStage();
    return;
  }
  if (duelMode) {
    duelWaiting = false;
    applyPairing(
      LUMI_BOT_ID,
      GPT6_BOT_ID,
      selectedCharacter(p1CharSel, "Ion"),
      selectedCharacter(p2CharSel, "Quark"),
    );
  }
  const seed = Number(seedInput.value) || 1;
  const p1 = createBot(p1Sel.value);
  const p2 = createBot(p2Sel.value);
  const p1Character = selectedCharacter(p1CharSel, "Ion");
  const p2Character = selectedCharacter(p2CharSel, "Quark");
  match = createMatch({ seed, p1Character, p2Character });
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
  p1Name.textContent = duelMode ? hudName("lumi", match.p1.character) : `${match.p1.character} · ${p1.name}`;
  p2Name.textContent = duelMode ? hudName("gpt6", match.p2.character) : `${match.p2.character} · ${p2.name}`;
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
  if (duelMode) {
    refreshDuelHud(true);
    setAutoStatus(duelStatusLine({ ready: true, set: duelSet, live: true }));
  }
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
    if (duelMode && (match.matchWinner === "p1" || match.matchWinner === "p2")) {
      duelSet = applyDuelMatch(duelSet, winnerToDuelFighter(match.matchWinner, "p1"));
      refreshDuelHud(false);
      logLine(`Set score: Lumi ${duelSet.lumiWins} – ${duelSet.gpt6Wins} GPT-6`, "match_end");
    } else if (match.matchWinner === "p1" || match.matchWinner === "p2") {
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
    scheduleNextMatch();
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

function scheduleNextMatch(): void {
  clearNextTimer();
  if (duelMode) {
    if (!gpt6IsReady()) {
      showWaitingStage();
      return;
    }
    if (duelSet.over) {
      refreshDuelHud(false);
      setAutoStatus(duelStatusLine({ ready: true, set: duelSet }));
      return;
    }
    const secs = NEXT_MATCH_DELAY_MS / 1000;
    setAutoStatus(`Next set match in ${secs}s · Lumi ${duelScoreLine(duelSet)} GPT-6`);
    nextTimer = window.setTimeout(() => {
      seedInput.value = String((Number(seedInput.value) || 1) + 1);
      startMatch();
    }, NEXT_MATCH_DELAY_MS);
    return;
  }
  if (!autoPlayEnabled()) {
    setAutoStatus("Auto-play off. Pick two fighters and hit Fight to restart.");
    return;
  }
  pairingIndex += 1;
  const [p1Bot, p2Bot] = pairingAt(pairingIndex);
  const [p1Char, p2Char] = characterPairAt(pairingIndex);
  const secs = NEXT_MATCH_DELAY_MS / 1000;
  setAutoStatus(`Next up: ${p1Char} (${p1Bot}) vs ${p2Char} (${p2Bot}) in ${secs}s`);
  nextTimer = window.setTimeout(() => {
    seedInput.value = String((Number(seedInput.value) || 1) + 1);
    applyPairing(p1Bot, p2Bot, p1Char, p2Char);
    startMatch();
    setAutoStatus(`Live auto-play · ${p1Char} vs ${p2Char}`);
  }, NEXT_MATCH_DELAY_MS);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  clearNextTimer();
  if (duelMode && duelSet.over) {
    duelSet = emptyDuelSet();
    refreshDuelHud(false);
  }
  startMatch();
  setAutoStatus(
    autoPlayEnabled()
      ? `Live · ${selectedCharacter(p1CharSel, "Ion")} vs ${selectedCharacter(p2CharSel, "Quark")} (auto next on)`
      : `Live · ${selectedCharacter(p1CharSel, "Ion")} vs ${selectedCharacter(p2CharSel, "Quark")}`,
  );
});

pauseBtn.addEventListener("click", () => {
  if (!match || match.over || duelWaiting || !bots) return;
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

const leaderboard = bootLeaderboard();
const artBoard = mountSpectatorArtBoard(
  leaderboard ? { getTable: () => leaderboard.getTable() } : null,
);
document.getElementById("leaderboard-root")?.addEventListener("afc-leaderboard-change", () => {
  artBoard?.refresh();
});

autoplayBox?.addEventListener("change", () => {
  if (autoPlayEnabled()) {
    if (match?.over || !playing) scheduleNextMatch();
    else setAutoStatus("Auto-play on. Next pairing starts after this match.");
  } else {
    clearNextTimer();
    setAutoStatus("Auto-play off. Pick two fighters and hit Fight to restart.");
  }
});

// Auto-start a live bot-vs-bot match on load, then cycle a round-robin.
// Featured mode (`?duel=lumi-gpt6`) plays a first-to-3 set instead, or waits
// for GPT-6's fighter if the placeholder is still in the slot.
if (duelMode) {
  lockDuelControls();
  if (gpt6IsReady()) {
    startMatch();
  } else {
    showWaitingStage();
  }
} else {
  const [p1Bot, p2Bot] = pairingAt(0);
  const [p1Char, p2Char] = characterPairAt(0);
  applyPairing(p1Bot, p2Bot, p1Char, p2Char);
  startMatch();
  setAutoStatus(`Live auto-play · ${p1Char} vs ${p2Char}`);
}
requestAnimationFrame(frame);
