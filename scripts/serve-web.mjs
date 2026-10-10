// A static server for the webcam page, on 127.0.0.1 only, serving the repository root (GET only) under a path prefix,
// the way GitHub Pages serves this repository at https://codemaskdev.github.io/ping-vtuber/ (author's prompt #24).
// A request outside the prefix is a 404, like a root-absolute path on Pages, and a path ending in "/" gets its
// index.html. It logs every request with its order number so a test can tell what was asked for after the page was
// ready.
//
//   npm run web:serve        then open http://127.0.0.1:8317/ping-vtuber/web/
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT } from "../lib/spec.mjs";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".png": "image/png", ".wasm": "application/wasm", ".task": "application/octet-stream" };
export const PREFIX = "/ping-vtuber";

export function startServer(port = 0, { prefix = PREFIX } = {}) {
  const log = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    log.push(url.pathname);
    const inside = url.pathname === `${prefix}/` || url.pathname.startsWith(`${prefix}/`);
    const rest = inside ? url.pathname.slice(prefix.length) : null;
    const file = rest === null ? null : path.join(ROOT, path.normalize(decodeURIComponent(rest.endsWith("/") ? `${rest}index.html` : rest)));
    if (req.method !== "GET" || !file || !file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, log, port: server.address().port, base: `http://127.0.0.1:${server.address().port}${prefix}` })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { base } = await startServer(8317);
  console.log(`${base}/web/ (checked by eye by the author on 2026-10-09, no measurements)`);
}
