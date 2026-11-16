import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import {
  Activity,
  Command,
  Compass,
  Ellipsis,
  Inbox,
  LibraryBig,
  LoaderCircle,
  LogOut,
  Menu,
  PenLine,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings as SettingsIcon,
  Share,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import type {
  ActivityCounts,
  ActivityJob,
  AppTab,
  Conversation,
} from "../shared/types";
import {
  filterConversations,
  groupConversations,
  highlightParts,
  type ConversationsController,
} from "../shared/conversations";
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
  isAdmin: boolean;
  connectionsNeedAttention: boolean;
  activityCounts: ActivityCounts;
  activityJobs: ActivityJob[];
  userName: string;
  username: string | null;
  avatarColor: string | undefined;
  mobileOpen: boolean;
  onOpenMobile: () => void;
  onCloseMobile: () => void;
  onNavigate: (tab: AppTab) => void;
  chats: ConversationsController;
  /** Each increment focuses Search chats (the `/` shortcut). */
  chatSearchRequest: number;
  settingsOpen: boolean;
  onOpenSettings: () => void;
  onCapture: () => void;
  onOpenPalette: () => void;
  onSignOut: () => void;
};

/** Rows shown before "Show all N chats". */
const CHAT_LIST_CAP = 12;

function ChatStatus({ status }: { status: Conversation["lastStatus"] }) {
  if (status === "pending")
    return (
      <span className="app-chat-spinner" role="img" aria-label="Answering" title="Answering…" />
    );
  if (status === "failed")
    return (
      <span className="app-chat-failed" role="img" aria-label="Last answer failed" title="Last answer failed" />
    );
  return null;
}

function ChatRowMenu({
  chat,
  anchor,
  onClose,
  onRename,
  chats,
}: {
  chat: Conversation;
  anchor: HTMLElement;
  onClose: (restoreFocus: boolean) => void;
  onRename: () => void;
  chats: ConversationsController;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position] = useState(() => {
    const rect = anchor.getBoundingClientRect();
    const top = rect.bottom + 4;
    return {
      left: Math.max(8, Math.min(rect.left - 4, window.innerWidth - 188)),
      top: top + 190 > window.innerHeight ? Math.max(8, rect.top - 194) : top,
    };
  });
  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !anchor.contains(event.target as Node))
        onClose(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [anchor, onClose]);
  const run = (action: () => void) => {
    onClose(false);
    action();
  };
  return (
    <div
      ref={menu}
      className="app-chat-menu"
      role="menu"
      aria-label={`Actions for ${chat.title}`}
      style={{ left: position.left, top: position.top }}
      onKeyDown={(event) => {
        const items = [
          ...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
        ];
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose(true);
        } else if (event.key === "Tab") {
          onClose(false);
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const step = event.key === "ArrowDown" ? 1 : -1;
          items[(index + step + items.length) % items.length]?.focus();
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          items[event.key === "Home" ? 0 : items.length - 1]?.focus();
        }
      }}
    >
      <button type="button" role="menuitem" onClick={() => run(onRename)}>
        <PenLine size={15} aria-hidden="true" />
        Rename
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => run(() => void chats.setPinned(chat.id, !chat.pinnedAt))}
      >
        {chat.pinnedAt ? (
          <PinOff size={15} aria-hidden="true" />
        ) : (
          <Pin size={15} aria-hidden="true" />
        )}
        {chat.pinnedAt ? "Unpin" : "Pin to top"}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => run(() => void chats.exportMarkdown(chat.id))}
      >
        <Share size={15} aria-hidden="true" />
        Export as Markdown
      </button>
      <hr />
      <button
        type="button"
        role="menuitem"
        className="danger"
        onClick={() => run(() => void chats.remove(chat.id))}
      >
        <Trash2 size={15} aria-hidden="true" />
        Delete…
      </button>
    </div>
  );
}

