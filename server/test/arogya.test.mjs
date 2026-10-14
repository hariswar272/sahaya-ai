// Unit tests for Arogya Call's danger-sign rules and answer handling. Run: npm test (from server/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { assess, summarize, fallback, clean, PROGRAMS } from "../modules/arogya.mjs";

const question = (program, key) => PROGRAMS[program].questions.find((q) => q.key === key);

test("pregnancy: bleeding is a high-risk danger sign", () => {
  const r = assess("anc", { bleeding: true, ifa_taken: true });
  assert.equal(r.risk, "high");
  assert.ok(r.reasons.includes("Bleeding or water leaking"));
});

test("pregnancy: headache with swelling is flagged as possible pre-eclampsia", () => {
  const r = assess("anc", { headache_vision: true, swelling: true });
  assert.equal(r.risk, "high");
  assert.ok(r.reasons.some((x) => /pre-eclampsia/.test(x)));
  assert.ok(!r.reasons.some((x) => /check BP/.test(x)), "swelling must not also be listed as a separate medium sign");
});

test("pregnancy: reduced baby movement is high, swelling alone is medium", () => {
  assert.equal(assess("anc", { baby_movement: false }).risk, "high");
  assert.equal(assess("anc", { swelling: true }).risk, "medium");
});

test("BP/diabetes: chest pain, very high sugar and very high BP are high risk", () => {
  assert.equal(assess("ncd", { chest_pain: true }).risk, "high");
  assert.equal(assess("ncd", { sugar: 350 }).risk, "high");
  assert.equal(assess("ncd", { bp_systolic: 190, bp_diastolic: 100 }).risk, "high");
  assert.equal(assess("ncd", { bp_systolic: 140, bp_diastolic: 115 }).risk, "high");
});

test("BP/diabetes: borderline readings and missed tablets are medium", () => {
  assert.equal(assess("ncd", { sugar: 250 }).risk, "medium");
  assert.equal(assess("ncd", { bp_systolic: 165, bp_diastolic: 95 }).risk, "medium");
  assert.equal(assess("ncd", { missed_days: 3 }).risk, "medium");
  assert.equal(assess("ncd", { missed_days: 2, meds_today: true }).risk, "low");
});

test("TB: blood in cough and jaundice are high; a missed dose is medium", () => {
  assert.equal(assess("tb", { blood_sputum: true }).risk, "high");
  assert.equal(assess("tb", { jaundice: true }).risk, "high");
  const r = assess("tb", { missed_doses: 1 });
  assert.equal(r.risk, "medium");
  assert.ok(r.reasons.includes("Missed 1 dose this week"));
});

test("a patient doing well is low risk with an explicit reason", () => {
  const r = assess("anc", { bleeding: false, swelling: false, baby_movement: true, ifa_taken: true, checkup_known: true });
  assert.equal(r.risk, "low");
  assert.deepEqual(r.reasons, ["No danger signs reported"]);
});

test("high-risk reasons are listed before medium ones", () => {
  const r = assess("ncd", { dizziness: true, chest_pain: true });
  assert.deepEqual(r.reasons, ["Chest pain", "Dizziness"]);
});

test("summary is a readable one-liner for the health worker", () => {
  assert.equal(summarize("ncd", { meds_today: true, missed_days: 1, sugar: 180, bp_systolic: 150, bp_diastolic: 90 }), "Took tablets today, missed 1 day this week, sugar 180, BP 150/90");
  assert.equal(summarize("tb", { tb_meds_daily: true, missed_doses: 0 }), "Taking TB tablets daily, no missed doses");
  assert.equal(summarize("anc", {}), "No answers recorded");
});

test("clean keeps only known fields with valid types and ranges", () => {
  const out = clean("ncd", { meds_today: "yes", chest_pain: "NO", sugar: 2000, bp_systolic: "160", missed_days: 9, injected: true, dizziness: "maybe" });
  assert.deepEqual(out, { meds_today: true, chest_pain: false, bp_systolic: 160 });
  assert.deepEqual(clean("tb", null), {});
});

test("fallback understands short Telugu yes/no answers", () => {
  assert.deepEqual(fallback("anc", question("anc", "q_bleeding"), "లేదు"), { bleeding: false });
  assert.deepEqual(fallback("anc", question("anc", "q_ifa"), "అవును, వేసుకుంటున్నా"), { ifa_taken: true });
});

test("fallback reads counts in digits or Telugu words, and 'none' as zero", () => {
  const q = question("ncd", "q_missed");
  assert.deepEqual(fallback("ncd", q, "2 రోజులు"), { missed_days: 2 });
  assert.deepEqual(fallback("ncd", q, "మూడు రోజులు"), { missed_days: 3 });
  assert.deepEqual(fallback("ncd", q, "లేదు"), { missed_days: 0 });
});

test("fallback parses a BP reading and treats 'don't know' as unknown", () => {
  const q = question("ncd", "q_reading");
  assert.deepEqual(fallback("ncd", q, "160 by 100"), { bp_systolic: 160, bp_diastolic: 100 });
  assert.deepEqual(fallback("ncd", q, "తెలియదు"), { reading_unknown: true });
});

test("a bare yes to a multi-symptom question never invents a specific symptom", () => {
  assert.deepEqual(fallback("ncd", question("ncd", "q_symptoms"), "అవును"), { mild_symptoms: true });
});
