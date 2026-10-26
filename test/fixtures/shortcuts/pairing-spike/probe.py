#!/usr/bin/env python3
"""Synthetic native probe generator. No signing, import, execution, or library access."""
import argparse
import copy
import json
import plistlib
import uuid
from pathlib import Path
from urllib.parse import quote, urlencode

NAME = "Local-Test-SK-Pairing"
PREFIX = "SKPAIR1:"
INSTALLATION = "synthetic-installation-1"
ENVIRONMENT = "loopback-spike"
CAPTURE_URL = "https://www.instagram.com/reel/synthetic-pairing-probe/"
NOTE = "Gift idea for Dad"
FILENAME = "sk-pairing-synthetic.txt"


def origin(port):
    if not 1 <= port <= 65535:
        raise ValueError("Invalid loopback port")
    return f"http://127.0.0.1:{port}"


def handoff(ticket):
    # Long-lived credential is deliberately absent; only a short-lived test ticket.
    envelope = PREFIX + json.dumps({"kind": "pair", "version": "1",
        "environment": ENVIRONMENT, "installationId": INSTALLATION,
        "ticket": ticket}, separators=(",", ":"))
    return "shortcuts://run-shortcut?" + urlencode(
        {"name": NAME, "input": "text", "text": envelope}, quote_via=quote)


