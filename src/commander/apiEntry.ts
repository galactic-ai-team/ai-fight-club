import { handleApi, type ApiRequest } from "./http.ts";
import { getServerStore } from "./serverStore.ts";

type VercelReq = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[]>;
  body?: unknown;
};

type VercelRes = {
  status: (n: number) => VercelRes;
  setHeader: (k: string, v: string) => void;
  send: (b: string) => void;
  end: (b?: string) => void;
};

function flat(h: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h ?? {})) {
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v) && v[0]) out[k] = v[0];
  }
  return out;
}

function queryOf(req: VercelReq): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query ?? {})) {
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v) && v[0]) out[k] = v[0];
  }
  // path-style fallback from url
  const url = req.url ?? "";
  const q = url.indexOf("?");
  if (q >= 0) {
    const sp = new URLSearchParams(url.slice(q + 1));
    sp.forEach((val, key) => {
      if (!(key in out)) out[key] = val;
    });
  }
  return out;
}

function pathOf(req: VercelReq): string {
  const raw = (req.url ?? "/").split("?")[0] ?? "/";
  // Vercel may pass /match/id/command when this file is at api/[[...path]]
  if (raw.startsWith("/api/")) return raw;
  return "/api" + (raw.startsWith("/") ? raw : `/${raw}`);
}

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  const apiReq: ApiRequest = {
    method: (req.method ?? "GET").toUpperCase(),
    path: pathOf(req),
    query: queryOf(req),
    headers: flat(req.headers),
    body: req.body ?? null,
  };
  // Some runtimes leave the body as a raw string.
  if (typeof apiReq.body === "string" && apiReq.body) {
    try {
      apiReq.body = JSON.parse(apiReq.body);
    } catch {
      // keep as text (command grammar)
    }
  }
  const store = await getServerStore();
  const result = await handleApi(apiReq, store);
  for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
  const payload =
    typeof result.body === "string" ? result.body
    : result.body === "" || result.body === null || result.body === undefined ? ""
    : JSON.stringify(result.body);
  res.status(result.status).send(payload);
}
