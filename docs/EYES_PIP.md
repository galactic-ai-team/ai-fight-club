# What the fighters see — spectator PiP + replay review (AI Eyes, Nova lane)

Branch: `feat/eyes-replay-overlay` (off `feat/ai-eyes`). No merge, no
deploy, no secrets anywhere in this lane.

## The picture-in-picture

Under the stage on both the Commander watch page (`watch.html`) and the
auto arena (`index.html`), a **"What the fighters see"** panel shows a
small first-person frame for each fighter — the same 160×120 POV render
the vision coach gets (`src/eyes/pov.ts`), painted live from the current
match state.

- **What it shows:** each fighter's own view — the floor receding, the
  opponent when they are in front (scaled by distance), a jump rising
  in the frame, an incoming attack telegraphing toward the camera, and
  the red rear-threat cue when the opponent is behind them. The label
  reads e.g. "Ion — what they see". It is a coach's-eyes view, not a
  second broadcast camera.
- **What it hides:** no health or meter numbers (vision-only mode), no
  raw observation data, and no join codes or host tokens — the watch
  page only ever receives the public match snapshot, which carries none
  of those, and the PiP renders from that snapshot alone
  (`publicStateToMatchState` in `src/eyes/pip.ts`).
- **Toggle:** P1 / P2 / Both / Off buttons above the frames. Default is
  **Both**. At 375px wide the two frames stack vertically so each stays
  readable; on wider screens they sit side by side. The layout decision
  is pure logic in `pipLayout()` (`tests/eyes-pip.test.ts`), so it is
  covered without a browser.
- **Cost:** the PiP repaints only when the tick or the mode changes —
  the host calls the watch renderer every animation frame, so an
  unthrottled repaint would re-rasterize twice a frame for nothing.

## Replay review

`src/eyes/review.ts` builds a strip of a side's own-POV frames from a
replay (re-simulated, so it is deterministic) or from live match
snapshots:

```ts
import { buildReviewStrip, suggestReviewPrompt, applyReview } from "./src/eyes/review.ts";

const strip = buildReviewStrip(replay, "p1", {
  everyTicks: 30,            // default: one frame every 0.5s
  commandTicks: [120, 240], // frames with reason "command"
  includePng: false,        // true to attach PNG bytes per frame
});
// strip.frames: { tick, side, reason, visibility, png? }
// reason: "interval" | "hit" | "ko" | "command" | "round_end" | "match_end"
// strip.result: { winner, p1Wins, p2Wins, ticks }

const prompt = suggestReviewPrompt(strip); // plain text, visibility only
const notes = applyReview(existingNotes, {
  side: "p1",
  facts: [{ id: "spacing", text: "...", evidenceTick: 120 }],
});
```

- Frames are always included on hit, knockout, command (when command
  ticks are provided), round end, and match end, plus the interval
  samples. One frame per tick at most; when events collide on a tick,
  the highest-priority reason wins
  (match_end > round_end > ko > hit > command > interval).
- `suggestReviewPrompt` describes what the fighter *saw* — distance,
  incoming attacks, behind-threat moments — never a stat sheet, and
  never secrets or borrowed move names.
- `applyReview` merges by fact id: new facts replace same-id facts,
  older facts with different ids are always kept. It is deterministic
  and idempotent.
- **Notes format:** Dee owns `src/eyes/notes.ts` (parseNotes /
  mergeNotes) on the sandbox lane; it is not on this branch yet, so
  `applyReview` uses the documented minimal merge in `mergeReviewNotes`
  (`src/eyes/review.ts`). When notes.ts lands, that one function is the
  swap point — same `(notes, update)` shape, same id-keyed semantics.

## Files

- `src/eyes/review.ts` — review strip, prompt, notes merge.
- `src/eyes/pip.ts` — PiP modes, layout, public-snapshot conversion,
  frame rendering (no DOM, unit-tested).
- `src/eyes/pipDom.ts` — painting a POV frame onto a canvas and
  applying a PiP mode to a page section (browser only).
- `src/eyes/png.ts` — the PNG encoder is now pure JavaScript (stored
  DEFLATE blocks, no `node:zlib`), because the browser bundle imports
  the POV renderer through the PiP. Same API, same determinism;
  `tests/eyes-review.test.ts` inflates a produced PNG to prove the
  stream is valid. `src/eyes/zlib.d.ts` now only types the `inflateSync`
  the test uses.
- `watch.html`, `src/commander/watchMain.ts`, `src/commander/watch.css`
  — watch-page PiP. `index.html`, `src/main.ts`,
  `src/spectator/spectator.css` — same panel on the auto arena.
- `tests/eyes-review.test.ts`, `tests/eyes-pip.test.ts`.

## Checks

```bash
npm run typecheck && npm test && npm run build
```

All green on this branch (171 tests, 18 files).
