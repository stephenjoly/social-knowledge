# Consumer landing mockup

Status: active
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
- [ ] Prototype built and preview verified.
- [ ] Checkpoint and review handoff.

## Decisions

- 2026-10-18: Approve Unfold under Stephen's explicit authorization. Keep acquisition CTA a functional local demo while public onboarding remains undecided.
- 2026-10-18: Preview server serves only `designs/landing/`, keeping repository and account data outside its document root.

## Verification

`npm run check`; static preview browser acceptance at desktop/mobile, synthetic search suggestions and empty state, keyboard, reduced motion, scrolling, network and console inspection.

## Risks and recovery

Prototype illustrates the product; it does not process social media or collect signups. Stop Paseo's Landing preview service to retire the preview. No persistent account data changes.
