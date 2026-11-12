import { describe, expect, it } from "vitest";
import {
  NOTES_VERSION,
  NotesError,
  emptyNotes,
  mergeNotes,
  parseNotes,
  serializeNotes,
  writeNoteTo,
  type Notes,
} from "../../src/eyes/sandbox/notes.ts";

describe("notes: construction and validation", () => {
  it("emptyNotes produces a v1 document", () => {
    const n = emptyNotes("sandbox-self");
    expect(n).toEqual({ version: NOTES_VERSION, author: "sandbox-self", facts: [] });
  });

  it("rejects missing version", () => {
    expect(() => parseNotes(JSON.stringify({ author: "x", facts: [] }))).toThrow(
      /version is missing/,
    );
  });

  it("rejects unknown version", () => {
    const v2 = { version: 2, author: "x", facts: [] };
    expect(() => parseNotes(JSON.stringify(v2))).toThrow(/unsupported notes version 2/);
  });

  it("rejects invalid JSON with a clear error", () => {
    expect(() => parseNotes("{not json")).toThrow(NotesError);
    expect(() => parseNotes("{not json")).toThrow(/invalid notes JSON/);
  });

  it("rejects bad fact id", () => {
    const bad = {
      version: 1,
      author: "x",
      facts: [{ id: "Not A Slug", kind: "jump", text: "hi" }],
    };
    expect(() => parseNotes(JSON.stringify(bad))).toThrow(/lowercase slug/);
  });

  it("rejects non-finite measurements", () => {
    const bad = {
      version: 1,
      author: "x",
      facts: [
        { id: "jump-distance", kind: "jump", text: "hi", measurements: { px: NaN } },
      ],
    };
    // JSON.stringify(NaN) -> null, so the parser sees null, which is not a number.
    expect(() => parseNotes(JSON.stringify(bad))).toThrow(/must be a finite number/);
  });

  it("rejects duplicate ids within one document", () => {
    const dup = {
      version: 1,
      author: "x",
      facts: [
        { id: "jump-distance", kind: "jump", text: "a" },
        { id: "jump-distance", kind: "jump", text: "b" },
      ],
    };
    expect(() => parseNotes(JSON.stringify(dup))).toThrow(/duplicate id/);
  });
});

describe("notes: round-trip", () => {
  it("parse(serialize(n)) === n for a populated doc", () => {
    const n: Notes = {
      version: 1,
      author: "sandbox-self",
      updatedTick: 3600,
      facts: [
        {
          id: "jump-distance",
          kind: "jump",
          text: "Jump travels 0 px horizontally from standstill",
          measurements: { px: 0, airtimeTicks: 32 },
          evidence: { seed: 1234, trial: "measureJump" },
          updatedAt: "2026-11-11T00:00:00.000Z",
        },
        {
          id: "walk-speed",
          kind: "walk",
          text: "Walk speed ~4 px/tick",
          measurements: { pxPerTick: 4 },
        },
      ],
    };
    const round = parseNotes(serializeNotes(n));
    expect(round).toEqual(n);
  });

  it("serialization is stable for the same input", () => {
    const n = emptyNotes("x");
    expect(serializeNotes(n)).toBe(serializeNotes(n));
  });

  it("omits undefined optional fields rather than emitting null", () => {
    const n = emptyNotes("x");
    const s = serializeNotes(n);
    expect(s).not.toContain("null");
    expect(s).not.toContain("updatedTick");
  });
});

describe("notes: writeNoteTo", () => {
  it("appends a new fact", () => {
    const n0 = emptyNotes("x");
    const n1 = writeNoteTo(n0, {
      id: "jump-distance",
      kind: "jump",
      text: "Jump travels 0 px",
    });
    expect(n1.facts).toHaveLength(1);
    expect(n1.facts[0]?.id).toBe("jump-distance");
    expect(n0.facts).toHaveLength(0); // no mutation
  });

  it("replaces an existing fact in place", () => {
    const a = writeNoteTo(emptyNotes("x"), {
      id: "walk-speed",
      kind: "walk",
      text: "old",
    });
    const b = writeNoteTo(
      writeNoteTo(a, { id: "jump-distance", kind: "jump", text: "j" }),
      { id: "walk-speed", kind: "walk", text: "new" },
    );
    expect(b.facts.map((f) => f.id)).toEqual(["walk-speed", "jump-distance"]);
    expect(b.facts[0]?.text).toBe("new");
  });

  it("is deterministic given the same write sequence", () => {
    const seq = (): Notes => {
      let n = emptyNotes("x");
      n = writeNoteTo(n, { id: "a-fact", kind: "other", text: "a" });
      n = writeNoteTo(n, { id: "b-fact", kind: "other", text: "b" });
      n = writeNoteTo(n, { id: "a-fact", kind: "other", text: "a2" });
      return n;
    };
    expect(serializeNotes(seq())).toBe(serializeNotes(seq()));
  });
});

describe("notes: mergeNotes", () => {
  it("replaces same-id facts and appends new ids", () => {
    const base = writeNoteTo(emptyNotes("x"), {
      id: "walk-speed",
      kind: "walk",
      text: "old",
    });
    const inc = writeNoteTo(
      writeNoteTo(emptyNotes("x"), {
        id: "walk-speed",
        kind: "walk",
        text: "new",
      }),
      { id: "jump-distance", kind: "jump", text: "j" },
    );
    const merged = mergeNotes(base, inc);
    expect(merged.facts.map((f) => f.id)).toEqual(["walk-speed", "jump-distance"]);
    expect(merged.facts[0]?.text).toBe("new");
  });

  it("rejects version mismatch", () => {
    const base = emptyNotes("x");
    const bad = { ...emptyNotes("x"), version: 2 as unknown as 1 };
    // validateNotes on bad will throw first with "unsupported notes version"
    expect(() => mergeNotes(base, bad)).toThrow(NotesError);
  });

  it("rejects author mismatch", () => {
    const base = emptyNotes("alice");
    const inc = emptyNotes("bob");
    expect(() => mergeNotes(base, inc)).toThrow(/author/);
  });

  it("takes updatedTick from incoming when defined", () => {
    const base: Notes = { ...emptyNotes("x"), updatedTick: 10 };
    const inc: Notes = { ...emptyNotes("x"), updatedTick: 20 };
    expect(mergeNotes(base, inc).updatedTick).toBe(20);
    const incNoTick = emptyNotes("x");
    expect(mergeNotes(base, incNoTick).updatedTick).toBe(10);
  });

  it("does not mutate its inputs", () => {
    const base = writeNoteTo(emptyNotes("x"), { id: "a-fact", kind: "other", text: "a" });
    const inc = writeNoteTo(emptyNotes("x"), { id: "a-fact", kind: "other", text: "a2" });
    const before = serializeNotes(base) + "|" + serializeNotes(inc);
    mergeNotes(base, inc);
    expect(serializeNotes(base) + "|" + serializeNotes(inc)).toBe(before);
  });
});
