import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  Bot,
  Command,
  Database,
  Inbox,
  KeyRound,
  LibraryBig,
  Link2,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Compass,
  Settings as SettingsIcon,
  Sparkles,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import type {
  ActivityCounts,
  ActivityJob,
  AppTab,
  SettingsTopic,
} from "../shared/types";
import { Avatar, Keycap, cx } from "../components/ui/primitives";
import {
  SidebarCollapseButton,
  SidebarRail,
  SidebarResizeHandle,
  useResizableSidebar,
} from "../components/resizable-sidebar";
import {
  APP_SIDEBAR,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_CONTENT_RESERVE,
  SIDEBAR_DESKTOP_QUERY,
} from "../sidebar-layout";

export type AppDestination = Exclude<AppTab, "capture" | "settings">;

export const appDestinations: Array<{
  tab: AppDestination;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  shortcut: string;
  group: "library" | "assistant";
}> = [
  { tab: "inbox", label: "Inbox", shortLabel: "Inbox", icon: Inbox, shortcut: "i", group: "library" },
  { tab: "activity", label: "Activity", shortLabel: "Activity", icon: Activity, shortcut: "a", group: "library" },
  { tab: "library", label: "Knowledge base", shortLabel: "Knowledge", icon: LibraryBig, shortcut: "k", group: "library" },
  { tab: "ask", label: "Ask", shortLabel: "Ask", icon: Sparkles, shortcut: "q", group: "assistant" },
];

export type SidebarSettingsTopic = Extract<
  SettingsTopic,
  "account" | "ai" | "connections" | "api" | "data" | "people"
>;

const settingsGroups: Array<{
  label: string;
  adminOnly?: boolean;
  topics: Array<{ id: SidebarSettingsTopic; label: string; icon: LucideIcon }>;
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

const stageVerbs: Record<string, string> = {
  downloading: "Fetching",
  processing: "Preparing",
  transcribing: "Transcribing",
  translating: "Translating",
  analyzing: "Analysing",
  writing: "Filing",
};

const pipelineOrder = Object.keys(stageVerbs);

function jobSubject(job: ActivityJob) {
  if (job.displayTitle) return job.displayTitle;
  try {
    const url = new URL(job.normalizedUrl);
    const platform = url.hostname.includes("facebook") || url.hostname === "fb.watch" ? "Facebook" : url.hostname.includes("instagram") ? "Instagram" : "the source";
    const kind = /\/(reel|reels|r)\//.test(url.pathname) ? "reel" : "post";
    return `${kind} from ${platform}`;
  } catch {
    return "post";
  }
}

/** The in-flight job closest to finishing, oldest first on ties. */
export function currentProcessingJob(jobs: ActivityJob[]) {
  return (
    jobs
      .filter((job) => Object.hasOwn(stageVerbs, job.status))
      .sort(
        (a, b) =>
          jobProgress(b) - jobProgress(a) ||
          pipelineOrder.indexOf(b.status) - pipelineOrder.indexOf(a.status) ||
          Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
          a.id.localeCompare(b.id),
      )[0] ?? null
  );
}

export function jobProgress(job: ActivityJob | null) {
  if (!job || job.stages.length === 0) return 0;
  const done = job.stages.filter((stage) => stage.state === "completed").length;
  const active = job.stages.some((stage) => stage.state === "active") ? 0.5 : 0;
  return Math.min(1, (done + active) / job.stages.length);
}

function ShortcutHint({ keys }: { keys: string }) {
  return (
    <span className="app-nav-shortcut" aria-hidden="true">
      <Keycap>G</Keycap>
      <Keycap>{keys.toUpperCase()}</Keycap>
    </span>
  );
}

function NavRow({
  icon: Icon,
  label,
  active,
  onClick,
  dataTab,
  ariaLabel,
  children,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  dataTab?: string;
  ariaLabel?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cx("app-nav-row", active && "active")}
      data-tab={dataTab}
      aria-label={ariaLabel ?? label}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <Icon className="app-nav-icon" size={17} aria-hidden="true" />
      <span className="app-nav-label">{label}</span>
      {children}
    </button>
  );
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="app-nav-group" role="group" aria-label={label}>
      <span className="app-nav-group-label" aria-hidden="true">
        {label}
      </span>
      {children}
    </div>
  );
}

