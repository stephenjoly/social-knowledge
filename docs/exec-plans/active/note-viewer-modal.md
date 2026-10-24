# Implement approved B note modal

Status: approved for implementation by Stephen: “B is definitely the way to go.” Production release remains a separate step.
Design authority: Opus 5.5 mock-ups at /Users/stephenjoly/.paseo/worktrees/19wvwyxn/note-viewer-mockups/designs/app/note-viewer, latest mock-up commit 5d99ec0. Use B modal.html, shared assets/app.css and app.js, screenshots desktop-b-modal-* and mobile-b-modal-*. A is rejected for this milestone. Do not publish the comparison/demo assets as production app data.

## Scope and design contract
Port the accepted B composition faithfully into the existing app: centered Settings-like modal, up to1120x820, portrait media left, readable note right, independent reading scroll, real intrinsic media framing without a wide black box, fullscreen phone adaptation with reachable close/pager/tabs. Preserve current app tokens and accepted styling; do not invent a new design. Opus is restricted to mock-ups/review. Production integration is a mechanical port of its accepted design, with runtime behavior handled by Codex.

Entry points: Ask source Open note, Inbox rows and existing Library note opening. Underlying workspace remains mounted/visible behind scrim and retains exact conversation/filter/scroll state. Close button, Escape and scrim restore origin focus without scrolling it; nested filing/dialog Escape closes only its own layer. Trap focus, mark background inert, lock/restore outer scrolling and keep close reachable. Use existing useDialogFocus and modal primitives where suitable; preserve Settings behavior and layered modal ownership. Pending Ask streams remain owned by their chat while inspecting a note.

Preserve all existing capture content and real actions. Note/Transcript/Details tabs follow B: bottom line, takeaways, actions, timestamped evidence; folded claims to verify; details include filing/topics/attribution/comments/language/entities with progressive disclosure. Keep current editing/filing/recovery/ownership behavior. Do not invent transcript timecodes, metadata or recommendations. Seek only when actual stored timing exists; plain transcripts remain readable. Original links remain the genuine stored source URLs. Preserve the existing Ask-about-this prefill action without auto-sending or pretending a new backend context capability exists; report a material difference from the prototype instead of silently faking it.

Media: portrait/landscape video, images/carousel, missing-media/text-only, pending/loading/failed capture responses. Fit within real available height/width, no cropping/stretching or horizontal scroll. Play only on user action; pause and reset appropriately on close/change; loading/error states stay in modal. Pager uses the current answer's sources when opened from Ask and current visible list order for Inbox/Library; never all users/all captures. Do not create or widen backend reads. If existing List API does not expose context order, coordinate the smallest typed UI contract.

## File ownership
Runtime integrator owns web/** and docs/exec-plans/active/note-viewer-modal.md (copy this brief there at start); no e2e/** or test/** writes. Existing design files are read-only references. Avoid broad unrelated formatting/refactors. No src/ backend/schema/AI policy/credential/model changes, dependencies or source media commits. No real production data or paid calls. Tell lead if a backend gap is genuinely blocking.
Acceptance worker owns e2e/** and only focused test/note-viewer*.test.tsx if useful; no web/**, docs or build changes. No other subagents. Both share the new implementation workspace and disjoint files.
Lead owns docs/product.md, integration/full check, build coordination, staging PR/preview and final visual comparison.

## Acceptance checks
1. Ask → source Open note opens dialog over same chat; no page replacement/root scroll. Close/ESC/scrim restores exact focus/scroll; reopening same source and stepping sources work. No regression to citations, stream ownership or retry/new-chat behavior.
2. Inbox and Library open same modal, preserve list filters/order/scroll, next/previous stay within appropriate context and close returns correctly.
3. Real synthetic video plays only after click, preserves portrait ratio, pauses on close/switch; landscape/photo/text/error and long-content states fit. Use test-generated media, never commit private/media assets.
4. All retained content/actions are available, links genuine, keyboard tabs/pager accessible; nested Move/file/settings dialogs do not accidentally close the note. Transcript seeks only from stored timestamps.
5. Desktop1360x1000 and1920x1080, narrow1280x900, phone390x844: zero horizontal movement in root and panes, close and media controls hittable, long text wraps, note scroll independent of video/background. Reduced-motion behavior preserved. Chromium and WebKit acceptance.
6. Focused checks while iterating, npm run check at integration, existing affected Ask/archive/reading/navigation/settings browser suites pass or are updated only for intentional new modal semantics. Keep strong geometry/owner assertions. One final staging-owned preview with synthetic data and one final comparison against B, reported as textual differences and screenshot-folder link.

## Coordination
No worker builds shared dist while another runs browser tests. Runtime worker runs typecheck/focused logic checks and commits scoped changes, then notifies BUILD REQUESTED. Acceptance worker creates regression coverage/red evidence against existing dist when available, releases its port, then waits for lead BUILD READY before green runs. Unique test ports/artifact folders; do not use5247 (mock-up review server), and coordinate8801/4186. No push, PR, deployment, credential changes, installs or further agents by workers. Parent notifications enabled; report checkpoints and blockers, not repeated polling.

## Runtime integration checkpoint — 2026-10-23

- Ported B modal composition from approved desktop/mobile references into `web/note-viewer.css` and the capture detail component. Background shell remains mounted and inert; the dialog owns independent reading scroll, tabs, context-scoped paging, close/scrim/Escape, and nested filing.
- Entry contract: `OpenCapture(id, { captureIds, label })` snapshots the opening answer's sources or visible Inbox/Library order. No new backend reads or schema changes.
- Real asset dimensions drive media framing. Video preloads metadata without playing, starts only from Play or a real evidence timestamp, pauses/resets on capture change/close. Existing thumbnail-only video captures retain the thumbnail and genuine original-link recovery; galleries have bounded previous/next photo controls.
- Stored evidence `timestampSeconds` may seek actual video. Transcripts have no stored segment timing and remain plain text. No timestamps fabricated.
- Ask keeps its stream mounted/owned by its conversation while following is suspended during inspection. The existing title-based Ask-about-this URL now populates a draft explicitly (the old link's `q` parameter was not consumed by Ask); never auto-sends and implies no new source-binding capability.
- Shared `useDialogFocus` now limits keyboard ownership to the last modal layer; initial/return focus use `preventScroll`. It also includes summary/video controls. Move uses that primitive, replacing its local trap; Settings itself retains its existing handler.
- Verification: `npm run typecheck` passed; focused Vitest Ask formatting/UI, primitives and Settings diagnostics: 4 files, 88 tests passed. No shared build or server started. Lead coordinates production build, browser acceptance, visual comparison, full check and rollout.
- Deliberate runtime differences: transcript timing unavailable; Ask remains a title-based prefill; recommendations retain their existing read-only action markers (no invented persisted checklist capability).

### Mobile stacking correction

- Chromium acceptance found the mounted phone Ask Sources sheet (`z-index: 96`) painted over B's original mock-up layer value (`70`). Raised only the production note layer to `100`, above Sources, sidebar (`95`), and shell menus (`90`). Nested Move remains inside the note stacking context; Settings, capture, command, and background panel rules stay unchanged.
- Typecheck and whitespace checks passed. Lead must rebuild before browser revalidation; runtime worker did not build or start a server.
