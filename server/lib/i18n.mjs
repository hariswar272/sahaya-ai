// UI + voice-line translation into major Indian languages. One batched LLM call per chunk,
// disk cache at DATA_DIR/i18n/<lang>.json so every string is translated once, ever. Never throws:
// on any failure the English text comes back (and is not cached, so it is retried later).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SERVER_DIR } from "./env.mjs";
import * as ai from "./ai.mjs";

export const LANGUAGES = [
  { code: "en", name: "English", native: "English" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", name: "Malayalam", native: "മലയാളം" },
  { code: "mr", name: "Marathi", native: "मराठी" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "od", name: "Odia", native: "ଓଡ଼ିଆ" },
];
const CODES = new Set(LANGUAGES.map((l) => l.code));

/** "te", "te-IN", "TE_in" → "te"; "or" (ISO Odia) → "od"; anything unknown → "en". */
export function normLang(x) {
  let c = String(x ?? "").trim().toLowerCase().split(/[-_]/)[0];
  if (c === "or") c = "od";
  return CODES.has(c) ? c : "en";
}
export const sarvamCode = (x) => `${normLang(x)}-IN`;
export const languageName = (x) => LANGUAGES.find((l) => l.code === normLang(x)).name;
const nativeName = (x) => LANGUAGES.find((l) => l.code === normLang(x)).native;

/* --------------------------------------------------------------- cache */

const dir = () => path.join(process.env.DATA_DIR || path.join(SERVER_DIR, "data"), "i18n");
const fileOf = (lang) => path.join(dir(), `${lang}.json`);
const mem = new Map();
const timers = new Map();

function readDisk(lang) {
  try {
    const f = fileOf(lang);
    if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8")) || {};
  } catch (e) {
    console.warn(`[i18n] ${lang}.json unreadable: ${e.message}`);
  }
  return {};
}

function load(lang) {
  if (!mem.has(lang)) mem.set(lang, readDisk(lang));
  return mem.get(lang);
}

function writeNow(lang) {
  clearTimeout(timers.get(lang));
  timers.delete(lang);
  try {
    mkdirSync(dir(), { recursive: true });
    // Merge with whatever another process wrote meanwhile, then replace atomically.
    const merged = { ...readDisk(lang), ...mem.get(lang) };
    mem.set(lang, merged);
    const tmp = `${fileOf(lang)}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(merged));
    renameSync(tmp, fileOf(lang));
  } catch (e) {
    console.warn(`[i18n] save ${lang} failed: ${e.message}`);
  }
}

function persist(lang) {
  if (!timers.has(lang)) timers.set(lang, setTimeout(() => writeNow(lang), 200));
}

export function flushI18n() {
  for (const lang of [...timers.keys()]) writeNow(lang);
}

/* ------------------------------------------------------------- translate */

const chains = new Map();
function withLock(lang, fn) {
  const run = (chains.get(lang) || Promise.resolve()).then(fn, fn);
  chains.set(lang, run.catch(() => {}));
  return run;
}

function chunk(list, maxItems = 60, maxChars = 3000) {
  const out = [];
  let cur = [];
  let chars = 0;
  for (const s of list) {
    if (cur.length && (cur.length >= maxItems || chars + s.length > maxChars)) {
      out.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(s);
    chars += s.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function translateChunk(lang, arr) {
  const name = languageName(lang);
  const messages = [
    {
      role: "system",
      content: [
        `Translate user-interface and voice-assistant text from English into ${name} (${nativeName(lang)}) for an Indian public-help app used by ordinary citizens.`,
        `Use natural, simple, everyday ${name} as people actually speak it, in ${name} script. Translate meaning, not word by word.`,
        "Context: these are website buttons, headings and helpline phrases. 'Console' and 'dashboard' mean an officials' dashboard screen; 'call' means a phone call.",
        "Keep unchanged: brand/product names (Aapadbandhu AI, Arogya Call, Rythu Call, Scam Shield, SOS), acronyms (ASHA, PHC, NDRF, SDRF, OTP, UPI, KYC, SMS, AI), helpline and phone numbers (108, 112, 1930, 181), other numbers and units, URLs, emoji, and placeholders like {name}, {{count}} or %s.",
        "Everyday English tech words (app, WhatsApp, link, online, mobile) may stay in English.",
        `Input is a JSON array of ${arr.length} strings. Return ONLY JSON of the form {"t": [...]} with exactly ${arr.length} translated strings in the same order.`,
      ].join("\n"),
    },
    { role: "user", content: `Translate these ${arr.length} strings into ${name}. Answer with only {"t": [...]}.\n${JSON.stringify(arr)}` },
  ];
  let last = "no items";
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text } = await ai.llm(messages, { json: true, temperature: 0, max_tokens: Math.min(6000, 300 + arr.join(" ").length * 4) });
    const t = pickArray(ai.parseJSON(text), arr) || pickLines(text, arr);
    if (t && t.length === arr.length) return t.map((x) => (typeof x === "string" && x.trim() ? x.trim() : null));
    last = t ? `${t.length} items` : `unusable output ${JSON.stringify(text).slice(0, 80)}`;
  }
  throw new Error(`translation returned ${last} for ${arr.length}`);
}

// Sarvam sometimes ignores the JSON instruction and answers one translation per line.
function pickLines(text, arr) {
  const lines = String(text ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, "").replace(/^["'“]|["'”],?$/g, "").trim())
    .filter(Boolean);
  return lines.length === arr.length ? lines : null;
}

// Models answer as {"t":[…]}, a bare array, {"translations":[…]}, or a {source: translation} map.
function pickArray(data, arr) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return null;
  for (const k of ["t", "translations", "result", "output", "items"]) {
    if (Array.isArray(data[k])) return data[k];
    if (data[k] && typeof data[k] === "object" && arr.every((s) => s in data[k])) return arr.map((s) => data[k][s]);
  }
  if (arr.every((s) => s in data)) return arr.map((s) => data[s]);
  const arrays = Object.values(data).filter((v) => Array.isArray(v) && v.length === arr.length);
  return arrays.length === 1 ? arrays[0] : null;
}

async function translateInto(lang, cache, list, depth = 0) {
  try {
    const tr = await translateChunk(lang, list);
    list.forEach((s, i) => {
      if (tr[i]) cache[s] = tr[i];
    });
    persist(lang);
  } catch (e) {
    if (list.length > 6 && depth < 2) {
      const mid = Math.ceil(list.length / 2);
      await translateInto(lang, cache, list.slice(0, mid), depth + 1);
      await translateInto(lang, cache, list.slice(mid), depth + 1);
    } else console.warn(`[i18n] ${lang}: ${e.message} (${list.length} strings fall back to English)`);
  }
}

/** { [english]: translated } for every input string. English (or any failure) maps a string to itself. */
export async function translate(lang, strings) {
  const code = normLang(lang);
  const list = [...new Set((Array.isArray(strings) ? strings : [strings]).map((s) => String(s ?? "")).filter((s) => s.trim()))].slice(0, 500);
  const out = {};
  if (code === "en" || !list.length) {
    for (const s of list) out[s] = s;
    return out;
  }
  try {
    const cache = load(code);
    if (list.some((s) => !(s in cache))) {
      await withLock(code, async () => {
        for (const part of chunk(list.filter((s) => !(s in cache)))) await translateInto(code, cache, part);
      });
    }
    for (const s of list) out[s] = cache[s] ?? s;
  } catch (e) {
    console.warn(`[i18n] ${code}: ${e.message}`);
    for (const s of list) out[s] ??= s;
  }
  return out;
}

/** Everything already translated for a language (lets the web app preload instantly). */
export const dictionary = (lang) => (normLang(lang) === "en" ? {} : { ...load(normLang(lang)) });
