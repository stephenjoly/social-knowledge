# Actual application screenshot evidence

Captured 2026-10-18 for the Unfold consumer landing page. Public-facing label: **Actual app · sample data**.

| Asset | Native viewport | Screen |
| --- | --- | --- |
| `assets/app-inbox.png` | 1440 × 900, DPR 1 | Inbox, Tiles, newest first; six synthetic captures |
| `assets/app-capture.png` | 1440 × 1100, DPR 1 | First capture opened through Inbox; Transcript expanded, drawer scrolled to top |
| `assets/app-shortcut.png` | 1440 × 1100, DPR 1 | Settings → API keys; initial guided iPhone Shortcut setup, before creating a key |

## Origin and fidelity

These are unedited Chromium screenshots of the existing React application, served by the real `buildApp` Fastify server at `http://127.0.0.1:4186`. No HTML/CSS/JS or app source was changed. The capture drawer and its dimmed background are native application UI. No browser chrome, testing overlays, invented templates, compositing, or image retouching were added.

Source checkout baseline reported by read-only preflight: `e12c5f3`, branch `codex/consumer-landing-unfold`. Existing `dist-ui` was used without rebuilding:

- `dist-ui/index.html` SHA-256: `f5b6f5dd8d3d036d08f5e7652ff1c5150c78c5a82995ba3f0ae16f0f69ae7502`
- `dist-ui/assets/index-BmAA05eN.js` SHA-256: `2358d629921c3cf93b7cbc01ab1a8e41561be1c709683511c7b0d5a42dd1f7e9`

The QA setup reused `test/helpers.ts:testConfig`, `src/app.ts:buildApp`, `src/db.ts:JobStore`, and `src/events.ts:EventHub`. An isolated temporary SQLite database, media directory, and vault directory were configured. The capture worker was never started. A synthetic member named `sample-library` received an in-memory local session using `AuthService.issueSession`; no real account, password, API key, cookie export, or private library was accessed.

## Seed data and actual schema

Records were inserted through `JobStore.createOrGet` and `JobStore.createCapture`, then `assignClassification` and `complete`. Every job and capture belongs to the one synthetic member through `ownerUserId`. This uses the real persistence schema (`CaptureRecord` / `AnalysisResult` in `src/types.ts` and `LibraryClassification` in `src/library.ts`), rather than patching React state or returning a redesigned fixture response.

| Saved date | Title | Synthetic creator | Platform | Domain / subcategory | Topics |
| --- | --- | --- | --- | --- | --- |
| 2026-10-17 | A small creative habit that lasts | Studio Sunday · sample | instagram | Learning / Guides | Creativity, Daily habits |
| 2026-10-16 | A better way to keep useful references | The Reference Desk · sample | facebook | Technology & Tools / Reference | Organization, Creative work |
| 2026-10-15 | Weeknight cooking with pantry staples | Everyday Kitchen · sample | instagram | Food & Drink / Techniques | Cooking, Pantry |
| 2026-10-14 | Planning a slower weekend in Lisbon | A Weekend Outside · sample | facebook | Travel / Guides | Lisbon, Walking |
| 2026-10-13 | Make a reading corner feel inviting | Room to Breathe · sample | instagram | Home & Design / Home & Design | Small spaces, Reading |
| 2026-10-12 | Remember more of what you read | Learning Notes · sample | facebook | Learning / Guides | Reading, Learning |

Common capture fields: generated UUID job/capture IDs and source hashes; `sourceType: "video"`; `sourceId: "synthetic-sample-N"`; `creatorUrl: null`; `description: "Synthetic sample content for the public product demonstration."`; `sourceLanguage: "en"`; translated transcript/language and published date null; duration 30 seconds; comments, entities, assets, and claims requiring verification empty; relative synthetic `notePath: "Captures/sample-N.md"`. Saved timestamps are the dates above at `12:00:00.000Z`.

