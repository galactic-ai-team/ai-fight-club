# Lane: Dee (DeepSeek) — starter AI bots + matchmaking / ladder

Repo: https://github.com/galactic-ai-team/ai-fight-club
Branch: `feat/bots-ladder` (from latest `main`)
Plan: [docs/PLAN.md](../PLAN.md) · Protocol: [docs/PROTOCOL.md](../PROTOCOL.md)
M0 already on `main`: `rusher`, `random` (seeded), and `statue`, plus `runMatch` and replay files. `tests/bots.test.ts` already checks that rusher KOs a statue and beats random on a 20-seed set.

Approved: Stephon, Wed Nov 11, 2026, 5:40 PM ET. Free only. No tokens in the repo or in chat. Original IP only.

## Goal

Give the game a real roster of **in-browser** AI brains that play differently, and a **ladder** so we can run a seeded tournament and rank them. This is the path to "watch a live AI-vs-AI match" that is not just one rusher punching a random bot. External model hooks are Claude's lane; you consume the same `Bot` interface.

## Files you own

- `src/bots/**` (keep `random`, `rusher`, `statue` working; add new bots)
- `src/ladder/**` (create this)
- `tests/bots.test.ts`, `tests/ladder.test.ts`, `tests/leaderboard.test.ts`
- Optional: `docs/BOTS.md` (how each bot thinks, how to run a tournament)

Do not change hitbox math or the spectator canvas except to add a bot-select option or a "run ladder" control if that is a small hook.

## Interface contract

- Every bot implements `Bot` (`id`, `name`, `start?`, `act(obs): Action`). `act` must be synchronous and cheap (no network).
- Bots must be **deterministic** given `(match seed, side)`. Seed any internal RNG from those, never `Math.random()`.
- Suggested extra brains (names are yours to change, keep them original): a **zoner** (keep space, prefer heavy / burst at range), a **turtler** (block first, punish), and a simple **utility** bot (score distance, threat, health, meter and pick an action). They should be distinguishable in a replay.
- Ladder: Elo or Glicko-2 is fine. Store ratings in a JSON file and/or a pure function that takes a match list and returns a table. A **seeded round-robin** (fixed seed list) must be reproducible: same seeds, same ranking.
- Replays of official ladder matches should be writable to a folder (gitignored if large; check in a small fixture).

## New: live leaderboard (Stephon, Nov 11, 6:08 PM ET)

Stephon wants a **live leaderboard in the browser that updates after each match**. You own the ranking logic and the page hook:

- `src/ladder/leaderboard.ts`: pure `applyResult(table, matchResult) -> table` with **Elo** (K-factor documented, start 1000 or 1500, your call), **wins / losses / draws**, **current streak** (e.g. `W3`, `L1`), last-match rating delta, and rank order (ties broken deterministically, e.g. rating then wins then id).
- A versioned JSON shape for the table (Gemini renders it; keep field names stable and documented in `docs/BOTS.md` or `docs/LEADERBOARD.md`).
- Hook it to the spectator: when a match ends, update the table and persist it in `localStorage`; add a small "run N seeded matches" / "reset leaderboard" control. Gemini does the visuals; you can ship a plain HTML table so it works first.
- Tests: Elo update math on a fixture, streak transitions (W→L resets), the same match list gives the same table, rebuild from replays matches the live table.

## Acceptance tests

- [ ] `npm run typecheck && npm test && npm run build` green.
- [ ] Existing rusher-vs-statue and rusher-vs-random tests still pass (update only if you have a good reason and you say so).
- [ ] Each new bot is deterministic on a fixed seed (two instances, identical actions for 100 ticks).
- [ ] At least one new bot beats `random` on a fixed 20-seed set (document the win count; a reasonable bar is ≥ 14/20, same as rusher).
- [ ] Two distinct bots (e.g. rusher vs turtler) can finish a match without throwing.
- [ ] Ladder: a fixture of N completed matches produces a stable ranking; adding the same results twice does not scramble order (or you document how you handle that).
- [ ] `npx tsx` or an `npm` script can run a small tournament headlessly and print a table.
- [ ] Leaderboard: Elo, W/L, and streaks update after every match in the browser and survive a page reload; `tests/leaderboard.test.ts` covers Elo math, streaks, and determinism.

## How to submit

PR against `main` from `feat/bots-ladder`, or a patch / zip that applies on `main`. CI green is the review check. Lumi reviews and attributes the commit. Short PR notes: bot behaviors, tournament command, and the fixture rating table.

## Also pitch (required, short)

1. A vote for the game name (keep "AI Fight Club", pick another original name, or propose your own — no Capcom/SF titles).
2. Two original character concepts: name, look, and one special-move idea (original names only).
