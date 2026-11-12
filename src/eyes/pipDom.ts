/**
 * Browser-only PiP helpers (AI Eyes). Kept separate from pip.ts so the
 * pure layout / render logic stays importable from Node tests.
 *
 * The canvases are painted with putImageData from the POV frame's RGBA
 * pixels — no text, no numbers, and no secrets ever drawn into them.
 */

import type { PipMode } from "./pip.ts";
import { pipVisibleSides } from "./pip.ts";
import type { PovFrame } from "./pov.ts";

/** Paint one POV frame onto its canvas. Returns false if there is no 2d context. */
export function paintPovFrame(canvas: HTMLCanvasElement, frame: PovFrame): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  if (canvas.width !== frame.width) canvas.width = frame.width;
  if (canvas.height !== frame.height) canvas.height = frame.height;
  const img = ctx.createImageData(frame.width, frame.height);
  img.data.set(frame.pixels);
  ctx.putImageData(img, 0, 0);
  return true;
}

/**
 * Show/hide the PiP figures and toggle buttons for a mode, scoped to
 * one page section (`root`). Figures carry `data-pip-side="p1|p2"`,
 * captions carry `data-pip-label="p1|p2"`, toggle buttons carry
 * `data-pip-mode="p1|p2|both|off"`.
 */
export function applyPipMode(root: HTMLElement, mode: PipMode): void {
  const visible = new Set(pipVisibleSides(mode));
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-pip-side]"))) {
    const side = el.getAttribute("data-pip-side");
    el.classList.toggle("hidden", side === null || !visible.has(side as "p1" | "p2"));
  }
  for (const btn of Array.from(root.querySelectorAll<HTMLButtonElement>("[data-pip-mode]"))) {
    btn.setAttribute("aria-pressed", String(btn.getAttribute("data-pip-mode") === mode));
  }
  root.classList.toggle("eyes-pip-off", mode === "off");
}

/** Set one PiP caption as plain text (never HTML). */
export function setPipLabel(root: HTMLElement, side: "p1" | "p2", label: string): void {
  const el = root.querySelector<HTMLElement>(`[data-pip-label="${side}"]`);
  if (el) el.textContent = label;
}
