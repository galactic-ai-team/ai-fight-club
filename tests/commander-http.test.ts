import { describe, expect, it } from "vitest";
import { handleApi, type ApiRequest } from "../src/commander/http.ts";
import { MemoryStore } from "../src/commander/store.ts";
import { hashToken } from "../src/commander/codes.ts";
import { parseCommand } from "../src/commander/parse.ts";

function req(partial: Partial<ApiRequest> & Pick<ApiRequest, "method" | "path">): ApiRequest {
  return {
    query: {},
    headers: {},
    body: null,
    ...partial,
  };
}

async function call(store: MemoryStore, r: ApiRequest, now = 1_000_000) {
  return handleApi(r, store, now);
}

describe("commander HTTP API", () => {
  it("creates a match, returns secrets once, and never again on GET", async () => {
    const store = new MemoryStore();
    const created = await call(store, req({
      method: "POST",
      path: "/api/match",
      body: {
        seed: 99,
        window: "3s",
        p1Controller: "Lumi",
        p2Controller: "GPT-6",
        p1Character: "Ion",
        p2Character: "Quark",
      },
    }));
    expect(created.status).toBe(201);
    const body = created.body as Record<string, unknown>;
    expect(typeof body.id).toBe("string");
    const secrets = body.secrets as { p1Code: string; p2Code: string; hostToken: string };
    expect(secrets.p1Code.length).toBeGreaterThan(16);
    expect(secrets.p2Code).not.toBe(secrets.p1Code);
    expect(secrets.hostToken.length).toBeGreaterThan(16);
    expect(body.watchPath).toContain(body.id);

    const got = await call(store, req({ method: "GET", path: `/api/match/${body.id}` }));
    expect(got.status).toBe(200);
    const g = got.body as Record<string, unknown>;
    expect(g.secrets).toBeUndefined();
    const dumped = JSON.stringify(g);
    expect(dumped).not.toContain(secrets.p1Code);
    expect(dumped).not.toContain(secrets.p2Code);
    expect(dumped).not.toContain(secrets.hostToken);
    expect(dumped).not.toContain("CodeHash");
    expect(dumped).not.toContain("codeHash");
  });

  it("rejects a bad join code and accepts a good one", async () => {
    const store = new MemoryStore();
    const created = await call(store, req({
      method: "POST", path: "/api/match", body: { seed: 1, window: "off" },
    }));
    const { id, secrets } = created.body as {
      id: string;
      secrets: { p1Code: string; p2Code: string; hostToken: string };
    };

    const bad = await call(store, req({
      method: "POST",
      path: `/api/match/${id}/command`,
      body: { fighter: "p1", joinCode: "nope", text: "STANCE rush", issuedAtMs: 999_000 },
    }));
    expect(bad.status).toBe(401);

    const good = await call(store, req({
      method: "POST",
      path: `/api/match/${id}/command`,
      headers: { authorization: `Bearer ${secrets.p1Code}` },
      body: { fighter: "p1", text: "STANCE rush\nAGGRESSION 0.9\nTAUNT closing", issuedAtMs: 999_000 },
    }));
    expect(good.status).toBe(200);
    const gb = good.body as Record<string, unknown>;
    expect(gb.ok).toBe(true);
    expect(gb.latencyMs).toBe(1000);
    expect(gb.seq).toBe(1);

    const wrongSide = await call(store, req({
      method: "POST",
      path: `/api/match/${id}/command`,
      body: { fighter: "p2", joinCode: secrets.p1Code, text: "STANCE turtle" },
    }));
    expect(wrongSide.status).toBe(401);
  });

  it("host pulls commands and publishes state the GET can read as text", async () => {
    const store = new MemoryStore();
    const created = await call(store, req({
      method: "POST", path: "/api/match",
      body: { seed: 5, window: "5s", p1Controller: "Lumi", p2Controller: "GPT-6" },
    }));
    const { id, secrets } = created.body as {
      id: string;
      secrets: { p1Code: string; p2Code: string; hostToken: string };
    };

    await call(store, req({
      method: "POST", path: `/api/match/${id}/command`,
      body: { fighter: "p1", joinCode: secrets.p1Code, text: "STANCE rush" },
    }));
    await call(store, req({
      method: "POST", path: `/api/match/${id}/command`,
      body: { fighter: "p2", joinCode: secrets.p2Code, command: { stance: "turtle", taunt: "hold" } },
    }));

    const noHost = await call(store, req({
      method: "GET", path: `/api/match/${id}/commands`,
    }));
    expect(noHost.status).toBe(401);

    const pull = await call(store, req({
      method: "GET",
      path: `/api/match/${id}/commands`,
      query: { since: "0" },
      headers: { authorization: `Bearer ${secrets.hostToken}` },
    }));
    expect(pull.status).toBe(200);
    const cmds = (pull.body as { commands: Array<{ side: string; raw: string; seq: number }> }).commands;
    expect(cmds).toHaveLength(2);
    expect(cmds.map((c) => c.side).sort()).toEqual(["p1", "p2"]);

    const published = await call(store, req({
      method: "POST",
      path: `/api/match/${id}/state`,
      headers: { authorization: `Bearer ${secrets.hostToken}` },
      body: {
        state: {
          id,
          tick: 240,
          seed: 5,
          phase: "fight",
          matchPhase: "fight",
          round: 1,
          timeLeftTicks: 3000,
          p1Wins: 0,
          p2Wins: 0,
          over: false,
          winner: null,
          window: { mode: "5s", open: false, index: 0, openedAtTick: -1, remainingMs: 0, p1Submitted: false, p2Submitted: false },
          p1: {
            character: "Ion", controller: "Lumi", health: 900, maxHealth: 1000,
            meter: 10, maxMeter: 100, x: 400, y: 440, vx: 0, vy: 0, facing: 1,
            state: "walk", attack: null, attackPhase: null, airborne: false, blocking: false,
            combo: 0, lastMoves: ["walk"], command: { stance: "rush", spacing: 48, aggression: 0.8, goFor: "none", taunt: "" },
            commandSeq: 1, latencyMs: 40, taunt: "", inControl: "Lumi",
          },
          p2: {
            character: "Quark", controller: "GPT-6", health: 1000, maxHealth: 1000,
            meter: 0, maxMeter: 100, x: 700, y: 440, vx: 0, vy: 0, facing: -1,
            state: "block", attack: null, attackPhase: null, airborne: false, blocking: true,
            combo: 0, lastMoves: ["block"], command: { stance: "turtle", spacing: 44, aggression: 0.35, goFor: "none", taunt: "hold" },
            commandSeq: 2, latencyMs: 80, taunt: "hold", inControl: "GPT-6",
          },
          p1Bot: "rusher", p2Bot: "zoner", events: [],
          summary: "MATCH demo  tick=240  P1 rush  P2 turtle",
          hostPresent: true, updatedAtMs: 1_000_000, startedAtMs: 1,
        },
      },
    }));
    expect(published.status).toBe(200);

    const st = await call(store, req({
      method: "GET",
      path: `/api/match/${id}/state`,
      headers: { accept: "text/plain" },
    }));
    expect(st.status).toBe(200);
    expect(String(st.body)).toContain("MATCH demo");
    expect(String(st.body)).toContain("P1 rush");

    const listed = await call(store, req({ method: "GET", path: "/api/match" }));
    const matches = (listed.body as { matches: Array<{ id: string; status: string }> }).matches;
    expect(matches.some((m) => m.id === id && m.status === "live")).toBe(true);
  });

  it("marks commands applied at a tick and OPTIONS is CORS-friendly", async () => {
    const store = new MemoryStore();
    const created = await call(store, req({ method: "POST", path: "/api/match", body: { seed: 2 } }));
    const { id, secrets } = created.body as { id: string; secrets: { p1Code: string; hostToken: string } };
    await call(store, req({
      method: "POST", path: `/api/match/${id}/command`,
      body: { fighter: "p1", joinCode: secrets.p1Code, text: "STANCE bait" },
    }));
    const applied = await call(store, req({
      method: "POST",
      path: `/api/match/${id}/applied`,
      headers: { authorization: `Bearer ${secrets.hostToken}` },
      body: { seq: 1, tick: 180 },
    }));
    expect(applied.status).toBe(200);
    const opt = await call(store, req({ method: "OPTIONS", path: "/api/match" }));
    expect(opt.status).toBe(204);
    expect(opt.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("rejects a malformed command with 400", async () => {
    const store = new MemoryStore();
    const created = await call(store, req({ method: "POST", path: "/api/match", body: { seed: 3 } }));
    const { id, secrets } = created.body as { id: string; secrets: { p1Code: string } };
    const bad = await call(store, req({
      method: "POST", path: `/api/match/${id}/command`,
      body: { fighter: "p1", joinCode: secrets.p1Code, text: "????" },
    }));
    expect(bad.status).toBe(400);
  });

  it("hashes join codes so the store never keeps the raw secret", async () => {
    const store = new MemoryStore();
    const created = await call(store, req({ method: "POST", path: "/api/match", body: { seed: 8 } }));
    const { id, secrets } = created.body as { id: string; secrets: { p1Code: string } };
    const rec = store.matches.get(id);
    expect(rec).toBeTruthy();
    expect(JSON.stringify(rec)).not.toContain(secrets.p1Code);
    expect(rec!.p1CodeHash).toBe(await hashToken(secrets.p1Code));
    // sanity: parser still used
    expect(parseCommand("STANCE zone").ok).toBe(true);
  });
});

  it("lets a spectator volunteer as host when none is active, and rejects a second volunteer", async () => {
    const store = new MemoryStore();
    const created = await call(store, req({ method: "POST", path: "/api/match", body: { seed: 21, window: "off" } }));
    const { id, secrets } = created.body as { id: string; secrets: { hostToken: string } };
    const first = await call(store, req({ method: "POST", path: `/api/match/${id}/volunteer` }));
    expect(first.status).toBe(200);
    const body = first.body as { volunteerToken: string; volunteer: boolean; seed: number };
    expect(body.volunteer).toBe(true);
    expect(body.volunteerToken).toBeTruthy();
    expect(body.volunteerToken).not.toBe(secrets.hostToken);
    const second = await call(store, req({ method: "POST", path: `/api/match/${id}/volunteer` }));
    expect(second.status).toBe(409);
    // Volunteer can pull and publish.
    const pulled = await call(store, req({
      method: "GET",
      path: `/api/match/${id}/commands`,
      headers: { authorization: `Bearer ${body.volunteerToken}` },
    }));
    expect(pulled.status).toBe(200);
    // After the host goes stale, a new volunteer is allowed.
    const later = 1_000_000 + 20_000;
    const third = await call(store, req({ method: "POST", path: `/api/match/${id}/volunteer` }), later);
    expect(third.status).toBe(200);
    const newTok = (third.body as { volunteerToken: string }).volunteerToken;
    expect(newTok).not.toBe(body.volunteerToken);
    // Old lease is revoked.
    const stale = await call(store, req({
      method: "GET",
      path: `/api/match/${id}/commands`,
      headers: { authorization: `Bearer ${body.volunteerToken}` },
    }), later);
    expect(stale.status).toBe(401);
    // Original host token can reclaim and revoke the volunteer.
    const reclaim = await call(store, req({
      method: "POST",
      path: `/api/match/${id}/host`,
      body: { hostToken: secrets.hostToken },
    }), later);
    expect(reclaim.status).toBe(200);
    const volAfter = await call(store, req({
      method: "GET",
      path: `/api/match/${id}/commands`,
      headers: { authorization: `Bearer ${newTok}` },
    }), later + 10);
    expect(volAfter.status).toBe(401);
  });


describe("open-seat GET /cmd", () => {
  it("creates with openSeat p2, accepts GET /cmd on p2, and rejects p1 without a code", async () => {
    const store = new MemoryStore();
    const created = await call(store, req({
      method: "POST",
      path: "/api/match",
      body: {
        seed: 42,
        window: "5s",
        p1Controller: "Lumi",
        p2Controller: "Nova",
        p1Bot: "lumi",
        p2Bot: "rusher",
        openSeat: "p2",
      },
    }));
    expect(created.status).toBe(201);
    const body = created.body as {
      id: string;
      openSeat: string;
      secrets: { p1Code: string; p2Code: string; hostToken: string };
    };
    expect(body.openSeat).toBe("p2");
    const { id, secrets } = body;
    expect(JSON.stringify(await call(store, req({ method: "GET", path: `/api/match/${id}` })))).not.toContain(secrets.p1Code);

    const p2 = await call(store, req({
      method: "GET",
      path: `/api/match/${id}/cmd`,
      query: {
        fighter: "p2",
        stance: "rush",
        spacing: "120",
        aggression: "0.8",
        goFor: "special",
        taunt: "coming in",
      },
    }));
    expect(p2.status).toBe(200);
    expect(p2.headers["Content-Type"]).toMatch(/text\/plain/);
    const p2text = String(p2.body);
    expect(p2text).toMatch(/^OK seq=1 fighter=p2 /);
    expect(p2text).toContain("rush");
    expect(p2text).toContain("coming in");
    expect(p2text).toContain(`MATCH ${id}`);
    expect(p2text).toContain("openSeat=p2");
    expect(p2text).not.toContain(secrets.p1Code);
    expect(p2text).not.toContain(secrets.p2Code);
    expect(p2text).not.toContain(secrets.hostToken);

    const st = await call(store, req({ method: "GET", path: `/api/match/${id}/state` }));
    expect(st.status).toBe(200);
    const sj = st.body as {
      openSeat: string;
      commandCount: number;
      latest: { p2: { seq: number; raw: string; appliedTick: number; receivedAtMs: number } | null; p1: unknown };
    };
    expect(sj.openSeat).toBe("p2");
    expect(sj.commandCount).toBe(1);
    expect(sj.latest.p2?.seq).toBe(1);
    expect(sj.latest.p2?.appliedTick).toBe(-1);
    expect(sj.latest.p2?.receivedAtMs).toBe(1_000_000);
    expect(sj.latest.p2?.raw).toContain("rush");
    expect(sj.latest.p1).toBeNull();

    const p1 = await call(store, req({
      method: "GET",
      path: `/api/match/${id}/cmd`,
      query: { fighter: "p1", stance: "turtle" },
    }));
    expect(p1.status).toBe(403);
    expect(String(p1.body)).toMatch(/not an open seat/i);
    expect(String(p1.body)).not.toContain(secrets.p1Code);

    const rec = store.matches.get(id)!;
    expect(rec.log).toHaveLength(1);
    expect(rec.log[0]!.side).toBe("p2");
    expect(rec.pending).toHaveLength(1);
  });

  it("rate-limits open-seat GET /cmd to 1 per second per fighter and caps sanitized taunts at 60 chars", async () => {
    const store = new MemoryStore();
    const created = await call(store, req({
      method: "POST", path: "/api/match", body: { seed: 7, openSeat: "p2" },
    }), 1_000_000);
    const { id } = created.body as { id: string };

    const first = await call(store, req({
      method: "GET", path: `/api/match/${id}/cmd`,
      query: { fighter: "p2", stance: "zone", taunt: "x".repeat(80) + " <script>" },
    }), 1_000_000);
    expect(first.status).toBe(200);
    const ack = String(first.body);
    expect(ack).toContain("taunt=" + "x".repeat(60));
    expect(ack).not.toContain("x".repeat(61));
    expect(ack).not.toContain("<");
    expect(ack).not.toContain("script");

    const tooSoon = await call(store, req({
      method: "GET", path: `/api/match/${id}/cmd`,
      query: { fighter: "p2", stance: "rush" },
    }), 1_000_500);
    expect(tooSoon.status).toBe(429);
    expect(String(tooSoon.body)).toMatch(/too many commands/i);

    const later = await call(store, req({
      method: "GET", path: `/api/match/${id}/cmd`,
      query: { fighter: "p2", stance: "rush" },
    }), 1_001_000);
    expect(later.status).toBe(200);
    expect(String(later.body)).toMatch(/^OK seq=2 /);
  });

  it("rejects GET /cmd on a match with no open seat, and returns LLM text from ?format=text", async () => {
    const store = new MemoryStore();
    const created = await call(store, req({
      method: "POST", path: "/api/match", body: { seed: 3, window: "5s" },
    }));
    const { id } = created.body as { id: string };
    const closed = await call(store, req({
      method: "GET", path: `/api/match/${id}/cmd`, query: { fighter: "p2", stance: "rush" },
    }));
    expect(closed.status).toBe(403);

    const txt = await call(store, req({
      method: "GET",
      path: `/api/match/${id}/state`,
      query: { format: "text" },
    }));
    expect(txt.status).toBe(200);
    expect(txt.headers["Content-Type"]).toMatch(/text\/plain/);
    expect(String(txt.body)).toContain(`MATCH ${id}`);
    expect(String(txt.body)).toContain("no state yet");

    const bad = await call(store, req({
      method: "POST", path: "/api/match", body: { seed: 4, openSeat: "p3" },
    }));
    expect(bad.status).toBe(400);
  });
});


describe("startWhenReady create flag", () => {
  it("stores startWhenReady and readyTimeoutMs and returns them on create, state, and host claim", async () => {
    const store = new MemoryStore();
    const created = await call(store, req({
      method: "POST",
      path: "/api/match",
      body: { seed: 11, window: "off", startWhenReady: true, readyTimeoutMs: 30_000 },
    }));
    expect(created.status).toBe(201);
    const body = created.body as { id: string; startWhenReady: boolean; readyTimeoutMs: number; secrets: { hostToken: string } };
    expect(body.startWhenReady).toBe(true);
    expect(body.readyTimeoutMs).toBe(30_000);

    const st = await call(store, req({ method: "GET", path: `/api/match/${body.id}/state` }));
    expect(st.status).toBe(200);
    const s = st.body as { startWhenReady: boolean; readyTimeoutMs: number };
    expect(s.startWhenReady).toBe(true);
    expect(s.readyTimeoutMs).toBe(30_000);

    const claimed = await call(store, req({
      method: "POST",
      path: `/api/match/${body.id}/host`,
      body: { hostToken: body.secrets.hostToken },
    }));
    expect(claimed.status).toBe(200);
    const c = claimed.body as { startWhenReady: boolean; readyTimeoutMs: number };
    expect(c.startWhenReady).toBe(true);
    expect(c.readyTimeoutMs).toBe(30_000);
  });

  it("treats a ready-timeout under 1000 as seconds and defaults the flag to off", async () => {
    const store = new MemoryStore();
    const created = await call(store, req({
      method: "POST",
      path: "/api/match",
      body: { seed: 12, readyTimeoutSeconds: 45 },
    }));
    const body = created.body as { startWhenReady: boolean; readyTimeoutMs: number };
    expect(body.startWhenReady).toBe(false);
    expect(body.readyTimeoutMs).toBe(45_000);
  });
});
