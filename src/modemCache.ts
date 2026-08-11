import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ServerAPI } from "@signalk/server-api";

/**
 * Persists the last-fetched modem id list to disk (under the plugin's own data dir) so the
 * config schema's "SMS modem" dropdown has options to show on a restart without needing a live,
 * authenticated call to the router just to render the config form - `schema()` must return
 * synchronously, so a live fetch there isn't an option anyway.
 */
function cacheFilePath(app: ServerAPI): string {
  return join(app.getDataDirPath(), "modem-ids.json");
}

export function loadCachedModemIds(app: ServerAPI): string[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(cacheFilePath(app), "utf-8"));
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveCachedModemIds(app: ServerAPI, modemIds: string[]): void {
  try {
    writeFileSync(cacheFilePath(app), JSON.stringify(modemIds));
  } catch (err) {
    app.debug(`failed to persist modem id cache: ${(err as Error).message}`);
  }
}
