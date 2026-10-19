# Synthetic pairing: shortest two-run probe

**Status: partial native verification; complete feasibility UNPROVEN.** On macOS
27.0.1, the foreman created/exported a synthetic local-folder seed, signed/imported
the token-free probe, and used Safari to start pairing. The loopback server accepted
redemption. Folder authorization then blocked execution; persistent readback and a
second run remain unverified. Computer-use access to the system permission app is
blocked; human approval was requested. No real credentials or production access.
See [native progress](native-progress.json). Existing native-smoke.py is historical;
parent uses CUA for native interactions and the native `shortcuts` CLI where supported.

## What to run first

```sh
PYTHONDONTWRITEBYTECODE=1 python3 test/fixtures/shortcuts/pairing-spike/check.py
PYTHONDONTWRITEBYTECODE=1 python3 test/fixtures/shortcuts/pairing-spike/apple-static-evidence.py
PYTHONDONTWRITEBYTECODE=1 python3 test/fixtures/shortcuts/pairing-spike/probe.py \
  --xml --output /private/tmp/sk-pairing-unbound.plist
```

The last output is an explicitly **unbound inspection template**, not a ready or
validated storage implementation. It embeds no ticket or long-lived credential.
Its action identifiers now match the native synthetic export; folder bindings are
still intentionally empty unless a local seed is supplied.
Do not treat an imported graph with blank folder chips as a passing probe.

**Native seed (created by foreman on 2026-10-19):** using CUA, create a NEW synthetic scratch shortcut
with exactly one **Save File** and one **Get File from Folder**. Choose the SAME
new device-local synthetic folder for both; do not use iCloud Drive, Desktop,
Documents, another cloud provider, or an existing personal folder. On macOS use
a disposable explicitly local folder; on iPhone use **On My iPhone**. Set filename
and relative read path to `sk-pairing-synthetic.txt`, turn Ask Where to Save OFF,
and Overwrite ON. Export only that new scratch graph. This macOS version exports
a signed AEA container: decode the synthetic artifact with `aea decrypt` using
the public key in its embedded signing certificate, then `aa extract`; the payload
is `Shortcut.wflow`. Supply that XML/binary plist to the generator. Never
inspect/export a personal shortcut or its database. The foreman verified native
`documentpicker.save`, `documentpicker.open`, `detect.dictionary`, and Match Text's
`text` parameter; earlier guessed IDs/parameters caused Unknown Action/blank input.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 test/fixtures/shortcuts/pairing-spike/probe.py \
  --storage-seed /private/tmp/sk-synthetic-storage-seed.plist \
  --output /private/tmp/sk-pairing-probe-unsigned.shortcut
PYTHONDONTWRITEBYTECODE=1 python3 test/fixtures/shortcuts/pairing-spike/mock.py \
  --events /private/tmp/sk-pairing-native-events.json
```

Use a `.shortcut` extension for the binary input to `shortcuts sign`; this CLI
rejected the same binary content when named `.plist`. Only parent signs/imports
through the approved native flow and names it exactly
`Local-Test-SK-Pairing`. Seed folder bookmarks stay in temporary output, never in
committed fixtures. Generator checks nonempty bindings, not actual provider or
same-folder identity: parent must verify those in CUA. Imported folder permissions,
bookmark portability and survival across runs remain empirical questions.

1. Open `http://127.0.0.1:18788/` in the browser. Click **Connect synthetic account**.
   This simulates the authenticated browser handoff, with a short-lived ticket in
   URL-encoded text. There is no real login/backend integration in this fixture.
   Observe native prompts. Expect `✅ Connected` only after POST redemption, local
   file save, local read-back, and an authenticated acknowledgement using that
   read-back token. Acknowledgement is idempotent within the mock grant lifetime.
2. Close Shortcuts, then click **Capture synthetic link in separate run**. Expect
   another file read, authorized POST of the exact synthetic URL, note
   `Gift idea for Dad`, and submission ID. Expect `⏳ Processing`, then `✅ Saved`
   for the mock completion. No real capture/download/archive happens.
3. Read `http://127.0.0.1:18788/events`. Successful sequence is accepted `redeem`,
   `ack`, `capture`, with state `active`. Events contain booleans only. Record
   OS/app versions, prompts, actual folder location, restart interval, and whether
   setup/editor/file-picker interaction recurs. Then stop mock with Ctrl-C.

Mock defaults to five-minute lifetime for ticket AND synthetic credential; restart
mock for a fresh trial. A restart intentionally invalidates all previous grants.
No listener remains after checks. Mock binds ONLY `127.0.0.1`; no forwarding, LAN
binding, tunnels, or publication. An iPhone's loopback does not reach this Mac.
Full iPhone execution therefore needs a separately authorized device-local mock
or another explicit test arrangement; this worker has not widened network access.

## Evidence and interpretation

