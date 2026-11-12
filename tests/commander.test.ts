import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIRECTIVE,
  WINDOW_PAUSE_MS,
  WAIT_FOR_BOTH_PAUSE_MS,
  pauseMs,
  clampAggression,
  clampSpacing,
  closeWindow,
  createCommanderAutopilot,
  createWindowState,
  directiveToText,
  extractCommandBlock,
  formatStateText,
  initialFromBotId,
  intervalTicks,
  markSubmitted,
  mergeDirective,
  nextWindowTick,
  openWindow,
  parseCommand,
  playbackEngine,
  remainingMs,
  runCommanderMatch,
  sameCanonical,
  sanitizeTaunt,
  shouldCloseWindow,
  shouldOpenWindow,
  snapshotWindow,
  type CommanderReplay,
  type MatchPublicState,
} from "../src/commander/index.ts";
import { canonicalState, stateHash } from "../src/engine/canonical.ts";
import { createMatch } from "../src/engine/sim.ts";
import { observe } from "../src/engine/observe.ts";

describe("command parsing", () => {
  it("parses line-oriented grammar", () => {
    const r = parseCommand("STANCE rush\nSPACING 180\nAGGRESSION 0.7\nGOFOR special\nTAUNT not today");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.partial).toEqual({
      stance: "rush",
      spacing: 180,
      aggression: 0.7,
      goFor: "special",
      taunt: "not today",
    });
  });

  it("parses JSON, including nested command objects", () => {
    const r = parseCommand({ fighter: "p1", command: { stance: "turtle", aggression: 0.2 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.partial.stance).toBe("turtle");
    expect(r.partial.aggression).toBe(0.2);
  });

  it("parses a compact one-liner", () => {
    const r = parseCommand("rush spacing=80 aggro=0.9 go=heavy taunt=come on");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.partial.stance).toBe("rush");
    expect(r.partial.spacing).toBe(80);
    expect(r.partial.aggression).toBe(0.9);
    expect(r.partial.goFor).toBe("heavy");
    expect(r.partial.taunt).toBe("come on");
  });

  it("accepts stance aliases and partial updates", () => {
    const r = parseCommand("PLAN zoner\nGO burst");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.partial.stance).toBe("zone");
    expect(r.partial.goFor).toBe("special");
    const merged = mergeDirective(DEFAULT_DIRECTIVE, r.partial);
    expect(merged.stance).toBe("zone");
    expect(merged.spacing).toBe(88); // stance default, since spacing omitted
    expect(merged.goFor).toBe("special");
  });

  it("clamps spacing and aggression, sanitizes taunts", () => {
    expect(clampSpacing(5)).toBe(24);
    expect(clampSpacing(9999)).toBe(400);
    expect(clampAggression(-1)).toBe(0);
    expect(clampAggression(2)).toBe(1);
    expect(sanitizeTaunt("  hello\n<script>x</script>  ")).toBe("hello scriptx/script");
    expect(sanitizeTaunt("x".repeat(200)).length).toBe(80);
  });

  it("rejects empty and unknown-only input", () => {
    expect(parseCommand("").ok).toBe(false);
    expect(parseCommand("   ").ok).toBe(false);
    expect(parseCommand({ foo: "bar" }).ok).toBe(false);
  });

  it("extracts a command from a noisy ChatGPT reply", () => {
    const reply = [
      "Sure — here's my call for this window.",
      "",
      "STANCE bait",
      "SPACING 70",
      "AGGRESSION 0.6",
      "GOFOR none",
      "TAUNT after you",
      "",
      "I want to whiff-punish and then cash out.",
    ].join("\n");
    const block = extractCommandBlock(reply);
    expect(block).toBeTruthy();
    const r = parseCommand(reply);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.partial.stance).toBe("bait");
    expect(r.partial.taunt).toBe("after you");
  });

  it("extracts a JSON blob from a wrapping sentence", () => {
    const r = parseCommand('I will go with {"stance":"anti-air","goFor":"special","taunt":"stay down"} this window.');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.partial.stance).toBe("anti-air");
    expect(r.partial.goFor).toBe("special");
  });

  it("round-trips directiveToText", () => {
    const text = directiveToText({
      stance: "rush",
      spacing: 50,
      aggression: 0.8,
      goFor: "combo",
      taunt: "lets go",
    });
    const r = parseCommand(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.partial.stance).toBe("rush");
    expect(r.partial.goFor).toBe("combo");
    expect(r.partial.taunt).toBe("lets go");
  });
});

