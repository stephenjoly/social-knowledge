# Refresh OpenAI analysis and Ask model choices

Status: active; Stephen approved the bounded catalog scope
Owner: Codex delivery lead
Started: 2026-10-22
Branch: codex/ask-ai-ui-mockup; draft PR #64 targets staging

## Problem and evidence
The app only offers the configured analysis model plus GPT-5 mini/GPT-5. Stephen requested newer models. Official OpenAI model pages and a read-only models.list call through demo-member’s existing connected OpenAI client confirm gpt-6-luna, gpt-6.1-sol and gpt-6-astra. No saved credential, selection or default was changed during research.

## Proposed bounded scope
- Add GPT-6 Luna (efficient), GPT-6.1 Sol (balanced), GPT-6 Astra (highest capability) to the existing OpenAI model lists in Settings and Ask; retain old models for saved chats/configuration compatibility.
- Use model-specific supported Low/Medium/High controls plus the existing nullable provider Default. Reject Minimal for the new models. Keep GPT-5’s existing supported effort list intact.
- Preserve every existing saved selection and default. No automatic migration to a more expensive model and no new provider.
- Keep the existing picker/modal layout, per-chat persistence, default action and actual-model metadata. Add concise accurate model labels/notes where needed.
- Existing stateless Responses requests support the new models; no endpoint, prompt or SDK change is needed for this slice.

## Optional expanded scope (requires explicit selection)
Expose all documented efforts: new models Low/Medium/High/XHigh/Max, plus None for Luna. This requires widening boundary/types/UI labels and transactional migrations of three SQLite CHECK-constrained tables (AI selections, provider configuration, jobs), with legacy-data/FK-integrity/owner tests and migration review. Do not start this expansion by inference.

## Acceptance
- The three current model IDs appear in Settings and the composer/retry picker for a connected OpenAI provider.
- Selecting a new model works for chat, one-off retry, and saved Analysis/Ask defaults, with owner isolation and strict input validation; unsupported effort/model combinations rejected.
- Existing GPT-5 chats and preferences remain usable; no default is changed automatically.
- Focused model/API/Ask tests, npm run check, affected browser journeys, and a real connected-provider smoke pass on the preview. Check all three with small diagnostics; at least one new model gets a real persisted new-chat answer.
- Picker fits desktop and 390px with existing keyboard/focus behavior; no new layout design.

## Ownership after approval
- Current reusable agents: backend 501273cd-ea91-4d3d-b8b2-94609a22883e; Opus UI 872aa2f5-563b-4095-b6c0-f1e2c354574b. Workspace wks_d44e5f51ee172671. Original design reviewer 25214aae-9f86-4336-94c1-8103217aac98 may review changed picker/Settings screens after integration.
- Backend worker: src/ai-providers.ts and test/ai-providers.test.ts, test/conversations.test.ts, test/ask.test.ts; no frontend edits. Expanded migration files only if that scope is approved.
- UI worker (Opus): web/shared/format.ts and web/pages/ask-format.ts; current labels/notes and any strictly necessary picker fit changes in own files. No test/backend edits.
- Lead: integration, this plan, durable docs, preview/CI and real-provider verification. Disjoint files; workers do not push.

## Sources
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/models/gpt-6.1-sol
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/guides/latest-model

## Progress
- Local browser functionality confirms all three keyboard selections, Astra answer metadata and persisted per-chat model after reopening, a one-off Luna retry, and unchanged defaults. Final browser report confirms both desktop and mobile functional flows pass. Commit 9b4c661 adds the strict regression; it fails only 12 viewport/hit-test assertions (desktop y=-143.734 plus two obscured controls; mobile y=-304.484 plus eight obscured controls). Do not weaken those assertions.
- Automatic heartbeat 6a567beb scheduled once for 2026-10-22 19:51 America/Toronto, after the Opus quota reset. Resume this brief and reports; keep the live preview at c9d3769 until geometry and keyboard tests pass. No further approval is required for the already approved bounded scope.
- Backend checkpoint 14a4585: catalog, implicit-default preservation and tests. Opus-authored label/description checkpoint f639e9b includes a pure module-resolution integration fix. Focused model/API/Ask/format tests pass 83/83; typecheck passes. Full npm run check passes 40 files / 357 tests, including docs, site parity and production build. The new Playwright geometry regression remains a deliberate failing acceptance check until the Opus layout correction lands.
- Opus UI worker hit its provider usage limit until 19:50 America/Toronto on 2026-10-22 after writing labels but before the picker fit fix. No Codex UI substitution is allowed. Exact untouched picker measurements with new rows: 1360×1000 → y=-65.734, height=499.484; 390×844 → y=-304.484, height=499.484. Screenshots: output/playwright/model-refresh/picker-home-{1360,390}.png. Backend strict geometry regression also fails at 1360×844 (y=-143.734). Initially held at c9d3769; Stephen subsequently requested publishing this version for preview review, with the known clipping defect disclosed.
- [x] Official catalog/capabilities and connected-account IDs checked; backend compatibility researched. Real synthetic structured-output probes using the existing demo-member connection pass for Luna (2.168s), Sol 6.1 (2.495s), and Astra (2.674s), at Low effort with no saved-selection changes.
- [x] Stephen approved adding the models with current Low/Medium/High controls; no thinking-level schema expansion or migration.
- [ ] Complete picker viewport correction, integrate, verify and publish to PR64 preview. Stephen subsequently authorized preview publication with this known defect; this does not satisfy final acceptance.

## Decisions and risks
- Stephen approved the bounded scope on 2026-10-22. Use Luna → Sol → Astra before legacy choices. Verified descriptions: Efficient, Balanced, Highest capability; old GPT-5 models become Previous generation, and Qwen’s unsupported cross-provider Fastest claim becomes No thinking. Preserve the existing component design; correct hero popover clipping as needed for the larger catalog.
Default selections stay untouched. Model-list presence does not prove generation access, so live diagnostics follow implementation. Full thinking controls require safe SQLite migration and a separate focused migration review. No production action or credential change is part of this task.

## Preview publication decision — 2026-10-22
Stephen asked to deploy the current version after being told that the larger picker clips, and asked the lead to review against Opus’s design while Opus is unavailable. Publish to PR64 preview only. No merge, production action, default change or credential change. Lead compared the existing state 3 and state 6 captures against the approved references: layout, typography, sidebar, sources and modal remain close; new catalog labels/rows are intentional. The larger home picker has a known viewport regression on desktop and mobile. Strict failing geometry tests remain intact. The scheduled Opus correction stays pending; final acceptance is incomplete.
