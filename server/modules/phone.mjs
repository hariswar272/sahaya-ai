// Real phone calls, through one of two providers (PHONE_PROVIDER=samvaad|plivo; unset = whichever is configured):
//
// - samvaad: Sarvam Samvaad hosts the whole agent (telephony, STT, LLM, TTS). We trigger the outbound call
//   with agent variables, and Samvaad posts the finished call to /api/phone/samvaad-webhook. The caller's
//   words are then run through our own flow (arogya / sos / scam) so the dashboards update exactly as
//   they do for a browser call.
// - plivo: Plivo dials and we bridge the call turn by turn into the same voice flows the browser demo uses
//   (/api/<flow>/call/start|turn). We <Play> the agent's Telugu lines, <Record> the reply, run it through
//   the flow, and repeat. Half duplex, no streaming.
//
// Credentials come only from env. Without them every endpoint says which variables are missing (names only).
// Both providers dial only numbers listed in PHONE_WHITELIST.
import crypto from "node:crypto";

const FLOWS = ["arogya", "sos", "rythu", "scam"];
const MAX_ACTIVE = 3;
const MAX_CALL_MS = 4 * 60 * 1000;
const AUDIO_TTL_MS = 30 * 60 * 1000;
const AUDIO_CAP = 600;
const PHONE_RATE = 8000;
const LIVE = new Set(["dialing", "ringing", "answered", "turn", "processing"]);

const env = (k) => String(process.env[k] ?? "").trim();
const digits = (s) => String(s ?? "").replace(/\D/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const str = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

/** E.164 digits without "+": 10-digit Indian numbers get the 91 prefix. */
export function normalizeNumber(s) {
  let d = digits(s);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d;
}

export const maskNumber = (n) => (n.length > 4 ? `+${n.slice(0, Math.max(0, n.length - 10))} ••••••${n.slice(-4)}` : "••••");

const publicUrl = () => (env("PUBLIC_URL") || "https://sahaya.hmgenx.in").replace(/\/+$/, "");
const whitelist = () => env("PHONE_WHITELIST").split(",").map(normalizeNumber).filter(Boolean);

const PLIVO_ENV = ["PLIVO_AUTH_ID", "PLIVO_AUTH_TOKEN", "PLIVO_FROM_NUMBER"];
const SAMVAAD_ENV = ["SAMVAAD_KEY", "SAMVAAD_ORG_ID", "SAMVAAD_WORKSPACE_ID", "SAMVAAD_APP_ID", "SAMVAAD_CONNECTION_ID", "SAMVAAD_AGENT_NUMBER"];
const missingOf = (names) => names.filter((n) => !env(n));

function plivoConfig() {
  const id = env("PLIVO_AUTH_ID");
  const token = env("PLIVO_AUTH_TOKEN");
  const from = digits(env("PLIVO_FROM_NUMBER"));
  return { ok: !!(id && token && from), id, token, from, publicUrl: publicUrl() };
}

/** Per-flow agents are optional: SAMVAAD_APP_ID_AROGYA etc. override SAMVAAD_APP_ID / SAMVAAD_APP_VERSION. */
function samvaadConfig(flow) {
  const pick = (k) => (flow && env(`${k}_${flow.toUpperCase()}`)) || env(k);
  return {
    key: env("SAMVAAD_KEY"),
    orgId: env("SAMVAAD_ORG_ID"),
    workspaceId: env("SAMVAAD_WORKSPACE_ID"),
    appId: pick("SAMVAAD_APP_ID"),
    appVersion: Number(pick("SAMVAAD_APP_VERSION") || 1) || 1,
    connectionId: env("SAMVAAD_CONNECTION_ID"),
    agentNumber: env("SAMVAAD_AGENT_NUMBER"),
  };
}

/** Which provider places calls, and what it still needs (env names only, never values). */
function phoneProvider() {
  const want = env("PHONE_PROVIDER").toLowerCase();
  const sam = missingOf(SAMVAAD_ENV);
  const pli = missingOf(PLIVO_ENV);
  if (want === "samvaad") return { name: "samvaad", missing: sam };
  if (want === "plivo") return { name: "plivo", missing: pli };
  if (!sam.length) return { name: "samvaad", missing: [] };
  if (!pli.length) return { name: "plivo", missing: [] };
  return { name: null, missing: [] };
}

function notConfigured(p = phoneProvider()) {
  if (!p.name) {
    return "Phone calling is not configured on this server. Set the Samvaad variables (SAMVAAD_KEY, SAMVAAD_ORG_ID, SAMVAAD_WORKSPACE_ID, SAMVAAD_APP_ID, SAMVAAD_CONNECTION_ID, SAMVAAD_AGENT_NUMBER) or the Plivo ones (PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, PLIVO_FROM_NUMBER). The browser call works without them.";
  }
  return `Phone calling via ${p.name} is not configured on this server: ${p.missing.join(", ")} missing. The browser call works without it.`;
}

/* ------------------------------------------------------------------ WAV */

const MULAW = new Float32Array(256);
const ALAW = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  let t = ((u & 0x0f) << 3) + 0x84;
  t <<= (u & 0x70) >> 4;
  MULAW[i] = (u & 0x80 ? 0x84 - t : t - 0x84) / 32768;
  const a = i ^ 0x55;
  let s = (a & 0x0f) << 4;
  const seg = (a & 0x70) >> 4;
  if (seg === 0) s += 8;
  else if (seg === 1) s += 0x108;
  else s = (s + 0x108) << (seg - 1);
  ALAW[i] = (a & 0x80 ? s : -s) / 32768;
}

