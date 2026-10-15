"""Loopback-only native Shortcut acceptance server. Never use real credentials."""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

STATE = Path("/private/tmp/social-native-probe-state.json")
EVENTS = Path("/private/tmp/social-native-probe-events.jsonl")
JOB_ID = "00000000-0000-4000-8000-000000000001"
DEFAULT_URL = "https://www.instagram.com/reel/shortcuts-native-probe/"

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, status, body):
        encoded = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def handle_request(self, method):
        state = json.loads(STATE.read_text()) if STATE.exists() else {}
        scenario = state.get("scenario", "complete")
        expected = state.get("url", DEFAULT_URL)
        data = {}
        if method == "POST":
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 <= size <= 8192:
                    raise ValueError("body size")
                data = json.loads(self.rfile.read(size))
                if not isinstance(data, dict):
                    raise ValueError("body type")
            except (ValueError, TypeError):
                self.respond(400, {"error": "invalid_request"})
                return
        url = data.get("url")
        event = {
            "case": state.get("case", "manual"),
            "method": method,
            "expectedPath": self.path == ("/api/v1/jobs" if method == "POST" else f"/api/v1/shortcut/jobs/{JOB_ID}"),
            "exactTestUrl": method == "GET" or url == expected,
            "textUrl": method == "GET" or isinstance(url, str),
            "dummyKey": self.headers.get("Authorization") == "Bearer LOCAL_TEST_PLACEHOLDER",
        }
        # Only synthetic/public test data; never record authorization headers.
        if method == "POST" and url in (expected, expected.replace("https://", "http://")):
            event["testUrlScheme"] = url.split(":", 1)[0]
        with EVENTS.open("a") as file:
            file.write(json.dumps(event) + "\n")
        if not all(event[key] for key in ("expectedPath", "exactTestUrl", "textUrl", "dummyKey")):
            self.respond(400, {"error": "probe_request_mismatch"})
            return
        if scenario == "unauthorized":
            self.respond(401, {"error": "unauthorized"})
            return
        status = "queued" if scenario.startswith("poll-") and method == "POST" else scenario.removeprefix("poll-")
        if status not in ("complete", "failed", "queued"):
            self.respond(500, {"error": "unknown_test_scenario"})
            return
        self.respond(202 if method == "POST" else 200, {
            "received": True, "created": method == "POST",
            "job": {"id": JOB_ID, "status": status},
            "message": "Local native test; no real reel downloaded",
        })

    def do_POST(self):
        self.handle_request("POST")

    def do_GET(self):
        self.handle_request("GET")

if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 18787), Handler).serve_forever()
