// Telugu voice I/O via Sarvam: saarika STT and bulbul:v3 TTS.
// TTS is cached in memory (LRU) and on disk (DATA_DIR/tts-cache/<sha1>.wav), so restarts and
// deploys never re-render a line. Every Sarvam call goes through the shared gate in sarvam.mjs.
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { SERVER_DIR } from "./env.mjs";
import { sarvamFetch } from "./sarvam.mjs";

const TTS_URL = "https://api.sarvam.ai/text-to-speech";
const STT_URL = "https://api.sarvam.ai/speech-to-text";
const MAX_CHARS = 450; // keep each TTS request comfortably under the per-request text limit
const CACHE_CAP = 400;

const env = (k) => String(process.env[k] ?? "").trim();
export const hasVoice = () => !!env("SARVAM_API_KEY");

const speakerOf = () => env("VOICE_SPEAKER") || "kavitha";
const paceOf = () => Number(env("VOICE_PACE") || 1.1);
const cacheDir = () => path.join(process.env.DATA_DIR || path.join(SERVER_DIR, "data"), "tts-cache");
const keyOf = (lang, text) => createHash("sha1").update(`${speakerOf()}|${paceOf()}|${lang}|${text}`).digest("hex");

const mem = new Map();
const inflight = new Map();
export const stats = { memHits: 0, diskHits: 0, rendered: 0, failed: 0 };

const SARVAM_LANGS = new Set(["en", "hi", "te", "ta", "kn", "ml", "mr", "bn", "gu", "pa", "od"]);
/** "te" | "te-IN" | "or" | "od" → Sarvam code ("od-IN"); "unknown" kept for STT auto-detect. */
export function toCode(lang, fallback = "te-IN") {
  const c = String(lang ?? "").trim().toLowerCase();
  if (!c) return fallback;
  if (c === "unknown") return "unknown";
  let b = c.split(/[-_]/)[0];
  if (b === "or") b = "od";
  return SARVAM_LANGS.has(b) ? `${b}-IN` : "en-IN";
}

/* -------------------------------------------------------------------- STT */

/** Transcript of a WAV. lang: "te" | "te-IN" | … | "unknown" (auto-detect, used for English sessions). */
export async function stt(wav, lang = "te-IN") {
  const key = env("SARVAM_API_KEY");
  if (!key) throw new Error("STT: SARVAM_API_KEY is not set");
  const buf = Buffer.isBuffer(wav) ? wav : Buffer.from(wav);
  const code = toCode(lang, "te-IN");
  const res = await sarvamFetch(
    STT_URL,
    () => {
      const form = new FormData();
      form.append("file", new Blob([buf], { type: "audio/wav" }), "audio.wav");
      form.append("model", env("STT_MODEL") || "saarika:v2.5");
      form.append("language_code", code);
      return { method: "POST", headers: { "api-subscription-key": key }, body: form, signal: AbortSignal.timeout(30000) };
    },
    "stt",
  );
  if (!res.ok) throw new Error(`STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return String((await res.json()).transcript ?? "").trim();
}

/* -------------------------------------------------------------------- TTS */

function split(text) {
  if (text.length <= MAX_CHARS) return [text];
  const chunks = [];
  let cur = "";
  for (const part of text.split(/(?<=[.!?।\n])\s+/)) {
    if (cur && `${cur} ${part}`.length > MAX_CHARS) {
      chunks.push(cur);
      cur = part;
    } else cur = cur ? `${cur} ${part}` : part;
  }
  if (cur) chunks.push(cur);
  return chunks.flatMap((c) => (c.length <= MAX_CHARS ? [c] : c.match(new RegExp(`[\\s\\S]{1,${MAX_CHARS}}`, "g"))));
}

async function ttsRequest(text, lang, speaker) {
  const res = await sarvamFetch(
    TTS_URL,
    () => ({
      method: "POST",
      headers: { "api-subscription-key": env("SARVAM_API_KEY"), "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        language_code: lang,
        model: "bulbul:v3",
        temperature: 0.85,
        speaker,
        pace: paceOf(),
        speech_sample_rate: 22050,
        output_audio_codec: "wav",
      }),
      signal: AbortSignal.timeout(25000),
    }),
    "tts",
  );
  if (!res.ok) throw Object.assign(new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 200)}`), { status: res.status });
  const b64 = (await res.json()).audios?.[0];
  if (!b64) throw new Error("TTS returned no audio");
  return Buffer.from(b64, "base64");
}

