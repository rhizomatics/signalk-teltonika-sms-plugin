import { ALARM_STATE, ServerAPI } from "@signalk/server-api";
import { E164_PATTERN } from "./phoneNumber";

export interface RateLimitConfig {
  maxMessages: number;
  windowMinutes: number;
  bypassPriority: ALARM_STATE;
}

export interface PluginConfig {
  routerBaseUrl: string;
  /** RUTOS's HTTPS admin/API listener uses a self-signed certificate by default - see `teltonika/client.ts`'s `INSECURE_AGENT`. Turn off only once the router has a certificate the local network actually trusts. */
  allowSelfSignedCert: boolean;
  username: string;
  password: string;
  /** One of the router's `modem_id` values, from `GET /api/messages/storage/config` - see `teltonika/client.ts`. Populated as a dropdown once at least one successful fetch/refresh has happened. */
  modemId: string;
  /** Refetch the modem id list from the router on plugin start, instead of relying on the cache written by a previous fetch/refresh. */
  refreshModemsOnStart: boolean;
  recipients: string[];
  minPriority: ALARM_STATE;
  includePatterns: string[];
  excludePatterns: string[];
  notifyOnClear: boolean;
  retryCount: number;
  retryPauseSeconds: number;
  rateLimit: RateLimitConfig;
  /**
   * One-shot: set true (from the admin config form) to send every configured recipient a
   * confirmation SMS on the next plugin start/config save, proving the router/credentials/modem
   * selection actually work end to end. Clears itself back to `false` once that send succeeds -
   * mirrors signalk-einklabel-plugin's `DeviceConfig.forceRepaint` convention - see
   * `clearSendTestMessage` below and its call site in `plugin.ts`.
   */
  sendTestMessage: boolean;
}

export function defaultConfig(): PluginConfig {
  return {
    routerBaseUrl: "https://192.168.1.1",
    allowSelfSignedCert: true,
    username: "",
    password: "",
    modemId: "",
    refreshModemsOnStart: false,
    recipients: [],
    minPriority: ALARM_STATE.alert,
    includePatterns: [],
    excludePatterns: [],
    notifyOnClear: true,
    retryCount: 3,
    retryPauseSeconds: 30,
    rateLimit: {
      maxMessages: 10,
      windowMinutes: 60,
      bypassPriority: ALARM_STATE.alarm,
    },
    sendTestMessage: false,
  };
}

export function readCurrentConfig(app: ServerAPI): Partial<PluginConfig> {
  const raw = app.readPluginOptions() as unknown as { configuration?: Partial<PluginConfig> } | undefined;
  return raw?.configuration ?? {};
}

/**
 * Clears `sendTestMessage` back to `false` once the confirmation SMS it requested has actually
 * sent - re-reads current on-disk config and spreads the whole shape back with just that one
 * field patched, so unrelated fields (credentials, filters, rate limit...) round-trip unchanged.
 * Mirrors `clearForceRepaint` in signalk-einklabel-plugin's `repaintScheduler.ts`.
 */
export function clearSendTestMessage(app: ServerAPI): void {
  const current = { ...defaultConfig(), ...readCurrentConfig(app) };
  app.savePluginOptions({ ...current, sendTestMessage: false }, (err) => {
    if (err) app.debug(`failed to clear sendTestMessage after a successful test send: ${err.message}`);
  });
}

const PRIORITY_VALUES = [
  ALARM_STATE.nominal,
  ALARM_STATE.normal,
  ALARM_STATE.alert,
  ALARM_STATE.warn,
  ALARM_STATE.alarm,
  ALARM_STATE.emergency,
];

