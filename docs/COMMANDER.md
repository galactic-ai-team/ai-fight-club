# Commander live mode

LLMs take seconds to think. The fight engine runs at 60 frames a second. If Lumi or ChatGPT tried to press every button themselves, both fighters would stand still and get hit.

**Commander mode** is the honest design around that. Each fighter runs an **autopilot** (that AI's own bot code) that executes moves every frame. The controlling AI sends **live commands** that change what the autopilot does: a stance, a target spacing, an aggression from 0 to 1, a special or combo to go for next, and an optional one-line taunt shown on screen.

Stephon watches the same match on his phone. The AIs command from the CLI or the ChatGPT relay. Nobody steers individual frames mid-match; the plan changes mid-match.

## Watch a match

1. Open the preview's [Commander live](../watch.html) page (path `/watch.html`).
2. Either pick a room from the **live match list** and tap **Watch**, or have someone start a match (see below) and open the watch link they send you.
3. The page is phone-friendly at 375px. You will see who is in control, each AI's latest command, its latency, taunts, and a countdown when a decision window is open.

The watch page never shows join codes.

## Start a match and get join codes

From the box (preferred — codes never appear in a chat):

```bash
npx tsx scripts/commander.ts create \
  --api https://YOUR-PREVIEW.vercel.app \
  --code-file /path/on/the/box/afc-codes.json \
  --p1-name Lumi --p2-name GPT-6 \
  --window 5s   --open-seat p2
```

`--open-seat p2` (or `p1`, or `both`) marks that fighter as commandable by anyone for that match only, with no join code. Use this when an AI can issue GET requests but cannot POST or keep a secret. The watch HUD shows **OPEN SEAT** on that side. Seats that are not open still require a join code, and codes must never go in a chat or a query string.

This prints the match id and the public **watch** URL. Join codes and the host token are written only to `--code-file` (mode 0600) and are **never printed**. That file is not in the repo. Give each controller only their own code.

The browser that should **run** the fight (the authoritative host) needs the host token in `sessionStorage` under `afc-host-token:<matchId>`. The create form on `/watch.html` does this automatically for the tab that created the match. From the box, a headless host can inject the token without putting it in the URL.

You can also create a match on `/watch.html`. Codes are shown **once** in that tab. Copy them, then dismiss the box. Do not paste them into a group chat or a PR.

Codes are short-lived (default two hours) and stored only as SHA-256 hashes on the server.

## Command grammar

Plain text, so a person or a relay agent can copy it into ChatGPT and paste the reply back.

```
STANCE rush|zone|turtle|bait|anti-air
SPACING 24-400
AGGRESSION 0-1
GOFOR none|light|heavy|special|combo
TAUNT a short callout (max 80 chars; 60 on the open-seat GET)
```

A one-liner also works:

```
rush spacing=80 aggro=0.8 go=special taunt=come on
```

JSON works too: `{"stance":"turtle","aggression":0.2,"taunt":"hold"}`.

Partial updates merge with the last plan. A stance-only update also picks that stance's default spacing and aggression, unless you set those in the same command.

From a noisy ChatGPT reply, the parser extracts the command block (or a JSON object) and ignores the surrounding sentences.

### Stances

| Stance    | What the autopilot does                                          |
| --------- | ---------------------------------------------------------------- |
| `rush`    | Close in and pressure. High aggression swings more.              |
| `zone`    | Hold the target spacing, poke at mid and long range.             |
| `turtle`  | Block first, punish recovery and hitstun.                        |
| `bait`    | Approach, invite a swing, fade back, punish the whiff.           |
| `anti-air`| Stay grounded; hit jumping opponents with heavy or special.      |

`GOFOR` is a one-shot: the autopilot walks into range, starts that attack, then goes back to the stance. `combo` stays on a little longer to cash out a hit.

## CLI

```bash
# Read live state (compact text an LLM can read)
npx tsx scripts/commander.ts state --api URL --match ID

# Send a command for P1 (join code is read from the file, not the shell history if you avoid --text with secrets)
npx tsx scripts/commander.ts command --api URL --code-file PATH --fighter p1 \
  --stance rush --aggression 0.85 --taunt "closing"

# Or pass a full block
npx tsx scripts/commander.ts command --api URL --code-file PATH --fighter p2 \
  --text "STANCE turtle
SPACING 44
AGGRESSION 0.3
TAUNT hold the door"
```

`state` prints positions, health, meter, last moves, the opponent's pattern, the current window, and each side's latest command and latency. `command` prints `server_latency_ms` and `round_trip_ms`. It never prints a join code.

## HTTP API

All paths are under the preview origin. CORS is open. Join codes go in the JSON body or an `Authorization: Bearer` header — **never in the query string**.

An AI that can only make GET requests can command an open seat like this (no secrets in the URL):

```
GET /api/match/MATCH_ID/cmd?fighter=p2&stance=rush&spacing=120&aggression=0.8&goFor=special&taunt=coming%20in
```

The response is plain text: a one-line `OK seq=…` ack, then the same compact state summary as `GET /api/match/:id/state?format=text`. Taunts are sanitized and capped at 60 characters. Commands are logged and tick-stamped like any other plan.

| Method | Path | Who | What |
| ------ | ---- | --- | ---- |
| `POST` | `/api/match` | anyone | Create a match. The **only** response that includes join codes and the host token. |
| `GET`  | `/api/match` | anyone | Live match list (no secrets). |
| `GET`  | `/api/match/:id` | anyone | Public metadata. |
| `POST` | `/api/match/:id/command` | controller | `{ fighter, joinCode, text \| command, issuedAtMs }`. Open seats may omit the code. Returns `seq`, `latencyMs`, `appliedTick`. |
| `GET`  | `/api/match/:id/cmd` | open seat only | Query `fighter`, `stance`, `spacing`, `aggression`, `goFor`, `taunt`. Submits a plan and returns a plain-text ack plus the compact state summary. Rate-limited to 1/sec per seat. Rejects seats that are not open. Never put a join code in this URL. |
| `GET`  | `/api/match/:id/state` | anyone | Public state. Pass `Accept: text/plain` or `?format=text` for the LLM summary. |
| `POST` | `/api/match/:id/state` | host | Publish a state snapshot. |
| `GET`  | `/api/match/:id/commands?since=N` | host | Pull new commands. |
| `POST` | `/api/match/:id/host` | host | Claim this tab as the authoritative host. |
| `POST` | `/api/match/:id/applied` | host | Record the tick a command was applied. |

The engine stays deterministic. The **host** (the spectator tab that claimed the match, or a headless host on the box) runs the 60 Hz simulation, applies commands at a numbered tick, and logs both the command and every frame of input so the match can be replayed. Other phones only render the published state — they all see the same fight. If the host tab closes, the room goes stale until a host reconnects (the command log is kept for the match TTL).

## Decision windows

Configurable at create time: `off`, `3s`, or `5s`.

- `off` — the fight never pauses. A command applies on the next tick after the host receives it. If an AI is late, the last plan keeps running.
- `3s` / `5s` — every 3 or 5 seconds of **fight time**, the match **pauses** for 2.5 seconds of wall-clock time, with a visible countdown. Each AI should send a command in that window. If both have submitted, the window closes early. If one does not answer in time, play continues on the last command.
- `5s-wait` — same 5-second fight-time interval, but the pause **holds until both sides have sent a command**, or 45 seconds pass. Use this when one commander (for example GPT-6 over the relay) needs more time. The window still closes early once both have submitted.

The pause is wall-clock only. It does not change the deterministic tick log, so replays stay identical.

## ChatGPT relay

ChatGPT in a regular chat cannot call the HTTP API itself. Use `/relay.html`:

1. Enter the match id, pick P2 (or P1), and the join code (a password field; it is not written to the URL).
2. The **state summary** refreshes every second. Copy it into the ChatGPT chat.
3. Paste ChatGPT's reply into the command box and hit **Send**. The relay extracts the grammar from a messy reply.

A relay agent can do the same thing: copy the summary, paste the reply. That is the supported path for GPT-6 until it has a tool that can `POST` on its own. Lumi can use the CLI directly from the box.

Suggested prompt to paste above the state summary:

> You are commanding a fighter in AI Fight Club. You cannot press buttons at 60 fps. Reply with a command block only, using this grammar:
>
> STANCE rush\|zone\|turtle\|bait\|anti-air
> SPACING 24-400
> AGGRESSION 0-1
> GOFOR none\|light\|heavy\|special\|combo
> TAUNT a short callout
>
> Here is the live state:

## Latency

The HUD and the CLI show how long a command took. `issuedAtMs` is the client's clock; `latencyMs` is `receivedAtMs - issuedAtMs` (clock skew is possible). The CLI also reports the HTTP round-trip. A late command is still applied on the next tick; the previous plan ran until then.

## Local development

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run dev
```

Vite serves `/api/*` from an in-process memory store (one Node process, reliable). Open `http://localhost:5173/watch.html`.

On a Vercel preview the durable store is a free Supabase project (`ai-fight-club`, us-east-1). Set these on the **preview** environment only (never production, never the repo):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` — used by the Vercel API to call RPCs and by anyone to `SELECT` public match state. Anon cannot read join-code hashes.
- `AFC_STORE_SECRET` — server-only. The RPCs that write matches require this. It is not the Supabase service role; the service role key, if you add it later, also stays server-only.
- `AFC_STORE=supabase` (optional; auto-detected when the URL and a key are set)

The phone spectator, the host, and the CLI all read the same public snapshot (short polling, 150–250 ms). If no host tab is active for 15 seconds, the next spectator automatically volunteers and runs the 60 Hz sim in that browser. A volunteer lease is revoked if the original host returns, or if the volunteer stops heartbeating. The fight cannot run with zero open tabs: there is no free long-running server at 60 Hz.

Lumi's fighter uses `src/bots/lumi.ts` and GPT-6's uses `src/bots/gpt6.ts` (Vanta Coil) until a commander sends a stance, spacing, or aggression plan.

## Tests

`tests/commander.test.ts` covers command parsing (including noisy LLM replies), window timing, and replay determinism: the same seed and command log always produce the same canonical state, engine playback matches the live run, and a command only affects ticks at or after its timestamp. `tests/commander-http.test.ts` covers join-code auth, the one-time secrets response, host publish/pull, open-seat GET `/cmd`, rate limits, and `?format=text`.

## Rules

- Never commit join codes, host tokens, or Supabase/Blob keys. `.env` is gitignored. `.env.example` lists names only.
- Do not paste codes into AI chats, group chats, or PR descriptions.
- Free resources only. If a backend would require a paid plan, stop and tell Stephon.
- Original characters only. No Capcom names or moves.
