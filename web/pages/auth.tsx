import {
  FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";
import { Eye, EyeOff, LibraryBig, Lock } from "lucide-react";
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

/** Accepts a pasted invitation URL (`…/#invite=TOKEN`) or the bare token. */
export function invitationTokenFrom(value: string): string | null {
  const trimmed = value.trim();
  const hashIndex = trimmed.indexOf("#");
  const token =
    hashIndex >= 0
      ? new URLSearchParams(trimmed.slice(hashIndex + 1)).get("invite")
      : trimmed;
  return token && /^[A-Za-z0-9_-]{32,200}$/.test(token) ? token : null;
}

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth">
      <div className="auth-stack">
        <section className="auth-card">
          {children}
        </section>
        <p className="auth-privacy">
          <Lock size={13} aria-hidden="true" focusable="false" />
          Private by design. Only you can see your archive.
        </p>
      </div>
    </main>
  );
}

function AuthHeading({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <span className="auth-mark" aria-hidden="true">
        <LibraryBig size={18} focusable="false" />
      </span>
      <div className="auth-heading">
        {kicker && <span className="auth-kicker">{kicker}</span>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
    </>
  );
}

function AuthField({
  label,
  children,
}: {
  label: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="auth-field">
      <label className="auth-field-label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="auth-input">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        minLength={minLength}
        required
      />
      <button
        type="button"
        className="auth-reveal"
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <EyeOff size={16} aria-hidden="true" focusable="false" />
        ) : (
          <Eye size={16} aria-hidden="true" focusable="false" />
        )}
        <span className="sr-only">
          {visible ? "Hide password" : "Show password"}
        </span>
      </button>
    </span>
  );
}

