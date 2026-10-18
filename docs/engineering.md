# Engineering

## Supported toolchain

- Node.js 22+
- npm using the committed lockfile
- TypeScript with strict checking
- Vitest for unit and integration tests
- Playwright for deployed browser acceptance
- Docker for the production runtime

## Local feedback loop

```bash
npm ci
npm run check
```

`npm run check` validates documentation structure, TypeScript, the production build, and the test suite. During focused work, run the narrowest relevant test first, then the complete check before completion.

Changes to browser journeys should also be exercised against a disposable running instance with `npm run test:e2e`. Deployment-sensitive changes require the smoke and acceptance process documented in the README and `docs/deployment-model.md`.

## Testing expectations

- Put behavioral tests in `test/` near the relevant boundary.
- Test success, authorization/ownership failure, invalid external input, and recoverable failure where applicable.
- Use temporary directories and databases. Never use a developer's real archive or production credentials.
- Mock network/model/subprocess boundaries for deterministic tests; reserve real integrations for explicit smoke or staging acceptance.
- A bug fix should include a regression test that fails for the original behavior when practical.

## Change discipline

- Prefer small, reviewable changes with explicit acceptance criteria.
- Preserve backward compatibility for persisted data and public API contracts unless the plan explicitly calls for a migration.
- Keep generated artifacts and dependency caches out of commits, except the intentionally versioned token-free Shortcut distribution templates under `shortcuts/`. These include reviewable sources, signed downloads, hashes, and explicit native validation status. Never commit personalized credential-bearing copies.
- Record durable architectural decisions in the relevant source-of-truth document or the execution plan's decision log.
- Record known, concrete deferred work in `docs/tech-debt.md`, with evidence and an exit condition.

## Dashboard typography

`web/typography.css` loads the self-hosted Inter face and retains the legacy
rem-based scale for secondary surfaces. The v2 type roles in
`web/design-tokens.css` follow the approved design contract: 28px page titles
(30px in Inbox), 26px settings titles, 14px body copy, and compact metadata and
controls. Preserve the specified hierarchy and verify mobile reflow when changing
these roles. Processing logs use the system monospace stack.

## Dashboard UI v2 tokens and primitives

`web/design-tokens.css` declares the colour, type, radius, and shadow tokens
from [`docs/design/ui-v2-spec.md`](design/ui-v2-spec.md). The shared primitives
live in `web/components/ui/` and are exported from `primitives.ts`; their styles
in `primitives.css` import the tokens and use the `ui-` class prefix. The v2
button is `ActionButton` with `ui-btn` classes. `web/settings-ui.tsx` provides the
shared settings rows, panels, and controls used by account and workspace pages.

Component tests are `test/**/*.test.tsx`. They are type-checked by
`tsconfig.web.json`, not the server config, and render with `react-dom/server`
rather than a DOM testing library.

## Documentation discipline

Documentation describes current truth unless clearly labeled as a proposal or historical completed plan. Code, tests, and docs should change together. When they disagree, verify runtime behavior and repair the stale artifact in the same change.
