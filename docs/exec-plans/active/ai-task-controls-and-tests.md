# AI task controls and connection tests

Status: active
Owner: Codex
Started: 2026-09-26

## Context
User feedback revises the provider-first setup: providers should hold credentials, while task assignments should expose provider, model, and thinking level directly. A final test section should verify the configured transcription, analysis, and Ask connections.

## Scope
Polish the AI settings page. Move model/thinking controls into tasks while preserving saved assignments. Add explicit user-triggered provider tests using small sample inputs, without creating captures or conversations. Retain the shared Analysis & Ask selection and supported providers.

## Acceptance criteria
- Providers only manage key connections; task rows expose compatible provider/model/thinking choices.
- Existing settings remain valid and thinking defaults are visible.
- Separate tests exercise actual transcription, structured analysis, and streaming answer requests through saved account credentials.
- Tests have bounded input, timeout, and concurrency/rate limits; results are controlled safe summaries.
- Results identify tested settings, invalidate after relevant changes, and show pending/success/failure clearly.
- No diagnostic input becomes archive data; no secrets, paths, or raw provider errors enter responses.
- Full checks and desktop/mobile browser journeys pass.

## Approach
Two isolated Workers implement backend and UI. Parent reviews contracts, integrates results, updates documentation, checks screenshots, and publishes the existing isolated preview. Transcription uses a small audio file selected by the user; analysis and Ask use synthetic text.

## Progress
- [x] Inspect current settings and user feedback; delegate bounded work.
- [x] Implement task-owned model/thinking settings and safe test endpoints.
- [x] Polish task controls and test-result UI.
- [ ] Verify, document, and update preview.

## Decisions
- 2026-09-26: User's revised flow supersedes per-provider model editing in the previous UI. Preserve stored choices and compatibility where practical.
- 2026-09-26: Tests run only on explicit user action. Tests may incur provider usage and do not certify downloads, archive retrieval, or the complete capture pipeline.

## Verification
`npm run check`, synthetic provider API tests, browser checks of model/thinking persistence, diagnostics and error handling, desktop/mobile screenshots, preview identity and health. No automatic use of live preview credentials.

## Risks and recovery
Provider requests incur usage; use small fixed samples, strict upload bounds, cancellation/timeouts, and rate limits. Keep diagnostics separate from persisted capture/Ask records. Existing assignment snapshots and ownership isolation must remain intact. Revert scoped commits if needed; no production promotion.

## Integration notes
- Backend checkpoints `1dc736d` and `ec4d449` integrated. Worker full check passed 135 tests.
- Diagnostics cap audio at 1 MiB, use a 45-second abort timeout, allow one active test and five attempts per minute per account. No SDK retries for diagnostics; normal generation behavior remains unchanged.
- Streaming tests require non-whitespace content and clean terminal completion; structured tests reject incomplete responses. Cerebras diagnostic output caps and finish reasons are handled explicitly.
- UI checkpoint `81ecfcf` integrated as `e2b6fc0`. Parent full checks passed 135 tests; provider settings, settings alignment, onboarding, and library browser journeys passed (4/4) against the combined backend/UI.
- Parent screenshot review widened the two-field transcription row, refined upload/test controls, and simplified test help text. Final checks and preview identity verification follow this polish.
