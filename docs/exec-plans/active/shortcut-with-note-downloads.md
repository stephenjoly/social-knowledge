# Download and connect a With note shortcut

Status: install-and-connect accepted; native feasibility milestone active.
Owner: foreman. Started: 2026-10-19.
Research baseline: freshly fetched `origin/staging` at `d3e1a2a1544c258a38d017672a40fab6f70a17d1`.

## One-page product spec

**Outcome.** From authenticated Settings → API keys, users can download the existing **Without note** shortcut or a separately named **With note** shortcut. Keep the existing v6 artifact and installed copies working. The new variant requires no API-key copying or typing and captures why an item matters, for example “Gift idea for Dad — he would enjoy this.”

**Install and connect.** Stephen accepted a token-free, signed download followed by a one-time **Connect to my account** action on 2026-10-19. Native verification remains required. Browser authentication authorizes a new capture-only credential for this installation; old API keys cannot be recovered from their hashes. Show connection success only after native credential persistence and a real connection check. Interrupted setup is retryable, and each installed connection is identifiable and revocable. Existing installations are never implicitly revoked.

**Capture.** With note asks **Add note / Skip** before submitting. Add note opens text entry; Skip submits immediately without a note. Validate the existing 2,000-character limit without silently truncating. Preserve exact user wording, display it with the capture, and make “Dad” discoverable without relying on the generated summary. Confirm receipt only after server acceptance, then retain current completion/failure feedback. New variant includes a persistent receipt-sound setting, initially off; visible receipt stays on. Without note retains its current behavior.

**Short status copy.** Stephen requested emoji-led, much shorter messages: `⏳ Processing` after server acceptance, `✅ Saved` only after completed archival, `⚠️ Capture failed` for retained jobs that fail, and `❌ Couldn’t reach server` when no receipt can be confirmed. Polling timeout says `⏳ Still processing`; authentication failure says `🔑 Reconnect shortcut`; invalid/empty input says `⚠️ No link found`. Do not dump raw JSON or server responses into native notifications. Detailed retained-job failures belong in Activity. Verify native transport error handling before promising custom offline text.

**Cancellation and duplicates.** Explicit Skip must save without a note. Native dismissal behavior needs testing; do not promise dismiss-to-save if iOS cancels execution. Recommend appending a new note to an existing capture, preserving previous notes; replaying the same submission must not append twice. Cover both identical URLs and different URLs resolving to the same media. Skip never erases a note. Return an explicit note outcome; note-only updates need no media recapture or AI reanalysis.

**Acceptance.** Install both variants side by side from iPhone Safari; connect the new one without typing secrets; relaunch and save with “Gift idea for Dad”; find and read that exact note; save via Skip; verify sound off/on; test repeat submissions and interruption; revoke only the new connection and verify old v6 still works. Expired/replayed setup, cross-account access, failed connection and offline capture produce truthful outcomes. No credentials appear in public artifacts, URLs, logs, screenshots, or shared caches.

**Out of scope.** Replacing existing installations, broad Settings redesign, a native iOS app, public credential-bearing downloads, upgrading every legacy download to auto-connect, and production deployment during planning. A signing service is not approved by this proposal.

## Approach

1. **Native feasibility milestone:** using only synthetic credentials, prove signed import, browser-to-Shortcuts handoff, durable credential storage and Share Sheet execution. Record OS versions and actual prompts, including permissions, rename collisions and cancellation. Reject the design if it requires recurring setup or silently syncs secrets contrary to the documented storage decision. Test receipt sound explicitly. No claim that Apple URL input support proves durable provisioning.
2. **Connection backend:** after the spike establishes a viable flow, define the installation state machine and transport contracts. Use browser-session authorization, short-lived single-use pairing, capture-only key issuance, owner/environment binding, replay protection, rate limits, no-store responses, and revocation. Keep long-lived secrets out of deep links. Pairing input must bypass URL capture handling and cannot choose an arbitrary redemption origin. Resolve loss of redemption response and failed local persistence without leaving untracked credentials: unconfirmed credentials expire durably, including after restart. Reconnect revokes the previous installation credential only after replacement succeeds.
3. **Notes and shortcut graph:** add the distinct variant; reuse capture endpoint note validation, preserve raw notes, implement duplicate semantics and retrieval acceptance, and keep receipt/completion language truthful. Make note updates append-only and retry-safe with stable submission identity, persistent capture association and explicit outcomes. Add compatible migration/backfill for existing notes; refresh raw-note indexes and exports from authoritative data even when the worker holds an older snapshot. Cover Inbox search, capture detail, authorized knowledge/Ask retrieval and metadata export; identify user notes as personal context, not facts stated by the source video. Maintain token-free sources and signed artifact hashes/native evidence.
4. **UI integration:** add the second download and connection state to the existing setup surface; reuse existing components and preserve the old link. UI/layout work uses the required Opus worker; backend/shortcut logic and QA use GPT-6.1 Sol with high thinking as requested. Assign disjoint files.
5. **Verify and stage:** focused backend/generator tests, full `npm run check`, browser acceptance and native iPhone acceptance. One disposable preview, seeded synthetic data, one review script and one milestone review; archive created demo data after acceptance. Release only through the existing Dokploy staging/promotion process.

## Evidence and constraints

