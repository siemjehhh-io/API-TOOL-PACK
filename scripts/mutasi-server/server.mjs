#!/usr/bin/env node
// ============================================================================
// SMART MUTASI sync server — self-contained, zero npm dependencies.
//
// Purpose: give SMART MUTASI TOOLS a shared, cross-device, real-time data
// store scoped per "web" (division). Multiple people on different computers
// who select the same web see the same mutasi queue + history, updated live.
//
// Design goals:
//   • Zero external deps — pure Node built-ins (http, fs, crypto). Runs with
//     just `node server.mjs`; no `npm install` needed on the VPS.
//   • Durable storage — one JSON file per web under DATA_DIR, written
//     atomically (write temp + rename) so a crash mid-write can't corrupt.
//   • Real-time — Server-Sent Events (SSE). When any client saves a web's
//     state, the server persists it and broadcasts the new snapshot to every
//     other SSE subscriber of that web.
//   • Simple auth — a shared password sent as `X-Mutasi-Token` header (or
//     `?token=` query for the SSE EventSource which can't set headers).
//   • Isolated — only serves /mutasi-api/*. Does NOT touch the static site or
//     any other tool. nginx reverse-proxies /mutasi-api/ to this process.
//
// Endpoints (all under /mutasi-api):
//   GET    /mutasi-api/healthz                 → { status: "ok" }
//   GET    /mutasi-api/webs                     → { webs: [{id,name}] }
//   POST   /mutasi-api/webs    {id,name}        → create web (idempotent)
//   DELETE /mutasi-api/webs/:id                 → remove web + its data
//   GET    /mutasi-api/state?web=<id>           → { version, state }
//   PUT    /mutasi-api/state?web=<id> {version,state} → save + broadcast
//   GET    /mutasi-api/stream?web=<id>&token=.. → SSE live snapshot stream
//
// Concurrency model (real-time sync):
//   • Each web's stored payload carries a monotonically increasing `version`.
//   • PUT echoes the new version and broadcasts the full snapshot via SSE.
//   • Clients apply incoming snapshots if the version is newer than what they
//     hold. Last-write-wins at the whole-state level, but because saves are
//     small/frequent and broadcast immediately, in practice it feels live.
// ============================================================================

import http from "node:http";
import { promises as fs } from "node:fs";
import fssync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config (env-overridable) ────────────────────────────────────────────────
const PORT = Number(process.env.MUTASI_PORT || 4010);
const HOST = process.env.MUTASI_HOST || "127.0.0.1";
const DATA_DIR = process.env.MUTASI_DATA_DIR || path.join(__dirname, "data");
// Shared password. ALWAYS override in production via env. The default is only
// for local dev convenience.
const TOKEN = process.env.MUTASI_TOKEN || "ganti-password-ini";

// In-memory SSE subscriber registry: webId -> Set<res>
const subscribers = new Map();

// ── Storage helpers ──────────────────────────────────────────────────────────

