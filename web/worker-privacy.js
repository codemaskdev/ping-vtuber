// Privacy guards inside the detector worker (author's prompt #16). The worker receives the camera frames, so after the
// model has loaded it may not reach the network or turn pixels into a file: fetch, XMLHttpRequest, WebSocket,
// EventSource, WebTransport, importScripts, nested workers and OffscreenCanvas capture (convertToBlob) all throw.
// Every refusal is recorded in self.__pingWorkerPrivacy.refused. Checked by eye by the author on 2026-10-09, no measurements.
// Not covered: a dynamic import() is syntax and cannot be replaced; the worker's own code (detector-worker.js) has none
// after ready, and test/web.test.mjs checks that statically.

export function lockDown(scope) {
  const P = (scope.__pingWorkerPrivacy = { locked: true, refused: [] });
  const refuse = (what) => { P.refused.push(what); throw new Error(`privacy: ${what} refused in the detector worker`); };
  const blockCall = (obj, name) => {
    if (!obj || typeof obj[name] !== "function") return;
    Object.defineProperty(obj, name, { value: function () { refuse(name); }, writable: false, configurable: false });
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
