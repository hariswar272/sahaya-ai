// Aapadbandhu AI — Telugu voice disaster helpline + AI triage control room.
// Zero dependencies (Node 22+). Run: node server.mjs
import http from "node:http";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT || 4200);
const HOST = process.env.HOST || "127.0.0.1";
const SARVAM_KEY = (process.env.SARVAM_API_KEY || "").trim();
const SPEAKER = (process.env.VOICE_SPEAKER || "kavitha").trim();
const PACE = Number(process.env.VOICE_PACE || 1.1);
const STT_MODEL = (process.env.STT_MODEL || "saarika:v2.5").trim();
const GEMINI_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-3.5-flash-lite").trim();
const DATA_FILE = path.join(ROOT, "data", "incidents.json");

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/* ------------------------------------------------------------ geography */

// Approximate locality centroids for the Vijayawada demo (flood-hit in 2024).
const CITY = [16.5193, 80.6305];
const AREAS = {
  "Singh Nagar": [16.5323, 80.6461],
  "Ajit Singh Nagar": [16.5368, 80.6402],
  "Payakapuram": [16.5466, 80.6482],
  "Prakash Nagar": [16.5405, 80.6545],
  "Vambay Colony": [16.5508, 80.6331],
  "Rajarajeswari Peta": [16.5262, 80.6368],
  "Kandrika": [16.5512, 80.6626],
  "Jakkampudi": [16.5648, 80.6188],
  "Nunna": [16.5862, 80.6669],
  "Gunadala": [16.5258, 80.6668],
  "Ramavarappadu": [16.5215, 80.6893],
  "Krishna Lanka": [16.5009, 80.6301],
  "Ranigarithota": [16.5046, 80.6378],
  "Bhavanipuram": [16.5318, 80.5958],
  "Gollapudi": [16.5397, 80.5812],
  "Patamata": [16.4968, 80.6649],
  "Benz Circle": [16.4996, 80.6556],
  "Governorpet": [16.5117, 80.6297],
  "One Town": [16.5194, 80.6118],
  "Labbipet": [16.5040, 80.6480],
};

const TEAM_SEED = [
  { id: "B1", type: "boat", name: "SDRF Boat 1", at: [16.5290, 80.6420] },
  { id: "B2", type: "boat", name: "SDRF Boat 2", at: [16.5440, 80.6470] },
  { id: "B3", type: "boat", name: "NDRF Boat 3", at: [16.5500, 80.6300] },
  { id: "B4", type: "boat", name: "NDRF Boat 4", at: [16.5060, 80.6330] },
  { id: "M1", type: "medical", name: "Medical Team 1", at: [16.5200, 80.6500] },
  { id: "M2", type: "medical", name: "Medical Team 2", at: [16.5400, 80.6600] },
  { id: "F1", type: "food", name: "Relief Van 1", at: [16.5150, 80.6300] },
  { id: "F2", type: "food", name: "Relief Van 2", at: [16.5250, 80.6650] },
];

