import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronDown,
  Copy,
  RotateCw,
} from "lucide-react";
import type {
  ActivityStageName,
  ActivityStage,
  ActivityJob,
  ActivityEvent,
  ActivityDetails,
  ActivityCounts,
  ActivityPage,
  FailedActivityPage,
  AppTab,
  PlatformConnection,
  SettingsTopic,
} from "./shared/types";
import { api } from "./shared/api";
import { platformFor, formatPreciseDuration } from "./shared/format";
import { Auth, ProviderOnboarding } from "./pages/auth";
import { InboxPage } from "./pages/inbox";
import { Detail } from "./pages/capture-detail";
import { Settings } from "./pages/settings";
import { Library } from "./pages/library";
import { AskAI } from "./pages/ask";
import {
  MobileTabBar,
  MobileTopbar,
  Sidebar,
  appDestinations,
} from "./pages/app-shell";
import { CaptureDialog } from "./components/capture-dialog";
import { CommandPalette } from "./components/command-palette";
import type { AccountUser } from "./account-settings";
import "./styles.css";
import "./activity-capture.css";
import "./auth-redesign.css";
import "./knowledge-ask.css";
import "./settings.css";
import "./inbox.css";
import "./typography.css";
import "./shell.css";

const activityStages: ActivityStageName[] = [
  "added",
  "found",
  "media",
  "text",
  "saved",
];
const activityStageCopy: Record<ActivityStageName, string> = {
  added: "Added",
  found: "Found",
  media: "Media",
  text: "Text",
  saved: "Saved",
};
const activityStatusCopy: Record<string, string> = {
  queued: "Queued",
  downloading: "Downloading",
  processing: "Preparing media",
  transcribing: "Transcribing",
  translating: "Translating",
  analyzing: "Extracting knowledge",
  writing: "Saving capture",
  complete: "Saved",
  failed: "Needs attention",
};
const failureCopy: Record<string, { title: string; message: string }> = {
  unsupported_platform: {
    title: "URL saved; platform not supported",
    message: "Your URL is retained here. Media capture for this platform is not supported yet.",
  },
  ai_setup_required: {
    title: "URL saved; AI setup required",
    message: "Configure transcription and analysis in Settings, then retry this saved URL.",
  },
  authentication_required: {
    title: "Login cookie expired",
    message: "Refresh the saved login cookies for this platform, then retry.",
  },
  private_post: {
    title: "Private post",
    message:
      "The post is private or the connected account does not have access.",
  },
  unavailable: {
    title: "Post unavailable",
    message: "The post was removed, expired, or is not available at this URL.",
  },
  unsupported_format: {
    title: "Post type not supported yet",
    message: "This archive currently handles video posts and Reels.",
  },
  archive_limit: {
    title: "Archive limit exceeded",
    message: "The media is longer or larger than the configured archive limit.",
  },
  platform_temporary: {
    title: "Platform temporarily unavailable",
    message:
      "Facebook or Instagram refused the download. Wait a little and retry.",
  },
  processing_failed: {
    title: "Media processing failed",
    message:
      "The post downloaded, but its video or audio could not be processed.",
  },
  ai_failed: {
    title: "Knowledge extraction failed",
    message:
      "The media was downloaded, but transcription or analysis did not finish.",
  },
  ai_credentials_rejected: {
    title: "AI credentials rejected",
    message: "Reconnect the AI provider, then retry this capture.",
  },
  ai_quota_exceeded: {
    title: "AI provider quota exceeded",
    message: "Add provider credits or increase the quota, then retry.",
  },
  ai_rate_limited: {
    title: "AI provider rate limit reached",
    message: "Wait a little, then retry this capture.",
  },
  ai_model_unavailable: {
    title: "AI model unavailable",
    message: "Choose or configure an available AI model, then retry.",
  },
};

function failureFor(job: ActivityJob) {
  if (job.errorCode && Object.hasOwn(failureCopy, job.errorCode))
    return failureCopy[job.errorCode]!;
  return {
    title: "Capture failed",
    message: "Retry this capture. If it fails again, check your capture setup.",
  };
}

