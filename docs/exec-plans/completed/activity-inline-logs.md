# 04D Activity and inline logs

Status: complete; implementation ready for draft PR review
Owner: Codex foreman
Started: 2026-09-25

## Reference and current state

The design source is frame 04D · Activity / inline logs (A5sRX) in /Users/stephenjoly/Documents/Coding/social-knowledge/ui.pen. The ui.pen in this Paseo worktree is an older, different copy. A reviewable export of the approved frame is in [the 04D reference image](../../design/activity-04d-reference.png). Read the canonical file through Pencil MCP for its editable structure; do not edit either design file.

At the start of this work, the worktree had an uncommitted Activity prototype. Its card layout did not match 04D; its API sent an internal note path in job responses, and its Retry all button could be disabled when failures fell outside the first 100 jobs. The prototype was preserved in checkpoint `b35e3dc` before the 04D rebuild.

## Scope and decisions

- Implement 04D Activity only. Do not redesign Inbox, Library, Ask, or Settings pages.
- Keep Facebook and Instagram as the only supported capture platforms. YouTube content in the mock is illustrative and does not add ingestion support.
- Match the 04D desktop sidebar: remove its primary Settings item. The account avatar/name/arrow opens a compact menu with Profile, Settings, and Log out; the adjacent gear opens Settings directly. Keep mobile Settings access.
- Preserve current authenticated account isolation and the existing capture modal/navigation behavior.
- No deployment, release, schema reset, or new dependency is in scope.

## Target behavior and visual contract

1. At 1440 × 900, match 04D's order and dense hierarchy: ACTIVITY / Capture activity header and Capture link action; a one-line summary strip; the capture table; then the lower Needs attention panel. Use the frame's 226px sidebar, roughly 36px content gutters, compact 43–49px rows, selected-row accent, 148px inline log, and 174px attention panel as comparison anchors.
2. The summary shows owner-scoped Active, Queued, Attention, Saved today, and events in the last ten minutes. Active excludes queued; the Active filter includes queued and processing jobs. Saved today counts completed captures in the viewer's local day. Recent events count account-owned job events in a rolling ten-minute window.
3. The capture table has Capture, Progress, Status, and Updated columns; source/title text; a five-stage labeled rail; and a disclosure control. Default to Active and expand the newest in-progress capture, falling back to the newest queued capture only when none is processing. All includes active, failed, and completed captures with pagination beyond the first page. One row is expanded at a time, including across filter changes.
4. Present five visual stages over the existing pipeline: Added (queued), Found (source entered download flow), Media (downloading/processing), Text (transcribing/translating/analyzing), Saved (writing/complete). A pending stage is pale, the current stage outlined, completed stages filled, and the stage where processing stopped is failed. Keep detailed runtime status names in the Status column and log. Stage hover exposes duration; the expanded log exposes it on touch devices.
5. The selected row expands an inline, table-like Processing logs panel. Each safe entry has time, controlled action/message, and precise duration (ms, s, running, or pending). Copy logs copies only this safe projection and gives success/failure feedback. Do not invent download progress or source metadata absent from real job events; use controlled text for available events.
6. Needs attention stays below the table, fixed-height and independently scrollable. Show the full account-owned failure set through paged loading, sorted by fixed failure priority then newest update. Show source, safe failure guidance, and retry count derived from persisted retry events. Individual Retry and Retry all show pending/disabled and final outcome feedback. Retry all attempts every eligible account-owned failed job, including those not loaded in the viewport.
7. At tablet and mobile widths, preserve the information and actions without horizontal overflow. Collapse table columns into a compact row layout, keep all five labeled stages and inline duration access, and retain the existing mobile bottom navigation.

## API and data approach

- Replace JobRecord spreads in Activity responses with an explicit allowlisted DTO: ID, validated source URL/label, display title, known status/failure code, attempt/retry count, timestamps, and derived stage state/timing. Never expose resultNotePath, raw error/errorDetail, owner IDs, notes, provider settings, credentials, cookie values, or internal paths.
- Return safe Activity summary counts independently of the 100-job display limit. Add cursor pagination for All history and a separate owner-scoped, priority-sorted failed page for Needs attention. Drive Retry all availability from the server failed count, never the visible slice.
- Return a safe timeline for a selected owned job. Use exact event timestamps and deterministic created_at, rowid order; compute millisecond durations and running/pending states. Derive retry count from Manual retry requested events, avoiding a schema change. Whitelist controlled log copy on the server and validate status/failure codes; the UI also refuses unknown messages.
- Make bulk retry select and update every failed job for the authenticated owner, with status checks and safe fixed error codes. Publish live events only for successful transitions. Add an index only if query-plan evidence shows the paged queries need one; any index migration must work with existing SQLite files.

