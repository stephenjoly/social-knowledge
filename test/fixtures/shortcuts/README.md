# Native Shortcut acceptance

The v6 probes use a dummy key and a mock server bound only to `127.0.0.1:18787`. No production credentials, requests, downloads, or archive writes are needed. `receipt-v6-probe.plist` and `completion-v6-probe.plist` contain the exact tested action graphs. The older `url-input-probe.plist` established the text-token hypothesis; v6 additionally handles bare domains detected as HTTP.

## Run on macOS

1. Convert each probe plist to binary using `plistlib` and sign with `shortcuts sign --mode anyone`.
2. Name the signed files `Local-Test-Social-Knowledge-Receipt-v6.shortcut` and `Local-Test-Social-Knowledge-Completion-v6.shortcut`. Import them in Shortcuts. These copies are local diagnostics, not replacements for use on iPhone.
3. Start `python3 test/fixtures/shortcuts/mock-server.py` in a terminal.
4. With explicit permission for UI automation and macOS Accessibility enabled for the host, run `python3 test/fixtures/shortcuts/native-smoke.py`. It uses AppleScript because the computer-use tool stalled. Do not dismiss dialogs during the run; the harness reads and closes them.
5. Inspect `/private/tmp/social-native-probe-report.json`. Stop the mock server after testing.

The harness invokes native Shortcuts through its URL scheme, reads visible native dialogs, and asserts exact HTTP JSON URL, request path, dummy authorization, and request count. Shared text is passed using percent-encoded spaces rather than `+` (Shortcuts URL-scheme input is not form encoding). Prompted input is entered into the native Ask action. Cancellation/empty input must produce no requests; queued captures must poll the expected ID and stop after twelve attempts.

The scenario file, assertion events, and report use the `social-native-probe-` prefix under `/private/tmp`. They contain only synthetic/public test inputs and boolean assertions, never production credentials. The HTTP server is a response fixture, not a database-retention test. Real iPhone Share Sheet integration and live downloading require separate device/account acceptance.

Committed results: [v6 native macOS evidence](../../../shortcuts/validation/v6-native-macos.json).
