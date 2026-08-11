import { test } from "node:test";
import assert from "node:assert/strict";
import { ALARM_STATE } from "@signalk/server-api";
import { RateLimiter } from "./rateLimiter";

test("allows up to maxMessages within the window, then blocks", () => {
  const limiter = new RateLimiter({ maxMessages: 2, windowMinutes: 60, bypassPriority: ALARM_STATE.alarm });
  assert.equal(limiter.allow(ALARM_STATE.alert), true);
  assert.equal(limiter.allow(ALARM_STATE.alert), true);
  assert.equal(limiter.allow(ALARM_STATE.alert), false);
});

test("slots free up once the window elapses", () => {
  let now = 0;
  const limiter = new RateLimiter({ maxMessages: 1, windowMinutes: 1, bypassPriority: ALARM_STATE.alarm }, () => now);
  assert.equal(limiter.allow(ALARM_STATE.alert), true);
  assert.equal(limiter.allow(ALARM_STATE.alert), false);
  now += 60_001;
  assert.equal(limiter.allow(ALARM_STATE.alert), true);
});

test("bypassPriority and above always allow, without consuming a slot", () => {
  const limiter = new RateLimiter({ maxMessages: 1, windowMinutes: 60, bypassPriority: ALARM_STATE.alarm });
  assert.equal(limiter.allow(ALARM_STATE.alert), true);
  assert.equal(limiter.allow(ALARM_STATE.alert), false);
  assert.equal(limiter.allow(ALARM_STATE.alarm), true);
  assert.equal(limiter.allow(ALARM_STATE.emergency), true);
});
