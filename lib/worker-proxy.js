const WORKER_ORIGIN = "https://site-6af43b07f0b7466b81736010df6acc2f.freebuff.page";

export default async function workerProxy(req, res) {
  const upstreamUrl = new URL(req.url, WORKER_ORIGIN);
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers)) {
    const key = name.toLowerCase();
    if (value == null || ["host", "connection", "transfer-encoding"].includes(key)) continue;
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
    res.statusCode = upstream.status;
    upstream.headers.forEach((value, name) => {
      if (!["transfer-encoding", "connection"].includes(name.toLowerCase())) res.setHeader(name, value);
    });

    if (!upstream.body || req.method === "HEAD") return res.end();
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) {
        await new Promise((resolve) => res.once("drain", resolve));
      }
    }
    res.end();
  } catch {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("content-type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify({ ok: false, error: "upstream unavailable" }));
  }
}
