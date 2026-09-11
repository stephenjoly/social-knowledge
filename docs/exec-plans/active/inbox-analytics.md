# Inbox analytics

Status: active
Owner: unassigned
Started: 2026-09-10

## Context

Inbox pagination intentionally reports only the number of captures currently loaded. That number is useful for understanding the visible result set, but it does not answer the user's basic operational questions: how large the archive is, whether it has grown recently, and whether imports need attention.

The Inbox should present a small, exact summary without coupling those counts to search filters or adding a total-match query to every paginated capture request.

## Scope

Included:

- an authenticated, owner-scoped Inbox analytics API;
- exact counts for total captures, captures saved in the rolling previous 24 hours, and imports currently in the terminal `failed` state;
- a compact, responsive Inbox summary in the browser;
- refresh behavior after relevant live job events; and
- database, API, and browser coverage for count semantics and owner isolation.

Excluded:

- charts, trends, historical snapshots, comparison periods, and materialized counters;
- counts affected by the current Inbox search or filters;
- Library and Unclassified list pagination;
- analytics in agent or MCP interfaces;
- authentication, sign-up, password reset, roles, or administrator features; and
- telemetry about user behavior.

## Product semantics

- **Total captures** counts rows in `captures` owned by the authenticated user.
- **Saved in last 24 hours** counts owned captures whose `created_at` is at or after a server-calculated UTC cutoff exactly 24 hours before the request. It measures successful capture creation, not job submission.
- **Failed imports** counts owned jobs whose current status is `failed`. A successfully re-queued job no longer contributes to this count. Historical failed attempts are not counted.
- All three values describe the user's whole account. Search, platform, category, topic, and pagination state do not alter them.
- Counts are non-negative integers. Empty accounts return zero for every metric.

## Interface

Add an authenticated endpoint:

```http
GET /api/v1/inbox-analytics
```

Response:

```json
{
  "totalCaptures": 142,
  "capturesLast24Hours": 6,
  "failedImports": 2,
  "generatedAt": "2026-09-10T12:00:00.000Z"
}
```

The response must not contain another user's data, internal paths, failure details, or a list of jobs. Existing capture and job response contracts remain unchanged.

Add a focused store method that accepts `ownerUserId` and a supplied cutoff timestamp. Prefer one parameterized aggregate statement (or an equivalently bounded transaction-consistent query) over loading captures or jobs into memory. Supplying the cutoff makes boundary tests deterministic; the HTTP layer owns the current clock and `generatedAt`.

## User experience

Replace the single prominent `captures shown` statistic with three labeled summary cards:

1. **Total captures**
2. **Saved in 24 hours**
3. **Failed imports**

The loaded-result count remains available near the result list as subdued context, especially when filters are active—for example, `48 captures loaded`. It must not be presented as the total archive size.

Requirements:

- Render stable skeleton or loading placeholders while analytics load; do not briefly display misleading zeroes.
- If analytics fail, keep the Inbox usable and show a compact retry action confined to the summary region.
- A failed analytics refresh must retain the last successful values and identify them as temporarily stale.
- Refresh analytics after job events that can change these values, including completion, terminal failure, retry, deletion, and archive-related events.
- Coalesce bursts of live events so they do not cause an unbounded request storm.
- Analytics requests use their own stale-request guard and must not interfere with capture-page loading.
- Format integer values with the user's locale and provide explicit accessible labels; color alone must not communicate failed imports.
- The failed-import card should navigate to or focus the Activity view filtered to failed jobs if that filtering can be added without broadening this slice. Otherwise it remains non-interactive.
- The layout must remain readable at the narrow mobile width used for share-and-review workflows.

## Acceptance criteria

- An authenticated user sees exact total, rolling-24-hour, and current-failure counts on the Inbox.
- Counts do not change when Inbox filters change or additional capture pages are loaded.
- Captures exactly on the inclusive 24-hour cutoff are counted; older captures are not.
- A failed job increments only its owner's failed count; retrying it removes it from that count.
- Completing a job and creating its capture updates total and recent counts after the live event refresh.
- Users cannot infer or retrieve another owner's counts.
- Empty accounts show three zero values after loading completes.
- Analytics failure does not prevent captures from loading, filtering, or paginating.
- Existing API, agent, MCP, Library, and Unclassified contracts remain compatible.

## Approach

1. Add a typed analytics result and an owner-scoped aggregate store query in `src/db.ts`.
2. Add the protected route and response type at the HTTP boundary in `src/app.ts`.
3. Add isolated analytics state, loading/error handling, and live refresh behavior in `web/main.tsx`.
4. Build the responsive summary presentation in the existing Inbox visual system.
5. Add deterministic store and API tests, followed by browser acceptance against synthetic data.
6. Promote through preview, permanent staging, and production using the repository's backup-first release process.

No schema migration should be necessary. Before adding an index, inspect `EXPLAIN QUERY PLAN` using a production-shaped synthetic database. Introduce an additive owner/status or owner/created-time index only if the query plan or measured latency establishes a need.

## Progress

- [ ] Confirm query plan and establish a synthetic performance baseline.
- [ ] Implement the store query and HTTP endpoint.
- [ ] Implement the Inbox summary and resilient refresh behavior.
- [ ] Add database and API coverage.
- [ ] Add browser acceptance coverage.
- [ ] Run `npm run check` and staging acceptance.
- [ ] Complete the backup-first production release and verify live behavior.

## Decisions

- 2026-09-10: Prioritize Inbox analytics ahead of Library and Unclassified pagination.
- 2026-09-10: Keep analytics account-wide and independent from Inbox filters and loaded-page size.
- 2026-09-10: Define recent saves by successful capture creation during a rolling UTC 24-hour window.
- 2026-09-10: Define failed imports by current terminal job state, not historical failure events.
- 2026-09-10: Defer caching, materialized counters, charts, and trend storage until observed performance justifies them.

## Verification

Automated coverage must include:

- multiple owners with different counts;
- an empty owner;
- captures before, exactly on, and after the 24-hour cutoff;
- queued, active, complete, failed, and retried jobs;
- API authentication and response shape;
- filters and pagination leaving analytics unchanged;
- analytics request failure and retry; and
- live-event refresh without stale responses or request storms.

Run focused Vitest coverage, the synthetic Playwright Inbox journey, and then:

```bash
npm run check
```

Staging acceptance must use synthetic data and verify all three values before and after a successful import, a terminal failure, and a retry.

## Risks and recovery

- A broad aggregate query could regress as the archive grows. Validate its plan and keep all predicates owner-scoped.
- Client event bursts could overload the endpoint. Coalesce refreshes and keep the endpoint bounded.
- Ambiguous timestamps can produce off-by-one behavior. Calculate one UTC cutoff per request and test the inclusive boundary.
- A count failure must degrade only the summary, not the Inbox result list.
- The change should require no persistent migration. If an index is added, use the compatible startup migration path. Roll back the application release if the new route or UI regresses; preserve the pre-release SQLite backup according to the deployment model.
