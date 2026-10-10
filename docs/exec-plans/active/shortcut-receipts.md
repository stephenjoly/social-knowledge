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
- [ ] Production rollout and on-device acceptance after owner approval.
- [x] Correct reported blank If inputs: use Variable wrapper, coerce status to Text, validate references, and add generator regression tests.
- [ ] Verify replacement on-device; native automation currently fails startup.

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
