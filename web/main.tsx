import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, RotateCcw } from "lucide-react";
import type {
  NoteOpeningContext,
  ActivityJob,
  ActivityDetails,
  ActivityCounts,
  ActivityPage,
  AiProviderState,
  FailedActivityPage,
  AppTab,
  PlatformConnection,
  SettingsTopic,
} from "./shared/types";
import { api } from "./shared/api";
import { confirmDiscardUnsaved } from "./unsaved-changes";
import {
  useAskPreferences,
  useConversations,
  type ConversationsController,
} from "./shared/conversations";
import { ActionButton } from "./components/ui/primitives";
import { Auth, ProviderOnboarding } from "./pages/auth";
import { InboxPage } from "./pages/inbox";
import { Detail } from "./pages/capture-detail";
import { Settings } from "./pages/settings";
import { Library } from "./pages/library";
import { AskAI } from "./pages/ask";
import { safeReturnTo } from "../src/browser-routes";
import {
  MobileTabBar,
  MobileTopbar,
  Sidebar,
  appDestinations,
} from "./pages/app-shell";
import {
  CaptureDialog,
  captureOutcome,
  type CaptureReceipt,
} from "./components/capture-dialog";
import { CommandPalette } from "./components/command-palette";
import {
  ActivityView,
  jobIdentity,
  type ActivityFilter,
  type ActivityNotice,
} from "./pages/activity";
import type { AccountUser } from "./account-settings";
import "./styles.css";
import "./auth-redesign.css";
import "./knowledge-ask.css";
import "./settings.css";
import "./inbox.css";
import "./typography.css";
import "./shell.css";

/**
 * `?tab=capture` opens the dialog over Inbox. Settings is a modal, so the
 * legacy `?tab=settings` shows the Inbox behind it.
 */
function tabFromLocation(): AppTab {
  const value = new URLSearchParams(window.location.search).get("tab");
  return value === "library" || value === "ask" || value === "activity"
    ? value
    : "inbox";
}

const settingsTopicValues: SettingsTopic[] = [
  "overview",
  "ai",
  "connections",
  "api",
  "data",
  "account",
  "people",
  "all",
];

/** Valid topics; `overview` and `all` were Settings landing pages and now mean My account. */
function validTopic(value: unknown): SettingsTopic | null {
  if (typeof value !== "string" || !(settingsTopicValues as string[]).includes(value))
    return null;
  return value === "overview" || value === "all" ? "account" : (value as SettingsTopic);
}

/**
 * The open Settings topic, or null when Settings is closed. `?settings=<topic>`
 * works on any tab; legacy `?tab=settings&topic=<topic>` links still open it.
 */
function settingsFromLocation(state: unknown = window.history.state): SettingsTopic | null {
  const params = new URLSearchParams(window.location.search);
  if (params.has("settings")) return validTopic(params.get("settings")) ?? "account";
  if (params.get("tab") !== "settings") return null;
  return (
    validTopic(params.get("topic")) ??
    validTopic((state as { settingsTopic?: unknown } | null)?.settingsTopic) ??
    "account"
  );
}

function captureFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return params.get("tab") === "capture" || params.has("capture");
}

/**
 * Where a recovery detour from Activity or Capture should lead back to. The
 * job is the safe Activity projection, so banners show only its identity.
 */
type ReturnContext =
  | { kind: "connection"; job: ActivityJob }
  | { kind: "setup"; job: ActivityJob };

function platformOf(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^(www|m)\./, "");
    if (host === "instagram.com") return "Instagram";
    if (host === "facebook.com" || host === "fb.watch") return "Facebook";
  } catch {
    // Unparseable links have no platform to name.
  }
  return null;
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest("input, textarea, select, [contenteditable='true']") !== null)
  );
}

