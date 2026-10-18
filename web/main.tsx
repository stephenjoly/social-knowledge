import {
  FormEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  LogOut,
  Plus,
  RotateCw,
  Search,
  Settings as SettingsIcon,
  UserRound,
  X,
} from "lucide-react";
import type {
  Capture,
  ActivityStageName,
  ActivityStage,
  ActivityJob,
  ActivityEvent,
  ActivityDetails,
  ActivityCounts,
  ActivityPage,
  FailedActivityPage,
  CaptureFacets,
  InboxView,
  InboxSortKey,
  AppTab,
  SettingsTopic,
} from "./shared/types";
import { api } from "./shared/api";
import { platformFor, formatPreciseDuration } from "./shared/format";
import { Auth, ProviderOnboarding } from "./pages/auth";
import {
  inboxSortOptions,
  CaptureCard,
  CaptureTableRow,
  CaptureMobileRow,
  InboxLoadingCards,
} from "./pages/inbox";
import { Detail } from "./pages/capture-detail";
import { Settings } from "./pages/settings";
import { Library } from "./pages/library";
import { AskAI } from "./pages/ask";
import { AppNavigation } from "./pages/app-shell";
import type { AccountUser } from "./account-settings";
import "./styles.css";
import "./activity-capture.css";
import "./auth-redesign.css";
import "./knowledge-ask.css";
import "./settings.css";
import "./inbox.css";
import "./typography.css";

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

