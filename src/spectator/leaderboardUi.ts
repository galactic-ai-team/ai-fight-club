// src/spectator/leaderboardUi.ts
// Live Leaderboard Visuals & Adapter for Dee's PR #1 Ranking Module
// License: CC0-1.0 / MIT

import {
  CanonicalFighterId,
  drawPortraitToCanvas,
  getFighterColorChip,
  resolveCanonicalFighterId,
} from './pixelArt';

export interface NormalizedLeaderboardRow {
  id: string;
  fighterId: CanonicalFighterId;
  name: string;
  model: string;
  color: string;
  rank: number;
  previousRank: number;
  elo: number;
  lastDelta: number;
  wins: number;
  losses: number;
  streak: number; // +N for win streak (WN), -N for loss streak (LN)
}

export interface NormalizedLeaderboardState {
  totalMatches: number;
  rows: NormalizedLeaderboardRow[];
}

/**
 * Default fixture matching M0's Ion & Quark + Gemini's Vexel & Cadence-9
 * used before the first match completes or when testing standalone.
 */
export const DEFAULT_LEADERBOARD_FIXTURE: NormalizedLeaderboardState = {
  totalMatches: 12,
  rows: [
    {
      id: 'ion',
      fighterId: 'ion',
      name: 'ION',
      model: 'AI-Model-A',
      color: '#00B4D8',
      rank: 1,
      previousRank: 2,
      elo: 1236,
      lastDelta: +16,
      wins: 7,
      losses: 3,
      streak: 3,
    },
    {
      id: 'quark',
      fighterId: 'quark',
      name: 'QUARK',
      model: 'AI-Model-B',
      color: '#F72585',
      rank: 2,
      previousRank: 1,
      elo: 1214,
      lastDelta: -16,
      wins: 6,
      losses: 4,
      streak: -1,
    },
    {
      id: 'vexel',
      fighterId: 'vexel',
      name: 'VEXEL',
      model: 'AI-Model-C',
      color: '#00F5D4',
      rank: 3,
      previousRank: 3,
      elo: 1192,
      lastDelta: +14,
      wins: 5,
      losses: 5,
      streak: 1,
    },
    {
      id: 'cadence9',
      fighterId: 'cadence9',
      name: 'CADENCE-9',
      model: 'AI-Model-D',
      color: '#E09F3E',
      rank: 4,
      previousRank: 4,
      elo: 1158,
      lastDelta: -14,
      wins: 3,
      losses: 9,
      streak: -2,
    },
  ],
};

/**
 * Adapter that accepts any shape from Dee's PR #1 leaderboard module:
 * - Array of fighter stats: `[{ id, name, elo/rating, wins, losses, streak, lastDelta/delta }]`
 * - Wrapper object: `{ entries | standings | leaderboard | fighters | ratings, matchCount | totalMatches }`
 * - Map/Record keyed by fighter ID/name: `{ ion: { elo, wins, losses, ... }, quark: { ... } }`
 */
