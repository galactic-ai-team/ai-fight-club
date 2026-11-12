import {
  DEFAULT_DIRECTIVE,
  GO_FORS,
  MAX_SPACING,
  MAX_TAUNT,
  MIN_SPACING,
  STANCE_DEFAULTS,
  STANCES,
  isGoFor,
  isStance,
  type CommanderDirective,
  type ParseResult,
  type PartialDirective,
  type Stance,
} from "./types.ts";

const STANCE_SET = new Set<string>(STANCES);
const GOFOR_SET = new Set<string>(GO_FORS);
const GOFOR_ALIASES: Record<string, string> = {
  go: "special",
  spec: "special",
  sp: "special",
  lp: "light",
  hp: "heavy",
  "go-for": "",
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Strip control chars, collapse whitespace, cap length. No HTML. */
export function sanitizeTaunt(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let s = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
  // Neutralize anything that could render as markup in the overlay.
  s = s.replace(/[<>]/g, "");
  if (s.length > MAX_TAUNT) s = s.slice(0, MAX_TAUNT).trim();
  return s;
}

export function clampSpacing(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_DIRECTIVE.spacing;
  return Math.round(clamp(n, MIN_SPACING, MAX_SPACING));
}

export function clampAggression(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_DIRECTIVE.aggression;
  return Math.round(clamp(n, 0, 1) * 1000) / 1000;
}

export function mergeDirective(
  current: CommanderDirective,
  partial: PartialDirective,
): CommanderDirective {
  const next: CommanderDirective = { ...current };
  if (partial.stance !== undefined) {
    next.stance = partial.stance;
    // A stance-only update picks that stance's default spacing/aggression
    // unless the same payload also set them explicitly.
    if (partial.spacing === undefined) next.spacing = STANCE_DEFAULTS[partial.stance].spacing;
    if (partial.aggression === undefined) {
      next.aggression = STANCE_DEFAULTS[partial.stance].aggression;
    }
  }
  if (partial.spacing !== undefined) next.spacing = clampSpacing(partial.spacing);
  if (partial.aggression !== undefined) next.aggression = clampAggression(partial.aggression);
  if (partial.goFor !== undefined) next.goFor = partial.goFor;
  if (partial.taunt !== undefined) next.taunt = sanitizeTaunt(partial.taunt);
  return next;
}

function normalizeKey(k: string): string {
  return k.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function normalizeStance(v: string): Stance | null {
  const s = v.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (s === "antiair" || s === "anti-air" || s === "aa") return "anti-air";
  if (s === "zoning" || s === "zoner") return "zone";
  if (s === "rusher" || s === "press" || s === "pressure") return "rush";
  if (s === "turtling" || s === "turtler" || s === "block") return "turtle";
  if (s === "whiff" || s === "whiff-punish" || s === "whiffpunish") return "bait";
  return isStance(s) ? s : null;
}

function normalizeGoFor(v: string): string | null {
  const s = v.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (s === "spec" || s === "sp" || s === "burst") return "special";
  if (s === "lp" || s === "jab") return "light";
  if (s === "hp" || s === "smash") return "heavy";
  if (s === "cb" || s === "string") return "combo";
  if (s === "nothing" || s === "clear" || s === "stop") return "none";
  return GOFOR_SET.has(s) ? s : null;
}

function parseNumber(v: string): number | null {
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : null;
}

function applyPair(
  partial: PartialDirective,
  key: string, value: string, warnings: string[],
): boolean {
  const k = normalizeKey(key);
  if (k === "stance" || k === "plan") {
    const st = normalizeStance(value);
    if (!st) {
      warnings.push(`unknown stance "${value}"`);
      return false;
    }
    partial.stance = st;
    return true;
  }
  if (k === "spacing" || k === "space" || k === "range" || k === "distance") {
    const n = parseNumber(value);
    if (n === null) {
      warnings.push(`bad spacing "${value}"`);
      return false;
    }
    partial.spacing = clampSpacing(n);
    return true;
  }
  if (k === "aggression" || k === "aggro" || k === "agr") {
    const n = parseNumber(value);
    if (n === null) {
      warnings.push(`bad aggression "${value}"`);
      return false;
    }
    partial.aggression = clampAggression(n);
    return true;
  }
  if (k === "gofor" || k === "go" || k === "next" || k === "special") {
    // "SPECIAL special" or "GOFOR special" or bare "special" as value
    const g = normalizeGoFor(k === "special" && !value ? "special" : value);
    if (!g || !isGoFor(g)) {
      warnings.push(`bad goFor "${value}"`);
      return false;
    }
    partial.goFor = g;
    return true;
  }
  if (k === "taunt" || k === "callout" || k === "say") {
    partial.taunt = sanitizeTaunt(value);
    return true;
  }
  return false;
}

function parseJsonObject(obj: Record<string, unknown>, raw: string): ParseResult {
  const partial: PartialDirective = {};
  const warnings: string[] = [];
  let any = false;
  for (const [key, value] of Object.entries(obj)) {
    const k = normalizeKey(key);
    if (value === undefined || value === null) continue;
    if (k === "stance" || k === "plan") {
      const st = normalizeStance(String(value));
      if (!st) return { ok: false, error: `unknown stance "${String(value)}"`, raw };
      partial.stance = st;
      any = true;
    } else if (k === "spacing" || k === "space" || k === "range" || k === "distance") {
      const n = typeof value === "number" ? value : parseNumber(String(value));
      if (n === null) return { ok: false, error: `bad spacing "${String(value)}"`, raw };
      partial.spacing = clampSpacing(n);
      any = true;
    } else if (k === "aggression" || k === "aggro" || k === "agr") {
      const n = typeof value === "number" ? value : parseNumber(String(value));
      if (n === null) return { ok: false, error: `bad aggression "${String(value)}"`, raw };
      partial.aggression = clampAggression(n);
      any = true;
    } else if (k === "gofor" || k === "go" || k === "next") {
      const g = normalizeGoFor(String(value));
      if (!g || !isGoFor(g)) return { ok: false, error: `bad goFor "${String(value)}"`, raw };
      partial.goFor = g;
      any = true;
    } else if (k === "taunt" || k === "callout" || k === "say") {
      partial.taunt = sanitizeTaunt(String(value));
      any = true;
    } else if (k === "fighter" || k === "side" || k === "issuedatms" || k === "command") {
      // metadata, ignore
    } else {
      warnings.push(`ignored field "${key}"`);
    }
  }
  if (!any) return { ok: false, error: "no command fields found", raw };
  return { ok: true, partial, raw, warnings };
}

function parseLineOriented(text: string): ParseResult {
  const partial: PartialDirective = {};
  const warnings: string[] = [];
  let any = false;
  const lines = text.split(/\r?\n/);
  for (const line0 of lines) {
    const line = line0.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    // STANCE rush   |  stance: rush  |  stance=rush
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*(?:[:=]\s*|\s+)(.*)$/);
    if (m && m[1]) {
      const value = (m[2] ?? "").trim();
      // TAUNT may be empty to clear
      if (applyPair(partial, m[1], value, warnings) || normalizeKey(m[1]) === "taunt") {
        if (normalizeKey(m[1]) === "taunt") partial.taunt = sanitizeTaunt(value);
        any = true;
        continue;
      }
    }
    // Bare stance or goFor on its own line: "rush" or "special"
    const bare = normalizeStance(line);
    if (bare && STANCE_SET.has(bare)) {
      partial.stance = bare;
      any = true;
      continue;
    }
    const go = normalizeGoFor(line);
    if (go && isGoFor(go) && line.toLowerCase() !== "none") {
      // "none" alone is too ambiguous (could be a leftover)
      partial.goFor = go;
      any = true;
      continue;
    }
    warnings.push(`skipped line "${line}"`);
  }
  if (!any) return { ok: false, error: "no command fields found", raw: text };
  return { ok: true, partial, raw: text, warnings };
}

function parseCompact(text: string): ParseResult {
  // rush spacing=180 aggro=0.8 go=special taunt=come on
  // also: STANCE=rush SPACING=180
  const partial: PartialDirective = {};
  const warnings: string[] = [];
  let any = false;
  // taunt is greedy until end or another key=
  const tauntSplit = text.match(/^(.*?)(?:\btaunt\s*[:=]\s*)(.*)$/i);
  let rest = text;
  if (tauntSplit) {
    rest = tauntSplit[1] ?? text;
    partial.taunt = sanitizeTaunt(tauntSplit[2] ?? "");
    any = true;
  }
  // tokenise key=value and bare stances
  const tokenRe = /([A-Za-z][A-Za-z0-9_-]*)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(rest)) !== null) {
    const key = m[1] ?? "";
    let value = m[2] ?? "";
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (applyPair(partial, key, value, warnings)) {
      any = true;
    }
  }
  // bare words (stances / goFor) that aren't values of a key=
  const stripped = rest.replace(tokenRe, " ");
  for (const word of stripped.split(/\s+/).filter(Boolean)) {
    const st = normalizeStance(word);
    if (st) {
      partial.stance = st;
      any = true;
      continue;
    }
    const go = normalizeGoFor(word);
    if (go && isGoFor(go) && word.toLowerCase() !== "none") {
      partial.goFor = go;
      any = true;
    }
  }
  if (!any) return { ok: false, error: "no command fields found", raw: text };
  return { ok: true, partial, raw: text, warnings };
}

