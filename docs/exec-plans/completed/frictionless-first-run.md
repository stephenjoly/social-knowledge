# Frictionless first-run registration and invitations

Status: completed
Owner: Codex
Started: 2026-09-24
Completed: 2026-09-24

## Context
The first administrator had to copy the deployment `API_TOKEN` into the browser. The new flow replaces that operator-facing secret step with clear first-account registration and administrator-issued invitations for additional isolated users.

## Scope
Tokenless first-admin registration, automatic sign-in, optional AI-provider onboarding, and 24-hour single-use member/admin invitations. Account deletion, role changes, password reset, and email delivery remain excluded.

## Acceptance criteria
- The first successful registration atomically creates the only initial administrator and starts a browser session without an API token.
- The account form clearly requires acknowledgement of administrator authority and supports password confirmation.
- First-run AI setup verifies an existing supported provider or can be skipped with a clear limitation notice.
- Administrators can list users and create, copy, revoke, and regenerate hashed, expiring invitations; members cannot.
- Invited users choose their username/password, receive the assigned role, and cannot reuse an invitation.
- Account data remains isolated by `ownerUserId`.

## Approach
SQLite now stores invitation metadata and hashed bearer tokens, authenticated endpoints enforce administrator-only management, and reusable registration/provider-onboarding UI uses the existing account and provider boundaries. `API_TOKEN` remains available only for legacy capture and encryption fallback.

## Progress
- [x] Implement invitation persistence and API authorization.
- [x] Implement registration, onboarding, and user-management UI.
- [x] Add integration and browser-focused regression coverage.
- [x] Update security/operator documentation and complete automated verification.

## Decisions
- 2026-09-24: Accept open first-visitor claiming and document that a fresh deployment must remain private until claimed.
- 2026-09-24: Invitations expire after 24 hours; invitees choose usernames; administrators can invite members or administrators.
- 2026-09-24: AI-provider onboarding is skippable.
- 2026-09-24: Keep invitation bearer tokens in URL fragments and JSON bodies so ordinary HTTP request URLs do not expose them to proxy logs.

## Verification
`npm run check` passed with documentation validation, strict TypeScript, a production build, and 93 passing tests (3 skipped). The Playwright onboarding journey was added and compiled, but browser execution was unavailable on the implementation host because `libglib-2.0.so.0` is missing.

## Risks and recovery
An exposed unclaimed deployment can be taken over by its first visitor. Setup remains a one-row atomic transaction, invitation tokens are random and stored only as hashes, and rollback can remove the new endpoints/UI while leaving the additive invitation table harmless.
