# Public landing and private app routes

Status: completed
Owner: Codex
Started: 2026-10-18

## Context

Stephen approved implementing the proposed URL structure: `/` is the public Unfold landing page, `/login` is sign-in, and `/app` is the private library. The runtime currently serves the dashboard at every browser URL; the landing exists only as a separate static bundle.

## Scope

Package the existing approved landing into the runtime, add explicit browser routes and session redirects, and preserve old invitation, tab, job and OAuth links. Reuse existing login/setup screens and session/API boundaries. Keep `APP_URL` as the origin. No installer, Shortcut, onboarding redesign, database changes, or deployment.

## Acceptance criteria

- `/` shows the landing regardless of session; sign-in/open-app access is available.
- Signed-out `/app` visits go to `/login` and return to the requested app location after login; signed-in `/login` goes to the app or valid OAuth continuation.
- Logout and expired sessions show `/login`; return destinations cannot leave the origin or enter arbitrary routes.
- Fresh-instance setup and invitation acceptance use the existing screens; old root fragment invitations still work without sending tokens to the server.
- Old root tab/job links and OAuth continuations remain usable; `/api`, `/oauth`, `/mcp`, health and roadmap contracts remain unchanged.
- Production build and Docker include public assets. Focused route/auth tests, real-browser smoke and `npm run check` pass.

## Approach

Keep the Vite app shell and API URLs stable; copy a namespaced landing bundle into `dist-ui`. Define browser routes in Fastify, share a small return-path validator with the browser, and update browser authentication navigation. Runtime-only landing integration handles session links and legacy fragments without changing the approved artwork or CSS.

## Progress

- [x] Routing shape approved by Stephen's implementation request.
- [x] Runtime packaging and explicit routes.
- [x] Browser auth navigation and link compatibility.
- [x] Tests and documentation; checkpoint prepared for the existing draft PR49.

## Verification

Focused Vitest HTTP and return-path tests; browser landing → login → app, logout, invitation and return-link checks against synthetic disposable data; full `npm run check`.

Results: `npm run check` passed all 32 test files / 187 tests, strict types, build, documentation and public-bundle parity. Existing Playwright onboarding and account-management suites passed all five tests (fresh administrator, invited member, provider setup/skip, password changes, suspension, invitation lifecycle and account isolation). A separate browser pass at 390px confirmed signed-in `/login` → `/app?tab=activity`, sign-in return to `/app?tab=settings`, logout → `/login`, and legacy `/#invite` → `/login` with fragment removed and no invitation token in request URLs. No browser page errors. The first smoke attempt used the wrong Activity heading; inspecting the actual Capture activity screen confirmed the redirect was already correct. No product fix was needed for that test-selector error.

`npm run smoke:live` passed against the managed Website preview, including landing/app assets and private route/API boundaries. Preview URL: http://website-preview--codex-consumer-landing-unfold--socia--19cf8255.localhost:6767/ . Its SQLite data is disposable and isolated; stopping the service removes it. The existing design-only preview is unchanged. Onboarding implementation, the queued Opus copy/mobile polish, physical iPhone and deployment remain outside this routing milestone.

## Review script

1. Open Website preview at `/`: approved Unfold landing, with Sign in beside the existing actions.
2. Choose Sign in: existing authentication at `/login`; a fresh disposable archive shows its existing first-administrator setup.
3. Visit `/app?tab=settings` signed out, then sign in: Settings opens under `/app`.
4. Return to `/`: the landing stays public and Sign in becomes Open app.
5. Log out from the app account menu: `/login` opens; `/app` requires sign-in again.

## Risks and recovery

Redirect loops, stale bookmarks and missing packaged assets are the main risks. Preserve API paths and fragment secrecy; test both session states and reject untrusted return destinations. Roll back the task commit through the existing release process if needed. No live deployment is performed.
