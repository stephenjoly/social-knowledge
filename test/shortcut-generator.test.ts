import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Action = { WFWorkflowActionIdentifier: string; WFWorkflowActionParameters: Record<string, unknown> };
type Workflow = { WFWorkflowActions: Action[]; WFWorkflowImportQuestions: Array<{ ActionIndex: number; ParameterKey: string }> };
function build(poll: boolean): Workflow {
  const source = `import importlib.util,json,sys
s=importlib.util.spec_from_file_location("builder",sys.argv[1])
m=importlib.util.module_from_spec(s)
s.loader.exec_module(m)
print(json.dumps(m.build("https://service.example/api/v1/jobs",poll=sys.argv[2]=="true")))`;
  return JSON.parse(execFileSync("python3", ["-c", source, path.join(process.cwd(), "scripts/build-shortcut.py"), String(poll)], { encoding: "utf8" })) as Workflow;
}
describe("native Shortcut serialization", () => {
  it.each([false, true])("uses bound, typed If inputs in polling mode %s", (poll) => {
    const workflow = build(poll);
    const outputs = new Map<string, Action>();
    let conditions = 0;
    for (const action of workflow.WFWorkflowActions) {
      const p = action.WFWorkflowActionParameters;
      if (action.WFWorkflowActionIdentifier === "is.workflow.actions.conditional" && p.WFControlFlowMode === 0) {
        conditions++;
        // Apple If requires WFContentItemFilter's Variable wrapper. A bare
        // attachment is valid for many actions but imports as a blank If chip.
        const input = p.WFInput as { Type: string; Variable: { WFSerializationType: string; Value: { Type: string; OutputUUID: string } } };
        expect(input.Type).toBe("Variable");
        expect(input.Variable.WFSerializationType).toBe("WFTextTokenAttachment");
        expect(input.Variable.Value.Type).toBe("ActionOutput");
        const producer = outputs.get(input.Variable.Value.OutputUUID);
        expect(producer).toBeDefined();
        if (p.WFCondition === 4) {
          expect(producer?.WFWorkflowActionIdentifier).toBe("is.workflow.actions.gettext");
          expect(["complete", "failed"]).toContain(p.WFConditionalActionString);
        } else {
          expect(p.WFCondition).toBe(100);
          expect(p).not.toHaveProperty("WFConditionalActionString");
        }
      }
      if (typeof p.UUID === "string") outputs.set(p.UUID, action);
    }
    expect(conditions).toBe(poll ? 8 : 5);
  });
  it("wires import setup to the key Text action and avoids completion calls in receipt-only mode", () => {
    const workflow = build(false);
    const question = workflow.WFWorkflowImportQuestions[0]!;
    expect(question.ParameterKey).toBe("WFTextActionText");
    expect(workflow.WFWorkflowActions[question.ActionIndex]).toMatchObject({ WFWorkflowActionIdentifier: "is.workflow.actions.gettext", WFWorkflowActionParameters: { WFTextActionText: "PASTE_API_KEY_HERE" } });
    const requests = workflow.WFWorkflowActions.filter((a) => a.WFWorkflowActionIdentifier === "is.workflow.actions.downloadurl");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.WFWorkflowActionParameters.WFHTTPMethod).toBe("POST");
    const detector = workflow.WFWorkflowActions.find((a) => a.WFWorkflowActionIdentifier === "is.workflow.actions.detect.link");
    expect(detector?.WFWorkflowActionParameters.WFInput).toEqual({ WFSerializationType: "WFTextTokenString", Value: { string: "\ufffc", attachmentsByRange: { "{0, 1}": { Type: "ExtensionInput" } } } });
    expect(detector?.WFWorkflowActionParameters.WFInput).not.toHaveProperty("Variable");
  });
});


