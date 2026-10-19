# Shared implementation brief: approved UI v2 UX follow-through

Status: completed. Owner accepted the delivered UI for production on 2026-10-19. Parent owned coordination. Work only in
`/home/paseo/.paseo/worktrees/0ztajp0b/humble-swan`, existing branch and PR #50.
Approval: Stephen explicitly requested all 28 items implemented with paired QA
and a final independent CX review. See [acceptance matrix](../../design/ui-v2-ux-addendum.md).

Start with preflight, context.md, relevant source documents, the addendum, and
`artifacts/ux-review/report.md`. References: `docs/design/ui-v2/screens/`, exact
geometry `docs/design/ui-v2/pen-sources/` (sprelude.js SB for sidebar).
Use only synthetic data and deterministic providers. No real provider calls.
No secrets, raw diagnostics, untrusted instructions, or cross-owner access.

## Ownership and staged assignments

- UI A implementation Worker (Opus high): `web/main.tsx`, app-shell, Inbox,
  Activity, capture dialog, palette, related CSS, and shared types. Items 01–11,
  17–18, 20, Activity/mobile parts of 28. Never edit backend/tests/docs.
- UI B implementation Worker (Opus high): `web/pages/ask.tsx`, `ask-format.ts`,
  `settings.tsx`, `web/account-settings.tsx`, `web/ask.css`, `web/settings.css`,
  `web/settings-ui.tsx`, `web/shortcut-setup.tsx`, and dedicated new B helper files.
  Items 12–16, 19, 21–27, remaining 28. Ask A to wire App callbacks/guards; never
  edit A's files. Starts after backend QA frees a slot, with disjoint ownership.
- Backend implementation Worker (Codex medium): `src/**` only, item 08 and safe
  retained-capture/reopened-Ask contracts when necessary. Coordinate API changes
  through parent. No UI/tests/docs edits.
- Backend QA Worker (Codex medium): `test/ui-v2-ux-backend.test.ts` and the existing
  Activity API safe-field assertion; independent migration/ownership/recovery tests
  and review. Completed: 21 independent tests, 41 combined tests passed.
- UI QA A (Codex medium): `scripts/**` and `e2e/**` except QA B's files below.
  Independent A journeys; no runtime edits. Final focused browser QA passed 13/13.
- UI QA B (Codex medium): `e2e/ui-ux-b.spec.ts`, `e2e/account-management.spec.ts`,
  `e2e/provider-settings.spec.ts`, `test/ask-format.test.tsx`, and
  `test/ui-v2-ux-ask.test.ts`. Independent B journeys, no runtime edits. Coordinate
  shared fixture changes through QA A. Starts after QA A's preparation turn ends.
- Parent: documentation, integration, git, preview, final checks; no concurrent
  runtime edits. All agents visible in workspace `wks_8862c7d8167ac752`.

Workers do not delegate, create worktrees/branches, commit, push, or modify PRs.
Do focused checks; shared build artifacts mean serialize screenshot/build runs
through parent. Send report to `artifacts/ux-implementation/<assignment>.md`
with item IDs, files, tests, remaining issues. Keep fixes within assigned paths.

## Archive API contract (item 08)

Use an additive nullable archived timestamp on jobs (public `archivedAt`).
Only terminal `failed` + `unsupported_platform` jobs may be archived. Owner-scoped
`POST /api/v1/jobs/:id/archive` and `POST /api/v1/jobs/:id/restore` return `{job}`
using the existing safe Activity projection. Repeated same-state operations are
idempotent; invalid targets return 409, invalid input 400, unowned/missing 404.
Archive does not erase URL, events, or history and never queues a job. Normal
Activity/all/failed counts exclude archived jobs; `filter=archived` provides a
paginated recovery view. Direct owner inspection still works. Bulk retry excludes
archived jobs. Existing records migrate with null state. Preserve safe projections.
If implementation evidence requires changing this contract, tell parent before
changing it. No frontend dependency on raw backend records.

## Verification sequence

1. Backend implementation + independent backend QA, while UI milestone A runs.
2. UI QA starts after backend slot opens; pair findings with UI owner.
3. Fresh UI milestone B assignment; continue paired QA.
4. Parent integration/full checks; one final independent CX review and visual
   comparison. Address findings, then push and verify preview build/journeys.
5. Record all 28 evidence entries, update product/architecture/execution plan,
   complete plan and mark only PR #50 ready after acceptance.

Source `~/.cache/sk-browser/env.sh` for browser libraries. Existing harness:
`npx tsx scripts/ui-e2e.ts` (seeded tests), `scripts/ui-screens.ts` (15 screens),
`scripts/ui-compare.ts` (side-by-side). Six shortcut-generator failures are known
local missing-python3 failures; no other unexplained failures are acceptable.

## Evidence ledger

- Backend complete: 21 new independent tests / 41 combined tests pass; checkpoint
  `5d9d184`.
- UI A's Claude session ended at its provider limit (reset 03:30 UTC); its partial
  changes and selector report are preserved. UI B reported implementation complete.
- At Stephen's request, visible GPT-6.1-Sol high worker
  `c9cf1a23-b4e6-415e-ad26-e88bff0aa61e` now owns functional TypeScript changes in
  `web/**`, taking over both stopped UI workers. No simultaneous UI file editors.
  Host policy still reserves CSS/layout/visual-fidelity work for Claude; that gate
  remains open. Parent fixed only the type-only NodeNext import in ask-format.
- Final combined check passed documentation, typecheck, and build. Units: 249
  passed, 3 skipped, and only the six known missing-python3 failures. All 46
  focused Activity/Ask tests pass.
- QA A passed 13/13 browser scenarios on the initial stable build, including
  exact-job mobile recovery and delayed old-owner responses after same-document
  account switching. QA B passed 13/13 on the final rebuilt ID15/16 delta,
  including strict citation focus and reading-position restoration. Both suites
  released their servers and build slots. A did not rerun the B-only delta;
  parent subsequently ran the combined suite against the final build: 33/33
  passed in 48.4 seconds, closing that evidence gap.
- Fresh independent GPT-6.1-Sol high CX reviewer
  `e74c329f-90c8-4ccd-a78e-87beaa6244aa` reviews every acceptance item against
  code and independent evidence. Its scope excludes visual-fidelity judgments.
- Its Capture focus-transition finding was fixed and independently verified:
  queued and retained-setup receipts focus their primary action, Capture another
  focuses Post link, modal Tab recovers outside focus, and Escape restores the
  opener. The final complete browser suite passed 35/35 (46.9 seconds).
- Final independent CX review recommends all 28 IDs as functionally addressed
  after closing its focus finding. Final runtime `09269f9` passed GitHub CI,
  including the Python-dependent tests. Visual acceptance remains pending.
  No acceptance is inferred from screenshots alone or workers' self-assessment;
  physical-phone behavior is explicitly unverified.
- Parent completed final live asset identity and member/admin desktop/mobile
  journeys on runtime `09269f9`, including receipt keyboard continuity and
  reversible synthetic-bookmark cleanup. Evidence and matching reference/live
  screenshots are under `artifacts/ux-live-preview/`. No real provider calls;
  exact visual sign-off remains the outstanding draft-PR gate.

Owner subsequently requested production promotion after the final evidence and
visual-review limitation were disclosed. All functional items are accepted; no
automated pixel-fidelity or physical-phone claim is added. See the completed
[execution plan](ui-redesign-v2.md) and the staging-to-main release PR for promotion.
