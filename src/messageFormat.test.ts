import { test } from "node:test";
import assert from "node:assert/strict";
import { ALARM_STATE } from "@signalk/server-api";
import { applyLengthLimit, formatNotificationText } from "./messageFormat";

test("formatNotificationText prepends the upper-cased state when requested", () => {
  const text = formatNotificationText(ALARM_STATE.alarm, "navigation.anchor.maxRadius", "dragging", true);
  assert.equal(text, "[ALARM] navigation.anchor.maxRadius: dragging");
});

test("formatNotificationText omits the prefix when not requested", () => {
  const text = formatNotificationText(ALARM_STATE.alarm, "navigation.anchor.maxRadius", "dragging", false);
  assert.equal(text, "navigation.anchor.maxRadius: dragging");
});

test("formatNotificationText trims a trailing separator when the message is empty", () => {
  const text = formatNotificationText(ALARM_STATE.alarm, "navigation.anchor.maxRadius", "", false);
  assert.equal(text, "navigation.anchor.maxRadius:");
});

test("applyLengthLimit returns the original text unsplit when it already fits", () => {
  assert.deepEqual(applyLengthLimit("short message", 160, "truncate"), ["short message"]);
  assert.deepEqual(applyLengthLimit("short message", 160, "split"), ["short message"]);
});

test("applyLengthLimit truncate cuts to maxLength with a trailing ellipsis", () => {
  const [result] = applyLengthLimit("a".repeat(50), 20, "truncate");
  assert.equal(result.length, 20);
  assert.equal(result, `${"a".repeat(17)}...`);
});

test("applyLengthLimit truncate with a very small maxLength hard-cuts without an ellipsis", () => {
  const [result] = applyLengthLimit("abcdef", 2, "truncate");
  assert.equal(result, "ab");
});

test("applyLengthLimit split keeps every part within maxLength and numbers them in order", () => {
  const text = "a".repeat(50);
  const parts = applyLengthLimit(text, 20, "split");
  assert.ok(parts.length > 1);
  for (const part of parts) {
    assert.ok(part.length <= 20, `part "${part}" (${part.length} chars) exceeds 20`);
  }
  parts.forEach((part, index) => {
    assert.ok(part.endsWith(` ... ${index + 1}/${parts.length}`), `part "${part}" missing expected suffix`);
  });
});

test("applyLengthLimit split reassembles back to the original content in order", () => {
  const text = Array.from({ length: 60 }, (_, i) => String(i % 10)).join("");
  const parts = applyLengthLimit(text, 25, "split");
  const suffixPattern = / \.\.\. \d+\/\d+$/;
  const reassembled = parts.map((part) => part.replace(suffixPattern, "")).join("");
  assert.equal(reassembled, text);
});

test("applyLengthLimit split handles a part count crossing a digit-width boundary (9 -> 10)", () => {
  const text = "x".repeat(200);
  const parts = applyLengthLimit(text, 25, "split");
  assert.ok(parts.length >= 10, `expected at least 10 parts, got ${parts.length}`);
  for (const part of parts) {
    assert.ok(part.length <= 25, `part "${part}" (${part.length} chars) exceeds 25`);
  }
  assert.ok(parts[parts.length - 1].endsWith(`${parts.length}/${parts.length}`));
});