describe("Shortcut submission input", () => {
  it.each([false, true])("prompts for missing shared input and gates a text JSON URL in polling mode %s", (poll) => {
    const workflow = build(poll);
    const actions = workflow.WFWorkflowActions;
    const detectors = actions.filter((a) => a.WFWorkflowActionIdentifier === "is.workflow.actions.detect.link");
    expect(detectors).toHaveLength(2);
    expect(detectors[1]?.WFWorkflowActionParameters.WFInput).toEqual({ WFSerializationType: "WFTextTokenString", Value: { string: "\ufffc", attachmentsByRange: { "{0, 1}": { Type: "Variable", VariableName: "Submitted URL" } } } });
    // Native execution verified these text parameters require token strings.
    // Both bare attachments and If wrappers import as blank URL inputs.
    expect(detectors.every((a) => !("Variable" in (a.WFWorkflowActionParameters.WFInput as object)))).toBe(true);
    const promptIndex = actions.findIndex((a) => a.WFWorkflowActionIdentifier === "is.workflow.actions.ask");
    expect(promptIndex).toBeGreaterThan(0);
    expect(actions[promptIndex]?.WFWorkflowActionParameters).toMatchObject({ WFInputType: "Text", WFAskActionPrompt: "Paste the reel or page URL to save" });
    const opening = actions.findIndex((a) => a.WFWorkflowActionIdentifier === "is.workflow.actions.conditional" && a.WFWorkflowActionParameters.WFControlFlowMode === 0);
    const group = actions[opening]!.WFWorkflowActionParameters.GroupingIdentifier;
    const otherwise = actions.findIndex((a) => a.WFWorkflowActionParameters.GroupingIdentifier === group && a.WFWorkflowActionParameters.WFControlFlowMode === 1);
    const end = actions.findIndex((a) => a.WFWorkflowActionParameters.GroupingIdentifier === group && a.WFWorkflowActionParameters.WFControlFlowMode === 2);
    expect(otherwise).toBeLessThan(promptIndex);
    expect(promptIndex).toBeLessThan(end);
    const setters = actions.filter((a) => a.WFWorkflowActionIdentifier === "is.workflow.actions.setvariable");
    expect(setters).toHaveLength(2);
    expect(setters.every((a) => a.WFWorkflowActionParameters.WFVariableName === "Submitted URL")).toBe(true);
    const requestIndex = actions.findIndex((a) => a.WFWorkflowActionIdentifier === "is.workflow.actions.downloadurl");
    const request = actions[requestIndex]!.WFWorkflowActionParameters;
    const fields = request.WFJSONValues as { Value: { WFDictionaryFieldValueItems: Array<{ WFItemType: number; WFKey: { Value: { string: string } }; WFValue: { Value: { string: string; attachmentsByRange: Record<string, { OutputUUID: string }> } } }> } };
    const field = fields.Value.WFDictionaryFieldValueItems[0]!;
    expect(field.WFItemType).toBe(0);
    expect(field.WFKey.Value.string).toBe("url");
    expect(field.WFValue.Value.string).toBe("\ufffc");
    const producerId = field.WFValue.Value.attachmentsByRange["{0, 1}"]!.OutputUUID;
    const producerIndex = actions.findIndex((a) => a.WFWorkflowActionParameters.UUID === producerId);
    expect(producerIndex).toBeGreaterThan(end);
    expect(actions[producerIndex]?.WFWorkflowActionIdentifier).toBe("is.workflow.actions.gettext");
    const secure = actions.slice(end + 1, producerIndex).find((a) => a.WFWorkflowActionIdentifier === "is.workflow.actions.text.replace");
    expect(secure?.WFWorkflowActionParameters).toMatchObject({
      WFReplaceTextFind: "^http://", WFReplaceTextReplace: "https://",
      WFReplaceTextRegularExpression: true, WFReplaceTextCaseSensitive: false,
      WFInput: { WFSerializationType: "WFTextTokenString" },
    });
    expect(actions[producerIndex]?.WFWorkflowActionParameters.WFTextActionText).toMatchObject({
      Value: { attachmentsByRange: { "{0, 1}": { OutputUUID: secure?.WFWorkflowActionParameters.UUID } } },
    });
    const detector = actions.slice(end + 1, producerIndex).find((a) => a.WFWorkflowActionIdentifier === "is.workflow.actions.detect.link")!;
    const guard = actions.slice(end + 1, producerIndex).find((a) => a.WFWorkflowActionIdentifier === "is.workflow.actions.conditional");
    expect(guard?.WFWorkflowActionParameters).toMatchObject({ WFCondition: 100, WFControlFlowMode: 0, WFInput: { Variable: { Value: { OutputUUID: detector.WFWorkflowActionParameters.UUID } } } });
    // Both item selections must sit inside a matching URL-list existence guard.
    // Otherwise an empty input could fail at Get First Item before the prompt.
    for (const [index, action] of actions.entries()) {
      if (action.WFWorkflowActionIdentifier !== "is.workflow.actions.getitemfromlist") continue;
      const source = (action.WFWorkflowActionParameters.WFInput as { Value: { OutputUUID: string } }).Value.OutputUUID;
      const enclosing = actions.slice(0, index).find((a) => a.WFWorkflowActionIdentifier === "is.workflow.actions.conditional" && a.WFWorkflowActionParameters.WFControlFlowMode === 0 && (a.WFWorkflowActionParameters.WFInput as { Variable: { Value: { OutputUUID: string } } }).Variable.Value.OutputUUID === source);
      expect(enclosing).toBeDefined();
      const closing = actions.findIndex((a) => a.WFWorkflowActionParameters.GroupingIdentifier === enclosing!.WFWorkflowActionParameters.GroupingIdentifier && a.WFWorkflowActionParameters.WFControlFlowMode === 2);
      expect(index).toBeLessThan(closing);
    }
    const guardGroup = guard!.WFWorkflowActionParameters.GroupingIdentifier;
    const guardEnd = actions.findIndex((a) => a.WFWorkflowActionParameters.GroupingIdentifier === guardGroup && a.WFWorkflowActionParameters.WFControlFlowMode === 2);
    expect(guardEnd).toBeGreaterThan(requestIndex);
    expect(actions[guardEnd + 1]?.WFWorkflowActionParameters.Text).toContain("Nothing was sent");
  });
});


