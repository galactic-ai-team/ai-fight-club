# Lane: Claude — bot API / protocol + sandboxing + test suite

Repo: https://github.com/galactic-ai-team/ai-fight-club
Branch: `feat/bot-api` (from latest `main`)
Plan: [docs/PLAN.md](../PLAN.md) · Protocol: [docs/PROTOCOL.md](../PROTOCOL.md)
M0 already on `main`: `src/protocol/index.ts` (schemas + `REMOTE_POLICY`), `normalizeAction`, `observe`, in-process `Bot` type.

Approved: Stephon, Wed Nov 11, 2026, 5:40 PM ET. Free only. No tokens in the repo or in chat. Original IP only.

## Goal

Make the bot contract boringly solid, then add the path for **external** AI models to play: a documented JSON protocol, validation, a sandbox for untrusted in-browser JS bots, and an HTTP / WebSocket adapter stub that holds the last action when a model is slow.

## Files you own

- `src/protocol/**`
- `src/adapter/**` (create this)
- `tests/protocol.test.ts`, `tests/adapter.test.ts` (create these)
- Updates to [docs/PROTOCOL.md](../PROTOCOL.md) when you add fields or policy details

Do not rewrite the engine or the canvas. If the observation needs a new optional field, add it additively and say so.

## Interface contract

Keep protocol id `afc-obs-v0` unless you must break it (then bump and migrate).

- In-process: `Bot.act(obs): Action`, sync.
- Remote: same JSON over HTTP and/or WebSocket. Default policy already sketched: 12 ms timeout at 60 Hz, **hold last legal action** on timeout, **neutral** on invalid, **statue** on disconnect, plus a **decision rate** (act every N ticks) so an LLM can play without answering in 12 ms.
- Adapter must never receive or log secrets. No API keys in example clients. If a user points the adapter at their own model URL, that URL stays in local config, not in the repo.
- Untrusted JS bots run in a Web Worker (or equivalent): no `document`, no `fetch` to random hosts, no access to page storage. Time-box `act`. A thrown error becomes a neutral action.
- Optional: a thin "PlaygroundLM slot" interface (same `Bot`, later filled by a model endpoint). A stub is enough for M2 planning; do not call any paid API and do not embed tokens.

## Acceptance tests

- [ ] `npm run typecheck && npm test && npm run build` green.
- [ ] Schema tests: a real `observe()` payload validates; a missing field / bad enum is rejected.
- [ ] Invalid remote / bot output is coerced to neutral and the match continues.
- [ ] Timeout fixture: if `act` does not return in time, the previous legal action is applied (or neutral on the first tick).
- [ ] Sandbox test: bot code assigned `window` / `document` / network fails closed; the engine still ticks.
- [ ] A short recorded adapter fixture (JSON request/response) is in `tests/fixtures/` and is asserted against.
- [ ] PROTOCOL.md matches the code.

## How to submit

PR against `main` from `feat/bot-api`, or a patch / zip that applies on `main`. CI green is the review check. Lumi reviews and attributes the commit. Short PR notes: how to run a fake remote bot locally, and any protocol additions.

## Also pitch (required, short)

1. A vote for the game name (keep "AI Fight Club", pick another original name, or propose your own — no Capcom/SF titles).
2. Two original character concepts: name, look, and one special-move idea (original names only).
