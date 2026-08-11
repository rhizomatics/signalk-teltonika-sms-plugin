# SignalK Teltonika SMS Plugin

## Intent

Deliver SignalK notifications via a Teltonika router using the RutOS API for example to receive an anchor watch alert.

Notifications can be selected inclusively or exclusively by a list of SignalK data path regular expressions, by priority or globally.

Failed SMS will be retried for a configurable number of times after a configurable pause. Spammy / expensive texting will be controlled by applying a configurable rate limit

## Related Specifications

- [Teltonika SMS Post API](https://developers.teltonika-networks.com/reference/rut956/7.24.1/v1.16/messages#post-messages-actions-send)
- [SignalK Notification API](https://demo.signalk.org/documentation/Developing/REST_APIs/Notifications_API.html)
- [SignalK Notification Spec](https://signalk.org/specification/1.8.2/doc/notifications.html)

## Details

- npm package scoped under `@rhizomatics` organization
- Code quality ensured using oxlint, oxfmt and unit tests
- All code in TypeScript
- Plugin registers itself with SignalK as a notification API handler
- Config page has an option for one-off test message
- Modem status is retrieved via `/api/messages/storage/status` API call (not `/api/messages/storage/config` - that lacks `sim_inserted`), giving `modem_id`, `sim_inserted` and `modem_type` per modem, cached with option to refresh
- If left blank, the "SMS modem" config field is auto-picked on plugin start and saved back: the only modem if there's just one, otherwise the alphabetically-first modem with a SIM actually inserted - avoids the field sitting empty until the user manually revisits the config after their first successful login
- The modem dropdown shows each modem's `modem_type` in brackets after its id, to make the choice easier to understand
- Session login is used, using `/api/login` for first call or if subsequent call has an expired token
- Root usage is discouraged - the plugin documentation explains how to create a non-root user in the RutOS UI. Confirmed by testing: the user needs either write access to all pages, or specifically write access to the `Services / Mobile Utilities / Messages / Send` and `Services / Mobile Utilities / Messages / Storage` permission pages (set on the user's Permissions tab in the RutOS UI) - no separate API-level ACL call is needed
- App Icon created, stylized SMS chat bubble

## Roadmap

Potential additions:

- Two-way SMS support with SignalK commands
  - Enquire value of a SignalK path
  - Acknowledge an alarm, e.g. replying 'ok' or 'ack'
- Expose message inbox size, unread count, as SignalK data paths
- Use as part of a fail-thru chain
  - Default to internet, over 4G, Starlink etc
  - Fall back to SMS if internet notification fails
