/**
 * Vite dev/preview middleware that serves the Commander HTTP API from the
 * in-process memory store. Production uses the Vercel /api functions instead.
 */
import { handleApi, type ApiRequest } from "./http.ts";
import { getSharedMemoryStore } from "./store.ts";

type MiddlewareReq = {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  on: (event: string, fn: (...args: unknown[]) => void) => void;
};

type MiddlewareRes = {
  statusCode: number;
  setHeader: (k: string, v: string) => void;
  end: (body?: string) => void;
};

async function readBody(req: MiddlewareReq): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on("data", (c: unknown) => {
      if (c instanceof Uint8Array) chunks.push(c);
      else if (typeof c === "string") chunks.push(new TextEncoder().encode(c));
    });
    req.on("end", () => resolve());
    req.on("error", (e: unknown) => reject(e));
  });
  if (!chunks.length) return null;
  let n = 0;
  for (const c of chunks) n += c.length;
  const all = new Uint8Array(n);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.length;
  }
  const text = new TextDecoder().decode(all);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function headersOf(req: MiddlewareReq): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers ?? {})) {
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v) && v[0]) out[k] = v[0];
  }
  return out;
}

function queryOf(url: string): Record<string, string> {
  const q = url.indexOf("?");
  if (q < 0) return {};
  const out: Record<string, string> = {};
  const sp = new URLSearchParams(url.slice(q + 1));
  sp.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

async function run(req: MiddlewareReq, res: MiddlewareRes): Promise<boolean> {
  const url = req.url ?? "/";
  const path = url.split("?")[0] ?? "/";
  if (!path.startsWith("/api/")) return false;
  const apiReq: ApiRequest = {
    method: (req.method ?? "GET").toUpperCase(),
    path,
    query: queryOf(url),
    headers: headersOf(req),
    body: req.method === "GET" || req.method === "OPTIONS" ? null : await readBody(req),
  };
  const result = await handleApi(apiReq, getSharedMemoryStore());
  for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
  res.statusCode = result.status;
  if (typeof result.body === "string") res.end(result.body);
  else if (result.body === "" || result.body === null || result.body === undefined) res.end();
  else res.end(JSON.stringify(result.body));
  return true;
}

export function commanderDevPlugin(): { name: string; configureServer?: unknown; configurePreviewServer?: unknown } {
  const attach = (server: { middlewares: { use: (fn: unknown) => void } }) => {
    server.middlewares.use((req: MiddlewareReq, res: MiddlewareRes, next: () => void) => {
      const url = req.url ?? "/";
      const path = url.split("?")[0] ?? "/";
      if (!path.startsWith("/api/")) {
        next();
        return;
      }
      void run(req, res).catch((err: unknown) => {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        const message = err instanceof Error ? err.message : "internal error";
        res.end(JSON.stringify({ error: message }));
      });
    });
  };
  return {
    name: "afc-commander-api",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
