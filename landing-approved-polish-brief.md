# Approved Unfold — final clarity and mobile fix

Status: Stephen approves the direction and explicitly asks to implement the advisor's refinements. Onboarding is deferred until after shipping. No further design approval gate.

## Exact scope

Preserve approved Unfold artwork, hero, Recipe/Workout/Travel deck, colour, typography, motion, page order and compact two-step Get started. No screenshots, expanded setup guide, redesigned sections or scroll-dwell changes.

1. Add a small line near the hero CTA qualifying the audience: “Self-hosted · your server and AI keys” (or equally concise natural copy).
2. Add a brief nearby examples note that layouts are illustrative and actual notes contain summaries, transcripts and takeaways. Qualify source/extraction availability; replace “Instagram and Facebook are fully supported” with accurate supported-video wording and a compact source-availability qualifier. Do not redesign the illustrations.
3. In existing privacy content, add one sentence explaining relevant content is sent to configured AI providers for transcription/analysis. Keep “nothing sent” scoped to local sample search.
4. Fix command Copy control clipping at 375/390px. Existing `.start__body` is a grid with an implicit auto column; ensure command and copy control stay within its allotted column, with long text scrolling inside. Verify a realistically long command as well as placeholder; do not merely hide overflow or shrink text to mask the bug. Preserve compact desktop two-column and phone stacked layout.
5. Keep exactly two numbered setup actions. One short note may say in-app AI connection is required and provider charges apply. Installer command remains clearly marked preview and download disabled. Do not implement onboarding, create a fictional executable URL or enable the fixed-host v6 as a portable download.

## Ownership

Claude Opus 5.5 High worker owns only `designs/landing/index.html` and `landing.css`. No other files, app changes, packages, git, installer, or delegation. Existing workspace `wks_4d5154f1b923fb81`, branch `codex/consumer-landing-unfold`, preview port41006. Launch at 2026-10-19 00:24 UTC reported a new session limit resetting 2026-10-18 23:30 America/Toronto. No UI files were changed by that attempt; resume once after the reported reset.

Foreman owns docs, verification, checkpoint/PR49, and mechanical publication of the approved static bundle into `site/` for existing GitHub Pages workflow. This does not authorize or perform production-app promotion.

## Runtime-routing follow-up (2026-10-18)

Stephen subsequently authorized and Codex implemented `/` public landing, `/login` existing authentication, and `/app` private dashboard. Runtime packaging (`scripts/package-landing.mjs`) adds Sign in/Open app links using existing link styles and a session/legacy-invitation script, without editing the design HTML/CSS. Preserve that integration when polishing the source: keep hero `data-try`, privacy link, and script references usable by the packager. After source sync, rebuild and verify the integrated page as well as the static preview. No new approval or onboarding scope is introduced.

## Original polish acceptance

Small diff implementing copy above; no approved visual direction changes. Copy button fully visible, tappable and within command box at 375/390px with both placeholder and long command; no page overflow; desktop unchanged. Hero, example selector and sample search remain intact. Existing preview labels remain honest and obvious enough. Use own browser/tab; report focused checks and limitations, then finish. No extra exploration.
