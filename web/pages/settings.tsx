import { FormEvent, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  Archive,
  Bot,
  Code,
  Copy,
  Cpu,
  Database,
  Download,
  FileArchive,
  Info,
  KeyRound,
  Link2,
  MessageCircle,
  Plus,
  Smartphone,
  Sparkles,
  Upload,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  ActionButton,
  CardRow,
  IconBox,
  Input,
  Keycap,
  Select,
  StatusPill,
  Toggle,
  cx,
  type StatusTone,
} from "../components/ui/primitives";
import { MyAccount, PeopleAccess, type AccountUser } from "../account-settings";
import { ShortcutSetup } from "../shortcut-setup";
import { AiSetupProgress, nextAiSetupStep, type AiSetupStep } from "../ai-setup-progress";
import { confirmDiscardUnsaved, useUnsavedChanges } from "../unsaved-changes";
import {
  DisclosureRow,
  FacebookIcon,
  Feedback,
  InstagramIcon,
  SaveBar,
  SaveBarSlot,
  SettingsDialog,
  SettingsPageHeader,
  SettingsSection,
  formatDateTime,
  formatLongDate,
  formatRelative,
  formatShortDate,
  formatUntil,
} from "../settings-ui";
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
  AskPreferences,
  SettingsTopic,
} from "../shared/types";
import { api } from "../shared/api";
import {
  formatPreciseDuration,
  transcriptionOptions,
  analysisOptions,
} from "../shared/format";

type ContentTopic = "account" | "ai" | "connections" | "api" | "data" | "people";

const settingsGroups: Array<{
  label: string;
  adminOnly?: boolean;
  topics: Array<{ id: ContentTopic; label: string; icon: LucideIcon }>;
}> = [
  { label: "Account", topics: [{ id: "account", label: "My account", icon: UserRound }] },
  {
    label: "Workspace",
    topics: [
      { id: "ai", label: "AI & models", icon: Bot },
      { id: "connections", label: "Connections", icon: Link2 },
      { id: "api", label: "API keys", icon: KeyRound },
      { id: "data", label: "Data & export", icon: Database },
    ],
  },
  {
    label: "Administration",
    adminOnly: true,
    topics: [{ id: "people", label: "People & access", icon: UsersRound }],
  },
];

const topicTitles: Record<ContentTopic, string> = Object.fromEntries(
  settingsGroups.flatMap((group) => group.topics.map((topic) => [topic.id, topic.label])),
) as Record<ContentTopic, string>;

const taskModelRows = ["transcription", "analysis", "ask"] as const;
type TaskModelRow = (typeof taskModelRows)[number];
const taskLabels: Record<TaskModelRow, string> = {
  transcription: "Transcription",
  analysis: "Analysis",
  ask: "Ask AI default",
};

const languages = [
  "English",
  "French",
  "Portuguese",
  "Spanish",
  "German",
  "Italian",
  "Dutch",
];

const providerLooks: Record<
  AiProvider["id"],
  { icon: LucideIcon; background: string; color: string; summary: string }
> = {
  openai: {
    icon: Sparkles,
    background: "#18181b",
    color: "#ffffff",
    summary: "Transcription and analysis",
  },
  cerebras: {
    icon: Cpu,
    background: "#fdeee3",
    color: "#c2410c",
    summary: "Fast analysis models",
  },
};

const providerDot: Record<AiProvider["id"], string> = {
  openai: "#18181b",
  cerebras: "#c2410c",
};

const assistantLooks: Array<{
  match: RegExp;
  icon: LucideIcon;
  background: string;
  color: string;
}> = [
  { match: /claude/i, icon: Bot, background: "#f6ede4", color: "#b45f2a" },
  {
    match: /chatgpt|openai|codex/i,
    icon: MessageCircle,
    background: "#e9f3ee",
    color: "#10735a",
  },
];

const platformOrder: PlatformConnection["platform"][] = [
  "instagram",
  "facebook",
];

const platformLooks: Record<
  PlatformConnection["platform"],
  { label: string; icon: LucideIcon; background: string; color: string }
> = {
  instagram: {
    label: "Instagram",
    icon: InstagramIcon,
    background: "#fdecf1",
    color: "#c13584",
  },
  facebook: {
    label: "Facebook",
    icon: FacebookIcon,
    background: "#e8effd",
    color: "#1877f2",
  },
};

function maskKeyHint(hint: string) {
  const tail = hint.split("…").pop();
  return hint.includes("…") && tail ? `••••${tail}` : hint;
}

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

function describeAiChanges(
  saved: AiDraftSelections,
  draft: AiDraftSelections,
  providers: AiProvider[],
) {
  const changes: string[] = [];
  for (const task of taskModelRows) {
    const providerName = (selection: AiSelection | null) =>
      selection
        ? (providers.find((item) => item.id === selection.provider)?.name ??
          selection.provider)
        : task === "ask"
          ? "same as Analysis"
          : "not assigned";
    const before = saved[task];
    const after = draft[task];
    const label = taskLabels[task];
    if (before?.provider !== after?.provider)
      changes.push(
        `${label} provider changed from ${providerName(before)} to ${providerName(after)}`,
      );
    else if (before?.model !== after?.model)
      changes.push(
        `${label} model changed from ${before?.model ?? "none"} to ${after?.model ?? "none"}`,
      );
    else if (task !== "transcription") {
      const was = (before as AiAnalysisSelection | null)?.thinkingLevel ?? null;
      const now = (after as AiAnalysisSelection | null)?.thinkingLevel ?? null;
      if (was !== now)
        changes.push(
          `${label} thinking changed from ${was ?? "default"} to ${now ?? "default"}`,
        );
    }
  }
  return changes.length === 1
    ? changes[0]!
    : `${changes.length} task model changes are not saved yet`;
}

function taskOptionFor(provider: AiProvider, model: string) {
  return analysisOptions(provider).find((option) => option.model === model) ?? null;
}

