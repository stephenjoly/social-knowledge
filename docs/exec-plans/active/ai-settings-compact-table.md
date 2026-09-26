# AI settings compact table

Status: active
Owner: Codex
Started: 2026-09-26

## Context
User selected `35 · AI settings / compact table` (`XdJiC`) in the canonical saved `ui.pen` and explicitly requested implementation. This replaces the previous tall three-section AI presentation.

## Scope
Match the frame's provider rows, task table, segmented thinking control, and footer actions. Retain supported providers/models, shared Analysis/Ask selection, existing diagnostics, safe credential management, and consistent Settings navigation geometry. No new provider integration or production promotion.

## Acceptance criteria
- Compact provider connections with status and Connect/Change key actions; disconnect remains available in key management.
- Task table has Task, Provider, Model, Thinking columns; mobile remains usable without overflow.
- Draft controls persist only through explicit Save changes, with one validated settings request and pending/error feedback.
- Supported thinking levels are selectable; null is labeled Default, never falsely described as disabled reasoning.
- Footer Test connection opens the three existing diagnostic checks, using saved selections only. Dirty drafts require saving first.
- Provider refresh preserves unrelated drafts; disconnect clears affected assignment drafts; diagnostics invalidate on relevant changes.
- No changes to queued capture snapshots, credential isolation, or diagnostic safety boundaries.

## Approach
One isolated UI Worker owns markup, styles, and focused browser coverage. A read-only Worker reviews the save/test contract. Parent integrates, checks screenshots against the exported frame, runs final checks, documents behavior, and updates the existing PR preview.

## Progress
- [x] Read canonical frame and export visual reference.
- [x] Delegate UI implementation and behavior review.
- [ ] Integrate compact UI and explicit draft/save behavior.
- [ ] Verify desktop/mobile, update documentation, and publish preview.

## Decisions
- Preserve the real provider catalog; mock Anthropic/model names do not add unsupported integrations.
- Analysis continues to power Ask; explain shared selection in helper text.
- Preserve shared Settings alignment rather than introducing an AI-only outer-width change.
- Keep diagnostics behind the frame's Test connection action; each actual provider test still requires a click.

## Verification
`npm run check`; focused provider-settings browser tests with mocked provider traffic; settings alignment and onboarding journeys; desktop/mobile screenshot review; preview assets and health verification. No automatic live-credential tests.

## Risks and recovery
Draft settings and server refresh can diverge; verify failed saves and provider changes explicitly. Model-specific effort support remains catalog-driven. Revert scoped commits on regression; existing API and persistent data remain compatible.