## Work sequence and delegation

1. Foreman: capture the current task-owned diff as a recoverable checkpoint, inspect current branch/upstream, and write the shared Activity DTO and five-stage contract. Keep the old UI visible for review until replacement is verified.
2. API Worker, isolated worktree: own src/ Activity projection, summary/timeline/paging/bulk retry and test/ coverage. Do not edit web/ or the design file. Verify owner isolation, safe responses, exact timings, and failures older than 100 newer jobs.
3. UI Worker, separate isolated worktree: own Activity and account UI/CSS plus Activity browser tests. Build against the agreed DTO using synthetic fixtures. Do not edit src/ or the design file. Verify desktop 04D hierarchy, responsive layout, expansion, controls, and copy feedback.
4. Foreman: integrate the workers' changes into the feature branch, resolve contract mismatches, update product/engineering docs and this plan, then run final checks. Ask a third Worker for read-only security and visual review of the integrated diff; correct findings and recheck. Commit and push task-scoped checkpoints to the feature branch, and use a draft PR targeting staging for review. Do not merge or deploy as part of this plan.

## Acceptance and verification

- Review a 1440px desktop screenshot beside frame A5sRX; confirm page order, density, table columns, rail labels/states, selected-row log, lower attention panel, account menu, and Settings gear.
- Browser-check a 390px mobile viewport and a tablet width for no horizontal overflow and accessible touch durations.
- Exercise Active default/newest expansion, exclusive row selection, All pagination, safe Copy logs, fixed scrolling, individual retry, Retry all pending/disabled feedback, and live refresh with synthetic jobs.
- API tests cover a completed job with an internal note path, a raw diagnostic containing synthetic credential/path data, unknown event text, cross-account reads, exact millisecond timing, failed/queued/completed rails, retry history, and an older failed job hidden behind 100 newer jobs.
- Run focused tests during each workstream, then npm run check and authenticated Playwright against a disposable local instance. Re-run relevant checks after integration. No production data or credentials.

## Risks and recovery

- The current prototype has known privacy and count bugs. Do not ship it as-is. Preserve its diff/checkpoint before replacement so selected logic can be recovered and every change remains reviewable.
- Status-to-stage mapping is a presentation layer; it must not claim an unrecorded event happened. If 04D's example log detail is unavailable, show honest controlled copy rather than invented progress.
- Paged reads and live updates can race. Use stable cursors, request guards, and refreshed counts after retry.
- Keep persistent SQLite compatibility. If an index is needed, test migration from an existing-shaped database and retain normal rollback through reverting the feature branch.

## Progress

- [x] Located and inspected the correct 04D design in the main checkout.
- [x] Reviewed the uncommitted prototype and identified reusable logic and defects.
- [x] Confirmed scope, supported platforms, and desktop Settings navigation with the owner.
- [x] Owner approves this plan.
- [x] API and UI workers implemented in isolated worktrees (`01361e0`, `3a0a1ca`).
- [x] Foreman integrated both commits, corrected running durations and displayed source links, and passed `npm run check` (108 tests) plus the focused authenticated Activity browser test.
- [x] Independent read-only review found malformed-ID responses and a stale branch-local design file. Malformed IDs now return fixed 400 responses; the canonical 04D frame is exported into `docs/design/` for PR review without altering either `.pen` file.
- [x] Final `npm run check`: 23 files, 108 tests passed. Focused Activity Playwright passed at desktop, tablet, and mobile widths on a disposable local app. The full local browser run passed nine cases; its seeded Lisbon archive case cannot run against this empty disposable account.
- [x] Documentation and draft PR checkpoint prepared. Broader redesign preview acceptance remains tracked in `pen-dev-ui-refresh.md`.
