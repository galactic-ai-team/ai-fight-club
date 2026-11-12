import { MemoryStore, type MatchStore } from "./store.ts";

/**
 * Supabase-backed store. When env is configured and tables exist, this will be
 * swapped for a real REST implementation. Until then we keep the MatchStore
 * contract and throw a clear error if someone forces AFC_STORE=supabase
 * without credentials — createSupabaseStore is only called after detectKind.
 *
 * The real REST implementation is in the same module below and is used when
 * SUPABASE_URL is set.
 */

function env(name: string): string {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.[name] ?? "";
}

export function createSupabaseStore(): MatchStore {
  const url = env("SUPABASE_URL").replace(/\/$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_ANON_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and a Supabase key are required for the supabase store");
  }
  // Imported lazily from the rest implementation.
  return new SupabaseRestStore(url, key);
}

class SupabaseRestStore extends MemoryStore {
  private url: string;
  private key: string;
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  constructor(url: string, key: string) {
    super();
    this.url = url;
    this.key = key;
  }

  private headers(): Record<string, string> {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      "Accept-Profile": "public",
      "Content-Profile": "public",
    };
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.refresh();
    try {
      await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  private async refresh(): Promise<void> {
    const res = await fetch(
      `${this.url}/rest/v1/afc_matches?select=id,payload&expires_at=gte.${encodeURIComponent(new Date().toISOString())}`,
      { headers: this.headers() },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`supabase list failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const rows = (await res.json()) as Array<{ id: string; payload: unknown }>;
    this.matches.clear();
    for (const row of rows) {
      if (row && row.payload && typeof row.payload === "object") {
        this.matches.set(row.id, row.payload as never);
      }
    }
    this.loaded = true;
  }

  private async persist(id: string): Promise<void> {
    const record = this.matches.get(id);
    if (!record) return;
    const res = await fetch(`${this.url}/rest/v1/afc_matches?id=eq.${encodeURIComponent(id)}`, {
      method: "POST",
      headers: {
        ...this.headers(),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        id,
        payload: record,
        status: record.status,
        expires_at: new Date(record.expiresAtMs).toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      // Upsert via POST may need on_conflict; try PATCH then INSERT.
      if (res.status === 409 || res.status === 405 || res.status === 400) {
        const patch = await fetch(`${this.url}/rest/v1/afc_matches?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: this.headers(),
          body: JSON.stringify({
            payload: record,
            status: record.status,
            expires_at: new Date(record.expiresAtMs).toISOString(),
            updated_at: new Date().toISOString(),
          }),
        });
        if (patch.ok) return;
        if (patch.status === 404 || patch.status === 406) {
          const ins = await fetch(`${this.url}/rest/v1/afc_matches`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({
              id,
              payload: record,
              status: record.status,
              expires_at: new Date(record.expiresAtMs).toISOString(),
              updated_at: new Date().toISOString(),
            }),
          });
          if (!ins.ok) {
            const t = await ins.text();
            throw new Error(`supabase insert failed (${ins.status}): ${t.slice(0, 200)}`);
          }
          return;
        }
        const t = await patch.text();
        throw new Error(`supabase patch failed (${patch.status}): ${t.slice(0, 200)}`);
      }
      const t = await res.text();
      throw new Error(`supabase upsert failed (${res.status}): ${t.slice(0, 200)}`);
    }
  }

  override async create(input: Parameters<MemoryStore["create"]>[0], nowMs?: number) {
    await this.ensureLoaded();
    const created = await super.create(input, nowMs);
    await this.persist(created.record.id);
    return created;
  }

  override async get(id: string, nowMs?: number) {
    await this.ensureLoaded();
    return super.get(id, nowMs);
  }

  override async listLive(nowMs?: number) {
    await this.ensureLoaded();
    return super.listLive(nowMs);
  }

  override async submitCommand(
    id: string, side: "p1" | "p2", code: string, raw: unknown, issued: number | null, nowMs?: number,
  ) {
    await this.ensureLoaded();
    const rec = await super.submitCommand(id, side, code, raw, issued, nowMs);
    await this.persist(id);
    return rec;
  }

  override async pullPending(id: string, hostToken: string, sinceSeq: number, nowMs?: number) {
    await this.ensureLoaded();
    const rec = await super.pullPending(id, hostToken, sinceSeq, nowMs);
    await this.persist(id);
    return rec;
  }

  override async publishState(id: string, hostToken: string, state: Parameters<MemoryStore["publishState"]>[2], nowMs?: number) {
    await this.ensureLoaded();
    await super.publishState(id, hostToken, state, nowMs);
    await this.persist(id);
  }

  override async claimHost(id: string, hostToken: string, nowMs?: number) {
    await this.ensureLoaded();
    const ok = await super.claimHost(id, hostToken, nowMs);
    await this.persist(id);
    return ok;
  }

  override async markApplied(id: string, hostToken: string, seq: number, tick: number, nowMs?: number) {
    await this.ensureLoaded();
    await super.markApplied(id, hostToken, seq, tick, nowMs);
    await this.persist(id);
  }
}
