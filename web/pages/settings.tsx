import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Bot,
  ChevronRight,
  Database,
  DatabaseBackup,
  KeyRound,
  Link2,
  ShieldCheck,
  Settings as SettingsIcon,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { MyAccount, PeopleAccess, type AccountUser } from "../account-settings";
import { ShortcutSetup } from "../shortcut-setup";
import type {
  LibraryExport,
  OAuthConnection,
  PlatformConnection,
  ApiKey,
  AiThinkingLevel,
  AiProvider,
  AiSelection,
  AiAnalysisSelection,
  AiProviderState,
  AiDraftSelections,
  AiTestTask,
  AiTestCode,
  AiTestResult,
  AiTestState,
  SettingsTopic,
} from "../shared/types";
import { api } from "../shared/api";
import {
  formatPreciseDuration,
  transcriptionOptions,
  analysisOptions,
} from "../shared/format";
import { PlatformIcon } from "../components/platform";

function taskOptionFor(provider: AiProvider, model: string) {
  return analysisOptions(provider).find((option) => option.model === model) ?? null;
}

function sameAiSelections(left: AiDraftSelections, right: AiDraftSelections) {
  return (
    left.transcription?.provider === right.transcription?.provider &&
    left.transcription?.model === right.transcription?.model &&
    left.analysis?.provider === right.analysis?.provider &&
    left.analysis?.model === right.analysis?.model &&
    left.analysis?.thinkingLevel === right.analysis?.thinkingLevel
  );
}

function selectionsForConnectedProviders(
  selections: AiDraftSelections,
  providers: AiProvider[],
): AiDraftSelections {
  const selectionFor = (task: "transcription" | "analysis") => {
    const selection = selections[task];
    const provider = providers.find((item) => item.id === selection?.provider);
    return provider?.connected && provider.capabilities[task] ? selection : null;
  };
  return {
    transcription: selectionFor("transcription"),
    analysis: selectionFor("analysis") as AiAnalysisSelection | null,
  };
}

function initialAiTestStates(): Record<AiTestTask, AiTestState> {
  return {
    transcription: { result: null, status: "idle" },
    analysis: { result: null, status: "idle" },
    ask: { result: null, status: "idle" },
  };
}

function aiTestGuidance(code: AiTestCode) {
  const copy: Record<Exclude<AiTestCode, "ok">, string> = {
    missing_selection: "Save a provider and model for this task, then test again.",
    invalid_audio: "Choose an audio file up to 1 MB, then test again.",
    unsupported_audio: "Choose a supported audio file, then test again.",
    invalid_audio_data: "Choose a valid audio file, then test again.",
    credential_error: "Reconnect this provider key, then test again.",
    model_error: "Choose an available model, save it, then test again.",
    quota_exceeded: "Add provider credits or increase its quota, then test again.",
    rate_limited: "Wait a moment, then test again.",
    timeout: "The provider did not respond in time. Try again shortly.",
    provider_error: "The provider could not complete this test. Try again shortly.",
    invalid_response: "The provider returned an unexpected result. Try again shortly.",
    busy: "Another connection test is already running. Wait for it to finish.",
  };
  return copy[code as Exclude<AiTestCode, "ok">];
}

function formatAiTestSelection(result: AiTestResult) {
  if (!result.selection) return "saved selection";
  const thinkingLevel = (result.selection as AiAnalysisSelection).thinkingLevel;
  return `${result.selection.provider} · ${result.selection.model}${thinkingLevel ? ` · ${thinkingLevel}` : ""}`;
}

function matchesCurrentTestSelection(
  task: AiTestTask,
  current: AiProviderState | null,
  result: AiTestResult,
) {
  const expected = task === "transcription"
    ? current?.selections.transcription
    : current?.selections.analysis;
  if (!expected || !result.selection) return false;
  if (
    expected.provider !== result.selection.provider ||
    expected.model !== result.selection.model
  )
    return false;
  if (task === "transcription") return true;
  return (expected as AiAnalysisSelection).thinkingLevel ===
    (result.selection as AiAnalysisSelection).thinkingLevel;
}

