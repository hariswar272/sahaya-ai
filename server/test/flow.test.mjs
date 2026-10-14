// Unit tests for the slot-filling voice conversation engine. The AI, voice and session
// layers are injected as in-memory stubs, so these tests run offline and deterministically.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFlow } from "../lib/flow.mjs";

/** In-memory dependencies; `scripted` is the queue of facts the stub "AI" extracts per turn. */
function deps(scripted = []) {
  const store = new Map();
  let n = 0;
  const prompts = [];
  return {
    prompts,
    sessions: {
      create(s) {
        s.sessionId = `s${++n}`;
        store.set(s.sessionId, s);
        return s.sessionId;
      },
      get: (id) => store.get(id),
      delete: (id) => store.delete(id),
    },
    ai: {
      engine: "stub",
      async llmJSON(messages) {
        prompts.push(messages);
        return { data: scripted.shift() ?? {} };
      },
    },
    voice: {
      speakAll: async (lines) => lines.map(() => null),
      stt: async () => "",
      tts: async () => null,
    },
    i18n: null,
  };
}

const def = {
  lines: {
    greeting: ["నమస్కారం", "Hello"],
    ack1: ["సరే", "Okay"],
    sorry: ["క్షమించండి", "Sorry"],
    area: ["మీరు ఎక్కడ ఉన్నారు?", "Where are you?"],
    people: ["ఎంత మంది ఉన్నారు?", "How many people?"],
    close: ["ధన్యవాదాలు", "Thank you"],
  },
  slots: [
    { key: "area", filled: (f) => !!f.area },
    { key: "people", filled: (f) => !!f.people },
  ],
  extractPrompt: (_fields, asked, said) => [
    { role: "system", content: `The agent asked about: ${asked}` },
    { role: "user", content: said },
  ],
  clean: (raw) => raw,
  finish: async (fields) => ({ closeKey: "close", result: { ...fields } }),
};

const texts = (r) => r.reply.map((x) => x.text);

test("start greets and asks the first slot", async () => {
  const flow = createFlow(def, deps());
  const r = await flow.start({ lang: "en" });
  assert.deepEqual(texts(r), ["Hello", "Where are you?"]);
  assert.equal(r.done, false);
});

test("a Telugu session speaks the Telugu lines", async () => {
  const flow = createFlow(def, deps());
  const r = await flow.start({ lang: "te" });
  assert.deepEqual(texts(r), ["నమస్కారం", "మీరు ఎక్కడ ఉన్నారు?"]);
  assert.ok(r.reply.every((x) => x.lang === "te"));
});

test("facts given in one breath fill several slots and finish the call", async () => {
  const flow = createFlow(def, deps([{ area: "Guntur", people: 4 }]));
  const s = await flow.start({ lang: "en" });
  const r = await flow.turn({ sessionId: s.sessionId, text: "We are in Guntur, four of us" });
  assert.equal(r.done, true);
  assert.deepEqual(r.result, { area: "Guntur", people: 4 });
  assert.ok(texts(r).includes("Thank you"));
});

test("only the missing slot is asked next", async () => {
  const flow = createFlow(def, deps([{ area: "Guntur" }]));
  const s = await flow.start({ lang: "en" });
  const r = await flow.turn({ sessionId: s.sessionId, text: "Guntur" });
  assert.deepEqual(texts(r), ["Okay", "How many people?"]);
});

test("nothing understood → apologise and re-ask; give up on a slot after maxAsks", async () => {
  const flow = createFlow(def, deps([{}, {}]));
  const s = await flow.start({ lang: "en" });
  const r1 = await flow.turn({ sessionId: s.sessionId, text: "umm" });
  assert.deepEqual(texts(r1), ["Sorry", "Where are you?"]);
  const r2 = await flow.turn({ sessionId: s.sessionId, text: "hmm" });
  assert.deepEqual(texts(r2), ["Sorry", "How many people?"]);
});

test("the extraction prompt always tells the model the caller may use any Indian language", async () => {
  const d = deps([{ area: "Guntur" }]);
  const flow = createFlow(def, d);
  const s = await flow.start({ lang: "en" });
  await flow.turn({ sessionId: s.sessionId, text: "Guntur" });
  assert.match(d.prompts[0][0].content, /any Indian language/);
});

test("unknown and finished sessions are rejected with HTTP-style errors", async () => {
  const flow = createFlow(def, deps([{ area: "Guntur", people: 2 }]));
  await assert.rejects(flow.turn({ sessionId: "nope", text: "hi" }), (e) => e.statusCode === 404);
  const s = await flow.start({ lang: "en" });
  await flow.turn({ sessionId: s.sessionId, text: "Guntur, two" });
  await assert.rejects(flow.turn({ sessionId: s.sessionId, text: "again" }), (e) => e.statusCode === 409);
});

test("a flow definition without slots is refused", () => {
  assert.throws(() => createFlow({ lines: {} }, deps()), /needs lines and slots/);
});
