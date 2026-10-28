import type { OpenCapture } from "../shared/types";
import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDownWideNarrow,
  Bookmark,
  LayoutGrid,
  List,
  ListFilter,
  Plus,
  Search,
  Settings2,
  X,
} from "lucide-react";
import type { Capture, CaptureFacets, InboxSortKey, InboxView } from "../shared/types";
import { api, assetUrl } from "../shared/api";
import { ActionButton, Chip, cx } from "../components/ui/primitives";
import { useDialogFocus } from "../components/use-dialog-focus";

export const inboxSortOptions: Array<{
  key: InboxSortKey;
  label: string;
  ascending: string;
  descending: string;
}> = [
  { key: "savedAt", label: "Saved date", ascending: "Oldest", descending: "Newest" },
  { key: "title", label: "Title", ascending: "Title A–Z", descending: "Title Z–A" },
  { key: "source", label: "Source", ascending: "Source A–Z", descending: "Source Z–A" },
  { key: "category", label: "Category", ascending: "Category A–Z", descending: "Category Z–A" },
  { key: "topic", label: "Topic", ascending: "Topic A–Z", descending: "Topic Z–A" },
];

/* Thumbnail tints from the approved Inbox drawing, assigned per category. */
const thumbnailTints = ["#e3ebe5", "#f1e6d6", "#f0e1e1", "#e1e7f0", "#e6e9df"];

function tintFor(key: string) {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return thumbnailTints[hash % thumbnailTints.length]!;
}

function platformName(platform: string) {
  return platform ? `${platform.slice(0, 1).toUpperCase()}${platform.slice(1)}` : "Unknown platform";
}

export function captureKind(capture: Pick<Capture, "platform" | "sourceUrl">) {
  const name = platformName(capture.platform);
  try {
    const path = new URL(capture.sourceUrl).pathname;
    if (/^\/(reel|reels)\//.test(path) || /\/share\/r\//.test(path)) return `${name} reel`;
  } catch {
    // Fall back to the platform name for unparseable source URLs.
  }
  return name;
}

function creatorHandle(creator: string | null) {
  if (!creator) return null;
  return /\s/.test(creator) || creator.startsWith("@") ? creator : `@${creator}`;
}

export function relativeTime(value: string, now = Date.now()) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(new Date(time).getFullYear() === new Date(now).getFullYear() ? {} : { year: "numeric" }),
  }).format(new Date(time));
}

