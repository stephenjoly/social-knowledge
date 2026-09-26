# Preview layout and functional readiness

Status: active
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
- [ ] Shared Activity sizing and safe failure UI.
- [ ] Knowledge base diagnosis and fix.
- [ ] Integration, checks, preview delivery, readiness report.

## Verification

`npm run check`; focused Playwright with synthetic data, including cross-page dimensions, scrolling, safe failure copy and Knowledge base browsing. Verify preview asset identity after push.

## Risks and recovery

Preserve existing persisted histories and owner isolation. Unknown historic failure detail stays unknown. Roll back scoped commits if needed. Real provider and production credentials remain outside this preview task.
