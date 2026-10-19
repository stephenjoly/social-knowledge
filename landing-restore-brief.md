# Restore Unfold, simplify Get started

Status: user explicitly requests undoing the real-app refinement. Restore immediately. Current user feedback authorizes design changes; a separate question is pending about building a real installer versus first reviewing the two-step mockup.

## Approved visual contract

Return to `e12c5f3` for the five page files (`index.html`, `landing.css`, `landing.js`, `data.js`, `README.md`). This is the accepted original animated Unfold design with recipe/workout/travel card deck. Remove the actual-app screenshot section, native app crops and all long server/Shortcut setup content. Preserve original hero, examples, colour, typography and motion. No new redesign and no screenshots.

Add ONE compact Get started section, two sequential steps only: **1. Run this on your server** with one-line curl command and copy action; **2. Add the iPhone Shortcut** with one download button. Small inline prerequisite note or external setup-guide link is acceptable; no prerequisites card, five-step list, command generator, fixed-host warning panel or expanded technical manual. Main CTAs say Get started and go here; sample search remains a secondary experience. Mobile, keyboard, reduced motion and the existing motion quality still apply.

## Pending functionality boundary

No existing one-line installer or portable Shortcut currently exists. Parent has asked whether to build those now or only mock up this section first. DO NOT invent a working installer endpoint or imply the fixed-host v6 download works for arbitrary servers. Restore original page promptly; implement compact layout with elements `data-install-command`, `data-copy-install`, and `data-shortcut-download`. Parent will send concrete URL/artifact contracts after the scope answer. Until then visibly label the new setup block a preview; don't silently present a fabricated URL as executable. Do not expand technical caveats into the page. Keep any remaining work in README/report, not product copy.

## Ownership

Opus 5.5 High owns the five static page files only. No app/source/scripts/Shortcut artifacts, git operations, package changes, screenshot assets, or delegation. Foreman owns artifact cleanup, functional contract, history docs, hosting, checks, checkpoint and PR49. Existing workspace `wks_4d5154f1b923fb81`, branch `codex/consumer-landing-unfold`; static preview remains port41006.

## Acceptance

Original visual design restored; no actual-app images or long setup sections remain; one compact two-step Get started flow; no fake executable installer or wrong-host download claims; hero/search/deck preserved; desktop/mobile/keyboard/reduced-motion checks pass. Report early when original design is restored, then finish compact layout and README. Use landing-motion-design instructions and prioritize quick restoration over fresh exploration.
