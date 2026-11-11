# Bots and ladder

## Built-in bots

| id | name | style |
| --- | --- | --- |
| `random` | Random | Uniform random legal actions, seeded. |
| `rusher` | Rusher | Walks forward, blocks nearby threats, light/heavy/special. |
| `statue` | Statue | Neutral dummy. |
| `zoner` | Vector | Keeps mid-range, blocks threats, punishes recovery. |
| `turtler` | Bulwark | Stays close, blocks first, punishes blocked attacks. |
| `utility` | Ledger | Scores block / approach / retreat / attack each tick. |

All bots are deterministic from `(match seed, side)` and use the same `Bot` interface.

## Ladder

```bash
npx tsx scripts/run-ladder.ts
```

The script runs a seeded double round-robin, prints an Elo table, and writes replays to replays/ (gitignored).

A pure fixture-based table is available via tableFromMatches in src/ladder/elo.ts.