function App() {
  const [authState, setAuthState] = useState<
    "loading" | "setup" | "login" | "onboarding" | "ready"
  >("loading");
  const [user, setUser] = useState<AccountUser | null>(null);
  const [inviteToken] = useState(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get("invite");
    if (token)
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    return token;
  });
  const [tab, setTab] = useState<AppTab>(tabFromLocation);
  const [settingsTopic, setSettingsTopic] = useState<SettingsTopic>(
    () => settingsFromLocation() ?? "account",
  );
  const [settingsOpen, setSettingsOpen] = useState(() => settingsFromLocation() !== null);
  const settingsOpenRef = useRef(settingsOpen);
  settingsOpenRef.current = settingsOpen;
  const [aiRevision, setAiRevision] = useState(0);
  const [chatSearchRequest, setChatSearchRequest] = useState(0);
  const [captureOpen, setCaptureOpen] = useState(captureFromLocation);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inboxRefresh, setInboxRefresh] = useState(0);
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const connectionsNeedAttention = connections.some(
    (item) => item.status === "needs_attention",
  );
  const [aiReadiness, setAiReadiness] = useState<AiProviderState["readiness"] | null>(null);
  const [returnContext, setReturnContext] = useState<ReturnContext | null>(null);
  const [returnFeedback, setReturnFeedback] = useState("");
  const [returnRetrying, setReturnRetrying] = useState(false);
  const [shortcutGuideRequest, setShortcutGuideRequest] = useState(0);
  const unsavedSettings = useRef<string | null>(null);
  const ownerId = authState === "ready" ? (user?.id ?? null) : null;
  const conversations = useConversations(ownerId);
  const askPreferences = useAskPreferences(ownerId);
  /** Opening or starting a chat from anywhere shows it on the Ask page. */
  const chats = useMemo<ConversationsController>(
    () => ({
      ...conversations,
      open: (id) => {
        if (tabRef.current !== "ask" && !navigateRef.current("ask")) return;
        if (settingsOpenRef.current && !navigateRef.current("ask")) return;
        conversations.open(id);
      },
      startNew: () => {
        if (tabRef.current !== "ask" && !navigateRef.current("ask")) return;
        if (settingsOpenRef.current && !navigateRef.current("ask")) return;
        conversations.startNew();
      },
    }),
    [conversations],
  );
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const [linkedJob, setLinkedJob] = useState(() => new URLSearchParams(window.location.search).get("job"));
  const [focusJob, setFocusJob] = useState<string | null>(null);
  const highlightedJob = focusJob ?? linkedJob;
  const [activityJobs, setActivityJobs] = useState<ActivityJob[]>([]);
  const [activityNextCursor, setActivityNextCursor] = useState<string | null>(
    null,
  );
  const [activityCounts, setActivityCounts] = useState<ActivityCounts>({
    active: 0,
    queued: 0,
    failed: 0,
    savedToday: 0,
    recentEvents: 0,
  });
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const activityRequest = useRef(0);
  const [failedJobs, setFailedJobs] = useState<ActivityJob[]>([]);
  const [failedNextCursor, setFailedNextCursor] = useState<string | null>(null);
  const [failedTotal, setFailedTotal] = useState(0);
  const [failedError, setFailedError] = useState(false);
  const [failedLoadingMore, setFailedLoadingMore] = useState(false);
  const failedRequest = useRef(0);
  const liveRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [noteContext, setNoteContext] = useState<NoteOpeningContext | null>(null);
  const openNote = (id: string, context?: NoteOpeningContext) => {
    setNoteContext(context ?? { captureIds: [id], label: "Saved note" });
    setDetail(id);
  };
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [captureUrl, setCaptureUrl] = useState("");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<ActivityNotice | null>(null);
  const setMessage = (text: string) => setNotice(text ? { text } : null);
  const [captureMessage, setCaptureMessage] = useState("");
  const [captureError, setCaptureError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [captureReceipt, setCaptureReceipt] = useState<CaptureReceipt | null>(null);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const activityFilterRef = useRef(activityFilter);
  activityFilterRef.current = activityFilter;
  const [expandedJobId, setExpandedJobId] = useState<string | null>(highlightedJob);
  const [jobDetails, setJobDetails] = useState<ActivityDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
  const detailsRequest = useRef(0);
  const lastNewestActive = useRef<string | null>(null);
  const [retryPending, setRetryPending] = useState(false);
  const [retryingIds, setRetryingIds] = useState<string[]>([]);
  const [archivingIds, setArchivingIds] = useState<string[]>([]);
  const sessionGeneration = useRef(0);
  const activeOwnerId = useRef<string | null>(null);
  const [detailsReload, setDetailsReload] = useState(0);
  /** Clear private transient data before another account can use this SPA. */
  function resetAccountState() {
    sessionGeneration.current += 1;
    activityRequest.current += 1;
    failedRequest.current += 1;
    detailsRequest.current += 1;
    if (liveRefreshTimer.current) clearTimeout(liveRefreshTimer.current);
    liveRefreshTimer.current = null;
    setActivityJobs([]);
    setActivityNextCursor(null);
    setActivityCounts({ active: 0, queued: 0, failed: 0, savedToday: 0, recentEvents: 0 });
    setActivityLoading(false);
    setActivityLoadingMore(false);
    setActivityError(null);
    setFailedJobs([]);
    setFailedNextCursor(null);
    setFailedTotal(0);
    setFailedError(false);
    setFailedLoadingMore(false);
    setConnections([]);
    setAiReadiness(null);
    setReturnContext(null);
    setReturnFeedback("");
    setReturnRetrying(false);
    setFocusJob(null);
    setLinkedJob(null);
    setExpandedJobId(null);
    setJobDetails(null);
    setDetailsLoading(false);
    setDetailsError(false);
    setActivityFilter("all");
    activityFilterRef.current = "all";
    lastNewestActive.current = null;
    setDetail(null);
    setNoteContext(null);
    setCaptureUrl("");
    setNote("");
    setCaptureReceipt(null);
    setCaptureMessage("");
    setCaptureError(false);
    setSubmitting(false);
    setCaptureOpen(false);
    setPaletteOpen(false);
    setMobileMenuOpen(false);
    setNotice(null);
    setRetryPending(false);
    setRetryingIds([]);
    setArchivingIds([]);
    setShortcutGuideRequest(0);
    unsavedSettings.current = null;
  }
  async function check() {
    const generation = sessionGeneration.current;
    try {
      const result = await api<{ user: AccountUser }>("/api/auth/me");
      if (generation !== sessionGeneration.current) return;
      if (activeOwnerId.current && activeOwnerId.current !== result.user.id)
        resetAccountState();
      activeOwnerId.current = result.user.id;
      if (window.location.pathname === "/login") {
        window.location.replace(safeReturnTo(
          new URLSearchParams(window.location.search).get("returnTo"),
        ));
        return;
      }
      setUser(result.user);
      setAuthState("ready");
    } catch (e) {
      if (generation !== sessionGeneration.current) return;
      if (activeOwnerId.current) resetAccountState();
      activeOwnerId.current = null;
      setUser(null);
      const err = e as { status?: number; body?: { error?: string; setupRequired?: boolean } };
      if (window.location.pathname !== "/login" && err.status === 401 && err.body?.error === "unauthorized") {
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.replace(`/login?${new URLSearchParams({ returnTo })}`);
        return;
      }
      setAuthState(err.body?.setupRequired ? "setup" : "login");
    }
  }
  async function loadActivityPage(
    filter: ActivityFilter = activityFilter,
    append = false,
  ) {
    if (!activeOwnerId.current) return;
    const requestId = ++activityRequest.current;
    const cursor = append ? activityNextCursor : null;
    if (append && !cursor) return;
    if (append) setActivityLoadingMore(true);
    else {
      setActivityLoading(true);
      setActivityError(null);
      setActivityNextCursor(null);
    }
    const query = new URLSearchParams({
      limit: "100",
      filter,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (cursor) query.set("cursor", cursor);
    try {
      const page = await api<ActivityPage>(`/api/v1/jobs?${query}`);
      if (requestId !== activityRequest.current) return;
      const jobs = page.jobs.filter((job) =>
        filter === "active"
          ? job.status !== "failed" && job.status !== "complete"
          : true,
      );
      setActivityJobs((current) => {
        if (!append) return jobs;
        const seen = new Set(current.map((job) => job.id));
        return [...current, ...jobs.filter((job) => !seen.has(job.id))];
      });
      setActivityNextCursor(page.nextCursor);
      setActivityCounts(page.counts);
    } catch {
      if (requestId === activityRequest.current)
        setActivityError("Unable to load capture activity. Try again.");
    } finally {
      if (requestId === activityRequest.current) {
        if (append) setActivityLoadingMore(false);
        else setActivityLoading(false);
      }
    }
  }
  async function loadFailedJobs(append = false) {
    if (!activeOwnerId.current) return;
    const requestId = ++failedRequest.current;
    const cursor = append ? failedNextCursor : null;
    if (append && !cursor) return;
    if (append) setFailedLoadingMore(true);
    else setFailedNextCursor(null);
    const query = new URLSearchParams({ limit: "50" });
    if (cursor) query.set("cursor", cursor);
    try {
      const page = await api<FailedActivityPage>(
        `/api/v1/jobs/failed?${query}`,
      );
      if (requestId !== failedRequest.current) return;
      setFailedJobs((current) => {
        if (!append) return page.failures;
        const seen = new Set(current.map((job) => job.id));
        return [...current, ...page.failures.filter((job) => !seen.has(job.id))];
      });
      setFailedNextCursor(page.nextCursor);
      setFailedTotal(page.total);
      setFailedError(false);
    } catch {
      if (requestId === failedRequest.current && !append) {
        setFailedJobs([]);
        setFailedError(true);
      }
    } finally {
      if (requestId === failedRequest.current && append)
        setFailedLoadingMore(false);
    }
  }
  async function loadConnectionAttention() {
    if (!activeOwnerId.current) return;
    const generation = sessionGeneration.current;
    try {
      const result = await api<{ connections: PlatformConnection[] }>(
        "/api/v1/platform-connections",
      );
      if (generation === sessionGeneration.current) setConnections(result.connections);
    } catch {
      if (generation === sessionGeneration.current) setConnections([]);
    }
  }
  async function loadAiReadiness() {
    if (!activeOwnerId.current) return;
    const generation = sessionGeneration.current;
    try {
      const result = await api<AiProviderState>("/api/v1/ai-providers");
      if (generation === sessionGeneration.current) setAiReadiness(result.readiness);
    } catch {
      if (generation === sessionGeneration.current) setAiReadiness(null);
    }
  }
  async function load() {
    if (!activeOwnerId.current) return;
    setInboxRefresh((current) => current + 1);
    await Promise.all([loadActivityPage(activityFilterRef.current), loadFailedJobs()]);
  }
  function scheduleLiveRefresh() {
    if (liveRefreshTimer.current) return;
    liveRefreshTimer.current = setTimeout(() => {
      liveRefreshTimer.current = null;
      void load();
    }, 250);
  }
  useEffect(() => {
    void check();
  }, []);
  useEffect(() => {
    if (authState !== "ready") return;
    void loadConnectionAttention();
    void loadAiReadiness();
    const generation = sessionGeneration.current;
    const stream = new EventSource("/api/v1/events");
    stream.onmessage = () => {
      if (generation === sessionGeneration.current) scheduleLiveRefresh();
    };
    return () => {
      stream.close();
      if (liveRefreshTimer.current) {
        clearTimeout(liveRefreshTimer.current);
        liveRefreshTimer.current = null;
      }
    };
  }, [authState, user?.id]);
  useEffect(() => {
    if (authState !== "ready") return;
    void loadActivityPage(activityFilter);
  }, [authState, user?.id, activityFilter]);
  useEffect(() => {
    if (authState !== "ready") return;
    void loadFailedJobs();
  }, [authState, user?.id]);
  const visibleActivityJobs = useMemo(
    () =>
      [...activityJobs].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      ),
    [activityJobs],
  );
  const inProgressJobs = visibleActivityJobs.filter(
    (job) =>
      job.status !== "queued" &&
      job.status !== "failed" &&
      job.status !== "complete",
  );
  const queuedJobs = visibleActivityJobs.filter(
    (job) => job.status === "queued",
  );
  const newestActiveId = inProgressJobs[0]?.id ?? queuedJobs[0]?.id ?? null;
  const attentionTotal = Math.max(activityCounts.failed, failedTotal);
  useEffect(() => {
    const keepLinkedJob =
      (lastNewestActive.current === null && linkedJob) || focusJob;
    if (newestActiveId && newestActiveId !== lastNewestActive.current && !keepLinkedJob) {
      setExpandedJobId(newestActiveId);
    }
    lastNewestActive.current = newestActiveId;
  }, [newestActiveId]);
  useEffect(() => {
    if (authState !== "ready" || !activeOwnerId.current || !expandedJobId || tab !== "activity") return;
    const requestId = ++detailsRequest.current;
    setDetailsLoading(true);
    setDetailsError(false);
    void api<ActivityDetails>(`/api/v1/jobs/${expandedJobId}`)
      .then((details) => {
        if (requestId === detailsRequest.current) setJobDetails(details);
      })
      .catch(() => {
        if (requestId === detailsRequest.current) setDetailsError(true);
      })
      .finally(() => {
        if (requestId === detailsRequest.current) setDetailsLoading(false);
      });
    return () => {
      detailsRequest.current += 1;
    };
  }, [authState, user?.id, expandedJobId, detailsReload, tab, activityJobs.find((job) => job.id === expandedJobId)?.updatedAt]);
  /** Returns null on success, otherwise the user-facing reason it did not run. */
  async function retryJob(job: ActivityJob): Promise<string | null> {
    const generation = sessionGeneration.current;
    if (!activeOwnerId.current) return "Sign in to retry this capture.";
    if (retryPending || retryingIds.includes(job.id)) return "Already retrying.";
    setRetryingIds((current) => [...current, job.id]);
    try {
      setMessage("Retrying capture…");
      await api(`/api/v1/jobs/${job.id}/retry`, { method: "POST" });
      if (generation !== sessionGeneration.current) return "Your account changed.";
      setMessage("Capture re-queued. Progress shows below.");
      await load();
      return null;
    } catch (e) {
      if (generation !== sessionGeneration.current) return "Your account changed.";
      const status = (e as { status?: number }).status;
      const reason =
        status === 428
          ? "AI setup isn’t finished yet. Save a transcription and analysis model in AI & models, then retry."
          : status === 409
            ? "This capture can’t be retried in its current state."
            : "Retry failed. Check the capture setup and try again.";
      setMessage(reason);
      return reason;
    } finally {
      if (generation === sessionGeneration.current)
        setRetryingIds((current) => current.filter((id) => id !== job.id));
    }
  }
  async function setArchived(job: ActivityJob, archived: boolean, undoable = true) {
    const generation = sessionGeneration.current;
    if (!activeOwnerId.current) return;
    if (archivingIds.includes(job.id)) return;
    setArchivingIds((current) => [...current, job.id]);
    try {
      const result = await api<{ job: ActivityJob }>(
        `/api/v1/jobs/${job.id}/${archived ? "archive" : "restore"}`,
        { method: "POST" },
      );
      if (generation !== sessionGeneration.current) return;
      setJobDetails((current) =>
        current?.job.id === result.job.id ? { ...current, job: result.job } : current,
      );
      const identity = jobIdentity(result.job);
      setNotice(
        archived
          ? {
              text: `Bookmark archived: ${identity}. Find it under Archived.`,
              ...(undoable ? { undo: () => void setArchived(result.job, false, false) } : {}),
            }
          : { text: `Bookmark restored: ${identity}. It’s back in Needs attention.` },
      );
      await load();
    } catch (e) {
      if (generation !== sessionGeneration.current) return;
      const status = (e as { status?: number }).status;
      setMessage(
        status === 409
          ? "Only bookmarks for unsupported sites can be archived."
          : status === 404
            ? "That capture is no longer available."
            : `Couldn’t ${archived ? "archive" : "restore"} the bookmark. Try again.`,
      );
    } finally {
      if (generation === sessionGeneration.current)
        setArchivingIds((current) => current.filter((id) => id !== job.id));
    }
  }
  async function retryAll() {
    const generation = sessionGeneration.current;
    if (!activeOwnerId.current) return;
    if (retryPending || attentionTotal === 0) return;
    setRetryPending(true);
    setMessage("Retrying failed captures…");
    try {
      const result = await api<{ requested: number; retried: number }>(
        "/api/v1/jobs/retry-failed",
        { method: "POST" },
      );
      if (generation !== sessionGeneration.current) return;
      setMessage(`${result.retried} captures re-queued.`);
      await load();
    } catch {
      if (generation !== sessionGeneration.current) return;
      setMessage("Retry all failed. Check the capture setup and try again.");
    } finally {
      if (generation === sessionGeneration.current) setRetryPending(false);
    }
  }
  const navigateRef = useRef<(nextTab: AppTab) => boolean>(() => false);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const writeLocation = (
    update: (params: URLSearchParams) => void,
    historyMode: "push" | "replace",
    /** History state for the new entry; undefined keeps the current state on replace. */
    state?: Record<string, unknown>,
  ) => {
    const nextUrl = new URL(window.location.href);
    update(nextUrl.searchParams);
    const path = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    const samePath =
      path ===
      `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (samePath && state === undefined) return;
    const nextState =
      state ?? (historyMode === "replace" ? window.history.state : null);
    window.history[historyMode === "replace" ? "replaceState" : "pushState"](nextState, "", path);
  };
  const topicRef = useRef(settingsTopic);
  topicRef.current = settingsTopic;
  /** Opens Settings over the current page, or switches topic when it is open. */
  const openSettings = (topic?: SettingsTopic) => {
    const next = validTopic(topic ?? topicRef.current) ?? "account";
    setSettingsTopic(next);
    topicRef.current = next;
    if (settingsOpenRef.current) {
      writeLocation((params) => params.set("settings", next), "replace");
      return;
    }
    setMobileMenuOpen(false);
    setPaletteOpen(false);
    setCaptureOpen(false);
    setSettingsOpen(true);
    settingsOpenRef.current = true;
    writeLocation(
      (params) => {
        params.delete("capture");
        params.set("settings", next);
      },
      "push",
      { settingsModal: true },
    );
  };
  /** Topic switches inside Settings replace the entry, so Back closes the modal. */
  const changeSettingsTopic = (topic: SettingsTopic) => {
    const next = validTopic(topic) ?? "account";
    setSettingsTopic(next);
    topicRef.current = next;
    writeLocation((params) => params.set("settings", next), "replace");
  };
  /** Asks before discarding unsaved Settings edits; true when Settings may close. */
  const leaveSettingsAllowed = () => {
    if (!settingsOpenRef.current) return true;
    if (!confirmDiscardUnsaved(unsavedSettings.current)) return false;
    unsavedSettings.current = null;
    return true;
  };
  const dismissSettings = () => {
    setSettingsOpen(false);
    settingsOpenRef.current = false;
    setReturnContext(null);
    setReturnFeedback("");
  };
  /** ×, Esc and the scrim: return to the page behind, undoing the modal's history entry. */
  const closeSettings = () => {
    if (!settingsOpenRef.current || !leaveSettingsAllowed()) return;
    dismissSettings();
    if ((window.history.state as { settingsModal?: unknown } | null)?.settingsModal)
      window.history.back();
    else writeLocation((params) => params.delete("settings"), "replace");
  };
  const openCapture = () => {
    setCaptureMessage("");
    setCaptureError(false);
    setCaptureReceipt(null);
    setMobileMenuOpen(false);
    setPaletteOpen(false);
    setCaptureOpen(true);
    writeLocation((params) => params.set("capture", "1"), "push");
  };
  const closeCapture = () => {
    setCaptureOpen(false);
    writeLocation((params) => params.delete("capture"), "replace");
  };
  const navigateTo = (
    nextTab: AppTab,
    historyMode: "push" | "replace" = "push",
    topic?: SettingsTopic,
  ) => {
    if (nextTab === "capture") {
      openCapture();
      return true;
    }
    if (nextTab === "settings") {
      openSettings(topic);
      return true;
    }
    if (!leaveSettingsAllowed()) return false;
    if (settingsOpenRef.current) dismissSettings();
    else {
      setReturnContext(null);
      setReturnFeedback("");
    }
    if (nextTab !== "activity") setFocusJob(null);
    setDetail(null);
    setTab(nextTab);
    setCaptureOpen(false);
    setMobileMenuOpen(false);
    writeLocation((params) => {
      params.delete("capture");
      params.delete("settings");
      params.delete("topic");
      if (nextTab === "inbox") params.delete("tab");
      else params.set("tab", nextTab);
    }, historyMode);
    return true;
  };
  navigateRef.current = navigateTo;
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "capture")
      writeLocation((next) => {
        next.delete("tab");
        next.set("capture", "1");
      }, "replace");
    // Legacy Settings links open the modal over the Inbox at `?settings=`.
    if (params.get("tab") === "settings" || params.has("topic") || params.has("settings"))
      writeLocation((next) => {
        if (next.get("tab") === "settings") next.delete("tab");
        next.delete("topic");
        if (settingsOpenRef.current) next.set("settings", topicRef.current);
        else next.delete("settings");
      }, "replace");
    const restore = (event: PopStateEvent) => {
      const nextCapture = captureFromLocation();
      const nextTab = tabFromLocation();
      const nextSettings = settingsFromLocation(event.state);
      const leavingTopic =
        settingsOpenRef.current && nextSettings !== topicRef.current;
      if (leavingTopic) {
        if (!confirmDiscardUnsaved(unsavedSettings.current)) {
          // Stay on the edited topic and put its address back.
          const stay = new URL(window.location.href);
          stay.searchParams.delete("capture");
          stay.searchParams.set("settings", topicRef.current);
          window.history.pushState(
            { settingsModal: true },
            "",
            `${stay.pathname}${stay.search}${stay.hash}`,
          );
          return;
        }
        unsavedSettings.current = null;
      }
      if (nextSettings) {
        setSettingsTopic(nextSettings);
        topicRef.current = nextSettings;
      } else {
        setReturnContext(null);
        setReturnFeedback("");
      }
      setSettingsOpen(nextSettings !== null);
      settingsOpenRef.current = nextSettings !== null;
      if (nextCapture) {
        setCaptureReceipt(null);
        setCaptureMessage("");
      }
      setTab(nextTab);
      setCaptureOpen(nextCapture && nextSettings === null);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const openSettingsRef = useRef(openSettings);
  openSettingsRef.current = openSettings;
  useEffect(() => {
    if (authState !== "ready") return;
    let pendingG = 0;
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector(".nvm-layer")) return;
      const key = event.key.toLowerCase();
      const commandOnly =
        (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
      if (commandOnly && key === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (commandOnly && key === ",") {
        event.preventDefault();
        if (!settingsOpenRef.current) openSettingsRef.current();
        return;
      }
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTypingTarget(event.target) ||
        document.querySelector('[aria-modal="true"]')
      )
        return;
      if (pendingG && Date.now() - pendingG < 1200) {
        pendingG = 0;
        const destination = appDestinations.find((item) => item.shortcut === key);
        if (destination) {
          event.preventDefault();
          if (destination.tab === "ask") chatsRef.current.startNew();
          else navigateRef.current(destination.tab);
        }
        return;
      }
      if (event.key === "/" && !event.shiftKey) {
        event.preventDefault();
        setChatSearchRequest((current) => current + 1);
        return;
      }
      pendingG = key === "g" && !event.shiftKey ? Date.now() : 0;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authState]);
  useEffect(() => {
    if (authState !== "ready") return;
    if (settingsOpen || tab === "activity") void loadConnectionAttention();
    if (tab === "inbox") void loadAiReadiness();
  }, [authState, tab, settingsOpen, settingsTopic]);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const paletteNavigate = useCallback((nextTab: AppTab) => navigateRef.current(nextTab), []);
  const paletteCapture = useCallback(() => navigateRef.current("capture"), []);
  const signOut = async () => {
    resetAccountState();
    activeOwnerId.current = null;
    setUser(null);
    setAuthState("loading");
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/login");
    }
  };
  if (authState === "loading")
    return (
      <main className="auth">
        <p>Loading…</p>
      </main>
    );
  if (authState === "onboarding")
    return <ProviderOnboarding onDone={() => void check()} />;
  if (authState !== "ready")
    return (
      <Auth
        setup={authState === "setup"}
        inviteToken={inviteToken}
        onDone={(created) => {
          if (created) {
            setAuthState("onboarding");
            return;
          }
          void check();
        }}
      />
    );
  async function submit(event: FormEvent) {
    event.preventDefault();
    const generation = sessionGeneration.current;
    if (!activeOwnerId.current) return;
    setSubmitting(true);
    setCaptureError(false);
    setCaptureMessage("Submitting…");
    try {
      const result = await api<{
        created: boolean;
        retried?: boolean;
        job: ActivityJob;
      }>("/api/v1/jobs", {
        method: "POST",
        body: JSON.stringify({ url: captureUrl, note: note || undefined }),
      });
      if (generation !== sessionGeneration.current) return;
      setCaptureMessage("");
      setCaptureUrl("");
      setNote("");
      setCaptureReceipt({
        outcome: captureOutcome(result),
        created: result.created,
        job: result.job,
      });
      await load();
    } catch (e) {
      if (generation !== sessionGeneration.current) return;
      const body = (e as {
        body?: { error?: string; created?: boolean; retried?: boolean; job?: ActivityJob };
      }).body;
      const errorCode = body?.error;
      // Missing AI setup still retains the link server-side and returns its job.
      if (body?.job && typeof body.created === "boolean") {
        setCaptureMessage("");
        setCaptureUrl("");
        setNote("");
        setCaptureReceipt({
          outcome: captureOutcome({ created: body.created, retried: body.retried, job: body.job }),
          created: body.created,
          job: body.job,
        });
        void load();
        return;
      }
      const providerRequired = [
        "ai_provider_required",
        "analysis_provider_required",
        "transcription_required",
      ].includes(errorCode ?? "");
      setCaptureError(true);
      setCaptureMessage(
        errorCode === "transcription_required"
          ? "Choose a connected OpenAI transcription model in Settings before capturing."
          : errorCode === "analysis_provider_required"
            ? "Choose a connected analysis provider in Settings before capturing."
            : providerRequired
              ? "Finish AI processing setup before capturing."
              : errorCode === "invalid_url" || errorCode === "invalid_request"
                ? "Enter a valid Facebook or Instagram post URL."
                : e instanceof Error
                  ? e.message
                  : "Submission failed",
      );
      if (providerRequired) {
        closeCapture();
        openSettings("ai");
      }
    } finally {
      if (generation === sessionGeneration.current) setSubmitting(false);
    }
  }
  /** Opens Activity on one capture, switching to the list that contains it. */
  const openActivityFor = (job: ActivityJob, historyMode: "push" | "replace" = "push") => {
    const nextFilter: ActivityFilter = job.archivedAt
      ? "archived"
      : activityFilter === "archived" ||
          (activityFilter === "active" && (job.status === "failed" || job.status === "complete"))
        ? "all"
        : activityFilter;
    if (!navigateTo("activity", historyMode)) return false;
    setActivityFilter(nextFilter);
    setFocusJob(job.id);
    setExpandedJobId(job.id);
    return true;
  };
  const fixConnection = (job: ActivityJob) => {
    openSettings("connections");
    setReturnContext({ kind: "connection", job });
    setReturnFeedback("");
  };
  const setUpAi = (job: ActivityJob | null) => {
    openSettings("ai");
    if (job) setReturnContext({ kind: "setup", job });
    setReturnFeedback("");
  };
  const setUpIphone = () => {
    openSettings("api");
    setShortcutGuideRequest((current) => current + 1);
  };
  const backToCapture = () => {
    if (!returnContext) return;
    openActivityFor(returnContext.job);
  };
  async function retryFromBanner() {
    if (!returnContext) return;
    const generation = sessionGeneration.current;
    setReturnRetrying(true);
    setReturnFeedback("");
    const failure = await retryJob(returnContext.job);
    if (generation !== sessionGeneration.current) return;
    setReturnRetrying(false);
    if (failure) {
      setReturnFeedback(failure);
      return;
    }
    const job = { ...returnContext.job, status: "queued", errorCode: null };
    if (!openActivityFor(job))
      setReturnFeedback("Retried. Your link is queued; open Activity to follow it.");
  }
  const showReturnBanner =
    settingsOpen &&
    returnContext !== null &&
    ((returnContext.kind === "connection" && settingsTopic === "connections") ||
      (returnContext.kind === "setup" && settingsTopic === "ai"));
  const liveWork = activityCounts.active + activityCounts.queued > 0;
  const renderedGeneration = sessionGeneration.current;
  const returnBanner = showReturnBanner && returnContext && (
    <section
      className="app-return-banner"
      aria-label={
        returnContext.kind === "connection"
          ? "Return to capture"
          : "Saved link waiting for AI setup"
      }
    >
      <div className="app-return-banner-text">
        <strong>
          {returnContext.kind === "connection"
            ? `Reconnect ${platformOf(returnContext.job.normalizedUrl) ?? "the account"} for “${jobIdentity(returnContext.job)}”`
            : `“${jobIdentity(returnContext.job)}” is saved and waiting for AI setup`}
        </strong>
        <span>
          {returnContext.kind === "connection"
            ? "Reconnecting doesn’t retry the capture by itself. When the session shows Connected, go back and choose Retry."
            : aiReadiness?.capture
              ? "AI setup is ready. Retry the saved link now."
              : "Save a transcription and an analysis model below, then retry the saved link."}
        </span>
        {returnFeedback && (
          <span className="app-return-banner-feedback" role="status">
            {returnFeedback}
          </span>
        )}
      </div>
      <div className="app-return-banner-actions">
        {returnContext.kind === "setup" && (
          <ActionButton
            variant={aiReadiness?.capture ? "primary" : "default"}
            icon={RotateCcw}
            disabled={returnRetrying}
            onClick={() => void retryFromBanner()}
          >
            {returnRetrying ? "Retrying…" : "Retry saved link"}
          </ActionButton>
        )}
        <ActionButton icon={ArrowLeft} variant="ghost" onClick={backToCapture}>
          Back to capture
        </ActionButton>
      </div>
    </section>
  );
  return (
    <div className="app-frame">
      <Sidebar
        tab={tab}
        isAdmin={user?.role === "admin"}
        connectionsNeedAttention={connectionsNeedAttention}
        activityCounts={activityCounts}
        activityJobs={activityJobs}
        userName={user?.displayName || user?.username || "Personal archive"}
        username={user?.username ?? null}
        avatarColor={user?.avatarColor || undefined}
        mobileOpen={mobileMenuOpen}
        onOpenMobile={() => setMobileMenuOpen(true)}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onNavigate={navigateTo}
        chats={chats}
        chatSearchRequest={chatSearchRequest}
        settingsOpen={settingsOpen}
        onOpenSettings={() => openSettings()}
        onCapture={openCapture}
        onOpenPalette={() => {
          setMobileMenuOpen(false);
          setPaletteOpen(true);
        }}
        onSignOut={() => {
          if (leaveSettingsAllowed()) void signOut();
        }}
      />
      {mobileMenuOpen && (
        <div
          className="app-sidebar-scrim"
          role="presentation"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <section className="app-workspace" key={user?.id}>
        <MobileTopbar
          menuOpen={mobileMenuOpen}
          onOpenMenu={() => setMobileMenuOpen(true)}
          onCapture={openCapture}
        />
        <main className="shell" id="main-content">
          {tab === "inbox" && (
            <InboxPage
              refreshToken={inboxRefresh}
              onOpen={openNote}
              userId={user?.id ?? null}
              captureReady={aiReadiness?.capture ?? null}
              pendingWork={activityCounts.active + activityCounts.queued}
              onCapture={openCapture}
              onSetUpAi={() => setUpAi(null)}
              onViewActivity={() => navigateTo("activity")}
            />
          )}
          {tab === "activity" && (
            <ActivityView
              jobs={visibleActivityJobs}
              counts={activityCounts}
              loading={activityLoading}
              loadingMore={activityLoadingMore}
              error={activityError}
              nextCursor={activityNextCursor}
              onLoadMore={() => void loadActivityPage(activityFilter, true)}
              filter={activityFilter}
              onFilterChange={(filter) => {
                setFocusJob(null);
                setActivityFilter(filter);
              }}
              failedJobs={failedJobs}
              attentionTotal={attentionTotal}
              failedError={failedError}
              failedNextCursor={failedNextCursor}
              failedLoadingMore={failedLoadingMore}
              onLoadMoreFailed={() => void loadFailedJobs(true)}
              onReloadFailed={() => void loadFailedJobs()}
              selectedJobId={expandedJobId}
              onSelectJob={(id) => {
                setExpandedJobId(id);
                setDetailsReload((current) => current + 1);
              }}
              jobDetails={jobDetails}
              detailsLoading={detailsLoading}
              detailsError={detailsError}
              highlightedJobId={highlightedJob}
              notice={notice}
              retryPending={retryPending}
              retryingIds={retryingIds}
              archivingIds={archivingIds}
              connections={connections}
              onRetry={(job) => void retryJob(job)}
              onRetryAll={() => void retryAll()}
              onFixConnection={fixConnection}
              onSetUpAi={setUpAi}
              onArchive={(job) => void setArchived(job, true)}
              onRestore={(job) => void setArchived(job, false)}
            />
          )}
          {tab === "library" && <Library onOpen={openNote} />}
          {tab === "ask" && (
            <AskAI
              onOpen={openNote}
              noteOpen={detail !== null}
              onOpenSettings={(topic) => openSettings(topic)}
              onCapture={openCapture}
              chats={chats}
              preferences={askPreferences.preferences}
              onPreferencesChange={askPreferences.update}
              aiRevision={aiRevision}
              onAiStateChange={(state: AiProviderState) => {
                if (renderedGeneration === sessionGeneration.current)
                  setAiReadiness(state.readiness);
              }}
            />
          )}
        </main>
        <MobileTabBar tab={tab} live={liveWork} onNavigate={navigateTo} />
      </section>
      {detail && (
        <Detail id={detail} from={tab} context={noteContext ?? undefined}
          onSelect={setDetail} onClose={() => setDetail(null)} />
      )}
      {settingsOpen && (
        <Settings
          user={user}
          onUserChange={(next) => {
            if (renderedGeneration === sessionGeneration.current && activeOwnerId.current === next.id)
              setUser(next);
          }}
          onSignOut={async () => {
            if (renderedGeneration === sessionGeneration.current && activeOwnerId.current === user?.id)
              await signOut();
          }}
          topic={settingsTopic}
          onTopicChange={changeSettingsTopic}
          onClose={closeSettings}
          onUnsavedChange={(summary: string | null) => {
            if (renderedGeneration === sessionGeneration.current && activeOwnerId.current === user?.id)
              unsavedSettings.current = summary;
          }}
          shortcutGuideRequest={shortcutGuideRequest}
          onAiReadinessChange={(readiness: AiProviderState["readiness"]) => {
            if (renderedGeneration === sessionGeneration.current && activeOwnerId.current === user?.id)
              setAiReadiness(readiness);
          }}
          onAiStateChange={() => {
            if (renderedGeneration === sessionGeneration.current)
              setAiRevision((current) => current + 1);
          }}
          connectionsNeedAttention={connectionsNeedAttention}
          banner={returnBanner}
          askPreferences={askPreferences.preferences}
          onAskPreferencesChange={askPreferences.update}
        />
      )}
      {captureOpen && (
        <CaptureDialog
          url={captureUrl}
          note={note}
          onUrlChange={(value) => {
            setCaptureUrl(value);
            if (captureError) setCaptureError(false);
          }}
          onNoteChange={setNote}
          submitting={submitting}
          receipt={captureReceipt}
          message={captureMessage}
          error={captureError}
          onSubmit={submit}
          onClose={closeCapture}
          onCaptureAnother={() => {
            setCaptureReceipt(null);
            setCaptureMessage("");
          }}
          onViewActivity={(job) => openActivityFor(job, "replace")}
          onSetUpAi={setUpAi}
          onSetUpIphone={setUpIphone}
        />
      )}
      {paletteOpen && (
        <CommandPalette
          onClose={closePalette}
          onNavigate={paletteNavigate}
          onCapture={paletteCapture}
        />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
