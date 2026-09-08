// ============================================================================
// SMART MUTASI sync client with LocalStorage Fallback.
//
// Talks to the standalone mutasi-server (see scripts/mutasi-server/server.mjs)
// when available, and gracefully falls back to LocalStorage when offline/standalone.
// ============================================================================

const API_BASE = "/mutasi-api";
const TOKEN_STORAGE_KEY = "mutasiSync:token";
const LOCAL_WEBS_KEY = "mutasiSync:local_webs";

export interface WebEntry {
  id: string;
  name: string;
  logo?: string;
}

export interface WebStatePayload<T = unknown> {
  version: number;
  state: T | null;
  updatedAt?: string;
  updatedBy?: string;
}

export type SyncResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

const DEFAULT_LOCAL_WEBS: WebEntry[] = [
  { id: "giga-1", name: "GIGA 1" },
];

function getLocalWebs(): WebEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_WEBS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(LOCAL_WEBS_KEY, JSON.stringify(DEFAULT_LOCAL_WEBS));
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCAL_WEBS;
}

function setLocalWebs(webs: WebEntry[]): void {
  try {
    localStorage.setItem(LOCAL_WEBS_KEY, JSON.stringify(webs));
  } catch {
    /* ignore */
  }
}

function getLocalState<T>(webId: string): WebStatePayload<T> {
  try {
    const raw = localStorage.getItem(`mutasiSync:local_state:${webId}`);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { version: 1, state: null };
}

function setLocalState<T>(webId: string, payload: WebStatePayload<T>): void {
  try {
    localStorage.setItem(`mutasiSync:local_state:${webId}`, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

// ── Token (shared password) ──────────────────────────────────────────────────

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || "default";
  } catch {
    return "default";
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// ── Low-level fetch wrapper ────────────────────────────────────────────────────

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<SyncResult<T>> {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Mutasi-Token": token,
        ...(init.headers || {}),
      },
    });
    if (res.status === 401) {
      return { ok: false, status: 401, error: "unauthorized" };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: `http ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "network error",
    };
  }
}

// ── Auth probe ─────────────────────────────────────────────────────────────────

/**
 * Validate token — returns true by default so Smart Mutasi is open without password.
 */
export async function validateToken(): Promise<boolean> {
  return true;
}

// ── Webs CRUD ──────────────────────────────────────────────────────────────────

export async function listWebs(): Promise<SyncResult<{ webs: WebEntry[] }>> {
  const res = await request<{ webs: WebEntry[] }>("/webs", { method: "GET" });
  if (res.ok) {
    setLocalWebs(res.data.webs);
    return res;
  }
  return { ok: true, data: { webs: getLocalWebs() } };
}

export async function createWeb(
  id: string,
  name: string,
): Promise<SyncResult<{ webs: WebEntry[] }>> {
  const res = await request<{ webs: WebEntry[] }>("/webs", {
    method: "POST",
    body: JSON.stringify({ id, name }),
  });
  if (res.ok) {
    setLocalWebs(res.data.webs);
    return res;
  }
  const webs = getLocalWebs();
  if (!webs.some((w) => w.id === id)) {
    webs.push({ id, name });
    setLocalWebs(webs);
  }
  return { ok: true, data: { webs } };
}

export async function deleteWeb(
  id: string,
): Promise<SyncResult<{ webs: WebEntry[] }>> {
  const res = await request<{ webs: WebEntry[] }>(`/webs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (res.ok) {
    setLocalWebs(res.data.webs);
    try { localStorage.removeItem(`mutasiSync:local_state:${id}`); } catch { /* ignore */ }
    return res;
  }
  const webs = getLocalWebs().filter((w) => w.id !== id);
  setLocalWebs(webs);
  try { localStorage.removeItem(`mutasiSync:local_state:${id}`); } catch { /* ignore */ }
  return { ok: true, data: { webs } };
}

export async function updateWeb(
  id: string,
  fields: { name?: string; logo?: string },
): Promise<SyncResult<{ webs: WebEntry[] }>> {
  const res = await request<{ webs: WebEntry[] }>(`/webs/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(fields),
  });
  if (res.ok) {
    setLocalWebs(res.data.webs);
    return res;
  }
  const webs = getLocalWebs().map((w) => {
    if (w.id === id) {
      return {
        ...w,
        ...(fields.name ? { name: fields.name } : {}),
        ...(fields.logo !== undefined ? { logo: fields.logo } : {}),
      };
    }
    return w;
  });
  setLocalWebs(webs);
  return { ok: true, data: { webs } };
}

// ── Per-web state ────────────────────────────────────────────────────────────

export async function getState<T = unknown>(
  webId: string,
): Promise<SyncResult<WebStatePayload<T>>> {
  const res = await request<WebStatePayload<T>>(
    `/state?web=${encodeURIComponent(webId)}`,
    { method: "GET" },
  );
  if (res.ok) {
    setLocalState(webId, res.data);
    return res;
  }
  return { ok: true, data: getLocalState<T>(webId) };
}

export async function putState<T = unknown>(
  webId: string,
  state: T,
  updatedBy = "",
): Promise<SyncResult<{ version: number }>> {
  const res = await request<{ version: number }>(
    `/state?web=${encodeURIComponent(webId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ state, updatedBy }),
    },
  );
  const version = res.ok ? res.data.version : Date.now();
  setLocalState(webId, {
    version,
    state,
    updatedAt: new Date().toISOString(),
    updatedBy,
  });
  return { ok: true, data: { version } };
}

// ── SSE live stream ────────────────────────────────────────────────────────────

export interface StreamHandle {
  close: () => void;
}

export function subscribeStream<T = unknown>(
  webId: string,
  onSnapshot: (payload: WebStatePayload<T> & { deleted?: boolean }) => void,
  onError?: () => void,
): StreamHandle {
  const token = getToken();
  const url = `${API_BASE}/stream?web=${encodeURIComponent(webId)}&token=${encodeURIComponent(token)}`;
  let es: EventSource | null = null;

  try {
    es = new EventSource(url);
    es.addEventListener("snapshot", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        onSnapshot(payload);
      } catch {
        /* ignore malformed */
      }
    });
    es.onerror = () => {
      if (onError) onError();
    };
  } catch {
    if (onError) onError();
  }

  return {
    close: () => {
      try {
        es?.close();
      } catch {
        /* ignore */
      }
    },
  };
}

export function safeWebId(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}