Synthetic source URLs alternate between `https://www.instagram.com/reel/synthetic-sample-N/` and `https://www.facebook.com/posts/synthetic-sample-N/`. They preserve the normal source URL field and platform identity but are demonstration placeholders, never fetched or opened.

Each analysis contains the actual fields `title`, `synopsis`, `whyUseful`, `takeaways`, `topics`, `entities`, `recommendations`, `claimsNeedingVerification`, `evidence`, and `classification`. Classifications use the domains/subcategories in the table, null country/city, topics as `secondaryTopics`, and confidence `0.9`. Evidence uses `source: "transcript"`, null timestamp, and a synthetic supporting quote. No recipe/workout/travel-specific data types or output templates exist in this fixture.

The opened capture uses this exact substantive content:

- Synopsis: “Make room for a ten-minute creative practice, with a small prompt and materials ready to use.”
- Why useful: “Start small, remove setup friction, and keep a record of what you make.”
- Takeaways: “Choose a practice small enough for an ordinary day.”; “Keep your materials visible and ready.”; “Date each attempt so you can return to it.”
- Recommendation: “Pick one prompt and reserve ten minutes tomorrow.”
- Evidence claim: “Visible materials reduce setup friction.” Quote: “Put a notebook and pencil somewhere you will see them.”
- Transcript: “Put a notebook and pencil somewhere you will see them. Choose one tiny prompt. Set aside ten minutes to make something, then leave a dated note so you can return tomorrow.”

## Reproduction and verification

1. Run preflight. Use a temporary harness outside app source; import `testConfig`, `buildApp`, `JobStore`, `EventHub`, `AuthService`, and the installed Playwright Chromium library.
2. Create a fresh temporary root; set config app URL to `http://127.0.0.1:4186`; ensure the configured data directory exists. Create the synthetic member with an unusable password hash. Seed the schema and records above. Do not start the capture worker or configure a real provider.
3. Start `buildApp` only on loopback port 4186. Issue a disposable session in memory and attach it only to a new isolated Chromium context. Allow only the local origin. Abort any external browser request and any POST to `/api/v1/api-keys` as an extra guard.
4. Open `/` at 1440 × 900, DPR 1. Wait for `.inbox-tile` and `document.fonts.ready`; screenshot Inbox. Open the first tile, wait for `.drawer .takeaways`, expand Transcript, resize to 1440 × 1100, set the drawer scroll position to zero, and screenshot capture details.
5. Close the drawer. Click `.app-profile-settings`, choose the exact API keys button, wait for “Save reels from your iPhone,” and screenshot at 1440 × 1100. Never click Create Shortcut key, Create API key, Test connection, or the download links.
6. Close the browser and app, close SQLite, then delete only the temporary root and harness.

Observed on final capture run: **0 external request attempts, 0 API-key creation requests, 0 API-key rows, 0 browser page errors**. All three PNGs were visually inspected. No private content, credentials, local filesystem paths, real key values, or cookies appear in the assets. The visible loopback MCP URL is the disposable QA origin, not a private service. The visible public Shortcut hostname is the real product caveat already present in the unchanged application.

Disposable server, browser context, SQLite database, media/vault roots, and temporary harness were stopped/deleted. Parent landing server on port 41006 was untouched.

## Limits

- All capture text and analysis were manually authored synthetic seeds. Screenshots prove current rendering and navigation, not downloader, transcription, AI analysis, or export quality.
- Assets are intentionally empty; Inbox shows its real built-in platform fallback thumbnails. No real media or substitute photos were introduced.
- The capture screenshot shows the native drawer through Transcript; original-source link and further content remain below the visible viewport.
- No Shortcut download, import, key creation, iPhone sharing, connection test, external provider, or end-to-end capture was exercised. The initial UI correctly shows no key. The bundled v6 download targets `social-knowledge.stephenjoly.net`, as visible in the screenshot; it does not automatically target arbitrary self-hosted servers.
- This is screenshot evidence only. Full repository checks and integrated landing acceptance belong to the foreman.
