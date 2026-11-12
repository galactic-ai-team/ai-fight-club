import {
  MemoryStore,
  StoreError,
  type CreatedMatch,
  type MatchStore,
  type StoredMatch,
} from "./store.ts";
import type { CommandRecord, CreateMatchRequest, MatchPublicState, PublicMatchListItem } from "./types.ts";

function env(name: string): string {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.[name] ?? "";
}

export function createSupabaseStore(): MatchStore {
  const url = env("SUPABASE_URL").replace(/\/$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_ANON_KEY");
  const secret = env("AFC_STORE_SECRET");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and a Supabase key are required for the supabase store");
  }
  if (!secret) {
    throw new Error("AFC_STORE_SECRET is required for the supabase store (server-only, not the service role)");
  }
  return new SupabaseRestStore(url, key, secret);
}

interface Versioned {
  record: StoredMatch;
  version: number;
}

class SupabaseRestStore implements MatchStore {
  constructor(
    private url: string,
    private key: string,
    private secret: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      "Accept-Profile": "public",
      "Content-Profile": "public",
    };
  }

  private async rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401 || /unauthorized/i.test(text)) {
        throw new StoreError(401, "store unauthorized");
      }
      throw new StoreError(res.status === 404 ? 404 : 502, `supabase ${name} failed (${res.status}): ${text.slice(0, 200)}`);
    }
    if (res.status === 204) return null as T;
    const text = await res.text();
    if (!text) return null as T;
    return JSON.parse(text) as T;
  }

  private async getPrivate(id: string): Promise<Versioned | null> {
    const row = await this.rpc<{ record: StoredMatch; version: number } | null>("afc_get_private", {
      p_secret: this.secret,
      p_id: id,
    });
    if (!row || !row.record || !row.record.id) return null;
    return { record: row.record, version: Number(row.version) || 1 };
  }

  private async insertPrivate(record: StoredMatch): Promise<void> {
    const r = await this.rpc<{ ok: boolean; error?: string; version?: number }>("afc_insert_private", {
      p_secret: this.secret,
      p_id: record.id,
      p_payload: record,
      p_expires: new Date(record.expiresAtMs).toISOString(),
    });
    if (!r || r.ok === false) throw new StoreError(409, r?.error ?? "create conflict");
  }

  private async putPrivate(record: StoredMatch, expected: number): Promise<number | null> {
    const r = await this.rpc<{ ok: boolean; error?: string; version?: number }>("afc_put_private", {
      p_secret: this.secret,
      p_id: record.id,
      p_payload: record,
      p_expires: new Date(record.expiresAtMs).toISOString(),
      p_expected_version: expected,
    });
    if (!r || r.ok === false) return null;
    return Number(r.version) || expected + 1;
  }

  private memFrom(record: StoredMatch): MemoryStore {
    const mem = new MemoryStore();
    mem.loadRecord(structuredClone(record));
    return mem;
  }

  private async withFresh<T>(id: string, _nowMs: number, fn: (mem: MemoryStore) => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < 6; i++) {
      const loaded = await this.getPrivate(id);
      if (!loaded) throw new StoreError(404, "match not found");
      const mem = this.memFrom(loaded.record);
      const result = await fn(mem);
      const next = mem.exportRecord(id);
      if (!next) throw new StoreError(500, "record disappeared");
      const ver = await this.putPrivate(next, loaded.version);
      if (ver !== null) return result;
      lastErr = new StoreError(409, "conflict");
    }
    throw lastErr instanceof StoreError ? lastErr : new StoreError(409, "conflict after retries");
  }

  async create(input: CreateMatchRequest, nowMs?: number): Promise<CreatedMatch> {
    const mem = new MemoryStore();
    const created = await mem.create(input, nowMs);
    await this.insertPrivate(created.record);
    return created;
  }

  async get(id: string, nowMs = Date.now()): Promise<StoredMatch | null> {
    const loaded = await this.getPrivate(id);
    if (!loaded) return null;
    const mem = this.memFrom(loaded.record);
    return mem.get(id, nowMs);
  }

  async listLive(nowMs = Date.now()): Promise<PublicMatchListItem[]> {
    const iso = new Date(nowMs).toISOString();
    const res = await fetch(
      `${this.url}/rest/v1/afc_public_state?expires_at=gte.${encodeURIComponent(iso)}&select=*&order=updated_at.desc&limit=50`,
      { headers: this.headers() },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new StoreError(502, `supabase list failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const rows = (await res.json()) as Array<{
      id: string;
      status: string;
      seed: number;
      window_mode: string;
      p1: { character?: string; controller?: string };
      p2: { character?: string; controller?: string };
      score: string;
      tick: number;
      host_present: boolean;
      watch_path: string;
      updated_at: string;
      state: MatchPublicState | null;
    }>;
    return rows.map((r) => {
      const hostPresent = !!r.host_present;
      let status = r.status as PublicMatchListItem["status"];
      if (!hostPresent && (status === "live" || status === "waiting")) status = "stale";
      if (status !== "waiting" && status !== "live" && status !== "ended" && status !== "stale") {
        status = "waiting";
      }
      return {
        id: r.id,
        p1: { character: r.p1?.character ?? "Ion", controller: r.p1?.controller ?? "P1" },
        p2: { character: r.p2?.character ?? "Quark", controller: r.p2?.controller ?? "P2" },
        status,
        score: r.score ?? "0-0",
        tick: r.tick ?? 0,
        windowMode: (r.window_mode as PublicMatchListItem["windowMode"]) ?? "off",
        watchPath: r.watch_path || `/watch.html?m=${encodeURIComponent(r.id)}`,
        updatedAtMs: Date.parse(r.updated_at) || nowMs,
      };
    });
  }

  async submitCommand(
    id: string,
    side: "p1" | "p2",
    code: string,
    rawCommand: unknown,
    issuedAtMs: number | null,
    nowMs = Date.now(),
  ): Promise<CommandRecord> {
    return this.withFresh(id, nowMs, (mem) => mem.submitCommand(id, side, code, rawCommand, issuedAtMs, nowMs));
  }

  async pullPending(id: string, hostToken: string, sinceSeq: number, nowMs = Date.now()): Promise<CommandRecord[]> {
    return this.withFresh(id, nowMs, (mem) => mem.pullPending(id, hostToken, sinceSeq, nowMs));
  }

  async publishState(id: string, hostToken: string, state: MatchPublicState, nowMs = Date.now()): Promise<void> {
    return this.withFresh(id, nowMs, (mem) => mem.publishState(id, hostToken, state, nowMs));
  }

  async claimHost(id: string, hostToken: string, nowMs = Date.now()): Promise<boolean> {
    return this.withFresh(id, nowMs, (mem) => mem.claimHost(id, hostToken, nowMs));
  }

  async volunteerHost(id: string, nowMs = Date.now()): Promise<{ token: string; record: StoredMatch }> {
    return this.withFresh(id, nowMs, (mem) => mem.volunteerHost(id, nowMs));
  }

  async markApplied(id: string, hostToken: string, seq: number, tick: number, nowMs = Date.now()): Promise<void> {
    return this.withFresh(id, nowMs, (mem) => mem.markApplied(id, hostToken, seq, tick, nowMs));
  }
}

