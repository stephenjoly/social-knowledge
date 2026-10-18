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
} from "lucide-react";
import type {
  ActivityJob,
  ActivityDetails,
  ActivityCounts,
  ActivityPage,
  FailedActivityPage,
  AppTab,
  PlatformConnection,
  SettingsTopic,
} from "./shared/types";
import { api } from "./shared/api";
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
import { ActivityView } from "./pages/activity";
import type { AccountUser } from "./account-settings";
import "./styles.css";
import "./auth-redesign.css";
import "./knowledge-ask.css";
import "./settings.css";
import "./inbox.css";
import "./typography.css";
import "./shell.css";

/** `?tab=capture` opens the dialog over Inbox. */
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
  const [activityFilter, setActivityFilter] = useState<"active" | "all">("all");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(highlightedJob);
  const [jobDetails, setJobDetails] = useState<ActivityDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
  const detailsRequest = useRef(0);
  const lastNewestActive = useRef<string | null>(null);
  const [retryPending, setRetryPending] = useState(false);
  const [retryingIds, setRetryingIds] = useState<string[]>([]);
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
    const keepLinkedJob = lastNewestActive.current === null && highlightedJob;
    if (newestActiveId && newestActiveId !== lastNewestActive.current && !keepLinkedJob) {
      setExpandedJobId(newestActiveId);
    }
    lastNewestActive.current = newestActiveId;
  }, [newestActiveId]);
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
            <ActivityView
              jobs={visibleActivityJobs}
              counts={activityCounts}
              loading={activityLoading}
              loadingMore={activityLoadingMore}
              error={activityError}
              nextCursor={activityNextCursor}
              onLoadMore={() => void loadActivityPage(activityFilter, true)}
              filter={activityFilter}
              onFilterChange={setActivityFilter}
              failedJobs={failedJobs}
              attentionTotal={attentionTotal}
              failedError={failedError}
              failedNextCursor={failedNextCursor}
              failedLoadingMore={failedLoadingMore}
              onLoadMoreFailed={() => void loadFailedJobs(true)}
              onReloadFailed={() => void loadFailedJobs()}
              selectedJobId={expandedJobId}
              onSelectJob={setExpandedJobId}
              jobDetails={jobDetails}
              detailsLoading={detailsLoading}
              detailsError={detailsError}
              highlightedJobId={highlightedJob}
              message={message}
              retryPending={retryPending}
              retryingIds={retryingIds}
              onRetry={(job) => void retryJob(job)}
              onRetryAll={() => void retryAll()}
              onFixConnection={() => {
                setSettingsTopic("connections");
                navigateTo("settings");
              }}
            />
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
