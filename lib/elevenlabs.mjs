// ElevenLabs calls, Node only. The API key is read the way the CodeMask episodes pipeline reads it:
// ELEVENLABS_API_KEY, or else the ElevenLabs MCP entry in ~/.claude.json. It is held in
// memory only: never printed, logged, written to a file, or put in an error message. test/voice.test.mjs checks that
// it appears nowhere in the repository, its history, or logs/.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const API = "https://api.elevenlabs.io/v1";

export function apiKey({ optional = false } = {}) {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  let key = null;
  try {
    const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude.json"), "utf8"));
    (function find(o) {
      if (!o || typeof o !== "object" || key) return;
      for (const [k, v] of Object.entries(o)) {
        if (k === "mcpServers" && v && typeof v === "object") {
          for (const [name, cfg] of Object.entries(v)) if (/eleven/i.test(name) && cfg?.env?.ELEVENLABS_API_KEY) key = cfg.env.ELEVENLABS_API_KEY;
        }
        find(v);
      }
    })(config);
  } catch {
    key = null;
  }
  if (!key && !optional) throw new Error("no ElevenLabs API key: set ELEVENLABS_API_KEY or add the ElevenLabs MCP server");
  return key;
}

async function call(pathAndQuery, init = {}) {
  const res = await fetch(`${API}${pathAndQuery}`, { ...init, headers: { ...(init.headers || {}), "xi-api-key": apiKey() } });
  // Error bodies are cut short and never echo request headers, so the key cannot leak through them.
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} on ${pathAndQuery.split("?")[0]}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

export async function listVoices() {
  const res = await call("/voices");
  return (await res.json()).voices;
}

// Text to speech with character timestamps. Returns the decoded audio bytes, the alignment and the server's Date
// header (the date recorded for disclosure comes from ElevenLabs, not from this machine's clock).
export async function ttsWithTimestamps({ voiceId, modelId, settings, outputFormat, seed, text }) {
  const res = await call(`/text-to-speech/${voiceId}/with-timestamps?output_format=${outputFormat}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: modelId, voice_settings: settings, ...(seed !== undefined ? { seed } : {}) }),
  });
  const body = await res.json();
  return { audio: Buffer.from(body.audio_base64, "base64"), alignment: body.alignment, normalizedAlignment: body.normalized_alignment, serverDate: res.headers.get("date") };
}
