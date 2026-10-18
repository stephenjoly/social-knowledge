import { FormEvent, useEffect, useState } from "react";
import type {
  AiProvider,
  AiSelection,
  AiAnalysisSelection,
  AiProviderState,
  InvitationDetails,
  DemoAccount,
} from "../shared/types";
import { api } from "../shared/api";
import { transcriptionOptions, analysisOptions } from "../shared/format";

function savedOrFirstTaskModel(
  state: AiProviderState,
  provider: AiProvider,
  task: "transcription" | "analysis",
) {
  const current = state.selections[task];
  const options =
    task === "transcription"
      ? transcriptionOptions(provider)
      : analysisOptions(provider);
  const saved =
    current?.provider === provider.id &&
    options.some((option) => option.model === current.model)
      ? current
      : null;
  const model = saved?.model ?? options[0]?.model ?? null;
  if (!model) return null;
  return {
    model,
    thinkingLevel:
      task === "analysis"
        ? (saved as AiAnalysisSelection | null)?.thinkingLevel ?? null
        : null,
  };
}

function RegistrationForm({
  setup,
  inviteToken,
  invite,
  onDone,
}: {
  setup?: boolean;
  inviteToken?: string;
  invite?: InvitationDetails | null;
  onDone: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const isAdministrator = setup || invite?.role === "admin";
  const heading = setup
    ? "Create your private archive"
    : invite?.role === "admin"
      ? "Join as an administrator"
      : "Join this private archive";
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    if (isAdministrator && !acknowledged) {
      setError(
        "Confirm that you understand this account has administrator access.",
      );
      return;
    }
    try {
      await api(setup ? "/api/auth/setup" : "/api/auth/invitations/redeem", {
        method: "POST",
        body: JSON.stringify({
          username,
          password,
          ...(setup ? { administratorAcknowledged: acknowledged } : {}),
          ...(inviteToken
            ? { token: inviteToken, administratorAcknowledged: acknowledged }
            : {}),
        }),
      });
      onDone();
    } catch (e) {
      const code = (e as { body?: { error?: string } }).body?.error;
      setError(
        code === "setup_complete"
          ? "An administrator account has already been created. Sign in instead."
          : code === "invalid_invitation"
            ? "This invitation is no longer valid. Ask an administrator for a new link."
            : e instanceof Error
              ? e.message
              : "Unable to create your account.",
      );
    }
  }
  return (
    <main className="auth">
      <section className="auth-card">
        <div className="auth-wordmark">social knowledge</div>
        <h1>{heading}</h1>
        <p>
          {setup
            ? "Your first account manages access to this archive. Connect an AI provider next, or set it up later."
            : isAdministrator
              ? "This invitation grants administrator access. Administrators can invite others, but cannot see their private archive data."
              : "Choose your own sign-in details. Your saved archive stays private to your account."}
        </p>
        <form onSubmit={submit}>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              minLength={2}
              maxLength={40}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={12}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              minLength={12}
              autoComplete="new-password"
              required
            />
          </label>
          {isAdministrator && (
            <label>
              <span className="auth-acknowledgement">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                I understand this is an administrator account and can manage
                access to this archive.
              </span>
            </label>
          )}
          <button>Create account</button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}

export function Auth({
  setup,
  inviteToken,
  onDone,
}: {
  setup: boolean;
  inviteToken: string | null;
  onDone: (created?: boolean) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  const [invite, setInvite] = useState<InvitationDetails | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(Boolean(inviteToken));
  useEffect(() => {
    if (!inviteToken) return;
    void api<{ invitation: InvitationDetails }>(
      "/api/auth/invitations/inspect",
      {
        method: "POST",
        body: JSON.stringify({ token: inviteToken }),
      },
    )
      .then((result) => setInvite(result.invitation))
      .catch(() =>
        setError(
          "This invitation is no longer valid. Ask an administrator for a new link.",
        ),
      )
      .finally(() => setLoadingInvite(false));
  }, [inviteToken]);
  useEffect(() => {
    if (setup || inviteToken) return;
    void api<{ accounts: DemoAccount[] }>("/api/auth/demo-accounts")
      .then((result) => setDemoAccounts(result.accounts))
      .catch(() => setDemoAccounts([]));
  }, [setup, inviteToken]);
  if (setup || (inviteToken && invite))
    return (
      <RegistrationForm
        setup={setup}
        inviteToken={inviteToken ?? undefined}
        invite={invite}
        onDone={() => onDone(true)}
      />
    );
  if (inviteToken && loadingInvite)
    return (
      <main className="auth">
        <p>Checking invitation…</p>
      </main>
    );
  if (inviteToken && error)
    return (
      <main className="auth">
        <section className="auth-card">
          <h1>Invitation unavailable</h1>
          <p className="error" role="alert">
            {error}
          </p>
        </section>
      </main>
    );
  async function login(loginUsername: string, loginPassword: string) {
    setError("");
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword,
        }),
      });
      onDone(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? "Incorrect username or password."
          : "Unable to sign in.",
      );
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await login(username, password);
  }
  return (
    <main className="auth">
      <section className="auth-card">
        <div className="auth-wordmark">social knowledge</div>
        <h1>Welcome back</h1>
        <p>Sign in to your Social Knowledge archive.</p>
        <form onSubmit={submit}>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button>Continue</button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
        {!!demoAccounts.length && (
          <section
            className="demo-accounts"
            aria-labelledby="demo-accounts-title"
          >
            <h2 id="demo-accounts-title">Test accounts</h2>
            {demoAccounts.map((account) => (
              <article key={account.username}>
                <div>
                  <strong>
                    {account.role === "admin"
                      ? "Demo administrator"
                      : "Demo member"}
                  </strong>
                  <span>{account.username}</span>
                  <code>{account.password}</code>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void login(account.username, account.password)}
                >
                  Use account
                </button>
              </article>
            ))}
            <small>
              Synthetic test accounts only. Never store real information here.
            </small>
          </section>
        )}
      </section>
    </main>
  );
}

