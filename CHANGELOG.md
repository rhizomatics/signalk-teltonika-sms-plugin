# Changelog

## 0.3.0

- Optional prefix of SMS message with alarm level, e.g. CRITICAL
- Option to either truncate message to SMS max length, or break notification to multiple SMS
  - Each split SMS has a msg id and total, e.g. `2/4`

## 0.2.2

- Disable armv7 testing, not bwd compat that far back for node

## 0.2.1

- Minor UI tidy up

## 0.2.0

- Improved logging for messsage send
- Specific handling for Teltonika odd 422 status when SMS can't be sent immediately
- Auto default the Modem ID, and show the Modem Type in dialog
- Fix cancellation of retry loop
- Help messages clarified
- CI build fix
- Dependencies updated

## 0.1.0

Initial build: relay SignalK notifications as SMS via a Teltonika RutOS router - priority and
regex path filtering, rate limiting with an emergency bypass, retries, a self-clearing confirmation test-message toggle, and a `teltonika-sms-cli` for hands-on testing.
