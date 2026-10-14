// Unit tests for Scam Shield's rule engine (runs without any AI key). Run: npm test (from server/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { runRules } from "../modules/scam.mjs";

const SCAMS = {
  digital_arrest: "This is CBI officer. You are under digital arrest for money laundering. Stay on video call and transfer Rs 50,000 immediately.",
  kyc: "Dear customer your SBI account will be blocked today. Update your KYC immediately at http://bit.ly/sbi-kyc-update",
  electricity: "Your electricity will be disconnected tonight at 9.30pm as your last bill was not updated. Call officer 9876543210 immediately.",
  otp_request: "Share the OTP you just received to claim your refund, otherwise the amount will be cancelled.",
};

for (const [name, text] of Object.entries(SCAMS)) {
  test(`flags a ${name} scam`, () => {
    const r = runRules(text);
    assert.notEqual(r.verdict, "safe", `${name} was marked safe`);
    assert.ok(r.flags.length > 0, "no red flags explained");
    assert.ok(r.confidence > 0 && r.confidence <= 100);
  });
}

test("a genuine OTP the user requested is not a scam", () => {
  const r = runRules("Your OTP for login to the SBI YONO app is 482913. Do not share it with anyone. -SBI");
  assert.notEqual(r.verdict, "scam");
});

test("an ordinary personal message is safe", () => {
  const r = runRules("Hi, reaching home by 7 pm. Shall I bring vegetables on the way?");
  assert.equal(r.verdict, "safe");
});

test("every red flag is explained in Telugu and English", () => {
  const r = runRules(SCAMS.digital_arrest);
  for (const f of r.flags) {
    assert.ok(f.en && f.en.length > 3, "missing English explanation");
    assert.ok(f.te && f.te.length > 3, "missing Telugu explanation");
  }
});
