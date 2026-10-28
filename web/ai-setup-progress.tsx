import { Check } from "lucide-react";
import { ActionButton, cx } from "./components/ui/primitives";
import type {
  AiDraftSelections,
  AiProviderState,
  AiTestState,
  AiTestTask,
} from "./shared/types";

export type AiSetupStepId = "credentials" | "tasks" | "save" | "test";

export type AiSetupStep = {
  id: AiSetupStepId;
  title: string;
  detail: string;
  action: string | null;
};

type StepState = "done" | "current" | "todo";

const stepLabels: Record<AiSetupStepId, string> = {
  credentials: "Connect a provider",
  tasks: "Assign tasks",
  save: "Save changes",
  test: "Test (optional)",
};

const stepOrder: AiSetupStepId[] = ["credentials", "tasks", "save", "test"];

/**
 * The next thing standing between this account and working AI: credentials,
 * then task assignment, then saving, then an optional live test. Null when
 * nothing is left to do.
 */
export function nextAiSetupStep(
  state: AiProviderState,
  draft: AiDraftSelections,
  dirty: boolean,
  tests: Record<AiTestTask, AiTestState>,
): AiSetupStep | null {
  const connected = state.providers.filter((provider) => provider.connected);
  const broken = state.providers.find(
    (provider) => !provider.connected && provider.status === "needs_attention",
  );
  const canTranscribe = connected.some(
    (provider) => provider.capabilities.transcription,
  );
  if (!connected.length || (broken && !state.readiness.capture))
    return {
      id: "credentials",
      title: broken
        ? `Reconnect ${broken.name}`
        : "Connect an AI provider",
      detail: broken
        ? `The saved ${broken.name} key stopped working. Add a new key, then check your task models.`
        : "Add an API key in Providers. It is verified before it is saved and never shown again.",
      action: broken ? `Reconnect ${broken.name}` : "Connect a provider",
    };
  if (!draft.transcription || !draft.analysis) {
    const missing = !draft.transcription ? "Transcription" : "Analysis";
    return {
      id: "tasks",
      title: `Choose ${missing === "Analysis" ? "an" : "a"} ${missing} model`,
      detail:
        !draft.transcription && !canTranscribe
          ? "Transcription needs an OpenAI key. Connect OpenAI, then choose its model under Task models."
          : !draft.transcription
            ? "Transcription turns saved videos into searchable text. Pick a provider and model under Task models."
            : "Analysis writes summaries and topics, and powers Ask. Pick a provider and model under Task models.",
      action:
        !draft.transcription && !canTranscribe
          ? "Connect OpenAI"
          : "Choose models",
    };
  }
  if (dirty)
    return {
      id: "save",
      title: "Save your task model changes",
      detail:
        "New captures and Ask keep using the saved settings until you save.",
      action: "Review changes",
    };
  const tested = (["analysis", "ask"] as const).every(
    (task) => tests[task].status === "complete" && tests[task].result?.ok,
  );
  if (!tested)
    return {
      id: "test",
      title: "Optional: test your setup",
      detail:
        "Everything is assigned and saved. A quick test confirms the provider responds; it uses a little of your provider credit.",
      action: "Run a test",
    };
  return null;
}

export function AiSetupProgress({
  step,
  ready,
  onAction,
}: {
  step: AiSetupStep | null;
  ready: boolean;
  onAction: (step: AiSetupStep) => void;
}) {
  const current = step ? stepOrder.indexOf(step.id) : stepOrder.length;
  const stateOf = (index: number): StepState =>
    index < current ? "done" : index === current ? "current" : "todo";
  return (
    <section className="st-progress" aria-labelledby="st-progress-title">
      <ol className="st-progress-steps" aria-label="AI setup steps">
        {stepOrder.map((id, index) => {
          const state = stateOf(index);
          return (
            <li
              key={id}
              className={cx("st-progress-step", `st-progress-${state}`)}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="st-progress-mark" aria-hidden="true">
                {state === "done" ? <Check size={11} strokeWidth={3} /> : index + 1}
              </span>
              <span>{stepLabels[id]}</span>
              <span className="sr-only">
                {state === "done"
                  ? " (done)"
                  : state === "current"
                    ? " (next)"
                    : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="st-progress-body">
        <div className="st-progress-text">
          <h2 id="st-progress-title">
            {step
              ? step.title
              : ready
                ? "AI is set up"
                : "AI setup is saved"}
          </h2>
          <p>
            {step
              ? step.detail
              : ready
                ? "New captures are processed and Ask can answer from your archive."
                : "Your task models are saved. If captures still can't run, check each provider's status above."}
          </p>
        </div>
        {step?.action && (
          <ActionButton
            variant={step.id === "test" ? "default" : "primary"}
            onClick={() => onAction(step)}
          >
            {step.action}
          </ActionButton>
        )}
      </div>
    </section>
  );
}
