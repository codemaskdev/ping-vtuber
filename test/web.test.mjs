// The webcam page in headless Chrome with the camera request stubbed out (a synthetic canvas stream; the real camera is
// never opened and no permission prompt appears). NOT VERIFIED WITH A REAL CAMERA.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ROOT } from "../lib/spec.mjs";
import { startServer } from "../scripts/serve-web.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ready = fs.existsSync(CHROME) && fs.existsSync(path.join(ROOT, "web", "vendor")) && fs.existsSync(path.join(ROOT, "web", "models", "face_landmarker.task"));
const skip = ready ? false : "needs Google Chrome and npm run web:vendor";
const webJs = ["web/main.js", "web/detector-worker.js"].map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]);

test("static: the page code never draws, stores, records or sends the video", () => {
  for (const [f, src] of webJs) {
    for (const bad of ["drawImage", "texImage", "captureStream", "MediaRecorder", "toDataURL", "toBlob", "localStorage", "sessionStorage", "indexedDB", "sendBeacon", "WebSocket", "XMLHttpRequest", "appendChild(video", "append(video", "Date.now", "performance.now"]) {
      assert.ok(!src.includes(bad), `${f}: ${bad}`);
    }
  }
  const main = webJs[0][1];
  assert.equal((main.match(/P\.handOff\(video\)/g) || []).length, 1, "exactly one call hands the video to the detector");
  assert.ok(!/createImageBitmap\(/.test(main), "main.js makes no ImageBitmap itself");
  assert.match(fs.readFileSync(path.join(ROOT, "web", "index.html"), "utf8"), /<script src="\/web\/privacy.js"><\/script>\s*<script src="\/rig\/adapter.js">/);
  assert.ok(!/https?:\/\//.test(webJs.map(([, s]) => s).join("\n")), "no absolute URL, no CDN");
});

test("headless: no request after ready, the video never drawn or attached, nothing stored, guards refuse", { skip, timeout: 180000 }, async () => {
  const { default: puppeteer } = await import("puppeteer-core");
  const { server, log, port } = await startServer(0);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--deny-permission-prompts"] });
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      // The stub: a moving synthetic picture instead of a camera. captureStream is kept from before privacy.js runs.
      const realCapture = HTMLCanvasElement.prototype.captureStream;
      window.__stubCalls = 0;
      navigator.mediaDevices.getUserMedia = async () => {
        window.__stubCalls++;
        const c = document.createElement("canvas");
        c.width = 640; c.height = 480;
        const g = c.getContext("2d");
        let i = 0;
        setInterval(() => { g.fillStyle = `rgb(${(i += 7) % 255},40,90)`; g.fillRect(0, 0, 640, 480); }, 33);
        return realCapture.call(c, 30);
      };
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/web/index.html`);
    await page.waitForFunction(() => window.__pingReady === true, { timeout: 120000 });
    const atReady = log.length;
    await page.evaluate(() => window.__pingStart());
    await page.waitForFunction(() => window.__pingFrames >= 16, { timeout: 120000 });
    const r = await page.evaluate(async () => {
      const P = window.__pingPrivacy, out = { handoffs: P.videoHandoffs, refused: [...P.refused], videos: document.querySelectorAll("video").length, stub: window.__stubCalls, local: localStorage.length, session: sessionStorage.length, dbs: (await indexedDB.databases()).length, frames: window.__pingFrames };
      const v = document.createElement("video"), c = document.createElement("canvas").getContext("2d");
      const tries = {};
      for (const [name, fn] of Object.entries({
        drawImage: () => c.drawImage(v, 0, 0), createImageBitmap: () => createImageBitmap(v), append: () => document.body.appendChild(v),
        fetch: () => fetch("/web/index.html"), recorder: () => new MediaRecorder(), capture: () => v.captureStream(),
      })) { try { await fn(); tries[name] = "allowed"; } catch (e) { tries[name] = String(e.message).startsWith("privacy:") ? "refused" : `other: ${e.message}`; } }
      out.tries = tries;
      return out;
    });
    const after = log.slice(atReady);
    assert.deepEqual(errors, []);
    assert.deepEqual(after, [], `requests after ready: ${after.join(", ")}`);
    assert.ok(log.includes("/web/detector-worker.js") && log.includes("/web/models/face_landmarker.task"), "the detector worker and the model came from this server");
    assert.equal(r.stub, 1);
    assert.equal(r.videos, 0, "no video element in the page");
    assert.ok(r.handoffs >= 16 && r.handoffs <= r.frames + 1, `handoffs ${r.handoffs}, frames ${r.frames}`);
    assert.deepEqual([r.local, r.session, r.dbs], [0, 0, 0], "nothing stored");
    assert.deepEqual(r.tries, { drawImage: "refused", createImageBitmap: "refused", append: "refused", fetch: "refused", recorder: "refused", capture: "refused" });
    fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, "out", "web-headless.json"), JSON.stringify({ requestsBeforeReady: log.slice(0, atReady), requestsAfterReady: after, ...r }, null, 2) + "\n");
  } finally {
    await browser.close();
    server.close();
  }
});
