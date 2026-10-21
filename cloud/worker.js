/**
 * Cloud Worker for the Smart Black Stone Guard web console.
 *
 * - Serves the static site from the Sites asset bundle.
 * - Proxies the tawaf.alk.sa dashboard API (browsers cannot call it directly:
 *   it has no CORS headers).
 * - Stores the black-box snapshots in R2.
 * - Serves the 35 MB MediaPipe model / wasm from R2, because the deploy bundle
 *   is limited to 10 MiB.
 */

const ALERT_URL = "https://tawaf.alk.sa/api/alert";
const RESOLVE_URL = "https://tawaf.alk.sa/api/resolve";
const STATUS_URL = "https://tawaf.alk.sa/api/status";
const ROBOT_ID = "TAWAF-BOT-01";
const LOCATION = "صحن المطاف - محاذاة الحجر الأسود";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
const INCIDENT_PREFIX = "incidents/";
const MEDIA_PREFIX = "media/";

const CONTENT_TYPES = {
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  wasm: "application/wasm",
  task: "application/octet-stream",
  json: "application/json; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

function sameOrigin(request, url) {
  const origin = request.headers.get("Origin");
  if (origin) return origin === url.origin;
  // Some browsers omit Origin on same-origin POSTs.
  return request.headers.get("Sec-Fetch-Site") === "same-origin";
}

function stamp(date) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    date.getUTCFullYear() +
    p(date.getUTCMonth() + 1) +
    p(date.getUTCDate()) +
    "_" +
    p(date.getUTCHours()) +
    p(date.getUTCMinutes()) +
    p(date.getUTCSeconds())
  );
}

function randomHex(bytes = 4) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function contentTypeFor(key) {
  const ext = key.split(".").pop().toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

async function proxyAlert(request, target, extra = {}) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const payload = { robot_id: ROBOT_ID, location: LOCATION, duration_sec: 4.5, ...extra, ...body };
  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "BlackStoneCloud/1.0" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    return json({ ok: upstream.ok, detail: `HTTP ${upstream.status}` }, upstream.ok ? 200 : 502);
  } catch (err) {
    return json({ ok: false, detail: String(err) }, 502);
  }
}

async function cloudStatus() {
  try {
    const upstream = await fetch(STATUS_URL, {
      headers: { "User-Agent": "BlackStoneCloud/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    const data = await upstream.json().catch(() => ({}));
    return json({ ok: upstream.ok, active: Boolean(data.active_alert), data }, upstream.ok ? 200 : 502);
  } catch (err) {
    return json({ ok: false, active: false, data: { error: String(err) } }, 502);
  }
}

async function listIncidents(env) {
  if (!env.FILES) return json({ ok: false, error: "storage not configured", incidents: [], count: 0 }, 503);
  const listed = await env.FILES.list({ prefix: INCIDENT_PREFIX, limit: 200 });
  const items = listed.objects
    .map((o) => o.key)
    .sort()
    .reverse()
    .map((key) => ({ file: key.slice(INCIDENT_PREFIX.length), url: "/incidents/" + key.slice(INCIDENT_PREFIX.length) }));
  return json({ ok: true, incidents: items.slice(0, 24), count: items.length });
}

async function saveIncident(request, env) {
  if (!env.FILES) return json({ ok: false, error: "storage not configured" }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }
  const match = /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=\s]+)$/s.exec(body.image || "");
  if (!match) return json({ ok: false, error: "bad image payload" }, 400);
  let bytes;
  try {
    const raw = atob(match[2].replace(/\s+/g, ""));
    bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  } catch {
    return json({ ok: false, error: "bad base64" }, 400);
  }
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    return json({ ok: false, error: "image too large" }, 413);
  }
  const ext = match[1] === "png" ? "png" : "jpg";
  const file = `incident_${stamp(new Date())}_${randomHex(2)}.${ext}`;
  await env.FILES.put(INCIDENT_PREFIX + file, bytes, {
    httpMetadata: { contentType: ext === "png" ? "image/png" : "image/jpeg" },
    customMetadata: { reason: String(body.reason || "").slice(0, 200) },
  });
  return json({ ok: true, file, url: "/incidents/" + file });
}

async function serveObject(env, key, request) {
  if (!env.FILES) return new Response("storage not configured", { status: 503 });
  const object = await env.FILES.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", headers.get("Content-Type") || contentTypeFor(key));
  headers.set("ETag", object.httpEtag);
  headers.set("Content-Length", String(object.size));
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  if (request.method === "HEAD") return new Response(null, { headers });
  return new Response(object.body, { headers });
}

async function putMedia(request, url, env) {
  if (!env.MEDIA_TOKEN) return json({ ok: false, error: "uploads disabled" }, 403);
  const token = request.headers.get("x-media-token") || "";
  if (token.length !== env.MEDIA_TOKEN.length) return json({ ok: false, error: "forbidden" }, 403);
  let diff = 0;
  for (let i = 0; i < token.length; i += 1) diff |= token.charCodeAt(i) ^ env.MEDIA_TOKEN.charCodeAt(i);
  if (diff !== 0) return json({ ok: false, error: "forbidden" }, 403);

  const path = (url.searchParams.get("path") || "").replace(/^\/+/, "");
  if (!/^(wasm|models)\/[A-Za-z0-9._-]+$/.test(path)) {
    return json({ ok: false, error: "invalid path" }, 400);
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_MEDIA_BYTES) return json({ ok: false, error: "file too large" }, 413);
  const body = await request.arrayBuffer();
  if (!body.byteLength || body.byteLength > MAX_MEDIA_BYTES) {
    return json({ ok: false, error: "bad size" }, 413);
  }
  await env.FILES.put(MEDIA_PREFIX + path, body, {
    httpMetadata: { contentType: contentTypeFor(path) },
  });
  return json({ ok: true, key: MEDIA_PREFIX + path, size: body.byteLength });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/health") {
      return json({ ok: true, service: "smart-black-stone-guard", storage: Boolean(env.FILES), time: new Date().toISOString() });
    }

    if (path === "/api/cloud/status" && request.method === "GET") {
      return cloudStatus();
    }

    if (path === "/api/cloud/alert" && request.method === "POST") {
      if (!sameOrigin(request, url)) return json({ ok: false, error: "forbidden" }, 403);
      return proxyAlert(request, ALERT_URL);
    }

    if (path === "/api/cloud/resolve" && request.method === "POST") {
      if (!sameOrigin(request, url)) return json({ ok: false, error: "forbidden" }, 403);
      return proxyAlert(request, RESOLVE_URL, { status: "resolved", duration_sec: 4.5 });
    }

    if (path === "/api/incidents" && request.method === "GET") {
      return listIncidents(env);
    }

    if (path === "/api/incidents" && request.method === "POST") {
      if (!sameOrigin(request, url)) return json({ ok: false, error: "forbidden" }, 403);
      return saveIncident(request, env);
    }

    if (path.startsWith("/incidents/") && (request.method === "GET" || request.method === "HEAD")) {
      return serveObject(env, INCIDENT_PREFIX + path.slice("/incidents/".length), request);
    }

    if (path.startsWith("/media/") && (request.method === "GET" || request.method === "HEAD")) {
      return serveObject(env, MEDIA_PREFIX + path.slice("/media/".length), request);
    }

    if (path === "/api/media" && request.method === "PUT") {
      return putMedia(request, url, env);
    }

    if (path.startsWith("/api/")) {
      return json({ ok: false, error: "unknown endpoint" }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
