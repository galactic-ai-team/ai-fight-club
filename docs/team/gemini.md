# Lane: Gemini — spectator renderer / UI + original pixel-art characters

Repo: https://github.com/galactic-ai-team/ai-fight-club
Branch: `feat/spectator-art` (from latest `main`)
Plan: [docs/PLAN.md](../PLAN.md)
M0 already on `main`: canvas boxes, a dark arcade HUD, placeholder names **Ion** (cyan) and **Quark** (amber), health / meter / timer / log.

Approved: Stephon, Wed Nov 11, 2026, 5:40 PM ET. Free only. No tokens in the repo or in chat.

## Goal

Make the spectator page something Stephon can actually watch: a readable canvas fight, a clear HUD, and **original** pixel-art (or generated, clearly original) characters. Genre is Street Fighter-**style**. This is **not** Street Fighter.

## Hard IP rule

**No Capcom IP.** No Ryu, Ken, Chun-Li, Guile, Blanka, M. Bison, Hadoken, Shoryuken, Sonic Boom, or lookalike sprites, logos, stage names, fonts ripped from the games, or "just for placeholder" copies. If a generated image comes out looking like a known character, throw it away and make another. List every asset and its license (your original work under the repo MIT license is ideal; other assets must be free and attribution-clean).

Placeholder names Ion / Quark may be kept, renamed, or replaced once the team name-and-character vote lands. Until then, keep them clearly labeled as placeholders if you still use them.

## Files you own

- `src/render/**`, `src/style.css`, `index.html` (visual / HUD parts)
- `public/assets/**` (sprites, stage, icons)
- Optional: `docs/ART.md` (asset list + licenses + how to add a character)

Do not change engine rules or bot protocol except for purely visual hooks (for example, reading `state` / `attackPhase` to pick a frame). If you need a hook, keep it additive.

## Interface contract

- `renderMatch(ctx, state)` still paints one frame from `MatchState`. The main loop stays in `src/main.ts` unless you need a small, documented split (HUD vs stage).
- Animations are driven by engine tick / `stateT` / `attackPhase`, not by wall-clock, so a replay looks the same at 1x or when paused.
- Character art should be swappable by a character id string (M0 uses `"Ion"` / `"Quark"`).
- Mobile: usable at **375px wide**. Health bars, timer, and the Fight button must remain reachable.
- No paid fonts, no paid stock, no external account required to build.

## Acceptance tests

- [ ] `npm run typecheck && npm test && npm run build` green (add a render unit test if you can do it without a real browser; a documented manual check is OK for canvas frames).
- [ ] Two original named fighters, visually distinct, with at least idle / walk / attack / hit / block (crouch / jump if you can).
- [ ] `docs/ART.md` lists every asset and license. Zero Capcom or other copyrighted third-party sprites.
- [ ] HUD still shows health, meter, time, and round wins.
- [ ] 375px-wide layout works (screenshot or a short note in the PR).
- [ ] Build stays static (no secret env vars, no paid CDN).

## How to submit

PR against `main` from `feat/spectator-art`, or a patch / zip that applies on `main`. Include a couple of screenshots (desktop and ~375px). CI green is the review check. Lumi reviews and attributes the commit.

## Also pitch (required, short)

1. A vote for the game name (keep "AI Fight Club", pick another original name, or propose your own — no Capcom/SF titles).
2. Two original character concepts: name, look, and one special-move idea (original names only). If you already drew them, even better.
