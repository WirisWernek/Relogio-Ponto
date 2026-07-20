const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;
const INDEX_PATH = path.join(ROOT_DIR, "index.html");
const PORT = Number(process.env.PORT || 8787);

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
  });
  res.end(body);
}

function sendHtml(res) {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
  });
  res.end(html);
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function normalizeHeaders(input) {
  const output = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return output;
  }

  for (const [name, value] of Object.entries(input)) {
    const headerName = String(name).trim();
    if (!headerName) {
      continue;
    }
    output[headerName] = String(value);
  }

  return output;
}

function filterRequestHeaders(headers) {
  const blocked = new Set([
    "host",
    "content-length",
    "connection",
    "origin",
    "referer",
    "sec-fetch-site",
    "sec-fetch-mode",
    "sec-fetch-dest",
    "sec-fetch-user",
    "accept-encoding",
    "accept-language",
    "cookie",
    "authorization",
  ]);

  const output = {};
  for (const [name, value] of Object.entries(headers || {})) {
    const normalizedName = name.toLowerCase();
    if (blocked.has(normalizedName)) {
      continue;
    }
    output[name] = value;
  }

  return output;
}

async function handleProxy(req, res) {
  const startedAt = performance.now();
  const rawBody = await collectBody(req);

  let payload;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    return sendJson(res, 400, {
      ok: false,
      error: "O corpo da requisição do proxy precisa ser JSON válido.",
      details: error instanceof Error ? error.message : String(error),
    });
  }

  const targetUrl =
    typeof payload.targetUrl === "string" ? payload.targetUrl.trim() : "";
  const method =
    typeof payload.method === "string" ? payload.method.toUpperCase() : "GET";
  const headers = normalizeHeaders(payload.headers);
  const timeoutMs =
    Number(payload.timeout) > 0 ? Number(payload.timeout) : 15000;
  const body =
    payload.body == null
      ? null
      : typeof payload.body === "string"
        ? payload.body
        : JSON.stringify(payload.body);

  if (!targetUrl) {
    return sendJson(res, 400, {
      ok: false,
      error: "Informe targetUrl no payload do proxy.",
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestInit = {
      method,
      headers: filterRequestHeaders(headers),
      signal: controller.signal,
    };

    if (!["GET", "HEAD"].includes(method) && body != null) {
      requestInit.body = body;
    }

    const upstreamResponse = await fetch(targetUrl, requestInit);
    const responseBody = await upstreamResponse.text();
    const responseHeaders = Array.from(upstreamResponse.headers.entries()).map(
      ([name, value]) => ({ name, value }),
    );

    sendJson(res, 200, {
      ok: true,
      proxied: true,
      url: targetUrl,
      method,
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      durationMs: Math.round(performance.now() - startedAt),
      requestHeaders: filterRequestHeaders(headers),
      responseHeaders,
      bodyText: responseBody,
      responseBytes: Buffer.byteLength(responseBody),
    });
  } catch (error) {
    const isAbort = error && error.name === "AbortError";
    sendJson(res, isAbort ? 504 : 502, {
      ok: false,
      proxied: true,
      url: targetUrl,
      method,
      durationMs: Math.round(performance.now() - startedAt),
      error: isAbort
        ? "Timeout ao chamar a API de destino."
        : "Falha ao chamar a API de destino.",
      details: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/api/proxy" && req.method === "POST") {
    await handleProxy(req, res);
    return;
  }

  if (req.url === "/" || req.url === "/index.html") {
    sendHtml(res);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Proxy server running at http://localhost:${PORT}`);
});
