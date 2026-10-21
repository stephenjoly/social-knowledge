# README screenshots

The raw screenshots are direct Chromium captures of the current application UI, using only
disposable synthetic demonstration data. Captured with a 1440 × 1100 CSS pixel
viewport, device scale 1, on 2026-10-21. Ask uses the full native page height to
include its follow-up composer. No image editing, app styling changes, invented
footage, or external photo assets are involved.

- `inbox.png`: Inbox with the existing synthetic archive and schematic thumbnails.
- `capture-detail.png`: saved note, attribution, takeaways, and source context.
  The Watch on Instagram placeholder is the application's real media fallback;
  the fixture contains no downloaded video.
- `ask.png`: a **seeded sample conversation**, not a live model response. Its two
  numbered source references point to synthetic saved posts. Restaurant details,
  names, dates, and source links are demonstration content, not recommendations
  or evidence of successful live ingestion.

## Reproduce

From the repository root, with Node.js 22+ and the lockfile dependencies installed:

```sh
npm ci
npm run build
npx playwright install chromium
npx tsx scripts/readme-screens.ts
```

For the initial Inbox review only:

```sh
npx tsx scripts/readme-screens.ts --only inbox
```

Then frame the captures for the project README:

```sh
node scripts/frame-readme-screens.mjs
node scripts/frame-readme-screens.mjs --only inbox
```

## Framed README copies

`README.md` shows `inbox-framed.png`, `capture-detail-framed.png`, and
`ask-framed.png`. The framing applies one presentation style to all three: a soft
blue, lilac, and cream gradient backdrop, a rounded light frame with a subtle
edge, and a diffuse shadow, inspired by a macOS Arc window screenshot. Only the
framing treatment was used from that reference; none of its content appears here.

`scripts/frame-readme-screens.mjs` renders static HTML and CSS in Chromium at
device scale 1. The raw capture is embedded at its natural size and integer
offsets (x 82, y 74), so it is never resampled. The raw files are read-only
inputs and stay byte-identical. After rendering, the script compares every
interior pixel of the framed copy with the raw capture, skipping only the 6 px
rounded-corner squares, and fails on any difference. On 2026-10-21 all three
copies matched exactly:

| Framed file | Size (px) | Bytes | Interior pixels compared, mismatched |
| --- | --- | --- | --- |
| `inbox-framed.png` | 1604 × 1248 | 390,295 | 1,583,856, 0 |
| `capture-detail-framed.png` | 1604 × 1248 | 420,121 | 1,583,856, 0 |
| `ask-framed.png` | 1604 × 1328 | 355,410 | 1,699,056, 0 |

The README header mark, `docs/readme/social-knowledge-mark.svg`, redraws the
app's `.app-brand-mark` at 2x. It is the `#26322b` badge with the
`LibraryBig` book glyph from `lucide-react` 1.41.0 (ISC License; the attribution
is kept in the SVG source). A faint inner edge keeps the badge visible on
GitHub's dark theme.

## Capture details

The script reuses `scripts/ui-fixture.ts`, signs in through `/login`, and opens
`/app`. It creates an ephemeral loopback server and a new temporary SQLite
database, media directory, and vault. It never reads a real archive or environment
credentials. Server fetches and browser requests outside the loopback origin are
blocked; no social download or model request runs. Credentials from the existing
test fixture stay off the captured screens.

Before each screenshot it waits for fonts and image decoding, checks horizontal
overflow, and rejects browser exceptions, console errors, or HTTP errors. Browser,
server, and temporary data are cleaned up in `finally`, including on failure.
The command reports screenshot sizes, overflow measurements, errors, and cleanup.
The login page's expected anonymous-session 401 and optional demo-account 404
probes are excluded from capture errors. All three authenticated captures passed
with no browser errors or horizontal overflow. Relative capture times can differ
between runs. Use Node.js 22 for native dependencies built under Node.js 22.

The exported book glyph retains the [Lucide license notice](../readme/LUCIDE-LICENSE.txt).
