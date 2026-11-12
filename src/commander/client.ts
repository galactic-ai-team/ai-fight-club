import type { CommandRecord, MatchPublicState, PublicMatchListItem, WindowMode } from "./types.ts";

export function apiBase(): string {
  return "";
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(`${apiBase()}${path}`, { ...init, headers, cache: "no-store" });
  return res;
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const err = (body && typeof body === "object" && "error" in body)
      ? String((body as { error: unknown }).error)
      : `${res.status} ${res.statusText}`;
    throw new Error(err);
  }
  return body as T;
}

export interface CreatedMatchJson {
  id: string;
  watchPath: string;
  relayPath: string;
  window: WindowMode;
  seed: number;
  expiresAt: string;
  p1: { controller: string; character: string; bot: string };
  p2: { controller: string; character: string; bot: string };
  secrets: { p1Code: string; p2Code: string; hostToken: string };
}

export async function createMatch(body: Record<string, unknown>): Promise<CreatedMatchJson> {
  return apiJson<CreatedMatchJson>("/api/match", { method: "POST", body: JSON.stringify(body) });
}

export async function listMatches(): Promise<PublicMatchListItem[]> {
  const r = await apiJson<{ matches: PublicMatchListItem[] }>("/api/match");
  return r.matches;
}

export async function getState(id: string): Promise<{
  id: string;
  status: string;
  hostPresent: boolean;
  window: WindowMode;
  seed: number;
  p1: { controller: string; character: string; bot: string };
  p2: { controller: string; character: string; bot: string };
  state: MatchPublicState | null;
  summary: string;
  commandCount: number;
}> {
  return apiJson(`/api/match/${encodeURIComponent(id)}/state`);
}

export async function getStateText(id: string): Promise<string> {
  const res = await apiFetch(`/api/match/${encodeURIComponent(id)}/state?format=text`, {
    headers: { Accept: "text/plain" },
  });
  if (!res.ok) throw new Error(`state ${res.status}`);
  return res.text();
}

export async function postCommand(
  id: string,
  opts: { fighter: "p1" | "p2"; joinCode: string; text?: string; command?: unknown; issuedAtMs?: number },
): Promise<{ ok: boolean; seq: number; latencyMs: number; receivedAtMs: number; appliedTick: number }> {
  return apiJson(`/api/match/${encodeURIComponent(id)}/command`, {
    method: "POST",
    body: JSON.stringify({
      fighter: opts.fighter,
      joinCode: opts.joinCode,
      text: opts.text,
      command: opts.command,
      issuedAtMs: opts.issuedAtMs ?? Date.now(),
    }),
  });
}

export async function claimHost(id: string, hostToken: string): Promise<{
  ok: boolean;
  id: string;
  seed: number;
  window: WindowMode;
  p1: { controller: string; character: string; bot: string };
  p2: { controller: string; character: string; bot: string };
}> {
  return apiJson(`/api/match/${encodeURIComponent(id)}/host`, {
    method: "POST",
    headers: { Authorization: `Bearer ${hostToken}` },
    body: JSON.stringify({ hostToken }),
  });
}

export async function pullCommands(id: string, hostToken: string, since: number): Promise<CommandRecord[]> {
  const r = await apiJson<{ commands: CommandRecord[] }>(
    `/api/match/${encodeURIComponent(id)}/commands?since=${since}`,
    { headers: { Authorization: `Bearer ${hostToken}` } },
  );
  return r.commands;
}

export async function publishState(id: string, hostToken: string, state: MatchPublicState): Promise<void> {
  await apiJson(`/api/match/${encodeURIComponent(id)}/state`, {
    method: "POST",
    headers: { Authorization: `Bearer ${hostToken}` },
    body: JSON.stringify({ hostToken, state }),
  });
}

export async function markApplied(id: string, hostToken: string, seq: number, tick: number): Promise<void> {
  await apiJson(`/api/match/${encodeURIComponent(id)}/applied`, {
    method: "POST",
    headers: { Authorization: `Bearer ${hostToken}` },
    body: JSON.stringify({ hostToken, seq, tick }),
  });
}

export function hostTokenKey(id: string): string {
  return `afc-host-token:${id}`;
}

export function saveHostToken(id: string, token: string): void {
  try {
    sessionStorage.setItem(hostTokenKey(id), token);
  } catch {
    // private mode
  }
}

export function loadHostToken(id: string): string | null {
  try {
    return sessionStorage.getItem(hostTokenKey(id));
  } catch {
    return null;
  }
}
