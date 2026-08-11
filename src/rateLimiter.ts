import { ALARM_STATE } from "@signalk/server-api";
import { priorityAtLeast } from "./filter";

export interface RateLimiterConfig {
  /** Maximum SMS sends allowed within `windowMinutes`, before `bypassPriority` and above stop counting. */
  maxMessages: number;
  windowMinutes: number;
  /** A notification at or above this priority always sends, even with the window exhausted - confirmed default: `alarm`. */
  bypassPriority: ALARM_STATE;
}

/**
 * Sliding-window send limiter: `allow()` both checks and (when it returns `true` for a
 * below-`bypassPriority` notification) consumes one slot, so a caller doesn't need a separate
 * "consume" call. `bypassPriority` and above always return `true` without consuming a slot -
 * a rate limit exists to stop routine chatter running up an SMS bill, not to suppress the one
 * message (e.g. an anchor-drag emergency) that actually mattered.
 */
export class RateLimiter {
  private readonly sentAt: number[] = [];

  constructor(
    private readonly config: RateLimiterConfig,
    private readonly now: () => number = Date.now,
  ) {}

  allow(priority: ALARM_STATE): boolean {
    if (priorityAtLeast(priority, this.config.bypassPriority)) {
      return true;
    }
    const windowMs = this.config.windowMinutes * 60_000;
    const cutoff = this.now() - windowMs;
    while (this.sentAt.length > 0 && this.sentAt[0] < cutoff) {
      this.sentAt.shift();
    }
    if (this.sentAt.length >= this.config.maxMessages) {
      return false;
    }
    this.sentAt.push(this.now());
    return true;
  }
}
