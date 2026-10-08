// PNG read/write, PNG text chunks and hashing. Pixels are always 8-bit RGBA: { width, height, data: Uint8Array }.
import crypto from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";
import { PNG } from "pngjs";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Every fixture PNG carries this text chunk; scripts refuse such files as character art.
export const FIXTURE_KEY = "PingTestFixture";
export const FIXTURE_VALUE = "TEST FIXTURE - not character art";

export function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function decode(buf) {
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) };
}

// Same pixels in, same bytes out (for a given Node zlib): fixed deflate level and filter, no timestamps.
export function encode(img, text = {}) {
  const png = new PNG({ width: img.width, height: img.height, colorType: 6, inputColorType: 6, bitDepth: 8 });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length);
  const buf = PNG.sync.write(png, { colorType: 6, inputColorType: 6, deflateLevel: 9, filterType: -1 });
  const keys = Object.keys(text);
  if (!keys.length) return buf;
  // Insert tEXt chunks right after IHDR (8-byte signature + 25-byte IHDR chunk).
  const chunks = keys.sort().map((k) => chunk("tEXt", Buffer.from(k + "\0" + text[k], "latin1")));
  return Buffer.concat([buf.subarray(0, 33), ...chunks, buf.subarray(33)]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Lists every chunk: [{ type, length, data }]. Used for tEXt lookups and, later, metadata dumps.
export function chunks(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG file");
  const out = [];
  let p = 8;
  while (p + 8 <= buf.length) {
    const length = buf.readUInt32BE(p);
    const type = buf.toString("latin1", p + 4, p + 8);
    out.push({ type, length, data: buf.subarray(p + 8, p + 8 + length) });
    p += 12 + length;
    if (type === "IEND") break;
  }
  return out;
}

export function textChunks(buf) {
  const out = {};
  for (const c of chunks(buf)) {
    if (c.type !== "tEXt") continue;
    const i = c.data.indexOf(0);
    out[c.data.toString("latin1", 0, i)] = c.data.toString("latin1", i + 1);
  }
  return out;
}

export function isFixture(buf) {
  return textChunks(buf)[FIXTURE_KEY] === FIXTURE_VALUE;
}

export function readPng(file) {
  const buf = fs.readFileSync(file);
  return { buf, img: decode(buf), sha256: sha256(buf), fixture: isFixture(buf) };
}

export function writePng(file, img, text) {
  const buf = encode(img, text);
  fs.writeFileSync(file, buf);
  return { bytes: buf.length, sha256: sha256(buf) };
}

// C2PA manifests in PNG live in a "caBX" chunk holding a JUMBF box (box type "jumb", label "c2pa").
export function c2paChunks(buf) {
  // IDAT is compressed pixels, where any 4 bytes can occur by chance; only metadata chunks are searched.
  return chunks(buf).filter((c) => c.type === "caBX" || (c.type !== "IDAT" && (c.data.includes(Buffer.from("jumb")) || c.data.includes(Buffer.from("c2pa")))));
}

// Chunk list for metadata dumps: type, length, and the keyword of text chunks.
export function describeChunks(buf) {
  return chunks(buf).map((c) => {
    const d = { type: c.type, length: c.length };
    if (["tEXt", "zTXt", "iTXt"].includes(c.type)) d.keyword = c.data.toString("latin1", 0, c.data.indexOf(0));
    return d;
  });
}
