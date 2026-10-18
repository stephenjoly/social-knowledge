# Consumer landing page — design assignment

Status: approved to build by Stephen on 2026-10-18: “Whatever the spec is, just use your judgment, approve it. I just want to see something built.” Foreman approves Unfold. No further approval gate for mockup.

## Build milestone — supersedes planning-only boundaries below

- Fresh Claude Opus 5.5 High Worker owns `designs/landing/**` and may update status in `landing-design-spec.md`.
- Implement the full animated consumer mockup from `landing-design-spec.md`. Use judgment to simplify technical copy and retain strong visual payoff. No further questions needed.
- Existing workspace `wks_4d5154f1b923fb81`, branch `codex/consumer-landing-unfold`, now based on freshly fetched `origin/staging`.
- Foreman owns preview hosting/configuration, verification, execution-plan documentation, git checkpoints and handoff. Do not edit shared app files, package manifests, or `paseo.json`.
- Use local assets and synthetic content only. Every CTA must have useful local behavior; omit placeholder sign-in that would point at a static-server directory listing.
- Deliver one working page, not variants. Verify representative desktop/mobile, search, keyboard, scroll reversal, reduced motion, overflow, and console errors. Leave concise `designs/landing/README.md` with review script and implementation notes.
- When hero and first transition are ready, message parent with early-review readiness; continue remaining sections. Do not use parent's browser tab. Parent will run final browser pass.
- Do not commit/push/deploy; foreman handles those. Do not delegate.

## Objective

Create one distinctive, motion-rich consumer landing-page concept for Social Knowledge. User explicitly requests Claude Opus 5.5 with High thinking. This milestone produces only a concise design spec for approval; next milestone will build an animated browser mockup.

## Product and audience

Everyday people save useful Instagram/Facebook posts, then struggle to find or use them later. Social Knowledge turns deliberately submitted supported links into a private searchable archive with original source attribution, media, transcripts, summaries, and portable exports. Capture through Apple Share Sheet/Shortcut or browser. Other platforms are not full media capture. No invented integrations, public signup, pricing, user counts, testimonials, privacy guarantees, or instant processing claims.

## Proposed content contract

Consumer outcome first, recognizable saved-post problem, clear share → understand → retrieve story, tangible everyday examples (recipe, workout, travel idea), privacy/control and source attribution, closing CTA. Use existing product name provisionally. Primary demo CTA should work locally; public acquisition action is provisional until launch flow is agreed.

## Deliverable and ownership

Worker owns only `landing-design-spec.md` this milestone. Read `context.md`, `docs/product.md`, and relevant current files read-only. Cached origin/staging is substantially newer than HEAD; inspect its product docs as needed. Do not change branches, app code, dependencies, server configuration, or deploy anything. No alternatives board: propose ONE coherent visual direction with enough detail for approval. No design reference frame supplied.

## Spec acceptance

One page: visual character, content/screens and draft hero copy, motion metaphor and major transitions, CTA behavior, implementation medium, responsive and reduced-motion behavior, concrete browser acceptance checks, and explicit out-of-scope list. Prefer working browser mockup for subsequent review because motion is central. Synthetic demo only; no data collection. State important assumptions and at most one material unresolved decision.

## References

- `docs/product.md` (also inspect `git show origin/staging:docs/product.md`)
- `docs/engineering.md`, `docs/development-workflow.md`
- `/Users/stephenjoly/.codex/skills/landing-motion-design/SKILL.md`

Verification this milestone: inspect product claims, ensure one concept only, concise spec, no implementation.
