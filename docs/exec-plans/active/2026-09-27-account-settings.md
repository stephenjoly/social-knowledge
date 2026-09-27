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
- [x] Implement backend and migration coverage.
- [x] Implement settings UI.
- [x] Review integration and run local CI/browser checks.
- [x] Create draft PR #31 targeting staging with the initial plan checkpoint.
- [ ] Push remaining feature commits after preview storage isolation is resolved.
- [ ] Verify Dokploy preview and report its URL and release identity.

## Decisions
- 2026-09-27: User requested GPT-5.6-Sol with low thinking for workers; retain Worker auto-review permissions.
- 2026-09-27: User requests local CI checks because GitHub Actions cannot currently run. Do not change CI configuration or treat unavailable Actions as passing.
- 2026-09-27: User confirmed initials/color avatars; uploaded-image storage is outside this implementation.
- 2026-09-27: PR #31 automatically provisioned its Dokploy preview without Actions. Runtime inspection found the preview inherited staging's named volumes despite the documented disposable-storage contract. Live mutation acceptance is paused until isolation is corrected; investigate supported preview configuration before choosing remediation.

## Verification
Install lockfile dependencies with `npm ci`; run `npm run check` (docs, TypeScript, production build, Vitest). Run Playwright against synthetic disposable local data and affected preview journeys. Check runtime release SHA and preview health.

Backend verification uses Node 22.22.3 and covers profile/password changes, authorization failures, additive legacy-schema migration/reopen, suspension across session/API/OAuth/MCP authentication, credential restoration, and password-change rate limiting. Local FFmpeg is 8.1.1 on macOS; CI's Ubuntu package pin is not reproduced on this host.

## Risks and recovery
Access control changes require coverage across browser sessions, API keys, and OAuth/MCP. Migrations must be additive and preserve existing data. Preview uses isolated disposable storage. Revert the feature changes for rollback; no production deployment is included.

Integration review: desktop header stacking and mobile overflow fixes are implemented. The invitation table keeps newly generated links in component memory; row copy actions show a selectable URL only after clipboard failure. Final Node 22 verification passed: `npm run check` (139 tests), focused browser checks (6 passed), and full browser suite (10 passed, 4 credential-gated skipped, 0 failed). Desktop and mobile screenshots were inspected; role menus and suspension dialogs are clickable without forced interactions. The proposed dedicated mount-free preview Application remains unapproved; newer feature commits are held locally because pushing would redeploy against shared staging volumes.
