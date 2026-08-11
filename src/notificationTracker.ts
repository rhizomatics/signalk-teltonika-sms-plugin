import { ALARM_STATE } from "@signalk/server-api";
import { matchesFilter, NotificationFilterConfig } from "./filter";

export interface NotificationDecisionConfig extends NotificationFilterConfig {
  /** Also notify on a transition down to normal/nominal from a state that previously passed the filter - "the alarm cleared" is worth a text even though normal/nominal alone wouldn't pass `minPriority`. */
  notifyOnClear: boolean;
}

/**
 * Tracks the last-seen state per notification path and decides whether an incoming state is
 * worth an SMS: a real transition (not a repeated delta of an already-notified state) that
 * either passes the priority/pattern filter, or - when `notifyOnClear` is set - clears an
 * alarm that previously passed it.
 */
export class NotificationTracker {
  private readonly lastState = new Map<string, ALARM_STATE>();

  /**
   * Primes the tracker with a notification's current state without evaluating whether to
   * notify - used once at plugin start (seeded from `app.notifications.list()`) so an
   * already-active, already-texted alarm doesn't re-fire just because the plugin restarted.
   */
  seed(path: string, state: ALARM_STATE): void {
    this.lastState.set(path, state);
  }

  considerNotification(path: string, state: ALARM_STATE, config: NotificationDecisionConfig): boolean {
    const previous = this.lastState.get(path);
    this.lastState.set(path, state);
    if (previous === state) {
      return false;
    }
    if (matchesFilter(path, state, config)) {
      return true;
    }
    if (!config.notifyOnClear) {
      return false;
    }
    const isClear = state === ALARM_STATE.normal || state === ALARM_STATE.nominal;
    const previousMatched = previous !== undefined && matchesFilter(path, previous, config);
    return isClear && previousMatched;
  }
}