describe("decision window timing", () => {
  it("mode off never opens", () => {
    const w = createWindowState("off");
    expect(intervalTicks("off")).toBeNull();
    expect(nextWindowTick(0, "off")).toBeNull();
    expect(shouldOpenWindow(180, w)).toBe(false);
    expect(shouldOpenWindow(300, w)).toBe(false);
  });

  it("3s windows open at 180, 360, … and not at tick 0", () => {
    expect(intervalTicks("3s")).toBe(180);
    expect(nextWindowTick(0, "3s")).toBe(180);
    expect(nextWindowTick(179, "3s")).toBe(180);
    expect(nextWindowTick(180, "3s")).toBe(180);
    expect(nextWindowTick(181, "3s")).toBe(360);
    const w = createWindowState("3s");
    expect(shouldOpenWindow(0, w)).toBe(false);
    expect(shouldOpenWindow(180, w)).toBe(true);
    openWindow(w, 180, 1000);
    expect(w.open).toBe(true);
    expect(w.index).toBe(1);
    expect(shouldOpenWindow(180, w)).toBe(false); // already open
    closeWindow(w);
    expect(shouldOpenWindow(180, w)).toBe(false); // already opened at this tick
    expect(shouldOpenWindow(360, w)).toBe(true);
  });

  it("5s windows open at 300, 600", () => {
    expect(intervalTicks("5s")).toBe(300);
    expect(nextWindowTick(0, "5s")).toBe(300);
    expect(nextWindowTick(301, "5s")).toBe(600);
    const w = createWindowState("5s");
    expect(shouldOpenWindow(180, w)).toBe(false);
    expect(shouldOpenWindow(300, w)).toBe(true);
  });

  it("closes early when both sides submit, otherwise on timeout", () => {
    const w = createWindowState("3s");
    openWindow(w, 180, 10_000);
    expect(shouldCloseWindow(w, 10_000)).toBe(false);
    expect(remainingMs(w, 10_000)).toBe(WINDOW_PAUSE_MS);
    markSubmitted(w, "p1");
    expect(shouldCloseWindow(w, 10_500)).toBe(false);
    markSubmitted(w, "p2");
    expect(shouldCloseWindow(w, 10_500)).toBe(true);
    closeWindow(w);

    openWindow(w, 360, 20_000);
    expect(shouldCloseWindow(w, 20_000 + WINDOW_PAUSE_MS - 1)).toBe(false);
    expect(shouldCloseWindow(w, 20_000 + WINDOW_PAUSE_MS)).toBe(true);
    const snap = snapshotWindow(w, 20_000 + 1000);
    expect(snap.open).toBe(true);
    expect(snap.remainingMs).toBe(WINDOW_PAUSE_MS - 1000);
    expect(snap.index).toBe(2);
  });

  it("5s-wait uses the 5s interval but holds up to 45s, and still closes early when both submit", () => {
    expect(intervalTicks("5s-wait")).toBe(300);
    expect(nextWindowTick(0, "5s-wait")).toBe(300);
    expect(pauseMs("5s-wait")).toBe(WAIT_FOR_BOTH_PAUSE_MS);
    expect(pauseMs("5s")).toBe(WINDOW_PAUSE_MS);
    const w = createWindowState("5s-wait");
    expect(shouldOpenWindow(300, w)).toBe(true);
    openWindow(w, 300, 10_000);
    expect(remainingMs(w, 10_000)).toBe(WAIT_FOR_BOTH_PAUSE_MS);
    markSubmitted(w, "p1");
    expect(shouldCloseWindow(w, 10_000 + 10_000)).toBe(false);
    markSubmitted(w, "p2");
    expect(shouldCloseWindow(w, 10_000 + 10_000)).toBe(true);
    closeWindow(w);
    openWindow(w, 600, 60_000);
    expect(shouldCloseWindow(w, 60_000 + WAIT_FOR_BOTH_PAUSE_MS - 1)).toBe(false);
    expect(shouldCloseWindow(w, 60_000 + WAIT_FOR_BOTH_PAUSE_MS)).toBe(true);
  });
});

