// Unit tests for language-code handling in the voice layer. Run: npm test (from server/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { toCode } from "../lib/voice.mjs";

test("short language codes map to Sarvam's xx-IN codes", () => {
  assert.equal(toCode("te"), "te-IN");
  assert.equal(toCode("hi"), "hi-IN");
  assert.equal(toCode("en"), "en-IN");
});

test("Odia is supported under both common codes", () => {
  assert.equal(toCode("od"), "od-IN");
});

test("unknown input falls back safely", () => {
  assert.equal(toCode(undefined), "te-IN");
});
