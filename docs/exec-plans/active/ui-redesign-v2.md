# Rebuild the dashboard UI to the approved v2 design

Status: active
Owner: Stephen Joly / orchestrating agent
Started: 2026-10-18

## Context

The first redesign ([`pen-dev-ui-refresh`](pen-dev-ui-refresh.md)) replaced the dark shell
with the current light UI. The owner reviewed the result and rejected it: the settings area
carries a second sidebar, navigation is an undifferentiated flat list, Settings appears
twice, there is no primary capture action, in-flight work is invisible, and the pages do not
read as one considered product.

A new design was produced in pen.dev and approved screen by screen. Fifteen desktop screens
cover every destination, exported to [`docs/design/ui-v2/screens/`](../../design/ui-v2/screens/)
with their generating scripts in [`pen-sources/`](../../design/ui-v2/pen-sources/). The owner's
instruction is that the shipped UI match those screens, and that the work be delegated to
parallel workers under an orchestrator with an independent reviewer.

## Scope

Included: every authenticated destination and the auth surfaces — sign in, Inbox, the capture
dialog, Activity, Knowledge base home and topic pages, the capture note, Ask and its answer
view, and the six settings pages. Design tokens, shared primitives, the two sidebar modes,
the ⌘K palette, keyboard navigation, and the empty, loading, error, and retry states that the
drawings do not show. Mobile layouts for every redesigned surface.

Excluded: capture processing, provider behavior, schema changes, and new product capability.
The only new client behavior is the command palette and the keyboard shortcuts, both of which
navigate and never query the server. Deployment is out of scope; the feature PR targets
`staging`.

## Acceptance criteria

- Each of the fifteen screens matches its export in structure, spacing, type, colour, and
  state, verified by capturing `scripts/ui-screens.ts` output next to the export.
- Tokens live in one file; no component hard-codes a colour that a token covers.
- Settings is reachable from exactly one control. The settings area has no second sidebar.
- The sidebar processing card reflects real in-flight work and disappears when idle.
- Every drawn affordance is wired to real data or removed per the spec's approved deviations.
  No control is shipped that cannot act.
- The ⌘K palette and `g i`, `g a`, `g k`, `g q` shortcuts work, with focus management.
- Every list has an empty, loading, and error state built from the same tokens.
- Keyboard operation, accessible names, visible focus, live-region announcements, and
  `prefers-reduced-motion` hold across the redesigned surfaces.
- No horizontal overflow at 1440px, 1280px, 1024px, or 390px.
- `npm run check` and the Playwright suite pass; existing journeys and ownership boundaries
  are unchanged.

## Approach

Work happens on `codex/ui-redesign-v2`, branched from `origin/staging` at `9ad0e74`. Each
stream runs in its own worktree on its own branch, is reviewed, and is merged into the
integration branch by the orchestrator. Streams own disjoint files so they never edit the
same region concurrently.

1. **Foundation (orchestrator).** Design contract, committed design references, the fixture
   and screenshot harness, this plan.
2. **Extraction.** Split `web/main.tsx` into page and shared modules with no behavior change,
   so later streams own separate files. Runs alongside the tokens stream, which only adds files.
3. **Tokens and primitives.** `web/design-tokens.css` plus the shared Button, Input, Select,
   Toggle, Chip, Status pill, Keycap, IconBox, Avatar, Card, and Row primitives.
4. **Shell.** Both sidebar modes, the processing card, the account row, the command palette,
   the keyboard shortcuts, and the mobile navigation.
5. **Pages, in parallel.** Inbox and capture; Activity; Knowledge base and the note; Ask;
   Settings; auth.
6. **Review.** An independent reviewer compares every captured screen against its export and
   audits data honesty, accessibility, and responsive behavior. Findings return to the owning
   stream until the screen matches.
7. **Integration.** Full check, Playwright, documentation, draft PR to `staging`.

## Progress

- [x] Design contract, references, and deviations recorded in `docs/design/ui-v2-spec.md`.
- [x] Synthetic fixture and screenshot harness capture all fifteen screens.
- [ ] Extraction merged with tests green.
- [ ] Tokens and primitives merged.
- [ ] Shell merged.
- [ ] Inbox and capture merged.
- [ ] Activity merged.
- [ ] Knowledge base and note merged.
- [ ] Ask merged.
- [ ] Settings merged.
- [ ] Auth merged.
- [ ] Review passes on all fifteen screens.
- [ ] Integrated check, Playwright, and draft PR.

## Decisions

- 2026-10-18: The pen sources are committed alongside the exports. They carry exact sizes and
  hex values, so a worker never has to estimate a number from a picture.
- 2026-10-18: Extraction precedes the page streams. The UI is one 5,858-line file; parallel
  redesign without a split would serialise on merge conflicts.
- 2026-10-18: Capabilities drawn but not backed by an endpoint are dropped, not faked. The
  removals are account deletion, the source-language toggle, and interactive recommendation
  checkboxes, each recorded in the spec.
- 2026-10-18: The command palette is client-side navigation only. It is the one new behavior
  the design requires, and it needs no server work.

## Verification

- `npx tsx scripts/ui-screens.ts` writes all fifteen screens to `artifacts/ui-screens/`;
  compare each against `docs/design/ui-v2/screens/`.
- `npm run check` for documentation, types, build, and tests.
- `npm run test:e2e` for browser journeys.
- Manual keyboard and reduced-motion passes on the shell, the palette, and the capture dialog.

Chromium needs system libraries that are absent from the default container. They are staged
outside the repository and sourced before any browser run; the harness itself needs no change.

## Risks and recovery

- **Drift from the design.** Mitigated by committed exports, exact pen sources, a screenshot
  harness, and a reviewer whose only job is comparison.
- **Merge pressure on shared files.** Mitigated by extraction first and disjoint file ownership,
  with the orchestrator merging one stream at a time and rebasing the rest.
- **Regression in working journeys.** The existing Vitest and Playwright suites run on every
  stream; a stream is not merged with a failing check.
- **Scope creep into backend work.** The spec lists what is backed by an endpoint. Anything else
  is a blocker to raise, not a feature to invent.
- Rollback is per stream: each is an isolated branch, and the integration branch can drop a
  merge without disturbing the others.