export function Settings({ user, onUserChange, onSignOut }: { user: AccountUser | null; onUserChange: (user: AccountUser) => void; onSignOut: () => Promise<void> }) {
  const [topic, setTopic] = useState<SettingsTopic>("overview");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("iPhone Shortcut");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [createdKeyId, setCreatedKeyId] = useState<string | null>(null);
  const [defaultLanguage, setDefaultLanguage] = useState("English");
  const [translateForeign, setTranslateForeign] = useState(true);
  const [preferenceMessage, setPreferenceMessage] = useState("");
  const [connections, setConnections] = useState<OAuthConnection[]>([]);
  const [platformConnections, setPlatformConnections] = useState<
    PlatformConnection[]
  >([]);
  const [platformMessage, setPlatformMessage] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [libraryExports, setLibraryExports] = useState<LibraryExport[]>([]);
  const [backupMessage, setBackupMessage] = useState("");
  const [aiState, setAiState] = useState<AiProviderState | null>(null);
  const aiStateRef = useRef<AiProviderState | null>(null);
  const [draftSelections, setDraftSelections] =
    useState<AiDraftSelections | null>(null);
  const [savingAiSelections, setSavingAiSelections] = useState(false);
  const [selectedAiProvider, setSelectedAiProvider] = useState<
    "openai" | "cerebras"
  >("openai");
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const providerDialogTrigger = useRef<HTMLElement | null>(null);
  const [providerApiKey, setProviderApiKey] = useState("");
  const [replaceProviderKey, setReplaceProviderKey] = useState(false);
  const [providerMessage, setProviderMessage] = useState("");
  const [providerMessageKind, setProviderMessageKind] = useState<
    "pending" | "success" | "error"
  >("success");
  const [verifyingProvider, setVerifyingProvider] = useState(false);
  const [testStates, setTestStates] = useState<Record<AiTestTask, AiTestState>>(
    initialAiTestStates,
  );
  const [testingTask, setTestingTask] = useState<AiTestTask | null>(null);
  const [testAudioFile, setTestAudioFile] = useState<File | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const testDialogTrigger = useRef<HTMLElement | null>(null);
  const testDialogPanel = useRef<HTMLElement | null>(null);
  const testGeneration = useRef(0);
  const applyAiState = (nextState: AiProviderState, resetDraft = false) => {
    const previousState = aiStateRef.current;
    aiStateRef.current = nextState;
    setAiState(nextState);
    setDraftSelections((current) =>
      resetDraft ||
      !current ||
      (previousState && sameAiSelections(current, previousState.selections))
        ? nextState.selections
        : selectionsForConnectedProviders(current, nextState.providers),
    );
  };
  const applyProviderDraft = (providerId: AiSelection["provider"]) => {
    const definition = aiStateRef.current?.providers.find(
      (item) => item.id === providerId,
    );
    setSelectedAiProvider(providerId);
    setProviderApiKey("");
    setReplaceProviderKey(!definition?.connected);
  };
  const openProviderDialog = (providerId: AiSelection["provider"]) => {
    providerDialogTrigger.current = document.activeElement as HTMLElement | null;
    applyProviderDraft(providerId);
    setProviderMessage("");
    setProviderDialogOpen(true);
  };
  const closeProviderDialog = () => {
    setProviderApiKey("");
    setReplaceProviderKey(false);
    setProviderDialogOpen(false);
    window.requestAnimationFrame(() => providerDialogTrigger.current?.focus());
  };
  const openTestDialog = () => {
    testDialogTrigger.current = document.activeElement as HTMLElement | null;
    setTestDialogOpen(true);
  };
  const closeTestDialog = () => {
    setTestDialogOpen(false);
    window.requestAnimationFrame(() => testDialogTrigger.current?.focus());
  };
  async function load(showLoading = false) {
    if (showLoading) setLoading(true);
    setLoadError("");
    try {
      const [
        keyResult,
        preferenceResult,
        connectionResult,
        exportResult,
        platformResult,
        aiResult,
      ] = await Promise.all([
        api<{ apiKeys: ApiKey[] }>("/api/v1/api-keys"),
        api<{
          preferences: { defaultLanguage: string; translateForeign: boolean };
        }>("/api/v1/preferences"),
        api<{ connections: OAuthConnection[]; mcpUrl: string }>(
          "/api/v1/oauth/connections",
        ),
        api<{ exports: LibraryExport[] }>("/api/v1/library-exports"),
        api<{ connections: PlatformConnection[] }>(
          "/api/v1/platform-connections",
        ),
        api<AiProviderState>("/api/v1/ai-providers"),
      ]);
      setKeys(keyResult.apiKeys);
      setDefaultLanguage(preferenceResult.preferences.defaultLanguage);
      setTranslateForeign(preferenceResult.preferences.translateForeign);
      setConnections(connectionResult.connections);
      setMcpUrl(connectionResult.mcpUrl);
      setLibraryExports(exportResult.exports);
      setPlatformConnections(platformResult.connections);
      applyAiState(aiResult);
    } catch {
      setLoadError(
        "Settings could not be loaded. Check your connection and try again.",
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }
  useEffect(() => {
    void load(true);
  }, []);
  useEffect(() => {
    if (!testDialogOpen) return;
    const frame = window.requestAnimationFrame(() => testDialogPanel.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [testDialogOpen]);
  useEffect(() => {
    if (!libraryExports.some((item) => item.status === "pending")) {
      if (backupMessage === "Preparing your backup…") {
        setBackupMessage(
          libraryExports[0]?.status === "complete"
            ? "Your backup is ready to download."
            : libraryExports[0]?.status === "failed"
              ? "The backup could not be completed. You can try again."
              : "",
        );
      }
      return;
    }
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, [libraryExports]);
  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await api<{ token: string; apiKey: ApiKey }>(
        "/api/v1/api-keys",
        {
          method: "POST",
          body: JSON.stringify({ name }),
        },
      );
      setToken(result.token);
      setCreatedKeyId(result.apiKey.id);
      setMessage("Copy this key now. It will not be shown again.");
      await load();
    } catch {
      setMessage("The API key could not be created. Try again.");
    }
  }
  async function uploadPlatformCookies(
    platform: PlatformConnection["platform"],
    file: File,
  ) {
    setPlatformMessage(`Checking ${platform} cookies…`);
    try {
      await api(`/api/v1/platform-connections/${platform}`, {
        method: "PUT",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: await file.text(),
      });
      setPlatformMessage(
        `${platform === "instagram" ? "Instagram" : "Facebook"} connected. New captures will use this login when needed.`,
      );
      await load();
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as Error & { body?: { error?: string } }).body?.error
          : null;
      setPlatformMessage(
        code === "no_platform_cookies"
          ? `That file did not contain ${platform} cookies. Export cookies while signed in and try again.`
          : "The cookie file could not be saved. Use a Netscape-format cookies.txt export.",
      );
    }
  }
  function invalidateTests(tasks: AiTestTask[]) {
    testGeneration.current += 1;
    setTestStates((current) => {
      const next = { ...current };
      for (const task of tasks) {
        const state = current[task];
        next[task] = {
          ...state,
          status:
            state.result || state.status === "pending" ? "stale" : "idle",
        };
      }
      return next;
    });
  }
  async function audioData(file: File) {
    const result = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("invalid_audio_data"));
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.readAsDataURL(file);
    });
    const separator = result.indexOf(",");
    if (separator < 0) throw new Error("invalid_audio_data");
    return result.slice(separator + 1);
  }
  function audioContentType(file: File) {
    const aliases: Record<string, string> = {
      "audio/x-m4a": "audio/mp4",
      "audio/x-mp4": "audio/mp4",
      "audio/x-wav": "audio/wav",
      "audio/wave": "audio/wav",
      "audio/x-wave": "audio/wav",
    };
    const contentType = file.type.toLowerCase();
    if (
      ["audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm"].includes(
        contentType,
      )
    )
      return contentType;
    if (aliases[contentType]) return aliases[contentType];
    const extension = file.name.toLowerCase().split(".").pop();
    const typesByExtension: Record<string, string> = {
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      mp4: "audio/mp4",
      ogg: "audio/ogg",
      wav: "audio/wav",
      webm: "audio/webm",
    };
    return typesByExtension[extension ?? ""] ?? contentType;
  }
  async function runAiTest(task: AiTestTask) {
    if (testingTask) return;
    if (aiSettingsDirty || savingAiSelections) return;
    const selection =
      task === "transcription"
        ? aiStateRef.current?.selections.transcription
        : aiStateRef.current?.selections.analysis;
    if (!selection || providerMessageKind === "pending") return;
    const file = task === "transcription" ? testAudioFile : null;
    if (task === "transcription" && !file) return;
    if (file && file.size > 1024 * 1024) {
      setTestStates((current) => ({
        ...current,
        [task]: {
          status: "complete",
          result: {
            ok: false,
            code: "invalid_audio",
            checkedAt: new Date().toISOString(),
            durationMs: 0,
            selection: null,
          },
        },
      }));
      return;
    }
    const generation = testGeneration.current;
    const startedAt = performance.now();
    setTestingTask(task);
    setTestStates((current) => ({
      ...current,
      [task]: { result: null, status: "pending" },
    }));
    try {
      const body = file
        ? {
            audio: {
              contentType: audioContentType(file),
              base64: await audioData(file),
            },
          }
        : {};
      const result = await api<AiTestResult>(`/api/v1/ai-tests/${task}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setTestStates((current) => ({
        ...current,
        [task]:
          generation === testGeneration.current &&
          (!result.ok || matchesCurrentTestSelection(task, aiStateRef.current, result))
            ? { result, status: "complete" }
            : { ...current[task], status: "stale" },
      }));
    } catch {
      const result: AiTestResult = {
        ok: false,
        code: "provider_error",
        checkedAt: new Date().toISOString(),
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        selection: null,
      };
      setTestStates((current) => ({
        ...current,
        [task]:
          generation === testGeneration.current
            ? { result, status: "complete" }
            : { ...current[task], status: "stale" },
      }));
    } finally {
      setTestingTask(null);
    }
  }
  async function saveAiSelections() {
    const nextSelections = draftSelections ?? aiStateRef.current?.selections;
    if (!nextSelections || savingAiSelections) return;
    setSavingAiSelections(true);
    setProviderMessageKind("pending");
    setProviderMessage("Saving AI settings…");
    try {
      const result = await api<AiProviderState>("/api/v1/ai-settings", {
        method: "PUT",
        body: JSON.stringify({
          transcription: nextSelections.transcription,
          analysis: nextSelections.analysis,
        }),
      });
      invalidateTests(["transcription", "analysis", "ask"]);
      applyAiState(result, true);
      setProviderMessageKind("success");
      setProviderMessage("AI settings saved.");
    } catch (error) {
      setProviderMessageKind("error");
      const code = (error as { body?: { error?: string } }).body?.error;
      setProviderMessage(
        ["model_unavailable", "invalid_model_selection", "invalid_thinking_level"].includes(
          code ?? "",
        )
          ? "That model is no longer available from this provider. Choose another model. Your changes are still here."
          : "AI settings could not be saved. Your changes are still here.",
      );
    } finally {
      setSavingAiSelections(false);
    }
  }
  function updateTaskDraft(
    task: "transcription" | "analysis",
    selection: AiSelection | AiAnalysisSelection | null,
  ) {
    setDraftSelections((current) => {
      const existing = current ?? aiStateRef.current?.selections;
      return existing ? { ...existing, [task]: selection } : current;
    });
  }
  async function disconnectAiProvider(provider: AiSelection["provider"]) {
    const definition = aiStateRef.current?.providers.find(
      (item) => item.id === provider,
    );
    if (!definition || verifyingProvider) return;
    setVerifyingProvider(true);
    setProviderMessageKind("pending");
    setProviderMessage(`Disconnecting ${definition.name}…`);
    try {
      const result = await api<AiProviderState>(
        `/api/v1/ai-providers/${provider}`,
        { method: "DELETE" },
      );
      invalidateTests(["transcription", "analysis", "ask"]);
      applyAiState(result);
      setProviderMessageKind("success");
      setProviderMessage(
        `${definition.name} disconnected. Its draft assignment was cleared.`,
      );
      closeProviderDialog();
    } catch {
      setProviderMessageKind("error");
      setProviderMessage(`${definition.name} could not be disconnected. Try again.`);
    } finally {
      setVerifyingProvider(false);
    }
  }
  async function submitProviderConfiguration(event: FormEvent) {
    event.preventDefault();
    const definition = aiStateRef.current?.providers.find(
      (item) => item.id === selectedAiProvider,
    );
    const needsKey = !definition?.connected || replaceProviderKey;
    if (needsKey && !providerApiKey.trim()) {
      setProviderMessageKind("error");
      setProviderMessage("Enter an API key to connect this provider.");
      return;
    }
    if (!needsKey) {
      closeProviderDialog();
      return;
    }
    invalidateTests(["transcription", "analysis", "ask"]);
    setVerifyingProvider(true);
    setProviderMessageKind("pending");
    setProviderMessage("Verifying the key…");
    try {
      const state = await api<AiProviderState>(
        `/api/v1/ai-providers/${selectedAiProvider}`,
        { method: "PUT", body: JSON.stringify({ apiKey: providerApiKey }) },
      );
      applyAiState(state);
      setProviderApiKey("");
      const current = state.providers.find(
        (item) => item.id === selectedAiProvider,
      );
      if (!current?.connected) throw new Error("provider_unavailable");
      setProviderMessageKind("success");
      setProviderMessage(`${current.name} connected. Assign it to a task below.`);
      closeProviderDialog();
    } catch (error) {
      setProviderMessageKind("error");
      const code = (error as { body?: { error?: string } }).body?.error;
      setProviderMessage(
        code === "invalid_api_key"
          ? "The provider rejected that API key. Check it and try again."
          : "The provider could not be connected. Try again shortly.",
      );
    } finally {
      setVerifyingProvider(false);
    }
  }
  const topics: Array<{
    id: SettingsTopic;
    label: string;
    description: string;
    icon: LucideIcon;
  }> = [
    {
      id: "overview",
      label: "Overview",
      description: "A clear view of your setup.",
      icon: SettingsIcon,
    },
    {
      id: "ai",
      label: "AI",
      description: "Providers and task models.",
      icon: Bot,
    },
    {
      id: "connections",
      label: "Connections",
      description: "Sources and social sessions.",
      icon: Link2,
    },
    {
      id: "api",
      label: "API keys",
      description: "Integration access.",
      icon: KeyRound,
    },
    {
      id: "data",
      label: "Data & export",
      description: "Language and portable archives.",
      icon: Database,
    },
    {
      id: "account",
      label: "My account",
      description: "Your profile, sign-in details, and account preferences.",
      icon: UserRound,
    },
    ...(user?.role === "admin" ? [{
      id: "people" as const,
      label: "People & access",
      description: "Manage who can sign in and what they can administer.",
      icon: UsersRound,
    }] : []),
  ];
  const connectedPlatforms = platformConnections.filter(
    (connection) => connection.connected,
  );
  const openAi = aiState?.providers.find(
    (provider) => provider.id === "openai",
  );
  const configuredAiProviders = aiState?.providers ?? [];
  const dialogProvider = aiState?.providers.find(
    (provider) => provider.id === selectedAiProvider,
  );
  const currentAiSelections = draftSelections ?? aiState?.selections ?? {
    transcription: null,
    analysis: null,
  };
  const aiSettingsDirty = Boolean(
    aiState && !sameAiSelections(currentAiSelections, aiState.selections),
  );
  const aiTestBlocked = aiSettingsDirty || savingAiSelections;
  const activeTopic = topics.find((item) => item.id === topic);
  const showTopic = (value: SettingsTopic) =>
    topic === value || topic === "all";
  const selectTopic = (value: SettingsTopic) => {
    setTopic(value);
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(".settings-heading")?.focus(),
    );
  };
  return (
    <div className={`settings settings-workspace${topic === "account" || topic === "people" ? " account-settings-workspace" : ""}`}>
      <header className="settings-heading" tabIndex={-1}>
        <div>
          <p className="settings-breadcrumb">
            {topic === "people"
              ? "ADMINISTRATION  /  PEOPLE & ACCESS"
              : topic === "overview"
              ? "SETTINGS"
              : `SETTINGS  /  ${activeTopic?.label ?? "ALL TOPICS"}`}
          </p>
          <h1>
            {topic === "overview"
              ? "Settings"
              : (activeTopic?.label ?? "All settings")}
          </h1>
          <p>
            {topic === "overview"
              ? "Manage your sources, AI, access, and archive."
              : (activeTopic?.description ??
                "Review every part of your workspace setup.")}
          </p>
        </div>
        {topic !== "overview" && topic !== "ai" && topic !== "account" && topic !== "people" && (
          <button
            className="settings-back"
            type="button"
            onClick={() => selectTopic("overview")}
          >
            Back to overview
          </button>
        )}
      </header>
      <div className="settings-layout">
        <nav className="settings-topic-sidebar" aria-label="Settings topics">
          <span className="settings-topic-label">Settings</span>
          {topics.filter(({ id }) => id !== "people").map(({ id, label, icon: Icon }) => (
            <button
              className={topic === id ? "active" : ""}
              type="button"
              aria-current={topic === id ? "page" : undefined}
              onClick={() => selectTopic(id)}
              key={id}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
          {user?.role === "admin" && <><span className="settings-topic-label administration-label">Administration</span>{topics.filter(({ id }) => id === "people").map(({ id, label, icon: Icon }) => <button className={topic === id ? "active" : ""} type="button" aria-current={topic === id ? "page" : undefined} onClick={() => selectTopic(id)} key={id}><Icon aria-hidden="true" /><span>{label}</span></button>)}</>}
        </nav>
        <div className="settings-panels">
          <nav className="settings-mobile-topics" aria-label="Settings topics">
            <button
              type="button"
              className={topic === "overview" ? "active" : ""}
              onClick={() => selectTopic("overview")}
            >
              Overview
            </button>
            <button
              type="button"
              className={topic === "ai" ? "active" : ""}
              onClick={() => selectTopic("ai")}
            >
              AI
            </button>
            <label>
              <span className="sr-only">More settings topics</span>
              <select
                aria-label="More settings topics"
                value={topic === "overview" || topic === "ai" ? "" : topic}
                onChange={(event) =>
                  selectTopic(event.target.value as SettingsTopic)
                }
              >
                <option value="">All topics</option>
                <option value="connections">Connections</option>
                <option value="api">API keys</option>
                <option value="data">Data & export</option>
                <option value="account">My account</option>
                {user?.role === "admin" && <option value="people">People &amp; access</option>}
                <option value="all">View all settings</option>
              </select>
            </label>
          </nav>
          {loading ? (
            <section
              className="settings-loading"
              aria-live="polite"
              aria-busy="true"
            >
              <span className="settings-loading-mark" aria-hidden="true" />
              <div>
                <strong>Loading settings</strong>
                <p>Getting your private workspace ready.</p>
              </div>
            </section>
          ) : loadError ? (
            <section className="settings-load-error" role="alert">
              <strong>Settings unavailable</strong>
              <p>{loadError}</p>
              <button type="button" onClick={() => void load(true)}>
                Try again
              </button>
            </section>
          ) : (
            <>
              {topic === "overview" && (
                <section
                  className="settings-overview"
                  aria-labelledby="settings-essentials-heading"
                >
                  <div className="settings-overview-heading">
                    <div>
                      <p className="settings-section-kicker">ESSENTIALS</p>
                      <h2 id="settings-essentials-heading">
                        Start where it matters
                      </h2>
                    </div>
                    {!openAi?.connected && (
                      <button
                        className="settings-quick-action"
                        type="button"
                        onClick={() => {
                          setSelectedAiProvider("openai");
                          selectTopic("ai");
                        }}
                      >
                        Connect OpenAI
                      </button>
                    )}
                  </div>
                  <div className="settings-overview-list">
                    {[
                      {
                        id: "connections" as const,
                        icon: Link2,
                        title: "Connections",
                        detail: "Connect sources and see what is syncing.",
                        status: `${connectedPlatforms.length} connected`,
                      },
                      {
                        id: "ai" as const,
                        icon: Bot,
                        title: "AI",
                        detail:
                          "Choose providers for transcription and analysis.",
                        status: aiState?.readiness.capture
                          ? "Ready"
                          : "Needs setup",
                      },
                      {
                        id: "api" as const,
                        icon: KeyRound,
                        title: "API keys",
                        detail: "Create and manage access for integrations.",
                        status: keys.length
                          ? `${keys.length} active`
                          : "No keys",
                      },
                      {
                        id: "data" as const,
                        icon: DatabaseBackup,
                        title: "Full archive export",
                        detail:
                          "Download your complete archive in a portable format.",
                        status: libraryExports.some(
                          (item) => item.status === "pending",
                        )
                          ? "Preparing"
                          : "Available",
                      },
                    ].map(({ id, icon: Icon, title, detail, status }) => (
                      <button
                        className="settings-overview-row"
                        type="button"
                        onClick={() => selectTopic(id)}
                        key={id}
                      >
                        <span
                          className="settings-overview-icon"
                          aria-hidden="true"
                        >
                          <Icon />
                        </span>
                        <span className="settings-overview-copy">
                          <strong>{title}</strong>
                          <small>{detail}</small>
                        </span>
                        <span className="settings-overview-status">
                          {status}
                        </span>
                        <ChevronRight aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                  <div className="settings-account-summary">
                    <div>
                      <span
                        className="settings-overview-icon"
                        aria-hidden="true"
                      >
                        <ShieldCheck />
                      </span>
                      <span>
                        <strong>Account</strong>
                        <small>
                          Your profile and sign-in security.
                        </small>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectTopic("account")}
                    >
                      Manage account <ChevronRight aria-hidden="true" />
                    </button>
                  </div>
                </section>
              )}
              {showTopic("ai") && (
                <section className="settings-card ai-provider-settings">
                  <div className="ai-provider-heading">
                    <div className="settings-card-heading">
                      <h2>Provider connections</h2>
                      <p className="settings-help">
                        Credentials available to transcription and analysis.
                      </p>
                    </div>
                  </div>
                  <div className="ai-provider-list">
                      {configuredAiProviders.map((provider) => {
                        return (
                          <article className="ai-provider" key={provider.id}>
                            <div className="ai-provider-summary">
                              <div>
                                <strong>{provider.name}</strong>
                              </div>
                              <small>
                                {provider.connected && provider.keyHint
                                  ? `API key ${provider.keyHint}`
                                  : "Optional · No credential added"}
                              </small>
                            </div>
                            <span
                              className={`connection-state ${provider.connected ? "connected" : ""}`}
                            >
                              {provider.connected ? "Connected" : "Not connected"}
                            </span>
                            <div className="ai-provider-actions">
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => openProviderDialog(provider.id)}
                              >
                                {provider.connected ? "Change key" : "Connect"}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                  </div>
                  <div className="ai-assignment-heading">
                    <div>
                      <h3>Task models</h3>
                      <p className="settings-help">
                        Choose which connected provider handles each step.
                      </p>
                    </div>
                  </div>
                  <div className="ai-task-list">
                    <div className="ai-task-table-heading" aria-hidden="true">
                      <span>Task</span>
                      <span>Provider</span>
                      <span>Model</span>
                      <span>Thinking</span>
                    </div>
                    {(["transcription", "analysis"] as const).map((task) => {
                      const selection = currentAiSelections[task];
                      const providers = (aiState?.providers ?? []).filter(
                        (provider) =>
                          provider.connected &&
                          provider.capabilities[task],
                      );
                      const selectedProvider = providers.find(
                        (provider) => provider.id === selection?.provider,
                      );
                      const modelOptions = selectedProvider
                        ? task === "transcription"
                          ? transcriptionOptions(selectedProvider)
                          : analysisOptions(selectedProvider)
                        : [];
                      const selectedModel = selection?.model ?? "";
                      const analysisOption =
                        task === "analysis" && selectedProvider && selectedModel
                          ? taskOptionFor(selectedProvider, selectedModel)
                          : null;
                      const currentThinkingLevel =
                        task === "analysis"
                          ? (selection as AiAnalysisSelection | null)
                              ?.thinkingLevel ?? null
                          : null;
                      const updateSelection = (
                        providerId: AiSelection["provider"] | null,
                        model: string | null,
                        thinkingLevel: AiThinkingLevel | null = null,
                      ) => {
                        if (!providerId || !model) {
                          updateTaskDraft(task, null);
                          return;
                        }
                        if (task === "transcription") {
                          updateTaskDraft(task, {
                            provider: providerId,
                            model,
                          });
                          return;
                        }
                        updateTaskDraft(task, {
                          provider: providerId,
                          model,
                          thinkingLevel,
                        });
                      };
                      return (
                        <article className="ai-task" key={task}>
                          <div>
                            <h3>
                              {task === "transcription"
                                ? "Transcription"
                                : "Analysis"}
                            </h3>
                            <p>
                              {task === "transcription"
                                ? "Audio and video → searchable text"
                                : "Shared with Ask."}
                            </p>
                          </div>
                          <div className="ai-task-controls">
                            <label>
                              Provider
                              <select
                                value={selection?.provider ?? ""}
                                disabled={savingAiSelections || verifyingProvider}
                                onChange={(event) => {
                                  const providerId = event.target
                                    .value as AiSelection["provider"];
                                  const provider = providers.find(
                                    (item) => item.id === providerId,
                                  );
                                  const model = provider
                                    ? task === "transcription"
                                      ? transcriptionOptions(provider)[0]?.model
                                      : analysisOptions(provider)[0]?.model
                                    : null;
                                  updateSelection(provider?.id ?? null, model ?? null);
                                }}
                              >
                                <option value="">Not assigned</option>
                                {providers.map((provider) => (
                                  <option key={provider.id} value={provider.id}>
                                    {provider.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Model
                              <select
                                value={selectedModel}
                                disabled={
                                  savingAiSelections ||
                                  verifyingProvider ||
                                  !selectedProvider
                                }
                                onChange={(event) =>
                                  updateSelection(
                                    selectedProvider?.id ?? null,
                                    event.target.value || null,
                                  )
                                }
                              >
                                <option value="">Choose a model</option>
                                {modelOptions.map((option) => (
                                  <option key={option.model} value={option.model}>
                                    {option.model}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {task === "transcription" ? (
                              <span className="ai-thinking-unavailable">
                                Not applicable
                              </span>
                            ) : analysisOption?.thinkingLevels.length ? (
                              <>
                              <span className="ai-thinking-mobile-label" aria-hidden="true">Thinking</span>
                              <div
                                className="ai-thinking-options"
                                role="group"
                                aria-label="Thinking level"
                              >
                                <button
                                  type="button"
                                  className={
                                    currentThinkingLevel === null ? "active" : ""
                                  }
                                  aria-pressed={currentThinkingLevel === null}
                                  disabled={savingAiSelections || verifyingProvider}
                                  onClick={() =>
                                    updateSelection(
                                      selectedProvider?.id ?? null,
                                      selectedModel || null,
                                      null,
                                    )
                                  }
                                >
                                  Default
                                </button>
                                {analysisOption.thinkingLevels.map((level) => (
                                  <button
                                    type="button"
                                    key={level}
                                    className={
                                      currentThinkingLevel === level ? "active" : ""
                                    }
                                    aria-pressed={currentThinkingLevel === level}
                                    disabled={savingAiSelections || verifyingProvider}
                                    onClick={() =>
                                      updateSelection(
                                        selectedProvider?.id ?? null,
                                        selectedModel || null,
                                        level,
                                      )
                                    }
                                  >
                                    {level}
                                  </button>
                                ))}
                              </div>
                              </>
                            ) : (
                              <span className="ai-thinking-unavailable">
                                Not applicable
                              </span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <div className="ai-settings-footer">
                    <p>Changes apply to new captures. Existing results stay as saved.</p>
                    <div>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={openTestDialog}
                        disabled={savingAiSelections}
                      >
                        Test connection
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => void saveAiSelections()}
                        disabled={
                          !aiSettingsDirty ||
                          savingAiSelections ||
                          verifyingProvider ||
                          Boolean(testingTask)
                        }
                      >
                        {savingAiSelections ? "Saving…" : "Save changes"}
                      </button>
                    </div>
                  </div>
                  {testDialogOpen && (
                    <div
                      className="ai-provider-dialog-layer ai-test-dialog-layer"
                      role="presentation"
                      onMouseDown={(event) => {
                        if (!testingTask && event.target === event.currentTarget)
                          closeTestDialog();
                      }}
                    >
                      <section
                        className="ai-provider-dialog ai-test-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="test-dialog-title"
                        aria-describedby="test-dialog-description"
                        ref={testDialogPanel}
                        tabIndex={-1}
                        onKeyDown={(event) => {
                          if (event.key === "Escape" && !testingTask) {
                            closeTestDialog();
                            return;
                          }
                          if (event.key !== "Tab") return;
                          const focusable = Array.from(
                            event.currentTarget.querySelectorAll<HTMLElement>(
                              "button:not([disabled]), input:not([disabled]), select:not([disabled])",
                            ),
                          );
                          if (!focusable.length) return;
                          const first = focusable[0]!;
                          const last = focusable[focusable.length - 1]!;
                          if (
                            event.shiftKey &&
                            (document.activeElement === first ||
                              document.activeElement === event.currentTarget)
                          ) {
                            event.preventDefault();
                            last.focus();
                          } else if (
                            !event.shiftKey &&
                            (document.activeElement === last ||
                              document.activeElement === event.currentTarget)
                          ) {
                            event.preventDefault();
                            first.focus();
                          }
                        }}
                      >
                        <header>
                          <div>
                            <h3 id="test-dialog-title">Test connection</h3>
                            <p id="test-dialog-description" className="settings-help">
                              Run a small request for each saved task. Usage charges may apply.
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label="Close connection tests"
                            disabled={Boolean(testingTask)}
                            onClick={closeTestDialog}
                          >
                            <X aria-hidden="true" />
                          </button>
                        </header>
                        {aiTestBlocked && (
                          <p className="ai-test-save-first" role="status">
                            {savingAiSelections
                              ? "Saving settings before tests can run…"
                              : "Save changes before testing a connection."}
                          </p>
                        )}
                  <div className="ai-test-heading">
                    <div>
                      <h4>Diagnostic checks</h4>
                    </div>
                  </div>
                  <p className="settings-help ai-test-intro">
                    Check each saved task with a small provider request. Usage
                    charges may apply. These checks test your AI connection;
                    they do not run a full capture.
                  </p>
                  <div className="ai-test-list">
                    {(["transcription", "analysis", "ask"] as const).map((task) => {
                      const state = testStates[task];
                      const isTranscription = task === "transcription";
                      const label =
                        task === "analysis"
                          ? "Analysis"
                          : task === "ask"
                            ? "Ask"
                            : "Transcription";
                      const selection = isTranscription
                        ? aiState?.selections.transcription
                        : aiState?.selections.analysis;
                      return (
                        <article className="ai-test-row" key={task}>
                          <div>
                            <h4>{label}</h4>
                            <p>
                              {isTranscription
                                ? "Uses only the audio file you select here."
                                : task === "analysis"
                                  ? "Tests analysis with sample text."
                                  : "Tests a sample question without accessing your archive."}
                            </p>
                            {isTranscription && (
                              <label className="ai-test-file">
                                <span>Short audio file · 1 MB max</span>
                                <input
                                  type="file"
                                  accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,.mp3,.m4a,.mp4,.ogg,.wav,.webm"
                                  onChange={(event) => {
                                    setTestAudioFile(event.target.files?.[0] ?? null);
                                    invalidateTests(["transcription"]);
                                  }}
                                />
                              </label>
                            )}
                          </div>
                          <div className="ai-test-action">
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={
                                Boolean(testingTask) ||
                                aiTestBlocked ||
                                !selection ||
                                (isTranscription && !testAudioFile)
                              }
                              onClick={() => void runAiTest(task)}
                            >
                              {testingTask === task
                                ? `Testing ${label.toLowerCase()}…`
                                : `Test ${label.toLowerCase()}`}
                            </button>
                            <p
                              className={`ai-test-status ${state.status === "complete" && !state.result?.ok ? "error" : ""}`}
                              role={
                                state.status === "complete" && !state.result?.ok
                                  ? "alert"
                                  : "status"
                              }
                              aria-live="polite"
                            >
                              {state.status === "pending"
                                ? "Testing saved selection…"
                                : state.status === "stale"
                                  ? "Settings changed. Test result discarded; test again."
                                  : state.result
                                    ? state.result.ok
                                      ? `Passed in ${formatPreciseDuration(state.result.durationMs)} · ${formatAiTestSelection(state.result)}`
                                      : state.result.code === "timeout"
                                        ? `Timed out — inconclusive after ${formatPreciseDuration(state.result.durationMs)}`
                                      : `Failed in ${formatPreciseDuration(state.result.durationMs)}`
                                    : "Not tested"}
                            </p>
                            {state.status === "complete" && state.result && !state.result.ok && (
                              <p className="ai-test-guidance" role="alert">
                                {aiTestGuidance(state.result.code)}
                              </p>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                      </section>
                    </div>
                  )}
                  {providerMessage && !providerDialogOpen && (
                    <p
                      className={`action-feedback ${providerMessageKind === "error" ? "error" : ""}`}
                      role={providerMessageKind === "error" ? "alert" : "status"}
                      aria-live="polite"
                    >
                      {providerMessage}
                    </p>
                  )}
                  {providerDialogOpen && (
                    <div
                      className="ai-provider-dialog-layer"
                      role="presentation"
                      onMouseDown={(event) => {
                        if (
                          !verifyingProvider &&
                          event.target === event.currentTarget
                        )
                          closeProviderDialog();
                      }}
                    >
                      <section
                        className="ai-provider-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="provider-dialog-title"
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            if (!verifyingProvider) closeProviderDialog();
                            return;
                          }
                          if (event.key !== "Tab") return;
                          const focusable = Array.from(
                            event.currentTarget.querySelectorAll<HTMLElement>(
                              "button:not([disabled]), input:not([disabled]), select:not([disabled])",
                            ),
                          );
                          if (!focusable.length) return;
                          const first = focusable[0]!;
                          const last = focusable[focusable.length - 1]!;
                          if (event.shiftKey && document.activeElement === first) {
                            event.preventDefault();
                            last.focus();
                          } else if (!event.shiftKey && document.activeElement === last) {
                            event.preventDefault();
                            first.focus();
                          }
                        }}
                      >
                        <header>
                          <div>
                            <span className="settings-section-kicker">
                              PROVIDER SETTINGS
                            </span>
                            <h3 id="provider-dialog-title">
                              {dialogProvider?.connected
                                ? "Manage provider"
                                : "Connect provider"}
                            </h3>
                          </div>
                          <button
                            type="button"
                            aria-label="Close provider settings"
                            disabled={verifyingProvider}
                            onClick={closeProviderDialog}
                          >
                            <X aria-hidden="true" />
                          </button>
                        </header>
                        <form onSubmit={(event) => void submitProviderConfiguration(event)}>
                          <label>
                            Provider
                            <select
                              value={selectedAiProvider}
                              disabled={verifyingProvider}
                              autoFocus={Boolean(
                                dialogProvider?.connected && !replaceProviderKey,
                              )}
                              onChange={(event) =>
                                applyProviderDraft(
                                  event.target.value as AiSelection["provider"],
                                )
                              }
                            >
                              <option value="openai">OpenAI</option>
                              <option value="cerebras">Cerebras</option>
                            </select>
                          </label>
                          {(!dialogProvider?.connected || replaceProviderKey) ? (
                            <label>
                              {dialogProvider?.name ?? "Provider"} API key
                              <input
                                type="password"
                                value={providerApiKey}
                                onChange={(event) => setProviderApiKey(event.target.value)}
                                autoComplete="off"
                                required
                                autoFocus
                                placeholder="Paste API key"
                              />
                            </label>
                          ) : (
                            <div className="ai-provider-key-state">
                              <span>{dialogProvider?.keyHint} · connected</span>
                              <button
                                type="button"
                                disabled={verifyingProvider}
                                onClick={() => setReplaceProviderKey(true)}
                              >
                                Replace API key
                              </button>
                            </div>
                          )}
                          <p className="settings-help">
                            This only verifies and saves the API key. Choose models
                            and thinking level in Task models.
                          </p>
                          {providerMessage && (
                            <p
                              className={`action-feedback ${providerMessageKind === "error" ? "error" : ""}`}
                              role={providerMessageKind === "error" ? "alert" : "status"}
                              aria-live="polite"
                            >
                              {providerMessage}
                            </p>
                          )}
                          <div className="ai-provider-dialog-actions">
                            <button
                              type="button"
                              onClick={closeProviderDialog}
                              disabled={verifyingProvider}
                            >
                              Cancel
                            </button>
                            {dialogProvider?.connected && (
                              <button
                                type="button"
                                className="danger-button"
                                disabled={verifyingProvider}
                                onClick={() =>
                                  void disconnectAiProvider(dialogProvider.id)
                                }
                              >
                                Disconnect
                              </button>
                            )}
                            <button disabled={verifyingProvider}>
                              {verifyingProvider
                                ? "Connecting…"
                                : dialogProvider?.connected && !replaceProviderKey
                                  ? "Done"
                                  : "Connect provider"}
                            </button>
                          </div>
                        </form>
                      </section>
                    </div>
                  )}
                </section>
              )}
              {showTopic("connections") && (
                <section className="settings-card settings-connections-card">
                  <h2>Facebook and Instagram</h2>
                  <p className="settings-help">
                    Connect your logged-in browser session so private or
                    login-protected posts can be captured. Export a
                    Netscape-format <code>cookies.txt</code> while signed in,
                    then upload it here. Passwords are never requested or
                    stored.
                  </p>
                  <div className="platform-connections">
                    {platformConnections.map((connection) => {
                      const label =
                        connection.platform === "instagram"
                          ? "Instagram"
                          : "Facebook";
                      return (
                        <article key={connection.platform}>
                          <div className="platform-connection-heading">
                            <PlatformIcon
                              url={`https://www.${connection.platform}.com`}
                            />
                            <div>
                              <strong>{label}</strong>
                              <span
                                className={`connection-state ${connection.status}`}
                              >
                                {connection.status === "connected"
                                  ? "Connected"
                                  : connection.status === "needs_attention"
                                    ? "Reconnect needed"
                                    : "Not connected"}
                              </span>
                            </div>
                          </div>
                          <p>
                            {connection.lastUsedAt
                              ? `Last worked ${new Date(connection.lastUsedAt).toLocaleString()}`
                              : connection.connected
                                ? `${connection.cookieCount} platform cookies stored securely`
                                : "Anonymous downloads will still be attempted."}
                          </p>
                          <div className="platform-connection-actions">
                            <label className="button-like">
                              {connection.connected
                                ? "Replace cookies"
                                : "Upload cookies"}
                              <input
                                type="file"
                                accept=".txt,text/plain"
                                onChange={async (event) => {
                                  const file = event.target.files?.[0];
                                  if (file)
                                    await uploadPlatformCookies(
                                      connection.platform,
                                      file,
                                    );
                                  event.target.value = "";
                                }}
                              />
                            </label>
                            {connection.connected && (
                              <button
                                className="secondary-button"
                                onClick={async () => {
                                  try {
                                    await api(
                                      `/api/v1/platform-connections/${connection.platform}`,
                                      { method: "DELETE" },
                                    );
                                    setPlatformMessage(
                                      `${label} disconnected.`,
                                    );
                                    await load();
                                  } catch {
                                    setPlatformMessage(
                                      `${label} could not be disconnected. Try again.`,
                                    );
                                  }
                                }}
                              >
                                Disconnect
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {platformMessage && (
                    <p className="action-feedback" role="status">
                      {platformMessage}
                    </p>
                  )}
                  <details className="api-examples cookie-help">
                    <summary>How to export browser cookies</summary>
                    <p>
                      Use a trusted cookies.txt exporter in your desktop browser
                      while logged into the selected platform. Social Knowledge
                      discards every cookie that does not belong to that
                      platform before encrypting the connection.
                    </p>
                  </details>
                </section>
              )}
              {showTopic("api") && (
                <section className="settings-card settings-agent-connections-card">
                  <h2>AI Connections</h2>
                  <p className="settings-help">
                    Connect ChatGPT, Codex, or another MCP client with read-only
                    access to your saved archive.
                  </p>
                  <label>
                    MCP server
                    <input readOnly value={mcpUrl} />
                  </label>
                  <details className="api-examples">
                    <summary>Codex configuration</summary>
                    <p>
                      Store your account key in{" "}
                      <code>SOCIAL_KNOWLEDGE_API_KEY</code>, then add:
                    </p>
                    <pre>{`[mcp_servers.social_knowledge]\nurl = "${mcpUrl}"\nbearer_token_env_var = "SOCIAL_KNOWLEDGE_API_KEY"`}</pre>
                  </details>
                  <div className="key-list">
                    {connections.map((connection) => (
                      <article key={connection.clientId}>
                        <div>
                          <strong>{connection.name}</strong>
                          <small>
                            Read-only · connected{" "}
                            {new Date(
                              connection.authorizedAt,
                            ).toLocaleDateString()}{" "}
                            ·{" "}
                            {connection.lastUsedAt
                              ? `last used ${new Date(connection.lastUsedAt).toLocaleDateString()}`
                              : "never used"}
                          </small>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              await api(
                                `/api/v1/oauth/connections/${connection.clientId}`,
                                { method: "DELETE" },
                              );
                              await load();
                            } catch {
                              setMessage(
                                "That AI connection could not be revoked. Try again.",
                              );
                            }
                          }}
                        >
                          Revoke
                        </button>
                      </article>
                    ))}
                    {!connections.length && (
                      <p>No OAuth applications connected yet.</p>
                    )}
                  </div>
                  {message && !token && (
                    <p className="action-feedback" role="status">
                      {message}
                    </p>
                  )}
                </section>
              )}
              {showTopic("data") && (
                <section className="settings-card settings-export-card">
                  <h2>Export library</h2>
                  <p className="settings-help">
                    Create a portable backup containing all of your capture
                    metadata, transcripts, comments, Markdown notes, images,
                    audio, and videos. Account credentials and server
                    configuration are excluded.
                  </p>
                  <button
                    disabled={libraryExports.some(
                      (item) => item.status === "pending",
                    )}
                    onClick={async () => {
                      setBackupMessage("Preparing your backup…");
                      try {
                        await api("/api/v1/library-exports", {
                          method: "POST",
                        });
                        await load();
                      } catch (error) {
                        setBackupMessage(
                          error instanceof Error
                            ? error.message
                            : "Backup could not start.",
                        );
                      }
                    }}
                  >
                    {libraryExports.some((item) => item.status === "pending")
                      ? "Preparing backup…"
                      : "Create full backup"}
                  </button>
                  {backupMessage && (
                    <p className="action-feedback">{backupMessage}</p>
                  )}
                  <div className="key-list">
                    {libraryExports.map((item) => (
                      <article key={item.id}>
                        <div>
                          <strong>
                            {item.status === "complete"
                              ? `Backup ready · ${item.recordCount ?? 0} captures`
                              : item.status === "pending"
                                ? "Preparing backup"
                                : "Backup failed"}
                          </strong>
                          <small>
                            Created {new Date(item.createdAt).toLocaleString()}{" "}
                            · expires{" "}
                            {new Date(item.expiresAt).toLocaleString()}
                          </small>
                        </div>
                        {item.status === "complete" && (
                          <a
                            className="backup-download"
                            href={`/api/v1/library-exports/${item.id}/download`}
                          >
                            Download
                          </a>
                        )}
                      </article>
                    ))}
                  </div>
                  <p className="settings-help">
                    Backups contain private content and are available for 24
                    hours. Store downloaded archives somewhere secure.
                  </p>
                </section>
              )}
              {showTopic("data") && (
                <section className="settings-card settings-language-card">
                  <h2>Language</h2>
                  <p className="settings-help">
                    New captures use these preferences. Original transcripts are
                    always preserved.
                  </p>
                  <form
                    className="settings-language-form"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      try {
                        const result = await api<{
                          preferences: {
                            defaultLanguage: string;
                            translateForeign: boolean;
                          };
                        }>("/api/v1/preferences", {
                          method: "PATCH",
                          body: JSON.stringify({
                            defaultLanguage,
                            translateForeign,
                          }),
                        });
                        setDefaultLanguage(result.preferences.defaultLanguage);
                        setTranslateForeign(
                          result.preferences.translateForeign,
                        );
                        setPreferenceMessage("Language preferences saved.");
                      } catch {
                        setPreferenceMessage(
                          "Language preferences could not be saved. Try again.",
                        );
                      }
                    }}
                  >
                    <label>
                      Default language
                      <select
                        value={defaultLanguage}
                        onChange={(event) =>
                          setDefaultLanguage(event.target.value)
                        }
                      >
                        {[
                          "English",
                          "French",
                          "Portuguese",
                          "Spanish",
                          "German",
                          "Italian",
                          "Dutch",
                        ].map((language) => (
                          <option key={language}>{language}</option>
                        ))}
                      </select>
                    </label>
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={translateForeign}
                        onChange={(event) =>
                          setTranslateForeign(event.target.checked)
                        }
                      />
                      Translate foreign-language clips into my default language
                    </label>
                    <button>Save language settings</button>
                  </form>
                  {preferenceMessage && (
                    <p className="action-feedback">{preferenceMessage}</p>
                  )}
                </section>
              )}
              {showTopic("api") && (
                <section className="settings-card settings-api-keys-card">
                  <h2>API keys</h2>
                  <ShortcutSetup onCreated={() => load()} keyIds={keys.map((key) => key.id)} />
                  <p className="settings-help">
                    General API keys can submit captures and read, search, and
                    export your knowledge through the Agent API. It cannot
                    manage your account or settings.
                  </p>
                  <form className="settings-key-form" onSubmit={create}>
                    <label>
                      Key name
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </label>
                    <button>Create API key</button>
                  </form>
                  {token && (
                    <div className="token-box">
                      <strong>{message}</strong>
                      <code>{token}</code>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(token);
                          setMessage("Copied to clipboard.");
                        }}
                      >
                        Copy key
                      </button>
                    </div>
                  )}
                  {message && !token && (
                    <p className="action-feedback" role="status">
                      {message}
                    </p>
                  )}
                  <div className="key-list">
                    {keys.map((key) => (
                      <article key={key.id}>
                        <div>
                          <strong>{key.name}</strong>
                          <small>
                            {key.scope === "capture" ? "Capture only" : "Capture and knowledge access"} · {key.prefix}… · created{" "}
                            {new Date(key.createdAt).toLocaleDateString()} ·{" "}
                            {key.lastUsedAt
                              ? `last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                              : "never used"}
                          </small>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              await api(`/api/v1/api-keys/${key.id}`, {
                                method: "DELETE",
                              });
                              await load();
                              if (createdKeyId === key.id) {
                                setToken("");
                                setCreatedKeyId(null);
                              }
                              setMessage(`${key.name} was revoked.`);
                            } catch {
                              setMessage(
                                `${key.name} could not be revoked. Try again.`,
                              );
                            }
                          }}
                        >
                          Revoke
                        </button>
                      </article>
                    ))}
                    {!keys.length && <p>No account API keys yet.</p>}
                  </div>
                  <details className="api-examples">
                    <summary>Agent API examples</summary>
                    <p>
                      Replace <code>$SOCIAL_KNOWLEDGE_API_KEY</code> with an
                      account key.
                    </p>
                    <pre>{`curl -H "Authorization: Bearer $SOCIAL_KNOWLEDGE_API_KEY" \\
  "${window.location.origin}/api/v1/knowledge/search?q=lisbon%20restaurants"

curl -H "Authorization: Bearer $SOCIAL_KNOWLEDGE_API_KEY" \\
  "${window.location.origin}/api/v1/knowledge/captures/CAPTURE_ID?include=transcript"

curl -X POST -H "Authorization: Bearer $SOCIAL_KNOWLEDGE_API_KEY" \\
  -H "Content-Type: application/json" -d '{"include":["transcript","comments"]}' \\
  "${window.location.origin}/api/v1/knowledge/exports"`}</pre>
                    <p>
                      <a href="/openapi.json" target="_blank" rel="noreferrer">
                        OpenAPI 3.1 specification ↗
                      </a>
                    </p>
                  </details>
                </section>
              )}
              {showTopic("account") && (
                user && <MyAccount user={user} onUserChange={onUserChange} onSignOut={onSignOut} onOpenData={() => selectTopic("data")} />
              )}
              {showTopic("people") && user?.role === "admin" && <PeopleAccess currentUser={user} onMyAccount={() => selectTopic("account")} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