export function configSchema(modemIds: string[] = []): object {
  const defaults = defaultConfig();

  return {
    type: "object",
    required: ["routerBaseUrl", "username", "password", "modemId"],
    properties: {
      routerBaseUrl: {
        type: "string",
        title: "Router base URL",
        description:
          "e.g. \"https://192.168.1.1\" - the RUTOS router's local address. Defaults to https, matching the router's own default " +
          'HTTPS-enabled admin/API listener - switch to a plain "http://..." URL only if that listener is disabled on your router.',
        default: defaults.routerBaseUrl,
      },
      allowSelfSignedCert: {
        type: "boolean",
        title: "Allow the router's self-signed HTTPS certificate",
        description:
          "RUTOS ships a self-signed certificate out of the box - leave this on unless you've replaced it with one your network trusts. Has no effect over a plain http:// URL.",
        default: defaults.allowSelfSignedCert,
      },
      username: {
        type: "string",
        title: "Username",
        description: "A non-root RUTOS user with ACL access to the messages API - see the README for how to create one.",
      },
      password: { type: "string", title: "Password" },
      modemId: {
        type: "string",
        title: "SMS modem",
        description:
          'Refreshed from the router\'s "/api/messages/storage/config" - tick "Refresh modem list on start" below if this is empty or stale.',
        ...(modemIds.length > 0 ? { enum: modemIds } : {}),
      },
      refreshModemsOnStart: {
        type: "boolean",
        title: "Refresh modem list on start",
        description:
          'Fetches the modem id list from the router on every plugin start, instead of using the last cached list. Also available via "teltonika-sms-cli modems --refresh".',
        default: defaults.refreshModemsOnStart,
      },
      recipients: {
        type: "array",
        title: "Recipient phone numbers",
        description: 'International format with a leading "+" and country code, e.g. "+447123456789" - not a local/national number.',
        items: { type: "string", pattern: E164_PATTERN.source },
      },
      minPriority: {
        type: "string",
        title: "Minimum priority",
        description: "Only notifications at or above this SignalK alarm state are relayed as SMS.",
        enum: PRIORITY_VALUES,
        default: defaults.minPriority,
      },
      includePatterns: {
        type: "array",
        title: "Include path patterns (regex, optional)",
        description:
          'SignalK notification path (e.g. "navigation.anchor.maxRadius") must match at least one of these - leave empty to match every path.',
        items: { type: "string" },
      },
      excludePatterns: {
        type: "array",
        title: "Exclude path patterns (regex, optional)",
        description: "A path matching any of these is never relayed, even if it matches an include pattern above.",
        items: { type: "string" },
      },
      notifyOnClear: {
        type: "boolean",
        title: "Also notify when an alarm clears",
        description:
          'Sends a text when a notification that previously matched drops back to "normal"/"nominal", even though that state alone is below "Minimum priority".',
        default: defaults.notifyOnClear,
      },
      retryCount: {
        type: "number",
        title: "Retry attempts",
        description: "How many times to retry a failed SMS send (including the first attempt) before giving up.",
        minimum: 1,
        default: defaults.retryCount,
      },
      retryPauseSeconds: {
        type: "number",
        title: "Retry pause (seconds)",
        description: "How long to wait between retry attempts.",
        minimum: 1,
        default: defaults.retryPauseSeconds,
      },
      rateLimit: {
        type: "object",
        title: "Rate limit",
        properties: {
          maxMessages: {
            type: "number",
            title: "Max messages per window",
            minimum: 1,
            default: defaults.rateLimit.maxMessages,
          },
          windowMinutes: {
            type: "number",
            title: "Window (minutes)",
            minimum: 1,
            default: defaults.rateLimit.windowMinutes,
          },
          bypassPriority: {
            type: "string",
            title: "Bypass the limit at/above this priority",
            description:
              "A notification at or above this priority always sends, even with the window exhausted - e.g. an anchor-drag emergency shouldn't be silently dropped because earlier chatter used up the quota.",
            enum: PRIORITY_VALUES,
            default: defaults.rateLimit.bypassPriority,
          },
        },
      },
      sendTestMessage: {
        type: "boolean",
        title: "Send a confirmation test message",
        description:
          "Tick and save to send every recipient above a test SMS on next start, proving the router/credentials/modem work end to end. Clears itself once that send succeeds.",
        default: defaults.sendTestMessage,
      },
    },
  };
}

export function configUiSchema(): object {
  return {
    password: { "ui:widget": "password" },
  };
}
