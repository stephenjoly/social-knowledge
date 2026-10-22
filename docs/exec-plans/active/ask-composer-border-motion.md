# Subtle clockwise composer border

Status: approved request; implementation pending Opus availability
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
