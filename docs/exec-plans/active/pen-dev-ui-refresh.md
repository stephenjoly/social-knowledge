# Replace the dashboard UI with the pen.dev design

Status: proposed; implementation awaits owner approval
Owner: Stephen Joly / Codex foreman
Started: 2026-09-24

## Context

The current React dashboard (`web/main.tsx`, `web/styles.css`) uses a dark palette and top navigation that the owner wants replaced. The Social Knowledge `ui.pen` document contains desktop and mobile flows for Inbox, Activity, Capture, Knowledge Base, Ask, and Settings. Frames 31–33 refine Inbox and AI Settings with a shadcn visual direction. This is a complete redesign of the application UI, including existing flows not explicitly drawn in pen.dev; it is not a backend feature project.

The backend already supports the core journeys. This branch keeps existing behavior and contracts stable, but may add narrowly scoped, backward-compatible API/data support required for functional controls in the approved design. The UI must use real account data rather than the design's sample values. Existing tests cover archive navigation, analytics, onboarding, and provider settings and provide regression evidence.

## Scope and boundaries

- Replace the old shell with the designed desktop sidebar, compact mobile header, bottom navigation, profile menu, content layout, light palette, typography, and interaction patterns. Use frames 01–29 and 31–33 as visual references. Keep Inbox and Knowledge Base separate; frame 30 remains an unapproved navigation concept.
- Redesign *all* existing UI surfaces: Inbox cards/table, filters, Activity, Capture, Knowledge Base, Ask, Settings, login, invitations, onboarding, capture detail, job details, menus, dialogs, empty/loading/error states, and less prominent account/admin/API key/export controls. For surfaces with no pen frame, apply the same tokens and components while preserving their current behavior.
- Build a project-owned React component layer with selected shadcn/ui source patterns and Radix primitives for accessible interaction; retain Lucide icons. Pen.dev supplies design intent, not generated production code.
- Backend changes in this PR are limited to necessary, owner-scoped support for the redesigned UI, with validation and tests. Do not change capture processing, existing provider behavior, or unrelated APIs. Do not add Anthropic. Do not implement thinking levels here.
- Thinking levels are a **separate feature branch and PR** from a fresh `origin/staging` base, with their own backend/API/migration tests and any needed AI Settings control. The UI redesign must remain mergeable and complete without that PR. Integrate the control later only after the independent feature is accepted.
- No production deployment in this plan. Feature PR targets `staging`; release promotion is separately authorized.

## Design-to-behavior rules

- Use real totals, not the drawn `248`/`12`/`2`. Add a backward-compatible rolling seven-day analytics field, label it “Past 7 days,” and preserve the existing last-24-hours field and callers.
- `GET /api/v1/captures` currently provides newest-first cursor pagination. Add validated archive-wide sorting only for the designed choices, with stable cursors and owner scoping, so the table headings and sort control can be functional. Keep the existing default query and response behavior unchanged.
- Implement the filter builder with existing search, platform, category, and topic filters only. Both tile and table views share filter state; filtering resets pagination as it does today.
- The AI Settings UI uses the live OpenAI/Cerebras providers and model options from `/api/v1/ai-providers`. Replace Anthropic and example model names in frame 33 with actual options. Omit the thinking-level selector on this branch; its separate PR can add it to the redesigned page.
- Mobile pen frames include a mock device status bar (`9:41`, signal, battery). Treat that as presentation context; do not render a fake operating-system status bar in the browser UI.
- Keep all existing user journeys, status messages, source URLs, source attribution, ownership boundaries, credential masking, export behavior, and provider-required guidance intact. Remove old CSS/layout after each replacement is verified; avoid two competing visual systems in the final UI.

## Acceptance criteria