def storage_bindings(seed):
    """Read ONLY parent-created synthetic scratch export, never a Shortcuts library.

    Keep opaque folder bindings in temporary generated output, not source control.
    Action identifiers/keys must come from this native export, not guessed providers.
    """
    with Path(seed).open("rb") as file:
        workflow = plistlib.load(file)
    actions = workflow["WFWorkflowActions"]
    saves = [a for a in actions if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.documentpicker.save"]
    reads = [a for a in actions if a["WFWorkflowActionParameters"].get("WFGetFilePath") == FILENAME]
    if len(saves) != 1 or len(reads) != 1:
        raise ValueError("Synthetic seed needs exactly one Save File and one matching Get File from Folder")
    save, read = (copy.deepcopy(a) for a in (saves[0], reads[0]))
    sp, rp = save["WFWorkflowActionParameters"], read["WFWorkflowActionParameters"]
    if sp.get("WFAskWhereToSave") is not False or not sp.get("WFFolder") or not rp.get("WFFile"):
        raise ValueError("Seed must bind both actions to an explicitly chosen LOCAL folder; picker off")
    if sp.get("WFFileDestinationPath") != FILENAME:
        raise ValueError("Seed filename mismatch")
    # This checks shape only. Parent must attest both bindings use the SAME local folder.
    return save, read


def build(port=18788, bindings=None):
    base = origin(port)
    actions = []

    def action(identifier, **parameters):
        identity = str(uuid.uuid4()).upper()
        actions.append({"WFWorkflowActionIdentifier": "is.workflow.actions." + identifier,
            "WFWorkflowActionParameters": {"UUID": identity, **parameters}})
        return identity

    def variable(identity):
        return {"WFSerializationType": "WFTextTokenAttachment", "Value": {
            "Type": "ActionOutput", "OutputUUID": identity, "OutputName": "Result"}}

    def text(identity, prefix=""):
        return {"WFSerializationType": "WFTextTokenString", "Value": {
            "string": prefix + "\ufffc", "attachmentsByRange": {
                "{%d, 1}" % len(prefix): variable(identity)["Value"]}}}

    def dictionary(fields):
        return {"WFSerializationType": "WFDictionaryFieldValue", "Value": {
            "WFDictionaryFieldValueItems": [{"WFItemType": 0,
                "WFKey": {"WFSerializationType": "WFTextTokenString", "Value": {"string": k}},
                "WFValue": v} for k, v in fields.items()]}}

    def key(identity, name):
        return action("getvalueforkey", WFInput=variable(identity),
            WFDictionaryKey=name, WFGetDictionaryValueType="Value")

    def branch(identity, value=None):
        group = str(uuid.uuid4()).upper()
        parameters = {"GroupingIdentifier": group, "WFControlFlowMode": 0,
            "WFInput": {"Type": "Variable", "Variable": variable(identity)},
            "WFCondition": 100 if value is None else 4}
        if value is not None:
            parameters["WFConditionalActionString"] = value
        action("conditional", **parameters)
        return group

    def end(group):
        action("conditional", GroupingIdentifier=group, WFControlFlowMode=2)

    def result(message):
        action("showresult", Text=message)
        action("exit")

    def require(identity, value, message):
        # Match existing v6 pattern: coerce dictionary values before string comparison.
        string = action("gettext", WFTextActionText=text(identity))
        group = branch(string, value)
        action("conditional", GroupingIdentifier=group, WFControlFlowMode=1)
        result(message)
        end(group)

    def post(path, fields, token=None):
        params = {"WFURL": base + path, "WFHTTPMethod": "POST", "WFHTTPBodyType": "JSON",
            "WFJSONValues": dictionary(fields)}
        if token:
            params["WFHTTPHeaders"] = dictionary({"Authorization": text(token, "Bearer ")})
        return action("downloadurl", **params)

    def read():
        if bindings:
            a = copy.deepcopy(bindings[1])
            a["WFWorkflowActionParameters"].pop("UUID", None)
            a["WFWorkflowActionParameters"].pop("WFInput", None)
            identity = action(a["WFWorkflowActionIdentifier"].removeprefix("is.workflow.actions."),
                **a["WFWorkflowActionParameters"])
        else:
            # Keys evidenced by Apple system definitions. Empty folder is intentional.
            # Identifier verified from native macOS 27 synthetic export.
            identity = action("documentpicker.open", WFFile="", WFGetFilePath=FILENAME,
                WFFileErrorIfNotFound=True)
        return action("detect.dictionary", WFInput=variable(identity))

    action("comment", WFCommentActionText=(
        "SYNTHETIC ONLY. No real account, token, archive, or download. Loopback only. "
        + ("Folder bindings copied from parent-created native synthetic seed. Verify local location."
           if bindings else "UNBOUND STORAGE TEMPLATE: do not run until native folder bindings/identifier are verified. "
           "Set Save File and both Get File from Folder actions to the SAME new local folder. Never iCloud.")))
    incoming = action("gettext", WFTextActionText={"WFSerializationType": "WFTextTokenString",
        "Value": {"string": "\ufffc", "attachmentsByRange": {"{0, 1}": {"Type": "ExtensionInput"}}}})
    pairing = action("text.match", text=text(incoming), WFMatchTextPattern="^SKPAIR1:")
    pair_group = branch(pairing)
    raw = action("text.replace", WFInput=text(incoming), WFReplaceTextFind="^SKPAIR1:",
        WFReplaceTextReplace="", WFReplaceTextRegularExpression=True, WFReplaceTextCaseSensitive=True)
    envelope = action("detect.dictionary", WFInput=variable(raw))
    for field, expected in [("kind", "pair"), ("version", "1"),
                            ("environment", ENVIRONMENT), ("installationId", INSTALLATION)]:
        value = action("gettext", WFTextActionText=text(key(envelope, field)))
        require(value, expected, "⚠️ Invalid connection")
    redeemed = post("/pair/redeem", {"ticket": text(key(envelope, "ticket")),
        "installationId": INSTALLATION, "environment": ENVIRONMENT})
    require(key(redeemed, "state"), "pending", "🔑 Reconnect shortcut")
    serialized = action("gettext", WFTextActionText=text(redeemed))
    if bindings:
        save = copy.deepcopy(bindings[0])
        parameters = save["WFWorkflowActionParameters"]
        parameters.pop("UUID", None)
        parameters["WFInput"] = variable(serialized)
        action(save["WFWorkflowActionIdentifier"].removeprefix("is.workflow.actions."), **parameters)
    else:
        action("documentpicker.save", WFInput=variable(serialized), WFFolder="", WFAskWhereToSave=False,
            WFFileDestinationPath=FILENAME, WFSaveFileOverwrite=True)
    persisted = read()
    # Ack authenticates using the READ-BACK token, not the redemption output variable.
    ack = post("/pair/ack", {"installationId": INSTALLATION}, key(persisted, "token"))
    require(key(ack, "state"), "active", "🔑 Reconnect shortcut")
    result("✅ Connected")
    end(pair_group)
    # Any malformed pairing-looking text fails locally, never enters capture.
    malformed = action("text.match", text=text(incoming), WFMatchTextPattern="^SKPAIR")
    bad = branch(malformed)
    result("⚠️ Invalid connection")
    end(bad)
    require(incoming, CAPTURE_URL, "⚠️ No link found")
    stored = read()
    receipt = post("/capture", {"url": CAPTURE_URL, "note": NOTE,
        "submissionId": "synthetic-submission-1"}, key(stored, "token"))
    require(key(receipt, "received"), "yes", "🔑 Reconnect shortcut")
    action("notification", WFNotificationActionTitle="Social Knowledge",
        WFNotificationActionBody="⏳ Processing", WFNotificationActionSound=False)
    job = key(receipt, "job")
    status = action("gettext", WFTextActionText=text(key(job, "status")))
    complete = branch(status, "complete")
    result("✅ Saved")
    end(complete)
    failed = branch(status, "failed")
    result("⚠️ Capture failed")
    end(failed)
    result("⏳ Still processing")
    return {"WFWorkflowClientVersion": "4000", "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900", "WFWorkflowActions": actions,
        "WFWorkflowIcon": {"WFWorkflowIconStartColor": 4282601983, "WFWorkflowIconGlyphNumber": 59753},
        "WFWorkflowInputContentItemClasses": ["WFStringContentItem", "WFURLContentItem"],
        "WFWorkflowTypes": ["ActionExtension"], "WFQuickActionSurfaces": [],
        "WFWorkflowHasShortcutInputVariables": True, "WFWorkflowImportQuestions": []}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    parser.add_argument("--port", type=int, default=18788)
    parser.add_argument("--storage-seed", help="Parent-created synthetic XML/binary plist, NOT a signed shortcut")
    parser.add_argument("--xml", action="store_true")
    args = parser.parse_args()
    bindings = storage_bindings(args.storage_seed) if args.storage_seed else None
    with open(args.output, "wb") as output:
        plistlib.dump(build(args.port, bindings), output,
            fmt=plistlib.FMT_XML if args.xml else plistlib.FMT_BINARY)
    print("Generated synthetic probe; " + ("native execution unverified" if bindings else "UNBOUND: native storage seed required"))
