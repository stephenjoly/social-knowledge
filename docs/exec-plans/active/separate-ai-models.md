# Separate account-scoped transcription and analysis models

Status: active
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
- [ ] Add compatible persistence migration and model-selection records.
- [ ] Route capture, retry, worker, and Ask through task-specific selections.
- [ ] Build onboarding and Settings controls for both tasks.
- [ ] Add migration, isolation, API, routing, and browser coverage.
- [ ] Verify, deploy to staging, and exercise the recovered public-URL batch.

## Decisions
- 2026-09-24: OpenAI is the only supported transcription provider in v1; Cerebras remains analysis-only.
- 2026-09-24: Ask uses the account's analysis selection.
- 2026-09-24: Supported model IDs come from deployment configuration and are exposed as choices; clients cannot persist arbitrary model IDs.
- 2026-09-24: Remove the server credential fallback rather than silently broadening a user credential.

## Verification
Run focused database/provider/worker/API/UI tests, `npm run check`, preview acceptance, and staging capture/Ask smoke tests with synthetic accounts.

## Risks and recovery
The provider-table primary-key migration must preserve encrypted payloads and remain compatible with persistent SQLite data. Backup staging before deployment; rollback code must tolerate the additive selection/job columns, while the rebuilt connection table cannot be reverted without restoring the backup.