export function adaptPr1Leaderboard(
  rawInput: unknown,
  previousSnapshot?: NormalizedLeaderboardState
): NormalizedLeaderboardState {
  if (!rawInput) {
    return structuredClone(previousSnapshot ?? DEFAULT_LEADERBOARD_FIXTURE);
  }

  const prevById = new Map<string, NormalizedLeaderboardRow>();
  if (previousSnapshot) {
    for (const r of previousSnapshot.rows) {
      prevById.set(r.id.toLowerCase(), r);
    }
  }

  let rawList: any[] = [];
  let totalMatches = previousSnapshot ? previousSnapshot.totalMatches + 1 : 0;

  if (Array.isArray(rawInput)) {
    rawList = rawInput;
  } else if (typeof rawInput === 'object') {
    const obj = rawInput as Record<string, any>;
    if (typeof obj.getStandings === 'function') {
      rawList = obj.getStandings();
    } else if (typeof obj.getLeaderboard === 'function') {
      rawList = obj.getLeaderboard();
    } else if (Array.isArray(obj.entries)) {
      rawList = obj.entries;
    } else if (Array.isArray(obj.standings)) {
      rawList = obj.standings;
    } else if (Array.isArray(obj.leaderboard)) {
      rawList = obj.leaderboard;
    } else if (Array.isArray(obj.fighters)) {
      rawList = obj.fighters;
    } else if (Array.isArray(obj.ratings)) {
      rawList = obj.ratings;
    } else if (obj.ratings && typeof obj.ratings === 'object') {
      rawList = Object.entries(obj.ratings).map(([k, v]) =>
        typeof v === 'number' ? { id: k, name: k, elo: v } : { id: k, ...(v as object) }
      );
    } else {
      // Plain record keyed by fighter id
      const vals = Object.entries(obj).filter(
        ([k, v]) => v && typeof v === 'object' && ('elo' in v || 'rating' in v || 'wins' in v)
      );
      if (vals.length > 0) {
        rawList = vals.map(([k, v]) => ({ id: k, ...(v as object) }));
      }
    }

    if (typeof obj.totalMatches === 'number') totalMatches = obj.totalMatches;
    else if (typeof obj.matchCount === 'number') totalMatches = obj.matchCount;
    else if (typeof obj.matches === 'number') totalMatches = obj.matches;
  }

  if (rawList.length === 0) {
    return structuredClone(previousSnapshot ?? DEFAULT_LEADERBOARD_FIXTURE);
  }

  const rows: NormalizedLeaderboardRow[] = rawList.map((item: any, idx: number) => {
    const rawId = String(item.id ?? item.fighterId ?? item.name ?? `fighter-${idx}`);
    const key = rawId.toLowerCase();
    const prev = prevById.get(key);
    const fighterId = resolveCanonicalFighterId(rawId);

    const elo = Math.round(Number(item.elo ?? item.rating ?? item.score ?? prev?.elo ?? 1200));

    // Use explicit delta from PR #1 if present; otherwise diff against previous Elo
    const explicitDelta =
      item.lastDelta ?? item.delta ?? item.eloDelta ?? item.ratingDelta ?? item.eloChange ?? item.lastChange;
    const lastDelta =
      explicitDelta !== undefined
        ? Math.round(Number(explicitDelta))
        : prev
        ? elo - prev.elo
        : 0;

    const wins = Number(item.wins ?? item.w ?? prev?.wins ?? 0);
    const losses = Number(item.losses ?? item.l ?? prev?.losses ?? 0);

    // Parse streak from signed integer, string ("W3" / "L2"), or { type, count }
    let streak = 0;
    if (typeof item.streak === 'number') {
      streak = item.streak;
    } else if (typeof item.currentStreak === 'number') {
      streak = item.currentStreak;
    } else if (typeof item.streak === 'string') {
      const s = item.streak.trim().toUpperCase();
      const count = parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;
      streak = s.startsWith('L') || s.startsWith('-') ? -count : count;
    } else if (item.streak && typeof item.streak === 'object') {
      const count = Number(item.streak.count ?? item.streak.length ?? 0);
      const t = String(item.streak.type ?? '').toUpperCase();
      streak = t.startsWith('L') ? -count : count;
    } else if (typeof item.winStreak === 'number' && item.winStreak > 0) {
      streak = item.winStreak;
    } else if (typeof item.lossStreak === 'number' && item.lossStreak > 0) {
      streak = -item.lossStreak;
    } else if (prev) {
      streak = prev.streak;
    }

    return {
      id: rawId,
      fighterId,
      name: String(item.name ?? rawId).toUpperCase(),
      model: String(item.model ?? item.ai ?? item.provider ?? prev?.model ?? 'AI Fighter'),
      color: getFighterColorChip(rawId, item.color ?? item.colorChip ?? prev?.color),
      rank: Number(item.rank ?? idx + 1),
      previousRank: Number(item.previousRank ?? item.prevRank ?? prev?.rank ?? idx + 1),
      elo,
      lastDelta,
      wins,
      losses,
      streak,
    };
  });

  // Sort by Elo descending (tie-break by wins)
  rows.sort((a, b) => b.elo - a.elo || b.wins - a.wins);
  rows.forEach((r, idx) => {
    r.rank = idx + 1;
  });

  if (totalMatches === 0) {
    const sumWins = rows.reduce((acc, r) => acc + r.wins, 0);
    totalMatches = sumWins;
  }

  return { totalMatches, rows };
}

