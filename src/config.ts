import { ALARM_STATE, ServerAPI } from "@signalk/server-api";
import { E164_PATTERN } from "./phoneNumber";
import { modemLabel } from "./modemSelection";
import { ModemStatusEntry } from "./teltonika/types";
import { OverLengthBehavior } from "./messageFormat";

export interface RateLimitConfig {
  maxMessages: number;
  windowMinutes: number;
  bypassPriority: ALARM_STATE;
}

export interface PluginConfig {
  routerBaseUrl: string;
  /** RutOS's HTTPS admin/API listener uses a self-signed certificate by default - see `teltonika/client.ts`'s `INSECURE_AGENT`. Turn off only once the router has a certificate the local network actually trusts. */
  allowSelfSignedCert: boolean;
  username: string;
  password: string;
  /**
   * One of the router's `modem_id` values, from `GET /api/messages/storage/status` - see
   * `teltonika/client.ts`. Populated as a dropdown once at least one successful fetch/refresh has
   * happened. Auto-picked and saved back here on plugin start whenever left blank - see
   * `chooseDefaultModemId` in `modemSelection.ts` and its call site in `plugin.ts` - so the field
   * doesn't sit empty just because the router wasn't reachable yet the first time the config form
   * was opened (before any credentials were entered and saved).
   */
  modemId: string;
  /** Refetch the modem id list from the router on plugin start, instead of relying on the cache written by a previous fetch/refresh. */
  refreshModemsOnStart: boolean;
  recipients: string[];
  minPriority: ALARM_STATE;
  includePatterns: string[];
  excludePatterns: string[];
  notifyOnClear: boolean;
  /** Prepends the notification's alarm state, upper-cased (e.g. "[ALARM]"), to the message text - see `formatNotificationText` in `messageFormat.ts`. */
  includeStatePrefix: boolean;
  /** SMS messages have a hard length limit - texts longer than this are handled per `overLengthBehavior` below. See `applyLengthLimit` in `messageFormat.ts`. */
  smsMaxLength: number;
  /** "truncate" cuts an over-length message to one text; "split" sends it as multiple texts, each suffixed " ... {n}/{total}". */
  overLengthBehavior: OverLengthBehavior;
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
    includeStatePrefix: true,
    smsMaxLength: 160,
    overLengthBehavior: "split",
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

/**
 * Persists an auto-picked `modemId` (see `chooseDefaultModemId` in `./modemSelection.ts`) back to
 * disk, same read-modify-write shape as `clearSendTestMessage` above - so the admin UI shows the
 * picked modem on its next load instead of an empty field, and so this only runs once rather than
 * re-picking (and potentially re-saving a different modem, e.g. after a SIM swap) on every start.
 * Awaited (unlike `clearSendTestMessage`) so callers can rely on the write having landed before
 * reading the config again later in the same startup sequence.
 */
export function persistModemId(app: ServerAPI, modemId: string): Promise<void> {
  const current = { ...defaultConfig(), ...readCurrentConfig(app) };
  return new Promise((resolve) => {
    app.savePluginOptions({ ...current, modemId }, (err) => {
      if (err) app.debug(`failed to persist auto-selected modemId: ${err.message}`);
      resolve();
    });
  });
}

/**
 * A fresh array per call, deliberately - `minPriority` and `rateLimit.bypassPriority` below both
 * need this same enum list, but the schema is serialized to JSON for storage, and a shared array
 * *reference* used in two places in the object tree reads as a circular reference to a
 * flat-visited-set cycle checker (CI's `schema check`) even though it isn't actually one.
 */
function priorityValues(): ALARM_STATE[] {
  return [ALARM_STATE.nominal, ALARM_STATE.normal, ALARM_STATE.alert, ALARM_STATE.warn, ALARM_STATE.alarm, ALARM_STATE.emergency];
}

export function configSchema(modems: ModemStatusEntry[] = []): object {
  const defaults = defaultConfig();

  return {
    type: "object",
    required: ["routerBaseUrl", "username", "password"],
    properties: {
      routerBaseUrl: {
        type: "string",
        title: "Router base URL",
        description:
          "e.g. \"https://192.168.1.1\" - the RutOS router's local address. Defaults to https, matching the router's own default " +
          'HTTPS-enabled admin/API listener - switch to a plain "http://..." URL only if that listener is disabled on your router.',
        default: defaults.routerBaseUrl,
      },
      allowSelfSignedCert: {
        type: "boolean",
        title: "Allow the router's self-signed HTTPS certificate (RutOS's default - leave on unless you've replaced it)",
        description:
          "RutOS ships a self-signed certificate out of the box - leave this on unless you've replaced it with one your network trusts. Has no effect over a plain http:// URL.",
        default: defaults.allowSelfSignedCert,
      },
      username: {
        type: "string",
        title: "Username",
        description: "Preferably a non-root RutOS user with ACL access to the messages API - see the README for how to create one.",
      },
      password: { type: "string", title: "Password" },
      modemId: {
        type: "string",
        title: "SMS modem",
        description:
          "Id like `1-1`, shown with its modem type in brackets below once known. Auto-picked on plugin start if left blank - the " +
          "only modem if there's just one, otherwise the first (alphabetically) with a SIM inserted. Refreshed from the router's " +
          'API - tick "Refresh modem list on start" below if this is empty or stale.',
        ...(modems.length > 0 ? { enum: modems.map((modem) => modem.modem_id), enumNames: modems.map(modemLabel) } : {}),
      },
      refreshModemsOnStart: {
        type: "boolean",
        title: "Refresh modem list on start (instead of using the cached list)",
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
        enum: priorityValues(),
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
        title: "Also notify when an alarm clears (even below Minimum priority)",
        description:
          'Sends a text when a notification that previously matched drops back to "normal"/"nominal", even though that state alone is below "Minimum priority".',
        default: defaults.notifyOnClear,
      },
      includeStatePrefix: {
        type: "boolean",
        title: 'Prefix the message with the alarm state, upper-cased (e.g. "[ALARM]")',
        default: defaults.includeStatePrefix,
      },
      smsMaxLength: {
        type: "number",
        title: "SMS length limit (characters)",
        description:
          'A single GSM SMS holds 160 characters - messages longer than this are handled per "Over-length message handling" below.',
        minimum: 20,
        default: defaults.smsMaxLength,
      },
      overLengthBehavior: {
        type: "string",
        title: "Over-length message handling",
        description:
          '"Truncate" cuts the message to fit one text, ending it with "...". "Split" sends it as multiple texts, each suffixed ' +
          '" ... {n}/{total}" (e.g. "... 1/4") so the recipient can tell more parts follow.',
        enum: ["truncate", "split"],
        enumNames: ["Truncate", "Split into multiple messages"],
        default: defaults.overLengthBehavior,
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
            enum: priorityValues(),
            default: defaults.rateLimit.bypassPriority,
          },
        },
      },
      sendTestMessage: {
        type: "boolean",
        title: "Send a confirmation test message to every recipient on next start",
        description:
          "Tick and save to send every recipient above a test SMS on next start, proving the router/credentials/modem work end to end, bypassing the Notification API. Clears itself once that send succeeds.",
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
