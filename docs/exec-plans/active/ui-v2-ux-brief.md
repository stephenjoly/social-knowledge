# Shared implementation brief: approved UI v2 UX follow-through

Status: active. Parent owns coordination and this file. Work only in
`/home/paseo/.paseo/worktrees/0ztajp0b/humble-swan`, existing branch and PR #50.
Approval: Stephen explicitly requested all 28 items implemented with paired QA
and a final independent CX review. See [acceptance matrix](../../design/ui-v2-ux-addendum.md).

Start with preflight, context.md, relevant source documents, the addendum, and
`artifacts/ux-review/report.md`. References: `docs/design/ui-v2/screens/`, exact
geometry `docs/design/ui-v2/pen-sources/` (sprelude.js SB for sidebar).
Use only synthetic data and deterministic providers. No real provider calls.
No secrets, raw diagnostics, untrusted instructions, or cross-owner access.

## Ownership and staged assignments

- UI implementation Worker (Opus high): `web/**` only. Milestone A: items 01–11,
  17–18, 20, Activity/mobile parts of 28. Milestone B, fresh assignment: Ask and
  Settings items 12–16, 19, 21–27, remaining 28. Never edit backend/tests/docs.
- Backend implementation Worker (Codex medium): `src/**` only, item 08 and safe
  retained-capture/reopened-Ask contracts when necessary. Coordinate API changes
  through parent. No UI/tests/docs edits.
- Backend QA Worker (Codex medium): `test/ui-v2-ux-backend.test.ts` only; independent
  migration/ownership/recovery tests and review. Report findings to parent.
- UI QA Worker, staged when a slot opens (Codex medium): `e2e/**`, `scripts/**`,
  and specifically assigned UI unit tests. Independent journeys for every item,
  no runtime edits. Coordinate deterministic fixtures with implementation.
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

Implementation and QA pending. Final CX pending. No acceptance inferred from
screenshots alone or from workers' self-assessment.
