# Lane: Nova — commentary / overlay, docs, playtest checklist, backup coordination

Repo: https://github.com/galactic-ai-team/ai-fight-club
Branch: `feat/commentary-docs` (from latest `main`)
Plan: [docs/PLAN.md](../PLAN.md) · Starter checklist: [docs/PLAYTEST.md](../PLAYTEST.md)
M0 already on `main`: a short event-to-line mapper in `src/commentary/index.ts` and a starter playtest list.

Approved: Stephon, Wed Nov 11, 2026, 5:40 PM ET. Free only. No tokens in the repo or in chat. Original IP only.

You are the **backup coordinator** when Stephon activates you (no automatic failover, no shared box, no shared credentials). This project is public: you can read the repo and draft patches in Muse. You cannot use Lumi's tokens, merge PRs, or put a URL in production without Stephon.

## Goal

Make watching a fight feel like a fight: punchy commentary and a clear overlay, plus docs and a playtest checklist that Stephon or any teammate can run before we claim M1 is done. Also keep a short, current backup-coordinator snapshot for project 6.

## Files you own

- `src/commentary/**`
- Overlay copy / HUD text hooks in the spectator page if Gemini agrees (coordinate; do not overwrite their art)
- `docs/PLAYTEST.md` (expand the starter)
- `docs/SPECTATING.md` (how to watch a match, how to load a replay — create this)
- Optional: `docs/NOVA.md` (public backup-coordinator notes for this repo only; no secrets, no private eval material)
- README polish is welcome if you keep the IP and "free only" rules obvious

Leave engine math and bot brains alone.

## Interface contract

- Commentary is a pure function of `MatchEvent` (+ fighter display names) so it can run in the live loop and over a replay.
- Cover at least: hit, blocked hit, KO, timeout, round end, match end. Color / come-back / "almost" lines are welcome if they are driven by events or public state, not by hidden randomness.
- No Capcom announcer lines, no trademark catchphrases, no copied move names.
- Docs must not include tokens, private URLs with credentials, or PlaygroundLM private-suite item text. Totals already public in other docs may be referred to at a high level only if needed; this repo does not need them.
- Playtest checklist must include a 375px-wide check, a "no Capcom IP on screen" check, and a "Stephon said yes before production deploy" check.

## Acceptance tests

- [ ] `npm run typecheck && npm test && npm run build` green.
- [ ] Unit tests for each required event type (`tests/commentary.test.ts` expanded).
- [ ] `docs/PLAYTEST.md` is a complete M0 and M1 checklist someone can tick without asking you.
- [ ] `docs/SPECTATING.md` tells a new reader how to run a local match and how a replay file works.
- [ ] No secrets in any doc you touch.
- [ ] A short backup-coordinator blurb for project 6: repo URL, M0 status, "not live until Stephon says yes," how you would take a handoff (public files only).

## How to submit

PR against `main` from `feat/commentary-docs`, or a patch / zip / Muse file-download of the changed files that applies on `main`. CI green is the review check. Lumi reviews and attributes the commit. If Muse cannot open a PR, send the files and Lumi will apply them with your name on the commit.

## Also pitch (required, short)

1. A vote for the game name (keep "AI Fight Club", pick another original name, or propose your own — no Capcom/SF titles).
2. Two original character concepts: name, look, and one special-move idea (original names only).
