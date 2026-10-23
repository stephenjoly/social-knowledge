# Retire GPT-5 choices and expose Qwen reasoning

Status: active — scope approved
Owner: delivery lead
Started: 2026-10-23

## Context
Stephen requested removing the GPT-5 series while retaining GPT-6 Luna, Sol and Astra, and asked whether Qwen should offer thinking controls. This is separate from the archive-completeness proposal, which remains discussion-only.

## Scope
- Remove GPT-5-family choices from Settings, composer and Retry with; retain truthful historical model labels.
- Keep GPT-6 Luna, GPT-6.1 Sol, GPT-6 Astra and Qwen 3.8 27B.
- Expose Qwen Low/Medium/High using Cerebras reasoning_effort; nullable provider Default remains supported. Correct the false No thinking descriptor.
- No new provider, retrieval changes, general agent harness or layout redesign. No expanded none/xhigh/max enum or SQLite CHECK migration in this slice.

## Required decision
Approved by Stephen: move saved GPT-5 defaults and chat selections to GPT-6 Luna. Preserve null/Low/Medium/High; map the retired Minimal level to Low. Perform idempotent owner-scoped updates when provider settings are read. Preserve historical answers and queued/in-flight job snapshots; retain private execution compatibility for those existing jobs, while rejecting retired IDs for new selections.

## Acceptance criteria
- New selections cannot choose retired GPT-5-family IDs, including configured legacy defaults.
- Existing accounts stay usable under the approved retirement policy; historical model metadata remains truthful.
- Qwen exposes only supported Low/Medium/High levels; null omits effort and uses the provider default. Minimal is rejected for Qwen.
- Tests cover actual SDK serialization for planner, streamed answers and diagnostics; reasoning text stays separate from final answer content.
- Owner isolation, pending-job safety, retry semantics and credentials remain intact.
- Focused tests, npm run check and affected Settings/Ask browser checks pass on a staging-targeted PR preview.

## Findings
- Current OpenAI catalog re-adds gpt-5 and gpt-5-mini plus configured analysisModel; the environment default is gpt-5-mini. Removing only the explicit catalog rows would leave legacy defaults selectable.
- Current Qwen catalog advertises no thinking levels; the adapter already has reasoning_effort routing guarded by those capabilities. It omits effort today, rather than explicitly disabling reasoning.
- Cerebras documents qwen-3.8-27b effort none/low/medium/high, with high default. Preserve current null/default behavior and expose the three already-supported database/UI levels; do not invent unsupported controls.

## Sources
- https://inference-docs.cerebras.ai/capabilities/reasoning
- https://inference-docs.cerebras.ai/api-reference/chat-completions

## Progress
- [x] Preflight and refresh origin/staging; new dedicated branch prepared.
- [x] Verify Qwen capabilities against provider-specific official documentation.
- [x] Resolve saved-selection retirement decision.
- [x] Implement owner-scoped current-choice migration, new catalog and Qwen controls.
- [x] Verify SDK request serialization, separated reasoning, migration isolation/idempotency/reopen, historical answers and queued snapshots.
- [x] Chromium Ask 8/8 and Settings 2/2 pass, including desktop/mobile controls.
- [ ] Complete full check, WebKit and staging-targeted PR preview acceptance; production promotion is separate.

## Risks and recovery
Removing a model without handling saved selections can disable Ask or capture readiness. Reasoning mode can affect latency; preserve current null/default behavior. Roll back the scoped source change if acceptance fails; never rewrite historical answer provenance or alter provider credentials.

## Implementation notes
The idempotent transaction runs for the signed-in owner when AI settings/providers are read. It changes only current task assignments, provider preferences and chat choices; timestamps, answer metadata, job snapshots and credentials are untouched. A stale chat object loaded immediately before migration resolves to the same Luna choice. Private generation transport still accepts existing GPT-5 job snapshots; new Settings/Ask choices reject them. Qwen uses the existing capability-driven controls and Cerebras adapter, with no CSS or layout changes.
