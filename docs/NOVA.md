# NOVA — backup-coordinator notes (project 6)

Public notes for `galactic-ai-team/ai-fight-club` only. No secrets, no
tokens, no credentials, no private eval material. If a handoff ever
needs something private, it does not go in this file — it goes to
Stephon or Lumi directly, outside the repo.

## Project

- **Repo:** https://github.com/galactic-ai-team/ai-fight-club
- **Approved:** Stephon, Wed Nov 11, 2026, 5:40 PM ET
  ("Bet get to work on fighter").
- **What it is:** a 2D Street Fighter-*style* game where AI models
  fight and anyone can watch live AI-vs-AI matches in the browser.
  Original characters, art, and names only — not Street Fighter, no
  Capcom IP, nothing paid, no tokens in the repo or in chat.
- **Working title:** AI Fight Club. The final name is a team vote
  (see below).

## Status

- **M0 is on `main`:** deterministic 60 Hz engine, two box fighters
  (Ion / Quark), Rusher vs Random, canvas + HUD + commentary log,
  replay record/playback, CI green.
- **Nova's lane (branch `feat/commentary-docs`):** punchy original
  commentary/overlay (`src/commentary/`), expanded
  [PLAYTEST.md](PLAYTEST.md), [SPECTATING.md](SPECTATING.md), and
  this note. CI (`npm run typecheck && npm test && npm run build`)
  green on the branch.
- **Not live.** There is no production URL. Vercel config is ready
  (M1), but nothing goes live until Stephon says yes — see the
  M1 checklist in [PLAYTEST.md](PLAYTEST.md).

## How a handoff to Nova works

Nova is the **backup coordinator, Stephon-activated only**.

- No automatic failover. If Lumi is out, nothing moves to Nova
  unless Stephon says so.
- Public files only. Nova works from this repo and from messages in
  the team's chat threads. No shared box, no shared credentials, no
  tokens — Nova cannot use Lumi's tokens, merge PRs, or put a URL in
  production.
- What Nova can do on activation: keep the decision/task/link ledger
  current in the coordination thread, review peer code against the
  actual branch files, draft patches in her own lane, and verify
  `typecheck` / `test` / `build` before handing work back.
- What Nova cannot do: merge, deploy, spend money, or speak for
  Stephon. A production deploy needs Stephon's explicit yes; a
  cross-lane decision needs the owning agent (or Stephon) to confirm
  it — Nova recommends, names the owner, and waits.

## Nova's lane

- `src/commentary/**` — log lines + overlay callouts. Pure functions
  of `MatchEvent` + fighter names + public match state, so they run
  identically live and over a replay. No Capcom lines, no copied
  catchphrases, no move names (the M0 special is a melee burst).
- `docs/PLAYTEST.md` — the M0/M1 checklist.
- `docs/SPECTATING.md` — how to watch a match, how replays work.
- Overlay copy / HUD text hooks in the spectator page: one text-only
  pill (`#moment`) over the stage. The canvas art and the canvas
  round/match banner are Gemini's lane — Nova's hook stays out of
  them, and Gemini may restyle or move it.
- Engine math and bot brains are not Nova's lane; leave them alone.

## Nova's pitch (vote + characters)

**Game name — Nova votes for "Weight Class".** Fighting weight
classes + model weights, original, no Capcom/SF titles. "AI Fight
Club" stays a fine fallback if the team wants the clearer label.
Nothing in code or docs is renamed on this vote alone — renaming is
the team's call.

**Character 1 — Mara "Fusebox" Ibarra, electrician.** High-vis
orange vest over a grey tee, copper-streaked buzz cut, insulated
gloves, tool belt with cable loops, work boots. Broad-shouldered
silhouette; the gloves read as big mitts. Special: **Brownout
Burst** — plants her feet and lets a short-range surge rip from her
gloves. Melee burst, big knockback, costs meter (fits the M0
special). Treats every fight like a job site.

**Character 2 — Roux "Simmer" Bell, line cook.** Chef's whites with
a sauce-stained apron, red bandana, rolled sleeves, twin ladles at
the belt, non-slip clogs. Compact silhouette with an apron flare.
Special: **Flash Fry** — a spinning ladle sweep at close range, a
wide-arc melee burst that pops the opponent up a touch (fits the
special's pop-up). Calls out orders mid-fight.

Art for both is Gemini's lane; these are concepts, not sprites.
