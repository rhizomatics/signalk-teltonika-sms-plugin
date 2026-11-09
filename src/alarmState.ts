import type { ALARM_STATE as SK_ALARM_STATE } from "@signalk/server-api";

/**
 * Runtime mirror of the `ALARM_STATE` enum from `@signalk/server-api`.
 *
 * `@signalk/server-api` is a devDependency, so it is not present (or resolvable) when the plugin is
 * installed into a SignalK server. Plugin code must therefore only import *types* from it; any value
 * import compiles to a `require()` that fails at startup with MODULE_NOT_FOUND.
 * `alarmState.test.ts` checks this mirror stays in sync with the real enum.
 */
export const ALARM_STATE = {
  nominal: "nominal",
  normal: "normal",
  alert: "alert",
  warn: "warn",
  alarm: "alarm",
  emergency: "emergency",
} as unknown as typeof SK_ALARM_STATE;

export type ALARM_STATE = SK_ALARM_STATE;
