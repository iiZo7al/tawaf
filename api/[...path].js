const WORKER_ORIGIN = "https://site-6af43b07f0b7466b81736010df6acc2f.freebuff.page";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const upstreamUrl = new URL(req.url, WORKER_ORIGIN);
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers)) {
    if (value == null || ["host", "connection", "content-length"].includes(name.toLowerCase())) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  headers.set("origin", WORKER_ORIGIN);

  const init = { method: req.method, headers, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req;
    init.duplex = "half";
  }

  try {
    const upstream = await fetch(upstreamUrl, init);
    res.status(upstream.status);
    upstream.headers.forEach((value, name) => {
      if (!["transfer-encoding", "connection"].includes(name.toLowerCase())) res.setHeader(name, value);
    });
    if (!upstream.body || req.method === "HEAD") return res.end();
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch {
    res.status(502).json({ ok: false, error: "upstream unavailable" });
  }
}
