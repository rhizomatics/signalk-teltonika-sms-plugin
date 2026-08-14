# SignalK SMS Notifications via Teltonika Routers

[![npm version](https://img.shields.io/npm/v/@rhizomatics/signalk-teltonika-sms-plugin.svg)](https://www.npmjs.com/package/@rhizomatics/signalk-teltonika-sms-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@rhizomatics/signalk-teltonika-sms-plugin.svg)](https://www.npmjs.com/package/@rhizomatics/signalk-teltonika-sms-plugin)
[![SignalK Plugin CI](https://github.com/rhizomatics/signalk-teltonika-sms-plugin/actions/workflows/signalk-ci.yml/badge.svg)](https://github.com/rhizomatics/signalk-teltonika-sms-plugin/actions/workflows/signalk-ci.yml)
![code style: oxfmt](https://img.shields.io/badge/code_style-oxfmt-blue.svg)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://github.com/rhizomatics/signalk-teltonika-sms-plugin/blob/main/LICENSE)
[![boat tech directory](https://boat-tech-directory.rhizomatics.org.uk/images/badge.svg)](https://boat-tech-directory.rhizomatics.org.uk)

Relays [SignalK notifications](https://signalk.org/specification/1.8.2/doc/notifications.html)
(e.g. an anchor watch alert) as SMS via a [Teltonika](https://www.teltonika-networks.com) cellular router's
[RutOS REST API](https://developers.teltonika-networks.com/reference/rut956/7.24.1/v1.16/messages#post-messages-actions-send) -
useful when the boat has no other way to reach you (no internet, generator/battery notifications while ashore, etc).

## How it works

- Subscribes to every `notifications.*` path on the vessel.
- A notification is relayed only on an actual state transition - not on every repeated delta of an already-notified state - and only if it passes the filters below:
- **Priority**: only notifications at or above "Minimum priority" (default `alert`) are relayed.
- **Path patterns**: optional include/exclude regex lists against the notification path with the
  `notifications.` prefix stripped, e.g. `navigation.anchor.maxRadius`. Leave both empty to match every path ("globally").
- **Clearing**: with "Also notify when an alarm clears" on (default), a matched notification
  dropping back to `normal`/`nominal` also sends a text, even though that state alone is below "Minimum priority" - so "anchor alarm cleared" reaches you too.
- **Rate limit**: a sliding window caps SMS volume/cost (default 10 per 60 minutes). A
  notification at or above "Bypass priority" (default `alarm`) always sends regardless - so an anchor-drag emergency is never silently dropped because earlier chatter used up the quota.
- **Retries**: a failed send is retried (default 3 attempts, 30s apart) before being logged and
  given up on.
- Recipients are texted **individually and sequentially**, not concurrently, so the rate limit stays accurate and the router's session token isn't raced.
- On restart, already-active notifications are silently re-learned (not re-texted) - a plugin restart doesn't re-fire an alarm you were already texted about.

## Setup

### 1. Create a non-root RutOS user

Root credentials (the `admin` user) will work but best be avoided if possible - for best security, create a dedicated user or re-use an existing SignalK user and give it only the permissions it needs.

1. RutOS web UI: **System -> Administration -> Users -> Add**.
2. On that user's **Permissions** tab, confirmed by testing: grant either write access to **All Pages**, or specifically write access to the **Services -> Mobile Utilities -> Messages -> Send**
   and **Services -> Mobile Utilities -> Messages -> Storage** permission pages. No separate
   API-level ACL call is needed - it's just these two checkboxes in the UI.

Run `teltonika-sms-cli acl <username>` any time for a reminder of this.

### 2. Configure the plugin

In the SignalK admin UI, under this plugin's config:

| Field                            | Notes                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router base URL                  | Defaults to `https://192.168.1.1`, matching RutOS's own default HTTPS listener. Use a plain `http://...` URL only if that listener is disabled on your router.                                                                                                                                                   |
| Allow self-signed cert           | On by default - RutOS ships a self-signed HTTPS certificate out of the box.                                                                                                                                                                                                                                      |
| Username / Password              | The non-root user from step 1.                                                                                                                                                                                                                                                                                   |
| SMS modem                        | Leave blank to auto-pick on plugin start (and save it back here): the only modem if there's just one, otherwise the first (alphabetically) with a SIM inserted. Each option is shown as `modem_id (modem_type)`, e.g. `1-1 (Quectel EC25)`. Tick "Refresh modem list on start" if the list looks empty or stale. |
| Recipient phone numbers          | International format only, e.g. `+447123456789` - not a local/national number.                                                                                                                                                                                                                                   |
| Send a confirmation test message | Tick, save, and restart the plugin to text every recipient a one-off "it works" message. Clears itself automatically once that send succeeds - if it stays ticked, check the plugin log.                                                                                                                         |

### 3. Verify with the CLI

`teltonika-sms-cli` talks to the router directly, without needing a running SignalK server -
useful for confirming credentials/modem/ACL before wiring up the plugin:

```bash
npm run cli -- login    --router-url https://192.168.1.1 --user <user> --password <password>
npm run cli -- modems   --router-url https://192.168.1.1 --user <user> --password <password>
npm run cli -- send "+447123456789" "test" --router-url https://192.168.1.1 --user <user> --password <password> --modem 1-1
```

(Once published/installed, drop `npm run cli --` and call `teltonika-sms-cli` directly. Prefer
`$TELTONIKA_SMS_PASSWORD` over `--password` so it isn't left in shell history.)

## Roadmap

Not yet implemented (see `design/intent.md`):

- Two-way SMS - enquire a SignalK path's value, acknowledge an alarm by replying.
- Message inbox size / unread count as SignalK data paths.
- Use as a fail-through step after internet-based notification (4G/Starlink) fails.

## Also for SignalK from Rhizomatics

- [SignalK CLI](https://github.com/rhizomatics/signalk-cli)
  - Query SignalK History API from command line
  - Output to console, CSV or Apache Arrow Feather dataframe
  - Automatic discovery of local SignalK server
  - Auto aggregation for min/avg/max of any path value

- [Boat Tech Directory](https://github.com/rhizomatics/boat-tech-directory)
  - Curated list of boat tech projects, products, standards, blogs, news and more
  - Available as [Boat Tech Directory](http://boat-tech-directory.rhizomatics.org.uk/) web site and in `awesome list` as [Awesome Boat Tech](https://github.com/SY-Sea-Jade/awesome-boat-tech#awesome-boat-tech--)

- [signalk-datalab-plugin](https://github.com/rhizomatics/signalk-datalab-plugin) _ALPHA_
  - Python data notebooks using Marimo and WASM for easy (and advanced ) data analysis on SignalK data
  - Example notebook that pulls aggregate data out of the SignalK History API

- [signalk-bluetti-plugin](https://github.com/rhizomatics/signalk-bluetti-plugin)
  - Read Bluetti power station sensor data for battery level, solar input, inverter etc
  - Configuration for dozens of models
  - Some newer models using encrypted data will need a vendor-supplied key

- [signalk-delta-squelch-plugin](https://github.com/rhizomatics/signalk-delta-squelch-plugin)
  - Minimize noisy SignalK deltas and unnecessary database space/query time for analytics
  - Apply configurable rounding factor where SignalK precision exceeds the device resolution, e.g. GPS position
  - Skip updates within a configurable tolerance from last value, with heartbeat to maintain minimal stream
  - Reject implausible position changes from GPS spikes

- [signalk-einklabel-plugin](https://github.com/rhizomatics/signalk-einklabel-plugin)
  - Publish SignalK data to cheap eInk electronic shelf labels over BLE
  - Simple SVG templating, access to data paths plus Resources API
  - Scheduled based on time or change to a SignalK path
  - Handles ZhunyCo BLE labels and extensible for other vendors
  - Also available [signalk-einklabel-genai-plugin](https://github.com/rhizomatics/signalk-einklabel-genai-plugin) to generate ESL labels from a configurable LLM prompt
