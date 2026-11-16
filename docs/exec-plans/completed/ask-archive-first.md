# Ask searches implicitly relevant archive questions immediately

Status: implementation and preview acceptance complete; awaiting PR review
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
- [x] Full check (433 tests after merging staging `16cc0f6`) and browser acceptance (2/2 Chromium, 2/2 WebKit).
- [x] Commit/push staging PR #83 and verify native preview.

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
Mocked checks alone do not establish live-provider intent quality.

PR: https://github.com/stephenjoly/social-knowledge/pull/83
Preview: https://preview-social-knowledge-staging-y3qjds-i0ksss.staging.stephenjoly.net/app?tab=ask

On 2026-11-11, CI passed for `0227ddf`; the healthy native preview's compiled
`ask.js` SHA-256 matched the locally tested bundle:
`2b08ba371460ec8e50a0038c9c9c8f380eddbe0cd00684061cbe5d5e8a77d94b`.
Two real GPT-6.1 Sol Medium turns then ran through the preview HTTP/SSE path using
the existing non-production demo provider and one task-specific synthetic perfume save:
- The exact perfume question completed, cited the fixture and mentioned Sample A,
  without asking permission. It correctly qualified the invented fixture rather
  than claiming real-world recommendation sufficiency (`sufficient=false`).
- “Hi there” completed with no sources and `sufficient=null`.
Both persisted successfully. This is bounded live-model evidence, not a guarantee
for every query or model. No production data or credentials were accessed.

Review script: sign in with the existing synthetic `demo-member` account, open
“PR83 archive-first live verification” in Ask, and inspect both replies. Start a
new chat and ask the exact perfume question to repeat the live check if desired
(this incurs provider usage). The clearly labeled `PR83 synthetic: blind buy safe
perfumes` fixture and review conversation remain for review; archive only these
task-owned records after acceptance. Other shared staging fixtures remain untouched.
Machine-readable live evidence: `output/playwright/ask-archive-first-preview/live-smoke.jsonl`.

## Risks and recovery
A model can still misclassify intent using a valid reason. Broader retrieval can add
retrieval work to ambiguous substantive turns; it adds no extra model call. Existing
retrieval/citation limits are unchanged. Revert the feature commit if required;
there is no data migration. Production promotion is a separate release step.
