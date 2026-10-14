// Generic slot-filling voice conversation engine shared by the SOS and other voice flows.
// The AI only extracts facts from free speech; this flow decides what to ask next, and every
// fixed line is pre-rendered so replies play instantly.
//
// Language: engine.start({ lang }) picks the session language (default "en").
//   te → the hand-written Telugu line, en → the English line, any other → the English line
//   translated once via i18n (disk-cached). TTS speaks in that language (falls back to English);
//   STT listens in that language ("unknown" = auto-detect for English sessions).
import { normLang } from "./i18n.mjs";

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const NOTE = "The caller may speak any Indian language or English.";

function merge(fields, add) {
  for (const [k, v] of Object.entries(add || {})) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) fields[k] = [...new Set([...(Array.isArray(fields[k]) ? fields[k] : []), ...v])];
    else fields[k] = v;
  }
}

function withNote(messages) {
  const m = (Array.isArray(messages) ? messages : []).map((x) => ({ ...x }));
  const sys = m.find((x) => x.role === "system");
  if (sys) sys.content = `${sys.content}\n${NOTE}`;
  else m.unshift({ role: "system", content: NOTE });
  return m;
}

/**
 * def = {
 *   lines: { greeting:[te,en], ack1, ack2, ack3, sorry, <slotKey>:[te,en], <closeKeys>... }   // value: [te,en] | {te,en} | (session) => [te,en]|{te,en}
 *   slots: [{ key, filled: (fields, session) => bool, maxAsks: 2 }],
 *   firstSlot?, extractPrompt(fields, askedKey, utterance, session) => messages, clean(raw, session) => partial,
 *   extraLines?(fields, session) => keys[], finish(fields, session) => ({ closeKey, result }), preview?(fields, session),
 *   initialFields?: object | (meta) => object, defaultLang?: "en", maxTokens?: 300
 * }
 */
