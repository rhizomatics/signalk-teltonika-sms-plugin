import { ALARM_STATE } from "@signalk/server-api";

export type OverLengthBehavior = "truncate" | "split";

/** Builds the notification text before any length limiting - `includeStatePrefix` prepends the alarm state, upper-cased, e.g. "[ALARM] navigation.anchor.maxRadius: dragging". */
export function formatNotificationText(state: ALARM_STATE, path: string, message: string, includeStatePrefix: boolean): string {
  const prefix = includeStatePrefix ? `[${state.toUpperCase()}] ` : "";
  return `${prefix}${path}: ${message}`.trim();
}

/**
 * Fits `text` within `maxLength` per the chosen behavior: "truncate" cuts it to one message
 * (with a trailing "..." if anything was cut), "split" breaks it across multiple messages, each
 * suffixed with " ... {n}/{total}" so the recipient can tell a part is missing and how many
 * follow. Returns the original text unsplit when it already fits.
 */
export function applyLengthLimit(text: string, maxLength: number, behavior: OverLengthBehavior): string[] {
  if (text.length <= maxLength) {
    return [text];
  }
  return behavior === "truncate" ? [truncate(text, maxLength)] : split(text, maxLength);
}

function truncate(text: string, maxLength: number): string {
  if (maxLength <= 3) {
    return text.slice(0, maxLength);
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

function partSuffix(part: number, total: number): string {
  return ` ... ${part}/${total}`;
}

/**
 * The suffix's own width depends on `total` (more parts => more digits), which in turn depends
 * on how much of `maxLength` the suffix leaves for content - so this settles both by fixed-point
 * iteration, sized against the widest suffix for that `total` (i.e. as if every part number had
 * as many digits as `total` itself) so no individual part can end up over `maxLength`.
 */
function split(text: string, maxLength: number): string[] {
  let total = 2;
  for (let i = 0; i < 10; i++) {
    const budget = Math.max(1, maxLength - partSuffix(total, total).length);
    const next = Math.ceil(text.length / budget);
    if (next === total) break;
    total = next;
  }
  const budget = Math.max(1, maxLength - partSuffix(total, total).length);
  const parts: string[] = [];
  for (let i = 0; i < total; i++) {
    parts.push(`${text.slice(i * budget, (i + 1) * budget)}${partSuffix(i + 1, total)}`);
  }
  return parts;
}
