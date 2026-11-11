# Lane: GPT-6 — engine core + determinism tests

Repo: https://github.com/galactic-ai-team/ai-fight-club
Branch: `feat/engine-core` (from latest `main`)
Plan: [docs/PLAN.md](../PLAN.md) · Protocol: [docs/PROTOCOL.md](../PROTOCOL.md)
M0 already on `main`: a working 60 Hz TypeScript sim, tests in `tests/engine.test.ts` and `tests/determinism.test.ts`.

Approved: Stephon, Wed Nov 11, 2026, 5:40 PM ET. Free only. No tokens in the repo or in chat. Original IP only — no Capcom names, moves, or art.

## Goal

Turn the M0 engine into the M1 core: a deterministic, well-tested, fixed-tick fighter that two bots can play fairly. Same seed + same action stream must always produce the same canonical state, in Node and in the browser.

## Files you own

- `src/engine/**` (especially `sim.ts`, `attacks.ts`, `boxes.ts`, `canonical.ts`, `replay.ts`)
- `tests/engine.test.ts`, `tests/determinism.test.ts`
- Optional: `docs/FRAME_DATA.md` (a public table of startup / active / recovery / damage / hitstun)

Leave `src/bots/**`, `src/render/**`, `src/protocol/**`, and `src/commentary/**` alone unless you need a tiny, documented interface tweak.

## Interface contract

Do not break v0 without a protocol bump and a note in the PR:

- `createMatch`, `stepMatch(state, p1Action, p2Action)`, `observe(state, side)`, `runMatch`, `playback`, `canonicalState`, `normalizeAction`.
- Tick rate stays 60 Hz. Coordinates stay integer pixels unless you prove a fixed-point scheme and migrate tests.
- Observation / Action JSON stay as in [PROTOCOL.md](../PROTOCOL.md).
- M0 special is a melee burst. If you add projectiles, do it behind a clear type and keep the default match runnable without them.

Please also:

- Make state fully serializable / restorable (`cloneState` or equivalent) so a replay can seek and a test can snapshot mid-match.
- Guard against hidden nondeterminism (no `Math.random`, no `Date.now` in the sim, object key order in canonical JSON is already fixed).
- Document frame data. Tuning feel is in-scope; silent damage buffs should show up in tests.

## Acceptance tests

- [ ] `npm run typecheck && npm test && npm run build` green.
- [ ] A 5,000+ tick scripted sequence, run twice in one process, has identical `canonicalState` / `stateHash`.
- [ ] `runMatch` then `playback(replay)` matches, including round transitions and the match winner, for at least three seeds.
- [ ] Hits, blocks (chip, no hitstun), misses, trades (both hit same tick), KO, timeout, and first-to-two are all tested.
- [ ] A one-shot hitbox still cannot damage every active frame.
- [ ] `normalizeAction` still swallows junk.
- [ ] No `Math.random` or wall clock in `src/engine`.

## How to submit

PR against `main` from `feat/engine-core`, or a patch / zip that applies on `main`. CI (`ci` workflow) must be green — that is the review check. Lumi reviews and attributes the commit. Short PR notes: what changed, how to test, any frame-data changes.

## Also pitch (required, short)

1. A vote for the game name (keep "AI Fight Club", pick another original name, or propose your own — no Capcom/SF titles).
2. Two original character concepts: name, look, and one special-move idea (original names only).
