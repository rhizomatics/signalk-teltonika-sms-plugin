import { ALARM_STATE } from "@signalk/server-api";

/** ALARM_STATE's severity ladder, lowest first - used to compare a notification's state against `minPriority`. */
const PRIORITY_ORDER: ALARM_STATE[] = [
  ALARM_STATE.nominal,
  ALARM_STATE.normal,
  ALARM_STATE.alert,
  ALARM_STATE.warn,
  ALARM_STATE.alarm,
  ALARM_STATE.emergency,
];

export function priorityRank(state: ALARM_STATE): number {
  const rank = PRIORITY_ORDER.indexOf(state);
  if (rank === -1) {
    throw new Error(`unknown ALARM_STATE "${state}"`);
  }
  return rank;
}

export function priorityAtLeast(state: ALARM_STATE, minPriority: ALARM_STATE): boolean {
  return priorityRank(state) >= priorityRank(minPriority);
}

export interface NotificationFilterConfig {
  minPriority: ALARM_STATE;
  includePatterns: string[];
  excludePatterns: string[];
}

/**
 * Decides whether a notification (identified by its path with the `notifications.` prefix
 * already stripped, e.g. `navigation.anchor.maxRadius`) should be relayed as SMS - `minPriority`,
 * `includePatterns` (empty = match every path) and `excludePatterns` (any match wins over an
 * include match) are ANDed together. "Globally" per the design intent means leaving both pattern
 * lists empty and `minPriority` at its lowest (`nominal`).
 */
export function matchesFilter(path: string, state: ALARM_STATE, config: NotificationFilterConfig): boolean {
  if (!priorityAtLeast(state, config.minPriority)) {
    return false;
  }
  if (config.excludePatterns.some((pattern) => new RegExp(pattern).test(path))) {
    return false;
  }
  if (config.includePatterns.length === 0) {
    return true;
  }
  return config.includePatterns.some((pattern) => new RegExp(pattern).test(path));
}