function safeWebId(raw) {
  // Allow only [a-z0-9-_] to keep it a safe filename; lowercase.
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

function webFile(webId) {
  return path.join(DATA_DIR, `web_${webId}.json`);
}

const REGISTRY_FILE = () => path.join(DATA_DIR, "_webs.json");

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function atomicWriteJson(file, obj) {
  const tmp = `${file}.tmp-${crypto.randomBytes(6).toString("hex")}`;
  await fs.writeFile(tmp, JSON.stringify(obj), "utf8");
  await fs.rename(tmp, file);
}

async function readJsonOr(file, fallback) {
  try {
    const text = await fs.readFile(file, "utf8");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function loadRegistry() {
  return readJsonOr(REGISTRY_FILE(), { webs: [] });
}

async function saveRegistry(reg) {
  await atomicWriteJson(REGISTRY_FILE(), reg);
}

async function loadWebState(webId) {
  return readJsonOr(webFile(webId), { version: 0, state: null });
}

async function saveWebState(webId, payload) {
  await atomicWriteJson(webFile(webId), payload);
}

// ── SSE broadcast ─────────────────────────────────────────────────────────────

function broadcast(webId, payload) {
  const set = subscribers.get(webId);
  if (!set) return;
  const data = `event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try {
      res.write(data);
    } catch {
      // ignore broken pipe; cleanup happens on 'close'
    }
  }
}

// ── HTTP helpers ───────────────────────────────────────────────────────────────

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req, limitBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function tokenOf(req, url) {
  const header = req.headers["x-mutasi-token"];
  if (typeof header === "string" && header) return header;
  const q = url.searchParams.get("token");
  return q || "";
}

function authorized(req, url) {
  return tokenOf(req, url) === TOKEN;
}

// ── Request router ────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS — allow the static site origin(s). Permissive here because the token
  // gates every mutating action; tighten with an allowlist if needed.
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Mutasi-Token",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch {
    sendJson(res, 400, { error: "bad url" });
    return;
  }

  const p = url.pathname;

  try {
    // ── Health (no auth) ──────────────────────────────────────────────
    if (p === "/mutasi-api/healthz" && req.method === "GET") {
      sendJson(res, 200, { status: "ok" });
      return;
    }

    // ── Auth check for everything else ────────────────────────────────
    if (!authorized(req, url)) {
      sendJson(res, 401, { error: "unauthorized" });
      return;
    }

    // ── List webs ─────────────────────────────────────────────────────
    if (p === "/mutasi-api/webs" && req.method === "GET") {
      const reg = await loadRegistry();
      sendJson(res, 200, reg);
      return;
    }

    // ── Create web ────────────────────────────────────────────────────
    if (p === "/mutasi-api/webs" && req.method === "POST") {
      const body = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        sendJson(res, 400, { error: "invalid json" });
        return;
      }
      const id = safeWebId(parsed.id || parsed.name);
      const name = String(parsed.name || parsed.id || "").trim().slice(0, 60);
      if (!id || !name) {
        sendJson(res, 400, { error: "id and name required" });
        return;
      }
      const reg = await loadRegistry();
      if (!reg.webs.some((w) => w.id === id)) {
        reg.webs.push({ id, name, logo: typeof parsed.logo === "string" ? parsed.logo.slice(0, 300000) : "" });
        await saveRegistry(reg);
        // Initialize an empty state file so subsequent GET is consistent.
        if (!fssync.existsSync(webFile(id))) {
          await saveWebState(id, { version: 0, state: null });
        }
      }
      sendJson(res, 200, reg);
      return;
    }

    // ── Update web (rename / set logo) ────────────────────────────────
    const updMatch = p.match(/^\/mutasi-api\/webs\/([^/]+)$/);
    if (updMatch && req.method === "PUT") {
      const id = safeWebId(decodeURIComponent(updMatch[1]));
      const body = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        sendJson(res, 400, { error: "invalid json" });
        return;
      }
      const reg = await loadRegistry();
      const web = reg.webs.find((w) => w.id === id);
      if (!web) {
        sendJson(res, 404, { error: "web not found" });
        return;
      }
      if (typeof parsed.name === "string" && parsed.name.trim()) {
        web.name = parsed.name.trim().slice(0, 60);
      }
      // logo: a string sets/replaces it; an empty string clears it.
      if (typeof parsed.logo === "string") {
        web.logo = parsed.logo.slice(0, 300000);
      }
      await saveRegistry(reg);
      sendJson(res, 200, reg);
      return;
    }

    // ── Delete web ────────────────────────────────────────────────────
    const delMatch = p.match(/^\/mutasi-api\/webs\/([^/]+)$/);
    if (delMatch && req.method === "DELETE") {
      const id = safeWebId(decodeURIComponent(delMatch[1]));
      const reg = await loadRegistry();
      const next = reg.webs.filter((w) => w.id !== id);
      reg.webs = next;
      await saveRegistry(reg);
      try {
        await fs.unlink(webFile(id));
      } catch {
        // already gone
      }
      // Notify any subscribers the web is gone.
      broadcast(id, { deleted: true, webId: id });
      subscribers.delete(id);
      sendJson(res, 200, reg);
      return;
    }

    // ── Get state ─────────────────────────────────────────────────────
    if (p === "/mutasi-api/state" && req.method === "GET") {
      const webId = safeWebId(url.searchParams.get("web"));
      if (!webId) {
        sendJson(res, 400, { error: "web required" });
        return;
      }
      const payload = await loadWebState(webId);
      sendJson(res, 200, payload);
      return;
    }

    // ── Save state ────────────────────────────────────────────────────
    if (p === "/mutasi-api/state" && req.method === "PUT") {
      const webId = safeWebId(url.searchParams.get("web"));
      if (!webId) {
        sendJson(res, 400, { error: "web required" });
        return;
      }
      const body = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        sendJson(res, 400, { error: "invalid json" });
        return;
      }
      const current = await loadWebState(webId);
      const nextVersion = (current.version || 0) + 1;
      const payload = {
        version: nextVersion,
        state: parsed.state ?? null,
        updatedAt: new Date().toISOString(),
        updatedBy: String(parsed.updatedBy || "").slice(0, 60),
      };
      await saveWebState(webId, payload);
      // Broadcast to all OTHER subscribers (and this one too — clients ignore
      // their own echo by comparing version).
      broadcast(webId, payload);
      sendJson(res, 200, { version: nextVersion });
      return;
    }

    // ── SSE stream ────────────────────────────────────────────────────
    if (p === "/mutasi-api/stream" && req.method === "GET") {
      const webId = safeWebId(url.searchParams.get("web"));
      if (!webId) {
        sendJson(res, 400, { error: "web required" });
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // tell nginx not to buffer SSE
      });
      res.write("retry: 3000\n\n");

      if (!subscribers.has(webId)) subscribers.set(webId, new Set());
      subscribers.get(webId).add(res);

      // Send the current snapshot immediately so a fresh subscriber syncs.
      const snapshot = await loadWebState(webId);
      res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);

      // Heartbeat to keep the connection alive through proxies.
      const heartbeat = setInterval(() => {
        try {
          res.write(`: ping ${Date.now()}\n\n`);
        } catch {
          /* ignore */
        }
      }, 25000);

      req.on("close", () => {
        clearInterval(heartbeat);
        const set = subscribers.get(webId);
        if (set) {
          set.delete(res);
          if (set.size === 0) subscribers.delete(webId);
        }
      });
      return;
    }

    sendJson(res, 404, { error: "not found" });
  } catch (err) {
    sendJson(res, 500, { error: "server error", detail: String(err && err.message) });
  }
});

await ensureDataDir();

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[mutasi-server] listening on http://${HOST}:${PORT} — data dir: ${DATA_DIR}`,
  );
});
