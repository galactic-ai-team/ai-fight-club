import { STAGE_HEIGHT, STAGE_WIDTH } from "../engine/constants.ts";
import type { MatchState } from "../engine/types.ts";
import { renderPixelMatch } from "../spectator/engineBridge.ts";

export function resizeCanvas(canvas: HTMLCanvasElement): void {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = STAGE_WIDTH * dpr;
  canvas.height = STAGE_HEIGHT * dpr;
  canvas.style.width = "100%";
  canvas.style.maxWidth = `${STAGE_WIDTH}px`;
  canvas.style.height = "auto";
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function renderMatch(ctx: CanvasRenderingContext2D, state: MatchState): void {
  // Logical 960×540 space (the dpr transform is applied in resizeCanvas).
  renderPixelMatch(ctx, state);
  drawBanner(ctx, state);
}

function drawBanner(ctx: CanvasRenderingContext2D, state: MatchState): void {
  if (state.phase === "fight") return;
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(0, 200, STAGE_WIDTH, 80);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 28px ui-monospace, monospace";
  ctx.textAlign = "center";
  if (state.phase === "round_end") {
    const w = state.round.winner;
    const text =
      w === "draw"
        ? "ROUND DRAW"
        : w === "p1"
          ? `${state.p1.character} WINS ROUND`
          : `${state.p2.character} WINS ROUND`;
    ctx.fillText(text, STAGE_WIDTH / 2, 250);
  } else if (state.matchWinner) {
    const name = state.matchWinner === "p1" ? state.p1.character : state.p2.character;
    ctx.fillText(`${name} WINS`, STAGE_WIDTH / 2, 250);
  }
}
