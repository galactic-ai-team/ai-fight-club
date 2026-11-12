import { ready as gpt6ReadyFlag } from "../bots/gpt6.ts";

/** Open the featured set with `?duel=lumi-gpt6`. */
export const DUEL_QUERY_VALUE = "lumi-gpt6";
export const DUEL_WINS_NEEDED = 3;
export const LUMI_BOT_ID = "lumi";
export const GPT6_BOT_ID = "gpt6";
export const LUMI_DISPLAY_NAME = "Lumi";
export const GPT6_DISPLAY_NAME = "GPT-6";
export const WAITING_MESSAGE = "waiting for GPT-6's fighter";
export const DUEL_TITLE = "Featured: Lumi vs GPT-6";

export type DuelFighter = "lumi" | "gpt6";

export interface DuelSetState {
  lumiWins: number;
  gpt6Wins: number;
  matchesPlayed: number;
  over: boolean;
  winner: DuelFighter | null;
}

export function isDuelQuery(search: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw).get("duel") === DUEL_QUERY_VALUE;
}

/** True once the real gpt6.ts is dropped and exports `ready = true`. */
export function gpt6IsReady(readyFlag: boolean = gpt6ReadyFlag): boolean {
  return readyFlag === true;
}

export function emptyDuelSet(): DuelSetState {
  return { lumiWins: 0, gpt6Wins: 0, matchesPlayed: 0, over: false, winner: null };
}

export function applyDuelMatch(set: DuelSetState, winner: DuelFighter): DuelSetState {
  if (set.over) {
    return set;
  }
  const next: DuelSetState = {
    lumiWins: set.lumiWins,
    gpt6Wins: set.gpt6Wins,
    matchesPlayed: set.matchesPlayed + 1,
    over: false,
    winner: null,
  };
  if (winner === "lumi") next.lumiWins += 1;
  else next.gpt6Wins += 1;
  if (next.lumiWins >= DUEL_WINS_NEEDED) {
    next.over = true;
    next.winner = "lumi";
  } else if (next.gpt6Wins >= DUEL_WINS_NEEDED) {
    next.over = true;
    next.winner = "gpt6";
  }
  return next;
}

export function duelScoreLine(set: DuelSetState): string {
  return `${set.lumiWins} – ${set.gpt6Wins}`;
}

export function duelStatusLine(opts: {
  ready: boolean;
  set: DuelSetState;
  live?: boolean;
}): string {
  if (!opts.ready) return WAITING_MESSAGE;
  if (opts.set.over && opts.set.winner) {
    const name = opts.set.winner === "lumi" ? LUMI_DISPLAY_NAME : GPT6_DISPLAY_NAME;
    return `Set over — ${name} wins ${opts.set.lumiWins}–${opts.set.gpt6Wins}`;
  }
  const matchNo = opts.set.matchesPlayed + 1;
  if (opts.live) return `First to ${DUEL_WINS_NEEDED} · match ${matchNo}`;
  return `First to ${DUEL_WINS_NEEDED}`;
}

export function winnerToDuelFighter(
  matchWinner: "p1" | "p2",
  lumiSide: "p1" | "p2" = "p1",
): DuelFighter {
  return matchWinner === lumiSide ? "lumi" : "gpt6";
}

export function hudName(side: "lumi" | "gpt6", character: string): string {
  const who = side === "lumi" ? LUMI_DISPLAY_NAME : GPT6_DISPLAY_NAME;
  return `${character} · ${who}`;
}
