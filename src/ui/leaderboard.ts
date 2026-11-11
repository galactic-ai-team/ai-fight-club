import { BUILTIN_BOTS } from "../bots/index.ts";
import {
  initLeaderboard,
  LEADERBOARD_VERSION,
  type Leaderboard,
  type LeaderboardEntry,
} from "../ladder/leaderboard.ts";
import { playSeededMatches } from "../ladder/play.ts";

export const STORAGE_KEY = "afc:leaderboard:v1";
export const NEXT_SEED_KEY = "afc:leaderboard:nextSeed";
const STYLE_ID = "afc-leaderboard-style";

export interface LeaderboardHandle {
  getTable(): Leaderboard;
  runMatches(n: number): Leaderboard;
  reset(): Leaderboard;
}

function readNextSeed(): number {
  try {
    const raw = localStorage.getItem(NEXT_SEED_KEY);
    if (!raw) return 1;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  } catch {
    return 1;
  }
}

function writeNextSeed(seed: number): void {
  try {
    localStorage.setItem(NEXT_SEED_KEY, String(seed));
  } catch {
    // ignore
  }
}

export function loadLeaderboard(ids: readonly string[]): Leaderboard {
  if (typeof localStorage === "undefined") return initLeaderboard(ids);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initLeaderboard(ids);
    const parsed = JSON.parse(raw) as Leaderboard;
    if (parsed.version !== LEADERBOARD_VERSION) return initLeaderboard(ids);
    return parsed;
  } catch {
    return initLeaderboard(ids);
  }
}

export function saveLeaderboard(table: Leaderboard): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(table));
  } catch {
    // ignore quota / private mode
  }
}

export function resetLeaderboard(ids: readonly string[]): Leaderboard {
  const fresh = initLeaderboard(ids);
  saveLeaderboard(fresh);
  return fresh;
}

function fmtDelta(n: number): string {
  if (n === 0) return "0.0";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}`;
}

function fmtStreak(n: number): string {
  if (n > 0) return `W${n}`;
  if (n < 0) return `L${-n}`;
  return "—";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function rowHtml(e: LeaderboardEntry, rank: number): string {
  const delta = e.lastResult === null ? "—" : fmtDelta(e.lastDelta);
  const last =
    e.lastResult === null
      ? "—"
      : `${e.lastResult} vs ${escapeHtml(e.lastOpponent ?? "?")}`;
  return `
    <tr>
      <td class="afc-lb-rank">${rank}</td>
      <td class="afc-lb-id"><code>${escapeHtml(e.id)}</code></td>
      <td class="afc-lb-rating">${e.rating.toFixed(1)}</td>
      <td class="afc-lb-record">${e.wins}-${e.losses}-${e.draws}</td>
      <td class="afc-lb-streak">${fmtStreak(e.streak)}</td>
      <td class="afc-lb-delta">${delta}</td>
      <td class="afc-lb-last">${last}</td>
    </tr>
  `;
}

function ensureStyle(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .afc-lb { max-width: 760px; margin: 24px auto; padding: 0 16px; font-family: system-ui, sans-serif; }
    .afc-lb h2 { margin: 0 0 4px 0; font-size: 20px; }
    .afc-lb .afc-lb-hint { margin: 0 0 12px 0; color: #666; font-size: 13px; }
    .afc-lb-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
    .afc-lb-controls input[type="number"] { width: 72px; padding: 4px 6px; }
    .afc-lb-controls button { padding: 4px 10px; cursor: pointer; }
    .afc-lb table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .afc-lb th, .afc-lb td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; }
    .afc-lb th { background: #f5f5f5; font-weight: 600; }
    .afc-lb .afc-lb-rating, .afc-lb .afc-lb-delta { font-variant-numeric: tabular-nums; }
    .afc-lb .afc-lb-rank { width: 40px; color: #666; }
  `;
  document.head.appendChild(style);
}

export function mountLeaderboard(root: HTMLElement): LeaderboardHandle {
  ensureStyle();

  let table = loadLeaderboard(BUILTIN_BOTS);

  const section = document.createElement("section");
  section.className = "afc-lb";

  const heading = document.createElement("h2");
  heading.textContent = "Leaderboard";

  const hint = document.createElement("p");
  hint.className = "afc-lb-hint";
  hint.textContent = "Live Elo — updates after every match.";

  const controls = document.createElement("div");
  controls.className = "afc-lb-controls";
  const label = document.createElement("label");
  label.append("Run ");
  const countInput = document.createElement("input");
  countInput.type = "number";
  countInput.min = "1";
  countInput.max = "200";
  countInput.value = "10";
  label.append(countInput, " seeded matches");
  const runBtn = document.createElement("button");
  runBtn.type = "button";
  runBtn.textContent = "Run";
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.textContent = "Reset";
  controls.append(label, runBtn, resetBtn);

  const tableHost = document.createElement("div");
  tableHost.className = "afc-lb-table";

  section.append(heading, hint, controls, tableHost);
  root.appendChild(section);

  const paint = (): void => {
    const rows = table.entries.map((e, i) => rowHtml(e, i + 1)).join("");
    tableHost.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Bot</th>
            <th>Rating</th>
            <th>W-L-D</th>
            <th>Streak</th>
            <th>Δ Last</th>
            <th>Last match</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  };

  const commit = (next: Leaderboard): Leaderboard => {
    table = next;
    saveLeaderboard(table);
    paint();
    return table;
  };

  const handle: LeaderboardHandle = {
    getTable: () => table,
    runMatches(n: number): Leaderboard {
      const startSeed = readNextSeed();
      const { table: next, nextSeed } = playSeededMatches(table, {
        count: n,
        startSeed,
      });
      writeNextSeed(nextSeed);
      return commit(next);
    },
    reset(): Leaderboard {
      writeNextSeed(1);
      return commit(resetLeaderboard(BUILTIN_BOTS));
    },
  };

  runBtn.addEventListener("click", () => {
    const parsed = Number.parseInt(countInput.value, 10);
    const n = Math.max(1, Math.min(200, Number.isFinite(parsed) ? parsed : 10));
    handle.runMatches(n);
  });
  resetBtn.addEventListener("click", () => handle.reset());

  paint();
  return handle;
}

/**
 * Optional convenience: mount into `#leaderboard-root` if present,
 * otherwise skip (so Gemini's layout can wire it up explicitly).
 */
export function bootLeaderboard(): LeaderboardHandle | null {
  if (typeof document === "undefined") return null;
  const root = document.getElementById("leaderboard-root");
  if (!root) return null;
  return mountLeaderboard(root);
}