/**
 * Parse a Commander command from JSON, line-oriented text, or a compact one-liner.
 * Also extracts a command block from a noisy LLM reply.
 */
export function parseCommand(input: unknown): ParseResult {
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    // Nested { command: {...} } or { command: "STANCE rush" }
    if (obj.command !== undefined && typeof obj.command === "object" && obj.command !== null) {
      return parseCommand(obj.command);
    }
    if (typeof obj.command === "string" || typeof obj.text === "string") {
      return parseCommand(String(obj.command ?? obj.text));
    }
    return parseJsonObject(obj, JSON.stringify(input));
  }
  if (typeof input !== "string") {
    return { ok: false, error: "command must be text or JSON", raw: String(input) };
  }
  const text = input.trim();
  if (!text) return { ok: false, error: "empty command", raw: input };

  // Try to extract a JSON object from a larger reply
  const jsonSlice = extractJsonObject(text);
  if (jsonSlice) {
    try {
      const v: unknown = JSON.parse(jsonSlice);
      if (v !== null && typeof v === "object") {
        const r = parseCommand(v);
        if (r.ok) return { ...r, raw: text };
      }
    } catch {
      // fall through to text parsers
    }
  }

  if (text.startsWith("{")) {
    try {
      const v: unknown = JSON.parse(text);
      return parseCommand(v);
    } catch {
      // might still be line-oriented with a stray brace
    }
  }

  if (/\r?\n/.test(text) || /^(STANCE|SPACING|AGGRESSION|AGGRO|GOFOR|GO|TAUNT|CALLOUT|PLAN)\b/im.test(text)) {
    const r = parseLineOriented(text);
    if (r.ok) return r;
    // If the text is a noisy LLM reply, try extracting the command block first
    const block = extractCommandBlock(text);
    if (block && block !== text) {
      const r2 = parseLineOriented(block);
      if (r2.ok) return { ...r2, raw: text };
    }
    const compact = parseCompact(text);
    if (compact.ok) return compact;
    return r;
  }

  const compact = parseCompact(text);
  if (compact.ok) return compact;
  const lines = parseLineOriented(text);
  if (lines.ok) return lines;
  return { ok: false, error: "could not parse command", raw: text };
}

