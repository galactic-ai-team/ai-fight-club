/**
 * Versioned, deterministic notes format for AI Eyes practice sessions.
 *
 * Design constraints (see docs/EYES_NOTES.md):
 *  - JSON-serializable.
 *  - Deterministic given the same write sequence: no Date.now(), no
 *    Math.random(), no locale-dependent formatting inside this module.
 *    Callers may pass `updatedAt` explicitly if they want a wall-clock
 *    stamp; this module never generates one.
 *  - Load validates the version and rejects unknown versions with a
 *    clear error rather than silently coercing.
 *
 * This module has no dependency on the engine. It is pure data plumbing.
 */

export const NOTES_VERSION = 1 as const;

export type NoteKind = "jump" | "walk" | "attack" | "matchup" | "other";

export interface NoteEvidence {
  seed: number;
  trial: string;
}

export interface NoteFact {
  /** Stable slug, e.g. "jump-distance". Used as merge key. */
  id: string;
  kind: NoteKind;
  /** Short human/AI readable summary. */
  text: string;
  /** Numeric measurements the fact is derived from. */
  measurements?: Record<string, number>;
  evidence?: NoteEvidence;
  /** ISO-8601, only if caller supplied it. This module never sets it. */
  updatedAt?: string;
}

export interface Notes {
  version: typeof NOTES_VERSION;
  /** e.g. "gemini-vision", "sandbox-self". */
  author: string;
  /** Tick at which the notes were last updated, if known. */
  updatedTick?: number;
  facts: NoteFact[];
}

/** Input shape for writeNote. id + kind + text are required. */
export interface NoteInput {
  id: string;
  kind: NoteKind;
  text: string;
  measurements?: Record<string, number>;
  evidence?: NoteEvidence;
  updatedAt?: string;
}

const NOTE_KINDS: ReadonlySet<NoteKind> = new Set([
  "jump",
  "walk",
  "attack",
  "matchup",
  "other",
]);

const ID_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export class NotesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotesError";
  }
}

/** Fresh, empty notes for a given author. */
export function emptyNotes(author: string): Notes {
  if (typeof author !== "string" || author.length === 0) {
    throw new NotesError("author must be a non-empty string");
  }
  return { version: NOTES_VERSION, author, facts: [] };
}

function assertId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !ID_RE.test(id)) {
    throw new NotesError(
      `fact id must be a lowercase slug (a-z, 0-9, '-'); got ${JSON.stringify(id)}`,
    );
  }
}

function assertKind(kind: unknown): asserts kind is NoteKind {
  if (typeof kind !== "string" || !NOTE_KINDS.has(kind as NoteKind)) {
    throw new NotesError(
      `fact kind must be one of ${[...NOTE_KINDS].join(", ")}; got ${JSON.stringify(kind)}`,
    );
  }
}

function assertMeasurements(
  m: unknown,
): asserts m is Record<string, number> | undefined {
  if (m === undefined) return;
  if (m === null || typeof m !== "object" || Array.isArray(m)) {
    throw new NotesError("measurements must be a plain object of numbers");
  }
  for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new NotesError(
        `measurements[${JSON.stringify(k)}] must be a finite number; got ${JSON.stringify(v)}`,
      );
    }
  }
}

function assertEvidence(e: unknown): asserts e is NoteEvidence | undefined {
  if (e === undefined) return;
  if (e === null || typeof e !== "object" || Array.isArray(e)) {
    throw new NotesError("evidence must be { seed: number, trial: string }");
  }
  const ev = e as Record<string, unknown>;
  if (typeof ev.seed !== "number" || !Number.isFinite(ev.seed)) {
    throw new NotesError("evidence.seed must be a finite number");
  }
  if (typeof ev.trial !== "string" || ev.trial.length === 0) {
    throw new NotesError("evidence.trial must be a non-empty string");
  }
}

function validateFact(f: unknown): NoteFact {
  if (f === null || typeof f !== "object" || Array.isArray(f)) {
    throw new NotesError("fact must be an object");
  }
  const o = f as Record<string, unknown>;
  assertId(o.id);
  assertKind(o.kind);
  if (typeof o.text !== "string" || o.text.length === 0) {
    throw new NotesError(`fact ${JSON.stringify(o.id)}: text must be a non-empty string`);
  }
  assertMeasurements(o.measurements);
  assertEvidence(o.evidence);
  if (o.updatedAt !== undefined && typeof o.updatedAt !== "string") {
    throw new NotesError(`fact ${JSON.stringify(o.id)}: updatedAt must be a string if present`);
  }
  return {
    id: o.id,
    kind: o.kind,
    text: o.text,
    ...(o.measurements !== undefined
      ? { measurements: { ...(o.measurements as Record<string, number>) } }
      : {}),
    ...(o.evidence !== undefined
      ? { evidence: { ...(o.evidence as NoteEvidence) } }
      : {}),
    ...(o.updatedAt !== undefined ? { updatedAt: o.updatedAt as string } : {}),
  };
}

