# Note viewer — two Opus 5.5 mock-ups

Status: historical mock-up brief. Stephen approved B, which was implemented
separately in PR #70. A remains an unimplemented design alternative.

## Goal and agreed scope
Replace the disruptive full-detail reading experience with contextual inspection. Deliver TWO distinct polished interactive UI proposals: A) a contextual side panel and B) a centered modal, with the modal recommended by the user. Both preserve the underlying Ask conversation or Inbox and its scroll position. Desktop video and note content should sit left/right. Preserve the portrait video's natural framing; no expansive black player region, no cropping/stretching the actual video. Settings' existing modal is the visual precedent, not Jira's branding.

## Explicit model boundary
Stephen: “Opus 5.5 is only for this kind of UI mock-up exercise.” You may make standalone prototype HTML/CSS/JS and design assets ONLY. No runtime web/, src/, tests, package/dependency, auth, navigation, database, environment or deployment changes. No additional agents. Do not turn this into implementation or an app redesign.

## Reference screenshots used during design
1. Original long-form note with an inefficient wide video teaser and full-page detail.
2. Portrait video playing inside a large landscape-shaped black box.
3. The approved Settings modal, used as the visual reference.

The original reference screenshots were private and are not included here.
Use the committed synthetic note, chat, and media fixtures when reviewing the
mock-ups.

## Visual and interaction brief
- Match existing app typography/tokens, muted green accent, calm borders and restrained hierarchy. Read current web/design-tokens.css, web/typography.css, relevant note/Ask/Settings styles, and designs/app/ask-chat-first/index.html + README.
- A side panel: meaningful alternative with chat still readable behind/beside it. Avoid forcing two unusably narrow prose columns; show how the media and note fit and how a reader closes/returns.
- B modal: primary recommendation. Portrait media on left, readable note on right, compact title/creator/source header and clear Close. Notes can scroll without dragging the player away; metadata/long entity lists can be progressive disclosure. Relevant takeaways/transcript/source attribution remain accessible.
- Entry from Ask source card Open note and Inbox row; preserve context on close. Escape and Close, focus return, background scroll lock appropriate for modal, visible keyboard focus, reduced-motion behavior. Pause any real playback on close. No autoplay audio.
- Show desktop at 1360x1000 and a narrow 390x844 adaptation for BOTH options; no horizontal overflow, clipped media, lost Close controls or giant empty black player canvas. Landscape/image/no-video states should be described or demonstrated with a small fixture switch, not redesign the whole app.
- Use existing Settings scrim/radius/surface language. No decorative gradients, new branding, dashboard mosaics or gratuitous animation. Do not copy every Settings nav element into a note viewer.

## Deliverables and ownership
Own ONLY designs/app/note-viewer/** in the new codex/note-viewer-mockups worktree. Copy this shared brief there as brief.md. Deliver comparison index with both runnable options (e.g. side-panel.html, modal.html), shared local assets/styles, concise README with recommendation and differences, and desktop/mobile screenshot folder. One working local review link, ideally http://127.0.0.1:5247/ from a server serving ONLY this design folder; confirm the port is free and do not touch other servers. Keep the review server available for the parent/user and report its PID/session and stop command.

## Verification and boundaries
Use frontend-skill and uncodexify instructions appropriately for app UI; user-authorized mock-ups are the build scope, no reconfirmation needed. Run preflight. Inspect actual files rather than infer behavior. Self-review once in a browser at both sizes; fix clear issues within mock-up files only. Verify open/close/escape/focus, content tabs, responsive layout and no horizontal overflow. Preserve unrelated work. No production calls, private archive reads or paid API use. No dependency installs or changes. Commit only scoped mock-up artifacts if complete; do not push, open PR or deploy. Return file paths, one review URL, screenshot-folder link, concise tradeoffs, recommendation, and honest verification limits.

## Implementation findings for reference (read only)
Ask openSource in web/pages/ask.tsx saves reading position then calls onOpen(id). web/main.tsx passes setDetail; a Detail component is rendered in the main shell. web/knowledge.css uses .shell:has(> .capture-note) to hide other workspace children, so the chat is replaced visually. .note-video is width:100%, max-height:480px, background:black, causing portrait content to pillarbox across a wide note article. This explains the current result but does not justify implementing changes before the user chooses a mock-up.
