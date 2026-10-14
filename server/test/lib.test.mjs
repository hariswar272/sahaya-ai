// Unit tests for small shared helpers: language codes, tolerant JSON parsing and the rate limiter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normLang, sarvamCode, languageName } from "../lib/i18n.mjs";
import { parseJSON } from "../lib/ai.mjs";
import { isLimited } from "../lib/ratelimit.mjs";

test("language codes are normalised and unknown ones fall back to English", () => {
  assert.equal(normLang("te-IN"), "te");
  assert.equal(normLang("TE_in"), "te");
  assert.equal(normLang("or"), "od");
  assert.equal(normLang("xx"), "en");
  assert.equal(normLang(null), "en");
  assert.equal(sarvamCode("hi"), "hi-IN");
  assert.equal(languageName("od-IN"), "Odia");
});

test("parseJSON survives think-tags, code fences, prose and trailing commas", () => {
  assert.deepEqual(parseJSON('<think>hmm</think>```json\n{"a":1,}\n```'), { a: 1 });
  assert.deepEqual(parseJSON('Sure! Here it is: {"verdict":"scam"} Hope that helps.'), { verdict: "scam" });
  assert.deepEqual(parseJSON("[1, 2, 3]"), [1, 2, 3]);
  assert.equal(parseJSON("no json here"), null);
  assert.equal(parseJSON("{broken"), null);
  assert.equal(parseJSON(null), null);
});

test("the rate limiter counts per IP and blocks only above the limit", () => {
  const prev = process.env.RATE_LIMIT;
  process.env.RATE_LIMIT = "3";
  try {
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const results = Array.from({ length: 4 }, () => isLimited({ ip }));
    assert.deepEqual(results, [false, false, false, true]);
    assert.equal(isLimited({ ip: "203.0.113.9" }), false, "another IP is unaffected");
  } finally {
    if (prev === undefined) delete process.env.RATE_LIMIT;
    else process.env.RATE_LIMIT = prev;
  }
});

test("a request is only counted once, however often it is checked", () => {
  const prev = process.env.RATE_LIMIT;
  process.env.RATE_LIMIT = "1";
  try {
    const req = { ip: "192.0.2.77" };
    assert.equal(isLimited(req), false);
    assert.equal(isLimited(req), false);
  } finally {
    if (prev === undefined) delete process.env.RATE_LIMIT;
    else process.env.RATE_LIMIT = prev;
  }
});
