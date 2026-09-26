# AI settings frame 35 fidelity

Status: active
Owner: Codex
Started: 2026-09-26

## Context
The compact AI settings implementation retains the requested behavior, but the user identified visual differences from canonical frame `XdJiC` (`35 · AI settings / compact table`). The rendered page uses heavier typography and different card, column, and footer spacing.

## Scope
Refine layout and typography against the current canonical design. Preserve credential management, supported providers, model/effort choices, explicit draft saving, and saved-selection diagnostics. No backend or production changes.

## Acceptance criteria
- Match reference hierarchy, compact controls, fine borders, lighter text, and footer placement at 1440×1020.
- Keep Settings topics aligned when navigating and when scrollbars appear.
- Preserve readable mobile controls without horizontal overflow.
- Preserve one-request explicit Save, dirty-draft protection, and accessible diagnostic dialogs.

## Approach
One isolated GPT-6 Sol Worker with medium reasoning performs the visual pass, as explicitly requested. Parent reviews reference and browser screenshots, integrates the checkpoint, runs final verification, and updates the existing PR preview.

## Progress
- [x] Refresh canonical reference through Pencil and export frame 35.
- [x] Assign bounded visual work using the requested model and reasoning level.
- [x] Review and integrate the visual checkpoint.
- [ ] Verify behavior, mobile layout, and preview assets.

## Decisions
- Real OpenAI/Cerebras support and curated models remain authoritative over placeholder mock content.
- Default means a null task-level thinking override; preserve every advertised effort.
- The reference footer note sits above the right-aligned action buttons.

## Verification
Run `npm run check`, focused provider-settings and Settings alignment browser journeys, and inspect desktop/mobile screenshots against the exported frame. Diagnostics use synthetic provider traffic during tests.

Integrated Worker checkpoint `fa77b43` as `3afad1c`. Settings now bundles licensed Inter locally, uses the reference card geometry at 1440×1020, lighter typography, compact controls, and a stacked footer. The same shell geometry applies to every Settings topic. Parent inspected desktop/mobile screenshots; `npm run check` passed all 135 tests and the three focused browser journeys (provider settings, topic alignment, onboarding) passed against the fresh build. `git diff --check` passed. Preview publication remains.

## Risks and recovery
Shared layout changes can move other Settings topics; compare their geometry. Font changes can affect unrelated pages; keep the adjustment scoped. Revert the scoped UI checkpoint if regressions occur.
