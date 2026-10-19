# Ship approved Unfold landing

User authorization: “great, ship it”. Ship the reviewed landing, footer and `/` / `/login` / `/app` routing through the existing staging-to-main/Dokploy process; preserve the explicitly deferred installer/Shortcut onboarding preview. No redesign, production data fixtures, secret output, API-key creation or infrastructure changes.

## Integration

Resume branch `codex/consumer-landing-unfold`, PR49 → staging, workspace `wks_4d5154f1b923fb81`. Staging advanced to `acde31e` with the app-v2 extraction/redesign. Parent merged it and resolved mechanical conflicts by retaining extracted components/account generation guards, relocating the expired-session redirect to `web/shared/api.ts`, keeping `/app` URLs in acceptance tests, and preserving old root `capture=1` bookmarks. Library View all must remain inside `/app`.

## Boundaries

- Parent owns integration/runtime code, release bookkeeping, PR/merge/deployment, full checks and browser acceptance.
- Coverage worker owns only `test/browser-routes.test.ts` and optional new `e2e/public-routing.spec.ts`; no existing app/UI files, git, packages or remote mutations.
- Independent review worker is read-only: review runtime/auth/build integration, scope/plan completion and approved visual contract; report concrete findings without edits or more delegation.

## Acceptance

Public root shows approved Unfold/footer. `/login` reuses current app-v2 auth. Private app requires session and retains destination; logout and expired sessions return to login. Existing root tab/job/capture links, fragment invitations and OAuth continue to work without token leakage/open redirects. API/Shortcut/MCP endpoints and owner isolation remain unchanged. Runtime image contains landing assets. Tests/build pass on merged staging; synthetic PR preview and combined staging match tested SHA. Before authorized production promotion verify online SQLite backup, retained rollback image and mounts; verify actual resulting production SHA and affected user flows.

Plans: `docs/exec-plans/completed/public-app-routing.md` and `approved-landing-polish.md`; explicit onboarding deferral is not missing scope. Preview currently http://website-preview--codex-consumer-landing-unfold--socia--19cf8255.localhost:6767/ . No real production credentials or personal data belong in tests or chat.
