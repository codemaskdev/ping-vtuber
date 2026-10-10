// Privacy guards inside the detector worker (author's prompt #16). The worker receives the camera frames, so after the
// model has loaded it may not reach the network or turn pixels into a file: fetch, XMLHttpRequest, WebSocket,
// EventSource, WebTransport, importScripts, nested workers and OffscreenCanvas capture (convertToBlob) all throw.
// Every refusal is recorded in self.__pingWorkerPrivacy.refused (with sameOriginOnly's, if any). Checked by eye by the author on 2026-10-09, no measurements.
// Not covered: a dynamic import() is syntax and cannot be replaced; the worker's own code (detector-worker.js) has none
// after ready, and test/web.test.mjs checks that statically.

// From the worker's first line (author's prompt #24): no request to any host but the page's own. MediaPipe Tasks Vision
// 1.1.0 has a usage logger that posts to odml.pa.googleapis.com every 60 s through fetch; without this it would be
// refused only once lockDown() has run, so a model load slower than 60 s would let one report out. Every refusal is
// recorded in self.__pingWorkerPrivacy.refused with the host it was for.
export function sameOriginOnly(scope) {
  const P = (scope.__pingWorkerPrivacy = scope.__pingWorkerPrivacy ?? { locked: false, refused: [] });
  const host = scope.location.host;
  const foreign = (url) => new URL(String(url), scope.location.href).host !== host;
  const refuse = (what, url) => { const to = new URL(String(url), scope.location.href).host; P.refused.push(`${what} to ${to}`); throw new Error(`privacy: ${what} to ${to} refused in the detector worker`); };
  const realFetch = scope.fetch;
  if (realFetch) scope.fetch = function (input, ...rest) {
    const url = typeof input === "object" && input && "url" in input ? input.url : input;
    if (foreign(url)) refuse("fetch", url);
    return realFetch.call(scope, input, ...rest);
  };
  if (scope.XMLHttpRequest) {
    const open = scope.XMLHttpRequest.prototype.open;
    scope.XMLHttpRequest.prototype.open = function (method, url, ...rest) { if (foreign(url)) refuse("XMLHttpRequest", url); return open.call(this, method, url, ...rest); };
  }
  if (typeof scope.importScripts === "function") {
    const realImport = scope.importScripts;
    scope.importScripts = function (...urls) { for (const u of urls) if (foreign(u)) refuse("importScripts", u); return realImport.apply(scope, urls); };
  }
  for (const name of ["WebSocket", "EventSource", "WebTransport"]) {
    const Real = scope[name];
    if (typeof Real !== "function") continue;
    scope[name] = function (url, ...rest) { if (foreign(url)) refuse(name, url); return new Real(url, ...rest); };
  }
  return P;
}

export function lockDown(scope) {
  const P = (scope.__pingWorkerPrivacy = scope.__pingWorkerPrivacy ?? { refused: [] });
  P.locked = true;
  const refuse = (what) => { P.refused.push(what); throw new Error(`privacy: ${what} refused in the detector worker`); };
  // fetch and importScripts are recorded with the host they were for (MediaPipe's usage logger shows up here)
  const hostOf = (url) => { try { return new URL(String(typeof url === "object" && url && "url" in url ? url.url : url), scope.location.href).host; } catch { return null; } };
  const blockCall = (obj, name) => {
    if (!obj || typeof obj[name] !== "function") return;
    const withHost = name === "fetch" || name === "importScripts";
    Object.defineProperty(obj, name, { value: function (first) { const to = withHost && first !== undefined ? hostOf(first) : null; refuse(to ? `${name} to ${to}` : name); }, writable: false, configurable: false });
  };
  const blockClass = (name) => {
    if (typeof scope[name] !== "function") return;
    Object.defineProperty(scope, name, { value: function () { refuse(name); }, writable: false, configurable: false });
  };
  blockCall(scope, "fetch");
  blockCall(scope, "importScripts");
  for (const name of ["XMLHttpRequest", "WebSocket", "EventSource", "WebTransport", "Worker", "SharedWorker"]) blockClass(name);
  if (scope.OffscreenCanvas) blockCall(scope.OffscreenCanvas.prototype, "convertToBlob");
  return P;
}
