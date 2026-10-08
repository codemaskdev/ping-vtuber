// Privacy guards, loaded before any other script of the page (author's prompt #15). NOT VERIFIED WITH A REAL CAMERA.
// - The video never reaches drawImage, texImage2D/texSubImage2D or createImageBitmap, except through handOff(), the
//   one call that turns a frame into an ImageBitmap for the detector worker.
// - The video element can never be attached to the page.
// - Nothing is recorded: MediaRecorder and captureStream throw.
// - After the page is ready (models loaded), fetch, XMLHttpRequest, WebSocket, EventSource and sendBeacon throw.
(function () {
  "use strict";
  const P = (window.__pingPrivacy = { videoHandoffs: 0, refused: [], ready: false });
  const isVideo = (x) => x instanceof HTMLVideoElement || (typeof VideoFrame !== "undefined" && x instanceof VideoFrame);
  const refuse = (what) => { P.refused.push(what); throw new Error(`privacy: ${what} refused`); };
  const realCreateImageBitmap = window.createImageBitmap.bind(window);
  let handingOff = false;

  window.createImageBitmap = function (src, ...rest) {
    if (isVideo(src) && !handingOff) refuse("createImageBitmap(video)");
    return realCreateImageBitmap(src, ...rest);
  };
  P.handOff = async function (video) {
    if (!isVideo(video)) throw new Error("handOff takes the video");
    handingOff = true;
    try { return await realCreateImageBitmap(video); } finally { handingOff = false; P.videoHandoffs++; }
  };

  const guardArgs = (proto, name) => {
    if (!proto || !proto[name]) return;
    const real = proto[name];
    proto[name] = function (...args) {
      if (args.some(isVideo)) refuse(`${name}(video)`);
      return real.apply(this, args);
    };
  };
  guardArgs(window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype, "drawImage");
  guardArgs(window.OffscreenCanvasRenderingContext2D && OffscreenCanvasRenderingContext2D.prototype, "drawImage");
  for (const gl of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!gl) continue;
    for (const n of ["texImage2D", "texSubImage2D", "texImage3D", "texSubImage3D"]) guardArgs(gl.prototype, n);
  }
  for (const proto of [Node.prototype, Element.prototype]) {
    for (const n of ["appendChild", "insertBefore", "replaceChild", "append", "prepend", "after", "before", "replaceWith"]) {
      if (!Object.prototype.hasOwnProperty.call(proto, n)) continue;
      const real = proto[n];
      proto[n] = function (...args) {
        if (args.some((a) => a instanceof HTMLVideoElement)) refuse(`${n}(video)`);
        return real.apply(this, args);
      };
    }
  }
  window.MediaRecorder = function () { refuse("MediaRecorder"); };
  HTMLMediaElement.prototype.captureStream = function () { refuse("captureStream"); };
  HTMLCanvasElement.prototype.captureStream = function () { refuse("captureStream"); };

  const afterReady = (name, real) => function (...args) {
    if (P.ready) refuse(`${name} after the page was ready`);
    return real.apply(this, args);
  };
  window.fetch = afterReady("fetch", window.fetch);
  XMLHttpRequest.prototype.open = afterReady("XMLHttpRequest", XMLHttpRequest.prototype.open);
  if (navigator.sendBeacon) navigator.sendBeacon = afterReady("sendBeacon", navigator.sendBeacon.bind(navigator));
  const RealWS = window.WebSocket, RealES = window.EventSource;
  window.WebSocket = function (...a) { if (P.ready) refuse("WebSocket after the page was ready"); return new RealWS(...a); };
  window.EventSource = function (...a) { if (P.ready) refuse("EventSource after the page was ready"); return new RealES(...a); };
})();