function sourceLabel(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const platform = ["instagram.com", "www.instagram.com"].includes(host) ? "Instagram" : ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch"].includes(host) ? "Facebook" : host;
    return `${platform} · ${parsed.pathname.replace(/\/$/, "").split("/").pop() || "post"}`;
  } catch {
    return "Social post";
  }
}

function sourceReference(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/$/, "").split("/").pop() || "post";
  } catch {
    return "Social post";
  }
}

function formatEventDuration(event: ActivityEvent) {
  if (event.state === "running") return "running";
  if (event.state === "pending") return "pending";
  return event.durationMs === null ? "—" : formatPreciseDuration(event.durationMs);
}

function formatStageDuration(stage: ActivityStage | undefined) {
  if (!stage || stage.state === "queued") return "pending";
  if (stage.state === "active") return "running";
  return stage.durationMs === null ? "—" : formatPreciseDuration(stage.durationMs);
}

function formatActivityTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 10) return "now";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatEventTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

const activityLogLabels: Record<string, string> = {
  queued: "Queued",
  downloading: "Finding source",
  processing: "Processing media",
  transcribing: "Transcribing",
  translating: "Translating",
  analyzing: "Extracting knowledge",
  writing: "Saving capture",
  complete: "Saved",
  failed: "Capture failed",
};
const safeActivityMessages = new Set([
  "URL accepted and queued",
  "Capture accepted",
  "Source found",
  "Instagram reel found",
  "Facebook post found",
  "Download started",
  "Media prepared",
  "Waiting for media download",
  "Transcript ready",
  "Knowledge extracted",
  "Capture archived",
  "Manual retry requested",
  "Retry scheduled",
  "AI title ready; extracting detailed knowledge",
]);

function safeActivityEvent(event: ActivityEvent): ActivityEvent | null {
  const label = Object.hasOwn(activityLogLabels, event.status)
    ? activityLogLabels[event.status]
    : null;
  if (!label) return null;
  return {
    ...event,
    attempt: Number.isSafeInteger(event.attempt) && (event.attempt ?? 0) > 0 ? event.attempt : null,
    label: event.status === "queued" && event.message === "Manual retry requested"
      ? "Manual retry requested"
      : event.status === "queued" && event.message === "Retry scheduled"
        ? "Automatic retry scheduled"
        : label,
    message: event.status === "failed"
      ? event.failureCode && Object.hasOwn(failureCopy, event.failureCode)
        ? `${failureCopy[event.failureCode]!.title}. ${failureCopy[event.failureCode]!.message}`
        : "The cause was not recorded for this attempt."
      : safeActivityMessages.has(event.message ?? "")
        ? event.message
        : null,
  };
}

/** `?tab=capture` is the pre-dialog deep link; it now opens the dialog over Inbox. */
function tabFromLocation(): AppTab {
  const value = new URLSearchParams(window.location.search).get("tab");
  return value === "library" ||
    value === "ask" ||
    value === "activity" ||
    value === "settings"
    ? value
    : "inbox";
}

function captureFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return params.get("tab") === "capture" || params.has("capture");
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
  const [settingsTopic, setSettingsTopic] = useState<SettingsTopic>("account");
  const lastArchiveTab = useRef<AppTab>(tab === "settings" ? "inbox" : tab);
  const [captureOpen, setCaptureOpen] = useState(captureFromLocation);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inboxRefresh, setInboxRefresh] = useState(0);
  const [connectionsNeedAttention, setConnectionsNeedAttention] = useState(false);
  const highlightedJob = new URLSearchParams(window.location.search).get("job");
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [captureUrl, setCaptureUrl] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [captureMessage, setCaptureMessage] = useState("");
  const [captureError, setCaptureError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [captureSubmitted, setCaptureSubmitted] = useState(false);
  const [activityFilter, setActivityFilter] = useState<"active" | "all">("active");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState<ActivityDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
  const detailsRequest = useRef(0);
  const lastNewestActive = useRef<string | null>(null);
  const [retryPending, setRetryPending] = useState(false);
  const [retryingIds, setRetryingIds] = useState<string[]>([]);
  const [copyFeedback, setCopyFeedback] = useState("");
  async function check() {
    try {
      const result = await api<{ user: AccountUser }>("/api/auth/me");
      setUser(result.user);
      setAuthState("ready");
    } catch (e) {
      setUser(null);
      const err = e as { body?: { setupRequired?: boolean } };
      setAuthState(err.body?.setupRequired ? "setup" : "login");
    }
  }
  async function loadActivityPage(
    filter: "active" | "all" = activityFilter,
    append = false,
  ) {
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
    try {
      const result = await api<{ connections: PlatformConnection[] }>(
        "/api/v1/platform-connections",
      );
      setConnectionsNeedAttention(
        result.connections.some((item) => item.status === "needs_attention"),
      );
    } catch {
      setConnectionsNeedAttention(false);
    }
  }
  async function load() {
    setInboxRefresh((current) => current + 1);
    await Promise.all([loadActivityPage(), loadFailedJobs()]);
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
    const stream = new EventSource("/api/v1/events");
    stream.onmessage = () => scheduleLiveRefresh();
    return () => {
      stream.close();
      if (liveRefreshTimer.current) {
        clearTimeout(liveRefreshTimer.current);
        liveRefreshTimer.current = null;
      }
    };
  }, [authState]);
  useEffect(() => {
    if (authState !== "ready") return;
    void loadActivityPage(activityFilter);
  }, [authState, activityFilter]);
  useEffect(() => {
    if (authState !== "ready") return;
    void loadFailedJobs();
  }, [authState]);
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
    if (activityFilter !== "active") return;
    if (newestActiveId && newestActiveId !== lastNewestActive.current) {
      setExpandedJobId(newestActiveId);
    }
    lastNewestActive.current = newestActiveId;
  }, [activityFilter, newestActiveId]);
  useEffect(() => {
    if (!expandedJobId || tab !== "activity") return;
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
  }, [expandedJobId, tab, activityJobs.find((job) => job.id === expandedJobId)?.updatedAt]);
  async function retryJob(job: ActivityJob) {
    if (retryPending || retryingIds.includes(job.id)) return;
    setRetryingIds((current) => [...current, job.id]);
    try {
      setMessage("Retrying capture…");
      await api(`/api/v1/jobs/${job.id}/retry`, { method: "POST" });
      setMessage("Capture re-queued successfully.");
      await load();
    } catch {
      setMessage("Retry failed. Check the capture setup and try again.");
    } finally {
      setRetryingIds((current) => current.filter((id) => id !== job.id));
    }
  }
  async function retryAll() {
    if (retryPending || attentionTotal === 0) return;
    setRetryPending(true);
    setMessage("Retrying failed captures…");
    try {
      const result = await api<{ requested: number; retried: number }>(
        "/api/v1/jobs/retry-failed",
        { method: "POST" },
      );
      setMessage(`${result.retried} captures re-queued.`);
      await load();
    } catch {
      setMessage("Retry all failed. Check the capture setup and try again.");
    } finally {
      setRetryPending(false);
    }
  }
  async function copyActivityLogs(events: ActivityEvent[]) {
    const safeEvents = events
      .map(safeActivityEvent)
      .filter((event): event is NonNullable<typeof event> => event !== null);
    const text = safeEvents
      .map((event) =>
        [
          formatEventTime(event.createdAt),
          event.label,
          event.attempt ? `Attempt ${event.attempt}` : null,
          event.message,
          formatEventDuration(event),
        ]
          .filter(Boolean)
          .join(" · "),
      )
      .join("\n");
    if (!text) {
      setCopyFeedback("No safe logs available to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("Safe logs copied.");
    } catch {
      setCopyFeedback("Couldn’t copy logs. Select and copy them manually.");
    }
  }
  const navigateRef = useRef<(nextTab: AppTab) => void>(() => undefined);
  const writeLocation = (
    update: (params: URLSearchParams) => void,
    historyMode: "push" | "replace",
  ) => {
    const nextUrl = new URL(window.location.href);
    update(nextUrl.searchParams);
    const path = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    if (
      path !==
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    ) {
      window.history[historyMode === "replace" ? "replaceState" : "pushState"](
        window.history.state,
        "",
        path,
      );
    }
  };
  const openCapture = () => {
    setCaptureMessage("");
    setCaptureError(false);
    setCaptureSubmitted(false);
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
  ) => {
    if (nextTab === "capture") {
      openCapture();
      return;
    }
    if (nextTab === "settings" && tab !== "settings") setSettingsTopic("account");
    if (nextTab !== "settings") lastArchiveTab.current = nextTab;
    setTab(nextTab);
    setCaptureOpen(false);
    setMobileMenuOpen(false);
    writeLocation((params) => {
      params.delete("capture");
      if (nextTab === "inbox") params.delete("tab");
      else params.set("tab", nextTab);
    }, historyMode);
  };
  navigateRef.current = navigateTo;
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "capture")
      writeLocation((params) => {
        params.delete("tab");
        params.set("capture", "1");
      }, "replace");
    const restore = () => {
      const nextCapture = captureFromLocation();
      if (nextCapture) {
        setCaptureSubmitted(false);
        setCaptureMessage("");
      }
      const nextTab = tabFromLocation();
      if (nextTab !== "settings") lastArchiveTab.current = nextTab;
      setTab(nextTab);
      setCaptureOpen(nextCapture);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (authState !== "ready") return;
    let pendingG = 0;
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && key === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
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
          navigateRef.current(destination.tab);
        }
        return;
      }
      pendingG = key === "g" && !event.shiftKey ? Date.now() : 0;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authState]);
  useEffect(() => {
    if (authState === "ready" && tab === "settings") void loadConnectionAttention();
  }, [authState, tab, settingsTopic]);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const paletteNavigate = useCallback((nextTab: AppTab) => navigateRef.current(nextTab), []);
  const paletteCapture = useCallback(() => navigateRef.current("capture"), []);
  const signOut = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      setAuthState("login");
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
          const returnTo = new URLSearchParams(window.location.search).get(
            "returnTo",
          );
          if (returnTo?.startsWith("/oauth/authorize?"))
            window.location.assign(returnTo);
          else void check();
        }}
      />
    );
  async function submit(event: FormEvent) {
    event.preventDefault();
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
      setCaptureMessage(
        result.retried
          ? "The previous failure was re-queued."
          : result.created
            ? "Added to the processing queue."
            : `Already captured · ${result.job.status}`,
      );
      setCaptureUrl("");
      setNote("");
      setCaptureSubmitted(true);
      await load();
    } catch (e) {
      const errorCode = (e as { body?: { error?: string } }).body?.error;
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
        navigateTo("settings", "replace");
        setSettingsTopic("ai");
      }
    } finally {
      setSubmitting(false);
    }
  }
  const liveWork = activityCounts.active + activityCounts.queued > 0;
  return (
    <div className={`app-frame${tab === "settings" ? " app-frame-settings" : ""}`}>
      <Sidebar
        tab={tab}
        settingsTopic={settingsTopic}
        isAdmin={user?.role === "admin"}
        connectionsNeedAttention={connectionsNeedAttention}
        activityCounts={activityCounts}
        activityJobs={activityJobs}
        userName={user?.displayName || user?.username || "Personal archive"}
        username={user?.username ?? null}
        avatarColor={user?.avatarColor || undefined}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onNavigate={navigateTo}
        onSettingsTopic={(topic) => {
          setSettingsTopic(topic);
          setMobileMenuOpen(false);
        }}
        onBack={() => navigateTo(lastArchiveTab.current)}
        onCapture={openCapture}
        onOpenPalette={() => {
          setMobileMenuOpen(false);
          setPaletteOpen(true);
        }}
        onSignOut={() => void signOut()}
      />
      {mobileMenuOpen && (
        <div
          className="app-sidebar-scrim"
          role="presentation"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <section className="app-workspace">
        <MobileTopbar
          menuOpen={mobileMenuOpen}
          onOpenMenu={() => setMobileMenuOpen(true)}
          onCapture={openCapture}
        />
        <main className="shell" id="main-content">
          {tab === "inbox" && (
            <InboxPage refreshToken={inboxRefresh} onOpen={setDetail} />
          )}
          {tab === "activity" && (
            <div className="activity-view">
              <header className="activity-heading">
                <span className="activity-eyebrow">Activity</span>
                <h1>Capture activity</h1>
                <p>Live progress across every source.</p>
              </header>
              <section className="activity-summary" aria-label="Activity summary">
                {[
                  ["active", activityCounts.active, "Active"],
                  ["queued", activityCounts.queued, "Queued"],
                  ["attention", activityCounts.failed, "Attention"],
                  ["saved", activityCounts.savedToday, "Saved today"],
                ].map(([kind, value, label]) => (
                  <div className={`activity-kpi ${kind}`} key={kind}>
                    <span aria-hidden="true" />
                    <strong>{value}</strong>
                    <small>{label}</small>
                  </div>
                ))}
                <p>{activityCounts.recentEvents} events in the last 10 minutes</p>
              </section>
              {message && <p className="activity-feedback" role="status">{message}</p>}
              <section className="activity-table" aria-label="Capture activity">
                <div className="activity-table-heading">
                  <div>
                    <h2>Captures</h2>
                    <span>Click a row to inspect logs</span>
                  </div>
                  <div className="activity-filters" role="group" aria-label="Activity filter">
                    <button type="button" aria-pressed={activityFilter === "active"} onClick={() => setActivityFilter("active")}>Active</button>
                    <button type="button" aria-pressed={activityFilter === "all"} onClick={() => setActivityFilter("all")}>All</button>
                  </div>
                </div>
                <div className="activity-table-columns" aria-hidden="true">
                  <span>Capture</span><span>Progress</span><span>Status</span><span>Updated</span><span />
                </div>
                {activityLoading && visibleActivityJobs.length === 0 ? (
                  <p className="activity-empty">Loading capture activity…</p>
                ) : activityError ? (
                  <p className="activity-empty" role="alert">{activityError}</p>
                ) : visibleActivityJobs.length === 0 ? (
                  <p className="activity-empty">{activityFilter === "active" ? "No captures processing now." : "No captures yet."}</p>
                ) : (
                  <div className="activity-list">
                    {visibleActivityJobs.map((job) => {
                      const expanded = expandedJobId === job.id;
                      const events = expanded && jobDetails?.job.id === job.id ? jobDetails.events : [];
                      const safeEvents = events
                        .map(safeActivityEvent)
                        .filter((event): event is ActivityEvent => event !== null);
                      return (
                        <article className={`activity-card ${expanded ? "expanded" : ""} ${highlightedJob === job.id ? "highlighted" : ""}`} key={job.id}>
                          <button type="button" className="activity-row-trigger" aria-expanded={expanded} aria-controls={`activity-log-${job.id}`} onClick={() => setExpandedJobId(expanded ? null : job.id)}>
                            <span className="activity-row-copy"><span className={`activity-source-dot ${platformFor(job.normalizedUrl)}`} aria-hidden="true" /><span><strong>{job.displayTitle || sourceReference(job.normalizedUrl)}</strong><small>{sourceLabel(job.normalizedUrl)}</small></span></span>
                            <span className="activity-stages" aria-label="Processing stages">
                              {activityStages.map((stage) => {
                                const stageState = job.stages.find((item) => item.name === stage);
                                const state = stageState?.state ?? "queued";
                                const duration = formatStageDuration(stageState);
                                return <span className={`activity-stage ${state}`} title={`${activityStageCopy[stage]} · ${duration}`} aria-label={`${activityStageCopy[stage]}: ${state}, ${duration}`} key={stage}><span className="activity-stage-marker" /><span className="activity-stage-label">{activityStageCopy[stage]}</span></span>;
                              })}
                            </span>
                            <span className={`activity-status ${job.status === "failed" ? "failed" : ""}`}>{job.status === "failed" ? failureFor(job).title : activityStatusCopy[job.status] || "Processing"}</span>
                            <time className="activity-updated" dateTime={job.updatedAt}>{formatActivityTime(job.updatedAt)}</time>
                            <ChevronDown className="activity-row-chevron" aria-hidden="true" />
                          </button>
                          {expanded && (
                            <div className="activity-inline-log" id={`activity-log-${job.id}`}>
                              <div className="activity-inline-log-heading"><div><strong>Processing logs</strong><span>{(job.attempts > 0 || (job.status !== "failed" && safeEvents.some((event) => event.state === "failed"))) ? "Includes previous attempts" : "Current capture"}</span></div><button type="button" onClick={() => void copyActivityLogs(events)}><Copy aria-hidden="true" /> Copy logs</button></div>
                              {copyFeedback && <p className="activity-copy-feedback" role="status">{copyFeedback}</p>}
                              {detailsLoading && events.length === 0 ? <p>Loading logs…</p> : detailsError ? <p role="alert">Logs are unavailable. Close and reopen this capture to retry.</p> : safeEvents.length > 0 ? (
                                <ol tabIndex={0} aria-label="Processing log entries">
                                  {safeEvents.map((event) => <li key={event.id}><span className={`activity-log-dot ${event.state}`} aria-hidden="true" /><time className="activity-log-time" dateTime={event.createdAt}>{formatEventTime(event.createdAt)}</time><strong>{event.label}{event.attempt && <small className="activity-log-attempt">Attempt {event.attempt}</small>}</strong><span className="activity-log-message">{event.message || "—"}</span><span className="activity-log-duration">{formatEventDuration(event)}</span></li>)}
                                </ol>
                              ) : <p>Safe processing events will appear here.</p>}
                              <div className="activity-stage-durations" aria-label="Stage durations">
                                {activityStages.map((stage) => {
                                  const stageState = job.stages.find((item) => item.name === stage);
                                  const duration = formatStageDuration(stageState);
                                  return <span key={stage}><strong>{activityStageCopy[stage]}</strong> {duration}</span>;
                                })}
                              </div>
                              <p className="activity-log-touch-hint">Stage durations are shown here for touch access.</p>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
                {activityNextCursor && <button type="button" className="activity-load-more" disabled={activityLoadingMore} onClick={() => void loadActivityPage(activityFilter, true)}>{activityLoadingMore ? "Loading…" : "Load more captures"}</button>}
              </section>
              <section className="activity-attention" aria-labelledby="attention-title">
                <div className="activity-attention-heading">
                  <div><h2 id="attention-title">Needs attention</h2><span>{attentionTotal} {attentionTotal === 1 ? "item" : "items"}</span><small>Highest priority first</small></div>
                  <button type="button" onClick={() => void retryAll()} disabled={retryPending || attentionTotal === 0}><RotateCw aria-hidden="true" />{retryPending ? "Retrying…" : "Retry all"}</button>
                </div>
                <div className="activity-attention-list" role="list">
                  {failedError ? <p role="alert">Unable to load failures. <button type="button" onClick={() => void loadFailedJobs()}>Retry list</button></p> : failedJobs.length === 0 ? <p>Nothing needs attention.</p> : failedJobs.map((job) => (
                    <div className="activity-attention-item" role="listitem" key={job.id}>
                      <span className="activity-attention-dot" aria-hidden="true" />
                      <div><strong>{job.displayTitle || sourceReference(job.normalizedUrl)}</strong><small>{sourceLabel(job.normalizedUrl)} · {failureFor(job).message}</small></div>
                      <span className="activity-retry-count">{job.attempts} manual {job.attempts === 1 ? "retry" : "retries"}</span>
                      {job.errorCode !== "unsupported_platform" && <button type="button" disabled={retryPending || retryingIds.includes(job.id)} onClick={() => void retryJob(job)}>{retryingIds.includes(job.id) ? "Retrying…" : "Retry"}</button>}
                    </div>
                  ))}
                  {failedNextCursor && <button type="button" className="activity-failed-more" disabled={failedLoadingMore} onClick={() => void loadFailedJobs(true)}>{failedLoadingMore ? "Loading…" : "Load more"}</button>}
                </div>
              </section>
            </div>
          )}
          {tab === "library" && <Library onOpen={setDetail} />}
          {tab === "ask" && <AskAI onOpen={setDetail} />}
          {tab === "settings" && <Settings user={user} onUserChange={setUser} onSignOut={signOut} topic={settingsTopic} onTopicChange={setSettingsTopic} />}
        </main>
        <MobileTabBar tab={tab} live={liveWork} onNavigate={navigateTo} />
      </section>
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
          submitted={captureSubmitted}
          message={captureMessage}
          error={captureError}
          onSubmit={submit}
          onClose={closeCapture}
          onCaptureAnother={() => {
            setCaptureSubmitted(false);
            setCaptureMessage("");
          }}
          onViewActivity={() => navigateTo("activity", "replace")}
        />
      )}
      {paletteOpen && (
        <CommandPalette
          onClose={closePalette}
          onNavigate={paletteNavigate}
          onCapture={paletteCapture}
        />
      )}
      {detail && <Detail id={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
