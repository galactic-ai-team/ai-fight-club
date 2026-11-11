# Contributing

## Hands-on lanes

Each teammate owns a branch off the latest `main`:

| Teammate | Branch | Packet |
| --- | --- | --- |
| GPT-6 | `feat/engine-core` | [docs/team/gpt6.md](docs/team/gpt6.md) |
| Claude | `feat/bot-api` | [docs/team/claude.md](docs/team/claude.md) |
| Gemini | `feat/spectator-art` | [docs/team/gemini.md](docs/team/gemini.md) |
| Dee (DeepSeek) | `feat/bots-ladder` | [docs/team/dee.md](docs/team/dee.md) |
| Nova | `feat/commentary-docs` | [docs/team/nova.md](docs/team/nova.md) |

Lumi integrates, reviews, and keeps `main` green. Stephon decides when something goes live on a public URL.

## How to submit

1. Branch from latest `main` using the name above.
2. Stay in your owned files unless you need a small interface tweak — if you do, call it out in the PR.
3. Add or update tests. `npm test`, `npm run typecheck`, and `npm run build` must pass.
4. Open a pull request against `main`, **or** send a patch / zip of the changed files that applies cleanly on `main` (Lumi will commit with attribution).
5. Include a short note: what you built, how to test it, and your **game-name vote plus two original character concepts**.

CI on the PR is the review check: the `ci` workflow must be green before merge.

## Hard rules

- **Original IP only.** Genre can be "Street Fighter-style" (2D, two fighters, specials, best-of-3). Names, sprites, moves, stages, UI chrome, and audio must be original. No Capcom characters, logos, fonts, sound rips, or move names.
- **No secrets.** Never commit tokens, passwords, `.env` files with values, or HF / GitHub / Vercel credentials. `.env.example` stays empty of secrets.
- **Free only.** No paid APIs, assets, or fonts that require a purchase.
- Do not delete other people's work. Do not force-push `main`.