`check.py` passed 5 checks on 2026-10-19, Python 3.13.13: native-export action-contract
regressions, graph/plist round-trip,
token/ticket absence, fixed POST origin, balanced branches, auth dependency on
saved-file reads, explicit seed requirement; mock redemption/replay/expiry,
installation binding, no capture before ack, rejected auth/body, and successful
save/reload/ack/reload/capture protocol. The Python file round-trip proves only
mock contract behavior, **not native storage**. Temporary loopback binding required
sandbox escalation. Tests close listeners and delete synthetic temp directories.

Worker's initial `npm run check` stopped at missing `tsc`. Foreman later installed
dependencies with `npm ci` and the full check passed: documentation/site checks,
TypeScript, production build, 37 test files / 288 tests. Runtime remains unchanged.
The local mock is stopped at this checkpoint; restart it for a fresh ticket after
human folder authorization. The earlier pending grant has expired.

Apple-installed WorkflowKit static definitions on this Mac expose:

- Save File: `WFFolder`, `WFAskWhereToSave`, `WFFileDestinationPath`,
  `WFSaveFileOverwrite`; parameter summary
  `WFInput,WFFolder,WFSaveFileOverwrite,WFAskWhereToSave(0),WFFileDestinationPath`.
- Get File from Folder: `WFFile`, `WFGetFilePath`, `WFFileErrorIfNotFound`;
  relative path starting at a selected folder.

`apple-static-evidence.py` reproduces those excerpts from the Apple system image
without loading frameworks or touching personal data. These strings establish
field names only. They do **not** prove folder bookmark serialization, iOS action
compatibility, successful import, or device-local persistence. No `WFFileStorageService`
provider value is guessed. No Keychain capability is assumed. The generated probe
stores plain synthetic JSON in Files, not protected credential storage. Choosing
local Files also does not prove exclusion from device backups.

Apple primary references, checked 2026-10-19:

- [Run a shortcut using a URL scheme](https://support.apple.com/en-au/guide/shortcuts/apd624386f42/ios):
  installed shortcut name and URL-encoded text input; does not establish post-install
  auto-run or secret persistence.
- [Request your first API](https://support.apple.com/en-eg/guide/shortcuts/apd58d46713f/ios):
  Get Contents of URL supports POST and JSON request body.
- [Find files on iPhone/iPad](https://support.apple.com/en-ie/102570):
  On My iPhone/iPad is local; iCloud Drive syncs across devices.
- [Share actions](https://support.apple.com/en-ae/guide/shortcuts/apdaf74d75a5/ios):
  identifies Save File as a file-management action, without documenting serialized fields.

## Status and failure limits

Product copy requirement: `⏳ Processing` only after receipt; `✅ Saved` only after
completed archival; `⚠️ Capture failed` for a retained failed job;
`❌ Couldn’t reach server` when receipt cannot be confirmed;
`⏳ Still processing` for timeout; `🔑 Reconnect shortcut` for authentication;
`⚠️ No link found` for invalid/empty input. No raw JSON or secrets in notifications.
Probe adds `✅ Connected` and `⚠️ Invalid connection`. Sound is explicitly off;
persistent sound toggle is outside this minimal feasibility probe.

`--scenario failed|queued|unauthorized` exercises synthetic capture responses.
For this short probe, queued maps to Still processing immediately; it does not
test the product polling timeout. Actual receipt sound and Share Sheet remain
native acceptance work.

**Native transport failures may abort Get Contents of URL before downstream If
or notification actions execute.** This graph has no validated try/catch mechanism.
It therefore does not promise custom offline text or reliable mapping of HTTP
401/410 bodies. Parent must observe denied permissions, refused connection,
timeout and HTTP error behavior. No receipt means no success claim. Malformed
JSON may similarly stop at native dictionary parsing. Restarting after lost
redemption response requires a fresh ticket; the mock leaves no active grant
without ack and pending grants expire, but durable server recovery is out of scope.

Native success still would not prove production feasibility: bookmark portability
across users/devices, no repeated folder setup after fresh import, iPhone local
storage/Share Sheet, signed token-free install then Connect once, browser auth,
owner isolation, revocation, durable server lifecycle, reconnect recovery and
real archive completion remain unproven. If native storage needs manual editing
or repeated picker selection, record failure against install-and-connect acceptance.

Cleanup only what this probe creates: stop mock, delete synthetic credential file,
new synthetic folder, new test shortcut, seed/export/temp reports after recording
boolean evidence. Do not inspect or clean unrelated shortcuts/files.

### Follow-up native run

Human folder approval allowed Save File to complete. Native Shortcuts changed the
text output extension to `.txt` despite a `.json` destination, so the original
readback failed with file-not-found. The probe now consistently uses
`sk-pairing-synthetic.txt` containing JSON. The corrected probe was signed and
reimported, redeemed a fresh synthetic ticket, and wrote parseable JSON with
the expected fields. Readback acknowledgement and the independent second run
remain unverified. All five Python checks pass after the filename correction.

Do not launch `ShortcutsViewService.xpc` as an application: when unavailable,
macOS opens a misleading application-selection dialog. Use the supported
Shortcuts runner and inspect already-visible UI instead.
