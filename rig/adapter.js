// Draws a draw list from lib/rig.mjs onto a 2D canvas inside a HyperFrames composition. No rig logic here: the
// list says which layers, in which order, with which offset, rotation and translation; this only paints them.
// The rotation is the renderer's job (CLAUDE.md rule 5 keeps trigonometry out of the rig itself).
(function (root) {
  function place(ctx, rotate, translate) {
    ctx.translate(translate[0], translate[1]);
    ctx.translate(rotate.centre[0], rotate.centre[1]);
    ctx.rotate((rotate.deg * Math.PI) / 180);
    ctx.translate(-rotate.centre[0], -rotate.centre[1]);
  }

  // images: { "art/layers/head.png": <img>, ... } keyed by the draw list's file.
  function draw(ctx, images, list) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const item of list) {
      const img = images[item.file];
      if (!img) throw new Error("no image for " + item.file);
      ctx.save();
      ctx.globalAlpha = item.opacity;
      place(ctx, item.rotate, item.translate);
      ctx.translate(item.offset[0], item.offset[1]);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    }
  }

  // Debug skeleton from lib/rig.mjs skeleton(): thin coloured lines, clearly not character art.
  const COLOURS = { rect: "#ffe000", cross: "#ff00dc", line: "#ff8c00", smile: "#ff2020" };
  function drawSkeleton(ctx, sk) {
    ctx.save();
    place(ctx, sk.rotate, sk.translate);
    ctx.lineWidth = 3;
    for (const it of sk.items) {
      if (it.type === "rect") {
        ctx.strokeStyle = COLOURS.rect;
        ctx.strokeRect(it.box[0] + 0.5, it.box[1] + 0.5, it.box[2] - 1, it.box[3] - 1);
      } else if (it.type === "cross") {
        ctx.strokeStyle = COLOURS.cross;
        ctx.beginPath();
        ctx.moveTo(it.at[0] - 14, it.at[1]); ctx.lineTo(it.at[0] + 14, it.at[1]);
        ctx.moveTo(it.at[0], it.at[1] - 14); ctx.lineTo(it.at[0], it.at[1] + 14);
        ctx.stroke();
      } else if (it.type === "line") {
        ctx.strokeStyle = it.label === "smile top" ? COLOURS.smile : COLOURS.line;
        ctx.setLineDash(it.label === "smile top" ? [12, 8] : []);
        ctx.beginPath(); ctx.moveTo(it.from[0], it.from[1]); ctx.lineTo(it.to[0], it.to[1]); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  root.PingAdapter = { draw, drawSkeleton };
})(window);
