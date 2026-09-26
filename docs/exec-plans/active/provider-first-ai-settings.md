# Provider-first AI setup and stable page alignment

Status: active
Owner: Codex
Started: 2026-09-26

## Context
Preview feedback shows centered pages shifting when a scrollbar appears. AI settings presents task assignments before connections, with unconnected provider placeholders and no thinking-level configuration.

## Scope
Stabilize shared page geometry. Reorder AI settings into configured providers (Add provider, model and supported thinking controls), followed by transcription and Analysis & Ask assignments. Preserve existing provider connections and task selections. Keep OpenAI and Cerebras support and shared Analysis & Ask routing.

## Acceptance criteria
- Settings heading, navigation and content maintain their position across topics regardless of overflow.
- Providers can be added, edited and disconnected using accessible controls with pending/error feedback.
- Model and supported thinking selections persist and affect actual generation requests.
- Task assignments use connected, compatible providers and retain existing selections on upgrade.
- Credentials and account data remain protected; unsupported models/efforts are rejected.
- Desktop/mobile browser journeys and full repository checks pass.

## Approach
Two isolated workers own backend configuration/routing and AI settings UI. Foreman fixes shared layout, integrates contracts, reviews and verifies the combined result. Add compatible persistence only where required; existing APIs remain usable.

## Progress
- [x] Inspect current UI, provider service, and screenshot geometry.
- [x] Stabilize layout and verify topic transitions (desktop topics, forced scrollbar, mobile overflow).
- [ ] Implement provider configuration and runtime thinking support.
- [ ] Implement provider-first UI and task assignment flow.
- [ ] Integrate, verify, and update preview.

## Decisions
- 2026-09-26: Continue approved preview branch; isolated workers branch from it to preserve prior redesign.
- 2026-09-26: Model choices remain capability-aware. Thinking controls appear only for supported models; transcription has no thinking setting.

## Verification
`npm run check`; synthetic Playwright provider setup, settings geometry, and existing navigation journeys. Provider calls are mocked in deterministic tests; real credentials are not exercised.

## Risks and recovery
Provider capabilities vary by model. Validate the catalog and transmitted options, keep legacy configuration valid, and test ownership/migrations. Preview only; no production promotion. Revert task-scoped commits for rollback.
