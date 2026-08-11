import { Agent, fetch } from "undici";
import { LoginResponse, MessagesStorageConfigResponse, SendSmsResponse, TeltonikaApiError, TeltonikaApiErrorEntry } from "./types";

/**
 * RUTOS ships its HTTPS admin/API listener with a self-signed certificate by default - the
 * working curl examples confirmed against a real router (see `./types.ts`'s doc comment) all use
 * `-k` to skip verification. `allowSelfSignedCert` (default `true` - see `defaultConfig` in
 * `../config.ts`) reproduces that with a dedicated `undici.Agent`, shared across every request
 * rather than built per-call, since a TLS session can be reused across requests to the same host.
 */
const INSECURE_AGENT = new Agent({ connect: { rejectUnauthorized: false } });

/**
 * Describes a network-level fetch failure's `error.cause` - Node's `fetch()` only ever throws a
 * generic `TypeError: fetch failed`, with the actually useful detail (e.g. ECONNREFUSED) nested in
 * `.cause`, and a multi-address connection attempt surfaces as an `AggregateError` whose own
 * `.message` is empty - the real detail is in `.errors`. Mirrors signalk-einklabel-plugin's
 * `httpJson.ts` `describeCause`.
 */
function describeCause(cause: unknown): string {
  const errors = (cause as { errors?: unknown[] }).errors;
  if (Array.isArray(errors)) {
    return errors.map(describeCause).join("; ");
  }
  if (cause instanceof Error) {
    return cause.message || (cause as NodeJS.ErrnoException).code || cause.toString();
  }
  return String(cause);
}

function describeErrors(errors: TeltonikaApiErrorEntry[] | undefined): string {
  if (!errors || errors.length === 0) {
    return "unknown error";
  }
  return errors.map((entry) => entry.error ?? JSON.stringify(entry)).join("; ");
}

interface RequestOptions {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  token?: string;
  allowSelfSignedCert: boolean;
}

async function request<T>(baseUrl: string, opts: RequestOptions): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}${opts.path}`;
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(url, {
      method: opts.method,
      headers: {
        "Content-Type": "application/json",
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      // A no-op for a plain http:// baseUrl - rejectUnauthorized only affects the TLS handshake.
      ...(opts.allowSelfSignedCert ? { dispatcher: INSECURE_AGENT } : {}),
    });
  } catch (err) {
    const cause = (err as { cause?: unknown }).cause;
    const detail = cause !== undefined ? describeCause(cause) : (err as Error).message;
    throw new Error(`request failed: ${opts.method} ${url} - ${detail}`);
  }
  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    throw new TeltonikaApiError(`non-JSON response from ${opts.method} ${url} (${response.status})`, response.status, text);
  }
  if (!response.ok || response.status === 401 || response.status === 403) {
    throw new TeltonikaApiError(`${opts.method} ${url} failed (${response.status})`, response.status, json);
  }
  return json as T;
}

export interface TeltonikaClientConfig {
  baseUrl: string;
  username: string;
  password: string;
  /** See `INSECURE_AGENT`'s doc comment above - default `true` (see `defaultConfig` in `../config.ts`) since RUTOS's own HTTPS listener is self-signed out of the box. */
  allowSelfSignedCert: boolean;
}

interface Session {
  token: string;
  expiresAt: number;
}

/** Re-authenticate a little before the token's own reported expiry, so an in-flight request doesn't race a just-expired session. */
const REAUTH_SAFETY_MARGIN_MS = 15_000;

/**
 * RUTOS REST API client - session login (`/api/login`), the SMS-capable modem id list
 * (`/api/messages/storage/config`), and sending SMS (`/api/messages/actions/send`). See
 * `./types.ts`'s doc comment for how these shapes were confirmed.
 */
export class TeltonikaClient {
  private session: Session | undefined;
  private cachedModemIds: string[] | undefined;

  constructor(
    private readonly config: TeltonikaClientConfig,
    private readonly now: () => number = Date.now,
  ) {}

  async login(): Promise<string> {
    const response = await request<LoginResponse>(this.config.baseUrl, {
      method: "POST",
      path: "/api/login",
      body: { username: this.config.username, password: this.config.password },
      allowSelfSignedCert: this.config.allowSelfSignedCert,
    });
    if (!response.success || !response.data) {
      throw new TeltonikaApiError(`login failed: ${describeErrors(response.errors)}`, 200, response);
    }
    this.session = { token: response.data.token, expiresAt: this.now() + response.data.expires * 1000 };
    return this.session.token;
  }

  private async ensureSession(): Promise<string> {
    if (this.session && this.session.expiresAt - REAUTH_SAFETY_MARGIN_MS > this.now()) {
      return this.session.token;
    }
    return this.login();
  }

  /**
   * Runs an authenticated call, retrying once with a fresh login if the router rejects the
   * cached token as unauthorized (401/403) - our own expiry tracking is a best-effort clock
   * estimate, not a guarantee the router agrees a token is still valid.
   */
  private async authorized<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
    const allowSelfSignedCert = this.config.allowSelfSignedCert;
    const token = await this.ensureSession();
    try {
      return await request<T>(this.config.baseUrl, { method, path, token, body, allowSelfSignedCert });
    } catch (err) {
      if (err instanceof TeltonikaApiError && (err.status === 401 || err.status === 403)) {
        this.session = undefined;
        const retryToken = await this.ensureSession();
        return request<T>(this.config.baseUrl, { method, path, token: retryToken, body, allowSelfSignedCert });
      }
      throw err;
    }
  }

  /** The unparsed `/api/messages/storage/config` response - lets `teltonika-sms-cli modems --raw` show what a real router actually sends, to sanity-check `getModemIds`'s `modem_id` extraction against firmware this wasn't verified against (see `./types.ts`'s doc comment). */
  async getRawModemConfig(): Promise<unknown> {
    return this.authorized<unknown>("/api/messages/storage/config", "GET");
  }

  /** Cached after the first successful fetch; pass `refresh: true` to bypass the cache and re-fetch from the router. */
  async getModemIds(opts: { refresh?: boolean } = {}): Promise<string[]> {
    if (!opts.refresh && this.cachedModemIds) {
      return this.cachedModemIds;
    }
    const response = await this.authorized<MessagesStorageConfigResponse>("/api/messages/storage/config", "GET");
    if (!response.success || !response.data) {
      throw new TeltonikaApiError(`fetching modem list failed: ${describeErrors(response.errors)}`, 200, response);
    }
    const ids = response.data.map((entry) => entry.modem_id).filter((id): id is string => typeof id === "string");
    this.cachedModemIds = [...new Set(ids)];
    return this.cachedModemIds;
  }

  async sendSms(modemId: string, number: string, message: string): Promise<void> {
    const response = await this.authorized<SendSmsResponse>("/api/messages/actions/send", "POST", {
      data: { modem: modemId, number, message },
    });
    if (!response.success) {
      throw new TeltonikaApiError(`sending SMS failed: ${describeErrors(response.errors)}`, 200, response);
    }
  }
}
