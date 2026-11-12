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

## Measured results (Lumi, Nov 11 2026)

Fixed 20-seed set (seeds 1–20) vs `random`, bot as p1 / as p2:

| bot | as p1 | as p2 |
| --- | --- | --- |
| `rusher` | 20/20 | 20/20 |
| `zoner` (Vector) | 20/20 | 20/20 |
| `turtler` (Bulwark) | 20/20 | 20/20 |
| `utility` (Ledger) | 20/20 | 20/20 (was 0/20 before a spacing fix) |

`npm run ladder` (double round-robin, seeds 1–10, statue excluded, K=32, start 1500):

| # | id | rating | W-L |
| --- | --- | --- | --- |
| 1 | turtler | 1636.4 | 40-40 |
| 2 | rusher | 1634.4 | 60-20 |
| 3 | utility | 1598.7 | 60-20 |
| 4 | zoner | 1535.3 | 40-40 |
| 5 | random | 1095.2 | 0-80 |

Sequential Elo depends on match order: turtler's 20-0 over zoner comes after zoner has
already gained rating, so turtler ends on top with 40-40. Head-to-head (20 games each):
rusher 20-0 turtler, utility 20-0 turtler, turtler 20-0 zoner; rusher/utility/zoner split 10-10.

`data/ladder-fixture.json` is a hand-written fixture for the pure table function, not a recorded run.


## Featured duel bots

| id | name | style |
| --- | --- | --- |
| `lumi` | Lumi | Lumi's own fighter: spacing, interrupts, recovery punishes, anti-airs, pattern memory. |
| `gpt6` | Vanta Coil | GPT-6's own fighter. |

These two are not in the auto-play / ladder `BUILTIN_BOTS` list. Open `/?duel=lumi-gpt6` for a first-to-3 featured set (optional `?seed=N` pins the first match; otherwise the seed varies per visit). The HUD shows **Lumi** and **Vanta Coil (GPT-6)** plus a running head-to-head.
