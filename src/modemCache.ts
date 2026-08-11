import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ServerAPI } from "@signalk/server-api";
import { ModemStatusEntry } from "./teltonika/types";

/**
 * Persists the last-fetched modem status list to disk (under the plugin's own data dir) so the
 * config schema's "SMS modem" dropdown has options to show on a restart without needing a live,
 * authenticated call to the router just to render the config form - `schema()` must return
 * synchronously, so a live fetch there isn't an option anyway.
 */
function cacheFilePath(app: ServerAPI): string {
  return join(app.getDataDirPath(), "modem-status.json");
}

function isModemStatusEntry(value: unknown): value is ModemStatusEntry {
  return typeof value === "object" && value !== null && typeof (value as { modem_id?: unknown }).modem_id === "string";
}

export function loadCachedModemStatus(app: ServerAPI): ModemStatusEntry[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(cacheFilePath(app), "utf-8"));
    return Array.isArray(parsed) ? parsed.filter(isModemStatusEntry) : [];
  } catch {
    return [];
  }
}

export function saveCachedModemStatus(app: ServerAPI, modemStatus: ModemStatusEntry[]): void {
  try {
    writeFileSync(cacheFilePath(app), JSON.stringify(modemStatus));
  } catch (err) {
    app.debug(`failed to persist modem status cache: ${(err as Error).message}`);
  }
}
