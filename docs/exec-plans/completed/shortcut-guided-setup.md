# Guided Shortcut credentials and diagnostics

Status: completed
Owner: Codex
Started: 2026-10-16

## Context
Release #46 ships signed templates but requires manual general-purpose key creation and has no standalone connection check.

## Scope
Capture-only credentials, guided key creation/copy, and a bearer-only diagnostic. Keep the native-tested v6 templates; one paste during import remains. Automatic pairing and re-signing are separate work.

## Acceptance criteria
- Guided setup creates named capture-only keys and supports copy failure recovery.
- Capture keys submit links and read owner-scoped receipts, but cannot access Agent API or MCP knowledge.
- Existing keys retain access through an additive migration.
- Connection checks reject revoked/suspended keys even with a valid browser session and create no jobs.
- UI distinguishes browser/key verification from actual iPhone execution.

## Approach
Add a constrained scope column, enforce it at knowledge authorization boundaries, and reuse the existing create/revoke API with an optional validated scope. Add a no-store bearer diagnostic and scoped setup UI.

## Progress
- [x] Inspect current release and credential consumers.
- [x] Implement and verify API, migration, and browser flow.
- [x] Publish draft PR #47 and record checks.

## Decisions
- 2026-10-16: Preserve the signed v6 import contract; guided creation removes name/permission choices while retaining one explicit copy/paste. No user secrets enter downloads or URLs.

## Verification
Run scope/isolation/migration tests, npm run check, and Settings Playwright acceptance.

## Risks and recovery
Old application versions do not enforce scope. Revoke capture-only keys before rolling back to an older version. The additive column preserves existing records; no destructive migration is required.

## Results
- Draft PR: https://github.com/stephenjoly/social-knowledge/pull/47 (targets staging).
- npm run check: documentation, types, build, 163 tests passed; 3 existing tests skipped. Temporary Python runtime under /tmp supplies the pre-existing generator-test dependency.
- Settings Playwright: desktop geometry and mobile guided setup, copy success/fallback, credential test, signed-download hash/header checks, and revocation passed. Temporary Chromium/libraries under /tmp were required on this host.
- Live disposable PR preview: health, synthetic member login, capture key creation, diagnostic, denied knowledge access, and revocation passed; synthetic test key removed.
- Live preview browser navigation could not complete on this host; local real-browser acceptance and live preview API verification are recorded separately. No new iPhone/native execution or production deployment claimed. Signed v6 artifacts are unchanged.
