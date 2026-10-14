// Unit tests for the Disaster SOS triage rules. Run: npm test (from server/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { triage, summarize, findPlace, matchArea, km } from "../modules/sos.mjs";

test("a life-critical medical need is always critical", () => {
  const r = triage({ people: 2, water: "ankle", medical: ["insulin"], needs: [] });
  assert.equal(r.priority, "critical");
  assert.ok(r.reasons.some((x) => /medical/i.test(x)));
});

test("deep water with vulnerable people is critical", () => {
  assert.equal(triage({ people: 5, water: "first_floor", elderly: 1, needs: [] }).priority, "critical");
});

test("a pregnant woman in waist-deep water is critical", () => {
  assert.equal(triage({ people: 3, water: "waist", pregnant: 1, needs: [] }).priority, "critical");
});

test("an explicit rescue request without danger signs is high", () => {
  assert.equal(triage({ people: 2, water: "knee", needs: ["rescue"] }).priority, "high");
});

test("relief-only needs are medium and calm reports are low", () => {
  assert.equal(triage({ people: 4, water: "knee", needs: ["food", "water"] }).priority, "medium");
  assert.equal(triage({ people: 1, water: "ankle", needs: ["power"] }).priority, "low");
});

test("more people and more vulnerability raise the score within a priority", () => {
  const small = triage({ people: 1, water: "chest", needs: [] });
  const big = triage({ people: 8, water: "chest", needs: [] });
  assert.equal(small.priority, big.priority);
  assert.ok(big.score > small.score);
});

test("every decision carries a human-readable reason", () => {
  for (const i of [{ water: "roof", children: 2 }, { needs: ["food"] }, {}]) {
    assert.ok(triage({ people: 1, needs: [], ...i }).reasons.length > 0);
  }
});

test("towns across AP and Telangana are recognised", () => {
  assert.equal(findPlace("Guntur city"), "Guntur");
  assert.equal(findPlace("near VVIT college"), "Nambur");
  assert.equal(findPlace("Vizag"), "Visakhapatnam");
  assert.equal(findPlace("somewhere unknown"), null);
});

test("Vijayawada localities match regardless of spacing or case", () => {
  assert.equal(matchArea("singh nagar"), "Singh Nagar");
  assert.equal(matchArea("PAYAKAPURAM"), "Payakapuram");
  assert.equal(matchArea("Atlantis"), null);
});

test("distance helper is sane", () => {
  assert.equal(km([16.5, 80.6], [16.5, 80.6]), 0);
  const d = km([16.3067, 80.4365], [16.5062, 80.648]); // Guntur → Vijayawada ≈ 31 km
  assert.ok(d > 25 && d < 40, `got ${d}`);
});

test("summary reads like a dispatcher note", () => {
  const s = summarize({ people: 5, area: "Singh Nagar", landmark: "Ramalayam", water: "first_floor", elderly: 1, medical: ["insulin"], needs: ["rescue"] });
  assert.match(s, /5 people at Singh Nagar \(Ramalayam\)/);
  assert.match(s, /first floor/);
  assert.match(s, /insulin/);
});