export function ProcessingCard({
  counts,
  jobs,
  onView,
}: {
  counts: ActivityCounts;
  jobs: ActivityJob[];
  onView: () => void;
}) {
  const inFlight = counts.active + counts.queued;
  if (inFlight === 0) return null;
  const job = currentProcessingJob(jobs);
  const progress = jobProgress(job);
  const title =
    counts.active > 0
      ? `Processing ${counts.active} ${counts.active === 1 ? "post" : "posts"}`
      : `${counts.queued} ${counts.queued === 1 ? "post" : "posts"} queued`;
  const caption = job
    ? `${stageVerbs[job.status]} ${jobSubject(job)}`
    : "Waiting for the next worker";
  return (
    <section className="app-processing" aria-label="Processing">
      <div className="app-processing-head">
        <LoaderCircle className="app-processing-spinner" size={15} aria-hidden="true" />
        <strong aria-live="polite">{title}</strong>
        <button type="button" className="app-processing-view" aria-label="View processing in Activity" onClick={onView}>
          View
        </button>
      </div>
      <div
        className="app-processing-track"
        role="progressbar"
        aria-label="Current capture progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <p className="app-processing-caption">{caption}</p>
    </section>
  );
}

function AccountRow({
  name,
  username,
  avatarColor,
  settingsActive,
  onOpenSettings,
  onSignOut,
}: {
  name: string;
  username: string | null;
  avatarColor: string | undefined;
  settingsActive: boolean;
  onOpenSettings: () => void;
  onSignOut: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setMenuOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [menuOpen]);
  return (
    <div className="app-profile">
      <button
        ref={triggerRef}
        type="button"
        className="app-account-trigger"
        aria-label="Open account menu"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(true)}
      >
        <Avatar name={name} color={avatarColor} size={28} />
        <span className="app-profile-name">{name}</span>
      </button>
      <button
        type="button"
        className={cx("app-profile-settings", settingsActive && "active")}
        aria-label="Open Settings"
        aria-current={settingsActive ? "page" : undefined}
        onClick={onOpenSettings}
      >
        <SettingsIcon size={16} aria-hidden="true" />
      </button>
      {menuOpen && (
        <div
          className="app-account-menu-layer"
          role="presentation"
          onClick={() => setMenuOpen(false)}
        >
          <div
            ref={menuRef}
            className="app-account-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-menu-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="app-account-menu-heading">
              <Avatar name={name} color={avatarColor} size={32} />
              <span>
                <strong id="account-menu-title">{name}</strong>
                {username && <small>@{username}</small>}
              </span>
            </div>
            <button
              type="button"
              className="app-account-menu-item"
              onClick={() => {
                setMenuOpen(false);
                onSignOut();
              }}
            >
              <LogOut size={15} aria-hidden="true" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export type SidebarProps = {
  tab: AppTab;
  settingsTopic: SettingsTopic;
  isAdmin: boolean;
  connectionsNeedAttention: boolean;
  activityCounts: ActivityCounts;
  activityJobs: ActivityJob[];
  userName: string;
  username: string | null;
  avatarColor: string | undefined;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onNavigate: (tab: AppTab) => void;
  onSettingsTopic: (topic: SidebarSettingsTopic) => void;
  onBack: () => void;
  onCapture: () => void;
  onOpenPalette: () => void;
  onSignOut: () => void;
};

export function Sidebar(props: SidebarProps) {
  const sidebar = useResizableSidebar("social-knowledge-app-sidebar", APP_SIDEBAR, {
    desktopQuery: SIDEBAR_DESKTOP_QUERY,
    contentReserve: SIDEBAR_CONTENT_RESERVE,
  });
  const {
    tab,
    settingsTopic,
    isAdmin,
    connectionsNeedAttention,
    activityCounts,
    activityJobs,
    mobileOpen,
    onCloseMobile,
    onNavigate,
  } = props;
  const settingsMode = tab === "settings";
  const live = activityCounts.active + activityCounts.queued > 0;
  const activeTab = tab === "capture" ? "inbox" : tab;
  const collapsed = sidebar.collapsed;
  return (
    <aside
      ref={sidebar.layoutRef}
      className={cx(
        "app-sidebar",
        settingsMode && "app-sidebar-settings",
        mobileOpen && "open",
        collapsed && "is-collapsed",
      )}
      style={
        sidebar.desktop
          ? { width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebar.width }
          : undefined
      }
      aria-label={settingsMode ? "Settings navigation" : "Archive navigation"}
    >
      <button type="button" className="app-sidebar-close" aria-label="Close menu" onClick={onCloseMobile}>
        <X size={18} aria-hidden="true" />
      </button>
      {sidebar.desktop && collapsed && (
        <SidebarRail label="sidebar" buttonRef={sidebar.expandRef} onClick={sidebar.expand} />
      )}
      {settingsMode ? (
        <>
          {sidebar.desktop && !collapsed && (
            <SidebarCollapseButton
              label="sidebar"
              buttonRef={sidebar.collapseRef}
              onClick={sidebar.collapse}
            />
          )}
          <button type="button" className="app-sidebar-back" onClick={props.onBack}>
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Back to archive</span>
          </button>
          <h2 className="app-sidebar-title">Settings</h2>
          <nav className="app-nav" aria-label="Settings sections">
            {settingsGroups
              .filter((group) => !group.adminOnly || isAdmin)
              .map((group) => (
                <NavGroup label={group.label} key={group.label}>
                  {group.topics.map((topic) => (
                    <NavRow
                      icon={topic.icon}
                      label={topic.label}
                      active={settingsTopic === topic.id}
                      onClick={() => props.onSettingsTopic(topic.id)}
                      ariaLabel={topic.id === "connections" && connectionsNeedAttention ? undefined : topic.label}
                      key={topic.id}
                    >
                      {topic.id === "connections" && connectionsNeedAttention && (
                        <>
                          <span className="app-nav-dot warn" aria-hidden="true" />
                          <span className="sr-only">, needs attention</span>
                        </>
                      )}
                    </NavRow>
                  ))}
                </NavGroup>
              ))}
          </nav>
        </>
      ) : (
        <>
          <div className="app-brand">
            <span className="app-brand-mark" aria-hidden="true">
              <LibraryBig size={12} />
            </span>
            <span className="app-wordmark">social knowledge</span>
            {sidebar.desktop && !collapsed && (
              <SidebarCollapseButton
                label="sidebar"
                buttonRef={sidebar.collapseRef}
                onClick={sidebar.collapse}
              />
            )}
            <button type="button" className="app-brand-capture" aria-label="Capture a post" onClick={props.onCapture}>
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
          <button type="button" className="app-command" aria-label="Go to a page or action (⌘K)" aria-haspopup="dialog" onClick={props.onOpenPalette}>
            <Compass size={15} aria-hidden="true" />
            <span className="app-command-label">Go to…</span>
            <Keycap className="app-command-keycap" aria-hidden="true">
              <Command size={9} strokeWidth={2.4} />K
            </Keycap>
          </button>
          <nav className="app-nav" aria-label="Primary navigation">
            {(["library", "assistant"] as const).map((group) => (
              <NavGroup label={group === "library" ? "Library" : "Assistant"} key={group}>
                {appDestinations
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <NavRow
                      icon={item.icon}
                      label={item.label}
                      active={activeTab === item.tab}
                      onClick={() => onNavigate(item.tab)}
                      dataTab={item.tab}
                      key={item.tab}
                    >
                      {item.tab === "activity" && live && (
                        <span className="app-nav-dot" title={`${activityCounts.active + activityCounts.queued} in flight`} aria-hidden="true" />
                      )}
                      <ShortcutHint keys={item.shortcut} />
                    </NavRow>
                  ))}
              </NavGroup>
            ))}
          </nav>
        </>
      )}
      <div className="app-sidebar-spacer" />
      <ProcessingCard counts={activityCounts} jobs={activityJobs} onView={() => onNavigate("activity")} />
      <AccountRow
        name={props.userName}
        username={props.username}
        avatarColor={props.avatarColor}
        settingsActive={settingsMode}
        onOpenSettings={() => onNavigate("settings")}
        onSignOut={props.onSignOut}
      />
      {sidebar.desktop && !collapsed && (
        <SidebarResizeHandle
          label="Sidebar width"
          width={sidebar.width}
          minWidth={sidebar.minWidth}
          maxWidth={sidebar.maxWidth}
          onResize={sidebar.resize}
          onReset={sidebar.resetWidth}
        />
      )}
    </aside>
  );
}

export function MobileTopbar({
  onOpenMenu,
  onCapture,
  menuOpen,
}: {
  onOpenMenu: () => void;
  onCapture: () => void;
  menuOpen: boolean;
}) {
  return (
    <div className="app-topbar">
      <button type="button" className="app-menu-trigger" aria-label="Open menu" aria-expanded={menuOpen} onClick={onOpenMenu}>
        <Menu size={18} aria-hidden="true" />
      </button>
      <span className="app-brand-mark" aria-hidden="true">
        <LibraryBig size={12} />
      </span>
      <span className="app-wordmark">social knowledge</span>
      <button type="button" className="app-brand-capture" aria-label="Capture a post" onClick={onCapture}>
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export function MobileTabBar({
  tab,
  live,
  onNavigate,
}: {
  tab: AppTab;
  live: boolean;
  onNavigate: (tab: AppTab) => void;
}) {
  const activeTab = tab === "capture" ? "inbox" : tab;
  return (
    <nav className="app-tabbar" aria-label="Mobile navigation">
      {appDestinations.map(({ tab: next, label, shortLabel, icon: Icon }) => (
        <button
          type="button"
          aria-label={label}
          className={activeTab === next ? "active" : ""}
          aria-current={activeTab === next ? "page" : undefined}
          onClick={() => onNavigate(next)}
          key={next}
        >
          <Icon size={18} aria-hidden="true" />
          <span>{shortLabel}</span>
          {next === "activity" && live && <span className="app-nav-dot" aria-hidden="true" />}
        </button>
      ))}
    </nav>
  );
}
