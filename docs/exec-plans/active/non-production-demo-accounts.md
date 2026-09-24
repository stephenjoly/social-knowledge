# Non-production demo accounts

Status: active
Owner: Codex
Started: 2026-09-24

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
- [ ] Add configuration and deterministic account reconciliation.
- [ ] Add login-screen shortcuts and API.
- [ ] Add tests and deployment documentation.
- [ ] Verify, commit, push, and deploy through `staging`.

## Decisions
- 2026-09-24: Use explicit `DEMO_ACCOUNTS_ENABLED`; never infer safety from hostnames or `NODE_ENV`.
- 2026-09-24: Use fixed synthetic credentials only after explicit enablement so previews can inherit one staging setting without shared persistence.

## Verification
Run focused auth/config/database tests, `npm run check`, and validate the deployed staging login page.

## Risks and recovery
Demo credentials are intentionally public and must never be enabled in production. Disable the flag and restart to remove credential advertising; seeded synthetic accounts can then be removed separately if desired.