function km([a1, o1], [a2, o2]) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(a2 - a1) / 2) ** 2 + Math.cos(r(a1)) * Math.cos(r(a2)) * Math.sin(r(o2 - o1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/* --------------------------------------------------------------- triage */

const WATER_RANK = { none: 0, ankle: 1, knee: 2, waist: 3, chest: 4, first_floor: 5, roof: 6 };
const NEEDS = ["rescue", "food", "water", "medicine", "baby_food", "shelter", "power"];
const LIFE = /dialysis|oxygen|injur|bleed|unconscious|labou?r|deliver|heart|breath|snake|electr|insulin|seizure|fits|stroke/i;

const vulnOf = (i) => (i.elderly || 0) + (i.children || 0) + (i.pregnant || 0) + (i.disabled || 0) + (i.sick || 0);

// The model only extracts facts; these rules decide priority, so every
// decision is explainable and auditable by the control room.
function triage(i) {
  const reasons = [];
  const vuln = vulnOf(i);
  const w = WATER_RANK[i.water] ?? 0;
  let p = "low";
  if ((i.medical || []).some((m) => LIFE.test(m))) { p = "critical"; reasons.push("Life-critical medical need"); }
  if (w >= 4 && vuln > 0) { p = "critical"; reasons.push("Deep water + vulnerable people"); }
  if ((i.pregnant || 0) > 0 && w >= 3) { p = "critical"; reasons.push("Pregnant woman in rising water"); }
  if (p !== "critical") {
    if (w >= 4) { p = "high"; reasons.push("Water at chest / first floor or above"); }
    else if (vuln > 0) { p = "high"; reasons.push(`${vuln} vulnerable ${vuln === 1 ? "person" : "people"}`); }
    else if ((i.needs || []).includes("rescue")) { p = "high"; reasons.push("Asked for rescue"); }
    else if ((i.needs || []).some((n) => ["food", "water", "medicine", "baby_food", "shelter"].includes(n))) { p = "medium"; reasons.push("Needs relief supplies"); }
    else reasons.push("No immediate danger reported");
  }
  const score = { critical: 400, high: 300, medium: 200, low: 100 }[p] + Math.min(50, (i.people || 1) * 3) + vuln * 5 + w * 4;
  return { priority: p, score, reasons };
}

function summarize(i) {
  const parts = [`${i.people || "?"} ${i.people === 1 ? "person" : "people"} at ${i.area}${i.landmark ? ` (${i.landmark})` : ""}`];
  if (i.water && i.water !== "none" && i.water !== "unknown") parts.push(`water: ${i.water.replace("_", " ")}`);
  const v = [];
  if (i.elderly) v.push(`${i.elderly} elderly`);
  if (i.children) v.push(`${i.children} children`);
  if (i.pregnant) v.push(`${i.pregnant} pregnant`);
  if (i.disabled) v.push(`${i.disabled} disabled`);
  if (i.sick) v.push(`${i.sick} sick`);
  if (v.length) parts.push(v.join(", "));
  if (i.medical?.length) parts.push(`medical: ${i.medical.join(", ")}`);
  if (i.needs?.length) parts.push(`needs: ${i.needs.join(", ").replace("_", " ")}`);
  return parts.join(" · ");
}

/* ---------------------------------------------------------------- state */

let state = { seq: 1001, incidents: [], teams: [] };
let saveTimer = null;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await mkdir(path.dirname(DATA_FILE), { recursive: true });
      await writeFile(DATA_FILE + ".tmp", JSON.stringify(state));
      await rename(DATA_FILE + ".tmp", DATA_FILE);
    } catch (e) { console.error("save failed", e.message); }
  }, 300);
}

function buildIncident(f, { channel, transcript, createdAt }) {
  const area = f.area && AREAS[f.area] ? f.area : null;
  const base = area ? AREAS[area] : CITY;
  const jitter = () => (Math.random() - 0.5) * 0.006;
  const at = createdAt || Date.now();
  const inc = {
    id: `SOS-${state.seq++}`, createdAt: at, updatedAt: at, channel, status: "new",
    name: f.name || "", area: area || (f.area === "Other" ? "Other area" : "Location unclear"), landmark: f.landmark || "",
    lat: +(base[0] + jitter()).toFixed(5), lng: +(base[1] + jitter()).toFixed(5),
    people: f.people || 1, water: f.water || "unknown",
    elderly: f.elderly || 0, children: f.children || 0, pregnant: f.pregnant || 0, disabled: f.disabled || 0, sick: f.sick || 0,
    medical: f.medical || [], needs: f.needs || [], transcript: transcript || [], team: null,
  };
  Object.assign(inc, triage(inc));
  inc.summary = summarize(inc);
  return inc;
}

function pickTeamType(i) {
  if ((i.needs || []).includes("rescue") || (WATER_RANK[i.water] ?? 0) >= 4) return "boat";
  if ((i.medical || []).length || (i.needs || []).includes("medicine")) return "medical";
  return "food";
}

function assign(i) {
  const free = state.teams.filter((t) => !t.busyWith);
  let pool = free.filter((t) => t.type === pickTeamType(i));
  if (!pool.length) pool = free;
  if (!pool.length) return null;
  const best = pool.map((t) => ({ t, d: km(t.at, [i.lat, i.lng]) })).sort((a, b) => a.d - b.d)[0];
  const speed = { boat: 10, medical: 18, food: 20 }[best.t.type];
  best.t.busyWith = i.id;
  i.team = { id: best.t.id, name: best.t.name, type: best.t.type, km: +best.d.toFixed(1), eta: Math.max(4, Math.round((best.d / speed) * 60) + 3), at: Date.now() };
  i.status = "assigned";
  i.updatedAt = Date.now();
  return i.team;
}

