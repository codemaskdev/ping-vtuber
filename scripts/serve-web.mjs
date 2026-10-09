// A static server for the webcam page, on 127.0.0.1 only, serving the repository root (GET only). It logs every
// request with its order number so a test can tell what was asked for after the page was ready.
//
//   npm run web:serve        then open http://127.0.0.1:8317/web/index.html
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT } from "../lib/spec.mjs";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".png": "image/png", ".wasm": "application/wasm", ".task": "application/octet-stream" };

export function startServer(port = 0) {
  const log = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    log.push(url.pathname);
    const file = path.join(ROOT, path.normalize(decodeURIComponent(url.pathname)));
    if (req.method !== "GET" || !file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, log, port: server.address().port })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { port } = await startServer(8317);
  console.log(`http://127.0.0.1:${port}/web/index.html (checked by eye by the author on 2026-10-09, no measurements)`);
}
