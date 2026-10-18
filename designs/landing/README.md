# Social Knowledge — "Unfold" consumer landing mockup

Standalone, dependency-free browser mockup of the consumer landing page described in
[`landing-design-spec.md`](../../landing-design-spec.md), refined per
[`landing-refinement-brief.md`](../../landing-refinement-brief.md). Illustrated posts and the
sample library are invented. App screenshots are the real React app with synthetic data
(provenance in [`app-evidence.md`](app-evidence.md)). Nothing is collected or sent.

## Run

```sh
python3 -m http.server 4173 --directory designs/landing
# open http://127.0.0.1:4173/
```

Any static server rooted at `designs/landing/` works. No build step, no packages. The page
itself makes no external requests; only the GitHub links and Shortcut downloads leave it,
when clicked.

## Files

| File | Owns |
|---|---|
| `index.html` | Page structure and static copy, including setup and Shortcut instructions |
| `landing.css` | Visual system, layout, CSS-driven motion, screenshot crops, responsive + reduced-motion rules |
| `data.js` | Demo content: three hero illustrations (one shared note format), nine-save sample library, search synonyms |
| `landing.js` | SVG thumbnails, hero sequence, scroll engine, local search, CTAs, copy buttons |
| `assets/` | Inter font + licence; actual app screenshots `app-inbox.png`, `app-capture.png`, `app-shortcut.png` |
| `app-evidence.md` | Screenshot provenance, synthetic seed manifest, verification and limits |

## Page order

Hero → Saved-folder problem → How it works → **The actual app** (Inbox + opened capture) →
optional sample search → Privacy → Export → **Get started** (self-hosted setup) →
**iPhone Shortcut** → closing.

## Grounding rules

- No topic templates. Every hero illustration unfolds into the same general note: source,
  title, transcript, key takeaways, topics. Tabs read Cooking / Fitness / Travel as sample
  saves, not modes.
- Real field names only: synopsis, bottom line, key takeaways, actions & recommendations,
  evidence, transcript & translation, source description, selected comments, original post.
- Setup mirrors the root README "Safe first test": `git clone`, `cp .env.example .env`,
  `API_TOKEN`, data dirs, `APP_URL=http://localhost:8787` for first local start, then
  `docker compose up --build -d` (binds `127.0.0.1:8787` by default). No installer script.
- Shortcut download links are the pinned v6 URLs from `web/shortcut-setup.tsx`
  (commit `e3c7c00`). The adjacent caveat states that the signed file targets
  `social-knowledge.stephenjoly.net` and shows the README generator commands with a quoted
  placeholder host.

## Review script (about 4 minutes)

1. **Hero (desktop 1440×900).** Headline readable within a second. One cycle: a tile is
   picked, the share sheet rises, "Social Knowledge" is tapped, "Link received" appears, the
   tile flies into the card, and the card unfolds (source → title → transcript → key
   takeaways → topics). Badge reads "Illustration". It repeats with Fitness and Travel in the
   same note format. Under the buttons: "Self-hosted · Bring your own AI key · iPhone Shortcut
   included".
2. Click **Fitness** / **Travel**, or focus the tabs and use ←/→. **Pause** stops the cycle.
3. **Scroll slowly** through the dark Saved wall and the pinned **How it works**; reverse and
   fling: every frame is coherent, nothing left blank.
4. **The actual app.** The Inbox screenshot settles in and its marigold folded corner opens.
   The caption reads "Actual app · sample data", plus a Full size link. Below, the opened
   capture (cropped to the drawer) sits beside the five real fields, which light up in turn,
   and an Ask note.
5. **Explore a sample library** (hero secondary link or closing link): scrolls to the demo and
   focuses the search. Chips: "that chickpea thing", "hotel with the onsen", "lower back
   warm-up". "kayak" shows the empty state.
6. **Get started** (nav, hero or closing): scrolls to the setup section and focuses it (URL
   `#start`). Check the prerequisites card, five steps, and **Copy** on each command: "Copied",
   or "Selected" with the command highlighted if clipboard access is blocked. Links: the
   full setup guide (README `#safe-first-test`) and the repository.
7. **iPhone Shortcut.** **Download iPhone Shortcut** and **Receipt-only version** point to the
   pinned v6 raw files. The heads-up about `social-knowledge.stephenjoly.net` sits right under
   them. Expand "Make one for your server": a quoted placeholder command, a replace-host
   note, and a link to the README Shortcut contract. Beside it: the real Settings → API keys
   card and the two states, receipt vs saved.
8. **Mobile (390×844 / 375×812):** hero stacks; screenshots use tighter crops so text stays
   readable; setup/Shortcut stack in one column; long commands scroll inside their own block;
   no horizontal page scroll.
9. **Reduced motion:** no auto-cycle or flight; screenshots, fields and scenes show fully
   drawn; CTAs jump without smooth scrolling.

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
- **Layout stability:** the hero note has a fixed height; screenshots use fixed aspect-ratio
  crops (`--ar/--cx/--cy/--cw` on `.shot__crop`, overridden at ≤700px); search results live in
  a fixed-height scroll area.
- **Screenshots** derive `--r` from scroll progress (settle and corner unfold), like the other scenes.
- **Search** is token + prefix matching across title, tags, summary, transcript and handle,
  with a tiny synonym map (`hotel → ryokan/guesthouse`), coverage-then-weight ranking, and DOM
  text nodes only (no HTML injection).
- **CTAs:** Get started is a real `#start` link enhanced with a bounded glide and focuses the
  section on arrival. Explore a sample library focuses the search input immediately
  (`preventScroll`), then scrolls. Long distances jump most of the way and glide the last screen.
- **Copy buttons** use `navigator.clipboard.writeText` and fall back to selecting the command,
  announced through a polite live region.

## Known limits

- Checked in Chromium (Paseo browser + headless Playwright, incl. reduced motion) at 1440×900 and 390×844; parent pass covered 375. Safari and Firefox not
  checked. `scrollend` is used when available, with a timeout fallback.
- There is no Sign in link or hosted sign-up: self-hosting is the launch path.
- Hero/problem/search thumbnails are flat SVG illustrations. App screenshots are static images.
  If the app UI changes, recapture them and re-check the crop variables.
- The bundled Shortcut targets one host. Self-hosters must generate and sign their own copy,
  which needs macOS (`shortcuts sign`).
- The download links and GitHub anchors were checked (HTTP 200) on 2026-10-18. No iPhone install
  was exercised from this page.
