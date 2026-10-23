# Resolve final Ask release blockers

Status: active
Owner: delivery lead
Started: 2026-10-23

## Context
Final review of PR64 at 0f015fd found incorrect Ask diagnostics selection, a collapsed-sidebar search shortcut regression, and a retry → New chat → Enter journey failing twice. Stephen explicitly requested fixing all three with the agent team before shipping.

## Scope
Fix these three behaviors, add regression coverage, verify and publish to the existing PR64 preview. No CSS/design changes, model/default changes, schema changes, new dependencies, credential operations, production deployment or merges. Existing citation-format Retry debt is separate and must not be hidden or weakened.

## Acceptance criteria
- Ask diagnostics use the saved Ask default, falling back to Analysis only when unset, for enablement, execution and result freshness; Ask-only setup works and genuine stale results remain rejected.
- One `/` keypress with the desktop sidebar collapsed expands it and focuses chat search; typing targets and existing mobile/navigation behavior remain correct.
- Retry → New chat → type → Enter reliably sends the first draft. Identify the failed journey's cause before changing production code; preserve real user keyboard behavior and strict assertions.
- Full check and affected browser journeys pass, PR64 CI is green, and preview health/affected behavior is verified. Production remains unchanged.

## Approach and ownership
- Diagnostics worker: web/pages/settings.tsx, focused diagnostic UI unit tests, e2e/provider-settings.spec.ts only.
- Sidebar worker: web/pages/app-shell.tsx, focused sidebar unit tests, e2e/navigation-history.spec.ts only. Coordinate before touching shared primitives or main.tsx.
- Send-flow worker: web/pages/ask.tsx, e2e/ask-chat-first.spec.ts, focused Ask/stream test files only if necessary. Own existing browser server port8801 until releasing it; do not run shared builds.
- Lead: documentation, integration, shared production build/full check, final affected browser run, CI and preview acceptance. No two workers edit the same file. Workers commit scoped checkpoints; lead batches pushes.

## Progress
- [x] Scope approved by Stephen's explicit fix request; baseline clean and review findings recorded.
- [x] Diagnostics selection corrected with red/green unit coverage; checkpoints f98fe40 and 6540d7b. Expanded provider browser suite 2/2 passes with original quota/fallback assertions preserved.
- [x] Collapsed sidebar shortcut corrected with baseline browser failure and focused checks; checkpoints 6b0deb7 and b5eb169. Expanded navigation browser journey passes desktop and mobile focus, filtering, typing guards and stale-remount protection.
- [x] Send-flow cause established and regression resolved in 8e0476c. Original failure plus forced reconciliation overlap pass 2/2; complete Chromium Ask suite passes 8/8.
- [ ] Integration checks, CI and preview acceptance.

## Decisions
- 2026-10-23: Retain feature branch and draft PR64 targeting staging. Use Codex workers for logic/test changes only; no layout/styling work is needed.
- 2026-10-23: Preserve existing browser assertions. A test setup correction requires evidence of the real action/state contract, not an extra sleep or weaker check.
- 2026-10-23: The send failure is a genuine client lifecycle race: Enter occurs while the old answer's reconciliation still holds streaming=true, before any new-chat POST. New chat will cancel/detach its old active attempt; request-identity guards keep old reconciliation/cleanup from changing the new chat's live state or Stop controller. Existing persisted answers remain authoritative.

## Verification
Focused Vitest per slice; existing provider-settings and navigation-history journeys; complete Ask Chromium and WebKit suite after one coordinated build; npm run check; CI and existing seeded preview acceptance. Use disposable synthetic data and no paid provider calls for these UI fixes.

Final combined npm run check passes 393 tests across 41 files, docs/site parity, strict TypeScript and production build. Runtime CSS remains unchanged (index-BfQxeL6n.css); final JS is index-BuA0VKbu.js. Browser artifacts use separate output/playwright/ directories to avoid concurrent reporter collisions. Added diagnostic requests use a separate synthetic owner to respect the unchanged five-per-minute service limit.

Final local browser acceptance: Ask Chromium 8/8, Ask WebKit 8/8, affected archive/streaming/Settings 11/11, expanded provider settings 2/2, expanded navigation history 1/1 (30 checks total, no skips). Both engines retain first-Enter send, pending old-snapshot release, correct Stop cancellation, previous completed history, picker/scroll/motion and natural-conversation checks. Local servers stopped after verification. CI and deployed preview acceptance remain pending publication.

## Risks and recovery
Async UI transitions can discard an early draft or allow stale work into a new chat. Test a real keyboard send and authoritative persisted result, preserving cancellation/reconciliation. Revert only scoped fix checkpoints if preview regresses; no storage or credentials change.
