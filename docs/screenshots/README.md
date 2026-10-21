# README screenshots

These are direct Chromium captures of the current application UI, using only
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
