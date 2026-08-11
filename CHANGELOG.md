# Changelog

## 0.2.0

- Improved logging for messsage send
- Specific handling for Teltonika odd 422 status when SMS can't be sent immediately
- Auto default the Modem ID
- Fix cancellation of retry loop
- Help messages clarified

## 0.1.0

Initial build: relay SignalK notifications as SMS via a Teltonika RUTOS router - priority and
regex path filtering, rate limiting with an emergency bypass, retries, a self-clearing confirmation test-message toggle, and a `teltonika-sms-cli` for hands-on testing.
