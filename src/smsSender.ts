import { ALARM_STATE } from "@signalk/server-api";
import { RateLimiter } from "./rateLimiter";
import { TeltonikaClient } from "./teltonika/client";
import { requireE164PhoneNumber } from "./phoneNumber";

export interface SmsSenderConfig {
  modemId: string;
  recipients: string[];
  retryCount: number;
  retryPauseSeconds: number;
}

export interface SmsJob {
  priority: ALARM_STATE;
  text: string;
  /** For logging only - e.g. the notification path, or "confirmation test message". */
  label: string;
}

export interface Logger {
  debug: (message: string) => void;
  error: (message: string) => void;
}

/**
 * Sequential FIFO queue of SMS sends - one at a time, not concurrent, so the rate limiter's
 * window count stays accurate and the router's session token isn't raced by parallel calls.
 * Each job is sent to every configured recipient; a failed recipient send is retried up to
 * `retryCount` times (including the first attempt) with `retryPauseSeconds` between, then
 * logged and given up on independently of other recipients.
 *
 * `enqueue` resolves to whether *every* attempted recipient for that job succeeded - used by
 * the "send a confirmation test message" config toggle (see `plugin.ts`) to decide whether it's
 * safe to clear itself back to `false`.
 */
export class SmsSender {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly client: TeltonikaClient,
    private readonly rateLimiter: RateLimiter,
    private readonly config: SmsSenderConfig,
    private readonly logger: Logger,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  enqueue(job: SmsJob): Promise<boolean> {
    const result = this.tail.then(() => this.process(job));
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async process(job: SmsJob): Promise<boolean> {
    if (!this.rateLimiter.allow(job.priority)) {
      this.logger.error(`rate limit exceeded - dropped SMS for "${job.label}"`);
      return false;
    }
    if (!this.config.modemId) {
      this.logger.error(`no SMS modem configured - dropped SMS for "${job.label}"`);
      return false;
    }
    if (this.config.recipients.length === 0) {
      this.logger.error(`no recipients configured - dropped SMS for "${job.label}"`);
      return false;
    }
    let allSucceeded = true;
    for (const recipient of this.config.recipients) {
      try {
        requireE164PhoneNumber(recipient);
      } catch (err) {
        this.logger.error(`skipping recipient for "${job.label}": ${(err as Error).message}`);
        allSucceeded = false;
        continue;
      }
      const sent = await this.sendWithRetries(recipient, job);
      allSucceeded &&= sent;
    }
    return allSucceeded;
  }

  private async sendWithRetries(recipient: string, job: SmsJob): Promise<boolean> {
    const attempts = Math.max(1, this.config.retryCount);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await this.client.sendSms(this.config.modemId, recipient, job.text);
        this.logger.debug(`sent SMS to ${recipient} for "${job.label}" (attempt ${attempt}/${attempts})`);
        return true;
      } catch (err) {
        const message = (err as Error).message;
        if (attempt === attempts) {
          this.logger.error(`giving up sending SMS to ${recipient} for "${job.label}" after ${attempts} attempt(s): ${message}`);
          return false;
        }
        this.logger.debug(
          `SMS to ${recipient} for "${job.label}" failed (attempt ${attempt}/${attempts}): ${message} - retrying in ${this.config.retryPauseSeconds}s`,
        );
        await this.sleep(this.config.retryPauseSeconds * 1000);
      }
    }
    return false;
  }
}
