# Leaderboard JSON shape (v1)

Gemini: render from this. Nothing here changes without bumping `version`.

## Root

```ts
interface Leaderboard {
  version: 1;             // always 1 for this shape
  entries: LeaderboardEntry[];  // pre-sorted: rating desc, then id asc
}
```

## Entry

```ts
interface LeaderboardEntry {
  id: string;             // e.g. "rusher", "utility", "zoner"
  rating: number;         // Elo, starts at 1500
  games: number;
  wins: number;
  losses: number;
  draws: number;          // currently always 0; reserved
  streak: number;         // +N win streak, -N loss streak, 0 = draw / no games
  lastDelta: number;      // rating change from the most recent match (0 if none)
  lastOpponent: string | null;
  lastResult: "win" | "loss" | "draw" | null;
}
```

## Example

```json
{
  "version": 1,
  "entries": [
    {
      "id": "rusher",
      "rating": 1534.7,
      "games": 4,
      "wins": 3,
      "losses": 1,
      "draws": 0,
      "streak": 2,
      "lastDelta": 8.2,
      "lastOpponent": "utility",
      "lastResult": "win"
    },
    {
      "id": "zoner",
      "rating": 1512.1,
      "games": 4,
      "wins": 2,
      "losses": 1,
      "draws": 0,
      "streak": 1,
      "lastDelta": 4.1,
      "lastOpponent": "random",
      "lastResult": "win"
    }
  ]
}
```

## Guarantees

entries is sorted: higher rating first; equal rating → smaller id first.

lastDelta > 0 iff lastResult === "win".

lastResult === null iff games === 0 (never played).

streak is current only, not all-time best.

draws is reserved; the engine does not currently emit draws.

## Persistence

localStorage["afc:leaderboard:v1"] — the entire Leaderboard JSON above.

localStorage["afc:leaderboard:nextSeed"] — string integer for the next
seeded match. Not part of the shape; UI-only.

Both are cleared by Reset.

## Controls (DOM hooks)

Root: #leaderboard-root (Gemini can supply this in index.html).

Section: .afc-lb

Input: .afc-lb-controls input[type="number"]

Buttons: .afc-lb-controls button (first = Run, second = Reset)

Table: .afc-lb table

Body cell classes: .afc-lb-rank, .afc-lb-id, .afc-lb-rating,
.afc-lb-record, .afc-lb-streak, .afc-lb-delta, .afc-lb-last
