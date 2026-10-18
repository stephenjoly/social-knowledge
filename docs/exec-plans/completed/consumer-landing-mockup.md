# Consumer landing mockup

Status: completed — design prototype ready for review
Owner: Codex foreman; Claude Opus 5.5 High design worker
Started: 2026-10-18

## Context

Stephen wants one motion-rich consumer landing-page design and a working preview link. The existing developer-focused site is not the target audience.

## Scope

A standalone static prototype in `designs/landing/`, synthetic demo content, local search interactions, mobile and reduced-motion behavior, and a supervised Paseo preview service. No production app routes, signup backend, pricing, tracking, or deployment changes.

## Acceptance criteria

- One coherent Unfold concept demonstrates share → understand → find.
- Working preview URL with local assets and seeded fictional captures.
- Search, example selection, keyboard access, mobile overflow, reduced motion, fast and reverse scroll checked in browser.
- Product claims remain grounded in current product documentation.
- Full repository check passes or existing environment limits are reported.

## Approach

Claude owns prototype files. Foreman owns preview script, integration checks, execution plan, and checkpoint. Reuse current isolated workspace; branch from freshly fetched staging.

## Progress

- [x] Product claims inspected and one visual spec proposed.
- [x] Stephen authorizes judgment and asks to build without another approval.
- [x] Fresh staging task branch and Opus 5.5 High worker launched.
- [x] Prototype built and preview verified.
- [x] Checkpoint and review handoff prepared.

## Decisions

- 2026-10-18: Approve Unfold under Stephen's explicit authorization. Keep acquisition CTA a functional local demo while public onboarding remains undecided.
- 2026-10-18: Preview server serves only `designs/landing/`, keeping repository and account data outside its document root.

## Verification

`npm run check`; static preview browser acceptance at desktop/mobile, synthetic search suggestions and empty state, keyboard, reduced motion, scrolling, network and console inspection.

Results: documentation, strict TypeScript, production build and all 31 test files / 166 tests passed. Prototype JavaScript syntax checks and diff whitespace check passed. Chromium browser acceptance passed at 1440×900, 375×812 and 390×812: all three seeded queries, empty state, arrow-key example tabs, CTA focus/arrival, reduced motion, fast and reverse scrolling, local-only network requests, and no page errors. Mobile overflow discovered during review was fixed; final viewport/client/scroll widths agree at 375 and 390px. Safari and Firefox were not tested.

Local preview: `http://127.0.0.1:41006/`, supervised by Paseo's Landing preview service. This is a local Mac preview; the Tailscale endpoint did not respond and is not a verified remote URL. Review script: `designs/landing/README.md`. Screenshot evidence remains local in ignored `output/playwright/`.

Visual comparison against the approved concept: same paper/green/marigold character, unfolding hero and source-thread/export motion. Search gets its own section after How it works, and the placeholder Sign in was omitted so every CTA has a useful local action. Mobile stacks the hero and steps; reduced motion presents completed scenes. No production deployment or public acquisition flow was added.

## Risks and recovery

Prototype illustrates the product; it does not process social media or collect signups. Stop Paseo's Landing preview service to retire the preview. No persistent account data changes.
