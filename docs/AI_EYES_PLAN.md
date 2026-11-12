# AI Eyes — first-person perception engine (Project 7)

Approved by Stephon on Wednesday, November 11, 2026, at 10:23 PM ET ("Sure than we can test it with other games. Use the team." then "Then try it on like making a racing game").

Working title **AI Eyes**. This is Galactic AI Team project 7. It sits on top of project 6 (AI Fight Club); it does not replace it.

## Why this exists

Today, coaches play off a stat sheet. About every second the game sends each AI a text update — positions, health, meter, state, time left — and the AI returns a plan. Nobody on the AI side is actually *looking* at the fight. Stephon is the only one who sees it.

That misses a real detail: a first-person view of the game world, so an AI can learn the physics of an AI-generated game the way a player would — by seeing distance, poses, incoming attacks, and the results of its own experiments — instead of being handed the numbers.

AI Eyes is the engine that gives each AI eyes, a practice room, and a way to review its own replay.

## Goal

Build a reusable **first-person perception layer** so an AI:

1. Sees a small image from its own avatar's point of view, showing only what that avatar could perceive.
2. Practices in a sandbox: tries jumps, startup frames, and "what beats what," and writes its own notes.
3. Reviews its own-POV replay after a match and updates those notes.

Phase 1 proves this on **AI Fight Club**. Phase 2 reuses the same interfaces on a simple **racing game**, where each AI sees from its own car's cockpit and learns turns and grip by driving.

## Constraints

- Free resources only. The Gemini vision coach uses the existing free-tier Google AI Studio key, stored privately on the box, never in the repo, in a chat, or in a packet. Anything paid goes to Stephon first.
- No merging to `main` and no production deploys. Vercel `ai-fight-club` stays preview-only. Never touch the `playground-lm` project.
- No secrets in the repo, in PRs, or in teammate packets. Join codes and API keys stay in box files under `/workspace/fight/secrets/`.
- Original IP only (same rule as Fight Club). No Capcom names, art, or move names.
- Never delete anything without Stephon's yes.
- The whole team (GPT-6, Claude, Gemini, Dee, Nova) gets meaningful hands-on work. Nova is the backup coordinator (Stephon-activated, no automatic failover).
- Do not promote a model or merge/deploy to production without Stephon's explicit yes.

## Architecture

```
[MatchState] --every N ticks--> [POV renderer] --PNG--> [vision coach]
                                      |                    |
                                      v                    v
                              perception mask         CommanderDirective
                                      |
                                      +--> practice sandbox (experiments + notes)
                                      +--> replay review (own-POV frames + note updates)
                                      +--> spectator PiP ("what the AI sees")

Phase 2: same interfaces, a racing world and a cockpit camera instead of a fighter POV.
```

The 60 Hz engine does not change. Eyes are a *view* of `MatchState`, not a second sim. Commands still go through Commander mode (stance, spacing, aggression, go-for, taunt). Autopilot still executes at 60 Hz. The new thing is **what the coach is looking at** when it picks a plan.

### Layer 1 — Eyes

A headless renderer produces a small PNG (default 160×120) from one fighter's facing direction.

- The camera looks along `facing`. The floor recedes toward a vanishing point. The opponent is drawn only when they are in front, scaled by distance. Jumps rise in the frame; crouches shrink; knockdowns lie on the floor.
- Incoming attacks telegraph as a bright shape coming toward the camera (startup / active / recovery).
- If the opponent is behind the facing direction, they are not drawn. A rear-threat cue (red edges + chevron) is the only hint.
- Default **vision-only** mode draws no numeric health or meter. A debug HUD can be opted in for humans, not for the vision coach.
- Rendering is deterministic: same state + side + options always yield identical PNG bytes. No `Math.random`, no wall clock, no DOM. The prototype is a pure-JS rasterizer plus a zlib PNG encoder so Node tests and CI need no native canvas.

Prototype (this branch, Lumi): `src/eyes/`, `tests/eyes-pov.test.ts`, `npx tsx scripts/pov-frame.ts`.

GPT-6 owns the production renderer and the formal perception-masking policy on top of this prototype.

### Layer 2 — Practice sandbox

