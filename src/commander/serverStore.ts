import { getSharedMemoryStore, type MatchStore } from "./store.ts";

function env(name: string): string {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.[name] ?? "";
}

/**
 * Pick the process-wide store.
 * - Vite dev/preview: in-process memory (single Node process, reliable).
 * - Vercel: memory is only reliable while a single function instance stays warm.
 *   If a durable backend is configured via env, it is preferred.
 *   `AFC_STORE` is "memory" | "supabase" | "blob". Auto-detects otherwise.
 */
export async function getServerStore(): Promise<MatchStore> {
  const g = globalThis as { __afcStore?: MatchStore; __afcStoreKind?: string };
  const kind = env("AFC_STORE") || detectKind();
  if (g.__afcStore && g.__afcStoreKind === kind) return g.__afcStore;

  if (kind === "supabase") {
    const { createSupabaseStore } = await import("./supabaseStore.ts");
    const store = createSupabaseStore();
    g.__afcStore = store;
    g.__afcStoreKind = kind;
    return store;
  }
  if (kind === "blob") {
    const { createBlobStore } = await import("./blobStore.ts");
    const store = createBlobStore();
    g.__afcStore = store;
    g.__afcStoreKind = kind;
    return store;
  }
  const store = getSharedMemoryStore();
  g.__afcStore = store;
  g.__afcStoreKind = "memory";
  return store;
}

function detectKind(): string {
  if (env("SUPABASE_URL") && (env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_ANON_KEY"))) {
    return "supabase";
  }
  if (env("BLOB_READ_WRITE_TOKEN")) return "blob";
  return "memory";
}

export function storeKind(): string {
  return env("AFC_STORE") || detectKind();
}
