# Apply approved landing review refinements

Status: completed
Owner: Codex foreman; Claude Opus 5.5 High UI worker
Started: 2026-10-18

## Context

Stephen approves Unfold as the long-term direction and asks for Astra's small clarity refinements. Onboarding is explicitly deferred until after shipping. The original design, compact two-step setup and motion remain approved.

## Scope

Three concise copy adjustments (self-hosted/AI requirements, illustrative output/support claims, provider processing), mobile command Copy containment, and packaging the approved static page under `site/` for the existing Pages workflow. No installer, portable Shortcut, expanded manual, screenshots, redesign, or scroll-length optimization. Existing preview labels remain honest.

Latest approved extension: a finished compact footer with brand, useful page navigation, GitHub and runtime sign-in access. Preserve the example-data disclosure; do not invent legal pages or add setup complexity. Routing `/`, `/login`, `/app` is now implemented in checkpoint `2dfa6b3` and remains unchanged.

## Acceptance criteria

- Approved appearance/motion preserved; brief audience/requirements copy near hero.
- Examples and supported-source wording qualified; AI-provider data flow clear.
- Exactly two setup actions; provider setup/cost note concise; execution/download remain previews.
- Copy button fully visible/tappable at 375/390px, including long command content.
- Public bundle matches reviewed source; no design notes/private artifacts copied.
- Focused desktop/mobile/keyboard/reduced-motion acceptance and repository checks pass.

## Approach

`landing-approved-polish-brief.md` is the shared bounded assignment. Opus owns only source HTML/CSS; foreman owns mechanical public-bundle synchronization, docs, checks and existing PR49 update. No merging to staging/main or production-app deployment occurs in this pass.

## Progress

- [x] User approval and exact refinement scope recorded.
- [x] Opus High worker launched; provider rejected run before edits with a session limit resetting 23:30 America/Toronto.
- [x] Public bundle prepared with explicit runtime whitelist; source/public consistency check added to `npm run check`.
- [x] Fresh Opus High worker completed the approved UI refinements/mobile fix after Stephen reported the reset.
- [x] Footer added and integrated with session-aware app access.
- [x] Source/public synchronization, final browser/repository checks and documentation complete; task-scoped checkpoint prepared for PR49.

## Decisions

- 2026-10-18: Onboarding is deferred by explicit user instruction, not a blocker for preparing this approved landing change. Keep preview labels and disabled generic download; do not invent implementation.
- 2026-10-18: Respect Opus-only UI assignment and provider limit. Continue independent publication preparation now; queue one continuation after the reported 23:30 reset. No alternate model or quota bypass.
- 2026-10-18: One-shot heartbeat `b48eda82` resumes this same conversation at 23:31 America/Toronto (2026-10-19 03:31 UTC), max one run, expires six hours after creation. Continuation must respect newer user steering and report any repeated provider block without rescheduling.
- 2026-10-18: Stephen reports limits reset and requests a footer. Deleted heartbeat `b48eda82` to avoid duplicate execution; resume with a fresh bounded Opus High worker now. The existing runtime packaging/session logic stays with the foreman; source HTML/CSS stay with Opus.

## Verification

`node scripts/sync-landing-site.mjs --check`, `npm run check`; browser at desktop/375/390px, Copy bounds with long command, Get started focus, sample search/deck, reduced motion and runtime console/network.

Publication-preparation checkpoint: public bundle contains exactly the four runtime files and two font/licence assets. `npm run check` passed documentation, public/source parity, strict TypeScript, production build and all 31 test files / 166 tests. The source UI has not received the pending copy or mobile changes yet; these checks do not certify that unfinished pass. The static preview continues running with the approved pre-polish design.

Final verification supersedes that earlier checkpoint: Opus worker `b86bdeac-80e9-4ffd-a9c3-1b040b7346a2` changed only source HTML/CSS; parent synchronized `site/` and integrated the footer session slot. `npm run check` passed all 32 test files / 187 tests, strict types, build, documentation and bundle parity. Live smoke passed packaged landing/login assets and private route/API boundaries.

Integrated Chromium checks at 1440/390/375px: footer links and both placeholder/long-command Copy controls stay in bounds; long text scrolls inside the command; placeholder copy succeeds with a clipboard stub; real Tab input shows a 3px marigold focus outline. Actual reduced-motion emulation keeps the footer visible without animation and preserves exactly two setup steps. The footer changes Sign in to Open app (`/app`) with a mocked positive session-status response, returns to Sign in with the real signed-out response, and opens `/login`. No page errors. A fast jump to the footer settles with both setup steps visible. Visual comparison confirms the desktop footer follows existing nav edges; mobile links form two columns. Safari, Firefox and physical iPhone remain untested.

Review: open http://website-preview--codex-consumer-landing-unfold--socia--19cf8255.localhost:6767/ , check the small requirements line below the hero actions, the illustrative-layout note in Everyday examples, provider/source copy in Privacy, then scroll to Get started and the new footer. Tab through the footer links and choose Sign in. Screenshots are local, ignored review artifacts under `output/playwright/landing-footer/`. The design-only preview service is stopped; the integrated Website preview remains running. No test accounts or keys were created during this pass.

## Risks and recovery

Static public files only; no account data or production service changes. Pages publishes on main via existing workflow, so feature-branch packaging is not a deployment. Resume after reset must respect any newer user instruction, inspect dirty state, and stop with an honest report if the provider remains unavailable.