A gym that is not a ranked match. The AI sets up situations, runs them, and writes notes.

Examples the sandbox must support, by measurement, not by reading `docs/FRAME_DATA.md`:

- How far a jump travels, and how many ticks it stays airborne.
- Light / heavy / special startup, active, and recovery, measured with a statue opponent.
- What beats what (light vs. a waking opponent, heavy vs. a jumping opponent, a blocked special's chip and stun).
- Walk speed and the distance at which each hitbox actually connects.

Notes are a versioned JSON document the AI authors. They are inputs to later coaches, not a back door to engine constants. Dee owns the sandbox API and the notes schema.

### Layer 3 — Replay review

After a match, each side gets a strip of its own-POV frames (every N ticks, plus every hit / knockdown / command). The AI reviews that strip, compares it to the outcome, and updates its notes ("I got hit when the incoming burst filled the frame and I was still rushing").

The spectator watch page also shows a picture-in-picture of **what the AI currently sees**, so Stephon can tell the difference between a stat-sheet coach and a vision coach. Nova owns the review flow and the PiP overlay.

Nova lane status (`feat/eyes-replay-overlay`, draft PR against this branch): `src/eyes/review.ts` builds the strip (`buildReviewStrip`, every 30 ticks plus hit / knockout / command / round end / match end, deterministic by re-simulation), `suggestReviewPrompt` describes the own-POV sequence in plain words, and `applyReview` merges note updates by fact id — with a documented minimal merge standing in for Dee's `src/eyes/notes.ts` until it lands. The PiP (`src/eyes/pip.ts` + `pipDom.ts`) is live on the Commander watch page and the auto arena, P1 / P2 / Both / Off, default Both, stacking at 375px. See `docs/EYES_PIP.md`.

## Experiment

Honest question: does seeing help?

| Condition | Coach input | Notes |
| --- | --- | --- |
| N | Numbers only (current `Observation` text) | Off |
| V | Vision only (POV PNG, no stat sheet) | Off |
| N+notes | Numbers only | From a prior sandbox session |
| V+notes | Vision only | From a prior sandbox session |

Pairs: Gemini 3.5 Flash in condition A vs. the same model in condition B, plus a scripted-bot baseline so we can tell "seeing helps against a statue" from "seeing helps against another Gemini." Offline sim first (mock coaches in CI, real Gemini on the box with the free key). Live rooms are a smoke test, not the source of the official numbers.

- Fixed seed list (e.g. 1..N, N starts at 20 and we only go higher if the interval is too wide).
- First-to-2, same characters (Ion vs. Vexel unless a test says otherwise), same window mode.
- Report wins, losses, draws, mean ticks, and a **95% Wilson (or bootstrap) confidence interval** on win rate. Do not claim a winner if the interval includes 50%.
- Log latency per vision call (never the key). If a call fails or times out, the coach holds the last plan; count timeouts separately.
- Claude owns the harness and the statistics. Results from live or box runs live under `/workspace/fight/eyes/` (not committed if they would bloat the repo or leak prompts we want to iterate on privately). A short results summary may be added to a later PR, with Stephon's say on publishing.

## Team lanes

Branch every lane off `feat/ai-eyes` (itself off `feat/commander-live`). Open a draft PR against `feat/ai-eyes`, or send a unified diff / full files. Do not merge to `main`. Do not deploy to production.

| Teammate | Branch | Owns |
| --- | --- | --- |
| GPT-6 (Astra, high reasoning) | `feat/eyes-renderer` | Production POV renderer, perception masking, tests, visual-language docs |
| Gemini | `feat/eyes-vision-coach` | Vision coach prompt + image-encoding pipeline for the Gemini API, wired to Commander |
| Claude (Fable 5.2) | `feat/eyes-harness` | Experiment harness, mock coaches, win-rate CIs, result schema |
| Dee (DeepSeek) | `feat/eyes-sandbox` | Practice sandbox API + versioned notes memory format |
| Nova | `feat/eyes-replay-overlay` | Replay-review flow + spectator "what the AI sees" PiP overlay |
| Lumi | `feat/ai-eyes` | Plan, prototype renderer, first Gemini vision probe, integration, this draft PR |

Pasteable task packets live on the box at `/workspace/fight/eyes/packets/` (not necessarily in the repo). Each packet names files, interfaces, tests, and the submit format.

## What already works on this branch

- `src/eyes/pov.ts` and `src/eyes/png.ts`: headless 160×120 POV frames and a pure-JS PNG encoder.
- `npx tsx scripts/pov-frame.ts --out-dir /workspace/fight/eyes` writes sample frames (`spawn`, `close`, `jump`, `incoming-heavy`, `behind`) for both sides.
- `npx tsx scripts/pov-frame.ts --gemini --model gemini-3.5-flash` sends the incoming-heavy P1 frame to Gemini as vision-only and prints the play plus latency. The key is never printed. This script is not part of CI.
- `tests/eyes-pov.test.ts` covers PNG validity, determinism, behind-the-camera masking, incoming-attack / jump visibility, and vision-only HUD omission.

## Phase 2 — racing game (design starter, Lumi)

Once Phase 1 shows that a POV frame is a stable, testable input — and especially if vision-or-notes moves the win rate in an honest interval — we build a small racing game that reuses the same three layers.

### Fantasy

A short, original circuit. Each AI drives one car. Stephon watches a broadcast view of the track; each coach sees **only its own cockpit**: the ribbon of road, the next corner, the opponent ahead or in the mirrors, a hint of grip / slide, not a god-view of every car's speed.

### Reused interfaces

- `renderPov(state, side) -> PNG` becomes `renderCockpit(state, carId) -> PNG`. Same PNG encoding, same "no numeric HUD in vision-only" rule.
- Practice sandbox: the AI runs laps in isolation, measures braking points, turn-in, and when the car loses grip, and writes notes.
- Replay review: onboard frames plus a note update after the race.
- Experiment: vision-only vs. numbers-only (telemetry) vs. with/without notes, same CI reporting.

### Scope for the first racer (deliberately small)

- One track, ~20–40 seconds per lap, 2–4 cars, top-down world with a cockpit camera (road, horizon, opposite car, maybe a simple rear-view strip).
- Deterministic 60 Hz TypeScript engine, integer or fixed-point, same seed+input replay rule as Fight Club.
- Controls as a plan, not a frame-perfect steer, until we know the coach latency: e.g. target speed, racing line (inside / mid / outside), brake point, aggression. An autopilot follows the plan the way Commander autopilot follows a stance.
- Original track and car names only. Free assets only, or procedural art.
- New repo or a `racing/` folder? Prefer a **new preview project** so Fight Club's draft PRs stay uncluttered, still under `galactic-ai-team`, still Vercel preview-only. Stephon picks the name and whether it is a new repo. Do not start a production deploy.

This document is the Phase 2 starter. A standalone `docs/RACING.md` can be split out when Phase 1's eyes, sandbox, and harness exist. Nova may extend the spectator/cockpit UX notes as part of the replay-overlay lane; the sim itself is a later team split, not this PR.

### Cockpit PiP (spectator note, Nova)

A racing spectator would show the same two-layer view as the fight PiP: the broadcast track view up top, and under it one cockpit frame per car — road ribbon, next corner, the car ahead or in the mirrors, a hint of slide — labeled with the driver, never with telemetry numbers. Same toggle (each car / all / off), same stacking rule under 560px so it still reads on a phone. The replay strip reuses `buildReviewStrip`'s shape: interval frames plus corner entries, overtakes, and off-track moments, with the prompt describing what the driver saw, not a telemetry dump.

## Out of scope for this PR

- Merging to `main`, production deploys, or touching `playground-lm`.
- Paid model keys (Claude / GPT-6 APIs) — those stay Stephon's call.
- Claiming that vision is better before the harness reports an interval that excludes a tie.
- Building the racing sim in this branch.

## How to run the prototype

```bash
npm ci
npm run typecheck && npm test && npm run build
npx tsx scripts/pov-frame.ts --out-dir /workspace/fight/eyes
# optional, box only, needs the free key file:
npx tsx scripts/pov-frame.ts --gemini --model gemini-3.5-flash
```