function resolveIncident(i) {
  const t = state.teams.find((x) => x.busyWith === i.id);
  if (t) { t.busyWith = null; t.at = [i.lat, i.lng]; }
  i.status = "resolved";
  i.updatedAt = Date.now();
}

function createIncident(f, opts) {
  const inc = buildIncident(f, opts);
  state.incidents.unshift(inc);
  // Life-threatening cases are dispatched instantly; the rest wait for an operator.
  if (inc.priority === "critical") assign(inc);
  save();
  broadcast("incident", inc);
  broadcast("teams", state.teams);
  return inc;
}

function seed() {
  const now = Date.now();
  const min = 60 * 1000;
  state = { seq: 1001, incidents: [], teams: TEAM_SEED.map((t) => ({ ...t, at: [...t.at], busyWith: null })) };
  const S = [
    { ago: 118, channel: "voice", name: "Durga", area: "Gunadala", landmark: "Near railway gate", people: 4, water: "waist", needs: ["rescue"], said: "గుణదల రైల్వే గేట్ దగ్గర, నలుగురం ఉన్నాం. నడుము వరకు నీళ్ళు.", resolved: true },
    { ago: 84, channel: "voice", name: "Lakshmi", area: "Singh Nagar", landmark: "Near Ramalayam temple", people: 5, water: "first_floor", elderly: 1, medical: ["insulin"], needs: ["rescue", "medicine"], said: "మేము సింగ్ నగర్ రామాలయం దగ్గర ఉన్నాం. ఇంట్లో ఐదుగురు ఉన్నాం, అమ్మమ్మకి షుగర్, ఇన్సులిన్ అయిపోయింది. ఫస్ట్ ఫ్లోర్ వరకు నీళ్ళు వచ్చాయి." },
    { ago: 71, channel: "whatsapp", name: "Ravi", area: "Ajit Singh Nagar", landmark: "Budameru canal road", people: 3, water: "waist", pregnant: 1, needs: ["rescue"], said: "Ajit Singh Nagar canal road lo unnam, naa wife 8 months pregnant, water waist varaku vachindi, boat pampandi" },
    { ago: 63, channel: "voice", name: "Srinivas", area: "Payakapuram", landmark: "Water tank street", people: 8, water: "chest", children: 3, needs: ["rescue", "food"], said: "పాయకాపురం వాటర్ ట్యాంక్ వీధి. ఎనిమిది మంది ఉన్నాం, ముగ్గురు చిన్నపిల్లలు. ఛాతీ వరకు నీళ్ళు." },
    { ago: 55, channel: "sms", name: "", area: "Krishna Lanka", landmark: "Govt school terrace", people: 10, water: "knee", children: 4, needs: ["shelter", "food"], said: "10 people on govt school terrace Krishna Lanka. 4 kids. Need food and shelter.", assign: true },
    { ago: 47, channel: "voice", name: "Venkateswara Rao", area: "Rajarajeswari Peta", landmark: "Church street", people: 2, water: "waist", elderly: 2, needs: ["rescue"], said: "నేను, నా భార్య ఇద్దరమే. ఇద్దరం డెబ్బై ఏళ్ళ పైనే. నడుము వరకు నీళ్ళు ఉన్నాయి." },
    { ago: 38, channel: "voice", name: "Fatima", area: "Prakash Nagar", landmark: "Masjid road", people: 7, water: "waist", sick: 1, medical: ["fever"], needs: ["medicine", "food"], said: "ప్రకాష్ నగర్ మసీదు రోడ్. ఏడుగురు ఉన్నాం, బాబుకి జ్వరం. మందులు, ఆహారం కావాలి." },
    { ago: 29, channel: "whatsapp", name: "Kiran", area: "Vambay Colony", landmark: "Block 12", people: 4, water: "knee", needs: ["food", "water"], said: "Vambay colony block 12, 4 members, knee level water, food and drinking water kavali" },
    { ago: 21, channel: "voice", name: "Suresh", area: "Bhavanipuram", landmark: "Near bus depot", people: 3, water: "waist", disabled: 1, needs: ["rescue"], said: "భవానీపురం బస్ డిపో దగ్గర. మా అన్నయ్య వీల్‌చెయిర్ మీద ఉంటాడు. ముగ్గురం ఉన్నాం." },
    { ago: 14, channel: "sms", name: "", area: "Kandrika", landmark: "Ration shop lane", people: 6, water: "knee", needs: ["food"], said: "Kandrika ration shop lane, 6 people, no food since morning" },
    { ago: 6, channel: "voice", name: "Ramesh", area: "Jakkampudi", landmark: "Housing colony", people: 1, water: "ankle", needs: ["power"], said: "జక్కంపూడి హౌసింగ్ కాలనీ. నేను ఒక్కడినే. కరెంట్ లేదు, నీళ్ళు చీలమండ వరకు." },
  ];
  for (const x of S) {
    const inc = buildIncident(x, { channel: x.channel, transcript: [{ who: "caller", text: x.said }], createdAt: now - x.ago * min });
    inc.demo = true;
    state.incidents.unshift(inc);
    if (inc.priority === "critical" || x.assign || x.resolved) assign(inc);
    if (x.resolved) resolveIncident(inc);
  }
  save();
}

