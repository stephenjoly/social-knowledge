# Recover public Instagram captures after authenticated metadata failures

Status: complete (implementation and preview acceptance; production not promoted)
Owner: Stephen / Codex
Started: 2026-11-11

## Context

Recent Instagram saves fail in yt-dlp's authenticated video-info request with
`Failed to parse JSON`. A metadata-only probe of the same failed Reel from the
production runtime without cookies succeeds and returns video formats. Saved
cookies force the authenticated route on every job retry. These errors do not
establish whether the saved session expired or Instagram blocked the request.

## Scope and behavior

- Keep the existing authenticated first attempt and per-user cookie selection.
- When an Instagram attempt using cookies fails with the observed JSON parse
  error, retry the same URL once without cookies in the same download operation.
- Clear incomplete outputs before the anonymous attempt. Preserve source URL,
  media limits, format selection, comments, and downstream capture processing.
- An anonymous success must not mark the saved authenticated connection as
  validated or successfully used. Leave stored cookies intact for private posts.
- If the anonymous attempt fails, return its classified failure. Keep explicit
  private-post, authentication, unavailable, and limit failures actionable.
- No screen changes. Existing Activity retry and capture submission use this
  behavior automatically after deployment.

## Acceptance criteria

- A cookie-backed Instagram JSON parse failure followed by an anonymous success
  produces the expected download result, with no stale outputs or cookie flags.
- Both uploaded and configured Instagram cookie sources receive the fallback.
- There is at most one anonymous attempt per download call. Its failure remains
  classified, temporary cookie files are removed, and secrets never enter logs.
- Anonymous success does not update the saved connection's successful-use time.
- Facebook, successful authenticated requests, already-anonymous requests, and
  unrelated errors retain their existing behavior.
- Regression tests fail against the original implementation; focused tests and
  `npm run check` pass with the fix. Run synthetic subprocess checks in the native
  preview and verify release identity before calling the change operational.

## Out of scope

No cookie replacement/deletion, account-login automation, connection UI changes,
database migrations, downloader upgrades, automatic retry of existing failed
jobs, or changes to Facebook extraction. Production promotion follows the
existing staging, backup, and release process.

## Approach and verification

Change `src/downloader.ts`, extend behavioral tests at the subprocess boundary,
and document fallback behavior in `docs/guide/self-hosting.md`. Use synthetic
media and cookie fixtures only. Submit a task-scoped PR targeting `staging`;
record its preview, checks, and release status here.

Run `node scripts/verify-instagram-fallback.mjs` after building for a real
subprocess/filesystem smoke using only synthetic inputs. In a preview runtime,
run the same script from `/app` with `--check-ytdlp` to also check the installed
downloader's anonymous flags. The script removes its temporary database and media.

## Progress

- [x] Isolate the failing authenticated route with a read-only production probe.
- [x] Scope approved by Stephen on 2026-11-12.
- [x] Implement fallback and demonstrate regression coverage (8 failures before
      the fix; all 35 downloader/connection/failure tests pass afterward).
- [x] Run checks and review the diff (424 tests, type checks, documentation/site
      checks, production build, and real subprocess/filesystem smoke pass).
- [x] Verify native preview; record staging/production rollout status.

## Verification evidence

- Before implementation, 8 new behavioral cases fail against the original code.
- After implementation, all 35 focused downloader/connection/failure tests pass.
- `npm run check`: 43 test files and 424 tests pass; docs/site, type checks, and
  production build pass. Existing bundle-size advisory remains unchanged.
- `node scripts/verify-instagram-fallback.mjs`: passes using real subprocesses,
  synthetic cookies/media, an isolated temporary database, and automatic cleanup.
- One review pass found no additional changes needed. No UI, schema, production
  credentials, or existing failed jobs were changed.
- PR: https://github.com/stephenjoly/social-knowledge/pull/81 (targets `staging`).
- Native preview: https://preview-social-knowledge-staging-y3qjds-ngo0yj.staging.stephenjoly.net
- CI passes. The healthy deployed runtime's compiled downloader matches the
  locally checked hash; its `--check-ytdlp` synthetic subprocess smoke passes.
- Preview public routing, login shell, static assets, private-app redirect,
  health, and protected API smoke pass. Production has not been promoted.

## Deployment decision

Stephen confirmed that all previews intentionally share the synthetic staging
database. The existing staging database, vault, and media mounts are preserved;
no deployment settings were changed. The deployment guide and agent map now
describe that shared non-production storage. Backend smoke fixtures use temporary
storage and remove only the data they create.

## Risks and recovery

Public metadata may be less complete than authenticated metadata. Private posts
still require a working login. The anonymous request can also be blocked; retain
its explicit failure rather than looping. Revert this feature commit to restore
the original download behavior; no persistent-data changes are required.
