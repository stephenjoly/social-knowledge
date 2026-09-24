# Separate account-scoped transcription and analysis models

Status: completed
Owner: Codex
Started: 2026-09-24

## Context
Transcription still depends on a required server `OPENAI_API_KEY`, while each account stores only one active generation provider. Roadmap priority #1 requires explicit, independent transcription and analysis choices.

## Scope
Allow each user to store OpenAI and Cerebras credentials simultaneously, select an OpenAI transcription model independently from an OpenAI or Cerebras analysis model, and remove the server OpenAI credential requirement and fallback. Ask uses the analysis selection. Model catalogs remain deployment-supported rather than arbitrary strings.

## Acceptance criteria
- The service starts without `OPENAI_API_KEY` and never uses a server-wide provider credential.
- OpenAI and Cerebras credentials can coexist per user and remain encrypted and owner-scoped.
- Settings and onboarding show separate transcription and analysis provider/model status and choices.
- Capture requires verified transcription and analysis selections; Ask requires verified analysis only.
- Jobs snapshot both selections and retries preserve or explicitly rebind them.
- Existing OpenAI connections migrate to both choices; existing Cerebras connections migrate to analysis only and receive actionable transcription setup guidance.

## Approach
Migrate provider connections to a `(user_id, provider)` key, add account AI selections and job snapshots, then route transcription and generation through those snapshots. Add task-specific readiness APIs and redesign the current single-provider Settings card into two steps.

## Progress
- [x] Add compatible persistence migration and model-selection records.
- [x] Route capture, retry, worker, and Ask through task-specific selections.
- [x] Build onboarding and Settings controls for both tasks.
- [x] Add migration, isolation, API, routing, and browser coverage.
- [x] Verify, deploy to staging, and exercise the recovered public-URL batch.

## Decisions
- 2026-09-24: OpenAI is the only supported transcription provider in v1; Cerebras remains analysis-only.
- 2026-09-24: Ask uses the account's analysis selection.
- 2026-09-24: Supported model IDs come from deployment configuration and are exposed as choices; clients cannot persist arbitrary model IDs.
- 2026-09-24: Remove the server credential fallback rather than silently broadening a user credential.

## Verification
`npm run check` passed with 101 tests passing and 3 skipped. CI passed on PR #26. The focused Playwright tests could not launch in the agent environment because Chromium's `libglib-2.0.so.0` dependency was absent; neither test body ran. The Dokploy preview returned the migrated task-specific provider API, and permanent staging deployed merge SHA `40adfd13eac057bb314e560faf48813fab8ad5ba`. The pre-migration online backup passed SQLite integrity checking with 2 users and 12 jobs; the migrated database also passed integrity checking with those counts intact. Staging health, demo-member login, provider selections, and readiness passed with `OPENAI_API_KEY` absent from the live container and removed from both staging and inherited-preview Dokploy configuration. Eleven sample jobs completed; the remaining Facebook URL exhausted its retry at download with `platform_temporary`, before any AI request.

## Risks and recovery
The provider-table primary-key migration must preserve encrypted payloads and remain compatible with persistent SQLite data. Backup staging before deployment; rollback code must tolerate the additive selection/job columns, while the rebuilt connection table cannot be reverted without restoring the backup.
