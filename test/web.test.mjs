// The webcam page in headless Chrome with the camera request stubbed out (a synthetic canvas stream; the real camera is
// never opened and no permission prompt appears). Checked by eye by the author on 2026-10-09, no measurements.
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

function stubCamera() {
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
}

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
  // The worker locks itself down after the model has loaded and before it says ready, and has no dynamic import.
  const worker = webJs[1][1];
  assert.ok(worker.indexOf("lockDown(self);") > worker.indexOf("createFromOptions") && worker.indexOf("lockDown(self);") < worker.indexOf('postMessage({ type: "ready" })'));
  assert.ok(!/\bimport\s*\(/.test(worker), "no dynamic import() in the worker");
  const guards = fs.readFileSync(path.join(ROOT, "web", "worker-privacy.js"), "utf8");
  for (const name of ["fetch", "importScripts", "XMLHttpRequest", "WebSocket", "EventSource", "convertToBlob"]) assert.ok(guards.includes(`"${name}"`), name);
});

test("headless: no request after ready, the video never drawn or attached, nothing stored, guards refuse", { skip, timeout: 180000 }, async () => {
  const { default: puppeteer } = await import("puppeteer-core");
  const { server, log, port } = await startServer(0);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--deny-permission-prompts"] });
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(stubCamera);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/web/index.html`);
    await page.waitForFunction(() => window.__pingReady === true, { timeout: 120000 });
    const atReady = log.length;
    await page.evaluate(() => window.__pingStart());
    await page.waitForFunction(() => window.__pingFrames >= 16, { timeout: 120000 });
    const r = await page.evaluate(async () => {
      // Both counters are read together, before anything awaits, so a result arriving meanwhile cannot split them.
      const P = window.__pingPrivacy, out = { handoffs: P.videoHandoffs, frames: window.__pingFrames, refused: [...P.refused], videos: document.querySelectorAll("video").length, stub: window.__stubCalls, local: localStorage.length, session: sessionStorage.length };
      out.dbs = (await indexedDB.databases()).length;
      const v = document.createElement("video"), c = document.createElement("canvas").getContext("2d");
      const tries = {};
      for (const [name, fn] of Object.entries({
        drawImage: () => c.drawImage(v, 0, 0), createImageBitmap: () => createImageBitmap(v), append: () => document.body.appendChild(v),
        fetch: () => fetch("/web/index.html"), recorder: () => new MediaRecorder(), capture: () => v.captureStream(),
      })) { try { await fn(); tries[name] = "allowed"; } catch (e) { tries[name] = String(e.message).startsWith("privacy:") ? "refused" : `other: ${e.message}`; } }
      out.tries = tries;
      return out;
    });
    // Inside the detector worker, after ready: every way out is refused, and nothing reaches the server.
    const atWorker = log.length;
    const [worker] = page.workers();
    assert.ok(worker, "the detector worker is running");
    const w = await worker.evaluate(async () => {
      const tries = {};
      for (const [name, fn] of Object.entries({
        fetch: () => fetch("/web/index.html"),
        XMLHttpRequest: () => { const x = new XMLHttpRequest(); x.open("GET", "/web/index.html"); x.send(); },
        WebSocket: () => new WebSocket("ws://127.0.0.1:9/"),
        importScripts: () => importScripts("/web/privacy.js"),
        convertToBlob: () => new OffscreenCanvas(4, 4).convertToBlob(),
      })) { try { await fn(); tries[name] = "allowed"; } catch (e) { tries[name] = String(e.message).startsWith("privacy:") ? "refused" : `other: ${e.message}`; } }
      return { tries, refused: self.__pingWorkerPrivacy.refused.length };
    });
    assert.deepEqual(w.tries, { fetch: "refused", XMLHttpRequest: "refused", WebSocket: "refused", importScripts: "refused", convertToBlob: "refused" });
    assert.equal(w.refused, 5);
    assert.deepEqual(log.slice(atWorker), [], "nothing from the worker reached the server");
    r.worker = w;
    r.ticks = await page.evaluate(() => ({ timestamps: window.__pingTimestamps, timing: document.getElementById("timing").textContent, ticks: window.__pingTicks, busySkips: window.__pingBusySkips, repeatSkips: window.__pingRepeatSkips, handoffs: window.__pingPrivacy.videoHandoffs, frames: window.__pingFrames }));
    // Chrome has requestVideoFrameCallback: the detector gets the video's own frame times, and the page says so.
    assert.equal(r.ticks.timestamps, "video");
    assert.match(r.ticks.timing, /requestVideoFrameCallback/);
    const after = log.slice(atReady);
    assert.deepEqual(errors, []);
    assert.deepEqual(after, [], `requests after ready: ${after.join(", ")}`);
    assert.ok(log.includes("/web/detector-worker.js") && log.includes("/web/models/face_landmarker.task"), "the detector worker and the model came from this server");
    assert.equal(r.stub, 1);
    assert.equal(r.videos, 0, "no video element in the page");
    // The first drawn frame comes before any hand-off; every later one is a detector result for one hand-off.
    assert.ok(r.handoffs >= r.frames - 1 && r.handoffs <= r.frames + 1, `handoffs ${r.handoffs}, frames ${r.frames}`);
    assert.deepEqual([r.local, r.session, r.dbs], [0, 0, 0], "nothing stored");
    assert.deepEqual(r.tries, { drawImage: "refused", createImageBitmap: "refused", append: "refused", fetch: "refused", recorder: "refused", capture: "refused" });
    fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, "out", "web-headless.json"), JSON.stringify({ requestsBeforeReady: log.slice(0, atReady), requestsAfterReady: after, ...r }, null, 2) + "\n");
  } finally {
    await browser.close();
    server.close();
  }
});

test("headless fallback: without requestVideoFrameCallback the page uses frame count / 30 and says so", { skip, timeout: 180000 }, async () => {
  const { default: puppeteer } = await import("puppeteer-core");
  const { server, log, port } = await startServer(0);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--deny-permission-prompts"] });
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(stubCamera);
    await page.evaluateOnNewDocument(() => { delete HTMLVideoElement.prototype.requestVideoFrameCallback; });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/web/index.html`);
    await page.waitForFunction(() => window.__pingReady === true, { timeout: 120000 });
    const atReady = log.length;
    await page.evaluate(() => window.__pingStart());
    await page.waitForFunction(() => window.__pingFrames >= 8, { timeout: 120000 });
    const r = await page.evaluate(() => ({ timestamps: window.__pingTimestamps, timing: document.getElementById("timing").textContent }));
    assert.deepEqual(errors, []);
    assert.equal(r.timestamps, "count");
    assert.match(r.timing, /frame count \/ 30/);
    assert.deepEqual(log.slice(atReady), []);
  } finally {
    await browser.close();
    server.close();
  }
});

