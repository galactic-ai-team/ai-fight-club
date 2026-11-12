import { getStateText, postCommand } from "./client.ts";
import { parseCommand } from "./parse.ts";

const form = document.querySelector<HTMLFormElement>("#relay-form")!;
const matchInput = document.querySelector<HTMLInputElement>("#r-match")!;
const fighterSel = document.querySelector<HTMLSelectElement>("#r-fighter")!;
const codeInput = document.querySelector<HTMLInputElement>("#r-code")!;
const summary = document.querySelector<HTMLPreElement>("#summary-box")!;
const stateStatus = document.querySelector<HTMLSpanElement>("#state-status")!;
const cmdStatus = document.querySelector<HTMLSpanElement>("#cmd-status")!;
const textArea = document.querySelector<HTMLTextAreaElement>("#r-text")!;
const sendBtn = document.querySelector<HTMLButtonElement>("#send-cmd")!;
const copyBtn = document.querySelector<HTMLButtonElement>("#copy-state")!;

const params = new URLSearchParams(location.search);
if (params.get("m")) matchInput.value = params.get("m") ?? "";
if (params.get("f") === "p1" || params.get("f") === "p2") fighterSel.value = params.get("f") ?? "p2";

let timer: number | null = null;

async function refresh(): Promise<void> {
  const id = matchInput.value.trim();
  if (!id) return;
  try {
    const text = await getStateText(id);
    summary.textContent = text;
    stateStatus.textContent = `updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    stateStatus.textContent = err instanceof Error ? err.message : "state failed";
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (timer !== null) window.clearInterval(timer);
  void refresh();
  timer = window.setInterval(() => void refresh(), 1000);
  stateStatus.textContent = "connected — summary refreshes every second";
});

copyBtn.addEventListener("click", () => {
  void navigator.clipboard.writeText(summary.textContent ?? "").then(() => {
    copyBtn.textContent = "Copied";
    window.setTimeout(() => {
      copyBtn.textContent = "Copy state";
    }, 1200);
  });
});

sendBtn.addEventListener("click", () => {
  void (async () => {
    const id = matchInput.value.trim();
    const code = codeInput.value;
    const fighter = fighterSel.value === "p1" ? "p1" : "p2";
    const text = textArea.value;
    if (!id || !code) {
      cmdStatus.textContent = "connect with a match id and join code first";
      return;
    }
    const parsed = parseCommand(text);
    if (!parsed.ok) {
      cmdStatus.textContent = parsed.error;
      return;
    }
    const t0 = performance.now();
    const r = await postCommand(id, { fighter, joinCode: code, text, issuedAtMs: Date.now() });
    const rtt = performance.now() - t0;
    cmdStatus.textContent =
      `sent seq=${r.seq}  server latency=${r.latencyMs}ms  round-trip=${Math.round(rtt)}ms`;
    void refresh();
  })().catch((err: unknown) => {
    cmdStatus.textContent = err instanceof Error ? err.message : "send failed";
  });
});

if (matchInput.value) {
  void refresh();
}