/** Pull a {...} object that looks like a command out of a larger string. */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * From a noisy ChatGPT reply, keep only lines that look like command grammar.
 */
export function extractCommandBlock(text: string): string | null {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  const key = /^(STANCE|SPACING|AGGRESSION|AGGRO|AGR|GOFOR|GO-FOR|GO|TAUNT|CALLOUT|PLAN|RANGE|DISTANCE|NEXT)\b/i;
  for (const line of lines) {
    const t = line.trim().replace(/^[-*`>\s]+/, "").replace(/[`]/g, "");
    if (key.test(t) || (normalizeStance(t) && t.split(/\s+/).length === 1)) {
      kept.push(t);
    }
  }
  return kept.length ? kept.join("\n") : null;
}

export function directiveToText(d: CommanderDirective): string {
  const lines = [
    `STANCE ${d.stance}`,
    `SPACING ${d.spacing}`,
    `AGGRESSION ${d.aggression}`,
    `GOFOR ${d.goFor}`,
  ];
  if (d.taunt) lines.push(`TAUNT ${d.taunt}`);
  return lines.join("\n");
}

export function directiveToCompact(d: CommanderDirective): string {
  let s = `${d.stance} spacing=${d.spacing} aggro=${d.aggression} go=${d.goFor}`;
  if (d.taunt) s += ` taunt=${d.taunt}`;
  return s;
}

export { GOFOR_ALIASES };
