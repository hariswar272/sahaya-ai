// AI layer. Gemini (Google) when GEMINI_API_KEY is set and working; Sarvam sarvam-105b otherwise.
import { sarvamFetch } from "./sarvam.mjs";

const SARVAM_URL = "https://api.sarvam.ai/v1/chat/completions";
const GEMINI_URL = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;

const env = (k) => String(process.env[k] ?? "").trim();

let last = null; // engine that served the most recent call
let geminiModel = null; // first candidate that answered
let geminiBroken = false; // bad key: stop trying for this process
let backoffUntil = 0; // quota hit: skip Gemini briefly

export const hasGemini = () => !!env("GEMINI_API_KEY") && !geminiBroken;
export const lastEngine = () => last || (hasGemini() ? "gemini" : "sarvam");
export const geminiModelName = () => geminiModel;

const candidates = () => [...new Set([env("GEMINI_MODEL"), "gemini-3.8-flash", "gemini-3.5-flash-lite"].filter(Boolean))];

/* --------------------------------------------------------------- parsing */

const stripThink = (t) => String(t ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "").trim();

/** Tolerant JSON parse: strips <think>, code fences and prose around the first {...} or [...]. */
export function parseJSON(text) {
  if (text == null) return null;
  const t = stripThink(text).replace(/```(?:json)?/gi, "").trim();
  const starts = [t.indexOf("{"), t.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) return null;
  const s = Math.min(...starts);
  const e = t.lastIndexOf(t[s] === "{" ? "}" : "]");
  if (e <= s) return null;
  const body = t.slice(s, e + 1);
  for (const candidate of [body, body.replace(/,\s*([}\]])/g, "$1")]) {
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  return null;
}

/* ---------------------------------------------------------------- Gemini */

function toGemini(messages) {
  const sys = messages.filter((m) => m.role === "system").map((m) => String(m.content ?? "")).join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content ?? "") }] }));
  if (!contents.length) contents.push({ role: "user", parts: [{ text: "Begin." }] });
  return { ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}), contents };
}

const geminiText = (j) =>
  (j?.candidates?.[0]?.content?.parts || [])
    .filter((p) => !p.thought)
    .map((p) => p.text || "")
    .join("")
    .trim();

async function geminiCall(body) {
  const key = env("GEMINI_API_KEY");
  const list = geminiModel ? [geminiModel] : candidates();
  let lastErr = null;
  for (const m of list) {
    const res = await fetch(GEMINI_URL(m), {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    if (res.ok) {
      geminiModel = m;
      return res.json();
    }
    const txt = (await res.text()).slice(0, 300);
    lastErr = new Error(`Gemini ${m} ${res.status}: ${txt}`);
    if (res.status === 404 || (res.status === 400 && /not found|not supported|unknown model|unsupported model/i.test(txt))) {
      if (geminiModel === m) geminiModel = null;
      continue; // try the next model name
    }
    if (res.status === 401 || res.status === 403 || (res.status === 400 && /api[_ ]?key/i.test(txt))) geminiBroken = true;
    if (res.status === 429) backoffUntil = Date.now() + 30_000;
    throw lastErr;
  }
  throw lastErr || new Error("Gemini: no model available");
}

async function geminiChat(messages, { temperature, max_tokens, json }) {
  const j = await geminiCall({
    ...toGemini(messages),
    generationConfig: {
      temperature,
      maxOutputTokens: Math.max(2048, max_tokens * 4),
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  });
  const text = geminiText(j);
  if (!text) throw new Error(`Gemini empty response (${j?.candidates?.[0]?.finishReason || j?.promptFeedback?.blockReason || "unknown"})`);
  return text;
}

/* ---------------------------------------------------------------- Sarvam */

// Sarvam's chat template wants: one system message, then strictly alternating user/assistant starting with user.
function toSarvam(messages, json) {
  let sys = messages.filter((m) => m.role === "system").map((m) => String(m.content ?? "")).join("\n\n");
  if (json) sys = `${sys}\n\nRespond with ONLY one valid JSON object. No prose, no code fences.`.trim();
  const out = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const role = m.role === "assistant" ? "assistant" : "user";
    const content = String(m.content ?? "");
    if (!out.length && role === "assistant") out.push({ role: "user", content: "(call connected)" });
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += `\n${content}`;
    else out.push({ role, content });
  }
  if (!out.length) out.push({ role: "user", content: "Begin." });
  return sys ? [{ role: "system", content: sys }, ...out] : out;
}

async function sarvamChat(messages, { temperature, max_tokens, json }) {
  const key = env("SARVAM_API_KEY");
  if (!key) throw new Error("Sarvam LLM: SARVAM_API_KEY is not set");
  // reasoning_effort:null is required: without it sarvam-105b spends the budget thinking and returns no content.
  const body = JSON.stringify({ model: env("SARVAM_LLM_MODEL") || "sarvam-105b", messages: toSarvam(messages, json), temperature, max_tokens, reasoning_effort: null });
  const res = await sarvamFetch(
    SARVAM_URL,
    () => ({ method: "POST", headers: { "api-subscription-key": key, "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(30000) }),
    "llm",
  );
  if (!res.ok) throw new Error(`Sarvam LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return stripThink(j?.choices?.[0]?.message?.content || "");
}

/* ------------------------------------------------------------------ API */

const defaults = { temperature: 0, max_tokens: 400, json: false };

export async function llm(messages, opts = {}) {
  const o = { ...defaults, ...opts };
  if (hasGemini() && Date.now() >= backoffUntil) {
    try {
      const text = await geminiChat(messages, o);
      last = "gemini";
      return { text, engine: "gemini" };
    } catch (e) {
      console.warn(`[ai] Gemini failed, falling back to Sarvam: ${e.message}`);
    }
  }
  const text = await sarvamChat(messages, o);
  last = "sarvam";
  return { text, engine: "sarvam" };
}

export async function llmJSON(messages, opts = {}) {
  const r = await llm(messages, { ...opts, json: true });
  const data = parseJSON(r.text);
  if (data === null && r.engine === "gemini") {
    try {
      const t = await sarvamChat(messages, { ...defaults, ...opts, json: true });
      const d = parseJSON(t);
      if (d !== null) {
        last = "sarvam";
        return { data: d, engine: "sarvam" };
      }
    } catch {}
  }
  return { data, engine: r.engine };
}

/** Image understanding (Gemini only). Any failure surfaces as Error("vision-unavailable") with .detail. */
export async function vision(prompt, base64, mime = "image/jpeg", opts = {}) {
  const fail = (detail) => Object.assign(new Error("vision-unavailable"), { detail });
  if (!hasGemini()) throw fail("GEMINI_API_KEY not configured");
  try {
    const j = await geminiCall({
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: mime || "image/jpeg", data: base64 } }, { text: String(prompt ?? "") }] }],
      generationConfig: { temperature: opts.temperature ?? 0, maxOutputTokens: 4096, ...(opts.json ? { responseMimeType: "application/json" } : {}) },
    });
    const text = geminiText(j);
    if (!text) throw new Error("empty response");
    last = "gemini";
    return { text, engine: "gemini" };
  } catch (e) {
    console.warn(`[ai] vision failed: ${e.message}`);
    throw fail(e.message);
  }
}