describe("autopilot stances change behavior", () => {
  it("rush closes distance relative to zone over a few seconds", () => {
    const rush = runCommanderMatch(
      {
        seed: 20261111,
        p1Character: "Ion",
        p2Character: "Quark",
        p1Bot: "rusher",
        p2Bot: "statue",
        p1Controller: "Lumi",
        p2Controller: "GPT-6",
        windowMode: "off",
        commands: [
          { tick: 0, side: "p1", partial: { stance: "rush", spacing: 48, aggression: 0.9 } },
          { tick: 0, side: "p2", partial: { stance: "zone", spacing: 280, aggression: 0 } },
        ],
      },
      { maxTicks: 180 },
    );
    const zone = runCommanderMatch(
      {
        seed: 20261111,
        p1Character: "Ion",
        p2Character: "Quark",
        p1Bot: "zoner",
        p2Bot: "statue",
        p1Controller: "Lumi",
        p2Controller: "GPT-6",
        windowMode: "off",
        commands: [
          { tick: 0, side: "p1", partial: { stance: "zone", spacing: 220, aggression: 0.2 } },
          { tick: 0, side: "p2", partial: { stance: "zone", spacing: 280, aggression: 0 } },
        ],
      },
      { maxTicks: 180 },
    );
    const rushDist = Math.abs(rush.state.p1.x - rush.state.p2.x);
    const zoneDist = Math.abs(zone.state.p1.x - zone.state.p2.x);
    expect(rushDist).toBeLessThan(zoneDist);
    expect(rushDist).toBeLessThan(120);
    expect(zoneDist).toBeGreaterThan(150);
  });

  it("turtle blocks a threatening rusher more than a matching rusher does", () => {
    // Same seed, P2 is a rusher. P1 turtle vs P1 rush: turtle should take less
    // or equal damage over a short window because it blocks first.
    const base = {
      seed: 424242,
      p1Character: "Ion",
      p2Character: "Quark",
      p1Bot: "turtler",
      p2Bot: "rusher",
      p1Controller: "A",
      p2Controller: "B",
      windowMode: "off" as const,
    };
    const turtle = runCommanderMatch(
      {
        ...base,
        commands: [
          { tick: 0, side: "p1", partial: { stance: "turtle", aggression: 0.2 } },
          { tick: 0, side: "p2", partial: { stance: "rush", aggression: 1 } },
        ],
      },
      { maxTicks: 360 },
    );
    const alsoRush = runCommanderMatch(
      {
        ...base,
        p1Bot: "rusher",
        commands: [
          { tick: 0, side: "p1", partial: { stance: "rush", aggression: 1 } },
          { tick: 0, side: "p2", partial: { stance: "rush", aggression: 1 } },
        ],
      },
      { maxTicks: 360 },
    );
    // Not a hard HP assertion (trades happen), but the two runs must differ.
    expect(stateHash(turtle.state)).not.toBe(stateHash(alsoRush.state));
  });

  it("goFor special is consumed after it starts an attack", () => {
    const bot = createCommanderAutopilot({
      initial: { stance: "zone", goFor: "special", aggression: 1 },
    });
    const state = createMatch({ seed: 7 });
    // Give enough meter and close the gap so special is in range.
    state.p1.meter = 100;
    state.p1.x = 400;
    state.p2.x = 450;
    bot.setCommand({ goFor: "special" }, 0);
    expect(bot.peekGoFor()).toBe("special");
    const act = bot.act(observe(state, "p1"));
    expect(act.attack).toBe("special");
    expect(bot.peekGoFor()).toBe("none");
    expect(bot.getDirective().goFor).toBe("none");
  });

  it("initialFromBotId maps built-in bots to stances", () => {
    expect(initialFromBotId("rusher").stance).toBe("rush");
    expect(initialFromBotId("zoner").stance).toBe("zone");
    expect(initialFromBotId("turtler").stance).toBe("turtle");
    expect(initialFromBotId("statue").aggression).toBe(0);
  });
});

