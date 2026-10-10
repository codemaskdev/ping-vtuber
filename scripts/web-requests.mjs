// The request count of the webcam page, served under /ping-vtuber/ like GitHub Pages, in headless Chrome with a
// synthetic camera (the real camera is never opened): requests before ready, after ready, to other hosts (Chrome's
// own net log, so the detector worker's requests count too), and what the worker's guards refused. It runs long enough
// for MediaPipe's usage logger (a flush every 60 s) to try at least once. Writes out/web-requests.json.
//
//   npm run web:requests [-- --seconds 75]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "../lib/spec.mjs";
import { startServer, PREFIX } from "./serve-web.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const i = process.argv.indexOf("--seconds"), seconds = i > 0 ? Number(process.argv[i + 1]) : 75;
const { default: puppeteer } = await import("puppeteer-core");
const { server, log, port, base } = await startServer(0);
const origin = `http://127.0.0.1:${port}`;
const netlog = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ping-netlog-")), "net.json");
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--deny-permission-prompts", `--log-net-log=${netlog}`] });
const out = { prefix: PREFIX, page: `${PREFIX}/web/`, seconds };
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    const realCapture = HTMLCanvasElement.prototype.captureStream;
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement("canvas");
      c.width = 640; c.height = 480;
      const g = c.getContext("2d");
      let k = 0;
      setInterval(() => { g.fillStyle = `rgb(${(k += 7) % 255},40,90)`; g.fillRect(0, 0, 640, 480); }, 33);
      return realCapture.call(c, 30);
    };
  });
  await page.goto(`${base}/web/`);
  await page.waitForFunction(() => window.__pingReady === true, { timeout: 120000 });
  const atReady = log.length;
  await page.evaluate(() => window.__pingStart());
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const [worker] = page.workers();
  out.workerRefused = await worker.evaluate(() => self.__pingWorkerPrivacy.refused);
  out.pageRefused = await page.evaluate(() => window.__pingPrivacy.refused);
  out.frames = await page.evaluate(() => window.__pingFrames);
  out.requestsBeforeReady = log.slice(0, atReady);
  out.requestsAfterReady = log.slice(atReady);
} finally {
  await browser.close();
  server.close();
}
const text = fs.readFileSync(netlog, "utf8");
let nl;
try { nl = JSON.parse(text); } catch { nl = JSON.parse(text.replace(/,?\s*$/, "") + "]}"); }
const START = nl.constants.logEventTypes.URL_REQUEST_START_JOB;
const urls = nl.events.filter((e) => e.type === START && e.params?.url && (e.params.initiator === origin || e.params.url.startsWith(origin))).map((e) => e.params.url);
out.netLog = { requests: urls.length, otherHosts: urls.filter((u) => !u.startsWith(`${origin}/`)) };
fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "out", "web-requests.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`${out.page}: ${out.requestsBeforeReady.length} requests before ready, ${out.requestsAfterReady.length} after (${seconds} s with the camera running, ${out.frames} frames); ` +
  `net log: ${out.netLog.requests} requests, ${out.netLog.otherHosts.length} to other hosts; refused in the worker: ${out.workerRefused.length ? out.workerRefused.join(", ") : "nothing"}`);
