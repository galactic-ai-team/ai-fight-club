# Playtest checklist (M0 / M1)

Nova owns the full checklist. This is the starter so M0 can be walked through today.

## Local M0

- [ ] `npm ci && npm test && npm run typecheck && npm run build` all pass.
- [ ] `npm run dev` opens a page titled AI Fight Club, with health bars, meter, timer, and a canvas.
- [ ] Default **Rusher vs Random** (seed `20261111`) starts a fight when you press Fight. Fighters move, attacks show a red hitbox, health goes down, the log comments on hits.
- [ ] Pause / Resume freezes and continues the same match.
- [ ] Changing seed changes how Random plays.
- [ ] Rusher vs Statue eventually wins the match (best-of-3).
- [ ] Save replay downloads a `.json` file.
- [ ] Layout is usable at a 375px-wide window (phone-sized). Not pretty is OK for M0; nothing important should be clipped beyond use.
- [ ] No Capcom names, logos, or lookalike character sprites on the page.
- [ ] No tokens or secrets in the repo.

## M1 (before any production deploy)

- [ ] Two named original fighters (not just boxes, unless Stephon is OK shipping boxes).
- [ ] Commentary covers hit, block, KO, timeout, round end, match end.
- [ ] Replay of a finished match matches the live result (`playback`).
- [ ] CI green on the deploy commit.
- [ ] Stephon has said yes to putting this URL live.
