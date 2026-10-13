# Social Knowledge Shortcut templates

These files stay in the repository. Do not distribute Shortcut downloads only from `/tmp` or chat attachments.

## Latest candidate: v5

- [Download receipt-only candidate](Save-to-Social-Knowledge-Receipt-v5-candidate.shortcut): submit a link and show the actual server receipt. Start here to verify URL input and submission with fewer actions.
- [Download completion candidate](Save-to-Social-Knowledge-Completion-v5-candidate.shortcut): submit a link, then check capture status every five seconds for up to twelve checks.

On GitHub, open the file and choose **Download raw file**. On iPhone, open the downloaded `.shortcut` file in Shortcuts. Enter your existing account API key from Social Knowledge Settings when asked; omit `Bearer`. Never send your key in chat.

Run the new copy from Shortcuts to get the URL prompt, or share a URL directly to it. Blank/non-link input stops locally. A server receipt means the URL was retained; it does not mean the reel finished archiving. Unsupported links stay in Activity. Completion polling can be interrupted by iOS.

**Validation status:** candidate, not a verified release. v4 was reproduced returning “No URL found” with an actual URL. v5 corrects both URL-extraction input references to use direct attachments while retaining the special If wrapper. Generator regression checks pass and these files are Apple-signed. Import, prompt-to-request execution, and completion feedback of v5 still require native verification. Signing and structural tests alone do not prove execution.

## Older template

`Save to Social Knowledge.shortcut` is the older unsigned three-action template. It uses an example endpoint and a fixed success message; it is not the updated download. Keep it only as a historical source. Use the v5 candidates above for the current receipt/status contract.

## Source and regeneration

Reviewable unsigned sources are under [templates/](templates/); signed downloads and their hashes are listed in [manifest.json](manifest.json). All committed sources use the `PASTE_API_KEY_HERE` placeholder and an import question. The endpoint is the existing production service; no server deployment is needed to replace the Shortcut.

Generate sources and signing inputs from the repository root:

```bash
python3 scripts/build-shortcut.py --endpoint https://social-knowledge.stephenjoly.net/api/v1/jobs --receipt-only --xml --output shortcuts/templates/receipt-v5-candidate.plist
python3 scripts/build-shortcut.py --endpoint https://social-knowledge.stephenjoly.net/api/v1/jobs --xml --output shortcuts/templates/completion-v5-candidate.plist
python3 - <<'SOURCES'
import plistlib
from pathlib import Path
for variant in ("receipt", "completion"):
    source = Path("shortcuts/templates") / f"{variant}-v5-candidate.plist"
    with source.open("rb") as file:
        workflow = plistlib.load(file)
    with open(f"/tmp/social-{variant}.shortcut", "wb") as file:
        plistlib.dump(workflow, file, fmt=plistlib.FMT_BINARY)
SOURCES
shortcuts sign --mode anyone --input /tmp/social-receipt.shortcut --output shortcuts/Save-to-Social-Knowledge-Receipt-v5-candidate.shortcut
shortcuts sign --mode anyone --input /tmp/social-completion.shortcut --output shortcuts/Save-to-Social-Knowledge-Completion-v5-candidate.shortcut
```

Use one generated workflow per variant when updating sources and signing inputs: convert the XML source to binary with `plistlib` rather than generating a second set of UUIDs. Update manifest hashes after replacing downloads. Keep future versions here, with their validation status and setup instructions. Commit only token-free distribution templates. Never use `--personal-source` for repository artifacts or commit a personalized exported Shortcut.