export function parseWav(buf) {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV file");
  let off = 12;
  let fmt = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    const start = off + 8;
    if (id === "fmt ") {
      let format = buf.readUInt16LE(start);
      if (format === 0xfffe && size >= 26) format = buf.readUInt16LE(start + 24); // WAVE_FORMAT_EXTENSIBLE
      fmt = { format, channels: buf.readUInt16LE(start + 2), rate: buf.readUInt32LE(start + 4), bits: buf.readUInt16LE(start + 14) };
    } else if (id === "data") {
      if (!fmt) break;
      if (start + size > buf.length) size = buf.length - start; // streamed WAVs often carry a bogus size
      return { ...fmt, data: buf.subarray(start, start + size) };
    }
    off = start + size + (size % 2);
  }
  throw new Error("WAV has no fmt/data chunk");
}

/** Decodes PCM 8/16/24/32-bit, float32, mu-law and A-law to mono floats in [-1, 1]. */
export function toMono({ format, channels, bits, data }) {
  const bytes = bits / 8;
  if (!channels || !bytes) throw new Error("bad WAV header");
  const frames = Math.floor(data.length / (bytes * channels));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const o = (i * channels + c) * bytes;
      if (format === 7) sum += MULAW[data[o]];
      else if (format === 6) sum += ALAW[data[o]];
      else if (format === 3 && bits === 32) sum += data.readFloatLE(o);
      else if (format !== 1) throw new Error(`unsupported WAV format ${format}`);
      else if (bits === 16) sum += data.readInt16LE(o) / 32768;
      else if (bits === 8) sum += (data[o] - 128) / 128;
      else if (bits === 24) sum += data.readIntLE(o, 3) / 8388608;
      else if (bits === 32) sum += data.readInt32LE(o) / 2147483648;
      else throw new Error(`unsupported ${bits}-bit WAV`);
    }
    out[i] = sum / channels;
  }
  return out;
}

/** Linear-interpolating resampler; when downsampling it averages each output's input window first so 22 kHz speech doesn't alias into hiss at 8 kHz. */
export function resample(input, from, to) {
  if (from === to || !input.length) return input;
  const ratio = from / to;
  const n = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(n);
  if (ratio > 1) {
    for (let i = 0; i < n; i++) {
      const a = i * ratio;
      const b = Math.min(input.length, a + ratio);
      let s = 0;
      let w = 0;
      for (let j = Math.floor(a); j < b; j++) {
        const k = Math.min(b, j + 1) - Math.max(a, j);
        if (k > 0) {
          s += input[j] * k;
          w += k;
        }
      }
      out[i] = w ? s / w : 0;
    }
  } else {
    const last = input.length - 1;
    for (let i = 0; i < n; i++) {
      const x = i * ratio;
      const j = Math.floor(x);
      const a = input[Math.min(j, last)];
      out[i] = a + (input[Math.min(j + 1, last)] - a) * (x - j);
    }
  }
  return out;
}

export function encodeWav(samples, rate) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buf;
}

export const convertWav = (buf, rate) => {
  const w = parseWav(buf);
  return encodeWav(resample(toMono(w), w.rate, rate), rate);
};

export function rms(samples) {
  let s = 0;
  for (const v of samples) s += v * v;
  return samples.length ? Math.sqrt(s / samples.length) : 0;
}