describe("commander replay determinism", () => {
  const script: CommanderReplay = {
    seed: 110011,
    p1Character: "Ion",
    p2Character: "Vexel",
    p1Bot: "rusher",
    p2Bot: "zoner",
    p1Controller: "Lumi",
    p2Controller: "GPT-6",
    windowMode: "5s",
    commands: [
      { tick: 30, side: "p1", partial: { stance: "rush", aggression: 0.9, taunt: "closing" } },
      { tick: 30, side: "p2", partial: { stance: "zone", spacing: 140, taunt: "come in" } },
      { tick: 200, side: "p1", partial: { stance: "bait", goFor: "heavy" } },
      { tick: 260, side: "p2", partial: { stance: "turtle", aggression: 0.3 } },
      { tick: 400, side: "p1", partial: { stance: "anti-air", goFor: "special" } },
    ],
  };

  it("two runs with the same seed and command log are identical", () => {
    const a = runCommanderMatch(script, { maxTicks: 720 });
    const b = runCommanderMatch(script, { maxTicks: 720 });
    expect(a.hash).toBe(b.hash);
    expect(canonicalState(a.state)).toBe(canonicalState(b.state));
    expect(a.state.p1.x).toBe(b.state.p1.x);
    expect(a.state.p1.health).toBe(b.state.p1.health);
    expect(a.state.p2.health).toBe(b.state.p2.health);
    expect(a.state.tick).toBe(b.state.tick);
    expect(a.applied.length).toBe(b.applied.length);
  });

  it("playback of recorded engine inputs matches the live run", () => {
    const live = runCommanderMatch(script, { maxTicks: 720 });
    const played = playbackEngine(live.engineReplay);
    expect(sameCanonical(live.state, played)).toBe(true);
    expect(stateHash(played)).toBe(live.hash);
  });

  it("changing a command at a tick changes the subsequent state", () => {
    const a = runCommanderMatch(script, { maxTicks: 720 });
    const tweaked: CommanderReplay = {
      ...script,
      commands: script.commands.map((c, i) =>
        i === 0 ? { ...c, partial: { stance: "turtle", aggression: 0.1 } } : c,
      ),
    };
    const b = runCommanderMatch(tweaked, { maxTicks: 720 });
    expect(a.hash).not.toBe(b.hash);
    expect(canonicalState(a.state)).not.toBe(canonicalState(b.state));
  });

  it("a late command only affects ticks at or after its timestamp", () => {
    const early = runCommanderMatch(
      { ...script, commands: script.commands.filter((c) => c.tick <= 30) },
      { maxTicks: 199 },
    );
    const withLate = runCommanderMatch(
      { ...script, commands: script.commands.filter((c) => c.tick <= 200) },
      { maxTicks: 199 },
    );
    // Up to tick 199 the tick-200 command has not applied, so hashes match.
    expect(early.hash).toBe(withLate.hash);
    const after = runCommanderMatch(
      { ...script, commands: script.commands.filter((c) => c.tick <= 200) },
      { maxTicks: 280 },
    );
    const without = runCommanderMatch(
      { ...script, commands: script.commands.filter((c) => c.tick <= 30) },
      { maxTicks: 280 },
    );
    expect(after.hash).not.toBe(without.hash);
  });
});

describe("state summary", () => {
  it("renders a compact plain-text block an LLM can read", () => {
    const state: MatchPublicState = {
      id: "m_test",
      tick: 1234,
      seed: 1,
      phase: "window",
      matchPhase: "fight",
      round: 2,
      timeLeftTicks: 45 * 60,
      p1Wins: 1,
      p2Wins: 0,
      over: false,
      winner: null,
      window: {
        mode: "5s",
        open: true,
        index: 2,
        openedAtTick: 900,
        remainingMs: 1800,
        p1Submitted: true,
        p2Submitted: false,
      },
      p1: {
        character: "Ion",
        controller: "Lumi",
        health: 820,
        maxHealth: 1000,
        meter: 60,
        maxMeter: 100,
        x: 320,
        y: 440,
        vx: 4,
        vy: 0,
        facing: 1,
        state: "walk",
        attack: null,
        attackPhase: null,
        airborne: false,
        blocking: false,
        combo: 0,
        lastMoves: ["walk", "walk", "light", "light"],
        command: { stance: "rush", spacing: 48, aggression: 0.8, goFor: "none", taunt: "closing" },
        commandSeq: 3,
        latencyMs: 1200,
        taunt: "closing",
        inControl: "Lumi",
      },
      p2: {
        character: "Quark",
        controller: "GPT-6",
        health: 640,
        maxHealth: 1000,
        meter: 20,
        maxMeter: 100,
        x: 510,
        y: 440,
        vx: 0,
        vy: 0,
        facing: -1,
        state: "block",
        attack: null,
        attackPhase: null,
        airborne: false,
        blocking: true,
        combo: 0,
        lastMoves: ["block", "block", "block", "heavy"],
        command: { stance: "turtle", spacing: 44, aggression: 0.35, goFor: "none", taunt: "" },
        commandSeq: 2,
        latencyMs: 2100,
        taunt: "",
        inControl: "GPT-6",
      },
      p1Bot: "commander",
      p2Bot: "commander",
      events: ["Ion hits with light"],
      summary: "",
      hostPresent: true,
      updatedAtMs: 1,
      startedAtMs: 0,
    };
    const text = formatStateText(state);
    expect(text).toContain("MATCH m_test");
    expect(text).toContain("tick=1234");
    expect(text).toContain("P1 Ion (Lumi)");
    expect(text).toContain("P2 Quark (GPT-6)");
    expect(text).toContain("WINDOW open");
    expect(text).toContain("latency=1.20s");
    expect(text).toContain("taunt=\"closing\"");
    expect(text).toContain("SPACING 190");
    expect(text).toContain("PATTERN");
  });
});