export function createFlow(def, { ai, voice, sessions, i18n }) {
  if (!def || !Array.isArray(def.slots) || !def.lines) throw new Error("flow: def needs lines and slots");
  const lines = def.lines;
  const acks = ["ack1", "ack2", "ack3"].filter((k) => lines[k]);

  const line = (k, s) => {
    let v = lines[k];
    if (typeof v === "function") v = v(s);
    if (!v) throw new Error(`flow: missing line "${k}"`);
    return Array.isArray(v) ? { te: String(v[0] ?? ""), en: String(v[1] ?? "") } : { te: String(v.te ?? ""), en: String(v.en ?? "") };
  };

  const nextSlot = (s) => {
    for (const slot of def.slots) {
      if (!slot.filled(s.fields, s) && (s.asked[slot.key] || 0) < (slot.maxAsks ?? 2)) return slot.key;
    }
    return null;
  };

  const preview = (s) => (def.preview ? def.preview(s.fields, s) : null);

  /** [{te,en}] → [{te,en,text,lang}] in the session language; `lang` is the language `text` is really in. */
  async function localize(s, base) {
    const lang = s.lang || "en";
    let map = null;
    if (lang !== "te" && lang !== "en" && i18n) {
      try {
        map = await i18n.translate(lang, base.map((r) => r.en).filter(Boolean));
      } catch {}
    }
    return base.map((r) => {
      if (lang === "te" && r.te) return { ...r, text: r.te, lang: "te" };
      if (lang === "en" || !r.en) return { ...r, text: r.en || r.te, lang: r.en ? "en" : "te" };
      const t = map?.[r.en];
      return t && t !== r.en ? { ...r, text: t, lang } : { ...r, text: r.en, lang: "en" };
    });
  }

  async function respond(s, keys, extra) {
    const reply = await localize(s, keys.map((k) => line(k, s)));
    for (const r of reply) s.turns.push({ who: "agent", text: r.text, te: r.te, en: r.en, lang: r.lang });
    const audios = await voice.speakAll(reply);
    return { sessionId: s.sessionId, lang: s.lang, reply, audios, engine: ai.engine, ...extra };
  }

  async function start(meta = {}) {
    const s = { meta, lang: normLang(meta?.lang ?? def.defaultLang ?? "en"), fields: {}, asked: {}, turns: [], lastSlot: null, done: false, extraGiven: {} };
    if (def.initialFields) merge(s.fields, typeof def.initialFields === "function" ? def.initialFields(meta) : def.initialFields);
    sessions.create(s);
    const first = def.firstSlot && def.slots.some((x) => x.key === def.firstSlot) ? def.firstSlot : nextSlot(s);
    const keys = lines.greeting ? ["greeting"] : [];
    if (first) {
      keys.push(first);
      s.asked[first] = 1;
      s.lastSlot = first;
    }
    return respond(s, keys, { fields: s.fields, preview: preview(s), done: false });
  }

  async function turn(body = {}) {
    const s = sessions.get(body.sessionId);
    if (!s) throw httpError(404, "Session expired. Please start a new call.");
    if (s.done) throw httpError(409, "This call has already finished.");

    let said = typeof body.text === "string" ? body.text.trim().slice(0, 600) : "";
    const timing = {};
    if (!said && typeof body.audio === "string" && body.audio) {
      const buf = Buffer.from(body.audio, "base64");
      if (buf.length > 6_000_000) throw httpError(413, "Audio too long");
      const t0 = Date.now();
      // English sessions auto-detect: people often answer in their own language anyway.
      said = await voice.stt(buf, !s.lang || s.lang === "en" ? "unknown" : `${s.lang}-IN`);
      timing.sttMs = Date.now() - t0;
    }

    let captured = {};
    if (said) {
      s.turns.push({ who: "caller", text: said });
      const t1 = Date.now();
      const { data } = await ai.llmJSON(withNote(def.extractPrompt(s.fields, s.lastSlot, said, s)), { max_tokens: def.maxTokens || 300 });
      timing.aiMs = Date.now() - t1;
      captured = (def.clean ? def.clean(data || {}, s) : data || {}) || {};
      merge(s.fields, captured);
    }

    const keys = [];
    if (!said || !Object.keys(captured).length) {
      if (lines.sorry) keys.push("sorry");
    } else if (acks.length) keys.push(acks[s.turns.length % acks.length]);
    for (const k of (def.extraLines && def.extraLines(s.fields, s)) || []) {
      if (!s.extraGiven[k] && lines[k]) {
        keys.push(k);
        s.extraGiven[k] = true;
      }
    }

    let result = null;
    const slot = nextSlot(s);
    if (slot) {
      s.asked[slot] = (s.asked[slot] || 0) + 1;
      s.lastSlot = slot;
      keys.push(slot);
    } else {
      s.done = true;
      // s.turns is live: the closing line is appended right after finish() returns.
      const fin = (await def.finish(s.fields, s)) || {};
      result = fin.result ?? null;
      s.result = result;
      if (fin.closeKey && lines[fin.closeKey]) keys.push(fin.closeKey);
    }

    return respond(s, keys, { said, captured, fields: s.fields, preview: preview(s), done: s.done, result, timing });
  }

  /**
   * Render every static line (Telugu + English) once so callers hear replies instantly. Gentle on the
   * shared Sarvam key: small batches, a pause after any batch that actually hit the API.
   */
  async function prewarm({ concurrency = 2, delayMs = 300 } = {}) {
    const jobs = Object.values(lines)
      .filter((v) => typeof v !== "function" && v)
      .flatMap((v) => {
        const te = Array.isArray(v) ? v[0] : v.te;
        const en = Array.isArray(v) ? v[1] : v.en;
        return [
          [te, "te-IN"],
          [en, "en-IN"],
        ];
      })
      .filter(([t]) => t);
    for (let i = 0; i < jobs.length; i += concurrency) {
      const t0 = Date.now();
      await Promise.all(jobs.slice(i, i + concurrency).map(([t, l]) => voice.tts(t, l)));
      if (Date.now() - t0 > 60 && delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
    return jobs.length;
  }

  return { start, turn, prewarm, get: (id) => sessions.get(id) };
}
