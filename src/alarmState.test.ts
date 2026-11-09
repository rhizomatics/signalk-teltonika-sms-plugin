import { test } from "node:test";
import assert from "node:assert/strict";
import { ALARM_STATE as SK_ALARM_STATE } from "@signalk/server-api";
import { ALARM_STATE } from "./alarmState";

test("ALARM_STATE mirror matches @signalk/server-api", () => {
  assert.deepEqual({ ...ALARM_STATE }, { ...SK_ALARM_STATE });
});
