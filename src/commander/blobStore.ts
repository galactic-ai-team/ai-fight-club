import { MemoryStore, type MatchStore, type StoredMatch } from "./store.ts";

function env(name: string): string {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.[name] ?? "";
}

/**
 * Private-blob JSON store. Each match is one object; an index lists ids.
 * Uses the Vercel Blob REST API (BLOB_READ_WRITE_TOKEN).
 */
export function createBlobStore(): MatchStore {
  const token = env("BLOB_READ_WRITE_TOKEN");
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is required for the blob store");
  return new BlobStore(token);
}

class BlobStore extends MemoryStore {
  private token: string;
  private loaded = false;

  constructor(token: string) {
    super();
    this.token = token;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    // Best-effort load of the index; empty is fine on first run.
    try {
      const idx = await this.getJson<{ ids: string[] }>("afc/index.json");
      if (idx?.ids) {
        for (const id of idx.ids) {
          const rec = await this.getJson<StoredMatch>(`afc/matches/${id}.json`);
          if (rec && rec.id) this.matches.set(rec.id, rec);
        }
      }
    } catch {
      // first run or expired blobs
    }
    this.loaded = true;
  }

  private async getJson<T>(pathname: string): Promise<T | null> {
    const url = await this.headUrl(pathname);
    if (!url) return null;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as T;
  }

  private async headUrl(pathname: string): Promise<string | null> {
    // List a single pathname via the blob API.
    const res = await fetch(
      `https://vercel.com/api/blob?prefix=${encodeURIComponent(pathname)}&limit=5`,
      { headers: { Authorization: `Bearer ${this.token}` } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { blobs?: Array<{ pathname: string; url: string }> };
    const exact = data.blobs?.find((b) => b.pathname === pathname);
    return exact?.url ?? null;
  }

  private async putJson(pathname: string, value: unknown): Promise<void> {
    const res = await fetch("https://blob.vercel-storage.com", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "x-vercel-filename": pathname,
        "x-content-type": "application/json",
        "x-add-random-suffix": "false",
        "x-allow-overwrite": "true",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(value),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`blob put ${pathname} failed (${res.status}): ${t.slice(0, 200)}`);
    }
  }

  private async persist(id: string): Promise<void> {
    const record = this.matches.get(id);
    if (record) await this.putJson(`afc/matches/${id}.json`, record);
    await this.putJson("afc/index.json", { ids: [...this.matches.keys()] });
  }

  override async create(input: Parameters<MemoryStore["create"]>[0], nowMs?: number) {
    await this.ensureLoaded();
    const created = await super.create(input, nowMs);
    await this.persist(created.record.id);
    return created;
  }

  override async get(id: string, nowMs?: number) {
    await this.ensureLoaded();
    const local = await super.get(id, nowMs);
    if (local) return local;
    const rec = await this.getJson<StoredMatch>(`afc/matches/${id}.json`);
    if (rec && rec.id) {
      this.matches.set(rec.id, rec);
      return super.get(id, nowMs);
    }
    return null;
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
