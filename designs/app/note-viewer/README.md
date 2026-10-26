# Note viewer — two mock-ups (A side panel, B modal)

**Status:** B (centered modal) was approved and implemented in the app in PR #70.
A (side panel) remains an unimplemented alternative. These files preserve the
original interactive design comparison; they are not the production interface.
Scope is in [`brief.md`](brief.md). Open [`index.html`](index.html) to compare,
or run the two prototypes directly:
[`modal.html`](modal.html) (B, recommended) and [`side-panel.html`](side-panel.html) (A).
They need no build or network, but the media only loads over HTTP:

```sh
python3 -m http.server 5247 --bind 127.0.0.1 --directory designs/app/note-viewer
```

Screenshots are in [`screenshots/`](screenshots/): desktop at 1360×1000 and phone
at 390×844.

## The problem

Before PR #70, opening a note from an Ask source card or an Inbox row replaced the whole
workspace with the full detail page (`.shell:has(> .capture-note)`). The player
there is `.note-video { width: 100%; max-height: 480px; background: black }`, so
a 9:16 reel sits in a wide black box above the note.

## What both options share

- The note opens over the chat or Inbox. The thread's scroll position is left
  alone, and on close focus returns to the source card or row you were last viewing.
- **Left: the original post.** The poster is shown at the media's own aspect
  ratio (`aspect-ratio` plus a container-query fit), so it is never cropped,
  stretched or boxed in black. Below it: creator, platform, caption and
  **Open original**.
- **Right: what Social Knowledge wrote.** Title, meta, the **Filed in** shortcut,
  and three tabs: **Note** (bottom line, collapsible claims to verify,
  takeaways, actions, evidence with timestamps), **Transcript** (select a line to
  play from there; the current line is highlighted) and **Details** (filing,
  topics, source URL, caption, language, *Also mentioned* showing 6 with
  "Show all", and comments). The note scrolls on its own; the player stays put.
- **Ask about this** puts an "About: …" chip in the Ask composer.
- ← → or the pager steps through the current answer's sources, or through the Inbox.
- The video loads only when you press Play: the poster is a button, as
  `.note-media` is today, and there is no autoplay. Playback pauses when you
  step to another note or close.
- Escape closes. Tabs use arrow keys. Focus is visible throughout. With reduced
  motion, the fade and sheet transitions are effectively removed.
- Media fixtures: portrait reel, landscape video, 4:5 photo carousel, and a
  text-only post (no media column).

## B · Centered modal (recommended)

Same layer as Settings (`#18181b47` scrim, 14px radius, `--shadow-dialog`): up to
1120×820, with a 400px canvas-tinted media column like the Settings nav. The
dialog is `aria-modal`, the app behind it is `inert`, focus is trapped, and
clicking the scrim closes it. Landscape and text-only notes shrink to fit their
content. On phones it is full screen, with a sticky bar (context, pager, ×) and
sticky tabs.

**Why B was chosen:** the note gets a 640px reading measure and portrait video is
large. It is the pattern Stephen already approved for Settings, and it reuses
`useDialogFocus` and the `.sm-layer` styles, so it is the cheapest and least
risky to build.

## A · Side panel

The panel takes the Sources panel's place (with **← Sources** to go back), or
docks beside the Inbox list. It is non-modal: the composer and the list stay
usable, Escape closes only when focus is in the panel, and other Inbox rows open
in place. It defaults to 680px, can be dragged or resized with the arrow keys
from 520 to 900px, and always leaves the chat at least 380px. On phones it is a
90% bottom sheet that is modal there.

**Tradeoffs:** a 200px player and roughly 420px columns for both the note and the
chat. Landscape video stacks above the tabs and uses a lot of the panel's
height. Building it needs a new docked region, scroll anchoring and non-modal
focus rules. Its strength is triage in the Inbox; that can be revisited later
on top of B.

## Honest limits

- Every note, creator, handle, comment, clip and image is invented. The clips
  in `assets/media/` are silent slide videos rendered from
  `assets/src/slides.html` by `assets/src/make-media.sh` (Chrome and ffmpeg).
  Transcript lines are timed to the slides; no real audio is involved.
- Open original, Move, the sidebar menu and Ask from the Inbox show a short
  message instead of acting.
- The desktop screenshots come from `assets/src/capture-screens.sh` (headless
  Chrome). The phone screenshots were taken in an in-app browser, because headless
  Chrome cannot render a viewport narrower than about 500px. Checks were run in
  Chromium only; Safari and Firefox were not checked.
- Fonts and tokens are copied from `web/`. No production file was changed.
