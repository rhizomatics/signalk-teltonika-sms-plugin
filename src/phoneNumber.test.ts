import { test } from "node:test";
import assert from "node:assert/strict";
import { isE164PhoneNumber, requireE164PhoneNumber } from "./phoneNumber";

test("accepts international numbers with a leading +", () => {
  assert.equal(isE164PhoneNumber("+447123456789"), true);
  assert.equal(isE164PhoneNumber("+15551234567"), true);
});

test("rejects numbers missing the + prefix, or in local format", () => {
  assert.equal(isE164PhoneNumber("447123456789"), false);
  assert.equal(isE164PhoneNumber("07123456789"), false);
  assert.equal(isE164PhoneNumber("+0123456789"), false);
});

test("requireE164PhoneNumber throws a descriptive error for an invalid number", () => {
  assert.throws(() => requireE164PhoneNumber("07123456789"), /international phone number/);
  assert.doesNotThrow(() => requireE164PhoneNumber("+447123456789"));
});