async function loadState() {
  try {
    state = JSON.parse(await readFile(DATA_FILE, "utf8"));
    if (!state.teams?.length) throw new Error("empty");
  } catch {
    seed();
  }
}

function forecast() {
  const open = state.incidents.filter((i) => i.status !== "resolved");
  const by = new Map();
  for (const i of open) {
    const a = by.get(i.area) || { area: i.area, requests: 0, people: 0, vulnerable: 0, critical: 0, rescue: 0, recent: 0 };
    a.requests++;
    a.people += i.people || 0;
    a.vulnerable += vulnOf(i);
    if (i.priority === "critical") a.critical++;
    if ((i.needs || []).includes("rescue") || (WATER_RANK[i.water] ?? 0) >= 4) a.rescue++;
    if (Date.now() - i.createdAt < 60 * 60 * 1000) a.recent++;
    by.set(i.area, a);
  }
  const areas = [...by.values()]
    .map((a) => ({ ...a, food_packets: a.people * 3, water_litres: a.people * 4, boats: Math.ceil(a.rescue / 3), medical_kits: a.vulnerable, hotspot: a.critical > 0 || a.recent >= 3 }))
    .sort((x, y) => y.critical - x.critical || y.people - x.people);
  const totals = areas.reduce(
    (t, a) => ({ requests: t.requests + a.requests, people: t.people + a.people, vulnerable: t.vulnerable + a.vulnerable, food_packets: t.food_packets + a.food_packets, water_litres: t.water_litres + a.water_litres, boats: t.boats + a.boats }),
    { requests: 0, people: 0, vulnerable: 0, food_packets: 0, water_litres: 0, boats: 0 },
  );
  return { areas, totals, generatedAt: Date.now() };
}

/* ------------------------------------------------------------- AI layer */