- `web/shortcut-downloads.ts`: current downloads are pinned public v6 artifacts. `web/shortcut-setup.tsx`: capture-only keys are created and manually copied during this visit.
- `src/app.ts`: key creation returns a newly generated token once; capture accepts optional `note` up to 2,000 characters. `src/auth.ts`: tokens are hashed. Logged-in identity does not make old plaintext keys retrievable.
- `src/db.ts:createOrGet`: an existing URL returns immediately, so a new note is currently ignored on duplicate submission.
- `src/worker.ts`, `src/analyzer.ts`, `src/vault-writer.ts`: initial note already participates in analysis and Markdown export. However, the worker's existing-media shortcut exits before publishing the incoming note.
- `src/db.ts`, `src/knowledge.ts`, `src/ask.ts`: raw notes are absent from capture DTOs, FTS inputs and Ask evidence. The gift-for-Dad journey therefore needs more than adding a request field to the shortcut.
- Apple documents [signing through the macOS CLI](https://support.apple.com/en-nz/guide/shortcuts-mac/apd455c82f02/mac), including submission of shortcut contents to Apple for validation. Therefore do not sign a long-lived API key into the public artifact.
- Apple documents [passing text to an installed shortcut](https://support.apple.com/en-au/guide/shortcuts/apd624386f42/ios). This supports investigating pairing; it does not establish automatic post-install execution or safe credential storage.
- Existing native evidence covers macOS with synthetic responses, not a newly provisioned shortcut on iPhone.

## Verification and review script

Preview URL: not created; planning milestone only. Required before implementation review.
Screens: Settings → API keys (existing setup surface), native Shortcuts installation/connection, Share Sheet → With note, capture detail and search.

1. Sign into a synthetic account and open Settings → API keys. Download Without note and With note; confirm distinct names.
2. Connect With note. Confirm no API-key entry and clear success; repeat after closing Shortcuts.
3. Share a seeded supported capture, add “Gift idea for Dad,” and inspect the saved note and search result for “Dad.”
4. Repeat via Skip; toggle sound and verify both settings on-device. Test duplicates and cancelled prompts against the agreed contract.
5. Revoke the With note connection; verify it stops working and the original remains usable. Exercise expired pairing and a second account's isolation.

## Progress

- [x] Repository and current distribution inspected; staging fetched.
- [x] Two GPT-6.1 Sol high-thinking workers assigned bounded research and QA planning.
- [x] Both worker reports reviewed and integrated; evidence spot-checked against staging.
- [x] Stephen accepted install-and-connect; proceed with the native feasibility milestone.
- [ ] Native feasibility proved with synthetic data.
- [ ] Implementation and preview/native acceptance complete.

### Feasibility checkpoint — 2026-10-19

Latest resumed work: native automation recovered. Created/exported an isolated
storage seed and corrected four native action contracts in the probe. Signed and
imported the token-free diagnostic; Safari handoff started it and loopback
redemption succeeded. Execution then reached folder authorization. The system
permission app is blocked by the computer-use tool, so Stephen was asked to approve
the disposable `social-pairing-spike-local` folder. Credential readback/ack and
second-run capture remain unverified. Five focused checks now pass. Native evidence:
`test/fixtures/shortcuts/pairing-spike/native-progress.json`.

Installed dependencies with `npm ci`; full `npm run check` subsequently passed
(documentation, site consistency, type checks, production build, 37 test files / 288
tests). The focused Python probe suite passed 5 tests. Stopped the loopback mock
after recording the partial native result; restart it with a fresh ticket after
the human folder-permission step. Do not resume with the expired grant.

Earlier checkpoint (superseded where noted above):

- Synthetic generator, loopback mock and four structural/protocol checks are available in `test/fixtures/shortcuts/pairing-spike/`; foreman reran the checks successfully. These do not execute native Shortcuts.
- Native folder binding remains unproven: the probe needs a synthetic native export of Save File/Get File from Folder bound to the same local folder. Static Apple metadata establishes field names, not portable storage or permissions.
- CUA opening Shortcuts stalled for over an hour. The subsequent New Shortcut action was interrupted; it may have created an empty scratch shortcut. Do not assume it completed or repeat blindly.
- Device discovery reported an Apple Watch and shutdown iPhone simulators, no physical iPhone. Actual Share Sheet/native iPhone acceptance remains blocked on device access.
- No runtime/UI feature, signed downloadable artifact, or deployment exists yet. The proposed emoji strings are recorded above; native network-error interception remains unverified.
- Worker attempted `npm run check`: documentation/site checks passed, TypeScript stopped because dependencies (`tsc`) are absent. Full application verification remains outstanding.

## Risks and recovery

Key uncertainty is native credential persistence without a dedicated app or manual key entry. Do not substitute an unapproved manual-key workflow and call the requirement met. If direct personalized downloads remain required, return a separate signing/bootstrap infrastructure proposal. Hide the new option if acceptance fails; preserve legacy downloads, credentials, and captures. Database additions must remain compatible with existing SQLite data. No production credentials or deployment changes are needed for this planning milestone.

### Native milestone follow-up

Mac protocol verified: browser handoff → redeem → local text-file save → readback
acknowledgement → independent CLI capture with exact Dad note. Replay rejected.
Native text extension corrected to `.txt`. No production changes. Visual results,
confirmed restart, fresh-device portability and iPhone Share Sheet remain open.
Mock stopped after testing. See the pairing fixture native-progress report.
