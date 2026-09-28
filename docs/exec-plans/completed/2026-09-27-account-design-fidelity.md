# Match account settings to pen.dev

Status: completed
Owner: Codex orchestrator and GPT-5.6-Sol worker

## Context and scope
Owner compared the deployed account UI with pen.dev and found it visibly heavier and more cramped. Preserve account behavior while correcting pages 37–41 to the source typography, full desktop gutters, flat table rows, pale avatars, controls, and action menus. Keep mobile usability and keyboard access.

## Acceptance
- Compare source and rendered pages at matching viewport widths.
- Preserve local account/invitation acceptance and run `npm run check`.
- Update and verify the existing PR #31 preview. Owner has accepted its shared staging demo storage; no infrastructure changes or staging merge.

## Ownership
Worker owns account-settings.tsx and settings.css. Parent owns main.tsx, styles.css, documentation, integration, verification and deployment.

## Source evidence
Frame 40 is 1440px wide: main sidebar 226px, content heading x258, settings navigation 174px, cards x456 and width952. Source uses Inter and light horizontal table separators. Current shell's 1216px cap adds unintended wide-screen gutters.

## Progress
- [x] Inspect screenshots and source geometry.
- [x] Implement visual corrections.
- [x] Verify desktop/mobile and browser behavior.
- [x] Deploy and verify preview.

Implementation: Settings uses the same self-hosted Inter font and full desktop gutters throughout its topics. Account tables use light separators, source-sized controls, pale default avatars, muted metadata, aligned invitation columns, and compact keyboard-accessible overflow menus. Tables stack below 1320px to preserve usability with the desktop sidebar. Invitation copying retains a selectable fallback when clipboard access fails.

Local verification: Node 22 `npm run check` passed 139 tests; focused E2E 6/6 and full E2E 10 passed with 4 credential-gated skips. Screenshots reviewed at 1440/1800 desktop and 390 mobile; acceptance also checks 1024/1280 responsiveness, control heights, account-link bounds, keyboard focus, and clipboard fallback.

Live verification: Dokploy deployed `1077a5f76cd4a590aca8577354d87cacc5c5f17d` successfully to the existing PR #31 URL. Browser inspection confirmed source-aligned card x=456 / width=952 at a 1440px viewport, 32px account role controls, Inter sidebar typography, and healthy HTTP 200. The served JavaScript and CSS SHA-256 values matched the final locally checked build. Preview: https://preview-social-knowledge-staging-y3qjds-oztnme.staging.stephenjoly.net/?tab=settings.
