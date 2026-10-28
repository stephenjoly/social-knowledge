"""macOS native acceptance. Requires imported local probes and explicit UI permission.

Run with mock-server.py listening. Only the two Local-Test-* probes are invoked.
No production credentials, server calls, or real downloads occur.
"""
import json
import subprocess
import time
from pathlib import Path
from urllib.parse import quote, urlencode
from uuid import uuid4

STATE = Path("/private/tmp/social-native-probe-state.json")
EVENTS = Path("/private/tmp/social-native-probe-events.jsonl")
REPORT = Path("/private/tmp/social-native-probe-report.json")
FACEBOOK = "https://facebook.com/reel/1687517479753343"
INSTAGRAM = "https://www.instagram.com/reel/shortcuts-native-probe/"


def script(source):
    result = subprocess.run(["osascript", "-e", "with timeout of 5 seconds\n" + source + "\nend timeout"], capture_output=True, text=True, timeout=8)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout


def ui():
    try:
        return script('tell application "System Events" to tell process "ShortcutsViewService" to get entire contents of window 1')
    except RuntimeError as error:
        if "Invalid index" in str(error):
            return ""
        raise


def wait_for(fragment, timeout=25):
    deadline = time.monotonic() + timeout
    last = ""
    while time.monotonic() < deadline:
        last = ui()
        if fragment in last:
            return last
        time.sleep(0.4)
    raise AssertionError(f"Expected native UI {fragment!r}; observed {last[:1200]!r}")


def press(button=2):
    script(f'tell application "System Events" to tell process "ShortcutsViewService" to click button {button} of group 1 of window 1')


def run_case(name, variant="Receipt", supplied=FACEBOOK, pasted=None, scenario="complete", expected="Reel archived successfully", request_count=1, cancel=False, expected_url=None):
    case_id = name + "-" + uuid4().hex[:8]
    state = {"case": case_id, "url": expected_url or (INSTAGRAM if supplied == INSTAGRAM or pasted == INSTAGRAM else FACEBOOK), "scenario": scenario}
    STATE.write_text(json.dumps(state))
    query = {"name": f"Local-Test-Social-Knowledge-{variant}-v6"}
    if supplied is not None:
        query.update(input="text", text=supplied)
    script("open location " + json.dumps("shortcuts://run-shortcut?" + urlencode(query, quote_via=quote)))
    if supplied is None or pasted is not None or cancel:
        wait_for("Paste the reel or page URL to save")
        if cancel:
            press(1)
        else:
            script('tell application "System Events" to tell process "ShortcutsViewService" to set value of text area 1 of scroll area 1 of group 1 of window 1 to ' + json.dumps(pasted or ""))
            press()
    native = ""
    if not cancel:
        native = wait_for(expected, timeout=85 if scenario == "poll-queued" else 25)
        press()
    time.sleep(0.5)
    events = [json.loads(line) for line in EVENTS.read_text().splitlines()] if EVENTS.exists() else []
    events = [event for event in events if event.get("case") == case_id]
    assert len(events) == request_count, (name, events)
    for event in events:
        assert all(event[key] for key in ("expectedPath", "exactTestUrl", "textUrl", "dummyKey")), event
    if scenario.startswith("poll-"):
        assert [event["method"] for event in events] == ["POST"] + ["GET"] * (request_count - 1), events
    result = {"case": name, "passed": True, "visibleResult": expected if not cancel else "cancelled", "requests": events}
    print(json.dumps(result), flush=True)
    return result


if __name__ == "__main__":
    results = []
    cases = [
        dict(name="receipt-shared-facebook"),
        dict(name="receipt-prompt-facebook", supplied=None, pasted=FACEBOOK),
        dict(name="receipt-bare-facebook", supplied="facebook.com/reel/1687517479753343"),
        dict(name="receipt-share-text", supplied="Watch this reel! " + FACEBOOK + " Great video"),
        dict(name="receipt-instagram", supplied=INSTAGRAM),
        dict(name="receipt-empty", supplied=None, pasted="", expected="No URL found", request_count=0),
        dict(name="receipt-invalid", supplied=None, pasted="not a link", expected="No URL found", request_count=0),
        dict(name="receipt-cancel", supplied=None, cancel=True, request_count=0),
        dict(name="receipt-unauthorized", scenario="unauthorized", expected="Server did not confirm saving this URL"),
        dict(name="receipt-failed", scenario="failed", expected="URL saved; media capture needs attention"),
        dict(name="receipt-queued", scenario="queued", expected="Server received and saved your URL. Capture is still processing"),
        dict(name="completion-prompt-facebook", variant="Completion", supplied=None, pasted=FACEBOOK, scenario="poll-complete", request_count=2),
        dict(name="receipt-tiktok", supplied="https://www.tiktok.com/@example/video/123", expected_url="https://www.tiktok.com/@example/video/123", scenario="failed", expected="URL saved; media capture needs attention"),
        dict(name="completion-bare-facebook", variant="Completion", supplied="facebook.com/reel/1687517479753343", scenario="poll-complete", request_count=2),
        dict(name="completion-unauthorized", variant="Completion", scenario="unauthorized", expected="Server did not confirm saving this URL"),
        dict(name="completion-timeout", variant="Completion", scenario="poll-queued", expected="Server received and saved your URL. Capture is still processing", request_count=13),
        dict(name="completion-failed", variant="Completion", scenario="poll-failed", expected="URL saved; media capture failed or is unsupported", request_count=2),
    ]
    try:
        for case in cases:
            results.append(run_case(**case))
    finally:
        REPORT.write_text(json.dumps({"platform": "macOS Shortcuts", "results": results}, indent=2) + "\n")
