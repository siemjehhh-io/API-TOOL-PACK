// ============================================================================
// SMART MUTASI sync client.
//
// Talks to the standalone mutasi-server (see scripts/mutasi-server/server.mjs)
// which is reverse-proxied at `/mutasi-api` in production and proxied by Vite
// to localhost:4010 in dev.
//
// Responsibilities:
//   • Hold the shared password ("token") in localStorage after the user enters
//     it once. Every request carries it as `X-Mutasi-Token`.
//   • CRUD for "webs" (divisions): list / create / delete.
//   • Get / save per-web state (the whole SMART MUTASI blob).
//   • Subscribe to a web's live snapshot stream via SSE for real-time sync.
//
// This module is intentionally framework-agnostic (no React) so it can be unit
// tested and reused. It NEVER throws for network errors in the high-level
// helpers — it returns a discriminated result so the UI can degrade gracefully
// instead of crashing the whole app.
// ============================================================================

const API_BASE = "/mutasi-api";
const TOKEN_STORAGE_KEY = "mutasiSync:token";

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

// ── Token (shared password) ──────────────────────────────────────────────────

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
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
 * Validate the currently-stored token by hitting an authenticated endpoint.
 * Returns true when the token is accepted.
 */
export async function validateToken(): Promise<boolean> {
  const result = await listWebs();
  return result.ok;
}

// ── Webs CRUD ──────────────────────────────────────────────────────────────────

export async function listWebs(): Promise<SyncResult<{ webs: WebEntry[] }>> {
  return request<{ webs: WebEntry[] }>("/webs", { method: "GET" });
}

export async function createWeb(
  id: string,
  name: string,
): Promise<SyncResult<{ webs: WebEntry[] }>> {
  return request<{ webs: WebEntry[] }>("/webs", {
    method: "POST",
    body: JSON.stringify({ id, name }),
  });
}

export async function deleteWeb(
  id: string,
): Promise<SyncResult<{ webs: WebEntry[] }>> {
  return request<{ webs: WebEntry[] }>(`/webs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function updateWeb(
  id: string,
  fields: { name?: string; logo?: string },
): Promise<SyncResult<{ webs: WebEntry[] }>> {
  return request<{ webs: WebEntry[] }>(`/webs/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(fields),
  });
}

// ── Per-web state ────────────────────────────────────────────────────────────

export async function getState<T = unknown>(
  webId: string,
): Promise<SyncResult<WebStatePayload<T>>> {
  return request<WebStatePayload<T>>(
    `/state?web=${encodeURIComponent(webId)}`,
    { method: "GET" },
  );
}

export async function putState<T = unknown>(
  webId: string,
  state: T,
  updatedBy = "",
): Promise<SyncResult<{ version: number }>> {
  return request<{ version: number }>(
    `/state?web=${encodeURIComponent(webId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ state, updatedBy }),
    },
  );
}

// ── SSE live stream ────────────────────────────────────────────────────────────

export interface StreamHandle {
  close: () => void;
}

/**
 * Subscribe to a web's live snapshot stream. `onSnapshot` fires with each
 * server-pushed payload (including the initial one on connect). `onError` is
 * called when the connection drops; EventSource auto-reconnects, so this is
 * informational. Returns a handle to close the stream.
 *
 * EventSource cannot set custom headers, so the token is passed as a query
 * param — the server accepts `?token=` for this endpoint only.
 */
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

/** Build a safe web id from a free-text name (mirrors the server's rule). */
export function safeWebId(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}
