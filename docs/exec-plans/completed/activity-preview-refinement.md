# Activity preview refinement

Status: complete
Owner: Codex
Started: 2026-09-26

## Scope

Owner feedback on PR #28 preview: remove the three Inbox summary cards; refine the visually heavy Activity rail and selected-row treatment; explain and fix Saved captures whose inline history shows only Capture failed. This revises the earlier 04D visual acceptance. Preserve compact spacing, five-stage state clarity, safe logs, account controls, and supported platforms.

## Approach

- Foreman: remove Inbox summary UI and unused client logic; refine rail alignment, restrained marker sizing, readable log typography, and keyboard-only focus indication.
- Isolated API Worker: trace inconsistent persisted history and fix truthful safe projection with regression tests. Never disguise historical failures or invent missing stage detail.
- Integrate, verify desktop/mobile screenshots and browser interactions, run `npm run check`, push the existing feature PR, and verify its preview update.

## Acceptance

- Inbox opens directly into capture controls without summary cards.
- Progress connectors pass through marker centers; rails remain compact at wide widths; pointer selection has no heavy black outline and keyboard focus remains visible.
- Saved captures show current saved outcome; historical failures retain truthful state and durations, clearly separated from current outcome.
- No secrets, raw diagnostics, or filesystem paths reach logs or copied text.

## Progress

- [x] Preview feedback inspected; API worker assigned in isolated worktree.
- [x] UI refinement and history fix integrated.
- [x] Checks and desktop/mobile screenshots verified.
- Delivery: publish through existing PR #28; preview deployment confirmation tracked in the PR.

## Outcome and verification

Removed Inbox summary cards and their client requests while preserving coalesced live refresh. Refined rail sizing/alignment, row focus, and mobile log layout. Fixed the frontend label mismatch that discarded real API success events. The API now preserves failed attempt boundaries, excludes retry-wait time from failure duration, and leaves uncertain legacy durations unknown. Historical failures remain visible rather than being recast as successes.

`npm run check` passed (110 tests). Three focused Playwright journeys passed: Activity, Inbox controls, and Inbox live refresh. Desktop (1440px), tablet (900px), and mobile (390px) checks cover rail alignment, pointer/keyboard focus, saved history, safe copy, and overflow. Screenshots were inspected locally. No merge or production deployment.