function CaptureRow({ capture, onOpen }: { capture: Capture; onOpen: (id: string) => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const thumb = capture.assets.find((asset) => asset.kind === "thumbnail" || asset.kind === "image");
  const topic = capture.categoryLabel || capture.topics[0] || null;
  const meta = [creatorHandle(capture.creator), captureKind(capture), relativeTime(capture.createdAt)].filter(Boolean);
  return (
    <li className="inbox-row" data-capture-id={capture.id}>
      <button type="button" className="inbox-row-button" onClick={() => onOpen(capture.id)}>
        <span className="inbox-thumb" style={{ background: tintFor(topic ?? capture.platform) }} aria-hidden="true">
          {thumb && !imageFailed && (
            <img src={assetUrl(capture.id, thumb.id)} alt="" loading="lazy" onError={() => setImageFailed(true)} />
          )}
        </span>
        <span className="inbox-row-text">
          <strong className="inbox-row-title">{capture.title}</strong>
          <span className="inbox-row-meta">
            {meta.map((part, index) => (
              <span key={index}>
                {index > 0 && " · "}
                {index === meta.length - 1 ? <time dateTime={capture.createdAt}>{part}</time> : part}
              </span>
            ))}
          </span>
        </span>
        {topic && <Chip className="inbox-row-topic">{topic}</Chip>}
      </button>
    </li>
  );
}

function PlatformMark({ platform }: { platform: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
  if (platform === "instagram")
    return (
      <svg {...common}>
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </svg>
    );
  if (platform === "facebook")
    return (
      <svg {...common}>
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    );
  return <Bookmark size={22} aria-hidden="true" focusable="false" />;
}

function CaptureTile({ capture, onOpen }: { capture: Capture; onOpen: (id: string) => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const thumb = capture.assets.find((asset) => asset.kind === "thumbnail" || asset.kind === "image");
  const topic = capture.categoryLabel || capture.topics[0] || null;
  const creator = creatorHandle(capture.creator);
  const showImage = Boolean(thumb) && !imageFailed;
  return (
    <li className="inbox-tile" data-capture-id={capture.id}>
      <button type="button" className="inbox-tile-button" onClick={() => onOpen(capture.id)}>
        <span
          className={cx("inbox-tile-media", !showImage && "inbox-tile-fallback")}
          style={{ background: tintFor(topic ?? capture.platform) }}
          aria-hidden="true"
        >
          {showImage ? (
            <img src={assetUrl(capture.id, thumb!.id)} alt="" loading="lazy" onError={() => setImageFailed(true)} />
          ) : (
            <PlatformMark platform={capture.platform} />
          )}
        </span>
        <span className="inbox-tile-text">
          <strong className="inbox-tile-title">{capture.title}</strong>
          <span className="inbox-tile-meta">
            {creator && <span className="inbox-tile-creator">{creator}</span>}
            <span>
              {captureKind(capture)} · <time dateTime={capture.createdAt}>{relativeTime(capture.createdAt)}</time>
            </span>
          </span>
          {topic && <Chip className="inbox-tile-topic">{topic}</Chip>}
        </span>
      </button>
    </li>
  );
}

const inboxViewKey = (userId: string) => `social-knowledge:inbox-view:${userId}`;

/** The layout choice is remembered per account in this browser only. */
function readInboxView(userId: string | null): InboxView {
  if (!userId) return "rows";
  try {
    return window.localStorage.getItem(inboxViewKey(userId)) === "tiles" ? "tiles" : "rows";
  } catch {
    return "rows";
  }
}

function writeInboxView(userId: string | null, view: InboxView) {
  if (!userId) return;
  try {
    window.localStorage.setItem(inboxViewKey(userId), view);
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts this visit.
  }
}

/** The first capture whose card is at least partly below the top of the viewport. */
function browsingAnchor(list: HTMLElement | null) {
  if (!list) return null;
  const topbar = document.querySelector<HTMLElement>(".app-topbar");
  const top = topbar && getComputedStyle(topbar).position === "sticky" ? topbar.getBoundingClientRect().bottom : 0;
  for (const item of list.querySelectorAll<HTMLElement>("[data-capture-id]")) {
    const rect = item.getBoundingClientRect();
    if (rect.bottom > top + 4) return { id: item.dataset.captureId!, top: rect.top };
  }
  return null;
}

function FilterDialog({
  platform,
  category,
  topic,
  facets,
  hasFilters,
  onPlatform,
  onCategory,
  onTopic,
  onClear,
  onClose,
}: {
  platform: string;
  category: string;
  topic: string;
  facets: CaptureFacets;
  hasFilters: boolean;
  onPlatform: (value: string) => void;
  onCategory: (value: string) => void;
  onTopic: (value: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, onClose);
  return (
    <div className="inbox-filter-scrim" role="presentation" onMouseDown={onClose}>
      <section
        ref={ref}
        className="inbox-filter-dialog"
        id="inbox-filter-builder"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inbox-filter-heading"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="inbox-filter-head">
          <h2 id="inbox-filter-heading">Add filter</h2>
          <button type="button" className="inbox-filter-close" aria-label="Close filters" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="inbox-filter-fields">
          <label>
            <span>Platform</span>
            <select value={platform} onChange={(event) => onPlatform(event.target.value)}>
              <option value="">Any platform</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
            </select>
          </label>
          <label>
            <span>Category</span>
            <select value={category} onChange={(event) => onCategory(event.target.value)}>
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
            <select value={topic} onChange={(event) => onTopic(event.target.value)}>
              <option value="">Any topic</option>
              {facets.topics.map((facet) => (
                <option value={facet.label} key={facet.label}>
                  {facet.label} ({facet.count})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="inbox-filter-foot">
          {hasFilters && (
            <ActionButton variant="ghost" onClick={onClear}>Clear filters</ActionButton>
          )}
          <ActionButton variant="primary" onClick={onClose}>Done</ActionButton>
        </div>
      </section>
    </div>
  );
}

function LoadingRows() {
  return (
    <ul className="inbox-list" aria-label="Loading captures" aria-busy="true">
      {[0, 1, 2, 3, 4].map((index) => (
        <li className="inbox-row inbox-row-loading" key={index} aria-hidden="true">
          <span className="inbox-row-button">
            <span className="inbox-thumb" />
            <span className="inbox-row-text">
              <span className="inbox-skeleton title" />
              <span className="inbox-skeleton meta" />
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function InboxPage({
  refreshToken,
  onOpen,
  userId,
  captureReady,
  pendingWork,
  onCapture,
  onSetUpAi,
  onViewActivity,
}: {
  refreshToken: number;
  onOpen: OpenCapture;
  userId: string | null;
  /** Whether new captures can be processed; null while unknown. */
  captureReady: boolean | null;
  pendingWork: number;
  onCapture: () => void;
  onSetUpAi: () => void;
  onViewActivity: () => void;
}) {
  const [view, setView] = useState<InboxView>(() => readInboxView(userId));
  const listRef = useRef<HTMLDivElement>(null);
  const pendingAnchor = useRef<{ id: string; top: number } | null>(null);
  useEffect(() => setView(readInboxView(userId)), [userId]);
  const chooseView = (next: InboxView) => {
    if (next === view) return;
    pendingAnchor.current = browsingAnchor(listRef.current);
    writeInboxView(userId, next);
    setView(next);
  };
  useLayoutEffect(() => {
    const anchor = pendingAnchor.current;
    pendingAnchor.current = null;
    if (!anchor) return;
    const item = listRef.current?.querySelector<HTMLElement>(
      `[data-capture-id="${CSS.escape(anchor.id)}"]`,
    );
    if (item) window.scrollBy({ top: item.getBoundingClientRect().top - anchor.top, behavior: "instant" });
  }, [view]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [platform, setPlatform] = useState("");
  const [category, setCategory] = useState("");
  const [topic, setTopic] = useState("");
  const [sort, setSort] = useState<InboxSortKey>("savedAt");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [facets, setFacets] = useState<CaptureFacets>({ categories: [], topics: [] });
  const [filterOpen, setFilterOpen] = useState(false);
  const request = useRef(0);
  const hasFilters = Boolean(search || platform || category || topic);
  const activeCategory = facets.categories.find((facet) => facet.id === category)?.label ?? null;
  const sortOption = inboxSortOptions.find((option) => option.key === sort)!;

  async function loadPage(mode: "reset" | "append" | "refresh") {
    const requestId = ++request.current;
    const cursor = mode === "append" ? nextCursor : null;
    if (mode === "append" && !cursor) return;
    if (mode === "append") setLoadingMore(true);
    else if (mode === "reset") {
      setLoading(true);
      setCaptures([]);
      setNextCursor(null);
      setError(null);
    }
    const query = new URLSearchParams({ limit: "48", sort, direction });
    if (deferredSearch) query.set("search", deferredSearch);
    if (platform) query.set("platform", platform);
    if (category) query.set("nodeId", category);
    if (topic) query.set("topic", topic);
    if (cursor) query.set("cursor", cursor);
    try {
      const page = await api<{ captures: Capture[]; nextCursor: string | null }>(`/api/v1/captures?${query}`);
      if (requestId !== request.current) return;
      setCaptures((current) => {
        if (mode !== "append") return page.captures;
        const seen = new Set(current.map((capture) => capture.id));
        return [...current, ...page.captures.filter((capture) => !seen.has(capture.id))];
      });
      setNextCursor(page.nextCursor);
      setError(null);
    } catch {
      if (requestId === request.current && mode !== "refresh")
        setError(mode === "append" ? "Unable to load more captures. Try again." : "Unable to load captures. Try again.");
    } finally {
      if (requestId === request.current) {
        if (mode === "append") setLoadingMore(false);
        else setLoading(false);
      }
    }
  }

  async function loadSupporting() {
    const [facetResult, analytics] = await Promise.allSettled([
      api<CaptureFacets>("/api/v1/capture-facets"),
      api<{ totalCaptures: number }>("/api/v1/inbox-analytics"),
    ]);
    if (facetResult.status === "fulfilled") setFacets(facetResult.value);
    if (analytics.status === "fulfilled") setTotal(analytics.value.totalCaptures);
  }

  useEffect(() => {
    void loadPage("reset");
  }, [deferredSearch, platform, category, topic, sort, direction]);
  const firstRefresh = useRef(true);
  useEffect(() => {
    void loadSupporting();
    if (firstRefresh.current) {
      firstRefresh.current = false;
      return;
    }
    void loadPage("refresh");
  }, [refreshToken]);

  const clearFilters = () => {
    setSearch("");
    setPlatform("");
    setCategory("");
    setTopic("");
  };
  const count = hasFilters ? captures.length : (total ?? captures.length);
  const countLabel = hasFilters && nextCursor ? `${count}+` : count.toLocaleString();

  return (
    <section className="inbox-page" aria-labelledby="inbox-title">
      <div className="inbox-header">
        <span className="inbox-kicker">Your archive</span>
        <h1 id="inbox-title">Inbox</h1>
        <p>The posts you chose to keep, ready when you need them.</p>
      </div>
      <div className="inbox-toolbar">
        <label className="inbox-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search your archive</span>
          <input
            type="search"
            placeholder="Search titles, notes, or creators"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <button type="button" aria-label="Clear search" onClick={() => setSearch("")}>
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </label>
        <button
          type="button"
          className="inbox-tool"
          aria-haspopup="dialog"
          aria-expanded={filterOpen}
          aria-controls="inbox-filter-builder"
          onClick={() => setFilterOpen(true)}
        >
          <ListFilter size={15} aria-hidden="true" />
          Add filter
        </button>
        <label className="inbox-tool inbox-sort">
          <ArrowDownWideNarrow size={15} aria-hidden="true" />
          <span aria-hidden="true">{direction === "asc" ? sortOption.ascending : sortOption.descending}</span>
          <select
            aria-label="Sort captures"
            value={`${sort}:${direction}`}
            onChange={(event) => {
              const [nextSort, nextDirection] = event.target.value.split(":") as [InboxSortKey, "asc" | "desc"];
              setSort(nextSort);
              setDirection(nextDirection);
            }}
          >
            {inboxSortOptions.flatMap((option) => [
              <option key={`${option.key}:desc`} value={`${option.key}:desc`}>{option.descending}</option>,
              <option key={`${option.key}:asc`} value={`${option.key}:asc`}>{option.ascending}</option>,
            ])}
          </select>
        </label>
        <div className="inbox-layout" role="group" aria-label="Layout">
          <button
            type="button"
            className="inbox-layout-option"
            aria-pressed={view === "rows"}
            onClick={() => chooseView("rows")}
          >
            <List size={15} aria-hidden="true" />
            <span className="inbox-layout-label">Rows</span>
          </button>
          <button
            type="button"
            className="inbox-layout-option"
            aria-pressed={view === "tiles"}
            onClick={() => chooseView("tiles")}
          >
            <LayoutGrid size={15} aria-hidden="true" />
            <span className="inbox-layout-label">Tiles</span>
          </button>
        </div>
      </div>
      {filterOpen && (
        <FilterDialog
          platform={platform}
          category={category}
          topic={topic}
          facets={facets}
          hasFilters={hasFilters}
          onPlatform={setPlatform}
          onCategory={setCategory}
          onTopic={setTopic}
          onClear={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}
      {hasFilters && (
        <div className="inbox-active-filters" aria-label="Active filters">
          {platform && (
            <button type="button" className="ui-chip" onClick={() => setPlatform("")}>
              Platform: {platformName(platform)} <X size={12} aria-hidden="true" />
            </button>
          )}
          {activeCategory && (
            <button type="button" className="ui-chip" onClick={() => setCategory("")}>
              Category: {activeCategory} <X size={12} aria-hidden="true" />
            </button>
          )}
          {topic && (
            <button type="button" className="ui-chip" onClick={() => setTopic("")}>
              Topic: {topic} <X size={12} aria-hidden="true" />
            </button>
          )}
          {search && (
            <button type="button" className="ui-chip" onClick={() => setSearch("")}>
              Search: {search} <X size={12} aria-hidden="true" />
            </button>
          )}
          <button type="button" className="inbox-clear-all" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}
      <div className="inbox-list-heading">
        <h2 id="captures-heading">Captures</h2>
        {!loading && !error && (
          <span aria-live="polite">
            <span className="sr-only">{hasFilters ? "Matching captures:" : "Total captures:"} </span>
            {countLabel}
          </span>
        )}
      </div>
      <div ref={listRef} className="inbox-results">
        {loading ? (
          <LoadingRows />
        ) : captures.length > 0 ? (
          view === "tiles" ? (
            <ul className="inbox-tiles" aria-labelledby="captures-heading">
              {captures.map((capture) => (
                <CaptureTile capture={capture} onOpen={(id) => onOpen(id, { captureIds: captures.map((item) => item.id), label: "Inbox" })} key={capture.id} />
              ))}
            </ul>
          ) : (
            <ul className="inbox-list" aria-labelledby="captures-heading">
              {captures.map((capture) => (
                <CaptureRow capture={capture} onOpen={(id) => onOpen(id, { captureIds: captures.map((item) => item.id), label: "Inbox" })} key={capture.id} />
              ))}
            </ul>
          )
        ) : !error ? (
          hasFilters ? (
            <div className="inbox-empty">
              <h3>No captures found</h3>
              <p>Try another search or clear your filters.</p>
              <ActionButton onClick={clearFilters}>Clear filters</ActionButton>
            </div>
          ) : (
            <div className="inbox-empty">
              <h3>{captureReady === false ? "Finish setup to fill your archive" : "Your inbox is ready"}</h3>
              <p>
                {captureReady === false
                  ? "AI setup is needed before posts can be transcribed and filed here. Links you save now are kept until then."
                  : "Save an Instagram or Facebook post and it appears here once it’s processed."}
              </p>
              {pendingWork > 0 && (
                <p className="inbox-empty-pending">
                  {pendingWork === 1 ? "1 capture is" : `${pendingWork} captures are`} queued or processing.{" "}
                  <button type="button" className="inbox-inline-action" onClick={onViewActivity}>
                    View activity
                  </button>
                </p>
              )}
              <div className="inbox-empty-actions">
                {captureReady === false && (
                  <ActionButton variant="primary" icon={Settings2} onClick={onSetUpAi}>
                    Finish AI setup
                  </ActionButton>
                )}
                <ActionButton
                  variant={captureReady === false ? "default" : "primary"}
                  icon={Plus}
                  onClick={onCapture}
                >
                  Capture your first post
                </ActionButton>
              </div>
            </div>
          )
        ) : null}
      </div>
      {error && (
        <div className={cx("inbox-feedback")} role="alert">
          <span>{error}</span>
          <ActionButton onClick={() => void loadPage(captures.length ? "append" : "reset")} disabled={loading || loadingMore}>
            Retry
          </ActionButton>
        </div>
      )}
      {nextCursor && !error && (
        <div className="inbox-more">
          <ActionButton onClick={() => void loadPage("append")} disabled={loadingMore}>
            {loadingMore ? "Loading more…" : "Load more"}
          </ActionButton>
        </div>
      )}
    </section>
  );
}
