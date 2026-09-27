# Implement account settings designs 37–41

Status: active
Owner: Codex orchestrator and GPT-5.6-Sol workers
Started: 2026-09-27

## Context
The pen.dev source defines My account, People & access, role selection, account actions, and suspension confirmation. Current settings combine account facts and invitation administration; profile and access mutations are missing.

## Scope
Implement the five designs using the existing React/CSS system and pen.dev HTML/CSS export. Add validated profile, password, role, and suspend/restore APIs with compatible SQLite migrations. Preserve account isolation and existing invitation lifecycle. Deliver a verified Dokploy feature-PR preview targeting staging. Production promotion and GitHub Actions repair are excluded.

## Acceptance criteria
- My account edits persist and sign-in/security actions work.
- Administrators can search accounts, change eligible roles, and suspend/restore access with confirmation.
- Suspension blocks authenticated access while preserving private account records and credentials.
- Members cannot administer accounts; self/last-administrator protections are enforced server-side.
- Desktop design matches the source and mobile layouts and dialogs remain usable.
- Local CI-equivalent checks and browser acceptance pass; preview release identity matches the final commit.

## Approach
Three workers share this isolated workspace with disjoint file ownership: backend plus unit/integration tests; browser implementation; browser acceptance tests. Orchestrator owns documentation, integration review, local full checks, commits/PR, and preview verification.

## Progress
- [x] Preflight and fetch current origin/staging; clean task branch matches staging.
- [x] Inspect all five design frames and export their HTML/CSS as implementation reference.
- [ ] Implement backend and migration coverage.
- [ ] Implement settings UI.
- [ ] Review integration and run local CI/browser checks.
- [ ] Push feature checkpoints and create draft PR targeting staging.
- [ ] Verify Dokploy preview and report its URL and release identity.

## Decisions
- 2026-09-27: User requested GPT-5.6-Sol with low thinking for workers; retain Worker auto-review permissions.
- 2026-09-27: User requests local CI checks because GitHub Actions cannot currently run. Do not change CI configuration or treat unavailable Actions as passing.
- 2026-09-27: Avatar representation pending user preference; initials/color is the smaller implementation option.

## Verification
Install lockfile dependencies with `npm ci`; run `npm run check` (docs, TypeScript, production build, Vitest). Run Playwright against synthetic disposable local data and affected preview journeys. Check runtime release SHA and preview health.

## Risks and recovery
Access control changes require coverage across browser sessions, API keys, and OAuth/MCP. Migrations must be additive and preserve existing data. Preview uses isolated disposable storage. Revert the feature changes for rollback; no production deployment is included.