function RegistrationForm({
  setup,
  inviteToken,
  invite,
  onDone,
  onSignIn,
}: {
  setup?: boolean;
  inviteToken?: string;
  invite?: InvitationDetails | null;
  onDone: () => void;
  onSignIn?: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
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
    setSubmitting(true);
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
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <AuthLayout>
      <AuthHeading title={heading}>
        {setup
          ? "Your first account manages access to this archive. Connect an AI provider next, or set it up later."
          : isAdministrator
            ? "This invitation grants administrator access. Administrators can invite others, but cannot see their private archive data."
            : "Choose your own sign-in details. Your saved archive stays private to your account."}
      </AuthHeading>
      <form className="auth-form" onSubmit={submit}>
        <AuthField label="Username">
          {(id) => (
            <span className="auth-input">
              <input
                id={id}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                minLength={2}
                maxLength={40}
                required
              />
            </span>
          )}
        </AuthField>
        <AuthField label="Password">
          {(id) => (
            <PasswordInput
              id={id}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              minLength={12}
            />
          )}
        </AuthField>
        <AuthField label="Confirm password">
          {(id) => (
            <PasswordInput
              id={id}
              value={confirmation}
              onChange={setConfirmation}
              autoComplete="new-password"
              minLength={12}
            />
          )}
        </AuthField>
        {isAdministrator && (
          <label className="auth-acknowledgement">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              I understand this is an administrator account and can manage
              access to this archive.
            </span>
          </label>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="auth-primary" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
      {onSignIn && (
        <p className="auth-footer">
          Already have an account?
          <button type="button" className="auth-link" onClick={onSignIn}>
            Sign in
          </button>
        </p>
      )}
    </AuthLayout>
  );
}

function InvitationLinkForm({
  onInvitation,
  onCancel,
}: {
  onInvitation: (token: string) => void;
  onCancel: () => void;
}) {
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  return (
    <AuthLayout>
      <AuthHeading title="Create your account">
        Paste the invitation link an administrator sent you.
      </AuthHeading>
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          const token = invitationTokenFrom(link);
          if (!token) {
            setError("That does not look like an invitation link.");
            return;
          }
          onInvitation(token);
        }}
      >
        <AuthField label="Invitation link">
          {(id) => (
            <span className="auth-input">
              <input
                id={id}
                value={link}
                onChange={(event) => setLink(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                required
              />
            </span>
          )}
        </AuthField>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="auth-primary">
          Continue
        </button>
      </form>
      <p className="auth-footer">
        Already have an account?
        <button type="button" className="auth-link" onClick={onCancel}>
          Sign in
        </button>
      </p>
    </AuthLayout>
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
  const [submitting, setSubmitting] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  const [pastedToken, setPastedToken] = useState<string | null>(null);
  const [enteringInvitation, setEnteringInvitation] = useState(false);
  const token = inviteToken ?? pastedToken;
  const [invite, setInvite] = useState<InvitationDetails | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [loadingInvite, setLoadingInvite] = useState(Boolean(inviteToken));
  useEffect(() => {
    if (!token) return;
    setLoadingInvite(true);
    setInvite(null);
    setInviteError("");
    void api<{ invitation: InvitationDetails }>(
      "/api/auth/invitations/inspect",
      {
        method: "POST",
        body: JSON.stringify({ token }),
      },
    )
      .then((result) => setInvite(result.invitation))
      .catch(() =>
        setInviteError(
          "This invitation is no longer valid. Ask an administrator for a new link.",
        ),
      )
      .finally(() => setLoadingInvite(false));
  }, [token]);
  useEffect(() => {
    if (setup || inviteToken) return;
    void api<{ accounts: DemoAccount[] }>("/api/auth/demo-accounts")
      .then((result) => setDemoAccounts(result.accounts))
      .catch(() => setDemoAccounts([]));
  }, [setup, inviteToken]);
  const backToSignIn = inviteToken
    ? undefined
    : () => {
        setPastedToken(null);
        setEnteringInvitation(false);
        setInvite(null);
        setInviteError("");
      };
  if (setup || (token && invite))
    return (
      <RegistrationForm
        setup={setup}
        inviteToken={token ?? undefined}
        invite={invite}
        onDone={() => onDone(true)}
        {...(setup || !backToSignIn ? {} : { onSignIn: backToSignIn })}
      />
    );
  if (token && loadingInvite)
    return (
      <AuthLayout>
        <AuthHeading title="Checking invitation…" />
        <p className="auth-status" role="status">
          Confirming that this link is still valid.
        </p>
      </AuthLayout>
    );
  if (token && inviteError)
    return (
      <AuthLayout>
        <AuthHeading title="Invitation unavailable" />
        <p className="auth-error" role="alert">
          {inviteError}
        </p>
        {backToSignIn && (
          <p className="auth-footer">
            <button type="button" className="auth-link" onClick={backToSignIn}>
              Back to sign in
            </button>
          </p>
        )}
      </AuthLayout>
    );
  if (enteringInvitation)
    return (
      <InvitationLinkForm
        onInvitation={(value) => setPastedToken(value)}
        onCancel={() => setEnteringInvitation(false)}
      />
    );
  async function login(loginUsername: string, loginPassword: string) {
    setError("");
    setSubmitting(true);
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
    } finally {
      setSubmitting(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await login(username, password);
  }
  return (
    <AuthLayout>
      <AuthHeading title="Welcome back">
        Sign in to your private social knowledge archive.
      </AuthHeading>
      <form className="auth-form" onSubmit={submit}>
        <AuthField label="Username">
          {(id) => (
            <span className="auth-input">
              <input
                id={id}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </span>
          )}
        </AuthField>
        <AuthField label="Password">
          {(id) => (
            <PasswordInput
              id={id}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
          )}
        </AuthField>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="auth-primary" disabled={submitting}>
          Continue
        </button>
      </form>
      <p className="auth-footer">
        Have an invitation link?
        <button
          type="button"
          className="auth-link"
          onClick={() => setEnteringInvitation(true)}
        >
          Create your account
        </button>
      </p>
      {!!demoAccounts.length && (
        <section
          className="auth-demo-accounts"
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
                className="auth-secondary"
                disabled={submitting}
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
    </AuthLayout>
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
    <AuthLayout>
      <AuthHeading
        kicker={`Step ${step === "transcription" ? "1" : "2"} of 2`}
        title={
          step === "transcription"
            ? "Transcribe your captures"
            : "Analyze your archive"
        }
      >
        {step === "transcription"
          ? "Connect OpenAI to turn reel audio into searchable text."
          : "Choose the provider that summarizes captures and answers questions."}{" "}
        Keys are encrypted and verified before they are saved.
      </AuthHeading>
      <form
        className="auth-form"
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
          <AuthField label="Analysis provider">
            {(id) => (
              <span className="auth-input auth-select">
                <select
                  id={id}
                  value={provider}
                  onChange={(event) => {
                    setProvider(event.target.value as "openai" | "cerebras");
                    setApiKey("");
                  }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="cerebras">Cerebras</option>
                </select>
              </span>
            )}
          </AuthField>
        )}
        {selectedProvider && (
          <p className="auth-note-row">
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
          <p className="auth-note-row auth-note-ok">
            <strong>{selectedProvider.name} connected</strong>
            <span>
              {selectedProvider.keyHint} · no need to enter the key again
            </span>
          </p>
        ) : (
          <AuthField
            label={`${provider === "cerebras" ? "Cerebras" : "OpenAI"} API key`}
          >
            {(id) => (
              <span className="auth-input">
                <input
                  id={id}
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  autoComplete="off"
                  placeholder="Paste API key"
                  required
                />
              </span>
            )}
          </AuthField>
        )}
        {message && (
          <p className="auth-status" role="status">
            {message}
          </p>
        )}
        <button
          type="submit"
          className="auth-primary"
          disabled={submitting || !state}
        >
          {submitting
            ? "Verifying…"
            : step === "transcription"
              ? "Connect transcription"
              : "Use for analysis"}
        </button>
        <button type="button" className="auth-secondary" onClick={onDone}>
          Set up later
        </button>
      </form>
      <p className="auth-help">
        Capture needs transcription and analysis. Ask only needs analysis. You
        can finish either setup in Settings.
      </p>
    </AuthLayout>
  );
}
