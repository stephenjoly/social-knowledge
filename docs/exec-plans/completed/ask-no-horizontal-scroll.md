# Ask never requires horizontal scrolling

Status: completed; browser and deployed preview acceptance verified
Owner: delivery lead
Started: 2026-10-22
Branch: codex/ask-ai-ui-mockup; draft PR64

## Problem and evidence
Stephen reports some chats show a horizontal scrollbar and requires no sideways scrolling anywhere in Ask. The previous root-bounds test missed overflow inside panes. On deployed2d9448f, lead measures root1360/1360 and thread765/765 but sources-body scrollWidth346 versus clientWidth301. Two absolute .sr-only labels extend to right329 and346; preserve accessible names while preventing their invisible boxes from enlarging the pane. Code blocks also intentionally use overflow-x:auto today; update wrapping behavior to meet the new explicit requirement.

## Scope and acceptance
- Root, conversation, thread, sources, answer content and composer must not require horizontal scrolling at desktop widths1920/1360/1280 and mobile390.
- Wrap long URLs, unbroken titles, inline/fenced code, table cells and error/retry metadata; preserve full text, links, source attribution and accessible labels. Wide Markdown tables must reflow without clipped data.
- Pane scrollWidth <= clientWidth (allow rounding only when non-scrollable); attempting scrollLeft must not move content. Do not solve this by clipping readable content or hiding a scrollbar over inaccessible data.
- Keep independent vertical pane scrolling, sources toggle/citations, picker reachability, focus return, animation/reduced motion, Settings and other app pages working.
- Add deterministic adversarial-content regression, prove red before fix and green after. Chromium and WebKit, desktop/mobile, sources open/closed, retry/error rows and long source labels. Final npm run check +affected Playwright +live preview acceptance.

## Ownership
Opus5.5high owns minimal CSS/layout refinement in web/ask.css (only minimal ask.tsx renderer change if needed; notify lead). Codex6.1medium test worker501273cd owns e2e/ask-chat-first.spec.ts and fixtures inside it; no UI edits. Lead owns docs/review/integration/deployment. Same workspacewks_d44e5f51ee172671, no overlapping files, no further delegation. If Opus cannot implement, report constraints rather than substituting a prohibited UI model.

## Out of scope
No provider, model/default, credential, migration, production action or unrelated redesign. Publish only to existing draft preview after checks. User request authorizes wrapping and containment correction; no new visual design choice needed.

## Progress
- Opus reviewed the existing UI and authored the exact minimal CSS patch. It did not edit the repository, respecting Stephen’s instruction to that agent to review only. Lead mechanically integrated that authored patch in web/ask.css; no independently designed layout changes.
- Hidden labels anchored at pane origin; code wraps; answer/source long tokens wrap; source attribution remains fully visible/linked; table cells wrap; images constrained; mobile Retry menu anchored to answer actions width. No content removed.
- Source patch is integrated but dist-ui remains unchanged until the test worker records RED against2d9448f.

- RED confirmed on prior built bundle at1920/1360/1280/390. Example desktop root1920/1920 and thread1340/1340 pass while sources2537/316 can scroll2221px and code5281/662 can scroll4619px. Mobile sources2537/389 and code5281/320 also genuinely scroll. Pane-level tests catch what root-only tests missed. Reservation released for final build.

- First corrected build removes large source/code/table overflow and clipped text. Focused test identified a remaining one-pixel outer source mismatch (316px inner versus315px content box), and mobile Retry obstructed by a tall composer at the document bottom. Opus authored the follow-up:315px inner at desktop/tablet, outer overflow:clip, and mobile bottom padding reserving the fixed tab bar. Lead integrated exactly that refinement; no independent design changes.

- Follow-up c6c6dd5 passes focused adversarial Chromium case1/1 (5.760s), all12 phases:1920/1360/1280/390 ×sources open/closed/Retry menu. Actual one-pixel movement prohibition, readable text bounds, source attribution/link/accessibility names and real mobile Retry clicks retained. No forced clicks or weakened assertions. Full suites pending.

- Final browser verification passes: focused adversarial1/1; full Chromium6/6, WebKit6/6, affected archive/streaming/Settings11/11, no skips. All12 adversarial phases retain real scrollLeft0, pane widths, box/text bounds, full link/accessible names and real mobile Retry clicks. Test setup3460ed1 waits for citation focus completion before the separate Settings keyboard action; assertions preserved. Temporary8801/4186 servers stopped and test data cleaned up. Final npm run check passes357/357 tests in40 files, TypeScript, docs/site parity and production build. Preview acceptance pending.

## Final preview acceptance
Correction3591f5630d9db9ff93a0e6f37a907b8118198644 deployed. Required CI passes in1m19s: https://github.com/stephenjoly/social-knowledge/actions/runs/39878917145 . Live native-browser DOM/layout verification on the affected eight-source chat at1360×1000: root1360/1360, thread765/765, outer sources315/315, source scroller300/300; attempts in both horizontal directions leave scrollLeft0 throughout. CSS bundle index-BfQxeL6n.css matches verified local bundle. Health and synthetic review fixture acceptance pass (12chats, one pinned/pending/failed, both simulated providers). No new paid model calls, credential/default changes, migrations or production action.

The earlier outer-page check missed pane-level overflow; the committed adversarial regression now covers actual pane movement and full readable text, preserving all strict previous checks. Final source/body metadata intentionally wraps instead of truncating. Header/model subtitles retain approved single-line presentation without horizontal scrolling. No remaining decision or known failure. Local temporary servers/data cleaned up.
