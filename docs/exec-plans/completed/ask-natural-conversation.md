# Natural, app-scoped Ask conversations

Status: completed
Owner: delivery lead
Started: 2026-10-22

## Context
Ask turns every message into an archive search. A check-in such as “Test” gets an irrelevant archive miss and duplicate insufficiency copy. Stephen approved broadening Ask into an app-scoped assistant using general reasoning while separating archive-supported facts.

## Scope
Natural greetings, clarification, accurate app help, and reasoning/drafting related to Social Knowledge and saved ideas. Keep source-backed archive questions, citations, context, model selection, retries and streaming. Briefly redirect unrelated requests. No Pi dependency, browsing, new providers, write tools, shell access, or layout redesign.

## Acceptance criteria
- “Test” and greetings receive conversational responses, without archive retrieval or an insufficiency notice.
- App help describes actual supported capabilities; the assistant cannot claim it changed settings or archive records.
- Follow-ups use conversation context; explanation/drafting can use general reasoning, explicitly distinguished from saved-source facts.
- Archive facts cite only available, owner-scoped sources. Genuine archive misses remain honest and useful.
- Unrelated requests receive a friendly app-scoped redirect; untrusted archive content cannot redefine instructions.
- Natural responses persist across reload and retry without fake citations or a false missing-evidence warning.
- Existing Ask, Settings, model and scroll journeys remain intact; no new schema migration.

## Approach and ownership
Backend worker owns src/ask.ts, src/db.ts and focused backend tests: extend planner actions for conversation/app help/clarification/reasoning/redirect; share an authoritative app capability policy; preserve archive retrieval and citation validation. Reuse existing nullable sufficient: null means archive sufficiency does not apply, false means actual archive insufficiency, true means archive-backed answer. completeConversationAttempt must persist null as NULL. Return/SSE contracts already accept nullable sufficiency; verify this at transport boundaries.

UI logic worker owns web/pages/ask.tsx, web/chat-stream.ts and focused UI/stream tests only: neutral initial status, scope-accurate hero/accessibility copy, neutral zero-source explanation for sufficient=null, no duplicate insufficiency sentence. No CSS, geometry or animation changes. Existing API/type shape stays unchanged. If transport typing requires another owned file, coordinate before editing.

Lead owns this plan, product/architecture docs, integration, final review and preview acceptance. Workers commit only assigned files; no shared build until coordinated.

## Progress
- [x] Investigated current planner/prompt and Pi agent core.
- [x] Stephen approved app-scoped general reasoning with grounded archive claims.
- [x] Backend behavior and deterministic regressions (30b685a; 50 focused tests).
- [x] UI copy/state integration and focused regressions (3f14c57, 2bb1cd9; 42 focused tests).
- [x] Full check, affected browser journeys and preview smoke (citation-retry limitation recorded below).

## Decisions
- 2026-10-22: Keep the existing harness. Pi supplies agent state/tool execution/streaming, but does not itself define conversational policy or app authorization. Existing context and streaming are sufficient for this slice.
- 2026-10-22: Preserve model choices/defaults and persisted schema; use existing nullable sufficiency to distinguish non-retrieval conversation from archive misses.
- 2026-10-22: Resume PR64 on its existing branch as explicitly requested follow-up work.

## Verification
Focused Ask, conversation, stream and rendering tests; cases for greetings/Test versus searching saved test results, app help, clarification, source reuse, general reasoning attribution, off-topic redirect, fabricated citations and cross-owner access. Run npm run check and affected Playwright journeys. Preview synthetic conversation smoke covers greeting, app help, archive question and contextual follow-up; no credential changes.

Local integration: Final npm run check passes 386 tests across 40 files, documentation/site checks, TypeScript and production build. Ask browser suite passes 7/7 in Chromium and 7/7 in WebKit, including the new natural conversation, reload and retry contract plus existing six-state, motion, picker and strict no-horizontal-scroll checks. Affected archive, streaming/mobile and Settings journeys pass 11/11, with no skips. Captures: output/playwright/ask-chat-first/. Changed copy reflects the approved broader scope; layout/styles remain unchanged. Final preview acceptance below uses the refined policy.

Initial real-provider check on d24a8ee: greeting and app help completed with null sufficiency and no sources. The archive turn was rejected as invalid_citation; a bounded diagnostic retry completed with three sources, valid source IDs and matching numeric markers. The original rejected output was not retained, so its precise format mismatch is unproven; validation was not relaxed. Live app-help wording also understated retrieval capability, prompting a targeted policy clarification and warmer check-in guidance before final acceptance.

## Risks and recovery
Model intent classification can misroute ambiguous prompts: ask clarification and use conservative archive fallback on malformed plans. Do not infer account contents from model knowledge. Roll back this scoped checkpoint if preview conversation regresses; saved chats remain compatible.

Policy refinement eaad756 explicitly describes owner-scoped retrieval, distinguishes it from live settings/account-state inspection, and asks for warm check-ins and canonical separate citation markers. The citation parser and validator are unchanged. Final live acceptance uses GPT-6 Luna Medium, matching the reported selection.

## Final preview acceptance
- Dokploy deployed f6a3807ac714ef04a3297edc62a654f3883f27b8; CI passed (run 39891831020).
- Existing demo-member, GPT-6 Luna Medium: Test produced a warm invitation in 2.879s, app help described actual search/summarize/compare/draft capabilities in 3.352s; both persisted null sufficiency and zero sources.
- The initial archive-summary turn again hit controlled invalid_citation. One explicit HTTP Retry completed with three sources. The contextual follow-up completed with one source and clearly labeled the assistant's own checklist; the unrelated weather request redirected to Social Knowledge with null sufficiency and zero sources.
- The retained review chat is “Natural conversation — Luna Medium”. No model defaults, saved credentials or production data changed.
- Real preview browser inspection: six answer rows (including the retained rejected attempt), no duplicate insufficiency notices, root client/scroll width 1360/1360. Captures: natural-preview-start.png and natural-preview-end.png in output/playwright/ask-chat-first/.
- Health and seeded fixture acceptance passed: twelve review chats, pinned/pending/failed states and both simulated providers. Disposable local test servers are stopped.
- Recurring citation-format rejection remains a separate, documented reliability item in docs/tech-debt.md; precise cause is unproven. Strict citation checks are preserved. This completion attests the conversational scope and recoverable source-backed flow, not guaranteed success of every model generation.
