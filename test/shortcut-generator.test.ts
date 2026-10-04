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
    expect(conditions).toBe(poll ? 6 : 3);
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
    expect(detector?.WFWorkflowActionParameters.WFInput).toMatchObject({ Type: "Variable", Variable: { WFSerializationType: "WFTextTokenAttachment", Value: { Type: "ExtensionInput" } } });
  });
});
