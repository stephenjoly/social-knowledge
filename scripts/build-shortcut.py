#!/usr/bin/env python3
"""Build a token-free Apple Shortcut. Sign with `shortcuts sign` before import.

Optionally read an existing shortcut privately with --personal-source. Never
commit or publicly share that output. The public default asks for an API key
at import; credentials remain a Text action on the user's device.
"""
import argparse
import copy
import plistlib
import uuid


def build(endpoint, token="", poll=True):
    actions = []
    def action(identifier, **parameters):
        identity = str(uuid.uuid4()).upper()
        actions.append({"WFWorkflowActionIdentifier": "is.workflow.actions." + identifier,
                        "WFWorkflowActionParameters": {"UUID": identity, **parameters}})
        return identity
    def variable(identity, name="Result"):
        return {"WFSerializationType": "WFTextTokenAttachment", "Value": {
            "Type": "ActionOutput", "OutputUUID": identity, "OutputName": name}}
    def text(prefix, identity, suffix="", name="Result"):
        return {"WFSerializationType": "WFTextTokenString", "Value": {
            "string": prefix + "\ufffc" + suffix,
            "attachmentsByRange": {"{%d, 1}" % len(prefix): variable(identity, name)["Value"]}}}
    def dictionary(fields):
        return {"WFSerializationType": "WFDictionaryFieldValue", "Value": {
            "WFDictionaryFieldValueItems": [{"WFItemType": 0,
                "WFKey": {"WFSerializationType": "WFTextTokenString", "Value": {"string": key}},
                "WFValue": value} for key, value in fields.items()]}}
    def key(source, value):
        return action("getvalueforkey", WFInput=variable(source), WFDictionaryKey=value, WFGetDictionaryValueType="Value")
    def condition(source, value=None):
        group = str(uuid.uuid4()).upper()
        action("comment", WFCommentActionText=("Only continue when the server returned a job receipt." if value is None else "Check whether the server reported capture status: " + value))
        parameters = {"GroupingIdentifier": group, "WFControlFlowMode": 0,
                      # If uses WFContentItemFilter input, unlike ordinary actions.
                      # A bare attachment imports as an unbound/blank input chip.
                      "WFInput": {"Type": "Variable", "Variable": variable(source)},
                      "WFCondition": 100 if value is None else 4}
        if value is not None:
            parameters["WFConditionalActionString"] = value
        action("conditional", **parameters)
        return group
    def end(group):
        action("conditional", GroupingIdentifier=group, WFControlFlowMode=2)
    def stop():
        action("exit")
    action("comment", WFCommentActionText="Save one shared URL to Social Knowledge and show the actual server receipt. URL acceptance and completed media capture are separate results.")
    action("comment", WFCommentActionText="Setup: enter your account API key in the Text action below. Never share a personalized copy containing a key. Completion polling requires the updated server; receipt-only mode works with the existing server.")
    token_id = action("gettext", WFTextActionText=token or "PASTE_API_KEY_HERE")
    urls = action("detect.link", WFInput={"Type": "Variable", "Variable": {
        "WFSerializationType": "WFTextTokenAttachment", "Value": {"Type": "ExtensionInput"}}})
    url = action("getitemfromlist", WFInput=variable(urls, "URLs"), WFItemSpecifier="First Item")
    headers = dictionary({"Authorization": text("Bearer ", token_id, name="Text")})
    response = action("downloadurl", WFURL=endpoint, WFHTTPMethod="POST", WFHTTPHeaders=headers,
                      WFHTTPBodyType="JSON", WFJSONValues=dictionary({"url": text("", url)}))
    job = key(response, "job")
    group = condition(job)
    status_value = key(job, "status")
    status = action("gettext", WFTextActionText=text("", status_value))
    for state, prefix in [("complete", "Reel archived successfully. Server response: "),
                          ("failed", "URL saved; media capture needs attention. Server response: ")]:
        branch = condition(status, state)
        action("showresult", Text=text(prefix, response))
        stop()
        end(branch)
    if poll:
        identity = key(job, "id")
        action("notification", WFNotificationActionTitle="Social Knowledge", WFNotificationActionBody="Server received and saved your URL. Checking capture progress…")
        repeat = str(uuid.uuid4()).upper()
        action("comment", WFCommentActionText="Check progress twelve times, five seconds apart. If capture takes longer, inspect Activity; this is not a guaranteed background callback.")
        action("repeat.count", GroupingIdentifier=repeat, WFControlFlowMode=0, WFRepeatCount=12)
        action("delay", WFDelayTime=5)
        progress = action("downloadurl", WFURL=text(endpoint.rsplit("/jobs", 1)[0] + "/shortcut/jobs/", identity), WFHTTPMethod="GET", WFHTTPHeaders=copy.deepcopy(headers))
        current = key(progress, "job")
        available = condition(current)
        current_status_value = key(current, "status")
        current_status = action("gettext", WFTextActionText=text("", current_status_value))
        for state, prefix in [("complete", "Reel archived successfully. Server response: "),
                              ("failed", "URL saved; media capture failed or is unsupported. Server response: ")]:
            branch = condition(current_status, state)
            action("showresult", Text=text(prefix, progress))
            stop()
            end(branch)
        end(available)
        action("repeat.count", GroupingIdentifier=repeat, WFControlFlowMode=2)
    action("showresult", Text=text("Server received and saved your URL. Capture is still processing; check Activity for its final result. Receipt: ", response))
    stop()
    end(group)
    action("showresult", Text=text("Server did not confirm saving this URL. Check this response (unauthorized = token rejected; invalid_url = unsupported/invalid link; transcription_required or analysis_provider_required = fix AI Settings): ", response))
    return {
        "WFWorkflowClientVersion": "4000", "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {"WFWorkflowIconStartColor": 4282601983, "WFWorkflowIconGlyphNumber": 59753},
        "WFWorkflowActions": actions,
        "WFWorkflowInputContentItemClasses": ["WFSafariWebPageContentItem", "WFURLContentItem", "WFStringContentItem"],
        "WFWorkflowTypes": ["ActionExtension"], "WFQuickActionSurfaces": [],
        "WFWorkflowHasShortcutInputVariables": True,
        "WFWorkflowNoInputBehavior": {"Name": "AskForInput", "Parameters": {"WFInputType": "URL"}},
        "WFWorkflowImportQuestions": [] if token else [{"ActionIndex": 2, "ParameterKey": "WFTextActionText", "Category": "Parameter", "Text": "Paste your account API key from Social Knowledge Settings. Do not include Bearer.", "DefaultValue": ""}],
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--receipt-only", action="store_true", help="Compatible with the existing server; no completion polling")
    parser.add_argument("--personal-source", help="Private original shortcut file supplying the existing Text action token")
    args = parser.parse_args()
    token = ""
    if args.personal_source:
        with open(args.personal_source, "rb") as source:
            actions = plistlib.load(source)["WFWorkflowActions"]
            token = next(a["WFWorkflowActionParameters"]["WFTextActionText"] for a in actions if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.gettext")
        if not isinstance(token, str):
            raise ValueError("Expected an existing token Text action")
    with open(args.output, "wb") as output:
        plistlib.dump(build(args.endpoint, token, not args.receipt_only), output, fmt=plistlib.FMT_BINARY)
