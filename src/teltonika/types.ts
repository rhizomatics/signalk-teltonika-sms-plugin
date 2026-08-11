/**
 * Request/response shapes confirmed against a working curl session posted in the Teltonika
 * community forum (https://community.teltonika.lt/t/sms-sending-via-api/13752) - the JS-rendered
 * docs at developers.teltonika-networks.com couldn't be scraped for this build, so these are the
 * verified shapes, not transcribed from the official reference. If a live router responds
 * differently, `TeltonikaApiError`'s `body` carries the raw response for diagnosis.
 */

export interface LoginResponse {
  success: boolean;
  data?: { username: string; token: string; expires: number };
  errors?: TeltonikaApiErrorEntry[];
}

export interface TeltonikaApiErrorEntry {
  source?: string;
  code?: number;
  error?: string;
}

/**
 * `GET /api/messages/storage/status` - one entry per modem, confirmed by testing against real
 * hardware: `modem_id` (e.g. `"1-1"`), `sim_inserted` (truthy when a SIM is actually present in
 * that slot), and `modem_type` (a human-readable model string, e.g. used to label the config
 * dropdown - see `modemLabel` in `../modemSelection.ts`). Used instead of
 * `/api/messages/storage/config` specifically because `sim_inserted` isn't available there, and
 * is needed to auto-pick a sensible default modem - see `chooseDefaultModemId`.
 */
export interface ModemStatusEntry {
  modem_id: string;
  sim_inserted?: number | string | boolean;
  modem_type?: string;
}

export interface MessagesStorageStatusResponse {
  success: boolean;
  data?: ModemStatusEntry[];
  errors?: TeltonikaApiErrorEntry[];
}

export interface SendSmsResponse {
  success: boolean;
  data?: { sms_used: number };
  errors?: TeltonikaApiErrorEntry[];
}

export class TeltonikaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "TeltonikaApiError";
  }
}
