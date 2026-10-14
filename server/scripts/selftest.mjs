// Live check of the AI/voice stack against Sarvam (and Gemini if configured). Never prints keys.
// Run: node server/scripts/selftest.mjs
import "../lib/env.mjs";
import * as ai from "../lib/ai.mjs";
import * as voice from "../lib/voice.mjs";
import * as sessions from "../lib/sessions.mjs";
import { createFlow } from "../lib/flow.mjs";

const ok = (name, ms, extra = "") => console.log(`PASS ${name} (${ms} ms) ${extra}`);
const bad = (name, e) => {
  console.log(`FAIL ${name}: ${e?.message || e}`);
  process.exitCode = 1;
};
const time = async (fn) => {
  const t = Date.now();
  const v = await fn();
  return [v, Date.now() - t];
};

console.log(`keys: sarvam=${voice.hasVoice() ? "set" : "MISSING"} gemini=${ai.hasGemini() ? "set" : "not set"}`);

// 1. TTS -> STT round trip
const sentence = "మేము సింగ్ నగర్ లో ఉన్నాం, ఐదుగురు ఉన్నాం, నీళ్ళు నడుము వరకు వచ్చాయి.";
let wav = null;
try {
  const [b64, ms] = await time(() => voice.tts(sentence));
  if (!b64) throw new Error("tts returned null");
  wav = Buffer.from(b64, "base64");
  ok("tts bulbul:v3", ms, `${wav.length} bytes, header=${wav.toString("ascii", 0, 4)}`);
  const [again, ms2] = await time(() => voice.tts(sentence));
  ok("tts cache", ms2, again === b64 ? "hit" : "MISS");
} catch (e) {
  bad("tts", e);
}
if (wav) {
  try {
    const [text, ms] = await time(() => voice.stt(wav, "te-IN"));
    ok("stt saarika:v2.5", ms, `transcript="${text}"`);
  } catch (e) {
    bad("stt", e);
  }
}

// 2. Long text TTS (split + WAV stitch)
try {
  const long = Array(6).fill("దయచేసి కరెంట్ మెయిన్ స్విచ్ ఆఫ్ చేసి, ఇంట్లో ఎత్తైన చోటికి వెళ్ళండి.").join(" ");
  const [b64, ms] = await time(() => voice.tts(long));
  if (!b64) throw new Error("null");
  ok("tts long (split+merge)", ms, `${long.length} chars -> ${Buffer.from(b64, "base64").length} bytes`);
} catch (e) {
  bad("tts long", e);
}

// 3. LLM JSON extraction
try {
  const [r, ms] = await time(() =>
    ai.llmJSON(
      [
        { role: "system", content: 'Extract from a flood helpline caller\'s Telugu speech. Return JSON: {"area": string, "people": integer, "water": "knee"|"waist"|"chest"|"first_floor"}. Omit unknown fields.' },
        { role: "user", content: sentence },
      ],
      { max_tokens: 200 },
    ),
  );
  if (!r.data || typeof r.data !== "object") throw new Error(`unparsed: ${JSON.stringify(r)}`);
  ok(`llmJSON ${r.engine}`, ms, JSON.stringify(r.data));
} catch (e) {
  bad("llmJSON", e);
}

// 4. Free-text LLM in Telugu
try {
  const [r, ms] = await time(() =>
    ai.llm(
      [
        { role: "system", content: "Reply in one short sentence of simple spoken Telugu." },
        { role: "user", content: "వర్షం పడితే టమాటా పంటని ఎలా కాపాడాలి?" },
      ],
      { max_tokens: 120, temperature: 0.3 },
    ),
  );
  if (!r.text) throw new Error("empty");
  ok(`llm ${r.engine}`, ms, r.text.slice(0, 120));
} catch (e) {
  bad("llm", e);
}

// 5. Flow engine with a typed turn (no audio)
try {
  const flow = createFlow(
    {
      lines: { greeting: ["నమస్కారం.", "Hello."], ack1: ["సరే.", "Okay."], sorry: ["క్షమించండి.", "Sorry."], area: ["ఏ ఏరియా?", "Which area?"], people: ["ఎంత మంది?", "How many?"], close: ["నమోదు చేశాం.", "Registered."] },
      slots: [
        { key: "area", filled: (f) => !!f.area },
        { key: "people", filled: (f) => !!f.people },
      ],
      extractPrompt: (f, asked, u) => [
        { role: "system", content: `Return JSON {"area": string, "people": integer} with only stated fields. Asked about: ${asked}. Known: ${JSON.stringify(f)}` },
        { role: "user", content: u },
      ],
      clean: (x) => ({ ...(typeof x.area === "string" ? { area: x.area } : {}), ...(Number.isFinite(+x.people) && +x.people > 0 ? { people: +x.people } : {}) }),
      finish: async (f) => ({ closeKey: "close", result: { ...f } }),
    },
    { ai: { ...ai, get engine() { return ai.lastEngine(); } }, voice, sessions: { create: sessions.create, get: sessions.get, delete: sessions.remove } },
  );
  const [s, ms0] = await time(() => flow.start({}));
  ok("flow.start", ms0, `lines=${s.reply.map((r) => r.en).join(" | ")} audios=${s.audios.filter(Boolean).length}/${s.audios.length}`);
  const [t, ms1] = await time(() => flow.turn({ sessionId: s.sessionId, text: "సింగ్ నగర్ లో ఉన్నాం, ఐదుగురం" }));
  ok("flow.turn", ms1, `captured=${JSON.stringify(t.captured)} done=${t.done} result=${JSON.stringify(t.result)} reply=${t.reply.map((r) => r.en).join(" | ")}`);
} catch (e) {
  bad("flow", e);
}

console.log(process.exitCode ? "SELFTEST: some checks failed" : "SELFTEST: all passed");
