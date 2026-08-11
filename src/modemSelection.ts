import { ModemStatusEntry } from "./teltonika/types";

export function isSimInserted(value: ModemStatusEntry["sim_inserted"]): boolean {
  return value === 1 || value === "1" || value === true;
}

/**
 * Picks a sensible default modem when none is configured yet, so the "SMS modem" config field
 * isn't stuck empty until the user manually revisits it after their first successful login (the
 * modem list only exists once the plugin has fetched it from the router - see `plugin.ts`'s
 * startup sequence). The single modem if there's only one, otherwise the alphabetically-first
 * modem with a SIM actually inserted (skipping an empty slot on a multi-modem router).
 * `undefined` if nothing suitable was found (no modems, or a multi-modem router with no SIM
 * inserted anywhere) - in that case the field is left for the user to fill in themselves.
 */
export function chooseDefaultModemId(modems: ModemStatusEntry[]): string | undefined {
  if (modems.length === 1) {
    return modems[0].modem_id;
  }
  const withSim = modems
    .filter((modem) => isSimInserted(modem.sim_inserted))
    .map((modem) => modem.modem_id)
    .sort((a, b) => a.localeCompare(b));
  return withSim[0];
}

/** `"1-1 (Quectel EC25)"` - falls back to the bare id if the router didn't report a `modem_type` for this entry. */
export function modemLabel(modem: ModemStatusEntry): string {
  return modem.modem_type ? `${modem.modem_id} (${modem.modem_type})` : modem.modem_id;
}