async function sarvamChat(messages, { temperature = 0, max_tokens = 400 } = {}) {
  const res = await fetch("https://api.sarvam.ai/v1/chat/completions", {
    method: "POST",
    headers: { "api-subscription-key": SARVAM_KEY, "Content-Type": "application/json" },
    // reasoning_effort null: otherwise the model spends its budget thinking and returns no content.
    body: JSON.stringify({ model: "sarvam-105b", messages, temperature, max_tokens, reasoning_effort: null }),
  });
  if (!res.ok) throw new Error(`Sarvam LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() || "";
}

async function geminiChat(messages, { temperature = 0, max_tokens = 400, json = true } = {}) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const contents = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": GEMINI_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature, maxOutputTokens: Math.max(1024, max_tokens * 3), ...(json ? { responseMimeType: "application/json" } : {}) },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
}

let lastEngine = GEMINI_KEY ? "gemini" : "sarvam";
async function llm(messages, opts = {}) {
  if (GEMINI_KEY) {
    try {
      const text = await geminiChat(messages, opts);
      if (text) { lastEngine = "gemini"; return { text, engine: "gemini" }; }
    } catch (e) { console.warn("Gemini failed, falling back to Sarvam:", e.message); }
  }
  const text = await sarvamChat(messages, opts);
  lastEngine = "sarvam";
  return { text, engine: "sarvam" };
}

function parseJSON(text) {
  if (!text) return null;
  const t = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "").trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

function matchArea(s) {
  const k = String(s).toLowerCase().replace(/[^a-z]/g, "");
  if (!k) return null;
  for (const a of Object.keys(AREAS)) if (a.toLowerCase().replace(/[^a-z]/g, "") === k) return a;
  return k === "other" ? "Other" : null;
}

function clean(x) {
  const out = {};
  if (!x || typeof x !== "object") return out;
  if (typeof x.area === "string") { const a = matchArea(x.area); if (a) out.area = a; }
  if (typeof x.landmark === "string" && x.landmark.trim()) out.landmark = x.landmark.trim().slice(0, 80);
  const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 && n < 500 ? n : undefined; };
  for (const k of ["people", "elderly", "children", "pregnant", "disabled", "sick"]) { const n = int(x[k]); if (n !== undefined) out[k] = n; }
  if (out.people === 0) delete out.people;
  if (typeof x.water === "string" && x.water in WATER_RANK) out.water = x.water;
  if (x.no_vulnerable === true) out.no_vulnerable = true;
  if (x.no_medical === true) out.no_medical = true;
  if (Array.isArray(x.medical)) {
    const m = x.medical.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim().toLowerCase().slice(0, 40)).slice(0, 6);
    if (m.length) out.medical = m;
  }
  if (Array.isArray(x.needs)) { const n = x.needs.filter((s) => NEEDS.includes(s)); if (n.length) out.needs = [...new Set(n)]; }
  if (typeof x.name === "string" && x.name.trim()) out.name = x.name.trim().slice(0, 40);
  return out;
}

function merge(f, add) {
  for (const [k, v] of Object.entries(add)) {
    if (Array.isArray(v)) f[k] = [...new Set([...(f[k] || []), ...v])];
    else f[k] = v;
  }
}

function extractPrompt(known, asked, utterance) {
  return [
    {
      role: "system",
      content: [
        "You read what a caller said to a flood emergency helpline in Vijayawada, Andhra Pradesh. Speech may be Telugu, English or mixed, and may contain speech-recognition mistakes.",
        "Return ONLY a JSON object (no code fence, no explanation) with the fields the caller actually stated. Omit anything not stated. Never guess.",
        "Fields:",
        `"area": the locality, one of exactly: ${Object.keys(AREAS).join(" | ")} | Other. Match Telugu or misspelt forms (e.g. "సింగ్ నగర్" = "Singh Nagar", "పాయకాపురం" = "Payakapuram").`,
        '"landmark": nearby landmark or street, in English letters.',
        '"people": total number of people with the caller, integer ("నేను ఒక్కడినే" / "I am alone" = 1, "ఐదుగురు" = 5).',
        '"water": one of exactly: none | ankle | knee | waist | chest | first_floor | roof (మోకాళ్ళు = knee, నడుము = waist, ఛాతీ = chest).',
        '"elderly", "children", "pregnant", "disabled", "sick": integer counts of such people.',
        '"no_vulnerable": true if the caller says there are no elderly, children, pregnant or sick people.',
        '"medical": array of short English medical needs, e.g. ["insulin","dialysis","injury","fever","oxygen","bp tablets"].',
        '"no_medical": true if the caller says nobody needs medical help.',
        '"needs": array, subset of: rescue | food | water | medicine | baby_food | shelter | power.',
        '"name": the caller\'s name in English letters.',
        `The agent's last question was about: ${asked}. A short reply like "ఐదుగురు", "నడుము వరకు" or "లేరు" answers that question.`,
        `Already known: ${JSON.stringify(known)}`,
      ].join("\n"),
    },
    { role: "user", content: utterance },
  ];
}

/* ------------------------------------------------------------ voice I/O */

const ttsCache = new Map();
async function tts(text) {
  if (ttsCache.has(text)) return ttsCache.get(text);
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "api-subscription-key": SARVAM_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text, language_code: "te-IN", model: "bulbul:v3", temperature: 0.85, speaker: SPEAKER, pace: PACE, speech_sample_rate: 22050, output_audio_codec: "wav" }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const b64 = (await res.json()).audios?.[0];
  if (!b64) throw new Error("TTS returned no audio");
  if (ttsCache.size < 300) ttsCache.set(text, b64);
  return b64;
}

