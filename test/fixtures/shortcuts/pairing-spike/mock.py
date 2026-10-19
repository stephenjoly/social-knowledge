#!/usr/bin/env python3
"""In-memory synthetic pairing mock. Binds IPv4 loopback only; never logs bodies/headers."""
import argparse
import hmac
import html
import json
import secrets
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import quote

from probe import CAPTURE_URL, ENVIRONMENT, INSTALLATION, NOTE, handoff


class State:
    def __init__(self, scenario="complete", lifetime=300):
        self.ticket = "TEST_TICKET_" + secrets.token_urlsafe(18)
        self.token = "SYNTHETIC_ONLY_" + secrets.token_urlsafe(24)
        self.deadline = time.monotonic() + lifetime
        self.state = "issued"
        self.scenario = scenario
        self.events = []

    def event(self, name, accepted):
        self.events.append({"event": name, "accepted": accepted})


def server(port=18788, scenario="complete", lifetime=300):
    state = State(scenario, lifetime)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def respond(self, status, body, content_type="application/json"):
            encoded = (json.dumps(body) if content_type == "application/json" else body).encode()
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def valid_origin(self):
            # Reject DNS-rebinding/browser cross-origin requests. Native requests omit Origin.
            expected = f"127.0.0.1:{self.server.server_port}"
            return self.headers.get("Host") == expected and self.headers.get("Origin") in (
                None, f"http://{expected}")

        def do_GET(self):
            if not self.valid_origin():
                self.respond(403, {"error": "loopback_only"})
            elif self.path == "/":
                # Local synthetic stand-in for an authenticated Connect button; NO real auth.
                link = html.escape(handoff(state.ticket), quote=True)
                capture = html.escape("shortcuts://run-shortcut?name=Local-Test-SK-Pairing&input=text&text="
                    + quote(CAPTURE_URL, safe=""), quote=True)
                self.respond(200, '<!doctype html><meta name="referrer" content="no-referrer">'
                    '<title>Synthetic pairing only</title><p>No real account or archive.</p>'
                    f'<p><a href="{link}">1. Connect synthetic account</a></p>'
                    f'<p><a href="{capture}">2. Capture synthetic link in separate run</a></p>'
                    '<p>Close Shortcuts between runs. Check /events for boolean evidence.</p>',
                    "text/html; charset=utf-8")
            elif self.path == "/events":
                self.respond(200, {"state": state.state, "events": state.events,
                    "syntheticOnly": True})
            else:
                self.respond(404, {"error": "not_found"})

        def do_POST(self):
            if not self.valid_origin():
                self.respond(403, {"error": "loopback_only"})
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 4096 or self.headers.get_content_type() != "application/json":
                    raise ValueError("size or content type")
                body = json.loads(self.rfile.read(size))
                if not isinstance(body, dict):
                    raise ValueError("object required")
            except (ValueError, TypeError, UnicodeDecodeError):
                self.respond(400, {"error": "invalid_request"})
                return
            if self.path == "/pair/redeem":
                matches = body == {"ticket": state.ticket, "installationId": INSTALLATION,
                    "environment": ENVIRONMENT}
                valid = matches and state.state == "issued" and time.monotonic() < state.deadline
                state.event("redeem", valid)
                if not valid:
                    self.respond(410, {"error": "expired_or_replayed", "state": "rejected"})
                    return
                state.state = "pending"
                self.respond(200, {"state": "pending", "token": state.token,
                    "installationId": INSTALLATION, "environment": ENVIRONMENT})
                return
            authorized = hmac.compare_digest(self.headers.get("Authorization", ""),
                "Bearer " + state.token) and time.monotonic() < state.deadline
            if self.path == "/pair/ack":
                valid = authorized and state.state in ("pending", "active") and body == {
                    "installationId": INSTALLATION}
                state.event("ack", valid)
                if valid:
                    state.state = "active"
                self.respond(200 if valid else 401, {"state": "active" if valid else "rejected"})
            elif self.path == "/capture":
                valid = authorized and state.state == "active" and state.scenario != "unauthorized"
                exact = body == {"url": CAPTURE_URL, "note": NOTE,
                    "submissionId": "synthetic-submission-1"}
                state.event("capture", valid and exact)
                if not valid:
                    self.respond(401, {"error": "unauthorized"})
                elif not exact:
                    self.respond(400, {"error": "synthetic_payload_mismatch"})
                else:
                    self.respond(202, {"received": "yes", "job": {
                        "id": "synthetic-job-1", "status": state.scenario}})
            else:
                self.respond(404, {"error": "not_found"})

    httpd = HTTPServer(("127.0.0.1", port), Handler)
    httpd.state = state
    return httpd


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=18788)
    parser.add_argument("--scenario", choices=["complete", "failed", "queued", "unauthorized"], default="complete")
    parser.add_argument("--lifetime", type=int, default=300, help="All synthetic grants expire after this many seconds")
    parser.add_argument("--events", help="Optional boolean-only report written on Ctrl-C")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535 or not 1 <= args.lifetime <= 3600:
        parser.error("Invalid port or lifetime")
    httpd = server(args.port, args.scenario, args.lifetime)
    print(f"Synthetic mock: http://127.0.0.1:{httpd.server_port}/ (Ctrl-C stops; no real auth)", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        if args.events:
            Path(args.events).write_text(json.dumps({"syntheticOnly": True,
                "events": httpd.state.events}, indent=2) + "\n")
