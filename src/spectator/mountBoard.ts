import {
  LeaderboardPanel,
  type NormalizedLeaderboardState,
} from "./leaderboardUi.ts";
import { getFighterColorChip, resolveCanonicalFighterId } from "./pixelArt.ts";

export const STARTER_FIGHTER_IDS = ["cadence9", "ion", "quark", "vexel"] as const;

const DISPLAY_NAMES: Record<string, string> = {
  ion: "ION",
  quark: "QUARK",
  vexel: "VEXEL",
  cadence9: "CADENCE-9",
};

export function emptyStandings(
  ids: readonly string[] = STARTER_FIGHTER_IDS,
  initialRating = 1500,
): NormalizedLeaderboardState {
  const rows = [...ids]
    .sort((a, b) => a.localeCompare(b))
    .map((id, idx) => ({
      id,
      fighterId: resolveCanonicalFighterId(id),
      name: DISPLAY_NAMES[id] ?? id.toUpperCase(),
      model: "AI Fighter",
      color: getFighterColorChip(id),
      rank: idx + 1,
      previousRank: idx + 1,
      elo: initialRating,
      lastDelta: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      streak: 0,
    }));
  return { totalMatches: 0, rows };
}

/**
 * Optional data source. PR #1's LeaderboardHandle satisfies this
 * (`getTable(): { version, entries: LeaderboardEntry[] }`).
 */
export interface LiveBoardSource {
  getTable(): unknown;
}

export interface ArtBoardHandle {
  refresh(): void;
  update(raw: unknown): void;
  getState(): NormalizedLeaderboardState;
}

/**
 * Mount Gemini's Elo standings into `#leaderboard-root`.
 *
 * If PR #1 has already mounted `.afc-lb` (Run/Reset controls + `.afc-lb-table`),
 * the pixel-art rows are painted into that table host so the two PRs compose:
 * Dee owns persistence and match application, Gemini owns the visuals.
 * Call `refresh()` after `recordMatch` / `runMatches` / `reset`.
 */
export function mountSpectatorArtBoard(source?: LiveBoardSource | null): ArtBoardHandle | null {
  if (typeof document === "undefined") return null;
  const root = document.getElementById("leaderboard-root");
  if (!root) return null;
  const hosted = root.querySelector(".afc-lb-table");
  const host = hosted instanceof HTMLElement ? hosted : root;
  const initial = source?.getTable() ?? emptyStandings();
  const panel = new LeaderboardPanel(host, initial, "panel");
  return {
    refresh(): void {
      if (source) panel.update(source.getTable());
    },
    update(raw: unknown): void {
      panel.update(raw);
    },
    getState: () => panel.getState(),
  };
}