function sameAiSelections(left: AiDraftSelections, right: AiDraftSelections) {
  return (
    left.transcription?.provider === right.transcription?.provider &&
    left.transcription?.model === right.transcription?.model &&
    left.analysis?.provider === right.analysis?.provider &&
    left.analysis?.model === right.analysis?.model &&
    left.analysis?.thinkingLevel === right.analysis?.thinkingLevel &&
    left.ask?.provider === right.ask?.provider &&
    left.ask?.model === right.ask?.model &&
    left.ask?.thinkingLevel === right.ask?.thinkingLevel
  );
}

function selectionsForConnectedProviders(
  selections: AiDraftSelections,
  providers: AiProvider[],
): AiDraftSelections {
  const selectionFor = (task: TaskModelRow) => {
    const selection = selections[task];
    const provider = providers.find((item) => item.id === selection?.provider);
    const capability = task === "transcription" ? "transcription" : "analysis";
    return provider?.connected && provider.capabilities[capability] ? selection : null;
  };
  return {
    transcription: selectionFor("transcription"),
    analysis: selectionFor("analysis") as AiAnalysisSelection | null,
    ask: selectionFor("ask") as AiAnalysisSelection | null,
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

/**
 * Settings, shown as a modal over the current page. The owner of navigation
 * decides when it opens and closes; `onClose` is called for ×, Esc and the
 * scrim, and should confirm unsaved edits first.
 */
export function Settings({
  user,
  onUserChange,
  onSignOut,
  topic,
  onTopicChange,
  onClose,
  onUnsavedChange,
  shortcutGuideRequest = 0,
  onAiReadinessChange,
  onAiStateChange,
  connectionsNeedAttention = false,
  banner,
  askPreferences,
  onAskPreferencesChange,
}: {
  user: AccountUser | null;
  onUserChange: (user: AccountUser) => void;
  onSignOut: () => Promise<void>;
  topic: SettingsTopic;
  onTopicChange: (topic: SettingsTopic) => void;
  onClose: () => void;
  /** Receives a plain-language summary of unsaved edits, or null, so navigation can ask first. */
  onUnsavedChange?: (summary: string | null) => void;
  /** Each increment opens API keys with the iPhone Shortcut setup guide expanded. */
  shortcutGuideRequest?: number;
  /** Called whenever the saved AI setup readiness is known or changes. */
  onAiReadinessChange?: (readiness: { capture: boolean; ask: boolean }) => void;
  /** Called after providers or task models are saved, so Ask can refresh its picker. */
  onAiStateChange?: (state: AiProviderState) => void;
  connectionsNeedAttention?: boolean;
  /** Context shown above the topic, such as a capture waiting on this fix. */
  banner?: ReactNode;
  askPreferences?: AskPreferences;
  onAskPreferencesChange?: (patch: Partial<AskPreferences>) => Promise<boolean>;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const paneBody = useRef<HTMLDivElement>(null);
  const [saveBarSlot, setSaveBarSlot] = useState<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Modal contract: focus moves in, Tab stays inside, Esc closes, and focus
  // returns to whatever opened Settings. Dialogs opened from a topic own the
  // keyboard while they are open.
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => heading.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      const root = dialog.current;
      if (!root || root.querySelector('[aria-modal="true"]')) return;
      if (event.key === "Escape") {
        if (event.defaultPrevented) return;
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [
        ...root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((item) => item.offsetParent !== null);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (!root.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (active === first || active === heading.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      window.requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus();
      });
    };
  }, []);
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
      return true;
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
      return false;
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
          ask: nextSelections.ask,
        }),
      });
      invalidateTests(["transcription", "analysis", "ask"]);
      applyAiState(result, true);
      onAiStateChange?.(result);
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
    task: TaskModelRow,
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
      onAiStateChange?.(result);
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
      onAiStateChange?.(state);
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
  const setTopic = onTopicChange;
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [cookiePlatform, setCookiePlatform] = useState<
    PlatformConnection["platform"] | null
  >(null);
  const cookieInput = useRef<HTMLInputElement>(null);
  const [assistantMessage, setAssistantMessage] = useState("");
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferenceError, setPreferenceError] = useState(false);
  const view: ContentTopic =
    topic === "overview" ||
    topic === "all" ||
    (topic === "people" && user?.role !== "admin")
      ? "account"
      : topic;
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    paneBody.current?.scrollTo({ top: 0 });
    const frame = window.requestAnimationFrame(() => heading.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [view]);
  const configuredAiProviders = aiState?.providers ?? [];
  const dialogProvider = aiState?.providers.find(
    (provider) => provider.id === selectedAiProvider,
  );
  const currentAiSelections = draftSelections ?? aiState?.selections ?? {
    transcription: null,
    analysis: null,
    ask: null,
  };
  const aiSettingsDirty = Boolean(
    aiState && !sameAiSelections(currentAiSelections, aiState.selections),
  );
  const aiTestBlocked = aiSettingsDirty || savingAiSelections;
  const [accountUnsaved, setAccountUnsaved] = useState<string | null>(null);
  const unsavedSummary =
    view === "account"
      ? accountUnsaved
      : view === "ai" && aiSettingsDirty && aiState
        ? `AI & models: ${describeAiChanges(aiState.selections, currentAiSelections, configuredAiProviders)}.`
        : null;
  useUnsavedChanges(unsavedSummary, onUnsavedChange);
  /** Topic changes started inside Settings ask before discarding edits too. */
  const goToTopic = (next: SettingsTopic) => {
    if (!confirmDiscardUnsaved(unsavedSummary)) return;
    setTopic(next);
  };
  // Unsaved task model choices belong to AI & models; leaving it discards them,
  // which navigation has already confirmed.
  const previousAiView = useRef(view);
  useEffect(() => {
    const wasAi = previousAiView.current === "ai";
    previousAiView.current = view;
    if (wasAi && view !== "ai" && aiStateRef.current) {
      setDraftSelections(aiStateRef.current.selections);
      setProviderMessage("");
    }
  }, [view]);
  useEffect(() => {
    if (aiState) onAiReadinessChange?.(aiState.readiness);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiState?.readiness.capture, aiState?.readiness.ask]);
  const [guideOpenPending, setGuideOpenPending] = useState(
    shortcutGuideRequest > 0,
  );
  const handledGuideRequest = useRef(0);
  useEffect(() => {
    if (shortcutGuideRequest <= handledGuideRequest.current) return;
    handledGuideRequest.current = shortcutGuideRequest;
    setGuideOpenPending(true);
    if (topic !== "api") setTopic("api");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcutGuideRequest]);
  const taskModelsRef = useRef<HTMLDivElement>(null);
  // "Change language" from My account lands on the language control itself.
  const languageFocusPending = useRef(false);
  useEffect(() => {
    if (view !== "data" || loading || !languageFocusPending.current) return;
    languageFocusPending.current = false;
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        const select = document.getElementById("note-language");
        select?.scrollIntoView({ block: "center" });
        select?.focus({ preventScroll: true });
      });
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [view, loading]);
  const aiSetupStep =
    aiState
      ? nextAiSetupStep(aiState, currentAiSelections, aiSettingsDirty, testStates)
      : null;
  const runAiSetupStep = (step: AiSetupStep) => {
    if (step.id === "credentials") {
      const broken = aiState?.providers.find(
        (provider) => !provider.connected && provider.status === "needs_attention",
      );
      openProviderDialog(broken?.id ?? "openai");
    } else if (step.id === "tasks") {
      if (step.action === "Connect OpenAI") {
        openProviderDialog("openai");
        return;
      }
      const target = taskModelsRef.current;
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
      // The anchor is a scroll target; the controls live in its following section.
      const empty = target?.nextElementSibling?.querySelector<HTMLSelectElement>(
        currentAiSelections.transcription
          ? 'select[aria-label="Analysis provider"]'
          : 'select[aria-label="Transcription provider"]',
      );
      empty?.focus({ preventScroll: true });
    } else if (step.id === "save") {
      const bar = document.querySelector<HTMLElement>(".st-savebar");
      bar?.scrollIntoView({ block: "center", behavior: "smooth" });
      bar?.querySelector<HTMLButtonElement>(".st-savebar-save")?.focus({
        preventScroll: true,
      });
    } else openTestDialog();
  };
  const exportPending = libraryExports.some((item) => item.status === "pending");
  const cookieConnection = platformConnections.find(
    (connection) => connection.platform === cookiePlatform,
  );
  async function savePreferences(next: {
    defaultLanguage: string;
    translateForeign: boolean;
  }) {
    const previous = { defaultLanguage, translateForeign };
    setDefaultLanguage(next.defaultLanguage);
    setTranslateForeign(next.translateForeign);
    setSavingPreferences(true);
    setPreferenceMessage("");
    try {
      const result = await api<{
        preferences: { defaultLanguage: string; translateForeign: boolean };
      }>("/api/v1/preferences", {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      setDefaultLanguage(result.preferences.defaultLanguage);
      setTranslateForeign(result.preferences.translateForeign);
      setPreferenceError(false);
      setPreferenceMessage("Language preferences saved.");
    } catch {
      setDefaultLanguage(previous.defaultLanguage);
      setTranslateForeign(previous.translateForeign);
      setPreferenceError(true);
      setPreferenceMessage("Language preferences could not be saved. Try again.");
    } finally {
      setSavingPreferences(false);
    }
  }
  async function startExport() {
    setBackupMessage("Preparing your backup…");
    try {
      await api("/api/v1/library-exports", { method: "POST" });
      await load();
    } catch (error) {
      setBackupMessage(
        error instanceof Error ? error.message : "Backup could not start.",
      );
    }
  }
  async function revokeKey(key: ApiKey) {
    try {
      await api(`/api/v1/api-keys/${key.id}`, { method: "DELETE" });
      await load();
      if (createdKeyId === key.id) {
        setToken("");
        setCreatedKeyId(null);
      }
      setMessage(`${key.name} was revoked.`);
    } catch {
      setMessage(`${key.name} could not be revoked. Try again.`);
    }
  }
  async function revokeAssistant(connection: OAuthConnection) {
    try {
      await api(`/api/v1/oauth/connections/${connection.clientId}`, {
        method: "DELETE",
      });
      setAssistantMessage(`${connection.name} can no longer search your archive.`);
      await load();
    } catch {
      setAssistantMessage("That AI connection could not be revoked. Try again.");
    }
  }
  async function disconnectPlatform(platform: PlatformConnection["platform"]) {
    const label = platformLooks[platform].label;
    try {
      await api(`/api/v1/platform-connections/${platform}`, {
        method: "DELETE",
      });
      setPlatformMessage(`${label} disconnected.`);
      setCookiePlatform(null);
      await load();
    } catch {
      setPlatformMessage(`${label} could not be disconnected. Try again.`);
    }
  }
  const closeKeyDialog = () => {
    setKeyDialogOpen(false);
    setToken("");
    setCreatedKeyId(null);
    setMessage("");
  };
  const stateCard = loading ? (
    <div className="ui-card st-state" role="status" aria-live="polite" aria-busy="true">
      <span className="st-spinner" aria-hidden="true" />
      <div>
        <strong>Loading settings</strong>
        <p>Getting your private workspace ready.</p>
      </div>
    </div>
  ) : loadError ? (
    <div className="ui-card st-state" role="alert">
      <div>
        <strong>Settings unavailable</strong>
        <p>{loadError}</p>
      </div>
      <ActionButton onClick={() => void load(true)}>Try again</ActionButton>
    </div>
  ) : null;
  const workspaceCrumb = "SETTINGS  /  WORKSPACE";
  const cookieHelp = (
    <>
      <p className="st-help-note">
        <Smartphone size={14} aria-hidden="true" />
        <span>
          <strong>On a phone?</strong> This guide uses Chrome or Firefox on a
          computer to export the file. Once uploaded, every device, including your
          iPhone Shortcut, uses the saved session. If the file is already
          on this phone, for example in Files, you can upload it here.
        </span>
      </p>
      <ol className="st-steps">
        <li>
          On a computer, sign in to Instagram or Facebook in Chrome or Firefox.
        </li>
        <li>
          Use a trusted cookies.txt exporter extension to save the cookies for
          that site only, in Netscape format.
        </li>
        <li>
          Open Settings › Connections on that computer, choose Connect or
          Reconnect, and upload the file. Cookies for other sites are discarded
          before encryption. Passwords are never requested or stored.
        </li>
        <li>
          Sessions usually last about a month. When one expires, Activity
          says so; repeat these steps, then retry the affected captures.
        </li>
      </ol>
    </>
  );
  const visibleGroups = settingsGroups.filter(
    (group) => !group.adminOnly || user?.role === "admin",
  );
  return (
    <div
      className="sm-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="sm-dialog sk-settings"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <nav className="sm-nav" aria-label="Settings sections">
          <h2 className="sm-nav-title">Settings</h2>
          {visibleGroups.map((group) => (
            <div className="sm-nav-group" role="group" aria-label={group.label} key={group.label}>
              <span className="sm-nav-label" aria-hidden="true">
                {group.label}
              </span>
              {group.topics.map((item) => {
                const Icon = item.icon;
                const attention = item.id === "connections" && connectionsNeedAttention;
                return (
                  <button
                    type="button"
                    className={cx("sm-nav-item", view === item.id && "active")}
                    aria-current={view === item.id ? "page" : undefined}
                    onClick={() => {
                      if (item.id !== view) goToTopic(item.id);
                    }}
                    key={item.id}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span className="sm-nav-text">{item.label}</span>
                    {attention && (
                      <>
                        <span className="sm-nav-dot" aria-hidden="true" />
                        <span className="sr-only">, needs attention</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          <p className="sm-nav-foot" aria-hidden="true">
            <Keycap>Esc</Keycap> to close · <Keycap>⌘,</Keycap> to open
          </p>
        </nav>
        <section className="sm-pane">
          <div className="sm-pane-head">
            <h1
              ref={heading}
              className="sm-title settings-topic-heading"
              tabIndex={-1}
            >
              {topicTitles[view]}
            </h1>
            <button
              type="button"
              className="sm-close"
              aria-label="Close Settings"
              title="Close (Esc)"
              onClick={onClose}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <SaveBarSlot.Provider value={saveBarSlot}>
          <div className="sm-pane-body" ref={paneBody}>
            {banner}
      <div className="st-column">
        {view === "account" && user && (
          <MyAccount
            user={user}
            onUserChange={onUserChange}
            onSignOut={onSignOut}
            onOpenData={() => goToTopic("data")}
            onOpenLanguage={() => {
              if (!confirmDiscardUnsaved(unsavedSummary)) return;
              languageFocusPending.current = true;
              setTopic("data");
            }}
            noteLanguage={loading || loadError ? null : defaultLanguage}
            onUnsavedChange={setAccountUnsaved}
            askPreferences={askPreferences}
            onAskPreferencesChange={onAskPreferencesChange}
          />
        )}
        {view === "people" && user && <PeopleAccess currentUser={user} />}
        {view === "ai" && (
          <>
            <SettingsPageHeader
              crumb={workspaceCrumb}
              title="AI & models"
              description="Connect a provider, then choose which model handles each step."
              action={
                <ActionButton
                  icon={Activity}
                  onClick={openTestDialog}
                  disabled={savingAiSelections || !aiState}
                >
                  Test connection
                </ActionButton>
              }
            />
            {stateCard ?? (
              <>
                {aiState && !(aiState.readiness.capture && aiState.readiness.ask && !aiSettingsDirty) && (
                  <AiSetupProgress
                    step={aiSetupStep}
                    ready={aiState.readiness.capture && aiState.readiness.ask}
                    onAction={runAiSetupStep}
                  />
                )}
                <SettingsSection
                  title="Providers"
                  description="Keys are stored encrypted and never shown again after saving."
                >
                  {configuredAiProviders.map((provider) => {
                    const look = providerLooks[provider.id];
                    const attention =
                      !provider.connected &&
                      provider.status === "needs_attention";
                    return (
                      <CardRow
                        className="st-provider-row"
                        key={provider.id}
                        leading={
                          <IconBox
                            icon={look.icon}
                            background={look.background}
                            color={look.color}
                          />
                        }
                        title={provider.name}
                        description={
                          provider.connected && provider.keyHint
                            ? `API key ${maskKeyHint(provider.keyHint)}${provider.verifiedAt ? ` · added ${formatLongDate(provider.verifiedAt)}` : ""}`
                            : attention
                              ? `${look.summary} · the saved key stopped working`
                              : `${look.summary} · no key added`
                        }
                      >
                        <StatusPill
                          tone={
                            provider.connected ? "ok" : attention ? "warn" : "off"
                          }
                        >
                          {provider.connected
                            ? "Connected"
                            : attention
                              ? "Needs attention"
                              : "Not connected"}
                        </StatusPill>
                        <ActionButton
                          icon={provider.connected ? undefined : Plus}
                          onClick={() => openProviderDialog(provider.id)}
                        >
                          {provider.connected ? "Change key" : "Connect"}
                        </ActionButton>
                      </CardRow>
                    );
                  })}
                </SettingsSection>
                <div ref={taskModelsRef} className="st-anchor" />
                <SettingsSection
                  title="Task models"
                  description="Each step can use a different connected provider. Choices apply after you save."
                  after={
                    !providerDialogOpen && (
                      <Feedback error={providerMessageKind === "error"}>
                        {providerMessage}
                      </Feedback>
                    )
                  }
                >
                  {taskModelRows.map((task) => {
                    const label = taskLabels[task];
                    const selection = currentAiSelections[task];
                    const capability =
                      task === "transcription" ? "transcription" : "analysis";
                    const providers = configuredAiProviders.filter(
                      (provider) =>
                        provider.connected && provider.capabilities[capability],
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
                      task !== "transcription" && selectedProvider && selectedModel
                        ? taskOptionFor(selectedProvider, selectedModel)
                        : null;
                    const currentThinkingLevel =
                      task !== "transcription"
                        ? ((selection as AiAnalysisSelection | null)
                            ?.thinkingLevel ?? null)
                        : null;
                    const busy = savingAiSelections || verifyingProvider;
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
                        updateTaskDraft(task, { provider: providerId, model });
                        return;
                      }
                      updateTaskDraft(task, {
                        provider: providerId,
                        model,
                        thinkingLevel,
                      });
                    };
                    return (
                      <CardRow
                        className="st-task-row"
                        key={task}
                        title={
                          task === "ask" ? (
                            <>
                              {label} <span className="st-new-tag">New</span>
                            </>
                          ) : (
                            label
                          )
                        }
                        description={
                          task === "transcription"
                            ? "Turns a saved video’s audio into text."
                            : task === "analysis"
                              ? "Writes the title, summary and takeaways for each capture."
                              : "New chats start on this model. Change it per chat from the composer."
                        }
                      >
                        <div className="st-row-controls">
                          <Select
                            aria-label={`${label} provider`}
                            className={cx(
                              task === "ask" && !selectedProvider
                                ? "st-control-180"
                                : "st-control-130",
                              !selectedProvider && task !== "ask" && "st-select-empty",
                            )}
                            dotColor={
                              selectedProvider
                                ? providerDot[selectedProvider.id]
                                : undefined
                            }
                            value={selection?.provider ?? ""}
                            disabled={busy}
                            onChange={(event) => {
                              const provider = providers.find(
                                (item) => item.id === event.target.value,
                              );
                              const model = provider
                                ? task === "transcription"
                                  ? transcriptionOptions(provider)[0]?.model
                                  : analysisOptions(provider)[0]?.model
                                : null;
                              updateSelection(provider?.id ?? null, model ?? null);
                            }}
                          >
                            <option value="">
                              {task === "ask" ? "Same as Analysis" : "Not assigned"}
                            </option>
                            {providers.map((provider) => (
                              <option key={provider.id} value={provider.id}>
                                {provider.name}
                              </option>
                            ))}
                          </Select>
                          {task === "ask" && !selectedProvider ? null : (
                          <Select
                            aria-label={`${label} model`}
                            className={cx(
                              task === "transcription"
                                ? "st-control-200"
                                : "st-control-110",
                              !selectedModel && "st-select-empty",
                            )}
                            value={selectedModel}
                            disabled={busy || !selectedProvider}
                            onChange={(event) => {
                              const model = event.target.value || null;
                              const keepsThinking =
                                selectedProvider && model && currentThinkingLevel
                                  ? taskOptionFor(
                                      selectedProvider,
                                      model,
                                    )?.thinkingLevels.includes(currentThinkingLevel)
                                  : false;
                              updateSelection(
                                selectedProvider?.id ?? null,
                                model,
                                keepsThinking ? currentThinkingLevel : null,
                              );
                            }}
                          >
                            <option value="">Choose a model</option>
                            {modelOptions.map((option) => (
                              <option key={option.model} value={option.model}>
                                {option.model}
                              </option>
                            ))}
                          </Select>
                          )}
                          {task !== "transcription" &&
                          analysisOption?.thinkingLevels.length ? (
                            <Select
                              aria-label={`${label} thinking level`}
                              className="st-control-172"
                              value={currentThinkingLevel ?? ""}
                              disabled={busy}
                              onChange={(event) =>
                                updateSelection(
                                  selectedProvider?.id ?? null,
                                  selectedModel || null,
                                  (event.target.value ||
                                    null) as AiThinkingLevel | null,
                                )
                              }
                            >
                              <option value="">Default</option>
                              {analysisOption.thinkingLevels.map((level) => (
                                <option key={level} value={level}>
                                  {capitalize(level)}
                                </option>
                              ))}
                            </Select>
                          ) : null}
                        </div>
                      </CardRow>
                    );
                  })}
                </SettingsSection>
                {aiSettingsDirty && aiState && (
                  <SaveBar
                    message={describeAiChanges(
                      aiState.selections,
                      currentAiSelections,
                      configuredAiProviders,
                    )}
                    saving={savingAiSelections}
                    saveDisabled={verifyingProvider || Boolean(testingTask)}
                    onDiscard={() => {
                      setDraftSelections(aiState.selections);
                      setProviderMessage("");
                    }}
                    onSave={() => void saveAiSelections()}
                  />
                )}
              </>
            )}
          </>
        )}
        {view === "connections" && (
          <>
            <SettingsPageHeader
              crumb={workspaceCrumb}
              title="Connections"
              description="Sources Social Knowledge saves from, and assistants allowed to search your archive."
            />
            {stateCard ?? (
              <>
                <SettingsSection
                  title="Social sessions"
                  description="Instagram and Facebook need a signed-in browser session to fetch posts. Cookies are encrypted and never shown again."
                  after={!cookiePlatform && <Feedback>{platformMessage}</Feedback>}
                >
                  {[...platformConnections]
                    .sort(
                      (a, b) =>
                        platformOrder.indexOf(a.platform) -
                        platformOrder.indexOf(b.platform),
                    )
                    .map((connection) => {
                    const look = platformLooks[connection.platform];
                    const attention = connection.status === "needs_attention";
                    return (
                      <CardRow
                        key={connection.platform}
                        className={cx(
                          "st-platform-row",
                          attention && "st-row-attention",
                        )}
                        leading={
                          <IconBox
                            icon={look.icon}
                            background={look.background}
                            color={look.color}
                          />
                        }
                        title={look.label}
                        description={
                          attention
                            ? `Session expired${connection.updatedAt ? ` on ${formatShortDate(connection.updatedAt)}` : ""} · new ${look.label} captures will fail until you reconnect`
                            : connection.connected
                              ? `Session verified ${connection.lastValidatedAt ? formatRelative(connection.lastValidatedAt) : "recently"} · usually lasts about a month`
                              : "No session · public posts are still attempted without one"
                        }
                      >
                        <StatusPill
                          tone={
                            attention
                              ? "warn"
                              : connection.connected
                                ? "ok"
                                : "off"
                          }
                        >
                          {attention
                            ? "Needs attention"
                            : connection.connected
                              ? "Connected"
                              : "Not connected"}
                        </StatusPill>
                        <ActionButton
                          variant={attention ? "primary" : "default"}
                          icon={connection.connected || attention ? undefined : Upload}
                          onClick={() => {
                            setPlatformMessage("");
                            setCookiePlatform(connection.platform);
                          }}
                        >
                          {attention
                            ? "Reconnect"
                            : connection.connected
                              ? "Replace cookies"
                              : "Connect"}
                        </ActionButton>
                      </CardRow>
                    );
                  })}
                  <DisclosureRow
                    icon={Info}
                    title="How to export browser cookies"
                    description="A manual setup guide using Chrome or Firefox on a computer. Upload an existing file from your phone."
                    last
                  >
                    {cookieHelp}
                  </DisclosureRow>
                </SettingsSection>
                <SettingsSection
                  title="Connected assistants"
                  description="AI assistants that can search your archive over MCP. Revoking takes effect immediately."
                  after={<Feedback>{assistantMessage}</Feedback>}
                >
                  {connections.map((connection) => {
                    const look = assistantLooks.find((item) =>
                      item.match.test(connection.name),
                    );
                    return (
                      <CardRow
                        key={connection.clientId}
                        className="st-assistant-row"
                        leading={
                          <IconBox
                            icon={look?.icon ?? Bot}
                            background={look?.background}
                            color={look?.color}
                          />
                        }
                        title={connection.name}
                        description={`Connected ${formatShortDate(connection.authorizedAt)} · ${connection.lastUsedAt ? `last searched ${formatRelative(connection.lastUsedAt)}` : "not used yet"}`}
                      >
                        <ActionButton
                          variant="danger"
                          onClick={() => void revokeAssistant(connection)}
                        >
                          Revoke
                        </ActionButton>
                      </CardRow>
                    );
                  })}
                  {!connections.length && (
                    <p className="st-empty-row">
                      No assistants connected yet.
                    </p>
                  )}
                  <CardRow
                    leading={
                      <IconBox icon={Plus} size={28} className="st-icon-muted" />
                    }
                    title="Connect another assistant"
                    description="Paste this address into any MCP-compatible app"
                    last
                  >
                    <Input
                      className="st-control-250 st-mono"
                      readOnly
                      value={mcpUrl}
                      aria-label="MCP server address"
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <ActionButton
                      icon={Copy}
                      onClick={() =>
                        void navigator.clipboard.writeText(mcpUrl).then(
                          () => setAssistantMessage("MCP address copied."),
                          () =>
                            setAssistantMessage(
                              "Clipboard access is unavailable. Select the address and copy it.",
                            ),
                        )
                      }
                    >
                      Copy
                    </ActionButton>
                  </CardRow>
                </SettingsSection>
              </>
            )}
          </>
        )}
        {view === "api" && (
          <>
            <SettingsPageHeader
              crumb={workspaceCrumb}
              title="API keys"
              description="Keys let the iPhone Shortcut and your own scripts save posts. A new key is shown once, so copy it somewhere safe."
              action={
                <ActionButton
                  variant="primary"
                  icon={Plus}
                  onClick={() => {
                    setToken("");
                    setMessage("");
                    setName("");
                    setKeyDialogOpen(true);
                  }}
                >
                  Create API key
                </ActionButton>
              }
            />
            {stateCard ?? (
              <>
                <SettingsSection
                  title="Active keys"
                  description="Revoke any key you no longer recognise. Revoking stops it working immediately."
                  after={!keyDialogOpen && <Feedback>{message}</Feedback>}
                >
                  <div className="st-rows st-key-list">
                    {keys.map((key) => (
                      <CardRow
                        key={key.id}
                        leading={<IconBox icon={KeyRound} />}
                        title={key.name}
                        description={`${key.prefix}•••• · ${key.scope === "capture" ? "Capture only · " : ""}created ${formatShortDate(key.createdAt)} · ${key.lastUsedAt ? `last used ${formatRelative(key.lastUsedAt)}` : "never used"}`}
                      >
                        {!key.lastUsedAt && (
                          <StatusPill tone="off">Unused</StatusPill>
                        )}
                        <ActionButton
                          variant="danger"
                          onClick={() => void revokeKey(key)}
                        >
                          Revoke
                        </ActionButton>
                      </CardRow>
                    ))}
                    {!keys.length && (
                      <p className="st-empty-row">
                        No API keys yet. Create one for a script, or set up the
                        iPhone Shortcut below.
                      </p>
                    )}
                  </div>
                </SettingsSection>
                <SettingsSection
                  title="Save from your iPhone"
                  description="Share any Instagram or Facebook post to Social Knowledge straight from the share sheet."
                >
                  <ShortcutSetup
                    onCreated={() => load()}
                    keyIds={keys.map((key) => key.id)}
                    openGuide={guideOpenPending}
                    onGuideOpened={() => setGuideOpenPending(false)}
                  />
                  <DisclosureRow
                    icon={Code}
                    title="Agent API examples"
                    description="Request formats for scripts and automations"
                    last
                  >
                    <p>
                      General keys can submit captures and read, search, and
                      export your knowledge. They cannot manage your account
                      or settings. Replace{" "}
                      <code>$SOCIAL_KNOWLEDGE_API_KEY</code> with a key.
                    </p>
                    <pre>{`curl -H "Authorization: Bearer $SOCIAL_KNOWLEDGE_API_KEY" \\
  "${window.location.origin}/api/v1/knowledge/search?q=lisbon%20restaurants"

curl -H "Authorization: Bearer $SOCIAL_KNOWLEDGE_API_KEY" \\
  "${window.location.origin}/api/v1/knowledge/captures/CAPTURE_ID?include=transcript"

curl -X POST -H "Authorization: Bearer $SOCIAL_KNOWLEDGE_API_KEY" \\
  -H "Content-Type: application/json" -d '{"include":["transcript","comments"]}' \\
  "${window.location.origin}/api/v1/knowledge/exports"`}</pre>
                    <p>
                      Codex and other MCP clients can use the same key. Store
                      it in <code>SOCIAL_KNOWLEDGE_API_KEY</code>, then add:
                    </p>
                    <pre>{`[mcp_servers.social_knowledge]\nurl = "${mcpUrl}"\nbearer_token_env_var = "SOCIAL_KNOWLEDGE_API_KEY"`}</pre>
                    <p>
                      <a href="/openapi.json" target="_blank" rel="noreferrer">
                        OpenAPI 3.1 specification ↗
                      </a>
                    </p>
                  </DisclosureRow>
                </SettingsSection>
              </>
            )}
          </>
        )}
        {view === "data" && (
          <>
            <SettingsPageHeader
              crumb={workspaceCrumb}
              title="Data & export"
              description="The language new notes are written in, and a portable copy of everything you’ve saved."
            />
            {stateCard ?? (
              <>
                <SettingsSection
                  title="Language"
                  description="Changes save immediately and apply to captures saved from now on. Existing notes keep their language."
                  after={
                    <Feedback error={preferenceError}>{preferenceMessage}</Feedback>
                  }
                >
                  <CardRow
                    title={<label htmlFor="note-language">Note language</label>}
                    description="Summaries, takeaways, and topics are written in this language."
                  >
                    <Select
                      id="note-language"
                      className="st-control-180"
                      value={defaultLanguage}
                      disabled={savingPreferences}
                      onChange={(event) =>
                        void savePreferences({
                          defaultLanguage: event.target.value,
                          translateForeign,
                        })
                      }
                    >
                      {(languages.includes(defaultLanguage)
                        ? languages
                        : [defaultLanguage, ...languages]
                      ).map((language) => (
                        <option key={language}>{language}</option>
                      ))}
                    </Select>
                  </CardRow>
                  <CardRow
                    title={
                      <span id="translate-transcripts-label">
                        Translate transcripts
                      </span>
                    }
                    description="Keep the original transcript and add a translation when a post is in another language."
                    last
                  >
                    <Toggle
                      aria-labelledby="translate-transcripts-label"
                      checked={translateForeign}
                      disabled={savingPreferences}
                      onCheckedChange={(checked) =>
                        void savePreferences({
                          defaultLanguage,
                          translateForeign: checked,
                        })
                      }
                    />
                  </CardRow>
                </SettingsSection>
                <SettingsSection
                  title="Export your archive"
                  description="Yours to keep. Exports include source links so every note stays attributed."
                  after={<Feedback>{backupMessage}</Feedback>}
                >
                  <CardRow
                    leading={<IconBox icon={Archive} tone="green" />}
                    title="Full archive"
                    description="Markdown notes, metadata, transcripts, comments, and media · credentials excluded"
                  >
                    <ActionButton
                      variant="primary"
                      icon={Download}
                      disabled={exportPending}
                      onClick={() => void startExport()}
                    >
                      {exportPending ? "Preparing archive…" : "Export archive"}
                    </ActionButton>
                  </CardRow>
                  {libraryExports.map((item) => {
                    const expired =
                      new Date(item.expiresAt).getTime() <= Date.now();
                    const tone: StatusTone | null =
                      item.status === "pending"
                        ? "off"
                        : item.status === "failed"
                          ? "warn"
                          : null;
                    return (
                      <CardRow
                        key={item.id}
                        className="st-export-row"
                        leading={<IconBox icon={FileArchive} size={28} />}
                        title={formatDateTime(item.createdAt)}
                        description={
                          item.status === "complete"
                            ? `${item.recordCount ?? 0} captures · ${expired ? "expired" : `ready · expires ${formatUntil(item.expiresAt)}`}`
                            : item.status === "pending"
                              ? "Preparing your archive. This can take a few minutes."
                              : "This export could not be completed. Try again."
                        }
                      >
                        {tone && (
                          <StatusPill tone={tone}>
                            {item.status === "pending" ? "Preparing" : "Failed"}
                          </StatusPill>
                        )}
                        {item.status === "complete" && !expired && (
                          <a
                            className="ui-btn ui-btn-default"
                            href={`/api/v1/library-exports/${item.id}/download`}
                          >
                            <Download
                              className="ui-btn-icon"
                              size={14}
                              aria-hidden="true"
                            />
                            <span>Download</span>
                          </a>
                        )}
                      </CardRow>
                    );
                  })}
                </SettingsSection>
              </>
            )}
          </>
        )}
      </div>
          </div>
          </SaveBarSlot.Provider>
          <div className="sm-savebar-slot" ref={setSaveBarSlot} />
        </section>
      {testDialogOpen && (
        <SettingsDialog
          className="ai-test-dialog"
          title="Test connection"
          description="Run a small request for each saved task. Usage charges may apply. These checks test your AI connection; they do not run a full capture."
          closeLabel="Close connection tests"
          closeDisabled={Boolean(testingTask)}
          onClose={closeTestDialog}
        >
          {aiTestBlocked && (
            <p className="st-dialog-warning" role="status">
              {savingAiSelections
                ? "Saving settings before tests can run…"
                : "Save changes before testing a connection."}
            </p>
          )}
          <div className="st-test-list">
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
              const failed = state.status === "complete" && !state.result?.ok;
              return (
                <article className="ai-test-row" key={task}>
                  <div className="st-test-copy">
                    <h3>{label}</h3>
                    <p>
                      {isTranscription
                        ? "Uses only the audio file you select here."
                        : task === "analysis"
                          ? "Tests analysis with sample text."
                          : "Tests a sample question without accessing your archive."}
                    </p>
                    {isTranscription && (
                      <label className="st-file">
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
                    <p
                      className={cx("st-test-status", failed && "st-test-status-error")}
                      role={failed ? "alert" : "status"}
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
                    {failed && state.result && (
                      <p className="st-test-guidance" role="alert">
                        {aiTestGuidance(state.result.code)}
                      </p>
                    )}
                  </div>
                  <ActionButton
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
                  </ActionButton>
                </article>
              );
            })}
          </div>
        </SettingsDialog>
      )}
      {providerDialogOpen && (
        <SettingsDialog
          title={dialogProvider?.connected ? "Manage provider" : "Connect provider"}
          description="This only verifies and saves the API key. Choose models and thinking level in Task models."
          closeLabel="Close provider settings"
          closeDisabled={verifyingProvider}
          onClose={closeProviderDialog}
          footer={
            <>
              {dialogProvider?.connected && (
                <ActionButton
                  variant="danger"
                  disabled={verifyingProvider}
                  onClick={() => void disconnectAiProvider(dialogProvider.id)}
                >
                  Disconnect
                </ActionButton>
              )}
              <span className="st-spacer" />
              <ActionButton
                variant="ghost"
                onClick={closeProviderDialog}
                disabled={verifyingProvider}
              >
                Cancel
              </ActionButton>
              <ActionButton
                variant="primary"
                type="submit"
                form="provider-form"
                disabled={verifyingProvider}
              >
                {verifyingProvider
                  ? "Connecting…"
                  : dialogProvider?.connected && !replaceProviderKey
                    ? "Done"
                    : "Connect provider"}
              </ActionButton>
            </>
          }
        >
          <form
            id="provider-form"
            className="st-dialog-form"
            onSubmit={(event) => void submitProviderConfiguration(event)}
          >
            <div className="st-field">
              <label htmlFor="provider-select">Provider</label>
              <Select
                id="provider-select"
                value={selectedAiProvider}
                disabled={verifyingProvider}
                autoFocus={Boolean(dialogProvider?.connected && !replaceProviderKey)}
                onChange={(event) =>
                  applyProviderDraft(event.target.value as AiSelection["provider"])
                }
              >
                <option value="openai">OpenAI</option>
                <option value="cerebras">Cerebras</option>
              </Select>
            </div>
            {!dialogProvider?.connected || replaceProviderKey ? (
              <div className="st-field">
                <label htmlFor="provider-api-key">
                  {dialogProvider?.name ?? "Provider"} API key
                </label>
                <Input
                  id="provider-api-key"
                  type="password"
                  value={providerApiKey}
                  onChange={(event) => setProviderApiKey(event.target.value)}
                  autoComplete="off"
                  required
                  autoFocus
                  placeholder="Paste API key"
                />
              </div>
            ) : (
              <div className="st-key-state">
                <span>
                  {dialogProvider?.keyHint ? maskKeyHint(dialogProvider.keyHint) : ""} · connected
                </span>
                <ActionButton
                  disabled={verifyingProvider}
                  onClick={() => setReplaceProviderKey(true)}
                >
                  Replace API key
                </ActionButton>
              </div>
            )}
            {providerMessage && (
              <Feedback error={providerMessageKind === "error"}>
                {providerMessage}
              </Feedback>
            )}
          </form>
        </SettingsDialog>
      )}
      {keyDialogOpen && (
        <SettingsDialog
          title="Create API key"
          description={
            token
              ? "Copy this key now. It will not be shown again."
              : "General keys can submit captures and read, search, and export your knowledge through the Agent API. They cannot manage your account or settings."
          }
          onClose={closeKeyDialog}
          footer={
            token ? (
              <ActionButton variant="primary" onClick={closeKeyDialog}>
                Done
              </ActionButton>
            ) : (
              <>
                <ActionButton variant="ghost" onClick={closeKeyDialog}>
                  Cancel
                </ActionButton>
                <ActionButton variant="primary" type="submit" form="api-key-form">
                  Create key
                </ActionButton>
              </>
            )
          }
        >
          {token ? (
            <div className="st-field">
              <label htmlFor="new-api-key">New API key</label>
              <div className="st-inline-controls">
                <Input
                  id="new-api-key"
                  className="st-grow st-mono"
                  readOnly
                  value={token}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <ActionButton
                  icon={Copy}
                  onClick={() =>
                    void navigator.clipboard.writeText(token).then(
                      () => setMessage("Copied to clipboard."),
                      () => setMessage("Select the key and copy it."),
                    )
                  }
                >
                  Copy key
                </ActionButton>
              </div>
              <Feedback>{message}</Feedback>
            </div>
          ) : (
            <form id="api-key-form" className="st-dialog-form" onSubmit={create}>
              <div className="st-field">
                <label htmlFor="api-key-name">Key name</label>
                <Input
                  id="api-key-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="What will use this key?"
                  maxLength={60}
                  required
                  autoFocus
                />
              </div>
              {message && <Feedback error>{message}</Feedback>}
            </form>
          )}
        </SettingsDialog>
      )}
      {cookiePlatform && (
        <SettingsDialog
          title={`${cookieConnection?.connected ? "Replace" : "Connect"} ${platformLooks[cookiePlatform].label} session`}
          description="Upload a Netscape-format cookies.txt exported while signed in. Passwords are never requested or stored, and cookies for other sites are discarded before encryption."
          onClose={() => setCookiePlatform(null)}
          footer={
            <>
              {(cookieConnection?.connected ||
                cookieConnection?.status === "needs_attention") && (
                <ActionButton
                  variant="danger"
                  onClick={() => void disconnectPlatform(cookiePlatform)}
                >
                  Disconnect
                </ActionButton>
              )}
              <span className="st-spacer" />
              <ActionButton variant="ghost" onClick={() => setCookiePlatform(null)}>
                Cancel
              </ActionButton>
              <ActionButton
                variant="primary"
                icon={Upload}
                onClick={() => cookieInput.current?.click()}
              >
                Choose cookies.txt
              </ActionButton>
            </>
          }
        >
          <input
            ref={cookieInput}
            className="sr-only"
            type="file"
            accept=".txt,text/plain"
            aria-label={`${platformLooks[cookiePlatform].label} cookies file`}
            tabIndex={-1}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file && (await uploadPlatformCookies(cookiePlatform, file)))
                setCookiePlatform(null);
            }}
          />
          <p className="st-dialog-note">
            {cookieConnection?.connected
              ? `${cookieConnection.cookieCount} ${platformLooks[cookiePlatform].label} cookies are stored encrypted. A new file replaces them.`
              : "Without a session, Social Knowledge still tries public downloads."}
          </p>
          <details className="st-help-details">
            <summary>How do I get a cookies.txt file?</summary>
            {cookieHelp}
          </details>
          <Feedback>{platformMessage}</Feedback>
        </SettingsDialog>
      )}
      </div>
    </div>
  );
}