describe("distributed v6 Shortcut graphs", () => {
  it("ships the native-tested graph with only deployment configuration changed", () => {
    const verify = `import hashlib, importlib.util, json, plistlib, re
from pathlib import Path
spec=importlib.util.spec_from_file_location("builder", "scripts/build-shortcut.py")
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
def canonical(value):
    ids={}
    def visit(v):
        if isinstance(v,dict):return {k:visit(v[k]) for k in sorted(v)}
        if isinstance(v,list):return [visit(x) for x in v]
        if isinstance(v,str) and re.fullmatch(r"[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}",v):
            if v not in ids:ids[v]=str(len(ids))
            return ids[v]
        return v
    return visit(value)
endpoint="https://social-knowledge.stephenjoly.net/api/v1/jobs"
for variant in ("receipt","completion"):
    public=plistlib.loads(Path(f"shortcuts/templates/{variant}-v6.plist").read_bytes())
    probe=plistlib.loads(Path(f"test/fixtures/shortcuts/{variant}-v6-probe.plist").read_bytes())
    assert canonical(public)==canonical(m.build(endpoint,poll=variant=="completion"))
    public["WFWorkflowActions"][2]["WFWorkflowActionParameters"]["WFTextActionText"]="LOCAL_TEST_PLACEHOLDER"
    public["WFWorkflowImportQuestions"]=[]
    for action in public["WFWorkflowActions"]:
        p=action["WFWorkflowActionParameters"]
        if action["WFWorkflowActionIdentifier"]=="is.workflow.actions.downloadurl":
            if p["WFHTTPMethod"]=="POST":p["WFURL"]="http://127.0.0.1:18787/api/v1/jobs"
            else:
                v=p["WFURL"]["Value"]
                v["string"]=v["string"].replace("https://social-knowledge.stephenjoly.net","http://127.0.0.1:18787")
                v["attachmentsByRange"]={"{%d, 1}"%v["string"].index(chr(0xfffc)):next(iter(v["attachmentsByRange"].values()))}
    assert public==probe,variant
manifest=json.loads(Path("shortcuts/manifest.json").read_text())
assert manifest["version"]==6
for artifact in manifest["files"]:
    for kind in ("source","download"):
        assert hashlib.sha256((Path("shortcuts")/artifact[kind]).read_bytes()).hexdigest()==artifact[kind+"Sha256"]
assert hashlib.sha256((Path("shortcuts")/manifest["nativeEvidence"]).read_bytes()).hexdigest()==manifest["nativeEvidenceSha256"]
print("native graph parity passed")`;
    expect(execFileSync("python3", ["-c", verify], { encoding: "utf8" })).toContain("native graph parity passed");
  });
});