function ChatRow({
  chat,
  current,
  query,
  menuOpen,
  renaming,
  onOpen,
  onToggleMenu,
  onRenameDone,
  chats,
}: {
  chat: Conversation;
  current: boolean;
  query: string;
  menuOpen: boolean;
  renaming: boolean;
  onOpen: () => void;
  onToggleMenu: (anchor: HTMLButtonElement) => void;
  onRenameDone: () => void;
  chats: ConversationsController;
}) {
  const [draft, setDraft] = useState(chat.title);
  const input = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const finished = useRef(false);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (renaming) {
      finished.current = false;
      setDraft(chat.title);
      input.current?.focus();
      input.current?.select();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      moreRef.current?.focus();
    }
    // Only entering or leaving rename moves focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renaming]);
  const parts = highlightParts(chat.title, query);
  if (renaming) {
    const finish = (keyboard: boolean) => {
      if (finished.current) return false;
      finished.current = true;
      restoreFocus.current = keyboard;
      onRenameDone();
      return true;
    };
    const commit = (keyboard: boolean) => {
      const title = draft.trim();
      if (!finish(keyboard)) return;
      if (title && title !== chat.title) void chats.rename(chat.id, title.slice(0, 100));
    };
    return (
      <form
        className="app-chat-row renaming"
        onSubmit={(event) => {
          event.preventDefault();
          commit(true);
        }}
      >
        <input
          ref={input}
          className="app-chat-rename"
          aria-label="Chat title"
          value={draft}
          maxLength={100}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              finish(true);
            }
          }}
        />
      </form>
    );
  }
  return (
    <div className={cx("app-chat-row", current && "current", menuOpen && "menu-open")}>
      <button
        type="button"
        className="app-chat-open"
        aria-current={current ? "page" : undefined}
        onClick={onOpen}
      >
        <span className="app-chat-title">
          {parts ? (
            <>
              {parts.before}
              <mark>{parts.match}</mark>
              {parts.after}
            </>
          ) : (
            chat.title
          )}
        </span>
        <ChatStatus status={chat.lastStatus} />
      </button>
      <button
        ref={moreRef}
        type="button"
        className="app-chat-more"
        aria-label={`More actions for ${chat.title}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => moreRef.current && onToggleMenu(moreRef.current)}
      >
        <Ellipsis size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function ChatHistory({
  chats,
  activeChatId,
  searchRef,
  onAfterOpen,
}: {
  chats: ConversationsController;
  activeChatId: string | null;
  searchRef: Ref<HTMLInputElement>;
  onAfterOpen: () => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const closeMenu = useCallback(
    (restoreFocus: boolean) => {
      const anchor = menu?.anchor;
      setMenu(null);
      if (restoreFocus) anchor?.focus();
    },
    [menu],
  );
  const searching = query.trim().length > 0;
  const matches = filterConversations(chats.conversations, query);
  const capped = !searching && !expanded && matches.length > CHAT_LIST_CAP;
  const visible = capped ? matches.slice(0, CHAT_LIST_CAP) : matches;
  const groups = groupConversations(visible);
  const menuChat = menu ? chats.conversations.find((chat) => chat.id === menu.id) : null;
  return (
    <>
      <label className={cx("app-chat-search", searching && "active")}>
        <Search size={15} aria-hidden="true" />
        <input
          ref={searchRef}
          id="sidebar-chat-search"
          type="search"
          placeholder="Search chats"
          aria-label="Search chats by title"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            if (query) setQuery("");
            else event.currentTarget.blur();
          }}
        />
        <Keycap className="app-chat-search-key" aria-hidden="true">/</Keycap>
      </label>
      <div className="app-chat-list" role="navigation" aria-label="Chats">
        {!chats.loaded && !chats.error && <p className="app-chat-note">Loading chats…</p>}
        {chats.error && (
          <p className="app-chat-note">
            {chats.error}{" "}
            <button type="button" className="app-chat-link" onClick={() => void chats.refresh()}>
              Try again
            </button>
          </p>
        )}
        {chats.loaded && searching && matches.length === 0 && (
          <p className="app-chat-note" role="status">
            No chats match “{query.trim()}”
          </p>
        )}
        {groups.map((group) => (
          <div className="app-chat-group" role="group" aria-label={group.label} key={group.label}>
            <span className="app-chat-when" aria-hidden="true">
              {group.label}
            </span>
            {group.items.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                current={chat.id === activeChatId}
                query={query}
                menuOpen={menu?.id === chat.id}
                renaming={renamingId === chat.id}
                chats={chats}
                onOpen={() => {
                  chats.open(chat.id);
                  onAfterOpen();
                }}
                onToggleMenu={(anchor) =>
                  setMenu((current) => (current?.id === chat.id ? null : { id: chat.id, anchor }))
                }
                onRenameDone={() => setRenamingId(null)}
              />
            ))}
          </div>
        ))}
        {capped && (
          <button type="button" className="app-chat-showall" onClick={() => setExpanded(true)}>
            Show all {matches.length} chats
          </button>
        )}
        {!searching && expanded && matches.length > CHAT_LIST_CAP && (
          <button type="button" className="app-chat-showall" onClick={() => setExpanded(false)}>
            Show fewer
          </button>
        )}
      </div>
      {menu && menuChat && (
        <ChatRowMenu
          chat={menuChat}
          anchor={menu.anchor}
          chats={chats}
          onClose={closeMenu}
          onRename={() => setRenamingId(menuChat.id)}
        />
      )}
    </>
  );
}

export function Sidebar(props: SidebarProps) {
  const sidebar = useResizableSidebar("social-knowledge-app-sidebar", APP_SIDEBAR, {
    desktopQuery: SIDEBAR_DESKTOP_QUERY,
    contentReserve: SIDEBAR_CONTENT_RESERVE,
  });
  const {
    tab,
    activityCounts,
    activityJobs,
    mobileOpen,
    onCloseMobile,
    onOpenMobile,
    onNavigate,
    chats,
  } = props;
  const live = activityCounts.active + activityCounts.queued > 0;
  const activeTab = tab === "capture" ? "inbox" : tab;
  const collapsed = sidebar.collapsed;
  const onAsk = activeTab === "ask";
  const { desktop, expand } = sidebar;
  const revealSearch = useCallback(() => {
    if (!desktop) onOpenMobile();
    else if (collapsed) expand();
  }, [desktop, collapsed, expand, onOpenMobile]);
  const chatSearch = useRef<HTMLInputElement>(null);
  const handledSearchRequest = useRef(props.chatSearchRequest);
  useEffect(() => {
    if (props.chatSearchRequest === handledSearchRequest.current) return;
    revealSearch();
    // Keep the request pending until the input is mounted and its drawer is
    // visible, then let the sidebar's own focus restoration finish.
    if (collapsed || (!desktop && !mobileOpen)) return;
    const frame = window.requestAnimationFrame(() => {
      chatSearch.current?.focus();
      chatSearch.current?.select();
      handledSearchRequest.current = props.chatSearchRequest;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [props.chatSearchRequest, collapsed, desktop, mobileOpen, revealSearch]);
  return (
    <aside
      ref={sidebar.layoutRef}
      className={cx("app-sidebar", mobileOpen && "open", collapsed && "is-collapsed")}
      style={
        sidebar.desktop
          ? { width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebar.width }
          : undefined
      }
      aria-label="Archive navigation"
    >
      <button type="button" className="app-sidebar-close" aria-label="Close menu" onClick={onCloseMobile}>
        <X size={18} aria-hidden="true" />
      </button>
      {sidebar.desktop && collapsed && (
        <SidebarRail label="sidebar" buttonRef={sidebar.expandRef} onClick={sidebar.expand} />
      )}
      <div className="app-brand">
        <span className="app-brand-mark" aria-hidden="true">
          <LibraryBig size={13} />
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
        <NavGroup label="Library">
          {appDestinations
            .filter((item) => item.group === "library")
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
        <NavGroup label="Assistant">
          <NavRow
            icon={PenLine}
            label="New chat"
            active={onAsk && chats.currentId === null}
            onClick={() => {
              chats.startNew();
              onCloseMobile();
            }}
            dataTab="ask"
          >
            <ShortcutHint keys="q" />
          </NavRow>
        </NavGroup>
      </nav>
      {!collapsed && (
        <ChatHistory
          chats={chats}
          activeChatId={onAsk ? chats.currentId : null}
          searchRef={chatSearch}
          onAfterOpen={onCloseMobile}
        />
      )}
      {collapsed && <div className="app-sidebar-spacer" />}
      <ProcessingCard counts={activityCounts} jobs={activityJobs} onView={() => onNavigate("activity")} />
      <AccountRow
        name={props.userName}
        username={props.username}
        avatarColor={props.avatarColor}
        settingsActive={props.settingsOpen}
        onOpenSettings={props.onOpenSettings}
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