export class LeaderboardPanel {
  private container: HTMLElement;
  private state: NormalizedLeaderboardState;
  private rowEls = new Map<string, HTMLElement>();
  private rowsContainer!: HTMLElement;
  private matchesBadgeEl!: HTMLElement;
  private mode: 'panel' | 'page';

  constructor(
    container: HTMLElement,
    initialData?: unknown,
    mode: 'panel' | 'page' = 'panel'
  ) {
    this.container = container;
    this.mode = mode;
    this.state = adaptPr1Leaderboard(initialData);
    this.renderShell();
    this.renderRows(false);
  }

  public getState(): NormalizedLeaderboardState {
    return this.state;
  }

  /**
   * Call after each match with Dee's updated PR #1 leaderboard state/JSON.
   */
  public update(nextData: unknown): void {
    this.state = adaptPr1Leaderboard(nextData, this.state);
    this.renderRows(true);
  }

  /**
   * Convenience helper to record a match result directly (winnerId vs loserId, K=32)
   * if the caller only passes the match winner/loser IDs.
   */
  public recordMatchResult(winnerId: string, loserId: string, kFactor = 32): void {
    const next = structuredClone(this.state);
    const findRow = (id: string) =>
      next.rows.find(
        (r) =>
          r.id.toLowerCase() === id.toLowerCase() ||
          r.name.toLowerCase() === id.toLowerCase() ||
          r.fighterId === resolveCanonicalFighterId(id)
      );

    const winner = findRow(winnerId);
    const loser = findRow(loserId);
    if (!winner || !loser || winner === loser) return;

    next.rows.forEach((r) => {
      r.previousRank = r.rank;
      r.lastDelta = 0;
    });

    const expectedWin = 1 / (1 + Math.pow(10, (loser.elo - winner.elo) / 400));
    const delta = Math.max(1, Math.round(kFactor * (1 - expectedWin)));

    winner.elo += delta;
    winner.lastDelta = +delta;
    winner.wins += 1;
    winner.streak = winner.streak > 0 ? winner.streak + 1 : 1;

    loser.elo = Math.max(800, loser.elo - delta);
    loser.lastDelta = -delta;
    loser.losses += 1;
    loser.streak = loser.streak < 0 ? loser.streak - 1 : -1;

    next.rows.sort((a, b) => b.elo - a.elo || b.wins - a.wins);
    next.rows.forEach((r, i) => {
      r.rank = i + 1;
    });
    next.totalMatches += 1;

    this.state = next;
    this.renderRows(true);
  }

  private renderShell(): void {
    this.container.innerHTML = '';
    const section = document.createElement('section');
    section.className = `afc-lb-shell afc-lb-${this.mode}`;
    section.setAttribute('aria-label', 'Live Elo Leaderboard');

    section.innerHTML = `
      <header class="afc-lb-header">
        <div class="afc-lb-title-wrap">
          <span class="afc-lb-live-dot" aria-hidden="true"></span>
          <h2 class="afc-lb-title">LIVE ELO STANDINGS</h2>
        </div>
        <div class="afc-lb-actions">
          <span class="afc-lb-matches">MATCHES: <strong data-lb-matches>${this.state.totalMatches}</strong></span>
        </div>
      </header>

      <div class="afc-lb-cols" aria-hidden="true">
        <span>RNK</span>
        <span>FIGHTER</span>
        <span class="afc-lb-right">ELO (±)</span>
        <span class="afc-lb-right">W-L</span>
        <span class="afc-lb-right">STRK</span>
      </div>

      <div class="afc-lb-list" data-lb-list role="list"></div>
    `;

    this.container.appendChild(section);
    this.rowsContainer = section.querySelector('[data-lb-list]') as HTMLElement;
    this.matchesBadgeEl = section.querySelector('[data-lb-matches]') as HTMLElement;
  }

