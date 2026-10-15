# Reliable Shortcut receipts and URL retention

Status: active
Owner: Codex / Stephen
Started: 2026-10-03

## Context
The shared Shortcut posts a URL, then always displays a fixed success message. Live read-only validation confirmed its credential is accepted (HTTP 400 invalid_request for an empty URL). TikTok was rejected by ingestion; AI configuration errors occurred before persistence. The owner requests honest receipt/completion feedback and retention of unsupported links.

## Scope
Retain valid authenticated HTTPS submissions in Activity, preserve supported capture processing, provide an owner-scoped Shortcut status route, and generate credential-free importable Shortcuts. No TikTok downloading, production deployment, credential rotation, or guaranteed background callbacks.

## Acceptance criteria
- A receipt confirms a durable owner-scoped URL, never implies finished media capture.
- Unsupported links cannot enter the downloader, including single and bulk retries.
- Missing AI setup retains a retryable URL while keeping HTTP 428 compatibility.
- Status reads reject unauthenticated, revoked, and cross-account credentials and redact diagnostics.
- Replacement Shortcut branches on server receipt/status and bounds completion polling.

## Approach
Reuse persisted jobs and existing failure states/codes; no schema migration. Add capture-credential status route. Ship Python plist generator with import-time key setup and optional receipt-only mode for old servers.

## Progress
- [x] Inspect shared Shortcut and validate credential privately.
- [x] Implement retention, safe status, and Shortcut generator.
- [x] Complete checks: npm run check (158 tests), two Activity browser tests, and both token-free artifacts signed successfully. Native import/run verification remains blocked by computer-use denial.
- [x] Backend production rollout completed through release PR #44; live server acceptance passed.
- [ ] iPhone Share Sheet/live account acceptance (not accessible from this Mac).
- [x] Correct reported blank If inputs: use Variable wrapper, coerce status to Text, validate references, and add generator regression tests.
- [x] Verify replacement in native macOS Shortcuts; 17 cases passed for v6.

## Decisions
- 2026-10-03: Owner confirmed all unsupported links should be retained. Bookmarks live in Activity, separate from completed captures.
- 2026-10-03: Keep capture URL allowlist unchanged. Unsupported submissions have terminal unsupported_platform code and cannot retry.
- 2026-10-03: Preserve HTTP 428 setup errors but include durable receipt. Existing clients remain compatible.

## Verification
Run npm run check; test credential ownership/revocation, unsafe inputs, unsupported retention/dedup/retry exclusion, setup recovery, completion and redaction. Sign token-free artifacts using Apple shortcuts CLI. Verify import/actions and share-sheet execution on Apple device before production acceptance.

## Risks and recovery
Polling can be interrupted by iOS and is not a background callback. Existing ntfy integration covers later completion/failure when configured. Rollback code does not delete retained jobs; do not retry unsupported bookmarks using older server versions. Old servers do not recognize new failure codes. Deployment remains an explicit staged rollout. The supplied iCloud Shortcut embeds a live bearer credential; share only token-free replacements and rotate/revoke the old credential when practical.

## Shortcut import correction
The first signed files contained bare WFTextTokenAttachment inputs on If actions. Apple If requires a Type=Variable wrapper. The owner reported blank conditions during import/run; signing did not detect this. Replacement v2 artifacts wrap all If references and coerce dictionary status to Text before string comparisons. Generator tests assert native input shape and producer types. The external action-schema validator reports no action/parameter defects; its remaining findings concern its own branded comment-style requirements.

## Missing-input correction — 2026-10-10
The owner reported `invalid_request` while using v2 in Shortcuts; whether invocation came from the editor or a share sheet remains unconfirmed. Native inspection showed the imported no-input setting was Continue, despite the generator specifying an AskForInput metadata value; no explicit Ask action existed. An authenticated empty/non-string `url` fails the POST schema before URL persistence. The generator now uses an explicit shared-input/fallback Ask branch, re-extracts a URL, coerces it to Text for JSON, and guards POST so missing/non-link input stops locally. The API key remains entered by the owner; no server or authentication change is needed. Regression tests cover prompt placement, both variable assignments, the string-body producer, and request reachability inside the input guard. Full `npm run check` passed 163 tests, types, documentation validation and production build; both token-free v3 variants signed successfully outside the sandbox. v3 native execution still requires on-device verification.

The owner confirmed the desired blank-run behavior: prompt for a URL, then save it, without a separate connection-test menu. URL-list existence checks now precede both Get First Item actions so empty shared/pasted input cannot fail at item selection before the prompt or local validation message. Existing receipt/completion feedback continues to report actual server outcomes.