async function stt(wav) {
  const form = new FormData();
  form.append("file", new Blob([wav], { type: "audio/wav" }), "caller.wav");
  form.append("model", STT_MODEL);
  form.append("language_code", "te-IN");
  const res = await fetch("https://api.sarvam.ai/speech-to-text", { method: "POST", headers: { "api-subscription-key": SARVAM_KEY }, body: form });
  if (!res.ok) throw new Error(`STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()).transcript || "").trim();
}

/* -------------------------------------------------------- conversation */

// Every line the agent can say is fixed and pre-rendered, so the agent never
// says anything unvetted and replies play instantly. The AI's job is to
// understand free-form Telugu speech; the flow below decides what to ask next.
const L = {
  greeting: ["నమస్కారం, ఇది ఆపద్బాంధవుడు అత్యవసర సహాయ కేంద్రం. భయపడకండి, మేము మీకు సహాయం చేస్తాం.", "Namaskaram, this is the Aapadbandhu emergency helpline. Don't panic, we will help you."],
  area: ["మీరు ఇప్పుడు ఏ ఏరియాలో ఉన్నారు? దగ్గర్లో ఏదైనా గుర్తు చెప్పండి.", "Which area are you in right now? Tell me a nearby landmark."],
  people: ["మీతో పాటు మొత్తం ఎంత మంది ఉన్నారు?", "How many people are with you in total?"],
  water: ["నీళ్ళు ఎంత వరకు వచ్చాయి? మోకాళ్ళ వరకా, నడుము వరకా, లేక ఫస్ట్ ఫ్లోర్ వరకా?", "How high is the water? Knee, waist, or up to the first floor?"],
  vulnerable: ["మీలో వృద్ధులు, చిన్నపిల్లలు, గర్భిణీలు లేదా అనారోగ్యంతో ఉన్నవాళ్ళు ఎవరైనా ఉన్నారా?", "Is anyone elderly, a small child, pregnant, or unwell?"],
  medical: ["ఎవరికైనా వెంటనే మందులు లేదా డాక్టర్ సహాయం కావాలా?", "Does anyone need medicines or a doctor urgently?"],
  needs: ["మీకు ఇప్పుడు ముఖ్యంగా ఏం కావాలి? బోట్‌లో బయటకు తీసుకెళ్ళాలా, లేక ఆహారం, మంచినీళ్ళు, మందులు కావాలా?", "What do you need most right now? Boat rescue, or food, drinking water, medicines?"],
  name: ["చివరగా, మీ పేరు చెప్పండి.", "Lastly, please tell me your name."],
  ack1: ["సరే.", "Okay."],
  ack2: ["అర్థమైంది.", "Understood."],
  ack3: ["సరే, నోట్ చేసుకున్నాను.", "Okay, noted."],
  sorry: ["క్షమించండి, సరిగ్గా వినపడలేదు.", "Sorry, I couldn't hear that clearly."],
  safety: ["దయచేసి కరెంట్ మెయిన్ స్విచ్ ఆఫ్ చేసి, ఇంట్లో ఎత్తైన చోటికి వెళ్ళండి.", "Please switch off the main power and move to the highest point of the house."],
  close_critical: ["మీ వివరాలు నమోదు చేశాం. ఇది అత్యవసర కేసు, రెస్క్యూ టీమ్‌ని వెంటనే పంపిస్తున్నాం. ఫోన్ ఛార్జ్ ఉంచుకోండి, టీమ్ మీకు కాల్ చేస్తుంది.", "Your details are registered. This is an emergency case, so a rescue team is being sent right away. Keep your phone charged; the team will call you."],
  close_high: ["మీ వివరాలు నమోదు చేశాం. ఎక్కువ ప్రాధాన్యతతో రెస్క్యూ టీమ్‌కి పంపించాం. ఫోన్ ఛార్జ్ ఉంచుకోండి, టీమ్ మీకు కాల్ చేస్తుంది.", "Registered with high priority and sent to the rescue team. Keep your phone charged; the team will call you."],
  close_medium: ["మీ వివరాలు నమోదు చేశాం. సహాయక బృందం త్వరలో ఆహారం, నీళ్ళు తీసుకొస్తుంది. ఫోన్ ఛార్జ్ ఉంచుకోండి.", "Registered. The relief team will bring food and water soon. Keep your phone charged."],
  close_low: ["మీ వివరాలు నమోదు చేశాం. మా టీమ్ మిమ్మల్ని సంప్రదిస్తుంది. జాగ్రత్తగా ఉండండి.", "Registered. Our team will contact you. Please stay safe."],
};
const SLOTS = ["area", "people", "water", "vulnerable", "medical", "needs", "name"];
const sessions = new Map();

function nextSlot(s) {
  const f = s.f;
  const vuln = vulnOf(f);
  const has = {
    area: !!(f.area || f.landmark),
    people: !!f.people,
    water: !!f.water,
    vulnerable: vuln > 0 || !!f.no_vulnerable,
    medical: !!(f.medical?.length || f.no_medical) || (!!f.no_vulnerable && !f.sick),
    needs: !!f.needs?.length,
    name: !!f.name,
  };
  for (const slot of SLOTS) if (!has[slot] && (s.asked[slot] || 0) < 2) return slot;
  return null;
}

async function voiceReply(keys) {
  return {
    reply: keys.map((k) => ({ key: k, te: L[k][0], en: L[k][1] })),
    audios: await Promise.all(keys.map((k) => tts(L[k][0]).catch((e) => { console.warn("tts", e.message); return null; }))),
  };
}

async function handleSession() {
  const id = crypto.randomUUID();
  const s = { id, created: Date.now(), f: {}, asked: { area: 1 }, turns: [], lastSlot: "area", done: false, safetyGiven: false };
  sessions.set(id, s);
  const keys = ["greeting", "area"];
  s.turns.push({ who: "agent", text: `${L.greeting[0]} ${L.area[0]}` });
  return { status: 200, body: { sessionId: id, ...(await voiceReply(keys)), fields: s.f, engine: lastEngine } };
}

async function handleTurn(b) {
  const s = sessions.get(b.sessionId);
  if (!s) return { status: 404, body: { error: "Session expired. Please start a new call." } };
  if (s.done) return { status: 409, body: { error: "This call has already finished." } };

  let said = typeof b.text === "string" ? b.text.trim().slice(0, 600) : "";
  const timing = {};
  if (!said && typeof b.audio === "string" && b.audio) {
    const buf = Buffer.from(b.audio, "base64");
    if (buf.length > 3_000_000) return { status: 413, body: { error: "Audio too long" } };
    const t0 = Date.now();
    said = await stt(buf);
    timing.sttMs = Date.now() - t0;
  }

  let captured = {};
  if (said) {
    s.turns.push({ who: "caller", text: said });
    const t1 = Date.now();
    const { text } = await llm(extractPrompt(s.f, s.lastSlot, said), { max_tokens: 300 });
    timing.aiMs = Date.now() - t1;
    captured = clean(parseJSON(text));
    merge(s.f, captured);
  }

  const keys = [];
  if (!said || !Object.keys(captured).length) keys.push("sorry");
  else keys.push(["ack1", "ack2", "ack3"][s.turns.length % 3]);
  if (!s.safetyGiven && (WATER_RANK[s.f.water] ?? 0) >= 3) { keys.push("safety"); s.safetyGiven = true; }

  let incident = null;
  const slot = nextSlot(s);
  if (slot) {
    s.asked[slot] = (s.asked[slot] || 0) + 1;
    s.lastSlot = slot;
    keys.push(slot);
  } else {
    s.done = true;
    const preview = triage({ ...s.f, people: s.f.people || 1 });
    keys.push(`close_${preview.priority}`);
  }
  for (const k of keys) s.turns.push({ who: "agent", text: L[k][0] });
  if (s.done) incident = createIncident(s.f, { channel: "voice", transcript: s.turns });

  return { status: 200, body: { said, captured, fields: s.f, done: s.done, incident, timing, engine: lastEngine, ...(await voiceReply(keys)) } };
}

async function handleSosText(b) {
  const msg = String(b.message || "").trim().slice(0, 1000);
  if (!msg) return { status: 400, body: { error: "Empty message" } };
  const channel = ["whatsapp", "sms", "social"].includes(b.channel) ? b.channel : "whatsapp";
  const { text, engine } = await llm(extractPrompt({}, "everything (this is one written SOS message)", msg), { max_tokens: 400 });
  const f = clean(parseJSON(text));
  const inc = createIncident(f, { channel, transcript: [{ who: "caller", text: msg }] });
  return { status: 200, body: { incident: inc, fields: f, engine } };
}

async function handleReport() {
  const open = state.incidents.filter((i) => i.status !== "resolved");
  const fc = forecast();
  const lines = open.slice(0, 25).map((i) => `${i.id} [${i.priority}] ${i.summary} | ${i.status}${i.team ? ` -> ${i.team.name}, ETA ${i.team.eta} min` : ""}`);
  const messages = [
    {
      role: "system",
      content:
        "You are the AI analyst in a district flood control room in Vijayawada. Write a crisp situation report for the District Collector. Use ONLY the data given and never invent numbers. Format: one title line, then 5-6 short bullet points in English, most urgent first (critical cases, hotspot areas, resource needs, team utilisation, recommended next actions), then a line starting 'తెలుగు సారాంశం:' with a two-sentence Telugu summary. Plain text, no markdown tables, no asterisks.",
    },
    {
      role: "user",
      content: `Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\nTotals (open requests): ${JSON.stringify(fc.totals)}\nAreas: ${JSON.stringify(fc.areas.slice(0, 8))}\nTeams free: ${state.teams.filter((t) => !t.busyWith).length} of ${state.teams.length}\nOpen incidents:\n${lines.join("\n")}`,
    },
  ];
  const { text, engine } = await llm(messages, { max_tokens: 700, temperature: 0.3, json: false });
  return { status: 200, body: { report: text.replace(/<think>[\s\S]*?<\/think>/g, "").trim(), engine } };
}

/* ----------------------------------------------------------------- http */

const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(msg);
}
setInterval(() => { for (const c of clients) c.write(": ping\n\n"); }, 20000).unref();
setInterval(() => { for (const [id, s] of sessions) if (Date.now() - s.created > 30 * 60 * 1000) sessions.delete(id); }, 5 * 60 * 1000).unref();

const hits = new Map();
function limited(ip, max = 120, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > max;
}

function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

async function readBody(req, limit = 4_500_000) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error("Request too large"), { status: 413 });
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json" };
const PAGES = { "/": "index.html", "/call": "call.html", "/dashboard": "dashboard.html" };
const PUBLIC = path.join(ROOT, "public");

async function serveStatic(res, p) {
  const rel = PAGES[p] || decodeURIComponent(p).replace(/^\/+/, "");
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(404); return res.end("Not found"); }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

async function api(req, res, p) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const GET = req.method === "GET";
  if (GET && p === "/api/health") return send(res, 200, { ok: true, engine: lastEngine, voice: !!SARVAM_KEY, gemini: !!GEMINI_KEY });
  if (GET && p === "/api/state") return send(res, 200, { incidents: state.incidents, teams: state.teams, engine: lastEngine, gemini: !!GEMINI_KEY });
  if (GET && p === "/api/forecast") return send(res, 200, forecast());
  if (req.method !== "POST") return send(res, 404, { error: "Not found" });
  if (limited(ip)) return send(res, 429, { error: "Too many requests, slow down." });

  const b = await readBody(req);
  let out;
  if (p === "/api/session") out = await handleSession();
  else if (p === "/api/turn") out = await handleTurn(b);
  else if (p === "/api/sos-text") out = await handleSosText(b);
  else if (p === "/api/report") out = await handleReport();
  else if (p === "/api/reset") {
    seed();
    broadcast("reset", {});
    out = { status: 200, body: { ok: true } };
  } else {
    const m = p.match(/^\/api\/incidents\/(SOS-\d+)\/(assign|resolve)$/);
    const inc = m && state.incidents.find((i) => i.id === m[1]);
    if (!inc) return send(res, 404, { error: "Incident not found" });
    if (m[2] === "assign") {
      if (inc.status !== "new") return send(res, 409, { error: "Already assigned" });
      if (!assign(inc)) return send(res, 409, { error: "No free team available" });
    } else resolveIncident(inc);
    save();
    broadcast("incident", inc);
    broadcast("teams", state.teams);
    out = { status: 200, body: { incident: inc } };
  }
  return send(res, out.status, out.body);
}

const server = http.createServer(async (req, res) => {
  const p = new URL(req.url, "http://local").pathname;
  try {
    if (req.method === "GET" && p === "/api/stream") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      res.write("retry: 3000\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (p.startsWith("/api/")) return await api(req, res, p);
    return await serveStatic(res, p);
  } catch (e) {
    console.error(p, e.message);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : "Something went wrong. Please try again." });
  }
});

await loadState();
server.listen(PORT, HOST, () => console.log(`Aapadbandhu AI on http://${HOST}:${PORT} (AI: ${GEMINI_KEY ? `Gemini ${GEMINI_MODEL} + Sarvam fallback` : "Sarvam"})`));

// Render every fixed line once so the first caller hears replies instantly.
if (SARVAM_KEY) {
  const keys = Object.keys(L);
  for (let i = 0; i < keys.length; i += 4) {
    await Promise.all(keys.slice(i, i + 4).map((k) => tts(L[k][0]).catch((e) => console.warn("prewarm", k, e.message))));
  }
  console.log(`Voice ready: ${ttsCache.size}/${keys.length} lines pre-rendered`);
} else console.warn("SARVAM_API_KEY missing: voice disabled");
