# Guided Shortcut credentials and diagnostics

Status: active
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
- [ ] Implement and verify API, migration, and browser flow.
- [ ] Publish draft PR and record checks.

## Decisions
- 2026-10-16: Preserve the signed v6 import contract; guided creation removes name/permission choices while retaining one explicit copy/paste. No user secrets enter downloads or URLs.

## Verification
Run scope/isolation/migration tests, npm run check, and Settings Playwright acceptance.

## Risks and recovery
Old application versions do not enforce scope. Revoke capture-only keys before rolling back to an older version. The additive column preserves existing records; no destructive migration is required.