function validateNotes(raw: unknown): Notes {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new NotesError("notes must be an object");
  }
  const o = raw as Record<string, unknown>;

  if (o.version === undefined) {
    throw new NotesError("notes.version is missing (expected 1)");
  }
  if (o.version !== NOTES_VERSION) {
    throw new NotesError(
      `unsupported notes version ${JSON.stringify(o.version)} (this build supports ${NOTES_VERSION})`,
    );
  }
  if (typeof o.author !== "string" || o.author.length === 0) {
    throw new NotesError("notes.author must be a non-empty string");
  }
  if (
    o.updatedTick !== undefined &&
    (typeof o.updatedTick !== "number" || !Number.isInteger(o.updatedTick) || o.updatedTick < 0)
  ) {
    throw new NotesError("notes.updatedTick must be a non-negative integer if present");
  }
  if (!Array.isArray(o.facts)) {
    throw new NotesError("notes.facts must be an array");
  }

  const seen = new Set<string>();
  const facts: NoteFact[] = [];
  for (let i = 0; i < o.facts.length; i++) {
    let fact: NoteFact;
    try {
      fact = validateFact(o.facts[i]);
    } catch (err) {
      if (err instanceof NotesError) {
        throw new NotesError(`notes.facts[${i}]: ${err.message}`);
      }
      throw err;
    }
    if (seen.has(fact.id)) {
      throw new NotesError(`notes.facts[${i}]: duplicate id ${JSON.stringify(fact.id)}`);
    }
    seen.add(fact.id);
    facts.push(fact);
  }

  return {
    version: NOTES_VERSION,
    author: o.author,
    ...(o.updatedTick !== undefined ? { updatedTick: o.updatedTick as number } : {}),
    facts,
  };
}

/** Parse and validate a JSON string. Throws NotesError on bad JSON or bad shape. */
export function parseNotes(json: string): Notes {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new NotesError(`invalid notes JSON: ${msg}`);
  }
  return validateNotes(raw);
}

/**
 * Serialize with a stable key order and stable facts order (as stored).
 * `undefined` optional fields are omitted, not emitted as null.
 */
export function serializeNotes(notes: Notes): string {
  // Re-validate so callers can't serialize a hand-built malformed object.
  const n = validateNotes(notes);
  const out: Record<string, unknown> = {
    version: n.version,
    author: n.author,
  };
  if (n.updatedTick !== undefined) out.updatedTick = n.updatedTick;
  out.facts = n.facts.map((f) => {
    const fo: Record<string, unknown> = {
      id: f.id,
      kind: f.kind,
      text: f.text,
    };
    if (f.measurements !== undefined) fo.measurements = f.measurements;
    if (f.evidence !== undefined) fo.evidence = f.evidence;
    if (f.updatedAt !== undefined) fo.updatedAt = f.updatedAt;
    return fo;
  });
  return JSON.stringify(out);
}

/**
 * Merge `incoming` into `base`.
 *
 * Semantics (documented in docs/EYES_NOTES.md):
 *  - `version` must match; mismatch throws NotesError.
 *  - `author` must match; mismatch throws NotesError. (We do not silently
 *    relabel one author's facts as another's.)
 *  - `updatedTick`: taken from incoming if defined, else base.
 *  - Facts: same `id` -> replaced in place by the incoming fact (position
 *    of the first occurrence is preserved). New ids are appended in
 *    incoming order.
 *  - Returns a new object; `base` and `incoming` are not mutated.
 */
export function mergeNotes(base: Notes, incoming: Notes): Notes {
  const b = validateNotes(base);
  const inc = validateNotes(incoming);
  if (b.version !== inc.version) {
    throw new NotesError(
      `cannot merge notes: version ${b.version} vs ${inc.version}`,
    );
  }
  if (b.author !== inc.author) {
    throw new NotesError(
      `cannot merge notes: author ${JSON.stringify(b.author)} vs ${JSON.stringify(inc.author)}`,
    );
  }

  const indexById = new Map<string, number>();
  const facts: NoteFact[] = b.facts.map((f, i) => {
    indexById.set(f.id, i);
    return cloneFact(f);
  });

  for (const f of inc.facts) {
    const at = indexById.get(f.id);
    if (at === undefined) {
      indexById.set(f.id, facts.length);
      facts.push(cloneFact(f));
    } else {
      facts[at] = cloneFact(f);
    }
  }

  const out: Notes = {
    version: NOTES_VERSION,
    author: b.author,
    facts,
  };
  const tick = inc.updatedTick ?? b.updatedTick;
  if (tick !== undefined) out.updatedTick = tick;
  return out;
}

function cloneFact(f: NoteFact): NoteFact {
  return {
    id: f.id,
    kind: f.kind,
    text: f.text,
    ...(f.measurements !== undefined ? { measurements: { ...f.measurements } } : {}),
    ...(f.evidence !== undefined ? { evidence: { ...f.evidence } } : {}),
    ...(f.updatedAt !== undefined ? { updatedAt: f.updatedAt } : {}),
  };
}

/**
 * Apply one note write to a Notes object.
 * If a fact with the same id exists, it is replaced in place;
 * otherwise appended. Returns a new object.
 */
export function writeNoteTo(notes: Notes, input: NoteInput): Notes {
  const n = validateNotes(notes);
  const fact = validateFact(input);
  const facts = n.facts.map((f) => cloneFact(f));
  const at = facts.findIndex((f) => f.id === fact.id);
  if (at === -1) facts.push(fact);
  else facts[at] = fact;
  return { ...n, facts };
}
