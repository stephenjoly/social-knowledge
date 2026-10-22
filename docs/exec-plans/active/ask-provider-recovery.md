# Restore real provider use in the Ask preview

Status: active
Owner: Codex delivery lead
Started: 2026-10-22
Branch: codex/ask-ai-ui-mockup; draft PR #64 targets staging

## Context
Stephen reports GPT-5 Analysis diagnostics and new chats fail on the first demo account, demo-member, despite a green connected OpenAI state. Reproduced on the live PR64 preview: diagnostics return provider_error in 0ms; the existing provider client throws ai_credentials_unreadable before an outbound request. Shared synthetic staging storage may hold a credential encrypted by a different runtime key.

## Scope and acceptance
- Restore real GPT-5 diagnostics and chat behavior on the reported preview account.
- Correct misleading runtime-local connection/readiness and diagnostic errors without changing the shared saved credential status or encrypted payload.
- Preserve owner isolation and secret handling; no credential/key changes without Stephen approval, no production action.
- Regression tests reproduce unavailable encryption key and restoration via the existing previous-key ring; full check and deployed smoke pass.

## Progress
- [x] Reproduced the exact account/model failure and confirmed local decryption error.
- [x] Compare staging/preview encryption compatibility without exposing secrets. The stored v1 key identifier matches permanent staging; it does not match PR64 or its previous-key ring. A real GPT-5 Analysis diagnostic passes on staging in 7.264s using the existing saved provider key.
- [x] Provider fix and focused regressions: 36/36 pass plus typecheck. Unknown v1 encryption-key IDs project needs_attention/connected false and readiness false only in the affected runtime; diagnostics return credential_error. No persisted status, selection, encrypted payload, or cross-owner changes. Previous-key restoration, real SDK GPT-5 request shape, and a normal non-simulated new-chat transport are covered.
- [x] Stephen approved the preview encryption repair. Dokploy preview environment updated with staging’s current effective encryption secret and PR64’s previous secret retained. Protected rollback backup created; staging environment and saved provider credentials unchanged. PR64 needs its next deployment to load the settings.
- [ ] Verify real Analysis and Ask, CI, and deployed preview.

## Decisions
- Prepared and dry-ran a Dokploy API update that changes only preview AI_CREDENTIALS_KEY and AI_CREDENTIALS_PREVIOUS_KEYS: use staging’s effective current encryption secret and preserve PR64’s old effective secret. Staging environment, saved provider credentials, and production remain unchanged. Stephen explicitly approved this repair; apply through Dokploy with a protected rollback backup. Current/future staging previews inherit the corrected configuration; redeploy only PR64 for this task.
- Persisted needs_attention would affect other previews sharing SQLite, even when those runtimes can decrypt. Project unavailable credentials locally; preserve shared status and secrets.

## Verification
- Full npm run check passes: documentation/site parity, strict typechecks, production build, and 325/325 tests. Backend checkpoint d55cc4c.
- Before repair: real GPT-5 Analysis passes on staging (7.264s), real GPT-5 streaming Ask diagnostic passes on staging (3.770s). Exact PR64 account diagnostic fails locally in 0ms with ai_credentials_unreadable.
Focused provider tests, npm run check, live Analysis/Ask diagnostics and a synthetic new chat using the connected provider. Output only controlled codes/statuses; never log provider credentials or raw external errors.

## Risks and recovery
Do not overwrite or rotate existing provider credentials. If the matching key is unavailable, require user reconnection through Settings rather than inventing data or reporting simulated responses as a successful provider test.
