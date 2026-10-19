# Social Knowledge — "Unfold" consumer landing mockup

Standalone, dependency-free browser mockup of the consumer landing page described in
[`landing-design-spec.md`](../../landing-design-spec.md), restored per
[`landing-restore-brief.md`](../../landing-restore-brief.md). Synthetic content only: every
creator, post, caption, transcript and search result is invented. Sample search runs locally and sends no demo content anywhere.

## Run

```sh
python3 -m http.server 4173 --directory designs/landing
# open http://127.0.0.1:4173/
```

Any static server rooted at `designs/landing/` works. No build step, no packages, no external requests.

For the integrated website, run `node scripts/sync-landing-site.mjs` then `npm run build`.
The supervised **Website preview** service serves the landing at `/`, existing authentication
at `/login`, and the private dashboard at `/app`, using an isolated disposable SQLite archive.
Runtime packaging adds Sign in/Open app links to the header, hero and footer, with one
same-origin session-status request. The standalone public bundle remains host-independent.

## Files

| File | Owns |
|---|---|
| `index.html` | Page structure and static copy |
| `landing.css` | Visual system, layout, CSS-driven motion, responsive + reduced-motion rules |
| `data.js` | All demo content: three examples, nine-save sample library, search synonyms |
| `landing.js` | SVG thumbnails, hero sequence, scroll engine, local search, examples tabs |
| `assets/` | Inter variable font (copied from `web/fonts`) and its licence |

## Review script (about 3 minutes)

1. **Hero (desktop 1440×900).** Within a second the headline is readable. Watch one cycle: a
   tile is picked in the phone's Saved grid, the share sheet rises, "Social Knowledge" is
   tapped, "Link received" appears, the tile flies into the note card, and the card unfolds
   layer by layer (source → title → transcript → checklist → tags). It then folds and repeats
   with Workout and Travel. The headline and buttons never move.
2. Click **Workout** / **Travel**, or focus the tabs and use ←/→. Click **Pause**: the cycle
   stops after the current example (the marigold underline shows the hold timer).
3. **Scroll slowly** into the dark section: the Saved wall fills in, dims, the headline
   appears and three "That pasta." notes settle on top. Scroll back up: it rewinds.
4. **How it works** pins on desktop. Scroll through: Share (sheet up, tap, receipt "Link
   received. We'll keep working on it."), Understand (Added → Found → Media → Text → Saved
   rail; audio → transcript, frames spread, caption → summary, translation chip), Find
   (query types, matching card rises, Ask answer cites two saves). Completed steps stay lit
   with a check. Stop midway: the frame is a coherent partial state. Fling to the bottom and
   back: nothing is left blank.
5. Press **Try the search** (hero secondary action). The page scrolls to the demo and the
   search box is focused; type straight away.
6. Use the suggestion chips: "that chickpea thing" → chickpeas; "hotel with the onsen" → onsen
   town then clifftop guesthouse; "lower back warm-up" → warm-up then hip-hinge drill. Type
   "kayak": "Nothing saved about that yet."
7. **Everyday examples:** switch Recipe / Workout / Travel. The front video lifts in the fan and
   the note refolds with ingredients/steps, sets/cues or places/tips. Note height stays fixed.
8. **Receipts:** scroll and watch the thread draw from summary → transcript moment → original
   post. Check the four privacy/support statements.
9. **Take it with you:** scattered notes gather into the `my-library` export folder.
10. **Get started** (nav or hero) reaches one compact two-step block in the closing: a curl
    command preview and an iPhone Shortcut download preview. Both are explicitly marked as
    not available. Copy copies placeholder text only; it is not an installer to execute.
11. **Mobile (390×844 or 375×812):** hero stacks phone above card and the tile drops down;
    steps become a scroll-revealed stack; no horizontal scrolling.
12. **Reduced motion** (OS setting or DevTools emulation): no auto-cycle or flying; tabs switch
    with a 150 ms cross-fade; every scroll scene is shown fully drawn.
13. **Footer:** brand, section navigation and GitHub remain readable on desktop and phones.
    Tab through its links to check visible focus. In the integrated Website preview, its
    session link opens `/login` when signed out and `/app` when signed in.

## Implementation notes

- **Motion stack:** CSS transitions + Web Animations API only. The hero tile flight is one WAAPI
  animation computed from live element rects, so it works at any layout (arc on desktop, drop on
  mobile).
- **Scroll engine:** one passive scroll listener schedules a single `requestAnimationFrame`
  that reads all rects, then writes CSS custom properties (`--p`, `--sheet`, `--rail`, `--d`,
  `--e`, …). Every scene derives its state from progress, so slow, fast, interrupted and reverse
  scrolling all land on a consistent frame. CSS turns those numbers into transforms/opacity.
- **Pinned vs stacked:** How it works pins only when wider than 960px and taller than 700px;
  otherwise each step reads its own in-view progress. Reduced motion forces all scenes to 1.
- **Hero loop** uses a cancellable token, so tab clicks interrupt cleanly. The hold timer only
  advances while the hero is visible, the tab is shown, and the user hasn't paused.
- **Layout stability:** the hero note has a fixed height; the examples note is sized to the
  tallest example at the current width; search results live in a fixed-height scroll area.
- **Search** is token + prefix matching across title, tags, summary, transcript and handle,
  with a tiny synonym map (`hotel → ryokan/guesthouse`), coverage-then-weight ranking, and DOM
  text nodes only (no HTML injection).
- **CTA** focuses the input immediately (`preventScroll`), then scrolls. Long distances jump
  most of the way and glide the last screen, so arrival is bounded.

## Known limits

- Checked in Chromium (Paseo browser) at 1440×900, 390×844 and 375×812. Safari and Firefox not
  checked. `scrollend` is used when available, with a timeout fallback.
- The standalone static page has no app behind it. The integrated runtime adds session-aware
  app access; existing first-administrator and invitation flows remain at `/login`.
- Thumbnails are flat SVG illustrations, not real media. Copy claims are limited to the spec's
  verified claim list.
- The one-line installer and generic self-hosted Shortcut are not implemented. The setup block
  is a visual preview with no fabricated working endpoint; the download has no `href` and is
  marked disabled. Existing fixed-host v6 artifacts are not advertised as portable downloads.
- Footer, requirements/output/provider copy and mobile command containment were verified in
  the integrated runtime at 1440/390/375px. Keyboard focus showed the 3px marigold outline;
  reduced-motion emulation kept the footer visible with no animation. Both placeholder and
  long command text keep Copy inside the command box; clipboard success used a test stub.
