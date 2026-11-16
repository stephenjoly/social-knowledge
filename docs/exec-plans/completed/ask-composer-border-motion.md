# Subtle clockwise composer border

Status: completed; motion and priority scroll regression verified on the preview
Owner: delivery lead; UI implementation by Claude Opus 5.5 high
Date: 2026-10-22
Branch: codex/ask-ai-ui-mockup; draft PR64, preview only

## Approved intent
Stephen requested replacing the flat green composer outline with a very subtle clockwise travelling outline highlight, referencing the current follow-up composer screenshot. This is an explicit amendment to the approved static design, not a redesign.

## Screens and behavior
- Apply to the existing Ask composer in new-chat and conversation screens (mockup states 1, 2 and 5), preserving its dimensions, radius, white surface and controls.
- A single faint sage-green highlight travels clockwise around the thin border. Start around an eight-second cycle; keep contrast and opacity restrained. No rainbow, pulsing halo, rotating contents or layout movement.
- Animate while the composer is focused or an answer is being generated; idle composer retains its normal border. Keep a clear static keyboard focus cue.
- Reduced motion gets a static border, with no continuous animation. Decorative layers must not intercept pointer events, obscure text/controls, clip the model picker or create overflow.
- Use existing tokens, CSS/native browser capabilities, no new dependency or provider/API change.

## Ownership and verification
Opus worker 872aa2f5-563b-4095-b6c0-f1e2c354574b owns web/ask.css and only a minimal composer state hook in web/pages/ask.tsx if needed. Do not edit backend/tests in that slice. Coordinate with its pending picker-geometry correction in the same files; sequential edits only.
Lead owns this plan, review, integration, final checks and preview publication. Test worker 501273cd-ea91-4d3d-b8b2-94609a22883e can own e2e tests if behavioral coverage is needed.

Acceptance: visually inspect two animation phases for subtle clockwise movement at 1360 and 390px; verify focus, sending/stop and picker interactions; emulate reduced motion and confirm no running decorative animation; retain strict picker viewport tests; run web typecheck, affected Ask Playwright and final npm run check. Publish to PR64 preview only after checks, then link the preview. No production, credentials, migrations or unrelated redesign.

## Progress
- User supplied exact visual intent and screenshot. Existing flat green effect is .ask-composer:focus-within in web/ask.css; streaming prop already exists in the Composer component.
- Opus provider quota was exhausted until 19:50 America/Toronto. Add this bounded task to the existing 19:51 continuation rather than substituting another model for UI work.

## Priority regression — outer-page scroll (2026-10-22)
Stephen supplied a screenshot where scrolling displaces the shell and exposes a large blank page below. Fix this BEFORE decorative motion. Reproduced on live PR64 at 1360×1000 by opening an eight-source long-answer conversation: document scrollHeight=1478 versus clientHeight=985, scrollWidth=1376 versus clientWidth=1345. window.scrollTo(500,10000) moves the outer page x=31,y=493 despite the shell/conversation themselves measuring one viewport. DOM geometry shows absolutely positioned .sr-only spans outside the clipped thread/source panes; inspect their containing blocks as a possible escaping-overflow cause. Do not remove accessible labels. Also inspect scrollIntoView ancestor behavior.

Acceptance: long synthetic answers and at least eight source cards; wheel/trackpad and programmatic scrolling cannot displace the desktop page/shell in either axis; thread and sources remain independently scrollable; header/sidebar/composer remain visible. Repeat after citation selection, source open/return, picker opening, Settings close, browser resize and zoom. Cover WebKit as well as Chromium where available. Mobile must remain usable with its intended viewport/keyboard scroll behavior; do not blindly disable document scrolling globally or break other app pages. Opus owns any CSS/layout correction; Codex worker owns a deterministic synthetic e2e regression only.

## Verification progress
- c206da0 positions the thread and sources scrollers so their absolute accessibility labels remain contained; desktop conversation uses overflow:clip, which cannot itself be scrolled by scrollIntoView. Phones retain intended document scrolling. No accessibility labels removed, no global scroll lock.
- The same checkpoint measures picker placement against the visible band and clipping ancestors, chooses an available side, and scrolls within its constrained height.
- Test bf640f7 reproduces the bug before correction; 519a73b corrects a test-hook syntax typo and c01ec77 adds wide desktop coverage. Strict scroll and model-picker regressions pass 2/2 on c206da0, including 1920×1080 and 390px. Final suite and live publication pending.

- Motion checkpoint 6b1a32b adds a masked one-pixel sage border highlight, eight-second clockwise cycle, active only for focus or streaming. Reduced motion hides the moving layer and preserves a static focus/border cue; the decorative layer takes no pointer events.
- Test checkpoint 48bfeb1 measures clockwise progression during focus and paused synthetic streaming, idle stopping, reduced-motion fallback, hit testing and unchanged document geometry at 1360 and 390px. Final combined Ask suite passes 5/5 in Chromium and 5/5 in WebKit. Lead reviewed desktop/mobile motion captures and picker/Settings comparison; no additional design changes beyond Stephen’s requested motion and current-model rows.
- Final npm run check passes 357/357 tests, 40 files, strict TypeScript, docs, site parity and production build. Affected archive, streaming/mobile and Settings journeys pass 11/11 without skips. Deployed native-browser verification pending.

## Final acceptance — 2026-10-22
Deployed correction 932bb5d96420274350315584637ba368b72b7fac. Required CI passes: https://github.com/stephenjoly/social-knowledge/actions/runs/39876262582 (1m12s). Full check passes 357 tests in 40 files; final Ask Chromium 5/5, WebKit 5/5 and affected archive/streaming/Settings journeys 11/11 pass without skips. Temporary local servers and synthetic test databases were cleaned up. No production, provider-key or saved-default change.

Lead verified the deployed eight-source conversation in the native browser at 1360×1000: document width/clientWidth both1360, height/clientHeight both1000; scrollTo(500,10000) leaves x0/y0 and shell bounds unchanged; thread and sources both independently reach scrollTop500. Preview health/login/review dataset pass (12 chats, one pinned, one pending, one failed, both simulated providers). Current-model real Luna generation evidence remains the retained demo-member verification chat, 7.944s and six cited sources.

Screenshots and comparison: output/playwright/ask-chat-first/ (state1–6 and motion1360/390 phase/reduced captures). Lead review retains the approved layout. New model rows/descriptions, measured popover placement and requested subtle clockwise border are intentional; no remaining unapproved visual deviation. Earlier quota/heartbeat/publication limitations above are historical and resolved. No remaining decision.
