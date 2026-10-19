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

On 2026-10-19 Stephen approved all 28 recommendations from the UX review, with
paired QA and final independent CX review. The [approved addendum](../../design/ui-v2-ux-addendum.md)
defines these changes; the [shared brief](ui-v2-ux-brief.md) defines ownership and checks.
This adds reversible unsupported-bookmark archiving (including an additive migration),
Inbox tiles, and recovery, evidence, and settings refinements to the original scope.
Excluded: capture processing changes and provider behavior. The palette and keyboard
shortcuts navigate and never query the server. The feature PR targets `staging`; the owner's
integration handoff adds disposable PR-preview verification to acceptance.
Production deployment remains out of scope.

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
- [x] Extraction merged.
- [x] Tokens and primitives merged.
- [x] Shell merged.
- [x] Inbox and capture merged.
- [x] Activity merged.
- [x] Knowledge base and note merged.
- [x] Ask merged.
- [x] Settings merged.
- [x] Auth merged.
- [ ] Review passes on all fifteen screens.
- [x] Draft PR #50 targets staging; all five page branches merged locally.
- [x] Integrated check and Playwright (six documented local Python-dependent unit failures).
- [ ] Verified live preview and matching screenshots; PR ready for review.

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

## Integration handoff progress (2026-10-18)

- Resumed the existing worktree and PR #50; fetched origin, with staging unchanged.
- Integrated shell `91e7db1`, Activity `11c256a`, Settings `9ee9a73`, Knowledge
  `c9b986c`, and Ask/auth `36600a7`. Preserved the shell, extracted Activity,
  sidebar-owned Settings state, full-page notes, and the union of fixtures/tests.
- Each integration passed typecheck and build. Latest unit run: 201 passed,
  3 skipped, 6 failures limited to shortcut-generator requiring absent python3.
- Visual worker is visible in the same Paseo workspace. Its Claude provider
  session limit resets at 22:30 UTC; no visual acceptance claim has been made.
- Integrated captures render all fifteen screens at 1440, 1024, and 390px without
  document-level horizontal overflow or browser exceptions. These are rendering
  checks, not visual-fidelity acceptance.
- Added `scripts/ui-e2e.ts` to run the four otherwise-skipped authenticated
  journeys on the disposable fixture with a deterministic, persisted Ask answer.
  All sixteen Playwright tests pass with no skips, including streaming/cancel/retry,
  G shortcuts, the command palette, and all member-visible mobile settings routes.
- `npm run check` passes documentation, types, and build; unit results remain
  201 passed / 3 skipped / the six known missing-python3 failures.
- Removed the already-merged extraction and token worktrees/branches after
  checking ancestry and removing only their dependency symlinks. The five page
  worktrees remain until final acceptance.
- The owner requested a ChatGPT-backed replacement worker. Cancelled the
  scheduled Claude retry and launched visible Codex GPT-6.1-Sol worker
  `01e97b98-0835-4c33-808a-0a1a9e03e679` in the existing workspace for live build
  identity and functional verification. Host delegation policy still reserves
  visual/layout work for Claude, so exact-fidelity acceptance remains pending.
  PR #50 stays draft until all acceptance criteria are met.

## UX follow-through (2026-10-19)

- [x] Recorded the owner's approval of all 28 improvements in the design addendum.
- [x] Created visible implementation and independent QA workers in the existing
  workspace with disjoint file ownership.
- [x] Implemented additive, owner-scoped unsupported-bookmark archive/restore;
  independent QA passed 21 new contract tests and 41 combined archive/Activity/database
  tests. Typechecks passed; committed checkpoint `5d9d184`.
- [x] Capture, Activity, Inbox, palette, and setup entry points implemented and
  independently exercised.
- [x] Ask evidence/reading continuity and Settings clarity implemented and
  independently exercised.
- [ ] Final CX review confirms every addendum item with evidence; resolve findings.
- [ ] Full checks, changed-screen comparison, live build identity and journeys,
  documentation completion, PR #50 ready.

Focused independent browser acceptance passed 13/13 for A and 13/13 for B.
A tested the initial stable build; B tested the final rebuilt Ask failure-copy
and citation-return fixes. The final combined check passed docs, types, and build:
249 unit tests passed, 3 skipped, and six failed solely because python3 is absent.
The complete seeded browser suite passed 33/33 on the final build, including both
QA streams and existing journeys. All 60 responsive captures (15 each at 1280,
1440, 1024, and 390px) have no document overflow or browser exceptions; comparison
sheets are generated. A fresh visible GPT-6.1-Sol high worker owns the independent
functional CX review. Runtime checkpoint `2f2e16a` is pushed to PR #50.
Exact visual acceptance and final live-preview verification remain open.

Independent final CX review checked every addendum ID against implementation and
QA assertions. It found one additional keyboard-continuity issue: Capture lost
focus while switching between its form and receipt. The correction focuses the
new state's primary control while preserving the opener; modal Tab handling also
recovers outside focus. Independent queued/retained-setup keyboard regressions
passed, and the complete browser suite passed 35/35 in 46.9 seconds. This includes
receipt primary focus, Tab containment/recovery, Capture another, and Escape
returning to the opener, plus all 33 existing journeys.
GitHub CI passed the preceding runtime checkpoint, including all Python-dependent
Shortcut tests. The local focus-fix check has the same six environment-only failures.

The five obsolete page worktrees and local branches were removed after confirming
their heads are ancestors of the integrated branch and their only untracked entry
was a dependency symlink. No force removal was used; unrelated worktrees remain.

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
  is a blocker to raise, not a feature to invent. The approved UX addendum explicitly
  authorizes reversible unsupported-bookmark archiving; it does not authorize deletion.
- Rollback is per stream: each is an isolated branch, and the integration branch can drop a
  merge without disturbing the others.
- The UX follow-through uses the owner's single worktree with disjoint file ownership
  and task-scoped checkpoints. Reverting its archive code leaves the additive nullable
  column intact. An older binary can show archived bookmarks again but still cannot
  queue unsupported links. No destructive migration or data cleanup is required.
