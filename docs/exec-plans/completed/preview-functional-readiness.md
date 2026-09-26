# Preview layout and functional readiness

Status: complete
Owner: Codex
Started: 2026-09-26

## Context

Preview feedback identifies Activity-only spacing/type scale changes, insufficient failure explanations, confusing retry history, and a Knowledge base journey that appears broken. Visual approval does not verify AI/provider or API-key integrations.

## Scope

Align Activity with the shared page shell. Show safe failure causes and distinguish retry attempts truthfully. Reproduce and repair Knowledge base navigation/loading defects. Establish which end-to-end acceptance checks pass locally and which need isolated staging provider configuration. No production promotion or credential changes.

## Acceptance criteria

- Navigating between Inbox, Knowledge base, Ask, and Activity preserves sidebar and content gutter geometry.
- Activity type is readable at the shared page scale; expanded logs stay capped and scrollable.
- Failed logs explain known causes using controlled copy, with safe fallback for unknown legacy history; no raw diagnostics or secrets.
- Retry history distinguishes automatic and manual behavior without inventing historical causes.
- Knowledge base category/topic/capture flow tested with disposable data.
- AI/API-key readiness claims supported by evidence and remaining staging checks documented.

## Approach

Root owns layout, UI integration, browser checks, and delivery. Isolated workers own failure projection/persistence and Knowledge base investigation. Integrate scoped commits and run full checks before updating PR #28 preview.

## Progress

- [x] Preflight and bounded worker assignments.
- [x] Shared Activity sizing and safe failure UI.
- [x] Knowledge base diagnosis and fix.
- [x] Integration and checks complete; delivery via PR #28 preview. Readiness report in `docs/preview-acceptance.md`.

## Verification

`npm run check`; focused Playwright with synthetic data, including cross-page dimensions, scrolling, safe failure copy and Knowledge base browsing. Verify preview asset identity after push.

## Evidence so far

- Browser assertions confirm shared shell and sidebar geometry across all four main pages.
- Provider-settings, capture submission, and navigation browser checks pass with synthetic inputs.
- API-key test verifies issuance/use, masked listing, and rejection after revocation.
- Failure codes persist in an additive nullable event column; existing-database migration test preserves old history.
- Default worker limit is three attempts with 15s/30s waits. Manual retries reset the attempt cycle; the UI count explicitly describes manual requests. Policy is unchanged.

## Risks and recovery

Preserve existing persisted histories and owner isolation. Unknown historic failure detail stays unknown. Roll back scoped commits if needed. Real provider and production credentials remain outside this preview task.

## Outcome

Activity shares page/sidebar geometry with the other main routes, retains the 320px scrolling log panel, and displays safe failure causes with attempt and retry labels. Knowledge base Home now contains counts and navigable categories. The worker verified the existing preview category → topic → capture path; the defect reproduced at Home was generic placeholder content despite a populated tree, not missing notes.

Final integrated `npm run check`: 119 tests passed. Seven focused browser journeys passed: Activity, Knowledge base, provider settings, navigation history/cross-page geometry, capture submission, Inbox live refresh, and Inbox controls. API-key revocation is also verified. Live provider/network and external-client acceptance remain explicit pre-production requirements in the readiness document; this task does not certify production readiness or authorize promotion.