function tabFromLocation(): AppTab {
  const value = new URLSearchParams(window.location.search).get("tab");
  return value === "library" ||
    value === "ask" ||
    value === "activity" ||
    value === "capture" ||
    value === "settings"
    ? value
    : "inbox";
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
  const [settingsTopic, setSettingsTopic] = useState<SettingsTopic>("overview");
  const highlightedJob = new URLSearchParams(window.location.search).get("job");
  const [captures, setCaptures] = useState<Capture[]>([]);
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
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [platform, setPlatform] = useState("");
  const [category, setCategory] = useState("");
  const [topic, setTopic] = useState("");
  const [inboxView, setInboxView] = useState<InboxView>(() => {
    try {
      return window.localStorage.getItem("social-knowledge:inbox-view") ===
        "table"
        ? "table"
        : "tiles";
    } catch {
      return "tiles";
    }
  });
  const [sort, setSort] = useState<InboxSortKey>("savedAt");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [filterBuilderOpen, setFilterBuilderOpen] = useState(false);
  const [facets, setFacets] = useState<CaptureFacets>({
    categories: [],
    topics: [],
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const inboxRequest = useRef(0);
  const liveRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inboxFilters = useRef({
    search: "",
    platform: "",
    category: "",
    topic: "",
  });
  const inboxPresentation = useRef<{
    sort: InboxSortKey;
    direction: "asc" | "desc";
  }>({ sort: "savedAt", direction: "desc" });
  const [detail, setDetail] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [captureUrl, setCaptureUrl] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
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
  async function loadInboxPage(append = false) {
    const requestId = ++inboxRequest.current;
    const cursor = append ? nextCursor : null;
    if (append && !cursor) return;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoadingInbox(true);
      setLoadingMore(false);
      setCaptures([]);
      setNextCursor(null);
      setInboxError(null);
    }
    const query = new URLSearchParams({ limit: "48" });
    const filters = inboxFilters.current;
    if (filters.search) query.set("search", filters.search);
    if (filters.platform) query.set("platform", filters.platform);
    if (filters.category) query.set("nodeId", filters.category);
    if (filters.topic) query.set("topic", filters.topic);
    query.set("sort", inboxPresentation.current.sort);
    query.set("direction", inboxPresentation.current.direction);
    if (cursor) query.set("cursor", cursor);
    try {
      const page = await api<{
        captures: Capture[];
        nextCursor: string | null;
      }>(`/api/v1/captures?${query}`);
      if (requestId !== inboxRequest.current) return;
      setCaptures((current) => {
        if (!append) return page.captures;
        const existing = new Set(current.map((capture) => capture.id));
        return [
          ...current,
          ...page.captures.filter((capture) => !existing.has(capture.id)),
        ];
      });
      setNextCursor(page.nextCursor);
      setInboxError(null);
    } catch (error) {
      if (requestId === inboxRequest.current)
        setInboxError(
          append
            ? "Unable to load more captures. Try again."
            : "Unable to load captures. Try again.",
        );
    } finally {
      if (requestId === inboxRequest.current) {
        if (append) setLoadingMore(false);
        else setLoadingInbox(false);
      }
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
  async function loadSupportingData() {
    const facets = await api<CaptureFacets>("/api/v1/capture-facets");
    setFacets(facets);
  }
  async function load() {
    await Promise.all([
      loadInboxPage(),
      loadSupportingData(),
      loadActivityPage(),
      loadFailedJobs(),
    ]);
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
    inboxFilters.current = {
      search: deferredSearch,
      platform,
      category,
      topic,
    };
    inboxPresentation.current = { sort, direction };
    void loadInboxPage();
  }, [authState, deferredSearch, platform, category, topic, sort, direction]);
  useEffect(() => {
    try {
      window.localStorage.setItem("social-knowledge:inbox-view", inboxView);
    } catch {
      // Keep this preference optional when storage is unavailable.
    }
  }, [inboxView]);
  useEffect(() => {
    if (authState !== "ready") return;
    void loadSupportingData();
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
  const hasInboxFilters = Boolean(search || platform || category || topic);
  const activeCategory =
    facets.categories.find((facet) => facet.id === category)?.label ?? null;
  const selectedSort = inboxSortOptions.find((option) => option.key === sort)!;
  const sortValue = `${sort}:${direction}`;
  const applySort = (nextSort: InboxSortKey) => {
    if (nextSort === sort) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(nextSort);
    setDirection(nextSort === "savedAt" ? "desc" : "asc");
  };
  const activeJobCount = activityCounts.active;
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
  const profileInitial = (user?.displayName || user?.username || "S")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const navigateTo = (
    nextTab: AppTab,
    historyMode: "push" | "replace" = "push",
  ) => {
    if (nextTab === "capture") {
      setMessage("");
      setCaptureError(false);
      setCaptureSubmitted(false);
    }
    setTab(nextTab);
    setMobileMenuOpen(false);
    const nextUrl = new URL(window.location.href);
    if (nextTab === "inbox") nextUrl.searchParams.delete("tab");
    else nextUrl.searchParams.set("tab", nextTab);
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
  useEffect(() => {
    const restore = () => {
      const nextTab = tabFromLocation();
      if (nextTab === "capture") {
        setCaptureSubmitted(false);
        setMessage("");
      }
      setTab(nextTab);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (tab !== "capture") return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") navigateTo("inbox", "replace");
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [tab]);
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
    setMessage("Submitting…");
    try {
      const result = await api<{
        created: boolean;
        retried?: boolean;
        job: ActivityJob;
      }>("/api/v1/jobs", {
        method: "POST",
        body: JSON.stringify({ url: captureUrl, note: note || undefined }),
      });
      setMessage(
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
      setMessage(
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
      if (providerRequired) navigateTo("settings", "replace");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">
          <span className="app-wordmark">social knowledge</span>
          <span className="app-workspace-label">Private archive</span>
        </div>
        <AppNavigation
          tab={tab}
          activeCount={activeJobCount}
          onNavigate={navigateTo}
        />
        <div className="app-profile">
          <button
            type="button"
            className="app-account-trigger"
            aria-label="Open account menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="app-avatar" style={{ background: user?.avatarColor || undefined, color: user?.avatarColor ? "#fff" : undefined }} aria-hidden="true">{profileInitial}</span>
            <span className="app-profile-copy">
              <strong>{user?.displayName || user?.username || "Personal archive"}</strong>
              <small>{tab === "settings" ? "Account" : "Personal workspace"}</small>
            </span>
            <ChevronDown aria-hidden="true" />
          </button>
          <button
            type="button"
            className="app-profile-settings"
            aria-label="Open Settings"
            onClick={() => navigateTo("settings")}
          >
            <SettingsIcon aria-hidden="true" />
          </button>
        </div>
      </aside>
      <section className="app-workspace">
        <header className="app-topbar">
          <button
            type="button"
            className="app-menu-trigger"
            aria-label="Open account menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="app-avatar" style={{ background: user?.avatarColor || undefined, color: user?.avatarColor ? "#fff" : undefined }} aria-hidden="true">{profileInitial}</span>
            <ChevronRight aria-hidden="true" />
          </button>
          <span className="app-mobile-wordmark">social knowledge</span>
          {(tab === "inbox" || tab === "capture") && <button
            type="button"
            className="app-capture"
            aria-label="Capture a post"
            onClick={() => navigateTo("capture")}
          >
            <Plus aria-hidden="true" />
            <span>Capture link</span>
          </button>}
        </header>
        <main className="shell">
          {(tab === "inbox" || tab === "capture") && (
            <section className="inbox-page" aria-labelledby="inbox-title">
              <div className="inbox-hero">
                <div className="eyebrow">Your archive</div>
                <h1 id="inbox-title">Inbox</h1>
                <p>The posts you chose to keep, ready when you need them.</p>
                <button
                  type="button"
                  className="inbox-mobile-capture"
                  aria-label="Capture a post"
                  onClick={() => navigateTo("capture")}
                >
                  <Plus aria-hidden="true" /> Capture
                </button>
              </div>
              <section
                className="inbox-collection"
                aria-labelledby="captures-heading"
              >
                <header className="inbox-collection-heading">
                  <div>
                    <h2 id="captures-heading">Captures</h2>
                  </div>
                </header>
                <div className="inbox-filter-panel">
                  <div className="inbox-toolbar">
                    <label className="filter-search">
                      <Search aria-hidden="true" />
                      <span className="sr-only">Search your archive</span>
                      <input
                        placeholder="Search titles, notes, or creators"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      {search && (
                        <button
                          type="button"
                          aria-label="Clear search"
                          onClick={() => setSearch("")}
                        >
                          <X aria-hidden="true" />
                        </button>
                      )}
                    </label>
                    <div className="inbox-toolbar-actions">
                      <button
                        type="button"
                        className="inbox-filter-trigger"
                        aria-expanded={filterBuilderOpen}
                        aria-controls="inbox-filter-builder"
                        onClick={() => setFilterBuilderOpen(true)}
                      >
                        + Add filter
                      </button>
                      <label className="inbox-sort-control">
                        <span className="sr-only">Sort captures</span>
                        <select
                          aria-label="Sort captures"
                          value={sortValue}
                          onChange={(event) => {
                            const [nextSort, nextDirection] =
                              event.target.value.split(":") as [
                                InboxSortKey,
                                "asc" | "desc",
                              ];
                            setSort(nextSort);
                            setDirection(nextDirection);
                          }}
                        >
                          {inboxSortOptions.flatMap((option) => [
                            <option
                              key={`${option.key}:desc`}
                              value={`${option.key}:desc`}
                            >
                              {option.descending}
                            </option>,
                            <option
                              key={`${option.key}:asc`}
                              value={`${option.key}:asc`}
                            >
                              {option.ascending}
                            </option>,
                          ])}
                        </select>
                      </label>
                      <div
                        className="inbox-view-toggle"
                        role="group"
                        aria-label="Capture view"
                      >
                        <button
                          type="button"
                          className={inboxView === "tiles" ? "active" : ""}
                          aria-pressed={inboxView === "tiles"}
                          onClick={() => setInboxView("tiles")}
                        >
                          <span aria-hidden="true">▦</span>
                          <span>Tiles</span>
                        </button>
                        <button
                          type="button"
                          className={inboxView === "table" ? "active" : ""}
                          aria-pressed={inboxView === "table"}
                          onClick={() => setInboxView("table")}
                        >
                          <span aria-hidden="true">☷</span>
                          <span>Table</span>
                        </button>
                      </div>
                    </div>
                    {filterBuilderOpen && (
                      <div
                        className="inbox-filter-scrim"
                        onMouseDown={(event) => {
                          if (event.target === event.currentTarget)
                            setFilterBuilderOpen(false);
                        }}
                      >
                        <section
                          className="inbox-filter-builder"
                          id="inbox-filter-builder"
                          role="dialog"
                          aria-modal="true"
                          aria-labelledby="inbox-filter-heading"
                        >
                          <header>
                            <div>
                              <span className="eyebrow">Filter captures</span>
                              <h3 id="inbox-filter-heading">Add filter</h3>
                            </div>
                            <button
                              type="button"
                              aria-label="Close filters"
                              onClick={() => setFilterBuilderOpen(false)}
                            >
                              <X aria-hidden="true" />
                            </button>
                          </header>
                          <div className="inbox-filter-fields">
                            <label>
                              <span>Platform</span>
                              <select
                                value={platform}
                                onChange={(event) =>
                                  setPlatform(event.target.value)
                                }
                              >
                                <option value="">Any platform</option>
                                <option value="facebook">Facebook</option>
                                <option value="instagram">Instagram</option>
                              </select>
                            </label>
                            <label>
                              <span>Category</span>
                              <select
                                value={category}
                                onChange={(event) =>
                                  setCategory(event.target.value)
                                }
                              >
                                <option value="">Any category</option>
                                {facets.categories.map((facet) => (
                                  <option value={facet.id} key={facet.id}>
                                    {facet.label} ({facet.count})
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>Topic</span>
                              <select
                                value={topic}
                                onChange={(event) =>
                                  setTopic(event.target.value)
                                }
                              >
                                <option value="">Any topic</option>
                                {facets.topics.map((facet) => (
                                  <option value={facet.label} key={facet.label}>
                                    {facet.label} ({facet.count})
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          {hasInboxFilters && (
                            <button
                              type="button"
                              className="inbox-clear-builder"
                              onClick={() => {
                                setSearch("");
                                setPlatform("");
                                setCategory("");
                                setTopic("");
                              }}
                            >
                              Clear filters
                            </button>
                          )}
                        </section>
                      </div>
                    )}
                  </div>
                </div>
                {hasInboxFilters && (
                  <div
                    className="inbox-active-filters"
                    aria-label="Active filters"
                  >
                    {platform && (
                      <button type="button" onClick={() => setPlatform("")}>
                        Platform: {platform.slice(0, 1).toUpperCase()}
                        {platform.slice(1)} <X aria-hidden="true" />
                      </button>
                    )}
                    {activeCategory && (
                      <button type="button" onClick={() => setCategory("")}>
                        Category: {activeCategory} <X aria-hidden="true" />
                      </button>
                    )}
                    {topic && (
                      <button type="button" onClick={() => setTopic("")}>
                        Topic: {topic} <X aria-hidden="true" />
                      </button>
                    )}
                    {search && (
                      <button type="button" onClick={() => setSearch("")}>
                        Search: {search} <X aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="inbox-clear-all"
                      onClick={() => {
                        setSearch("");
                        setPlatform("");
                        setCategory("");
                        setTopic("");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
                {!loadingInbox && !inboxError && (
                  <p className="capture-count-context" aria-live="polite">
                    {captures.length.toLocaleString()} capture
                    {captures.length === 1 ? "" : "s"} loaded ·{" "}
                    {selectedSort.label}{" "}
                    {direction === "asc" ? "ascending" : "descending"}
                  </p>
                )}
                {loadingInbox ? (
                  <InboxLoadingCards />
                ) : captures.length > 0 ? (
                  inboxView === "tiles" ? (
                    <div className="inbox-tile-grid">
                      {captures.map((capture) => (
                        <CaptureCard
                          capture={capture}
                          categoryLabel={capture.categoryLabel ?? null}
                          onOpen={setDetail}
                          key={capture.id}
                        />
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="inbox-table-wrap">
                        <table className="inbox-capture-table">
                          <caption className="sr-only">
                            Captures sorted by{" "}
                            {selectedSort.label.toLowerCase()}. Select a title
                            to open its details.
                          </caption>
                          <thead>
                            <tr>
                              {inboxSortOptions.map((option) => (
                                <th scope="col" key={option.key}>
                                  <button
                                    type="button"
                                    className={
                                      sort === option.key ? "active" : ""
                                    }
                                    onClick={() => applySort(option.key)}
                                  >
                                    {option.label}
                                    <span aria-hidden="true">
                                      {sort === option.key
                                        ? direction === "asc"
                                          ? "↑"
                                          : "↓"
                                        : "↕"}
                                    </span>
                                  </button>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {captures.map((capture) => (
                              <CaptureTableRow
                                capture={capture}
                                categoryLabel={capture.categoryLabel ?? null}
                                onOpen={setDetail}
                                key={capture.id}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div
                        className="inbox-mobile-rows"
                        aria-label="Capture table rows"
                      >
                        {captures.map((capture) => (
                          <CaptureMobileRow
                            capture={capture}
                            categoryLabel={capture.categoryLabel ?? null}
                            onOpen={setDetail}
                            key={capture.id}
                          />
                        ))}
                      </div>
                    </>
                  )
                ) : null}
                {inboxError && (
                  <div className="pagination-feedback" role="alert">
                    <span>{inboxError}</span>
                    <button
                      type="button"
                      onClick={() => void loadInboxPage(Boolean(nextCursor))}
                      disabled={loadingInbox || loadingMore}
                    >
                      Retry
                    </button>
                  </div>
                )}
                {nextCursor && !inboxError && (
                  <div className="pagination-controls">
                    <button
                      type="button"
                      className="load-more"
                      onClick={() => void loadInboxPage(true)}
                      disabled={loadingMore}
                    >
                      {loadingMore ? "Loading more…" : "Load more"}
                    </button>
                  </div>
                )}
                {!loadingInbox && !captures.length && (
                  <div className="empty">
                    <h2>
                      {hasInboxFilters
                        ? "No captures found"
                        : "Your inbox is ready"}
                    </h2>
                    <p>
                      {hasInboxFilters
                        ? "Try another search or clear your filters."
                        : "Completed captures will appear here."}
                    </p>
                    {hasInboxFilters && (
                      <button
                        type="button"
                        className="inbox-empty-clear"
                        onClick={() => {
                          setSearch("");
                          setPlatform("");
                          setCategory("");
                          setTopic("");
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
              </section>
            </section>
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
          {tab === "capture" && (
            <div
              className="capture-overlay"
              role="presentation"
              onClick={() => navigateTo("inbox", "replace")}
            >
              <section
                className="capture-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="capture-title"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="capture-close"
                  aria-label="Close capture"
                  onClick={() => navigateTo("inbox", "replace")}
                >
                  ×
                </button>
                <div className="capture-eyebrow">New capture</div>
                <div className="capture-intro">
                  <h1 id="capture-title">
                    {captureSubmitted ? "Post submitted" : "Capture a post"}
                  </h1>
                  <p>
                    {captureSubmitted
                      ? "Your post is in the processing queue."
                      : "Paste a post link to save it in your archive."}
                  </p>
                </div>
                {captureSubmitted ? (
                  <div className="capture-success">
                    <p role="status">{message}</p>
                    <button
                      type="button"
                      onClick={() => navigateTo("activity", "replace")}
                    >
                      View activity
                    </button>
                  </div>
                ) : (
                  <form onSubmit={submit}>
                    <label>
                      Post URL
                      <input
                        type="url"
                        required
                        value={captureUrl}
                        onChange={(e) => setCaptureUrl(e.target.value)}
                        placeholder="https://www.instagram.com/reel/..."
                        autoFocus
                      />
                      <small>
                        Supports public and connected-account posts.
                      </small>
                    </label>
                    <label>
                      <span>
                        Why are you saving it?{" "}
                        <span className="capture-optional">Optional</span>
                      </span>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Add a note for your future self"
                      />
                    </label>
                    <p className="capture-hint">
                      We'll show progress in Activity.
                    </p>
                    <div className="capture-actions">
                      <button
                        type="button"
                        className="capture-cancel"
                        onClick={() => navigateTo("inbox", "replace")}
                      >
                        Cancel
                      </button>
                      <button disabled={submitting}>
                        {submitting ? "Submitting…" : "Capture post"}
                      </button>
                    </div>
                    {message && (
                      <p
                        className={`capture-feedback ${captureError ? "error" : ""}`}
                        role={captureError ? "alert" : "status"}
                      >
                        {message}
                      </p>
                    )}
                  </form>
                )}
              </section>
            </div>
          )}
          {tab === "settings" && <Settings user={user} onUserChange={setUser} onSignOut={signOut} topic={settingsTopic} onTopicChange={setSettingsTopic} />}
        </main>
      </section>
      {mobileMenuOpen && (
        <div
          className="app-account-menu-layer"
          role="presentation"
          onClick={() => setMobileMenuOpen(false)}
        >
          <section
            className="app-account-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-menu-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="app-account-menu-heading">
              <div>
                <span className="app-avatar" style={{ background: user?.avatarColor || undefined, color: user?.avatarColor ? "#fff" : undefined }} aria-hidden="true">
                  {profileInitial}
                </span>
                <span>
                  <strong id="account-menu-title">
                    {user?.displayName || user?.username || "Personal archive"}
                  </strong>
                  <small>{tab === "settings" ? "Account" : "Personal workspace"}</small>
                </span>
              </div>
            </div>
            <button
              type="button"
              className="app-account-menu-item"
              onClick={() => navigateTo("settings")}
            >
              <UserRound aria-hidden="true" />
              Profile
            </button>
            <button
              type="button"
              className="app-account-menu-item"
              onClick={() => navigateTo("settings")}
            >
              <SettingsIcon aria-hidden="true" />
              Settings
            </button>
            <button
              type="button"
              className="app-account-menu-item account-menu-signout"
              onClick={() => void signOut()}
            >
              <LogOut aria-hidden="true" />
              Log out
            </button>
          </section>
        </div>
      )}
      {detail && <Detail id={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
