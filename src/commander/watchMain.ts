import { drawPortraitToCanvas } from "../spectator/pixelArt.ts";
import { resizeCanvas } from "../render/canvas.ts";
import { parsePipMode, pipLabel, renderPipFramesFromPublic, type PipMode } from "../eyes/pip.ts";
import { applyPipMode, paintPovFrame, setPipLabel } from "../eyes/pipDom.ts";
import {
  createMatch,
  hostTokenKey,
  listMatches,
  loadHostToken,
  saveHostToken,
} from "./client.ts";
import { directiveToCompact } from "./parse.ts";
import { startHost, startSpectator } from "./live.ts";
import type { FighterSnapshot, MatchPublicState, OpenSeat, PublicMatchListItem } from "./types.ts";

const lobby = document.querySelector<HTMLElement>("#lobby")!;
const arena = document.querySelector<HTMLElement>("#arena")!;
const listEl = document.querySelector<HTMLUListElement>("#match-list")!;
const createForm = document.querySelector<HTMLFormElement>("#create-form")!;
const secretsEl = document.querySelector<HTMLDivElement>("#create-secrets")!;
const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
const statusEl = document.querySelector<HTMLDivElement>("#arena-status")!;
const logEl = document.querySelector<HTMLDivElement>("#log")!;
const overlay = document.querySelector<HTMLDivElement>("#window-overlay")!;
const overlayCount = document.querySelector<HTMLDivElement>("#window-count")!;
const overlaySubs = document.querySelector<HTMLDivElement>("#window-subs")!;
const watchUrlInput = document.querySelector<HTMLInputElement>("#watch-url")!;
const copyBtn = document.querySelector<HTMLButtonElement>("#copy-watch")!;

// AI Eyes PiP ("what the fighters see"). Painted from the public match
// snapshot only — never from join codes or host tokens, which the watch
// page does not receive. Re-rendered only when the tick or mode changes:
// the host calls renderPublic every animation frame.
const eyesPip = document.querySelector<HTMLElement>("#eyes-pip");
let pipMode: PipMode = "both";
let lastPipTick = -1;
let lastPipMode: PipMode | null = null;
let lastPublic: MatchPublicState | null = null;

function updateEyesPip(s: MatchPublicState): void {
  if (!eyesPip) return;
  if (s.tick === lastPipTick && pipMode === lastPipMode) return;
  lastPipTick = s.tick;
  lastPipMode = pipMode;
  applyPipMode(eyesPip, pipMode);
  if (pipMode === "off") return;
  for (const frame of renderPipFramesFromPublic(s, pipMode)) {
    const canvas = document.querySelector<HTMLCanvasElement>(`#eyes-${frame.side}`);
    if (canvas) paintPovFrame(canvas, frame);
    const name = frame.side === "p1" ? s.p1.character : s.p2.character;
    setPipLabel(eyesPip, frame.side, pipLabel(frame.side, name));
  }
}

if (eyesPip) {
  applyPipMode(eyesPip, pipMode);
  for (const btn of Array.from(eyesPip.querySelectorAll<HTMLButtonElement>("[data-pip-mode]"))) {
    btn.addEventListener("click", () => {
      pipMode = parsePipMode(btn.getAttribute("data-pip-mode"));
      if (lastPublic) updateEyesPip(lastPublic);
      else applyPipMode(eyesPip, pipMode);
    });
  }
}

let currentOpenSeat: OpenSeat = "none";

function seatOpen(side: "p1" | "p2"): boolean {
  return currentOpenSeat === "both" || currentOpenSeat === side;
}

function setOpenSeatBadge(side: "p1" | "p2", on: boolean): void {
  document.getElementById(`${side}-open`)?.classList.toggle("hidden", !on);
}

function fillBar(el: HTMLSpanElement | null, value: number, max: number): void {
  if (!el) return;
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  el.style.width = `${pct}%`;
  if (el.parentElement?.classList.contains("health")) {
    el.style.background = value / max > 0.3 ? "#5dffb0" : "#ff5d73";
  }
}

function latClass(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 500) return "ok";
  if (ms < 2000) return "slow";
  return "late";
}

