# Consumer landing page — design spec: "Unfold"

Status: historical initial concept, approved and built on 2026-10-18. Current restoration scope is recorded in [`landing-restore-brief.md`](landing-restore-brief.md); the current browser mockup and review script are in [`designs/landing/`](designs/landing/README.md). The intervening real-app refinement was rejected by Stephen; the initial visual design has been restored. The initial build omitted placeholder Sign in and placed sample search in its own section.

Approved follow-up: [`landing-approved-polish-brief.md`](landing-approved-polish-brief.md) adds a finished footer, concise claim/requirements copy and the mobile Copy fix. The integrated runtime now serves `/`, `/login` and `/app`, with session-aware app links; the initial concept below remains historical.

## Concept

A saved post is folded-up value. The page shows one video post unfolding into its useful parts (who made it, what was said, the steps, the places), filing itself into a private library, and coming back when you search for it. The motion follows what the product does: share → understand → find.

## Visual character

- **Warm, calm, tactile.** A paper-white canvas (`#F7F4EE`), ink `#18181B`, and the app's deep green `#26322B` for actions. One bright highlight colour, marigold `#F2B33D`, marks whatever the motion is currently doing (an active stage, a matched word, the source link).
- **Inter only.** Uses the font already in `web/fonts`. Headlines are large and tight (clamp 44–104px, weight 700, −0.03em tracking); body text is 18px.
- **Objects, not screenshots.** The page shows a stylised phone, video tiles and soft-shadowed paper "note cards" that echo the app's light UI without copying its screens. The thumbnails are flat SVG illustrations (a bowl, a kettlebell, a mountain ridge). Every handle and caption is invented and labelled "Example".
- It must look clearly different from the current open-source `site/` page, which is a developer pitch. This page speaks to everyday users.

## Content sequence and draft copy

1. **Nav:** wordmark · How it works · Privacy · `Sign in` (provisional).
2. **Hero: "You saved it for a reason."**
   Subhead: *"Social Knowledge turns the Instagram and Facebook videos you share into a private library you can search, read and actually use, with the creator and original link always attached."*
   CTA: `Try the search` (local demo, see CTA behaviour) · text link `See how it works ↓`.
   Animation: a phone shows a crowded Saved grid. A share sheet slides up, someone taps "Social Knowledge", and one tile lifts out and flies to a note card on the right. The card unfolds in layers: a source chip (`@weeknight.kitchen · Instagram · original ↗`), transcript lines, a summary ("Crispy gochujang chickpeas, one pan"), a step checklist and topic tags. The example then changes: recipe → workout ("10-minute lower-back warm-up") → travel ("Quiet onsen town 2h from Tokyo"). The card has a fixed height, so the headline and CTA never shift.
3. **The problem: "Your Saved folder is where good ideas go to hide."** As you scroll, the grid of saved tiles grows and dims into a wall. Three captions drift past it: "That pasta." "That shoulder routine." "That hotel with the view." No statistics.
4. **How it works (pinned, three steps that stay on screen):**
   - **Share:** the iPhone share sheet and the Shortcut. A receipt says *"Link received. We'll keep working on it."* (receiving a link is not the same as finishing it). A line underneath: "Or paste a link in your browser."
   - **Understand:** a progress rail shows the app's real stages: **Added → Found → Media → Text → Saved**. The video splits into layers: the audio waveform turns into transcript text, the key frames line up as a strip, and the caption becomes the summary. A chip reads *"Translated from Korean · original kept."* No durations are shown.
   - **Find:** the search box types "that chickpea thing" and the matching card rises with the matched transcript words highlighted. Then an Ask bubble, *"What warm-ups did I save for my lower back?"*, gets an answer citing two saved posts.
5. **Everyday examples:** a stack of three cards (Recipe / Workout / Travel). Choosing one lifts its video front and unfolds the matching note behind it: ingredients and steps, sets and cues, or places and tips. All three cards keep the same height.
6. **Privacy and sources, "Every note keeps its receipts":** a thread animates from a summary sentence → the transcript moment it came from → the original post link. Beside it are plain statements:
   - Your library is private to your account.
   - You choose and connect the AI provider, and your keys are stored encrypted.
   - You can download everything: notes, transcripts and media, in a format that opens in Obsidian.
   - Facebook and Instagram are fully supported. Links from other platforms are kept as bookmarks only.