## Native v4 failure — 2026-10-11
The owner reported no visible result after the URL prompt. A real `shortcuts run` of the installed v4 with a non-sensitive HTTP test link returned the local “No URL found” output; no server receipt was produced. Both `detect.link` inputs incorrectly used the If-only content-filter Variable wrapper. Ordinary action inputs require a direct WFTextTokenAttachment, consistent with primary generator source. Corrected both URL-extraction inputs and added a regression asserting the direct attachment shape, retaining the special wrapper only on If. This is a candidate correction until native execution is verified. Native UI access failed to start; Apple’s CLI can run installed copies but cannot import the corrected file. No credentials were printed and the test link is rejected before persistence if it reaches the server.

## Durable template distribution — 2026-10-13
The owner requested actual repository files because temporary downloads disappeared. Restore v5 candidate sources from the saved feature branch, keep token-free source plists and signed receipt/completion downloads under `shortcuts/`, and record hashes, import instructions and native verification status. Provide the same folder in the primary local checkout for immediate access and push the versioned files to the existing draft PR. The private key remains supplied only during import. No server change or production promotion is needed for this packaging correction. Native v5 verification remains pending.

## v5 native failure and validation block
The owner supplied a native v5 screenshot showing “No URL found” after entering a URL. Native editor inspection confirmed both `detect.link` WFInput text controls displayed no bound value. Hypothesis: these text parameters require WFTextTokenString with variable attachments, rather than the previously assumed generic attachment representation. A token-free local-only diagnostic template using text-token inputs and a loopback mock endpoint was signed, but it was not imported: computer-use commands took minutes, one took hours, and the file-dialog operation landed in an unrelated directory. No probe is present in Apple CLI inventory and the mock server received zero requests. There is no successful native validation of this candidate hypothesis.

v5 downloads are marked known broken in README/manifest and must not be recommended as working. Preserve artifacts for diagnosis. Do not publish another version as ready until imported native execution proves exact URL and JSON body, prompted input, shared input, empty input, authentication failure, durable receipt, and completion/failure feedback. The blocker is native UI automation; no production credentials or data were used by the diagnostic.


## v6 repair and native acceptance — 2026-10-15
The owner explicitly authorized AppleScript for local testing after the computer-use tool repeatedly hung, then enabled the required Accessibility permission. Native import and visible dialog inspection succeeded. Both Get URLs from Input parameters require WFTextTokenString containing variable attachments. Changing only those inputs made the existing local probe send the exact prompted/shared URL and dummy authorization. Apple also turns a bare Facebook domain into an HTTP URL; v6 upgrades a leading HTTP scheme to HTTPS before the JSON submission.

Seventeen native cases passed against the loopback fixture: prompted/shared URLs, the owner's bare Facebook link, links embedded in text, Instagram, TikTok failed/retained feedback, empty/invalid input, cancellation, rejected keys, immediate complete/failed/queued receipts, completion/failure polling, and a still-processing result after exactly twelve GETs. Visible native messages and exact request URL, body type, authorization, path, and count were asserted. The first mixed-text simulation failed because URL-scheme form encoding used `+` for spaces; the harness now percent-encodes spaces and the case passed. Evidence and harness are committed with v6.

The public source graphs reuse the tested UUIDs; only endpoint/key/import setup differs. A regression checks both generator-to-source parity and exact public-to-probe action parity. Sources, signed downloads, hashes and native evidence remain in `shortcuts/`. No server deployment is required. The test server returns synthetic receipts; this does not prove a real reel download or actual iPhone Share Sheet behavior. The separate backend integration tests cover durable retention and ownership.

Final v6 verification: `npm run check` passed documentation validation, TypeScript, production build, and 164 tests across 30 files. Both public variants were Apple-signed; hashes and graph parity checks passed. Local mock server stopped after 17 successful native cases.

## Settings distribution — 2026-10-15
The owner confirmed v6 works and requested an in-app download. Settings → API keys now includes the completion and receipt-only downloads, account-key/import/share instructions, the service destination, and a reminder that downloads contain no credential. Links pin the exact tested public commit. No credential is included in a URL or sent to GitHub. Two local browser tests passed for settings geometry, anonymous visibility, authenticated downloads with byte/hash checks and no account headers, and mobile width. Both public pinned URLs independently returned HTTP 200 with matching hashes. `npm run check` passed 164 tests. The UI change is awaiting preview/staging/production release; existing public downloads remain available.
