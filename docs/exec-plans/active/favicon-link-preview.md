# Favicon and public link preview

Status: implementation authorized by Stephen's request for a favicon and preview image.

Use the existing book mark, Inter, green and paper colors. Add SVG/ICO favicon, 180px Apple touch icon and a 1200×630 PNG using the approved “Keep what you save.” headline. Add generic Open Graph/Twitter metadata to landing and app shells. Runtime URLs use configured APP_URL; the standalone Pages site uses its public base. Preserve account privacy: previews remain generic brand content.

Acceptance: assets are public with correct formats/dimensions; landing/login/app metadata references working icons and absolute preview URLs; packaged and standalone landing assets match the canonical source; visually inspect share card and small icon; full check passes. No new logo, app layout, AI, schema, credentials or production deployment changes.

## Verification

- Existing app mark reused with Lucide attribution/license retained beside the public assets. Visual check confirms the icon and 1200×630 card render correctly in the existing palette/typeface.
- Full check passed: 42 files / 403 tests, strict types, docs, landing synchronization and production build. Route acceptance checks anonymous image access/dimensions, SVG/ICO and configured-origin metadata for landing/login/authenticated app.
- Impeccable detector ran once on touched HTML. It reported existing landing body/style warnings; this task changes metadata only and preserves that approved page.
- Runtime metadata is generic; private chat titles, media and account content never enter share tags. Standalone Pages metadata remains valid under its repository base path.
- Feature PR/preview verification pending; production deployment requires release approval.
