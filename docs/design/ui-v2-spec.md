# Dashboard UI v2 design contract

This document is the binding visual contract for the second-generation dashboard
redesign. The owner approved the fifteen screens in
[`docs/design/ui-v2/screens/`](ui-v2/screens/) and requires the implementation to
match them. Treat the screens as normative, not as inspiration.

## Sources of truth, in priority order

1. **Screen exports** — `docs/design/ui-v2/screens/NN-name.png`. What the owner approved.
2. **Pen sources** — `docs/design/ui-v2/pen-sources/*.js`. The scripts that produced the
   exports, carrying exact pixel sizes, spacing, and hex values. Prefer these over
   eyeballing a PNG whenever a number is in question.
3. **This document** — tokens, component contracts, and the data rules that override
   the drawings where the drawings show capabilities the product does not have.

When the drawing and real product behavior disagree, this document wins and the
deviation is recorded in [Approved deviations](#approved-deviations).

## Reading the pen sources

The scripts run inside the pen.dev `execute` sandbox. Helper functions live in
`prelude.js`, `sprelude.js`, and `mprelude.js`:

| Helper | Meaning |
| --- | --- |
| `Fr(parent, {...})` | frame; `layout` is `horizontal` by default, `padding` is `[all]`, `[vertical, horizontal]`, or `[top, right, bottom, left]` |
| `T(parent, text, {...})` | text node; `fontSize` in px, `fontWeight` as a string, `lineHeight` as a ratio |
| `I(parent, name, size, colour)` | Lucide icon at `size` px |
| `Btn`, `Select`, `Input`, `Toggle`, `Status`, `Chip`, `Kbd`, `IconBox`, `Avatar` | the shared primitives, defined once and reused by every screen |
| `SB(screen, mode, active)` | the sidebar; `mode` is `"app"` or `"settings"` |
| `width: "fill_container"` | fill the parent's main axis, equivalent to `flex: 1` |

`x`/`y` are ignored inside a laid-out frame, so they carry no meaning except on
absolutely positioned nodes such as dialogs and scrims.

## Design tokens

Define these once in `web/design-tokens.css` as custom properties on `:root` and
consume them everywhere. No component may hard-code a hex value that belongs to a
token.

### Colour

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#18181b` | primary text, active nav label |
| `--ink-soft` | `#3f3f46` | body copy in notes and answers |
| `--muted` | `#71717a` | secondary text, inactive nav label icons |
| `--muted-strong` | `#52525b` | control labels, inactive nav labels |
| `--placeholder` | `#a1a1aa` | placeholders, section kickers, metadata |
| `--faint` | `#d4d4d8` | disabled icons, chevrons, inert tracker steps |
| `--canvas` | `#fafafa` | page background |
| `--surface` | `#ffffff` | cards, sidebar, inputs |
| `--subtle` | `#f4f4f5` | active nav row, chips, command field |
| `--border` | `#e4e4e7` | card and control borders |
| `--hairline` | `#f0f0f1` | dividers between rows inside a card |
| `--accent` | `#26322b` | primary buttons, brand mark, send button |
| `--accent-hover` | `#18231d` | primary button hover |
| `--green` | `#3f7a55` | live state, progress fill, success dot, focus ring |
| `--green-ink` | `#2f5d40` | text on green tint |
| `--green-tint` | `#e8f0ea` | success pill, citation chip, icon box |
| `--avatar` | `#3f6b52` | default avatar fill |
| `--process-bg` | `#f6f8f6` | sidebar processing card |
| `--process-border` | `#e1e8e3` | sidebar processing card border |
| `--process-track` | `#dfe6e1` | progress track |
| `--amber` | `#d9a441` | warning dot |
| `--amber-icon` | `#b7791f` | warning icon |
| `--amber-ink` | `#8a5a12` | warning pill text |
| `--amber-tint` | `#fbf1df` | warning pill background |
| `--amber-row` | `#fffcf6` | warning row background |
| `--amber-panel` | `#fffbf3` | warning card background |
| `--amber-border` | `#f1e2c4` | warning card border |
| `--danger` | `#9f3f34` | destructive button text |
| `--danger-border` | `#efd3cf` | destructive button border |

Category accents used by Knowledge base cards and note rails are data-driven, not
tokens; see `m4_kb.js` and `m6_note.js` for the exact pairs.

### Type

Inter, already self-hosted in `web/fonts/`. Sizes below are the design's px values;
express them through the existing rem scale in `web/typography.css` where one
already matches, and extend that file rather than inventing a parallel scale.

| Role | Size / weight / tracking |
| --- | --- |
| Page title | 28px / 700 / `-0.8px` — Inbox uses 30px |
| Settings page title | 26px / 700 / `-0.7px` |
| Note title | 27px / 700 / `-0.8px`, line-height 1.2 |
| Section heading | 15px / 600 / `-0.2px` |
| Card heading | 14px / 600 |
| Page kicker | 10.5px / 700 / `+1.4px`, uppercase, `--placeholder` |
| Sidebar group label | 10.5px / 700 / `+1px`, uppercase, `--placeholder` |
| Rail label | 11px / 700 / `+0.8px`, uppercase, `--placeholder` |
| Nav item | 13.5px / 600 active, 500 inactive |
| Row title | 13.5px / 600 |
| Body / answer copy | 14px, line-height 1.55–1.6, `--ink-soft` |
| Page description | 14px, line-height 1.45, `--muted` |
| Row help | 12.5px, line-height 1.4, `--muted` |
| Control label | 13px / 500 |
| Metadata | 12px, `--muted` |
| Caption | 11.5px, `--muted` |
| Keycap | 10.5px / 500 |
| Monospace | logs and the MCP URL only |

### Shape and depth

Radii: 4px keycaps, 5–6px small badges and thumbnails, 7px rows, buttons, selects,
and inputs, 8px icon boxes and the brand mark, 10px cards, 12px chat bubbles and
composer, 14px dialogs and the sign-in card, 999px pills, toggles, and avatars.

Shadows are rare and soft. Primary button `0 1px 2px #18231d33`, floating card
`0 8px 24px #18181b0d`, dialog `0 24px 60px #18181b40`, toggle knob
`0 1px 2px #0000002e`. Nothing else casts a shadow.

## Shared primitives

Build these once under `web/components/ui/` and use them on every screen. The pen
definitions in `sprelude.js` and `mprelude.js` are the reference implementations.

- **Button** — height 32, padding `0 12`, gap 6, radius 7, label 13px/500, icon 14px.
  Variants: `default` (white, `--border`, `--ink-soft`), `primary` (`--accent`, white),
  `danger` (white, `--danger-border`, `--danger`), `ghost` (no fill or border).
- **Select** — height 32, radius 7, white, `--border`, padding `0 10`, gap 8, 13px label,
  trailing `chevrons-up-down` 13px in `--faint`.
- **Input** — height 32 (40 on the sign-in card), radius 7, white, `--border`, 13px text,
  optional 14px leading icon in `--placeholder`. Disabled inputs use `--canvas` and a
  `lock` icon. Focus uses a 1.5px `--green` border.
- **Toggle** — 36×20, radius 999, padding 2, 16px knob, on `--green`, off `--faint`.
- **Status pill** — padding `3 9`, gap 6, radius 999, 6px dot, 12px/500 label.
  `ok` uses `--green-tint`/`--green`/`--green-ink`; `off` uses `--subtle`/`--placeholder`/`--muted-strong`;
  `warn` uses `--amber-tint`/`--amber`/`--amber-ink`.
- **Chip** — padding `4 10`, radius 999, `--subtle`, 12px/500 `--muted-strong`. A selected
  filter chip inverts to `--ink` with white text.
- **Keycap** — padding `2 6`, radius 4, `--subtle`, 1px `--border`, 10.5px/500 `--muted`.
- **IconBox** — square, radius 8, icon at half the box size. 34px default, 28–30px compact,
  44px for page and topic headers.
- **Avatar** — circle filled with the account colour, white initial at 40% of the diameter, weight 700.
- **Card** — radius 10, white, 1px `--border`, `overflow: hidden`.
- **Card row** — padding `14 18`, gap 14, 1px `--hairline` bottom divider except on the last row.

## Shell

`SB()` in `sprelude.js` is normative for both sidebar modes. Width 264, white,
1px `--border` on the right, padding `16 12`, gap 16.

**App mode** — brand row (22px mark, `social knowledge` at 14px/700/`-0.4px`, 30px
`+` capture button in `--accent`), the ⌘K command field, then two groups:
`LIBRARY` holding Inbox, Activity, and Knowledge base, and `ASSISTANT` holding Ask.
Nav rows are 34px tall with a 17px icon, a 10px gap, radius 7, and `--subtle` when
active. Activity carries a 7px `--green` live dot when work is in flight. Each row
shows its keycap hint on the right.

**Settings mode** — a `Back to archive` row, a `Settings` title at 18px/700/`-0.5px`,
then `ACCOUNT` (My account), `WORKSPACE` (AI & models, Connections, API keys,
Data & export), and `ADMINISTRATION` (People & access, admins only). Connections
shows a 7px `--amber` dot when any social session needs attention.

**Both modes** end with the processing card and the account row. The processing card
only renders while work is in flight: radius 10, `--process-bg`, 1px `--process-border`,
padding 12, a spinning `loader-circle`, `Processing N posts` at 12.5px/600, a `View`
link to Activity, a 4px progress track, and the current stage caption. The account row
is a 28px avatar, the display name at 13px/600, and a 28px gear that opens Settings.
Settings is reachable from exactly one place in the UI.

## Screens

| # | Screen | Export | Pen source | Primary code today |
| --- | --- | --- | --- | --- |
| 01 | Sign in | `01-sign-in.png` | `m0_signin.js` | `Auth`, `RegistrationForm` |
| 02 | Inbox | `02-inbox.png` | `m1_inbox.js` | `App` inbox branch, `CaptureCard`, `CaptureTableRow` |
| 03 | Capture dialog | `03-capture.png` | `m2_capture.js` | `App` capture branch |
| 04 | Activity | `04-activity.png` | `m3_activity.js` | `App` activity branch |
| 05 | Knowledge base | `05-knowledge-base.png` | `m4_kb.js` | `Library` |
| 06 | Knowledge topic | `06-knowledge-topic.png` | `m5_topic.js` | `Library` node view |
| 07 | Capture note | `07-capture-note.png` | `m6_note.js` | `Detail` |
| 08 | Ask | `08-ask.png` | `m7_ask.js` | `AskAI` empty state |
| 09 | Ask answer | `09-ask-answer.png` | `m8_answer.js` | `AskAI` conversation |
| 10 | Settings · My account | `10-settings-my-account.png` | `d_s_acct.js` | `AccountSettings` |
| 11 | Settings · AI & models | `11-settings-ai-models.png` | `d_s_ai.js` | `Settings` ai topic |
| 12 | Settings · Connections | `12-settings-connections.png` | `d_s_conn.js` | `Settings` connections topic |
| 13 | Settings · API keys | `13-settings-api-keys.png` | `d_s_api.js` | `Settings` api topic |
| 14 | Settings · Data & export | `14-settings-data-export.png` | `d_s_data.js` | `Settings` data topic |
| 15 | Settings · People & access | `15-settings-people-access.png` | `d_s_people.js` | `AccountSettings` admin |

App pages use a `40px 56px` content pad. Settings pages use `44px 72px` with a 780px
measure. The capture note uses `28px 48px` with a 270px details rail.

## Data rules

The drawings contain sample content. Ship real account data and never fabricate a
control that has no backing.

- Counts, titles, creators, platforms, timestamps, topics, and categories come from the
  existing endpoints. No placeholder numbers survive into the implementation.
- Activity's four tiles map to `ActivityCounts`: `active`, `queued`, `failed`, `savedToday`.
- The sidebar processing card derives from the same counts plus the in-flight job's stage.
- Knowledge base insight lists come from capture `analysis.takeaways`; topic and category
  counts come from the library tree.
- The capture note rail reads `analysis.classification`, `topics`, `entities`,
  `sourceLanguage`/`translationLanguage`, and `claimsNeedingVerification`.
- Connections reads `/api/v1/platform-connections` and `/api/v1/oauth/connections`,
  which also supplies `mcpUrl`. Revoke uses `DELETE /api/v1/oauth/connections/:clientId`.
- Data & export reads `/api/v1/preferences` and `/api/v1/library-exports`.
- Empty, loading, error, and retry states must exist for every list, built from the same
  tokens. The drawings only show the populated state.

## Approved deviations

These are the only places the implementation may differ from the exports.

1. **Monospace face.** The drawings render logs and the MCP URL in JetBrains Mono. Ship the
   system monospace stack instead; adding a font file is not justified.
2. **No account deletion.** Screen 10 shows a danger zone. There is no deletion endpoint, so
   drop that section rather than ship a dead button. Keep today's "Your archive" card in its
   place, restyled to v2 — it is a working route into Data & export and removing it would be a
   regression.
3. **No source-language toggle.** Screen 14 shows `Detect source language`. Preferences only
   persist `defaultLanguage` and `translateForeign`; ship those two rows only.
4. **Recommendation markers are decorative.** Screen 07 draws checkboxes beside
   recommendations. Nothing persists a checked state, so render the marker as a decorative
   square that is `aria-hidden`, never an interactive checkbox.
5. **Sample copy is illustrative.** Lisbon, deadlift, and miso salmon content exists only to
   show density. Never hard-code it outside tests and fixtures.

Anything else that cannot be built as drawn is a blocker to raise, not a judgement call.

## Interaction requirements

- The ⌘K command field opens a palette listing capture, ask, and the five destinations,
  filtered as you type. It navigates; it does not query the server.
- The keycap hints must work: `g i`, `g a`, `g k`, `g q` navigate, `⌘K` opens the palette.
  Never draw a hint for a shortcut that is not wired up.
- Capture opens as a dialog over the current page with focus trapped, `Escape` to close, and
  focus returned to the trigger.
- Every control needs an accessible name, visible focus, and keyboard operation. Async work
  announces through a live region. Respect `prefers-reduced-motion` for the spinner and
  progress animation.
- Layout must hold at 1440px, 1280px, 1024px, and 390px with no horizontal overflow. The
  sidebar collapses to the existing mobile pattern below the tablet breakpoint; the
  processing card moves into the mobile menu rather than disappearing.

## Verification

```bash
source ~/.cache/sk-browser/env.sh     # Chromium's system libraries live outside the repo
npx tsx scripts/ui-screens.ts         # captures all fifteen screens to artifacts/ui-screens/
npx tsx scripts/ui-compare.ts         # writes side-by-side + difference sheets to artifacts/ui-compare/
```

`ui-screens.ts` boots a disposable server over the synthetic archive in `scripts/ui-fixture.ts`
and captures at 1280×880 with a 2× device pixel ratio, which is exactly the resolution of the
exports in `docs/design/ui-v2/screens/`. `ui-compare.ts` puts the export and the capture side by
side and blends them: in the difference strip, anything that is not black has drifted.

A screen is complete when its structure, spacing, type, colour, and states match the export, its
journey still works, and `npm run check` passes.
