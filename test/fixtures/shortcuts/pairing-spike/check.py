#!/usr/bin/env python3
"""Focused structural/HTTP checks. These do NOT execute native Shortcuts."""
import json
import plistlib
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit
from urllib.request import ProxyHandler, Request, build_opener

from mock import server
from probe import (CAPTURE_URL, ENVIRONMENT, FILENAME, INSTALLATION, NOTE,
                   PREFIX, build, handoff, storage_bindings)


class ProbeChecks(unittest.TestCase):
    def test_native_export_action_contracts(self):
        # Regression evidence: macOS 27 native synthetic exports on 2026-10-19.
        # Previous IDs imported as Unknown Action; WFInput on Match Text
        # imported as an empty Text chip and prompted at runtime.
        actions = build()["WFWorkflowActions"]
        identifiers = [a["WFWorkflowActionIdentifier"] for a in actions]
        self.assertIn("is.workflow.actions.documentpicker.save", identifiers)
        self.assertEqual(identifiers.count("is.workflow.actions.documentpicker.open"), 2)
        self.assertEqual(identifiers.count("is.workflow.actions.detect.dictionary"), 3)
        for old in ("file.save", "file.get", "getdictionaryfrominput"):
            self.assertNotIn("is.workflow.actions." + old, identifiers)
        matches = [a["WFWorkflowActionParameters"] for a in actions
                   if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.text.match"]
        self.assertEqual(len(matches), 2)
        for parameters in matches:
            self.assertNotIn("WFInput", parameters)
            self.assertEqual(parameters["text"]["WFSerializationType"], "WFTextTokenString")
            self.assertTrue(parameters["text"]["Value"]["attachmentsByRange"])

    def test_envelope_and_graph(self):
        query = parse_qs(urlsplit(handoff("TEST_TICKET_structural")).query)
        envelope = json.loads(query["text"][0].removeprefix(PREFIX))
        self.assertEqual(envelope, {"kind": "pair", "version": "1", "environment": ENVIRONMENT,
            "installationId": INSTALLATION, "ticket": "TEST_TICKET_structural"})
        workflow = build()
        encoded = plistlib.dumps(workflow)
        self.assertEqual(plistlib.loads(encoded), workflow)
        self.assertNotIn(b"SYNTHETIC_ONLY_", encoded)
        self.assertNotIn(b"TEST_TICKET_", encoded)
        self.assertEqual(workflow["WFWorkflowImportQuestions"], [])
        actions = workflow["WFWorkflowActions"]
        posts = [a["WFWorkflowActionParameters"] for a in actions
                 if a["WFWorkflowActionIdentifier"].endswith(".downloadurl")]
        self.assertEqual([p["WFURL"] for p in posts], ["http://127.0.0.1:18788" + p
            for p in ("/pair/redeem", "/pair/ack", "/capture")])
        self.assertTrue(all(p["WFHTTPMethod"] == "POST" for p in posts))
        self.assertNotIn("WFHTTPHeaders", posts[0])
        saves = [i for i, a in enumerate(actions) if a["WFWorkflowActionIdentifier"].endswith(".documentpicker.save")]
        reads = [i for i, a in enumerate(actions) if "WFGetFilePath" in a["WFWorkflowActionParameters"]]
        self.assertEqual(len(saves), 1)
        self.assertEqual(len(reads), 2)
        self.assertLess(saves[0], reads[0])
        # Walk each auth token dependency: Get Dictionary Value <- parsed saved file <- file read.
        by_id = {a["WFWorkflowActionParameters"]["UUID"]: a for a in actions}
        for request, read_index in zip(posts[1:], reads):
            header = request["WFHTTPHeaders"]["Value"]["WFDictionaryFieldValueItems"][0]["WFValue"]
            token_id = next(iter(header["Value"]["attachmentsByRange"].values()))["OutputUUID"]
            token = by_id[token_id]["WFWorkflowActionParameters"]
            self.assertEqual(token["WFDictionaryKey"], "token")
            parsed_id = token["WFInput"]["Value"]["OutputUUID"]
            parsed = by_id[parsed_id]["WFWorkflowActionParameters"]
            self.assertEqual(parsed["WFInput"]["Value"]["OutputUUID"],
                             actions[read_index]["WFWorkflowActionParameters"]["UUID"])
        groups = []
        for action in actions:
            p = action["WFWorkflowActionParameters"]
            if action["WFWorkflowActionIdentifier"].endswith(".conditional"):
                if p["WFControlFlowMode"] == 0:
                    groups.append(p["GroupingIdentifier"])
                elif p["WFControlFlowMode"] == 2:
                    self.assertEqual(groups.pop(), p["GroupingIdentifier"])
                else:
                    self.assertEqual(groups[-1], p["GroupingIdentifier"])
        self.assertEqual(groups, [])

    def test_seed_is_explicit_not_a_guessed_provider(self):
        # Fake binding exercises plumbing only; it is NOT evidence of Apple's bookmark schema.
        workflow = build()
        seed = {"WFWorkflowActions": [a for a in workflow["WFWorkflowActions"]
                if a["WFWorkflowActionIdentifier"].endswith(".documentpicker.save") or
                "WFGetFilePath" in a["WFWorkflowActionParameters"]][:2]}
        with tempfile.TemporaryDirectory(prefix="sk-pairing-check-") as directory:
            path = Path(directory) / "synthetic-seed.plist"
            path.write_bytes(plistlib.dumps(seed))
            with self.assertRaises(ValueError):
                storage_bindings(path)
            seed["WFWorkflowActions"][0]["WFWorkflowActionParameters"]["WFFolder"] = "SYNTHETIC_BINDING_ONLY"
            seed["WFWorkflowActions"][1]["WFWorkflowActionParameters"]["WFFile"] = "SYNTHETIC_BINDING_ONLY"
            path.write_bytes(plistlib.dumps(seed))
            bindings = storage_bindings(path)
            populated = build(bindings=bindings)
            reads = [a for a in populated["WFWorkflowActions"] if
                     a["WFWorkflowActionParameters"].get("WFGetFilePath") == FILENAME]
            self.assertEqual(len(reads), 2)
            self.assertTrue(all(a["WFWorkflowActionParameters"]["WFFile"] == "SYNTHETIC_BINDING_ONLY" for a in reads))
        with self.assertRaises(ValueError):
            build(port=0)


class MockChecks(unittest.TestCase):
    def setUp(self):
        self.server = server(port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"
        self.client = build_opener(ProxyHandler({}))

    def tearDown(self):
        self.server.shutdown()
        self.thread.join(timeout=2)
        self.server.server_close()

    def request(self, path, data=None, token=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        req = Request(self.base + path, data=json.dumps(data).encode() if data is not None else None,
                      headers=headers)
        try:
            response = self.client.open(req, timeout=3)
        except HTTPError as error:
            response = error
        with response:
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            return response.status, json.loads(response.read())

    def redeem(self):
        return self.request("/pair/redeem", {"ticket": self.server.state.ticket,
            "installationId": INSTALLATION, "environment": ENVIRONMENT})

    def test_redeem_save_reload_ack_reload_capture(self):
        self.assertEqual(self.server.server_address[0], "127.0.0.1")
        status, issued = self.redeem()
        self.assertEqual(status, 200)
        token = issued["token"]
        self.assertEqual(self.redeem()[0], 410)
        payload = {"url": CAPTURE_URL, "note": NOTE, "submissionId": "synthetic-submission-1"}
        self.assertEqual(self.request("/capture", payload, token)[0], 401)
        # Python file round-trip validates protocol expectations ONLY, never native storage.
        with tempfile.TemporaryDirectory(prefix="sk-pairing-check-") as directory:
            file = Path(directory) / FILENAME
            file.write_text(json.dumps(issued))
            loaded = json.loads(file.read_text())
            self.assertEqual(self.request("/pair/ack", {"installationId": INSTALLATION}, loaded["token"]),
                             (200, {"state": "active"}))
            later = json.loads(file.read_text())
            self.assertEqual(self.request("/capture", payload, later["token"])[0], 202)
        status, events = self.request("/events")
        self.assertEqual(status, 200)
        self.assertNotIn(token, json.dumps(events))
        self.assertNotIn(self.server.state.ticket, json.dumps(events))
        self.assertEqual(events["events"][-2:], [{"event": "ack", "accepted": True},
                                                {"event": "capture", "accepted": True}])

    def test_expiry_binding_and_bad_input(self):
        self.assertEqual(self.request("/pair/redeem", {"ticket": self.server.state.ticket,
            "installationId": "other-installation", "environment": ENVIRONMENT})[0], 410)
        self.server.state.deadline = 0
        self.assertEqual(self.redeem()[0], 410)
        self.assertEqual(self.request("/pair/redeem", ["not an object"])[0], 400)
        self.assertEqual(self.request("/pair/ack", {"installationId": INSTALLATION}, "SYNTHETIC_WRONG")[0], 401)
        self.assertEqual(self.request("/pair/redeem")[0], 404)  # GET cannot redeem.


if __name__ == "__main__":
    unittest.main(verbosity=2)
