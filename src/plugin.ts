import { ALARM_STATE, Path, Plugin, ServerAPI } from "@signalk/server-api";
import { clearSendTestMessage, configSchema, configUiSchema, defaultConfig, PluginConfig } from "./config";
import { TeltonikaClient } from "./teltonika/client";
import { RateLimiter } from "./rateLimiter";
import { SmsSender } from "./smsSender";
import { NotificationTracker } from "./notificationTracker";
import { loadCachedModemIds, saveCachedModemIds } from "./modemCache";

const NOTIFICATIONS_PREFIX = "notifications.";

function stripNotificationsPrefix(path: string): string {
  return path.startsWith(NOTIFICATIONS_PREFIX) ? path.slice(NOTIFICATIONS_PREFIX.length) : path;
}

function isNotificationValue(value: unknown): value is { state: ALARM_STATE; message?: string } {
  return typeof value === "object" && value !== null && "state" in value;
}

export function createPlugin(app: ServerAPI): Plugin {
  let cachedModemIds = loadCachedModemIds(app);
  let unsubscribe: (() => void) | undefined;

  async function refreshModemIds(client: TeltonikaClient, refresh: boolean): Promise<void> {
    try {
      cachedModemIds = await client.getModemIds({ refresh });
      saveCachedModemIds(app, cachedModemIds);
    } catch (err) {
      app.error(`failed to fetch modem list: ${(err as Error).message}`);
    }
  }

  const plugin: Plugin = {
    id: "signalk-teltonika-sms-plugin",
    name: "Teltonika SMS Notifications",
    description: "Relays SignalK notifications as SMS via a Teltonika router's RUTOS API",
    schema: () => configSchema(cachedModemIds),
    uiSchema: () => configUiSchema(),

    start(config: object) {
      const pluginConfig: PluginConfig = { ...defaultConfig(), ...(config as Partial<PluginConfig>) };

      const client = new TeltonikaClient({
        baseUrl: pluginConfig.routerBaseUrl,
        username: pluginConfig.username,
        password: pluginConfig.password,
        allowSelfSignedCert: pluginConfig.allowSelfSignedCert,
      });
      const rateLimiter = new RateLimiter(pluginConfig.rateLimit);
      const sender = new SmsSender(
        client,
        rateLimiter,
        {
          modemId: pluginConfig.modemId,
          recipients: pluginConfig.recipients,
          retryCount: pluginConfig.retryCount,
          retryPauseSeconds: pluginConfig.retryPauseSeconds,
        },
        { debug: (message) => app.debug(message), error: (message) => app.error(message) },
      );
      const tracker = new NotificationTracker();

      void refreshModemIds(client, pluginConfig.refreshModemsOnStart || cachedModemIds.length === 0);

      // Seed from current notification state without sending anything - a plugin restart
      // shouldn't re-text for an alarm that's still active and was already texted about.
      for (const { context, path, value } of Object.values(app.notifications.list())) {
        if (context !== app.selfContext || !isNotificationValue(value)) continue;
        tracker.seed(stripNotificationsPrefix(path), value.state);
      }

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

      app.setPluginStatus(`Relaying notifications to ${pluginConfig.recipients.length} recipient(s) via modem "${pluginConfig.modemId}"`);

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
    },

    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
      app.debug("stopped");
    },
  };

  return plugin;
}