export function ProviderOnboarding({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<AiProviderState | null>(null);
  const [step, setStep] = useState<"transcription" | "analysis">(
    "transcription",
  );
  const [provider, setProvider] = useState<"openai" | "cerebras">("openai");
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    void api<AiProviderState>("/api/v1/ai-providers").then((result) => {
      setState(result);
      if (result.selections.transcription) setStep("analysis");
    });
  }, []);
  const selectedProvider = state?.providers.find(
    (item) => item.id === provider,
  );
  async function choose(
    selection: "transcription" | "analysis",
    selectedProvider: AiSelection["provider"],
    definition: AiProvider,
    previousState: AiProviderState,
  ) {
    const savedSelection = savedOrFirstTaskModel(
      previousState,
      definition,
      selection,
    );
    if (!savedSelection) throw new Error("model_unavailable");
    const result = await api<AiProviderState>("/api/v1/ai-settings", {
      method: "PUT",
      body: JSON.stringify({
        [selection]: {
          provider: selectedProvider,
          model: savedSelection.model,
          ...(selection === "analysis"
            ? { thinkingLevel: savedSelection.thinkingLevel }
            : {}),
        },
      }),
    });
    setState(result);
    return result;
  }
  return (
    <main className="auth">
      <section className="auth-card onboarding-card">
        <div className="auth-wordmark">social knowledge</div>
        <p className="step-label">
          Step {step === "transcription" ? "1" : "2"} of 2
        </p>
        <h1>
          {step === "transcription"
            ? "Transcribe your captures"
            : "Analyze your archive"}
        </h1>
        <p>
          {step === "transcription"
            ? "Connect OpenAI to turn reel audio into searchable text."
            : "Choose the provider that summarizes captures and answers questions."}{" "}
          Keys are encrypted and verified before they are saved.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setSubmitting(true);
            setMessage("Testing the key with the provider…");
            try {
              let result = state!;
              if (!selectedProvider?.connected) {
                result = await api<AiProviderState>(
                  `/api/v1/ai-providers/${provider}`,
                  { method: "PUT", body: JSON.stringify({ apiKey }) },
                );
                setState(result);
              }
              const definition = result.providers.find(
                (item) => item.id === provider,
              )!;
              result = await choose(step, provider, definition, result);
              setApiKey("");
              if (step === "transcription") {
                setStep("analysis");
                setProvider(
                  result.providers.find((item) => item.id === "openai")
                    ?.connected
                    ? "openai"
                    : "cerebras",
                );
                setMessage(
                  "Transcription is ready. Now choose how to analyze your archive.",
                );
              } else onDone();
            } catch (error) {
              setMessage(
                (error as { body?: { error?: string } }).body?.error ===
                  "invalid_api_key"
                  ? "The provider rejected that API key. Check it and try again."
                  : "The provider could not be reached. Try again shortly.",
              );
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {step === "analysis" && (
            <label>
              Analysis provider
              <select
                value={provider}
                onChange={(event) => {
                  setProvider(event.target.value as "openai" | "cerebras");
                  setApiKey("");
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="cerebras">Cerebras</option>
              </select>
            </label>
          )}
          {selectedProvider && (
            <p className="model-choice">
              <span>
                {step === "transcription"
                  ? "Transcription model"
                  : "Analysis model"}
              </span>
              <strong>
                {state
                  ? savedOrFirstTaskModel(state, selectedProvider, step)?.model
                  : null}
              </strong>
            </p>
          )}
          {selectedProvider?.connected ? (
            <p className="connected-choice">
              <strong>{selectedProvider.name} connected</strong>
              <span>
                {selectedProvider.keyHint} · no need to enter the key again
              </span>
            </p>
          ) : (
            <label>
              {provider === "cerebras" ? "Cerebras" : "OpenAI"} API key
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                autoComplete="off"
                placeholder="Paste API key"
                required
              />
            </label>
          )}
          <button disabled={submitting || !state}>
            {submitting
              ? "Verifying…"
              : step === "transcription"
                ? "Connect transcription"
                : "Use for analysis"}
          </button>
          <button type="button" className="secondary-button" onClick={onDone}>
            Set up later
          </button>
          <p className="settings-help">
            Capture needs transcription and analysis. Ask only needs analysis.
            You can finish either setup in Settings.
          </p>
          {message && (
            <p className="action-feedback" role="status">
              {message}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
