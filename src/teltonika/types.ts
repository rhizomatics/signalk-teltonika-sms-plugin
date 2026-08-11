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
 * `GET /api/messages/storage/config` - per design/intent.md, each entry carries a `modem_id`
 * field. Kept as `Record<string, unknown>` beyond that one confirmed field since the rest of the
 * entry's shape isn't verified - see `getModemIds` in `client.ts`.
 */
export interface MessagesStorageConfigResponse {
  success: boolean;
  data?: Record<string, unknown>[];
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
