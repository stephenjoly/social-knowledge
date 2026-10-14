# Native URL-input diagnostic — unverified hypothesis

This uses a dummy key and a mock server bound only to 127.0.0.1:18787. No production requests, credentials, downloads or archive writes are needed. The probe differs from v5 by serializing both URL-detector inputs as WFTextTokenString with variable attachments. This is an unverified hypothesis, not a replacement Shortcut.

Run `python3 test/fixtures/shortcuts/mock-server.py`, sign/import `url-input-probe.plist` on a Mac (convert to an unsigned binary `.shortcut` with plistlib if needed), and enter `https://www.instagram.com/reel/shortcuts-native-probe/` when prompted. The server records only allowlisted boolean assertions in `/tmp/social-native-probe-events.jsonl`, including exact URL, body type, request path and dummy authorization. It returns a synthetic completed receipt. Test both prompted input and passed/shared input, plus blank/non-link input. Successful native execution should show archive success and all server assertions true; blank input should make no request. Stop the mock server when done.

Current status: signed diagnostic prepared, but computer-use import stalled/misdirected. No imported probe or mock requests were observed. Neither the input encoding hypothesis nor end-to-end execution has been accepted.