test("headless recording mode (?record=1): the points and Ping only, one caption, the same privacy", { skip, timeout: 180000 }, async () => {
  const { default: puppeteer } = await import("puppeteer-core");
  const { server, log, port } = await startServer(0);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--deny-permission-prompts"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.evaluateOnNewDocument(stubCamera);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/web/index.html?record=1`);
    await page.waitForFunction(() => window.__pingReady === true, { timeout: 120000 });
    const atReady = log.length;
    // The camera starts by itself in this mode.
    await page.waitForFunction(() => window.__pingFrames >= 8, { timeout: 120000 });
    const r = await page.evaluate(async () => {
      const vis = (id) => document.getElementById(id).getClientRects().length > 0;
      let refused = "allowed";
      try { await fetch("/web/index.html"); } catch (e) { refused = String(e.message).startsWith("privacy:") ? "refused" : e.message; }
      return { text: document.body.innerText.trim(), caption: document.getElementById("caption").textContent, visible: ["ping", "points", "caption", "start", "status", "timing"].filter(vis),
        body: [document.body.offsetWidth, document.body.offsetHeight], background: getComputedStyle(document.body).backgroundColor, videos: document.querySelectorAll("video").length, stub: window.__stubCalls, fetch: refused };
    });
    const pts = JSON.parse(fs.readFileSync(path.join(ROOT, "web", "record-points.json"), "utf8"));
    assert.deepEqual(errors, []);
    assert.equal(r.caption, `${pts.shown} of 478 points shown`);
    assert.equal(r.text, r.caption, "no other text on the page");
    assert.deepEqual(r.visible, ["ping", "points", "caption"]);
    assert.deepEqual(r.body, [1920, 1080]);
    assert.equal(r.background, "rgb(0, 0, 0)");
    assert.equal(r.videos, 0);
    assert.equal(r.stub, 1);
    assert.equal(r.fetch, "refused");
    assert.deepEqual(log.slice(atReady), [], "no request after ready");
    assert.ok(log.includes("/web/record-points.json"));
  } finally {
    await browser.close();
    server.close();
  }
});
