import { test } from "node:test";
import assert from "node:assert/strict";
import { ALARM_STATE } from "@signalk/server-api";
import { matchesFilter, priorityAtLeast, priorityRank } from "./filter";

test("priorityRank orders the ALARM_STATE ladder low to high", () => {
  assert.ok(priorityRank(ALARM_STATE.nominal) < priorityRank(ALARM_STATE.normal));
  assert.ok(priorityRank(ALARM_STATE.normal) < priorityRank(ALARM_STATE.alert));
  assert.ok(priorityRank(ALARM_STATE.alert) < priorityRank(ALARM_STATE.warn));
  assert.ok(priorityRank(ALARM_STATE.warn) < priorityRank(ALARM_STATE.alarm));
  assert.ok(priorityRank(ALARM_STATE.alarm) < priorityRank(ALARM_STATE.emergency));
});

test("priorityAtLeast compares against a threshold inclusively", () => {
  assert.equal(priorityAtLeast(ALARM_STATE.alert, ALARM_STATE.alert), true);
  assert.equal(priorityAtLeast(ALARM_STATE.warn, ALARM_STATE.alert), true);
  assert.equal(priorityAtLeast(ALARM_STATE.normal, ALARM_STATE.alert), false);
});

test("matchesFilter rejects below minPriority regardless of patterns", () => {
  const matched = matchesFilter("navigation.anchor.maxRadius", ALARM_STATE.normal, {
    minPriority: ALARM_STATE.alert,
    includePatterns: [],
    excludePatterns: [],
  });
  assert.equal(matched, false);
});

test("matchesFilter with empty include list matches every path at/above priority", () => {
  const matched = matchesFilter("navigation.anchor.maxRadius", ALARM_STATE.alarm, {
    minPriority: ALARM_STATE.alert,
    includePatterns: [],
    excludePatterns: [],
  });
  assert.equal(matched, true);
});

test("matchesFilter requires at least one include pattern to match when the list is non-empty", () => {
  const config = { minPriority: ALARM_STATE.nominal, includePatterns: ["^navigation\\.anchor\\."], excludePatterns: [] };
  assert.equal(matchesFilter("navigation.anchor.maxRadius", ALARM_STATE.alarm, config), true);
  assert.equal(matchesFilter("propulsion.port.temperature", ALARM_STATE.alarm, config), false);
});

test("matchesFilter exclude overrides a matching include", () => {
  const config = {
    minPriority: ALARM_STATE.nominal,
    includePatterns: ["^navigation\\."],
    excludePatterns: ["^navigation\\.anchor\\."],
  };
  assert.equal(matchesFilter("navigation.speedOverGround", ALARM_STATE.alarm, config), true);
  assert.equal(matchesFilter("navigation.anchor.maxRadius", ALARM_STATE.alarm, config), false);
});
