# Social Knowledge Shortcut templates

## v6 — native macOS execution verified

- [Download completion shortcut](Save-to-Social-Knowledge-Completion-v6.shortcut) — recommended: confirms receipt, then checks for completion/failure for about one minute.
- [Download receipt-only shortcut](Save-to-Social-Knowledge-Receipt-v6.shortcut) — confirms receipt immediately and lets capture continue in Activity.

On GitHub, open the file and choose **Download raw file**. On iPhone, open the downloaded `.shortcut` file in Shortcuts and enter your account API key from Social Knowledge Settings when asked. Omit `Bearer`. Never share your key or a personalized exported shortcut.

Use **Share → Save-to-Social-Knowledge-Completion-v6** on a reel. The shortcut receives URLs, text containing links, and Safari web pages. If no shared URL is available, it asks you to paste one. Bare domains such as `facebook.com/reel/1687517479753343` are converted to HTTPS. It saves the first detected URL. Blank/non-link input shows “Nothing was sent”; cancelling stops without a request. A blank invocation is not a connection test.

A receipt confirms that the server retained the URL; it does not imply finished media capture. Unsupported links remain in Activity with a failure/unsupported status. Rejected keys show the server error. Completion polling stops after twelve checks, five seconds apart, and reports that capture is still processing. iOS can interrupt polling; this is not a guaranteed background callback.

## What was verified

v5 used the wrong serialization for both Get URLs from Input fields. Those text parameters need `WFTextTokenString` containing a variable attachment. A bare attachment or the If-specific wrapper leaves the fields blank. v6 fixes both bindings and upgrades detected HTTP links to HTTPS before submission.

Both variants were actually imported and executed in macOS Shortcuts against a loopback mock server with a dummy key. Native dialogs and exact HTTP URL/body/authentication were checked for shared text, prompted input, bare Facebook URLs, Instagram, TikTok retention feedback, empty/invalid input, cancellation, rejected authentication, failed/queued/completed receipts, completion polling, and the polling timeout. See [native test evidence](validation/v6-native-macos.json) and [the reproducible test fixture](../test/fixtures/shortcuts/README.md).

The downloadable graphs reuse the tested action UUIDs and inputs. Only the server URL, key placeholder, and import question differ from the local test copies. Source and signed-download hashes appear in [manifest.json](manifest.json). The entire repository check also passed.

**Limits:** these tests used synthetic server responses, not a real reel download. The actual iPhone Share Sheet and a live account capture were not exercised in this native test run. Backend retention/ownership/status behavior has separate integration and previously deployed acceptance tests. No production server change is required for v6.

## Previous versions

v5 failed with “No URL found” after URL entry. Its files and templates remain solely for diagnosis; do not use them. `Save to Social Knowledge.shortcut` is an older unsigned three-action historical template with an example endpoint and fixed success message.

## Source and regeneration

Keep all future token-free templates and signed downloads in this repository, not only `/tmp` or chat attachments. Reviewable sources are under [templates/](templates/).

```bash
python3 scripts/build-shortcut.py --endpoint https://social-knowledge.stephenjoly.net/api/v1/jobs --receipt-only --xml --output shortcuts/templates/receipt-v6.plist
python3 scripts/build-shortcut.py --endpoint https://social-knowledge.stephenjoly.net/api/v1/jobs --xml --output shortcuts/templates/completion-v6.plist
```

Convert each source to binary with `plistlib`, then sign that same graph with `shortcuts sign --mode anyone`. Do not regenerate UUIDs between source and signing input. Re-run native acceptance after action changes and update manifest hashes/evidence. Signing and structural tests alone do not prove execution. Never use `--personal-source` for repository artifacts or commit a personalized copy.
