import { test } from "node:test";
import assert from "node:assert/strict";
import { ALARM_STATE } from "@signalk/server-api";
import { SmsSender } from "./smsSender";
import { RateLimiter } from "./rateLimiter";
import { TeltonikaClient } from "./teltonika/client";

function fakeLogger() {
  const debug: string[] = [];
  const error: string[] = [];
  return { debug: (m: string) => debug.push(m), error: (m: string) => error.push(m), debug$: debug, error$: error };
}

function fakeClient(sendSms: (modemId: string, number: string, message: string) => Promise<void>): TeltonikaClient {
  return { sendSms } as unknown as TeltonikaClient;
}

function noSleep(): Promise<void> {
  return Promise.resolve();
}

test("sends to every recipient and reports overall success", async () => {
  const sent: [string, string, string][] = [];
  const client = fakeClient(async (modemId, number, message) => {
    sent.push([modemId, number, message]);
  });
  const rateLimiter = new RateLimiter({ maxMessages: 10, windowMinutes: 60, bypassPriority: ALARM_STATE.alarm });
  const logger = fakeLogger();
  const sender = new SmsSender(
    client,
    rateLimiter,
    { modemId: "1-1", recipients: ["+447123456789", "+447987654321"], retryCount: 3, retryPauseSeconds: 1 },
    logger,
    noSleep,
  );

  const ok = await sender.enqueue({ priority: ALARM_STATE.alert, text: "hi", label: "test" });
  assert.equal(ok, true);
  assert.deepEqual(sent, [
    ["1-1", "+447123456789", "hi"],
    ["1-1", "+447987654321", "hi"],
  ]);
});

test("drops the job when the rate limiter blocks it, without calling sendSms", async () => {
  let calls = 0;
  const client = fakeClient(async () => {
    calls++;
  });
  const rateLimiter = new RateLimiter({ maxMessages: 0, windowMinutes: 60, bypassPriority: ALARM_STATE.alarm });
  const logger = fakeLogger();
  const sender = new SmsSender(
    client,
    rateLimiter,
    { modemId: "1-1", recipients: ["+447123456789"], retryCount: 3, retryPauseSeconds: 1 },
    logger,
    noSleep,
  );

  const ok = await sender.enqueue({ priority: ALARM_STATE.alert, text: "hi", label: "test" });
  assert.equal(ok, false);
  assert.equal(calls, 0);
  assert.ok(logger.error$.some((m) => m.includes("rate limit")));
});

test("retries a failing send up to retryCount attempts, then gives up and reports failure", async () => {
  let attempts = 0;
  const client = fakeClient(async () => {
    attempts++;
    throw new Error("network blip");
  });
  const rateLimiter = new RateLimiter({ maxMessages: 10, windowMinutes: 60, bypassPriority: ALARM_STATE.alarm });
  const logger = fakeLogger();
  const sender = new SmsSender(
    client,
    rateLimiter,
    { modemId: "1-1", recipients: ["+447123456789"], retryCount: 3, retryPauseSeconds: 1 },
    logger,
    noSleep,
  );

  const ok = await sender.enqueue({ priority: ALARM_STATE.alert, text: "hi", label: "test" });
  assert.equal(ok, false);
  assert.equal(attempts, 3);
});

test("succeeds on a later retry attempt without exhausting retryCount", async () => {
  let attempts = 0;
  const client = fakeClient(async () => {
    attempts++;
    if (attempts < 2) throw new Error("transient");
  });
  const rateLimiter = new RateLimiter({ maxMessages: 10, windowMinutes: 60, bypassPriority: ALARM_STATE.alarm });
  const logger = fakeLogger();
  const sender = new SmsSender(
    client,
    rateLimiter,
    { modemId: "1-1", recipients: ["+447123456789"], retryCount: 3, retryPauseSeconds: 1 },
    logger,
    noSleep,
  );

  const ok = await sender.enqueue({ priority: ALARM_STATE.alert, text: "hi", label: "test" });
  assert.equal(ok, true);
  assert.equal(attempts, 2);
});

test("skips a locally-formatted recipient number without calling sendSms for it", async () => {
  const sentTo: string[] = [];
  const client = fakeClient(async (_modemId, number) => {
    sentTo.push(number);
  });
  const rateLimiter = new RateLimiter({ maxMessages: 10, windowMinutes: 60, bypassPriority: ALARM_STATE.alarm });
  const logger = fakeLogger();
  const sender = new SmsSender(
    client,
    rateLimiter,
    { modemId: "1-1", recipients: ["07123456789", "+447987654321"], retryCount: 1, retryPauseSeconds: 1 },
    logger,
    noSleep,
  );

  const ok = await sender.enqueue({ priority: ALARM_STATE.alert, text: "hi", label: "test" });
  assert.equal(ok, false);
  assert.deepEqual(sentTo, ["+447987654321"]);
});

test("processes enqueued jobs sequentially, in order", async () => {
  const order: string[] = [];
  const client = fakeClient(async (_modemId, _number, message) => {
    await new Promise((resolve) => setTimeout(resolve, message === "first" ? 20 : 0));
    order.push(message);
  });
  const rateLimiter = new RateLimiter({ maxMessages: 10, windowMinutes: 60, bypassPriority: ALARM_STATE.alarm });
  const logger = fakeLogger();
  const sender = new SmsSender(
    client,
    rateLimiter,
    { modemId: "1-1", recipients: ["+447123456789"], retryCount: 1, retryPauseSeconds: 1 },
    logger,
    noSleep,
  );

  const first = sender.enqueue({ priority: ALARM_STATE.alert, text: "first", label: "a" });
  const second = sender.enqueue({ priority: ALARM_STATE.alert, text: "second", label: "b" });
  await Promise.all([first, second]);
  assert.deepEqual(order, ["first", "second"]);
});