- Every authenticated destination and auth/onboarding surface uses the new light visual system, responsive shell, and consistent components. No old dark shell, top navigation, or mismatched settings pages remain.
- Desktop navigation matches the pen sidebar; mobile navigation matches the compact header and bottom bar. Selection, browser back/forward, deep links, focus order, and sign-out work.
- Inbox tile/table switch, search, existing filters, cursor pagination, analytics, capture detail, image fallbacks, empty/loading/error/retry states work with existing endpoints. Table headings are truthful about sorting capability.
- Capture submission covers initial, invalid URL, submitting, success, and provider-required/error states without duplicate submission. Activity retains progress, details, actionable failure guidance, retry, and completed history.
- Knowledge Base tree, category and note selection, Markdown reading, capture/source links, and archive export work. Ask retains conversation history, streaming, citations, source opening, cancellation, and errors. Settings retains provider connections, task selections, language, platform connections, API keys, account administration, and exports.
- Modal, menu, sheet, filter, table, and form interactions have semantic labels, keyboard support, visible focus, focus return, screen-reader status for async work, and reduced-motion support. Layout is usable at 1440px, 390px, and an intermediate width without horizontal overflow or clipped controls.
- Existing HTTP methods, routes, and payloads remain compatible. Any added query/analytics fields have boundary, pagination, and cross-owner tests. `npm run check` and affected Playwright flows pass; preview screenshots are compared with pen.dev references using synthetic data.

## Approach

### 0. Baseline and conflict check