async function ttsChunk(text, lang) {
  const speaker = speakerOf();
  try {
    return await ttsRequest(text, lang, speaker);
  } catch (e) {
    if (speaker !== "kavitha" && (e.status === 400 || e.status === 422)) return ttsRequest(text, lang, "kavitha");
    throw e;
  }
}

function parseWav(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("TTS chunk is not a WAV");
  let off = 12;
  let fmt = null;
  let data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    const start = off + 8;
    if (id === "fmt ") fmt = buf.subarray(start, start + size);
    else if (id === "data") {
      if (start + size > buf.length) size = buf.length - start;
      data = buf.subarray(start, start + size);
      break;
    }
    off = start + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("TTS chunk WAV has no fmt/data");
  return { fmt, data };
}

function mergeWavs(bufs) {
  const parts = bufs.map(parseWav);
  const fmt = parts[0].fmt;
  const dataLen = parts.reduce((n, p) => n + p.data.length, 0);
  const head = Buffer.alloc(20 + fmt.length + 8);
  head.write("RIFF", 0, "ascii");
  head.writeUInt32LE(12 + fmt.length + 8 + dataLen, 4);
  head.write("WAVE", 8, "ascii");
  head.write("fmt ", 12, "ascii");
  head.writeUInt32LE(fmt.length, 16);
  fmt.copy(head, 20);
  head.write("data", 20 + fmt.length, "ascii");
  head.writeUInt32LE(dataLen, 24 + fmt.length);
  return Buffer.concat([head, ...parts.map((p) => p.data)]);
}

async function diskGet(k) {
  try {
    return (await readFile(path.join(cacheDir(), `${k}.wav`))).toString("base64");
  } catch {
    return null;
  }
}

async function diskPut(k, buf) {
  try {
    const dir = cacheDir();
    await mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `${k}.${process.pid}.${Date.now()}.tmp`);
    await writeFile(tmp, buf);
    await rename(tmp, path.join(dir, `${k}.wav`));
  } catch (e) {
    console.warn(`[tts] disk cache write failed: ${e.message}`);
  }
}

function remember(k, b64) {
  mem.set(k, b64);
  if (mem.size > CACHE_CAP) mem.delete(mem.keys().next().value);
}

/** base64 WAV for `text`, or null on failure. Memory → disk → Sarvam; long text is split and stitched. */
export async function tts(text, language = "te-IN") {
  const t = String(text ?? "").trim();
  if (!t || !hasVoice()) return null;
  const lang = toCode(language, "te-IN") === "unknown" ? "en-IN" : toCode(language, "te-IN");
  const k = keyOf(lang, t);
  if (mem.has(k)) {
    const v = mem.get(k);
    mem.delete(k);
    mem.set(k, v);
    stats.memHits++;
    return v;
  }
  if (inflight.has(k)) return inflight.get(k);
  const p = (async () => {
    try {
      const disk = await diskGet(k);
      if (disk) {
        stats.diskHits++;
        remember(k, disk);
        return disk;
      }
      const bufs = await Promise.all(split(t).map((c) => ttsChunk(c, lang)));
      const wav = bufs.length === 1 ? bufs[0] : mergeWavs(bufs);
      await diskPut(k, wav);
      const b64 = wav.toString("base64");
      remember(k, b64);
      stats.rendered++;
      return b64;
    } catch (e) {
      stats.failed++;
      console.warn(`[tts] ${e.message}`);
      return null;
    } finally {
      inflight.delete(k);
    }
  })();
  inflight.set(k, p);
  return p;
}

/** True when `text` is already cached (memory or disk), so a prewarm can skip its delay. */
export async function isCached(text, lang = "te-IN") {
  const t = String(text ?? "").trim();
  if (!t) return true;
  const k = keyOf(toCode(lang, "te-IN"), t);
  if (mem.has(k)) return true;
  return !!(await diskGet(k));
}

/**
 * TTS for each line. A string, or {te,en} (speaks te; back-compat), or a localized item
 * {text, lang} (speaks text in its language, falling back to the English line in en-IN).
 */
export function speakAll(lines = [], lang = "te-IN") {
  return Promise.all(
    lines.map(async (l) => {
      if (typeof l === "string") return tts(l, lang);
      if (l?.text && l?.lang) {
        const a = await tts(l.text, l.lang);
        if (a || toCode(l.lang) === "en-IN" || !l.en) return a;
        return tts(l.en, "en-IN");
      }
      return tts(l?.te ?? l?.en, l?.te ? lang : "en-IN");
    }),
  );
}