/* ------------------------------------------------------------------ XML */

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const xmlResponse = (inner = "") => `<?xml version="1.0" encoding="UTF-8"?>\n<Response>${inner}</Response>`;
export const playXml = (urls) => urls.map((u) => `<Play>${esc(u)}</Play>`).join("");
// timeout = seconds of silence that end the caller's turn; redirect=true makes Plivo fetch `action` next.
export const recordXml = (action) =>
  `<Record action="${esc(action)}" method="POST" fileFormat="wav" maxLength="15" timeout="2" playBeep="false" redirect="true"/>`;
export const redirectXml = (url) => `<Redirect method="POST">${esc(url)}</Redirect>`;
export const waitXml = (s = 1) => `<Wait length="${s}"/>`;

/* ------------------------------------------------------------- Samvaad */

/** An upstream failure in words someone can act on (cases the Voxera deployment actually hit). */
function samvaadError(status, body) {
  let detail = "";
  try {
    const j = JSON.parse(body);
    detail = j?.error?.data?.details ?? j?.error?.message ?? j?.detail ?? "";
  } catch {
    /* not JSON */
  }
  switch (status) {
    case 401:
    case 403:
      return "Samvaad rejected the credentials. SAMVAAD_KEY must be the sk_samvaad_ key, not the speech key.";
    case 402:
      return "Samvaad credits are over on that Sarvam account. Top up at indus.sarvam.ai → Usage → Add credits.";
    case 404:
      return "Samvaad could not find that agent. Check SAMVAAD_APP_ID and SAMVAAD_APP_VERSION against the committed version.";
    case 429:
      return "Samvaad is rate limiting this workspace. Wait a minute and try again.";
    default:
      return detail ? `Samvaad refused the call (${status}): ${String(detail).slice(0, 200)}` : `Samvaad refused the call (${status}).`;
  }
}

/** Names Samvaad rejects because the committed agent doesn't declare them (it 422s the whole call). */
function unknownVariables(body) {
  const m = String(body).match(/Agent variables '\{([^}]*)\}' not found/);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
}

async function samvaadOutbound(c, to, variables) {
  return fetch(`https://apps.sarvam.ai/api/outbounds/v1/orgs/${encodeURIComponent(c.orgId)}/workspaces/${encodeURIComponent(c.workspaceId)}/outbounds`, {
    method: "POST",
    headers: { "X-API-Key": c.key, "Content-Type": "application/json" },
    body: JSON.stringify({
      app_config: {
        app_id: c.appId,
        app_version: c.appVersion,
        connection_config: { connection_id: c.connectionId, agent_phone_number: c.agentNumber },
        agent_variables: variables,
      },
      user_config: { user_phone_number: to },
    }),
    signal: AbortSignal.timeout(20_000),
  });
}

/** Places the call; drops exactly the variables the agent doesn't declare and retries once. */
async function samvaadDial(flow, to, variables) {
  const c = samvaadConfig(flow);
  let res = await samvaadOutbound(c, to, variables);
  let body = res.ok ? "" : await res.text();
  let dropped = [];
  if (res.status === 422) {
    const unknown = unknownVariables(body);
    if (unknown.length) {
      dropped = unknown;
      const kept = Object.fromEntries(Object.entries(variables).filter(([k]) => !unknown.includes(k)));
      res = await samvaadOutbound(c, to, kept);
      body = res.ok ? "" : await res.text();
    }
  }
  if (!res.ok) throw Object.assign(new Error(samvaadError(res.status, body)), { outOfCredit: res.status === 402 });
  const j = await res.json().catch(() => ({}));
  return { attemptId: str(j.attempt_id || j.attemptId || j.id), dropped };
}

/* ------------------------------------------------------------- module */

// Fixed lines the Plivo bridge itself may need, beyond what the flows say.
const LINES = {
  hold: ["ఒక్క క్షణం అండి.", "One moment, please."],
  sorry: ["క్షమించండి, చిన్న సమస్య వచ్చింది. మళ్ళీ ఒకసారి చెప్పండి.", "Sorry, something went wrong. Please say that again."],
  byeSilent: ["మీ మాట వినపడలేదు. అవసరమైతే మేము మళ్ళీ కాల్ చేస్తాం. ధన్యవాదాలు.", "I couldn't hear you. We'll call again if needed. Thank you."],
  byeTime: ["కాల్ సమయం అయిపోయింది. అవసరమైతే మేము మళ్ళీ కాల్ చేస్తాం. ధన్యవాదాలు.", "The call time is over. We'll call again if needed. Thank you."],
};