function latText(ms: number | null): string {
  if (ms === null) return "no command yet";
  if (ms <= 0) return "latency <1ms";
  return `latency ${(ms / 1000).toFixed(2)}s`;
}

function paintPortraits(p1: string, p2: string): void {
  const a = document.querySelector<HTMLCanvasElement>("#p1-portrait");
  const b = document.querySelector<HTMLCanvasElement>("#p2-portrait");
  if (a) drawPortraitToCanvas(a, p1, 3);
  if (b) drawPortraitToCanvas(b, p2, 3);
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function renderCard(side: "p1" | "p2", f: FighterSnapshot): void {
  const open = seatOpen(side) ? " · OPEN SEAT" : "";
  setText(`card-${side}-who`, `${side.toUpperCase()} · ${f.controller} in control${open}`);
  const plan = f.command ? directiveToCompact(f.command) : "default autopilot";
  setText(`card-${side}-plan`, plan);
  const meta = document.getElementById(`card-${side}-meta`);
  if (meta) {
    meta.innerHTML = `<span class="lat ${latClass(f.latencyMs)}">${latText(f.latencyMs)}</span>`;
  }
}

function renderPublic(s: MatchPublicState): void {
  lastPublic = s;
  if (s.openSeat) currentOpenSeat = s.openSeat;
  setText("p1-name", s.p1.character);
  setText("p2-name", s.p2.character);
  setOpenSeatBadge("p1", seatOpen("p1"));
  setOpenSeatBadge("p2", seatOpen("p2"));
  setText("p1-ctrl", `${s.p1.controller} in control`);
  setText("p2-ctrl", `${s.p2.controller} in control`);
  const seconds = Math.ceil(s.timeLeftTicks / 60);
  setText("clock", String(Math.max(0, seconds)).padStart(2, "0"));
  fillBar(document.querySelector("#p1-health span"), s.p1.health, s.p1.maxHealth);
  fillBar(document.querySelector("#p2-health span"), s.p2.health, s.p2.maxHealth);
  fillBar(document.querySelector("#p1-meter span"), s.p1.meter, s.p1.maxMeter);
  fillBar(document.querySelector("#p2-meter span"), s.p2.meter, s.p2.maxMeter);
  const p1dots = `<span class="dot p1${s.p1Wins >= 1 ? " on" : ""}">●</span> <span class="dot p1${s.p1Wins >= 2 ? " on" : ""}">●</span>`;
  const p2dots = `<span class="dot p2${s.p2Wins >= 1 ? " on" : ""}">●</span> <span class="dot p2${s.p2Wins >= 2 ? " on" : ""}">●</span>`;
  const rounds = document.getElementById("rounds");
  if (rounds) rounds.innerHTML = `${p1dots}&nbsp;R${s.round}&nbsp;${p2dots}`;

  setText("taunt-p1", s.p1.taunt);
  setText("taunt-p2", s.p2.taunt);
  renderCard("p1", s.p1);
  renderCard("p2", s.p2);

  const overlayLabel = document.getElementById("window-label");
  if (s.waitingForCoaches) {
    overlay.classList.add("open");
    overlayCount.textContent = ((s.readyRemainingMs ?? 0) / 1000).toFixed(0);
    if (overlayLabel) overlayLabel.textContent = "Waiting for both coaches";
    const s1 = s.coachesReady?.p1 ? `<span class="yes">${s.p1.controller} ✓</span>` : s.p1.controller;
    const s2 = s.coachesReady?.p2 ? `<span class="yes">${s.p2.controller} ✓</span>` : s.p2.controller;
    overlaySubs.innerHTML = `${s1} &nbsp;·&nbsp; ${s2}`;
  } else if (s.window.open) {
    overlay.classList.add("open");
    overlayCount.textContent = (s.window.remainingMs / 1000).toFixed(1);
    if (overlayLabel) overlayLabel.textContent = "Decision window — send a command";
    const s1 = s.window.p1Submitted ? `<span class="yes">${s.p1.controller} ✓</span>` : s.p1.controller;
    const s2 = s.window.p2Submitted ? `<span class="yes">${s.p2.controller} ✓</span>` : s.p2.controller;
    overlaySubs.innerHTML = `${s1} &nbsp;·&nbsp; ${s2}`;
  } else {
    overlay.classList.remove("open");
  }
  updateEyesPip(s);
}

function logLine(text: string, kind: string): void {
  const line = document.createElement("div");
  line.className = `line ${kind}`;
  line.textContent = text;
  logEl.prepend(line);
}

function watchUrlFor(id: string): string {
  const u = new URL(location.href);
  u.pathname = u.pathname.replace(/relay\.html$/, "watch.html");
  if (!u.pathname.endsWith("watch.html")) {
    // lobby may already be watch.html
    if (!/watch\.html$/.test(u.pathname)) u.pathname = u.pathname.replace(/\/?$/, "/watch.html");
  }
  u.search = `?m=${encodeURIComponent(id)}`;
  u.hash = "";
  return u.toString();
}

function renderList(items: PublicMatchListItem[]): void {
  if (!items.length) {
    listEl.innerHTML = `<li class="empty">No live rooms yet. Start one below.</li>`;
    return;
  }
  listEl.innerHTML = items
    .map((m) => {
      const st = m.status === "live" ? "Live" : m.status === "waiting" ? "Waiting" : m.status;
      return `<li>
        <div>
          <div class="vs">${m.p1.character} (${m.p1.controller}) vs ${m.p2.character} (${m.p2.controller})</div>
          <div class="sub">${st} · ${m.score} · window ${m.windowMode}${m.openSeat && m.openSeat !== "none" ? ` · OPEN SEAT ${m.openSeat.toUpperCase()}` : ""} · tick ${m.tick}</div>
        </div>
        <a class="watch" href="${m.watchPath}">Watch</a>
      </li>`;
    })
    .join("");
}

async function refreshList(): Promise<void> {
  try {
    renderList(await listMatches());
  } catch (err) {
    listEl.innerHTML = `<li class="empty">${err instanceof Error ? err.message : "could not list matches"}</li>`;
  }
}

createForm.addEventListener("submit", (e) => {
  e.preventDefault();
  void (async () => {
    const body = {
      p1Controller: (document.getElementById("c-p1-name") as HTMLInputElement).value.trim() || "Lumi",
      p2Controller: (document.getElementById("c-p2-name") as HTMLInputElement).value.trim() || "GPT-6",
      p1Character: (document.getElementById("c-p1-char") as HTMLSelectElement).value,
      p2Character: (document.getElementById("c-p2-char") as HTMLSelectElement).value,
      p1Bot: (document.getElementById("c-p1-bot") as HTMLSelectElement).value,
      p2Bot: (document.getElementById("c-p2-bot") as HTMLSelectElement).value,
      window: (document.getElementById("c-window") as HTMLSelectElement).value,
      openSeat: (document.getElementById("c-open-seat") as HTMLSelectElement).value,
      seed: Number((document.getElementById("c-seed") as HTMLInputElement).value) || 1,
      startWhenReady: (document.getElementById("c-start-when-ready") as HTMLInputElement | null)?.checked ?? false,
    };
    const created = await createMatch(body);
    saveHostToken(created.id, created.secrets.hostToken);
    const open = created.openSeat ?? "none";
    const p1Open = open === "p1" || open === "both";
    const p2Open = open === "p2" || open === "both";
    const origin = location.origin;
    const p1Row = p1Open
      ? `<div class="secret-row">P1 (${created.p1.controller}): <strong>OPEN SEAT</strong> — no code. GET ${origin}/api/match/${created.id}/cmd?fighter=p1&amp;stance=rush</div>`
      : `<div class="secret-row">P1 (${created.p1.controller}) code: <code>${created.secrets.p1Code}</code></div>`;
    const p2Row = p2Open
      ? `<div class="secret-row">P2 (${created.p2.controller}): <strong>OPEN SEAT</strong> — no code. GET ${origin}/api/match/${created.id}/cmd?fighter=p2&amp;stance=rush</div>`
      : `<div class="secret-row">P2 (${created.p2.controller}) code: <code>${created.secrets.p2Code}</code></div>`;
    // Show join codes once, and only for seats that are not open. Never put codes in the URL.
    secretsEl.classList.remove("hidden");
    secretsEl.innerHTML = `
      <h3>Join codes — copy now, they will not be shown again</h3>
      <p>Give each controller only their own code. Do not put these in the repo, a PR, or a group chat. Open seats need no code.</p>
      <div class="secret-row">Watch: <a href="${watchUrlFor(created.id)}">${watchUrlFor(created.id)}</a></div>
      ${p1Row}
      ${p2Row}
      <div class="secret-row">Host token (this browser): saved in session storage (${hostTokenKey(created.id)}).</div>
      <button type="button" id="go-host">Open as host</button>
      <button type="button" class="secondary" id="dismiss-secrets">I've saved these</button>
    `;
    secretsEl.querySelector("#go-host")?.addEventListener("click", () => {
      location.href = watchUrlFor(created.id);
    });
    secretsEl.querySelector("#dismiss-secrets")?.addEventListener("click", () => {
      secretsEl.classList.add("hidden");
      secretsEl.innerHTML = "";
    });
    await refreshList();
  })().catch((err: unknown) => {
    secretsEl.classList.remove("hidden");
    secretsEl.textContent = err instanceof Error ? err.message : "create failed";
  });
});

copyBtn.addEventListener("click", () => {
  void navigator.clipboard.writeText(watchUrlInput.value).then(() => {
    copyBtn.textContent = "Copied";
    window.setTimeout(() => {
      copyBtn.textContent = "Copy";
    }, 1200);
  });
});

function openArena(id: string): void {
  lobby.classList.add("hidden");
  arena.classList.remove("hidden");
  watchUrlInput.value = watchUrlFor(id);
  resizeCanvas(canvas);
  window.addEventListener("resize", () => resizeCanvas(canvas));

  const token = loadHostToken(id);
  if (token) {
    statusEl.textContent = "This tab is the host — running the authoritative fight.";
    void (async () => {
      // Need meta: claim inside startHost, but startHost wants LiveMeta first.
      const { getState } = await import("./client.ts");
      const info = await getState(id);
      currentOpenSeat = info.openSeat ?? "none";
      setOpenSeatBadge("p1", seatOpen("p1"));
      setOpenSeatBadge("p2", seatOpen("p2"));
      paintPortraits(info.p1.character, info.p2.character);
      await startHost(
        canvas,
        {
          id,
          seed: info.seed,
          window: info.window,
          openSeat: info.openSeat ?? "none",
          p1: info.p1,
          p2: info.p2,
          startWhenReady: info.startWhenReady,
          readyTimeoutMs: info.readyTimeoutMs,
        },
        token,
        {
          onPublic(s) {
            renderPublic(s);
          },
          onLog: logLine,
          onLeaseLost() {
            statusEl.textContent = "Host lease lost — watching the live server state.";
            statusEl.classList.add("warn");
            startSpectator(canvas, id, {
              onPublic(s) {
                paintPortraits(s.p1.character, s.p2.character);
                renderPublic(s);
              },
              onStatus(text) {
                statusEl.textContent = text;
                statusEl.classList.toggle("warn", /wait/i.test(text) || /lost/i.test(text));
              },
              onLog: logLine,
              onBecameHost() {
                statusEl.textContent = "Live host (volunteer) · commanders can send plans now.";
                statusEl.classList.remove("warn");
              },
            });
          },
        },
      );
      statusEl.textContent = "Live host · commanders can send plans now.";
    })().catch((err: unknown) => {
      statusEl.textContent = err instanceof Error ? err.message : "host failed";
      statusEl.classList.add("warn");
    });
    return;
  }

  statusEl.textContent = "Watching — waiting for the host…";
  // Spectator still needs character names for portraits; first state will paint them.
  startSpectator(canvas, id, {
    onPublic(s) {
      paintPortraits(s.p1.character, s.p2.character);
      renderPublic(s);
    },
    onStatus(text) {
      statusEl.textContent = text;
      statusEl.classList.toggle("warn", /wait/i.test(text) || /lost/i.test(text));
    },
    onLog: logLine,
    onBecameHost() {
      statusEl.textContent = "Live host (volunteer) · commanders can send plans now.";
      statusEl.classList.remove("warn");
    },
  });
}

const params = new URLSearchParams(location.search);
const matchId = params.get("m") || params.get("match");
if (matchId) {
  openArena(matchId);
} else {
  void refreshList();
  window.setInterval(() => void refreshList(), 3000);
}
