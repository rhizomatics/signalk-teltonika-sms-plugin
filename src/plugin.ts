import { ALARM_STATE, Path, Plugin, ServerAPI } from "@signalk/server-api";
import { clearSendTestMessage, configSchema, configUiSchema, defaultConfig, persistModemId, PluginConfig } from "./config";
import { TeltonikaClient } from "./teltonika/client";
import { RateLimiter } from "./rateLimiter";
import { SmsSender } from "./smsSender";
import { NotificationTracker } from "./notificationTracker";
import { loadCachedModemStatus, saveCachedModemStatus } from "./modemCache";
import { chooseDefaultModemId } from "./modemSelection";

const NOTIFICATIONS_PREFIX = "notifications.";

function stripNotificationsPrefix(path: string): string {
  return path.startsWith(NOTIFICATIONS_PREFIX) ? path.slice(NOTIFICATIONS_PREFIX.length) : path;
}

function isNotificationValue(value: unknown): value is { state: ALARM_STATE; message?: string } {
  return typeof value === "object" && value !== null && "state" in value;
}

export function createPlugin(app: ServerAPI): Plugin {
  let cachedModemStatus = loadCachedModemStatus(app);
  let unsubscribe: (() => void) | undefined;
  let activeSender: SmsSender | undefined;

  /**
   * Fetches modem status (only when needed - see `needsFetch` below, so "Refresh modem list on
   * start" actually gates a live call rather than firing on every start), then resolves an
   * effective `modemId`: the configured one if set, otherwise auto-picked via
   * `chooseDefaultModemId` and persisted back to config so the admin UI reflects it on next load
   * (see `persistModemId`'s doc comment) - this is what removes the "empty dropdown until you've
   * already saved once" awkwardness the config field otherwise has.
   */
  async function resolveModemId(client: TeltonikaClient, pluginConfig: PluginConfig): Promise<string> {
    const needsFetch = pluginConfig.refreshModemsOnStart || cachedModemStatus.length === 0;
    if (needsFetch) {
      try {
        cachedModemStatus = await client.getModemStatus({ refresh: true });
        saveCachedModemStatus(app, cachedModemStatus);
      } catch (err) {
        app.error(`failed to fetch modem status: ${(err as Error).message}`);
      }
    }
    if (pluginConfig.modemId) {
      return pluginConfig.modemId;
    }
    const picked = chooseDefaultModemId(cachedModemStatus);
    if (!picked) {
      return "";
    }
    app.debug(`auto-selected SMS modem "${picked}" (none configured, ${cachedModemStatus.length} known)`);
    await persistModemId(app, picked);
    return picked;
  }

  async function beginRelay(client: TeltonikaClient, pluginConfig: PluginConfig): Promise<void> {
    const modemId = await resolveModemId(client, pluginConfig);

    const rateLimiter = new RateLimiter(pluginConfig.rateLimit);
    const sender = new SmsSender(
      client,
      rateLimiter,
      {
        modemId,
        recipients: pluginConfig.recipients,
        retryCount: pluginConfig.retryCount,
        retryPauseSeconds: pluginConfig.retryPauseSeconds,
      },
      { debug: (message) => app.debug(message), error: (message) => app.error(message) },
    );
    // A prior instance's `stop()` may not have run yet (or at all, on some restart paths) by the
    // time this new instance is ready - stopping it here too ensures a restart never leaves two
    // `SmsSender`s live at once, see `SmsSender.stop()`'s own doc comment for why that matters.
    activeSender?.stop();
    activeSender = sender;
    const tracker = new NotificationTracker();

    // Seed from current notification state without sending anything - a plugin restart
    // shouldn't re-text for an alarm that's still active and was already texted about.
    for (const { context, path, value } of Object.values(app.notifications.list())) {
      if (context !== app.selfContext || !isNotificationValue(value)) continue;
      tracker.seed(stripNotificationsPrefix(path), value.state);
    }

    unsubscribe?.();
    unsubscribe = app.streambundle.getSelfBus(`${NOTIFICATIONS_PREFIX}*` as Path).onValue((delta) => {
      if (!isNotificationValue(delta.value)) return;
      const path = stripNotificationsPrefix(delta.path);
      const state = delta.value.state;
      const shouldNotify = tracker.considerNotification(path, state, {
        minPriority: pluginConfig.minPriority,
        includePatterns: pluginConfig.includePatterns,
        excludePatterns: pluginConfig.excludePatterns,
        notifyOnClear: pluginConfig.notifyOnClear,
      });
      if (!shouldNotify) return;
      const text = `[${state}] ${path}: ${delta.value.message ?? ""}`.trim();
      void sender.enqueue({ priority: state, text, label: path });
    });

    app.setPluginStatus(`Relaying notifications to ${pluginConfig.recipients.length} recipient(s) via modem "${modemId}"`);

    if (pluginConfig.sendTestMessage) {
      app.setPluginStatus("Sending confirmation test message...");
      void sender
        .enqueue({
          priority: ALARM_STATE.emergency,
          text: "SignalK Teltonika SMS plugin: this is a confirmation test message - your setup works.",
          label: "confirmation test message",
        })
        .then((ok) => {
          if (ok) {
            clearSendTestMessage(app);
            app.setPluginStatus(`Test message sent - relaying notifications to ${pluginConfig.recipients.length} recipient(s)`);
          } else {
            app.setPluginStatus("Test message failed to send - check router/credentials/modem/recipients and see the plugin log");
          }
        });
    }
  }

  const plugin: Plugin = {
    id: "signalk-teltonika-sms-plugin",
    name: "Teltonika SMS Notifications",
    description: "Relays SignalK notifications as SMS via a Teltonika router's RUTOS API",
    schema: () => configSchema(cachedModemStatus),
    uiSchema: () => configUiSchema(),

    start(config: object) {
      const pluginConfig: PluginConfig = { ...defaultConfig(), ...(config as Partial<PluginConfig>) };
      const client = new TeltonikaClient({
        baseUrl: pluginConfig.routerBaseUrl,
        username: pluginConfig.username,
        password: pluginConfig.password,
        allowSelfSignedCert: pluginConfig.allowSelfSignedCert,
      });
      void beginRelay(client, pluginConfig);
    },

    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
      activeSender?.stop();
      activeSender = undefined;
      app.debug("stopped");
    },
  };

  return plugin;
}
