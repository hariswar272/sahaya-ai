// Unit tests for how Scam Shield validates the model's reply and combines it with the
// rule engine. The key guarantee: a missing, broken or over-trusting AI answer can never
// make a known scam pattern look safe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runRules, merge, normaliseAI } from "../modules/scam.mjs";

const DIGITAL_ARREST = "This is CBI officer. You are under digital arrest for money laundering. Stay on video call and transfer Rs 50,000 immediately.";
const SAFE_OTP = "Your OTP for login to the SBI YONO app is 482913. Do not share it with anyone. -SBI";

test("normaliseAI rejects non-objects and unknown verdicts", () => {
  assert.equal(normaliseAI(null), null);
  assert.equal(normaliseAI("scam"), null);
  assert.equal(normaliseAI({ verdict: "definitely fine" }), null);
});

test("normaliseAI clamps confidence and maps unknown scam types", () => {
  assert.equal(normaliseAI({ verdict: "scam", confidence: 250 }).confidence, 100);
  assert.equal(normaliseAI({ verdict: "scam", confidence: -5 }).confidence, 0);
  assert.equal(normaliseAI({ verdict: "SCAM", confidence: "abc" }).confidence, 70);
  assert.equal(normaliseAI({ verdict: "scam", scam_type: "alien_invasion" }).scam_type, "other");
  assert.equal(normaliseAI({ verdict: "safe" }).scam_type, "none");
});

test("normaliseAI zips Telugu/English lists and caps their length", () => {
  const ai = normaliseAI({
    verdict: "scam",
    red_flags_te: ["ఒకటి", "రెండు", "మూడు", "నాలుగు", "ఐదు"],
    red_flags_en: ["one", "two", "three", "four", "five"],
    do_now: [{ te: "1930 కి కాల్ చేయండి", en: "Call 1930" }],
    explanation_en: "x".repeat(900),
  });
  assert.equal(ai.red_flags.length, 4);
  assert.deepEqual(ai.red_flags[1], { te: "రెండు", en: "two" });
  assert.deepEqual(ai.do_now, [{ te: "1930 కి కాల్ చేయండి", en: "Call 1930" }]);
  assert.equal(ai.explanation_en.length, 500);
});

test("an AI reply of 'safe' cannot downgrade a rule-detected scam", () => {
  const rules = runRules(DIGITAL_ARREST);
  assert.equal(rules.verdict, "scam");
  const ai = normaliseAI({ verdict: "safe", confidence: 99, scam_type: "none" });
  const out = merge(rules, ai, "test", "sms", null, DIGITAL_ARREST);
  assert.equal(out.verdict, "scam");
  assert.equal(out.scam_type, "digital_arrest");
  assert.equal(out.confidence, rules.confidence, "confidence comes from the rules, not the overruled AI");
  assert.ok(out.red_flags.every((f) => f.source === "rule"));
});

test("when the AI is unavailable the rules still give a full answer", () => {
  const out = merge(runRules(DIGITAL_ARREST), null, "test", "sms", null, DIGITAL_ARREST);
  assert.equal(out.verdict, "scam");
  assert.equal(out.engine, "rules");
  assert.equal(out.ai, null);
  assert.ok(out.explanation_te && out.explanation_en);
});

test("the AI can raise the alarm on a message the rules miss", () => {
  const text = "Hello sir, kindly confirm your address for the free gift hamper.";
  const rules = runRules(text);
  const ai = normaliseAI({ verdict: "suspicious", confidence: 65, scam_type: "lottery_prize" });
  const out = merge(rules, ai, "test", "whatsapp", null, text);
  assert.equal(out.verdict, "suspicious");
  assert.equal(out.scam_type, "lottery_prize");
});

test("every non-safe verdict tells the user to report to 1930", () => {
  const out = merge(runRules(DIGITAL_ARREST), normaliseAI({ verdict: "scam", do_now_te: ["ఫోన్ పెట్టేయండి", "బ్లాక్ చేయండి"], do_now_en: ["Hang up", "Block"] }), "test", "call", null, DIGITAL_ARREST);
  assert.ok(out.do_now.some((x) => /1930|cybercrime/.test(x.en)));
  assert.deepEqual(out.report, { helpline: "1930", portal: "https://cybercrime.gov.in" });
});

test("advice to hide things from family is filtered out", () => {
  const ai = normaliseAI({
    verdict: "scam",
    dont_te: ["కుటుంబ సభ్యులకు చెప్పకండి", "డబ్బులు పంపకండి"],
    dont_en: ["Don't tell your family members", "Don't send money"],
  });
  const out = merge(runRules(DIGITAL_ARREST), ai, "test", "call", null, DIGITAL_ARREST);
  assert.ok(!out.dont.some((x) => /family/i.test(x.en)));
  assert.ok(out.dont.length >= 2);
});

test("a genuine OTP message gets calm, fixed wording", () => {
  const out = merge(runRules(SAFE_OTP), normaliseAI({ verdict: "safe", confidence: 90 }), "test", "sms", null, SAFE_OTP);
  assert.equal(out.verdict, "safe");
  assert.equal(out.scam_type, "none");
  assert.match(out.explanation_en, /normal OTP message you requested/);
});

test("results never echo the checked message back except as extracted text", () => {
  const out = merge(runRules(DIGITAL_ARREST), null, "test", "sms", null, DIGITAL_ARREST);
  assert.ok(!JSON.stringify(out).includes("money laundering"));
  assert.match(out.id, /^chk_/);
});