  private renderRows(animateFlip: boolean): void {
    const prevRects = new Map<string, DOMRect>();
    if (animateFlip) {
      this.rowEls.forEach((el, id) => {
        prevRects.set(id, el.getBoundingClientRect());
      });
    }

    if (this.matchesBadgeEl) {
      this.matchesBadgeEl.textContent = String(this.state.totalMatches);
    }

    const nextMap = new Map<string, HTMLElement>();
    this.rowsContainer.innerHTML = '';

    for (const row of this.state.rows) {
      const el = this.createRowElement(row, animateFlip);
      this.rowsContainer.appendChild(el);
      nextMap.set(row.id, el);
    }

    this.rowEls = nextMap;

    // FLIP animation for rank changes
    if (animateFlip && prevRects.size > 0) {
      this.rowEls.forEach((el, id) => {
        const first = prevRects.get(id);
        if (!first) return;
        const last = el.getBoundingClientRect();
        const dy = first.top - last.top;
        if (Math.abs(dy) > 1) {
          el.style.transition = 'none';
          el.style.transform = `translateY(${dy}px)`;
          el.style.zIndex = dy > 0 ? '2' : '1';
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              el.style.transition = 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)';
              el.style.transform = 'translateY(0)';
            });
          });
        }
      });
    }
  }

  private createRowElement(row: NormalizedLeaderboardRow, animate: boolean): HTMLElement {
    const el = document.createElement('div');
    el.setAttribute('role', 'listitem');
    el.dataset.fighterId = row.id;

    const shift = row.previousRank - row.rank;
    const shiftMod =
      animate && shift > 0
        ? 'afc-lb-row-up'
        : animate && shift < 0
        ? 'afc-lb-row-down'
        : '';

    el.className = `afc-lb-row afc-lb-rank-${row.rank} ${shiftMod}`.trim();

    const shiftHtml =
      shift > 0
        ? `<span class="afc-lb-shift afc-shift-up" title="Up ${shift}">▲${shift}</span>`
        : shift < 0
        ? `<span class="afc-lb-shift afc-shift-down" title="Down ${Math.abs(shift)}">▼${Math.abs(shift)}</span>`
        : `<span class="afc-lb-shift afc-shift-flat">—</span>`;

    const deltaStr = row.lastDelta > 0 ? `+${row.lastDelta}` : `${row.lastDelta}`;
    const deltaMod =
      row.lastDelta > 0
        ? 'afc-delta-pos'
        : row.lastDelta < 0
        ? 'afc-delta-neg'
        : 'afc-delta-zero';

    const absStreak = Math.abs(row.streak);
    const isWinStreak = row.streak > 0;
    const isHot = row.streak >= 3;
    const streakText =
      row.streak === 0
        ? '—'
        : isWinStreak
        ? `${isHot ? '⚡' : ''}W${absStreak}`
        : `L${absStreak}`;
    const streakMod =
      row.streak === 0
        ? 'afc-streak-flat'
        : isHot
        ? 'afc-streak-hot'
        : isWinStreak
        ? 'afc-streak-win'
        : 'afc-streak-loss';

    const total = row.wins + row.losses;
    const winPct = total > 0 ? Math.round((row.wins / total) * 100) : 0;

    el.innerHTML = `
      <div class="afc-lb-cell-rank">
        <span class="afc-lb-rank-num">#${row.rank}</span>
        ${shiftHtml}
      </div>

      <div class="afc-lb-cell-fighter">
        <div class="afc-lb-avatar" style="--chip-color: ${row.color}">
          <span class="afc-lb-chip" style="background: ${row.color}"></span>
          <canvas class="afc-lb-portrait" width="36" height="36" aria-hidden="true"></canvas>
        </div>
        <div class="afc-lb-ident">
          <span class="afc-lb-name">${row.name}</span>
          <span class="afc-lb-model">${row.model}</span>
        </div>
      </div>

      <div class="afc-lb-cell-elo">
        <span class="afc-lb-elo">${row.elo}</span>
        <span class="afc-lb-delta ${deltaMod}">${deltaStr}</span>
      </div>

      <div class="afc-lb-cell-wl">
        <span class="afc-lb-wl">${row.wins}-${row.losses}</span>
        <div class="afc-lb-winbar" title="${winPct}% Win Rate">
          <div class="afc-lb-winbar-fill" style="width: ${winPct}%; background: ${row.color}"></div>
        </div>
      </div>

      <div class="afc-lb-cell-streak">
        <span class="afc-lb-streak ${streakMod}">${streakText}</span>
      </div>
    `;

    const portraitCanvas = el.querySelector('.afc-lb-portrait') as HTMLCanvasElement | null;
    if (portraitCanvas) {
      drawPortraitToCanvas(portraitCanvas, row.id, 3, row.color);
    }

    return el;
  }
}