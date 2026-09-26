# Non-production demo accounts

Status: completed
Owner: Codex
Started: 2026-09-24
Completed: 2026-09-24

## Context
Staging keeps its own persistent data, while each PR preview has an isolated disposable database. Both need predictable synthetic logins without sharing storage or weakening production defaults.

## Scope
Add an explicit non-production demo mode that reconciles a member and administrator account at startup and advertises those credentials on the login screen. Do not seed production, share databases, or add real user data.

## Acceptance criteria
- Demo mode is disabled by default and enabled only through deployment configuration.
- Enabled instances create or reconcile deterministic member/admin users and expose login shortcuts.
- Preview and staging instances use the same credentials but separate databases.
- Existing owner isolation and production registration behavior remain unchanged.

## Approach
Add typed demo configuration, an idempotent startup reconciler, a public endpoint available only in demo mode, and login-screen account cards. Cover configuration, persistence, API exposure, and login behavior.

## Progress
- [x] Add configuration and deterministic account reconciliation.
- [x] Add login-screen shortcuts and API.
- [x] Add tests and deployment documentation.
- [x] Verify, commit, push, and deploy through `staging`.

## Decisions
- 2026-09-24: Use explicit `DEMO_ACCOUNTS_ENABLED`; never infer safety from hostnames or `NODE_ENV`.
- 2026-09-24: Use fixed synthetic credentials only after explicit enablement so previews can inherit one staging setting without shared persistence.

## Verification
`npm run check` passed with 95 tests passing and 3 skipped. PR #21 merged to `staging` at `16db663`; Dokploy staging and preview environments were configured with `DEMO_ACCOUNTS_ENABLED=true`. Public staging health, credential advertisement, and both member/admin logins returned HTTP 200.

## Risks and recovery
Demo credentials are intentionally public and must never be enabled in production. Disable the flag and restart to remove credential advertising; seeded synthetic accounts can then be removed separately if desired.