7. **Take it with you:** note cards fold into an export bundle. A small extra: "Let a compatible AI assistant read your library (read-only)."
8. **Closing, "Keep what you save.":** the primary CTA repeats, with `Sign in` beside it.

## CTA behaviour

`Try the search` scrolls smoothly to the Find demo and focuses its search box. The demo filters about 9 invented captures on the device and offers suggestion chips ("that chickpea thing", "hotel with the onsen", "lower back warm-up"). Results show the matched evidence and a source chip. If nothing matches, it says so honestly: "Nothing saved about that yet." Nothing is sent anywhere. Pressing the button gives visible feedback with a 120ms press state. `Sign in` points to the relative path `/` (the app login), as a placeholder.

## Implementation medium

- A standalone, dependency-free static mockup in a new folder, `designs/landing/` (`index.html`, `landing.css`, `landing.js`). It runs with any static server and has no build step.
- Motion uses CSS and the Web Animations API. Scroll scenes take their state from scroll progress (a single requestAnimationFrame reader), so slow, fast, interrupted and reverse scrolling all land on the correct frame.
- The demo content lives in one data array, separate from the animation code. No package or app changes.
- Rejected options:
  - Motion or GSAP would mean adding a dependency or a CDN for a mockup.
  - Editing `site/` or the React app would be premature before the launch flow is decided.

## Responsive and reduced motion

- **Mobile (≤640px):**
  - The hero stacks: the phone sits above the card, and the tile drops down instead of flying across.
  - The pinned steps become a normal scrolling sequence that reveals each step as it comes into view.
  - The example cards become a horizontal swipe row that snaps to each card.
  - The layout is tested at 375px with no horizontal overflow.
- **Tablet:** the same layout as desktop with tighter spacing.
- **`prefers-reduced-motion`:**
  - Nothing flies, scrubs or types itself.
  - Hero examples switch only with buttons, using a 150ms cross-fade.
  - All three steps are shown fully drawn, and the threads appear already drawn.
  - All content stays readable.

## Browser acceptance checks (next milestone)

1. At 1440×900 and 390×844, the hero's value is visible within 1 second, and the headline and CTA do not move during example changes (the hero's layout shift score is 0).
2. A very fast scroll from top to bottom, then reversing, leaves no section blank or half-drawn. Stopping midway shows a consistent, partly finished state.
3. Keyboard only: Tab reaches the nav, both CTAs, the example selector and the search box. Focus is visible, and arrow keys switch examples.
4. `Try the search` focuses the input. Each suggestion chip returns the expected invented result, and an unknown query shows the empty state.
5. Emulated reduced motion shows every section complete and readable.
6. No console errors, no network requests beyond the page's own files, and no horizontal overflow at 375px.
7. Every handle and caption is invented and labelled as an example. No copy claims anything outside the confirmed list below.

## Claim checks (verified against `origin/staging`: `docs/product.md` and `README.md`)

These are supported by the docs:

- Apple Share Sheet/Shortcut capture and pasting a link in the dashboard.
- The Added/Found/Media/Text/Saved stages.
- Shortcut receipts that separate "link received" from "capture finished".
- Transcripts, summaries, topics and evidence.
- Translation that keeps the original transcript.
- Search, and Ask answers that cite saved captures.
- Read-only access for AI assistants.
- Full export and Obsidian output.
- Account isolation and encrypted provider keys.
- Other platforms kept as bookmarks only.

Deliberately avoided: pricing, sign-up, user counts, testimonials, processing speed, guarantees of "end-to-end", "we never see" or "secure", and integrations beyond these.

## Assumptions

- "Social Knowledge" is a provisional name.
- Users bring their own AI provider. This appears only in the Privacy section, not the hero.
- All media is invented SVG. No real creators' content.

## Out of scope

- The production site, and any changes to `site/`, the React app, server routes, dependencies or deployment.
- Real sign-up, waitlist or analytics.
- Real thumbnails or creators.
- A design-tool file.
- Alternative concepts.

## One open decision

**What should the public CTA do?** The options are request an invite, join a waitlist, or self-serve sign-up. Until that's decided, the mockup uses the local `Try the search` demo plus a placeholder `Sign in`.
