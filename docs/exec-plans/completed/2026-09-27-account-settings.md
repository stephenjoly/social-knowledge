# Implement account settings designs 37–41

Status: completed
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
- [x] Push remaining feature commits after owner accepted shared staging demo storage.
- [x] Verify Dokploy preview and report its URL and release identity.

## Decisions
- 2026-09-27: User requested GPT-5.6-Sol with low thinking for workers; retain Worker auto-review permissions.
- 2026-09-27: User requests local CI checks because GitHub Actions cannot currently run. Do not change CI configuration or treat unavailable Actions as passing.
- 2026-09-27: User confirmed initials/color avatars; uploaded-image storage is outside this implementation.
- 2026-09-27: PR #31 automatically provisioned its Dokploy preview without Actions. Runtime inspection found the preview inherited staging's named volumes despite the documented disposable-storage contract. Live mutation acceptance is paused until isolation is corrected; investigate supported preview configuration before choosing remediation.

## Verification
Install lockfile dependencies with `npm ci`; run `npm run check` (docs, TypeScript, production build, Vitest). Run Playwright against synthetic disposable local data and affected preview journeys. Check runtime release SHA and preview health.

Backend verification uses Node 22.22.3 and covers profile/password changes, authorization failures, additive legacy-schema migration/reopen, suspension across session/API/OAuth/MCP authentication, credential restoration, and password-change rate limiting. Local FFmpeg is 8.1.1 on macOS; CI's Ubuntu package pin is not reproduced on this host.

## Risks and recovery
Access control changes require coverage across browser sessions, API keys, and OAuth/MCP. Migrations must be additive and preserve existing data. Owner accepted shared staging demo storage for PR #31; isolation remains technical debt. Revert the feature changes for rollback; no production deployment is included.

Integration review: desktop header stacking and mobile overflow fixes are implemented. The invitation table keeps newly generated links in component memory; row copy actions show a selectable URL only after clipboard failure. Final Node 22 verification passed: `npm run check` (139 tests), focused browser checks (6 passed), and full browser suite (10 passed, 4 credential-gated skipped, 0 failed). Desktop and mobile screenshots were inspected; role menus and suspension dialogs are clickable without forced interactions. The owner explicitly accepted redeploying the existing preview against shared staging demo storage. Feature commit `2d6ae81` was pushed and Dokploy automatically began its deployment; no preview Application configuration was changed.

- 2026-09-27: Owner confirms staging contains only demo accounts and accepts the shared-data impact for this preview update. Storage isolation remains tracked in technical debt; do not claim this preview has a separate database.

Live verification: Dokploy successfully deployed `2d6ae81df8fa0ba4243e543d14613d9c8331a6ef`. Preview: https://preview-social-knowledge-staging-y3qjds-oztnme.staging.stephenjoly.net/?tab=settings. Demo administrator login, My account, profile save, People & access, and the descriptive role menu passed live checks. Health returned HTTP 200. The served JavaScript SHA-256 matched the locally tested build (`3b1c6e5115c75b07edbaf9ab6e2d72dc0b4084b9d9dd1e7a722f4a0ae62d231c`). No staging branch merge or production promotion occurred.
