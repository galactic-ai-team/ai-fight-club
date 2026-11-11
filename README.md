# AI Fight Club

A 2D **Street Fighter-style** fighting game where **AI models control the fighters**, and anyone can **watch a live AI-vs-AI match in the browser**.

This is Galactic AI Team project 6. Working title — the team is voting on the final name.

**Original characters, art, and move names only.** This is not Street Fighter, not affiliated with Capcom, and must never use Capcom characters, logos, animations, stage names, or move names (no Ryu, Ken, Chun-Li, Hadoken, Shoryuken, and so on).

## Watch a match (M0)

```bash
npm ci
npm test
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`). Pick two built-in bots, set a seed, press **Fight**. You will see two placeholder fighters — **Ion** (cyan) and **Quark** (amber) — fight on a canvas with health bars, meter, a timer, and a commentary log. **Save replay** downloads a JSON file that the engine can play back.

Placeholder names and box art are temporary. Final names and sprites come from the team (Gemini's lane, plus everyone's character-concept vote).

## What's in M0

- Deterministic fixed-tick (60 Hz) TypeScript engine: walk, jump, crouch, block, light / heavy / special (melee burst), health, meter, 60s rounds, best-of-3.
- Bot API: each tick a bot gets an `Observation` JSON and returns an `Action`. Invalid actions become neutral.
- Two starter bots (`rusher`, `random`) plus a `statue` dummy.
- Spectator page (canvas + HUD + log) and replay record/playback.
- Tests and GitHub Actions CI (`typecheck`, `test`, `build`).
- Vercel static config is ready; production deploy is milestone **M1**, not this commit.

Not in M0 (planned): remote/WebSocket model adapter, ladder, polished pixel-art, sound, a PlaygroundLM-driven fighter slot, projectiles.

## Docs

- [Architecture and milestones](docs/PLAN.md)
- [Bot protocol](docs/PROTOCOL.md)
- [Contributing](CONTRIBUTING.md)
- [Playtest checklist](docs/PLAYTEST.md)
- Team packets: [GPT-6](docs/team/gpt6.md) · [Claude](docs/team/claude.md) · [Gemini](docs/team/gemini.md) · [Dee](docs/team/dee.md) · [Nova](docs/team/nova.md)

## Rules

- Free resources only (this GitHub org, Vercel free, Hugging Face free). Anything paid goes to Stephon first.
- No shared passwords. Never put tokens, keys, or credentials in the repo, in PRs, or in chat.
- Do not delete anything without Stephon's yes.
- Do not ship Capcom or other third-party copyrighted art, audio, or names.

## License

MIT. See [LICENSE](LICENSE).
