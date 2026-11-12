# Playtest checklist (M0 / M1)

Nova owns this checklist. Anyone on the team (or Stephon) should be able
to run it top to bottom without asking Nova anything. Tick a box only
when you actually saw the thing happen — not when a test file says it
should.

How to watch a match at all: see [SPECTATING.md](SPECTATING.md).

## Setup

```bash
npm ci
npm run typecheck && npm test && npm run build
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).
Before the first Fight the page shows a still of the two fighters in
their opening positions. That is intended, not a bug.

## Local M0 — the fight

- [ ] `npm ci && npm test && npm run typecheck && npm run build` all pass.
- [ ] `npm run dev` opens a page titled AI Fight Club, with health bars, meter, timer, and a canvas.
- [ ] Default **Rusher vs Random** (seed `20261111`) starts a fight when you press Fight. Fighters move, attacks show a red hitbox, health goes down, the log comments on hits.
- [ ] Pause / Resume freezes and continues the same match (health, timer, and log pick up where they stopped — nothing resets).
- [ ] Changing the seed changes how Random plays (same bots, different seed: different fight).
- [ ] Same bots + same seed = the same fight. Run Rusher vs Random on seed `20261111` twice: same winner, same round score. (`tests/determinism.test.ts` checks this in code; this box is the eyeball version.)
- [ ] Rusher vs Statue eventually wins the match (best-of-3). Statue never attacks, so Rusher should take it 2-0.
- [ ] A round that runs out the 60-second clock ends on health (or a draw if health is tied) — the log says "Time!" and the round score updates.
- [ ] Save replay downloads a `.json` file. The button stays disabled until the match is over.

## Local M0 — commentary and overlay

Commentary lives in `src/commentary/index.ts` (log lines) and
`src/commentary/overlay.ts` (the pill over the stage). Both are pure
functions of the event / public match state: same match, same lines,
live or replay. There is no randomness in the copy.

- [ ] The log names the attacker on hits and shows the damage number ("Quark taps Ion with a quick light — 40.").
- [ ] Blocked hits read as blocks with chip damage, not as clean hits ("Ion holds the guard — only 16 chip gets through.").
- [ ] A special reads as a burst, never as a named move ("Ion lets the burst rip — Quark eats 120."). No move names anywhere in the log.
- [ ] A KO, a timeout, a round end, and a match end each get their own line, in that order, with the right winner.
- [ ] Round-end and match-end lines carry the score when the match has one ("Ion takes round 2 — that's 2-0.", "Ion takes the match 2-0 — a clean sweep.").
- [ ] When a fighter drops to ~15% health or below, the next clean hit on them gets an "almost" line ("Quark is hanging by a thread after that heavy.") — unless that hit finishes them, in which case the log says so ("Ion's heavy ends it for Quark.") and the KO line follows. When a fighter at ~25% health or below lands a heavy or a special, the log calls the comeback ("Ion is running on fumes and still swinging…").
- [ ] The overlay pill over the stage shows "ROUND 1 — Ion vs Quark" for the first ~1.5 seconds of a round, then goes away.
- [ ] When one fighter drops to 25% health or below mid-fight, the pill says so ("Quark is running on fumes."). When both are that low it says both are one clean hit from done.
- [ ] The pill is gone during round-end and match-end — the canvas banner owns those moments, so there is no double banner.
- [ ] A double KO (both fighters go down on the same tick — trades can do this) prints exactly one line: "Double KO — both fighters go down at once." Never two contradictory "takes the KO" lines. This one is covered by the unit test in `tests/commentary.test.ts`; it is hard to force live on demand, so do not block a playtest on seeing it live — run `npm test` and check that test passes.

## Local M0 — layout (375px)

Resize the browser window to 375px wide (phone-sized) and re-run a fight. Not pretty is OK for M0; unusable is not.

- [ ] No horizontal scrolling: everything fits in 375px.
- [ ] Health bars, timer, and round dots all stay visible.
- [ ] The Fight button, bot pickers, seed field, Pause, and Save replay are all reachable and tappable.
- [ ] The canvas scales down; the overlay pill does not clip off the stage or cover the fighters' heads for the whole round (it sits at the top and disappears).
- [ ] The log stays readable (newest line on top).

## Local M0 — IP and secrets

- [ ] No Capcom names, logos, or lookalike character sprites on the page. Fighters are colored boxes named Ion and Quark (placeholders, Gemini's lane to replace).
- [ ] No Capcom IP in the code or the copy. Run this from the repo root — it must print nothing (it is scoped to `src` and `index.html` on purpose: `tests/commentary.test.ts` intentionally lists the banned terms as test data, and this doc lists them so the check is reviewable):

  ```bash
  grep -rniE "\b(ryu|ken|guile|blanka|bison|dhalsim|zangief|vega|sagat|balrog)\b|hadoken|shoryuken|sonic boom|tatsumaki|chun-li|finish him|fatality" src index.html
  ```

- [ ] No tokens or secrets in the repo. Run this — it must print nothing:

  ```bash
  grep -rniE "api[_-]?key|password|secret|bearer|ghp_|sk-[a-z0-9]" src index.html
  ```

  The word "token" does appear in docs (`.env.example`, `CONTRIBUTING.md`, team packets) — only ever in the rule *"never put tokens in the repo"*. If a grep hit is a value rather than that rule text, stop and flag it.

## M1 (before any production deploy)

- [ ] Two named original fighters (not just boxes, unless Stephon is OK shipping boxes).
- [ ] Commentary covers hit, block, KO, timeout, round end, match end. (Covered in code by `tests/commentary.test.ts` and `tests/overlay.test.ts`; confirm live with the boxes above.)
- [ ] Replay of a finished match matches the live result (`playback`). Check in code: `tests/determinism.test.ts` ("runMatch + playback of the recorded replay is identical"). Live: save a replay, note the winner and round score, and confirm they match what you watched.
- [ ] 375px layout still passes after the art lands (Gemini's lane) — re-run the layout boxes above.
- [ ] CI green on the deploy commit (`npm run typecheck && npm test && npm run build`, same as the GitHub Actions `ci` workflow).
- [ ] Stephon has said yes to putting this URL live. **No deploy without that yes** — see [NOVA.md](NOVA.md).

## If something fails

Report it with: the seed, both bot picks, the tick or round it happened
on (the log's newest lines), and a screenshot if the page looks wrong.
For a wrong log line, paste the exact line. For a fight that does not
reproduce, say which of the two determinism boxes above failed.

## Known M0 limits (not bugs — do not file these as failures)

- Fighters are colored boxes (Ion cyan, Quark amber). Final art is Gemini's lane (M1/M3).
- The special is a melee burst, not a projectile. Projectiles are a later engine extension.
- There is no in-page replay loader yet: Save replay downloads a JSON file, and `playback()` in `src/engine/replay.ts` reproduces the match in code. Loading a replay back into the spectator page is M1/M2 work — see [SPECTATING.md](SPECTATING.md).
- No sound, no remote/WebSocket bots, no live leaderboard yet. The leaderboard is Dee + Gemini's lane (Elo, W/L, streaks; in-browser version may land in M1, shared version M2 — see [PLAN.md](PLAN.md)).
- Commentary variety is a small fixed pool per event, picked deterministically by the event itself — lines repeat across a long match. Growing the pool is fine later; adding randomness is not (replays must print the same log).
