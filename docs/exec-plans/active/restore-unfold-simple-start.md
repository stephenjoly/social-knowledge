# Restore accepted Unfold design and simplify setup

Status: restored direction approved by Stephen; remaining mobile fix carried into approved-landing-polish.md
Owner: Codex foreman and Opus UI worker
Started: 2026-10-18

## Context

Stephen rejected the real-app screenshot refinement as a severe visual regression and the expanded server/Shortcut content as far too complicated. He requests restoration of the original design with one compact two-step Get started section: curl install, then Shortcut download.

## Scope

Restore the accepted `e12c5f3` static page design; remove screenshot/technical expansion; retain one primary Get started action and compact two-step setup. Actual installer and portable Shortcut implementation is a material separate scope choice asked asynchronously while restoration proceeds.

## Acceptance criteria

- Original hero, example deck, aesthetic and motion restored without screenshot content.
- Server and Shortcut setup appear as one compact section with two actions.
- No fabricated live installer command or misleading arbitrary-server Shortcut download.
- Desktop/mobile, keyboard, reduced motion, search/deck and repository checks pass.

## Approach

Opus owns only five static page files from the original baseline. Foreman owns cleanup, functional scope/contract, verification and existing PR49 checkpoint. Preserve commit history and unrelated work.

## Progress

- [x] Regression acknowledged; original baseline identified.
- [x] UI restoration assigned with compact acceptance contract.
- [x] Stephen explicitly chose visual mockup first; no functional installer or universal download is claimed.
- [x] Original design and two-step section implemented; desktop verification passed.
- [ ] Correct and recheck command-row clipping on phone widths (Opus session limit).
- [ ] Checkpoint/PR updated.

## Decisions

- 2026-10-18: User explicitly requests restoring the earlier design. No further visual approval gate.
- 2026-10-18: Ask about real installer scope because none exists; continue independent restoration immediately.
- 2026-10-18: Stephen subsequently approved the restored direction, selected mockup first, and deferred onboarding until after shipping. The Astra review's concise copy changes and this remaining phone-width fix are tracked in `approved-landing-polish.md`.

## Verification

Browser comparison to accepted baseline; changed setup interactions, hero/deck/search, mobile overflow, keyboard/reduced motion; `npm run check`.

Results: `npm run check` passed docs, strict TypeScript, production build and all 31 test files / 166 tests. Chromium at 1440×900 verified original hero/deck/search, Get started focus, exactly two setup steps, placeholder-copy feedback and an explicitly disabled download. Setup steps remain visible under reduced motion. No page errors, failed requests, runtime external requests or app screenshots. At 375/390px the viewport/client/scroll widths agree, but visual review found the command Copy control clipped on the right. This is a remaining layout issue, not a passing mobile acceptance result.

Only changes from accepted `e12c5f3` page code are primary Get started CTAs, secondary sample search, compact closing setup, and supporting styles/interaction. Original demo data is unchanged. Rejected screenshot assets and evidence document were removed; prior work remains in git history. Evidence: ignored `output/playwright/restored-*.png`.

Opus 5.5 High wrote the restoration and new setup block, then hit its session limit (reported reset 18:30 America/Toronto) before verification/README. Foreman completed repository/browser checks and documentation. Design/layout edits remain assigned to Opus under delegation policy, so the phone command-row fix is pending provider availability; no alternate model was used for layout.

## Risks and recovery

No production deployment or account data involved. Installation functionality must be implemented and verified separately before advertising an executable endpoint. Preserve prior work in git history; remove only rejected task-owned screenshot artifacts.
