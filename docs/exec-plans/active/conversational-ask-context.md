# Conversational Ask AI context and retrieval

Status: active
Owner: Codex
Started: 2026-09-11

## Context

Ask AI treated a ten-word formatting follow-up as a new archive search. Its retrieval terms were
only the generic follow-up words, so an unrelated saved stain-removal result could be selected. The
answer prompt also omitted the conversation transcript, making source continuity impossible.

## Scope

Keep role-ordered user and assistant history for Ask AI, resolve each turn with a structured planner,
reuse cited captures for formatting-only follow-ups, harden lexical/taxonomy search, and compact long
conversations without deleting the original transcript. Add provider-neutral handling and visible
progress events. Production deployment and provider/model selection remain outside this change.

## Acceptance criteria

- A formatting-only follow-up receives the prior answer's cited captures and does not run a generic
  archive search.
- New turns preserve role order in both planner and answer model requests.
- Search ignores generic formatting words and does not match taxonomy labels by substring.
- Long conversations persist a checkpoint while retaining every original message.
- A temporary checkpoint-generation failure falls back to a bounded local, explicitly untrusted
  excerpt instead of losing the turn.
- OpenAI-shaped requests retain equivalent role/context behavior through the Cerebras adapter.
- Focused regression tests, the production build, and the full test suite pass.

## Approach

Add a `conversation_compactions` migration and owner-scoped persistence methods. Run a structured
turn planner before retrieval, validate source IDs against prior citations, and combine reused owned
captures with targeted search results. Build the final answer from role-preserving transcript context
plus bounded evidence. Compact before planner/answer requests when the configured budget threshold is
reached; store the checkpoint and keep all source messages untouched. Stream status events through the
HTTP API and display them in the browser. Keep the implementation on the existing routed OpenAI /
Cerebras interface rather than using a provider-specific compact endpoint.

## Progress

- [x] Implement planner, source reuse, role-preserving prompts, and retrieval diagnostics.
- [x] Add compaction persistence, budget controls, local fallback, and status events.
- [x] Harden search stop words and exact taxonomy matching.
- [x] Add focused follow-up, compaction, provider-role, and search regressions.
- [x] Pass type checking, production build, documentation check, and full unit/integration suite.
- [ ] Validate the conversational journey in staging with representative saved evidence.
- [ ] Move this plan to `completed/` after staging acceptance.

## Decisions

- 2026-09-11: Use a structured planner rather than a word-count/pronoun heuristic; the planner
  returns a standalone archive question, output style, action, and bounded cited-source IDs.
- 2026-09-11: Treat formatting-only follow-ups as source reuse; search is additive only when the
  planner identifies a new evidence need.
- 2026-09-11: Preserve the complete transcript in SQLite and put only a bounded checkpoint in the
  model context when the budget is reached. Checkpoints and archive text are untrusted data.
- 2026-09-11: Use a provider-neutral structured summarization request with a deterministic local
  excerpt fallback instead of relying on a provider-specific compaction endpoint.
- 2026-09-11: Short-circuit unambiguous archive misses before a planner call when there are no prior
  cited sources; this keeps insufficiency responses deterministic and inexpensive.

## Verification

Run `npm run check` in a clean checkout. Before staging acceptance, exercise: a first archive list,
the exact brief-bulleted-list follow-up, a follow-up needing new evidence, a long transcript that
triggers compaction, provider switching, retry, cancellation, and an empty archive. Inspect retrieval
diagnostics for action, reused IDs, compaction, and selected sources.

## Risks and recovery

Planner or answer model failures leave the assistant attempt retryable. Invalid model citations are
rejected. Checkpoint rows can be deleted independently if needed; the original conversation messages
remain authoritative. If staging shows false source reuse, disable the feature by setting the context
budget high and revert the AskService change while retaining the migration, which is additive.
