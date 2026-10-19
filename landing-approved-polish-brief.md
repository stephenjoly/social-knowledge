# Approved Unfold — final clarity and mobile fix

Status: Stephen approves the direction and explicitly asks to implement the advisor's refinements. Onboarding is deferred until after shipping. No further design approval gate.

Latest milestone: Stephen requested a proper footer and reported that Claude limits had reset. Fresh Opus 5.5 High worker `b86bdeac-80e9-4ffd-a9c3-1b040b7346a2` completed source HTML/CSS; parent integrated the footer session link, synchronized the public bundle and verified desktop/mobile, keyboard, reduced motion and repository checks. The old one-shot retry heartbeat was deleted to prevent duplicate edits. This brief records the completed contract.

## Exact scope

Preserve approved Unfold artwork, hero, Recipe/Workout/Travel deck, colour, typography, motion, page order and compact two-step Get started. No screenshots, expanded setup guide, redesigned sections or scroll-dwell changes.

1. Add a small line near the hero CTA qualifying the audience: “Self-hosted · your server and AI keys” (or equally concise natural copy).
2. Add a brief nearby examples note that layouts are illustrative and actual notes contain summaries, transcripts and takeaways. Qualify source/extraction availability; replace “Instagram and Facebook are fully supported” with accurate supported-video wording and a compact source-availability qualifier. Do not redesign the illustrations.
3. In existing privacy content, add one sentence explaining relevant content is sent to configured AI providers for transcription/analysis. Keep “nothing sent” scoped to local sample search.
4. Fix command Copy control clipping at 375/390px. Existing `.start__body` is a grid with an implicit auto column; ensure command and copy control stay within its allotted column, with long text scrolling inside. Verify a realistically long command as well as placeholder; do not merely hide overflow or shrink text to mask the bug. Preserve compact desktop two-column and phone stacked layout.
5. Keep exactly two numbered setup actions. One short note may say in-app AI connection is required and provider charges apply. Installer command remains clearly marked preview and download disabled. Do not implement onboarding, create a fictional executable URL or enable the fixed-host v6 as a portable download.
6. Replace the one-line concept-disclaimer footer with a finished footer matching the approved paper/green/marigold design. Include brand/short product description, useful in-page navigation (How it works, Examples, Privacy, Get started), and a real repository link to https://github.com/stephenjoly/social-knowledge . Preserve the synthetic-example disclosure subtly. No fabricated legal/policy pages or unverified claims. Keep it compact and polished on desktop and phones. Include an empty `<span data-footer-session-slot></span>` inside the footer's link navigation; the parent will fill it with Sign in/Open app only in the integrated runtime, using your existing footer-link styling. The standalone design remains host-independent.

## Ownership

Claude Opus 5.5 High worker owns only `designs/landing/index.html` and `landing.css`. No other files, app changes, packages, git, installer, or delegation. Existing workspace `wks_4d5154f1b923fb81`, branch `codex/consumer-landing-unfold`, design preview port41006. Earlier quota-blocked attempts changed no UI files; Stephen now reports the quota reset. Read applicable instructions/skills and complete this bounded pass directly. Prefer one focused final browser pass rather than exploratory repeated reviews. Do not edit the parent's browser or stop services.

Foreman owns docs, verification, checkpoint/PR49, and mechanical publication of the approved static bundle into `site/` for existing GitHub Pages workflow. This does not authorize or perform production-app promotion.

## Runtime-routing follow-up (2026-10-18)

Stephen subsequently authorized and Codex implemented `/` public landing, `/login` existing authentication, and `/app` private dashboard. Runtime packaging (`scripts/package-landing.mjs`) adds Sign in/Open app links using existing link styles and a session/legacy-invitation script, without editing the design HTML/CSS. Preserve that integration when polishing the source: keep hero `data-try`, privacy link, and script references usable by the packager. After source sync, rebuild and verify the integrated page as well as the static preview. No new approval or onboarding scope is introduced.

## Original polish acceptance

Small diff implementing copy above; no approved visual direction changes. Copy button fully visible, tappable and within command box at 375/390px with both placeholder and long command; no page overflow; desktop unchanged. Hero, example selector and sample search remain intact. Existing preview labels remain honest and obvious enough. Use own browser/tab; report focused checks and limitations, then finish. No extra exploration.

Footer acceptance: real links or existing section anchors only, clearly labeled navigation, visible keyboard focus, readable on 375/390px, no overflow, no extra setup steps or pretend signup. Keep footer content visible with reduced motion and without scroll-dependent hidden states.
