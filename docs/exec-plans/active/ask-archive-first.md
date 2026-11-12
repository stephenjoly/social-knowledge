# Ask searches implicitly relevant archive questions immediately

Status: active
Owner: Codex
Started: 2026-11-11

## Context
The user asked “what perfumes are blind buy safe” and received an offer to search.
The existing planner permitted a clarification without retrieval. Stephen approved
the written archive-first scope on 2026-11-11.

## Scope
Default substantive questions and recommendations to the signed-in owner's archive.
Require a structured, action-compatible reason for non-retrieval replies. Preserve
greetings, app help, supplied-material transformations, genuinely unresolved subjects,
explicit external-search handoffs and clearly unrelated standalone tasks.
No browsing tools, model changes, UI redesign, retrieval-limit expansion or schema migration.

## Acceptance criteria
- The perfume question searches and produces a cited answer without a permission turn.
- Ordinary travel/food/fitness questions and contextual confirmations need no archive keywords.
- Unsupported bypasses search conservatively; owner/citation boundaries remain strict.
- Natural check-ins and app help retain neutral sufficiency and avoid unnecessary retrieval.
- Focused and full checks pass; seeded browser journey and PR preview are reviewable.
- Mocked orchestration evidence is clearly separated from live-model intent quality.

## Approach
Update shared model policy, strict provider plan schema and the server bypass guard
in `src/ask.ts`. Add regression coverage in Ask tests and a browser case using the
real AskService with deterministic provider responses. Update the product contract.

## Progress
- [x] Inspect current staging and preserve existing branch/artifacts.
- [x] Record regression failures before implementation (six failures in nine focused cases).
- [x] Implement and pass focused Ask/conversation tests (64 tests).
- [x] Full check (416 tests) and browser acceptance (2/2 Chromium, 2/2 WebKit).
- [ ] Commit/push staging PR and verify native preview.

## Decisions
- 2026-11-11: No keyword-based intent gate or extra model round trip. The existing planner
  declares a narrow bypass reason; missing/incompatible reasons default to retrieval.
- The server checks structured action/reason consistency. It cannot prove a model's
  semantic classification correct; live-model verification remains separate evidence.
- No source/UI/SSE persistence contract or owner isolation changes.

## Verification
`npm test -- test/ask.test.ts test/conversations.test.ts`, `npm run check`,
and `e2e/ask-archive-first.spec.ts` at desktop/phone widths in Chromium and WebKit.
Preview review: use synthetic data, ask the exact perfume question once, expect saved
recommendations/citations without consent; a greeting should remain conversational.

Local browser acceptance uses the real AskService, retrieval, persistence and SSE
with deterministic provider responses. It covers desktop and phone, plus the
earlier search-offer confirmation. Evidence: `output/playwright/ask-archive-first-{chromium,webkit}`.
Live-provider intent quality is not established by these mocked checks.

## Risks and recovery
A model can still misclassify intent using a valid reason. Broader retrieval can add
retrieval work to ambiguous substantive turns; it adds no extra model call. Existing
retrieval/citation limits are unchanged. Revert the feature commit if required;
there is no data migration. Production promotion is a separate release step.