export default {
  id: "phone",
  async register(app, ctx) {
    const log = (...a) => console.log("[phone]", ...a);
    const calls = new Map(); // secret webhook token (cid) -> call
    const audio = new Map(); // id -> { buf, at }
    const audioByHash = new Map();
    const lineIds = new Map();

    if (!app.hasContentTypeParser("application/x-www-form-urlencoded")) {
      app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit: 1024 * 1024 }, (_req, body, done) => {
        try {
          done(null, Object.fromEntries(new URLSearchParams(body)));
        } catch (e) {
          done(e);
        }
      });
    }

    setInterval(() => {
      const now = Date.now();
      for (const [id, a] of audio) if (now - a.at > AUDIO_TTL_MS) audio.delete(id);
      for (const [h, id] of audioByHash) if (!audio.has(id)) audioByHash.delete(h);
      for (const [cid, c] of calls) {
        // A Samvaad call whose webhook never arrives must not hold a concurrency slot forever.
        if (LIVE.has(c.status) && now - c.createdAt > MAX_CALL_MS + 10 * 60 * 1000) {
          c.status = "unknown";
          c.endedAt = now;
        }
        if (!LIVE.has(c.status) && now - (c.endedAt || c.createdAt) > 60 * 60 * 1000) calls.delete(cid);
      }
    }, 60_000).unref();

    /** Stores a TTS line (base64 WAV, any rate) as 8 kHz mono PCM for the phone line; returns its id. */
    function storeAudio(b64) {
      if (!b64) return null;
      const h = crypto.createHash("sha1").update(b64).digest("hex");
      const hit = audioByHash.get(h);
      if (hit && audio.has(hit)) {
        audio.get(hit).at = Date.now();
        return hit;
      }
      let buf;
      try {
        buf = convertWav(Buffer.from(b64, "base64"), PHONE_RATE);
      } catch (e) {
        log(`audio convert failed: ${e.message}`);
        return null;
      }
      if (audio.size >= AUDIO_CAP) audio.delete(audio.keys().next().value);
      const id = crypto.randomBytes(9).toString("hex");
      audio.set(id, { buf, at: Date.now() });
      audioByHash.set(h, id);
      return id;
    }

    async function lineId(key) {
      const id = lineIds.get(key);
      if (id && audio.has(id)) return id;
      const fresh = storeAudio(await ctx.voice.tts(LINES[key][0]));
      if (fresh) lineIds.set(key, fresh);
      return fresh;
    }

    const urls = (cfg, ids) => ids.filter(Boolean).map((id) => `${cfg.publicUrl}/api/phone/audio/${id}.wav`);
    const turnUrl = (cfg, c) => `${cfg.publicUrl}/api/phone/turn?cid=${c.cid}`;
    const nextUrl = (cfg, c, n, w) => `${cfg.publicUrl}/api/phone/next?cid=${c.cid}&n=${n}&w=${w}`;
    const liveCount = () => [...calls.values()].filter((c) => LIVE.has(c.status)).length;

    function emit(c, extra = {}) {
      ctx.sse.broadcast("phone:call", { id: c.id, flow: c.flow, provider: c.provider, to: c.toMasked, status: c.status, at: Date.now(), ...extra });
    }

    const publicCall = (c) => ({
      id: c.id,
      flow: c.flow,
      provider: c.provider,
      to: c.toMasked,
      status: c.status,
      createdAt: c.createdAt,
      answeredAt: c.answeredAt,
      endedAt: c.endedAt,
      transcript: c.transcript,
      result: c.result,
      error: c.error,
    });

    /** Calls this server's own endpoints, so the phone gets exactly the browser demo's agent and rules. */
    async function local(method, path, body) {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      let status;
      let json;
      try {
        const res = await fetch(`http://127.0.0.1:${Number(process.env.PORT || 4200)}${path}`, {
          method,
          headers: payload ? { "Content-Type": "application/json" } : {},
          body: payload,
          signal: AbortSignal.timeout(45_000),
        });
        status = res.status;
        json = await res.json().catch(() => ({}));
      } catch (e) {
        if (e.name === "TimeoutError") throw new Error(`${path} timed out`);
        const r = await app.inject({ method, url: path, ...(payload ? { headers: { "content-type": "application/json" }, payload } : {}) });
        status = r.statusCode;
        json = r.json();
      }
      if (status >= 400) throw new Error(json?.error || `${path} failed (${status})`);
      return json;
    }
    const flowCall = (flow, kind, body) => local("POST", `/api/${flow}/call/${kind}`, body ?? {});

    /** What the Samvaad agent is told about this call (it drops any names the agent doesn't declare). */
    async function samvaadVariables(flow, startBody) {
      if (flow !== "arogya" || !startBody?.patientId) return { flow };
      try {
        const j = await local("GET", "/api/arogya/patients");
        const list = Array.isArray(j) ? j : j.patients || [];
        const p = list.find((x) => String(x.id) === String(startBody.patientId));
        if (!p) return { flow };
        return { flow, patient_name: str(p.name), program: str(p.program), detail: str(p.detail), village: str(p.village), asha_name: str(p.ashaWorker || p.asha) };
      } catch {
        return { flow };
      }
    }

    /* ---------------------------------------------------- Plivo bridge parts */

    async function download(url, cfg) {
      let u;
      try {
        u = new URL(url);
      } catch {
        throw new Error("bad RecordUrl");
      }
      // Only Plivo's own media host gets the credentials, and only Plivo media is fetched at all.
      if (u.protocol !== "https:" || !(u.hostname === "plivo.com" || u.hostname.endsWith(".plivo.com"))) throw new Error(`unexpected recording host ${u.hostname}`);
      const headers = { Authorization: `Basic ${Buffer.from(`${cfg.id}:${cfg.token}`).toString("base64")}` };
      const until = Date.now() + 8000;
      let last = "";
      for (;;) {
        try {
          const res = await fetch(u, { headers, signal: AbortSignal.timeout(6000) });
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > 44) return buf;
            last = "empty file";
          } else last = `HTTP ${res.status}`;
        } catch (e) {
          last = e.message;
        }
        // The file usually lands a moment after Plivo calls the action URL.
        if (Date.now() > until) throw new Error(`recording not available (${last})`);
        await sleep(500);
      }
    }

    async function processTurn(c, cfg, recordUrl, durMs) {
      try {
        if (!recordUrl) return { silent: true };
        const w = parseWav(await download(recordUrl, cfg));
        const mono = toMono(w);
        if ((durMs > 0 && durMs < 400) || mono.length < w.rate * 0.3 || rms(mono) < 0.003) return { silent: true };
        const wav16 = encodeWav(resample(mono, w.rate, 16000), 16000).toString("base64");
        const r = await flowCall(c.flow, "turn", { sessionId: c.sessionId, audio: wav16 });
        const ids = (r.audios || []).map(storeAudio).filter(Boolean);
        if (r.said) c.transcript.push({ who: "caller", text: r.said });
        for (const l of r.reply || []) c.transcript.push({ who: "agent", te: l.te, en: l.en });
        if (r.done) c.result = r.result ?? r.incident ?? null;
        c.status = "turn";
        emit(c, { said: r.said || "", reply: r.reply || [], done: !!r.done, result: r.done ? c.result : undefined });
        return { ids, done: !!r.done };
      } catch (e) {
        log(`turn failed (${c.flow}): ${e.message}`);
        emit(c, { error: e.message });
        return { error: e.message };
      }
    }

    async function goodbye(c, cfg, key, reason) {
      c.done = true;
      emit(c, { ending: reason });
      return xmlResponse(playXml(urls(cfg, [await lineId(key)])) + "<Hangup/>");
    }

    async function respondTurn(c, cfg, r) {
      if (r.error) {
        c.errors = (c.errors || 0) + 1;
        if (c.errors > 2) return goodbye(c, cfg, "byeTime", "errors");
        return xmlResponse(playXml(urls(cfg, [await lineId("sorry"), ...c.lastIds])) + recordXml(turnUrl(cfg, c)));
      }
      if (r.silent) {
        c.silent = (c.silent || 0) + 1;
        if (c.silent >= 2) return goodbye(c, cfg, "byeSilent", "no speech");
        return xmlResponse(playXml(urls(cfg, c.lastIds)) + recordXml(turnUrl(cfg, c)));
      }
      c.silent = 0;
      if (r.ids.length) c.lastIds = r.ids;
      if (r.done) {
        c.done = true;
        return xmlResponse(playXml(urls(cfg, r.ids)) + "<Hangup/>");
      }
      return xmlResponse(playXml(urls(cfg, r.ids)) + recordXml(turnUrl(cfg, c)));
    }

    async function plivoDial(c, num, startBody) {
      const cfg = plivoConfig();
      // Start the AI session before dialling, so the greeting plays the instant they pick up.
      const start = await flowCall(c.flow, "start", startBody || {});
      c.sessionId = start.sessionId;
      c.lastIds = (start.audios || []).map(storeAudio).filter(Boolean);
      for (const l of start.reply || []) c.transcript.push({ who: "agent", te: l.te, en: l.en });
      if (!c.sessionId || !c.lastIds.length) throw new Error("the voice agent could not start (no session or no audio)");
      const res = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(cfg.id)}/Call/`, {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${cfg.id}:${cfg.token}`).toString("base64")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: cfg.from,
          to: num,
          answer_url: `${cfg.publicUrl}/api/phone/answer?cid=${c.cid}`,
          answer_method: "POST",
          hangup_url: `${cfg.publicUrl}/api/phone/hangup?cid=${c.cid}`,
          hangup_method: "POST",
          ring_timeout: 45,
          time_limit: MAX_CALL_MS / 1000,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Plivo refused the call: ${j.error || j.message || `HTTP ${res.status}`}`);
      c.requestUuid = j.request_uuid;
    }

    /* ------------------------------------------- Samvaad post-call mapping */

    /**
     * Runs what the caller said on a Samvaad call through our own flow, so the result (patient risk,
     * SOS incident, scam verdict) is decided by the same extraction + rules as a browser call and the
     * dashboards update through their usual events.
     */
    async function mapSamvaad(c, transcript, extracted) {
      const said = transcript.filter((t) => t.who === "caller").map((t) => t.text).join(" ").trim();
      const facts = Object.entries(extracted || {})
        .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ");
      const text = [said, facts].filter(Boolean).join(" | ").slice(0, 1800);
      if (!text) return null;
      if (c.flow === "scam") {
        const j = await local("POST", "/api/scam/check", { text, source: "call" });
        return j.result ?? j;
      }
      if (c.flow === "rythu") return { said };
      const start = await flowCall(c.flow, "start", c.startBody || {});
      let r = await flowCall(c.flow, "turn", { sessionId: start.sessionId, text });
      // Anything the call never covered is answered "don't know"; the flow skips a slot after two asks.
      for (let i = 0; !r.done && i < 14; i++) r = await flowCall(c.flow, "turn", { sessionId: start.sessionId, text: "తెలియదు" });
      return r.done ? (r.result ?? r.incident ?? null) : null;
    }

    const xml = (reply, body) => reply.type("application/xml").send(body);
    const callOf = (req) => calls.get(String(req.query?.cid || ""));

    function secretOk(req) {
      const want = env("PHONE_WEBHOOK_SECRET");
      const got = str(req.query?.k || req.headers["x-webhook-secret"] || req.headers["x-swaram-secret"]);
      if (!want || !got || want.length !== got.length) return false;
      return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got));
    }

    /* ---------------------------------------------------------- public API */

    app.get("/status", async () => {
      const p = phoneProvider();
      return {
        provider: p.name,
        configured: !!p.name && !p.missing.length,
        missing: p.missing,
        whitelisted: whitelist().length,
        active: liveCount(),
        maxActive: MAX_ACTIVE,
        maxMinutes: MAX_CALL_MS / 60000,
        flows: FLOWS,
        webhook: p.name === "samvaad" ? { url: `${publicUrl()}/api/phone/samvaad-webhook?k=<PHONE_WEBHOOK_SECRET>`, secretSet: !!env("PHONE_WEBHOOK_SECRET") } : null,
      };
    });

    app.get("/calls", async () => ({
      calls: [...calls.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 15).map(publicCall),
    }));

    app.post("/call", async (req, reply) => {
      if (ctx.rateLimit(req)) return reply.code(429).send({ error: "Too many requests. Please wait a minute." });
      const p = phoneProvider();
      if (!p.name || p.missing.length) return reply.code(503).send({ error: notConfigured(p) });
      const { flow, to, startBody } = req.body || {};
      if (!FLOWS.includes(flow)) return reply.code(400).send({ error: `flow must be one of ${FLOWS.join(", ")}` });
      if (flow === "arogya" && !startBody?.patientId) return reply.code(400).send({ error: "Pick a patient for the Arogya call." });
      const num = normalizeNumber(to);
      if (!/^\d{11,15}$/.test(num)) return reply.code(400).send({ error: "Enter a valid mobile number, e.g. 98XXXXXXXX." });
      if (!whitelist().includes(num)) {
        return reply.code(403).send({ error: "This number is not on the allowed list (PHONE_WHITELIST). Real calls only go to verified demo numbers." });
      }
      if (liveCount() >= MAX_ACTIVE) return reply.code(429).send({ error: `Only ${MAX_ACTIVE} calls can run at once. Try again in a minute.` });

      const c = {
        cid: crypto.randomBytes(16).toString("hex"),
        id: crypto.randomBytes(5).toString("hex"),
        provider: p.name,
        flow,
        startBody: startBody || {},
        to: num,
        toMasked: maskNumber(num),
        status: "dialing",
        createdAt: Date.now(),
        transcript: [],
        lastIds: [],
        turn: 0,
      };
      calls.set(c.cid, c);
      emit(c);
      try {
        let dropped = [];
        if (p.name === "samvaad") {
          const d = await samvaadDial(flow, `+${num}`, await samvaadVariables(flow, startBody));
          c.attemptId = d.attemptId;
          dropped = d.dropped;
        } else {
          await plivoDial(c, num, startBody);
        }
        c.status = "ringing";
        log(`dialling ${c.toMasked} for ${flow} via ${p.name} (${c.id})${dropped.length ? `; agent ignores ${dropped.join(", ")}` : ""}`);
        emit(c, dropped.length ? { droppedVariables: dropped } : {});
        return { id: c.id, status: c.status, to: c.toMasked, flow, provider: p.name, droppedVariables: dropped };
      } catch (e) {
        c.status = "failed";
        c.error = e.message;
        c.endedAt = Date.now();
        log(`call ${c.id} failed: ${e.message}`);
        emit(c, { error: e.message });
        return reply.code(e.outOfCredit ? 402 : 502).send({ error: e.message });
      }
    });

    app.post("/end", async (req, reply) => {
      const c = [...calls.values()].find((x) => x.id === String(req.body?.id || ""));
      if (!c) return reply.code(404).send({ error: "Call not found" });
      if (!LIVE.has(c.status)) return { ok: true, status: c.status };
      if (c.provider === "plivo") {
        const cfg = plivoConfig();
        const target = c.callUuid ? `Call/${encodeURIComponent(c.callUuid)}/` : c.requestUuid ? `Request/${encodeURIComponent(c.requestUuid)}/` : null;
        if (cfg.ok && target) {
          await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(cfg.id)}/${target}`, {
            method: "DELETE",
            headers: { Authorization: `Basic ${Buffer.from(`${cfg.id}:${cfg.token}`).toString("base64")}` },
            signal: AbortSignal.timeout(10_000),
          }).catch((e) => log(`hangup request failed: ${e.message}`));
        }
        c.done = true;
        return { ok: true };
      }
      return reply.code(409).send({ error: "Samvaad calls end on the phone; they can't be hung up from here." });
    });

    app.get("/audio/:file", async (req, reply) => {
      const a = audio.get(String(req.params.file).replace(/\.wav$/i, ""));
      if (!a) return reply.code(404).send({ error: "Not found" });
      a.at = Date.now();
      return reply.header("Cache-Control", "private, max-age=900").type("audio/wav").send(a.buf);
    });

    /* ------------------------------------------------- Samvaad post-call */

    app.get("/samvaad-webhook", async () => ({
      ok: true,
      method: "POST",
      url: `${publicUrl()}/api/phone/samvaad-webhook?k=<PHONE_WEBHOOK_SECRET>`,
      expects: {
        attempt_id: "the id returned when the call was placed",
        status: "answered | no-answer | busy | failed",
        duration_seconds: 0,
        extracted: { "any field": "the agent captured" },
        transcript: [{ role: "agent | user", text: "…" }],
      },
      configured: !!env("PHONE_WEBHOOK_SECRET"),
    }));

    app.post("/samvaad-webhook", async (req, reply) => {
      if (!env("PHONE_WEBHOOK_SECRET")) return reply.code(503).send({ ok: false, error: "PHONE_WEBHOOK_SECRET is not set on this server." });
      if (!secretOk(req)) return reply.code(401).send({ ok: false, error: "Bad secret." });
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const attempt = str(b.attempt_id || b.attemptId);
      if (!attempt) return reply.code(400).send({ ok: false, error: "No attempt id." });
      const c = [...calls.values()].find((x) => x.attemptId === attempt);
      if (!c) return reply.code(404).send({ ok: false, error: "No call matches that attempt." });

      const seconds = Math.max(0, Math.round(Number(b.duration_seconds ?? b.durationSec ?? b.duration ?? 0)) || 0);
      const st = str(b.status).toLowerCase();
      const transcript = (Array.isArray(b.transcript) ? b.transcript : [])
        .map((t) => ({ who: /agent|assistant|bot/i.test(str(t?.role || t?.who)) ? "agent" : "caller", text: str(t?.text || t?.content) }))
        .filter((t) => t.text);
      c.transcript = transcript.map((t) => (t.who === "agent" ? { who: "agent", te: t.text, en: "" } : t));
      c.answeredAt = seconds > 0 || /answer|complete|connect/.test(st) ? c.answeredAt || c.createdAt : undefined;
      c.status = c.answeredAt ? "processing" : st.includes("busy") ? "busy" : "no-answer";
      emit(c, { duration: seconds, transcript: c.transcript });

      if (c.answeredAt && transcript.length) {
        const extracted = { ...(b.variables || {}), ...(b.extracted || {}) };
        // Answer Samvaad now; the mapping runs the AI and can take a few seconds.
        mapSamvaad(c, transcript, extracted)
          .then((result) => {
            c.result = result;
            c.status = "completed";
          })
          .catch((e) => {
            c.error = e.message;
            c.status = "completed";
            log(`mapping failed for ${c.id}: ${e.message}`);
          })
          .finally(() => {
            c.endedAt = Date.now();
            emit(c, { result: c.result, error: c.error, transcript: c.transcript });
          });
      } else {
        if (c.status === "processing") c.status = "completed";
        c.endedAt = Date.now();
        emit(c, { duration: seconds });
      }
      return { ok: true, id: c.id, status: c.status };
    });

    /* ------------------------------------------------- Plivo webhooks (XML) */

    app.post("/answer", async (req, reply) => {
      const cfg = plivoConfig();
      const c = callOf(req);
      if (!c || !cfg.ok || c.done) return xml(reply, xmlResponse("<Hangup/>"));
      c.callUuid = req.body?.CallUUID || c.callUuid;
      c.status = "answered";
      c.answeredAt = Date.now();
      log(`answered ${c.id}`);
      emit(c);
      return xml(reply, xmlResponse(playXml(urls(cfg, c.lastIds)) + recordXml(turnUrl(cfg, c))));
    });

    app.post("/turn", async (req, reply) => {
      const cfg = plivoConfig();
      const c = callOf(req);
      if (!c || !cfg.ok || c.done) return xml(reply, xmlResponse("<Hangup/>"));
      if (Date.now() - (c.answeredAt || c.createdAt) > MAX_CALL_MS) return xml(reply, await goodbye(c, cfg, "byeTime", "time limit"));
      const b = req.body || {};
      const durMs = Number(b.RecordingDurationMs) || Number(b.RecordingDuration) * 1000 || 0;
      c.turn += 1;
      c.pendingTurn = c.turn;
      c.pending = processTurn(c, cfg, String(b.RecordUrl || ""), durMs);
      // Answer at once and wait on /next, so a slow STT + AI turn never trips Plivo's webhook timeout.
      return xml(reply, xmlResponse(redirectXml(nextUrl(cfg, c, c.turn, 0))));
    });

    app.post("/next", async (req, reply) => {
      const cfg = plivoConfig();
      const c = callOf(req);
      if (!c || !cfg.ok) return xml(reply, xmlResponse("<Hangup/>"));
      try {
        const n = Number(req.query.n);
        const w = Number(req.query.w) || 0;
        if (n !== c.pendingTurn || !c.pending) return xml(reply, xmlResponse(recordXml(turnUrl(cfg, c))));
        const TIMEOUT = Symbol("timeout");
        const r = await Promise.race([c.pending, sleep(w === 0 ? 3500 : 4000).then(() => TIMEOUT)]);
        if (r === TIMEOUT) {
          if (w >= 6) {
            c.pending = null;
            return xml(reply, await respondTurn(c, cfg, { error: "turn took too long" }));
          }
          const hold = w === 0 ? urls(cfg, [await lineId("hold")]) : [];
          return xml(reply, xmlResponse((hold.length ? playXml(hold) : waitXml(1)) + redirectXml(nextUrl(cfg, c, n, w + 1))));
        }
        c.pending = null;
        return xml(reply, await respondTurn(c, cfg, r));
      } catch (e) {
        log(`next failed: ${e.message}`);
        return xml(reply, xmlResponse(playXml(urls(cfg, c.lastIds)) + recordXml(turnUrl(cfg, c))));
      }
    });

    app.post("/hangup", async (req, reply) => {
      const c = callOf(req);
      if (c) {
        const b = req.body || {};
        const s = String(b.CallStatus || "").toLowerCase();
        c.status = c.answeredAt ? "completed" : s === "busy" ? "busy" : s && s !== "completed" ? "no-answer" : "completed";
        c.endedAt = Date.now();
        c.done = true;
        log(`ended ${c.id}: ${c.status} ${b.Duration || 0}s ${b.HangupCauseName || b.HangupCause || ""}`.trim());
        emit(c, { duration: Number(b.Duration || 0), cause: String(b.HangupCauseName || b.HangupCause || ""), result: c.result });
      }
      return reply.type("text/plain").send("OK");
    });

    const p = phoneProvider();
    log(p.name && !p.missing.length ? `ready via ${p.name} (${whitelist().length} whitelisted numbers)` : "not configured: real calls are refused, browser calls unaffected");
  },
};
