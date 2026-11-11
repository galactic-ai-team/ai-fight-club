# AI Fight Club — plan

Approved by Stephon on Wed Nov 11, 2026, 5:40 PM ET ("Bet get to work on fighter"), as AI Playground project 6.

Working title **AI Fight Club**. Final name is a team vote (see packets). Genre is 2D, two fighters, Street Fighter-**style** rules. **Original characters, art, names, and audio only** — not affiliated with Street Fighter or Capcom.

## Goal

People plug in AI models as fighters. Stephon (and later anyone) can **watch a live AI-vs-AI match in a browser**. Matches are deterministic, replayable, and fair: the same seed and the same action stream always produce the same result.

## Constraints

- Free resources only: GitHub org `galactic-ai-team`, Vercel free, Hugging Face free. Anything paid goes to Stephon first.
- No shared passwords. Never put tokens or credentials in the repo, in PRs, or in chat.
- Never delete anything without Stephon's yes.
- The whole team (GPT-6, Claude, Gemini, Dee, Nova) gets real hands-on work in every phase. Nova is the backup coordinator (Stephon-activated, no automatic failover).
- Optional later: a PlaygroundLM-driven fighter behind the same bot API. Do not block M1 on it.

## Architecture

```
[Bot A] --Action--> [60 Hz TypeScript engine] <--Action-- [Bot B]
                         |        |
                         |     events
                         v        v
                   MatchState   commentary
                         |
                         +--> canvas spectator (browser)
                         +--> replay JSON
```

### Engine

- Language: TypeScript. One sim runs in Node (tests, ladder) and in the browser (spectator).
- Fixed tick **60 Hz**. Wall-clock time is only used to decide how many ticks to step. The sim itself never reads `Date.now()`.
- Integer pixel coordinates, y downward, custom xorshift32 if we need a stream. Canonical JSON snapshot + FNV-1a hash for equality checks.
- Fighters have a hurtbox and, during an attack's active frames, a hitbox. Health 1000, meter 100. Block / crouch / jump. Attacks: light, heavy, special (M0 special is a melee burst; projectiles are a later engine extension).
- Round timer (M0: 60 seconds), best-of-3 (first to 2). Timeout awards the higher health; a draw awards no win and the match continues (up to 5 rounds, then a finish by score / health).
- Source today: `src/engine/`. GPT-6 owns hardening this into the M1 core with a deeper determinism suite.

### Bot API

Each tick the bot is given an `Observation` and must return an `Action`. See [PROTOCOL.md](PROTOCOL.md).

- **In-browser JS bots** implement `Bot.act` synchronously.
- **External models** (M2): HTTP and/or WebSocket adapter, same JSON, timeout + hold-last-action, optional slower decision rate, sandbox for untrusted JS (Web Worker). Claude owns this.
- Untrusted bot code must not touch the page, network, or credentials.

### Spectator

A static Vite page: canvas stage, health / meter / timer / round dots, commentary log, bot pickers, seed, pause, replay download. Gemini owns visual polish and original pixel-art characters. Nova owns commentary copy and the playtest checklist.

M0 art is two colored boxes (placeholder names Ion and Quark). That is intentional and temporary.

### Replays and ladder

Every official match records inputs. `playback` must match the live canonical state. Dee owns starter AI brains beyond the M0 rusher/random, plus matchmaking / an Elo or Glicko ladder over a seeded tournament.

### Live leaderboard (added by Stephon, Nov 11, 2026, 6:08 PM ET)

A **live leaderboard** viewable in the browser that **updates after every match**. Rankings show at least: rank, fighter / bot name, **Elo rating** (rating change from the last match), **wins / losses** (draws if any), and current **win / loss streak**. Updates are pure functions over the match list (`applyResult(table, result) -> table`), so the same matches in the same order always give the same table, and replays can rebuild it.

- Dee: rating + standings logic (`src/ladder/`), the `Leaderboard` data model (JSON, versioned), and a leaderboard page / panel hook that refreshes when a match ends.
- Gemini: leaderboard visuals — table / cards on the spectator page (or `/leaderboard`), rank-change arrows, streak badges, last-match delta, and a 375px-wide mobile layout.
- M1: leaderboard is in-browser (persisted in `localStorage`, plus a "run N seeded matches" button so it fills up while you watch). M2: optional shared leaderboard on a free backend, no paid services, no secrets in the repo.

### Hosting

Static site on Vercel free. No server is required for M1 (two in-browser bots + spectator). M2 may add a tiny serverless WebSocket or a "you host your own bot" model so we stay on the free plan. Hugging Face can host model weights later if a team bot needs them (free, no secrets in this repo).

## Milestones

### M0 — skeleton (this commit)

Engine stub + canvas page showing two boxes fighting with built-in bots, tests green, CI configured, team packets written. Local `npm run dev` is enough to watch a fight. **Not yet deployed.**

### M1 — watchable demo, deployed

- Engine complete enough for a fair 60 Hz fight (GPT-6), with determinism tests that would catch a desync.
- Two (or more) scripted / utility bots that play distinctly (Dee).
- Spectator you can actually show people: HUD, original placeholder-or-better art, commentary (Gemini + Nova).
- Deployed on Vercel free at a public URL. Stephon gets that URL only after a playtest pass (Nova checklist) and his go-ahead to put it on a production domain.

### M2 — external bots + ladder

- HTTP / WebSocket adapter + Worker sandbox + protocol tests (Claude).
- Ladder / seeded tournament + replay archive (Dee).
- Live leaderboard (Elo, W/L, streaks) updated after each match, viewable in the browser (Dee logic + Gemini visuals; in-browser version may land in M1).
- Optional PlaygroundLM fighter slot behind the adapter (does not block the adapter itself).

### M3 — polish

- Original pixel-art characters, stage, animations, and sound (Gemini lead; team concepts).
- Tighter feel: projectiles or unique specials, more commentary color, mobile layout, shareable replay links.

## Team lanes (M0 → M1)

| Teammate | Branch | Owns |
| --- | --- | --- |
| GPT-6 | `feat/engine-core` | Engine core, frame data, determinism tests |
| Claude | `feat/bot-api` | Protocol, sandbox, remote adapter, protocol test suite |
| Gemini | `feat/spectator-art` | Spectator renderer / UI, original pixel-art characters, leaderboard visuals |
| Dee | `feat/bots-ladder` | Starter AI bots, matchmaking / ladder, live leaderboard data + page |
| Nova | `feat/commentary-docs` | Commentary / overlay, docs, playtest checklist, backup coordination |

Every teammate also pitches a **game name** and **two original character concepts** (name, look, one special-move idea — original only).

## Out of scope for now

Human-vs-human rollback netcode, paid asset stores, Capcom IP, shipping a promotion to a custom domain without Stephon.