Before implementation, fetch `origin/staging`, inventory open PRs and their touched paths, and compare them with the UI branch. On 2026-09-24, the refreshed staging tip matches this worktree (no divergent commits). The only open PR found is [#3, editorial library theme](https://github.com/stephenjoly/social-knowledge/pull/3), an older draft that edits `web/main.tsx` and appends extensive styles to `web/styles.css`. It directly overlaps this redesign and should be superseded or deliberately reconciled, not merged blindly. Refresh this check before each integration checkpoint and before final review. Keep a matrix of frame → existing screen → states/actions → API. Record UI-only deviations from the drawings. Avoid merging a stale staging base or replacing features introduced by another PR. If a concurrent PR touches the same UI files, coordinate its merge order and replay the redesign on current staging rather than overwriting it.

### 1. Components and responsive shell

Extract the existing monolithic UI into page and component modules without changing behavior. Add design tokens for surfaces, ink, muted text, borders, soft selection, accent, typography, spacing, and focus. Add the shared Button, Input, Select, Dialog, DropdownMenu, Popover, Badge, Tabs, table, and form-field components actually needed. Implement desktop sidebar, profile menu, mobile header/bottom nav, page container, and navigation state. The shell must include all current pages and preserve query/deep-link behavior.

### 2. Inbox

Implement frames 01–03, 09–11, 14–15, and 31–32. Build tile and semantic table presentations over the same capture data; persist view preference locally. Extend the capture listing with validated sort keys/directions and stable account-scoped cursors so sorting applies across all pages, not just loaded rows. Add a seven-day analytics field while preserving the 24-hour field. Make filter sheet/panel and empty/loading/error states responsive. Preserve capture details and source attribution.

### 3. Capture and Activity

Implement frames 04–08 and 12–13. Redesign Capture as desktop dialog/mobile sheet wired to the existing submission flow. Redesign Activity into needs attention, processing, and completed sections over the current jobs endpoint. Preserve retry, job details, diagnostics, live updates, and error guidance.

### 4. Knowledge Base and Ask

Implement frames 21–29. Restyle tree navigation, categories, note reader, capture/source links, export dialog, desktop Ask, and mobile Ask. Preserve current Markdown handling, streaming, citations, conversation state, and source link sanitization. Handle long notes and small screens without clipped reading content.

### 5. Settings and unpictured surfaces

Implement frames 16–19 and 33 as a coherent Settings overview/topic layout using current OpenAI/Cerebras data and controls. Carry over every current settings section. Apply the same visual system to auth, invitations, onboarding, capture detail, admin/API key flows, job modal, and all existing error/empty/loading states that lack dedicated pen frames. Do not add new provider or thinking behavior in this branch.

### 6. Integration and rollout

Merge reviewed checkpoints into one integration branch and draft PR targeting `staging`. Run focused tests per area, then the complete check and browser acceptance in a disposable Dokploy preview using synthetic data. Compare screenshots to pen.dev at desktop/mobile/intermediate widths and review keyboard interaction. Merge current staging according to the project workflow, resolve concurrent UI changes deliberately, and repeat checks. Stage/release promotion is separate.

## Delegation after approval

Use the configured Paseo `codex-worker` profile: provider `codex`, model `gpt-5.6-terra`, mode `auto-review`, thinking option `xhigh`. Re-read the profile notes at launch. The foreman owns the design contract, task breakdown, integration, checks, and user decisions. Up to three workers may run concurrently in separate worktree workspaces; overlapping `web/main.tsx` or `web/styles.css` changes are serialized.

Initial bounded assignments: (A) component tokens and shared primitives; (B) Inbox sort/analytics API support with validation, pagination, and owner-isolation tests in a separate worktree; (C) a read-only regression/pen frame inventory and browser acceptance checklist. Subsequent assignments cover shell/page extraction, Inbox, Capture/Activity, Knowledge Base/Ask, and Settings plus unpictured surfaces. Each worker gets explicit files, acceptance criteria, verification, and a requirement to report blockers and changed paths. Workers do not delegate further.

## Separate thinking-level feature

Create a separate `codex/` branch and worktree from fresh `origin/staging`, separate draft PR, and separate execution plan if implementation spans sessions. Add account-scoped persisted reasoning selection, model-specific capability metadata, validated API input, provider request mapping for capture analysis/Ask, stable job selection, migration, and tests. OpenAI and Cerebras support depends on the configured model. Once that PR lands, add the selector to the redesigned Settings UI via that PR or a small follow-up PR; do not make the redesign PR depend on it. Anthropic remains out of scope.

## Progress

- [x] Review the pen.dev document, including new frames 31–33.
- [x] Inspect current React/API/test boundaries.
- [x] Confirm owner scope: complete UI replacement; narrowly necessary backend support allowed; thinking levels separate.
- [x] Owner authorized continuing with the full redesign after verifying current staging.
- [ ] Refresh staging/open-PR baseline and create implementation branch/worktrees.
- [ ] Implement foundation and shell.
- [ ] Implement Inbox, Capture/Activity, Knowledge Base/Ask, and Settings plus unpictured surfaces.
- [ ] Complete integrated checks and preview acceptance.
- [ ] Move this plan to `completed/` after UI acceptance.

## Decisions

- 2026-09-24: Owner specified a complete UI redesign. After verifying staging is current, owner allowed backend changes needed for this PR; keep these narrow, additive, tested, and account-scoped.
- 2026-09-24: Owner specified thinking levels as a separate branch/PR and Anthropic excluded.
- 2026-09-24: Use a local component system with selected shadcn patterns and Radix behavior because close pen fidelity and accessibility matter more than adopting a broad theme package.
- 2026-09-24: Keep Inbox and Knowledge Base separate; the unified navigation frame is a concept.
- 2026-09-24: Open draft PR #3 is a competing visual theme on older code. Recommend superseding it with the new redesign PR after preserving any intentional behavior; do not merge both visual treatments.

## Verification

- Inspect the final PR diff: `src/` changes must be limited to approved UI support, backward-compatible, validated, and covered by ownership tests.
- Focused UI/unit tests for component behavior where needed; `npm run check` on the integrated branch.
- Playwright: auth/onboarding, Inbox analytics/filter/view/pagination/detail, Capture validation/submission, Activity retry/details, Knowledge Base navigation/export, Ask sources/streaming, Settings provider and account flows.
- Preview visual review against all relevant pen frames at 1440px/390px plus intermediate width; keyboard, focus, screen-reader labels, and reduced-motion checks.
- Refresh `origin/staging`, open PR inventory, and conflict matrix before final review; retest after incorporating new staging changes.

## Risks and recovery

- The existing UI is concentrated in one TSX file and one CSS file. Extract modules first, assign non-overlapping work, integrate serially, and inspect the full diff after each merge.
- Some design controls imply backend capabilities that do not exist. Implement necessary sorting and weekly summary contracts before enabling those UI controls; never fake Anthropic or thinking controls.
- Concurrent feature PRs can add UI behavior during this redesign. Compare current staging and open PR diffs before assigning work and before final review; preserve newly landed behavior and extend the new visual system to it.
- A complete redesign can disrupt tests and keyboard paths. Validate each journey in preview; keep the old branch state as rollback until acceptance. Avoid schema migration unless the approved UI contract cannot be met without one; assess and test any migration before release.
