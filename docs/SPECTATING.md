# Spectating — how to watch a match

AI Fight Club is a 2D Street Fighter-*style* game where AI models fight
and anyone can watch live in the browser. Original characters, art, and
move names only — this is not Street Fighter and is not affiliated with
Capcom.

## Watch a match (local, M0)

```bash
npm ci
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).
Before the first Fight the page shows a still of the two fighters in
their opening positions — that is intended.

1. Pick a bot for P1 and P2. Built-ins: **Rusher** (walks in, attacks
   up close, blocks when threatened), **Random** (seeded, so the same
   seed plays the same way), **Statue** (stands still — the punching
   dummy).
2. Set a seed. The default is `20261111`.
3. Press **Fight**. The match runs at 60 ticks a second, best-of-3
   rounds, 60 seconds per round.
4. **Pause** freezes the match; press it again (**Resume**) to continue
   from exactly where it stopped. Pause does nothing before a fight
   starts or after one ends.
5. When the match is over, **Save replay** downloads a `.json` file
   (see [Replays](#replays) below).

## Reading the screen

- **Health bars** (top left P1, top right P2): green while healthy,
  red under 30%. P1 is cyan, P2 is amber — the same colors as the
  fighters on the stage.
- **Meter bars** (under each health bar): fill as a fighter lands
  hits, takes hits, or blocks. A full half-bar (50 meter) pays for a
  special — a melee burst, not a projectile in M0.
- **Timer** (center): seconds left in the round. Under it, the round
  dots: a filled dot per round won, and the current round number
  (`R1`, `R2`…).
- **Stage** (canvas): the fight itself. A red box flashes while an
  attack is in its active frames. A fighter flashing pale is in
  hitstun; a white bar in front of a fighter is a block. The canvas
  banner announces round and match results ("ION WINS ROUND",
  "ION WINS").
- **Commentary log** (under the controls, newest line on top): one
  line per event, in plain language. Hits name the attacker and the
  damage ("Quark taps Ion with a quick light — 40."). Blocks read as
  blocks with chip damage. Specials are called bursts, never given a
  move name. Round and match ends carry the score ("Ion takes round 2
  — that's 2-0."). Two extra flavors only appear when the public
  match state earns them: an **"almost"** line when a clean hit
  leaves a fighter at ~15% health or below, and a **comeback** line
  when a fighter at ~25% health or below lands a heavy or a special.
  A hit that ends the round gets a finisher line, then the KO line.
  If both fighters go down on the same tick (a trade can do this),
  the log prints one "Double KO" line instead of two contradictory
  ones.
- **Overlay pill** (over the top of the stage): a short callout from
  `src/commentary/overlay.ts`. It shows the round intro for the first
  ~1.5 seconds of a round ("ROUND 1 — Ion vs Quark"), and a low-health
  callout while a fight is live ("Quark is running on fumes."). It is
  empty — hidden — the rest of the time, and it never appears during
  round-end or match-end, because the canvas banner already covers
  those moments.

Commentary is deterministic: the lines are pure functions of the
match event plus public match state (health, wins, round). The same
match always prints the same log, live or replayed. There is no
randomness in the copy.

## Seeds and determinism

The same two bots on the same seed always produce the same fight —
same winner, same round score, same log. Change the seed and Random
plays differently; Rusher is deterministic in how it reacts, so
Rusher vs Statue always ends the same way. If a fight does not
reproduce, that is a real bug — report the seed, both bot picks, and
the round it diverged on (see [PLAYTEST.md](PLAYTEST.md)).

## Replays

**Saving:** press **Save replay** after a match ends. The button is
disabled while a match is running. The file is named
`afc-replay-<seed>.json`.

**What is inside:** JSON, `version: 1`, with the seed, the stage id,
both bots and characters, every tick's input pair for both fighters,
and the result (`winner`, round wins, total ticks). Replays record
*inputs*, not video — the engine re-simulates them.

**Playback:** `playback()` in `src/engine/replay.ts` re-runs the
recorded inputs through the same engine and must reproduce the live
match exactly (same canonical state, same winner, same round score).
That is checked in code by `tests/determinism.test.ts` ("runMatch +
playback of the recorded replay is identical").

**M0 limit — no in-page replay loader yet.** You can save a replay
file, and the code can play it back, but the spectator page cannot
load a replay file back in and show it. Loading replays in the
browser is M1/M2 work. Do not claim otherwise in a demo.

## If something looks wrong

- **Still image, nothing moving:** you have not pressed Fight yet, or
  the match is paused. Press Fight / Resume.
- **Save replay is greyed out:** the match is still running (or has
  not started). It enables when the match ends.
- **The log stops updating but the fighters keep moving:** report it
  with the seed, bots, and the last log line — the log and the engine
  run off the same events, so that split is a bug.
- **The page looks broken at phone width:** resize to 375px and see
  the layout boxes in [PLAYTEST.md](PLAYTEST.md).

## Docs

- [Plan and milestones](PLAN.md) · [Bot protocol](PROTOCOL.md) ·
  [Playtest checklist](PLAYTEST.md) · [Backup-coordinator notes](NOVA.md)
