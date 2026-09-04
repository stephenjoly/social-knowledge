#!/usr/bin/env python3

import argparse
import copy
import plistlib
import uuid
from pathlib import Path


SHORTCUT_NAME = "Save to Social Knowledge"
API_URL = "https://social-knowledge.example/api/v1/jobs"
TOKEN_PLACEHOLDER = "ENTER_SOCIAL_KNOWLEDGE_API_TOKEN"


def text_token(value: str, attachments: dict[str, dict[str, str]] | None = None) -> dict:
    payload: dict[str, object] = {"string": value}
    if attachments:
        payload["attachmentsByRange"] = attachments
    return {
        "Value": payload,
        "WFSerializationType": "WFTextTokenString",
    }


def dictionary_item(key: str, value: dict) -> dict:
    return {
        "WFKey": text_token(key),
        "WFItemType": 0,
        "WFValue": value,
    }


def dictionary_parameter(items: list[dict]) -> dict:
    return {
        "Value": {"WFDictionaryFieldValueItems": items},
        "WFSerializationType": "WFDictionaryFieldValue",
    }


def build(template_path: Path, output_path: Path) -> None:
    with template_path.open("rb") as source:
        shortcut = plistlib.load(source)

    actions = shortcut.get("WFWorkflowActions", [])
    request_template = next(
        action for action in actions if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.downloadurl"
    )
    result_template = next(
        action for action in actions if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.showresult"
    )

    original_json_items = (
        request_template["WFWorkflowActionParameters"]["WFJSONValues"]["Value"]["WFDictionaryFieldValueItems"]
    )
    url_item = copy.deepcopy(next(item for item in original_json_items if item["WFKey"]["Value"]["string"] == "url"))

    token_uuid = str(uuid.uuid4()).upper()
    request_uuid = str(uuid.uuid4()).upper()

    token_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
        "WFWorkflowActionParameters": {
            "UUID": token_uuid,
            "WFTextActionText": TOKEN_PLACEHOLDER,
        },
    }

    authorization_value = text_token(
        "Bearer \ufffc",
        {
            "{7, 1}": {
                "OutputUUID": token_uuid,
                "Type": "ActionOutput",
                "OutputName": "Text",
            }
        },
    )

    request_action = copy.deepcopy(request_template)
    request_parameters = request_action["WFWorkflowActionParameters"]
    request_parameters.update(
        {
            "UUID": request_uuid,
            "WFURL": API_URL,
            "WFHTTPMethod": "POST",
            "ShowHeaders": False,
            "WFHTTPHeaders": dictionary_parameter(
                [dictionary_item("Authorization", authorization_value)]
            ),
            "WFJSONValues": dictionary_parameter([url_item]),
        }
    )

    result_action = copy.deepcopy(result_template)
    result_action["WFWorkflowActionParameters"] = {
        "Text": text_token("Sent to Social Knowledge")
    }

    shortcut["WFWorkflowName"] = SHORTCUT_NAME
    shortcut["WFWorkflowActions"] = [token_action, request_action, result_action]
    shortcut["WFWorkflowImportQuestions"] = [
        {
            "ActionIndex": 0,
            "Category": "Parameter",
            "DefaultValue": TOKEN_PLACEHOLDER,
            "ParameterKey": "WFTextActionText",
            "Text": "Enter your Social Knowledge API token. This is API_TOKEN, not your OpenAI key.",
        }
    ]
    shortcut["WFWorkflowHasShortcutInputVariables"] = True

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as destination:
        plistlib.dump(shortcut, destination, fmt=plistlib.FMT_BINARY, sort_keys=False)

    serialized = output_path.read_bytes()
    checks = {
        "API endpoint": API_URL.encode(),
        "token placeholder": TOKEN_PLACEHOLDER.encode(),
        "shortcut name": SHORTCUT_NAME.encode(),
    }
    for label, expected in checks.items():
        if expected not in serialized:
            raise RuntimeError(f"Generated shortcut is missing {label}")
    if b"social-to-mealie" in serialized:
        raise RuntimeError("Generated shortcut still contains the Social to Mealie endpoint")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the Social Knowledge Apple Shortcut from an exported template")
    parser.add_argument("template", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.template, args.output)
    print(args.output)


if __name__ == "__main__":
    main()
