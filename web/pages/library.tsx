import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  CornerDownRight,
  Ellipsis,
  FileText,
  Inbox,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";
import {
  ActionButton,
  Card,
  Chip,
  ChipButton,
  IconBox,
  Input,
  cx,
} from "../components/ui/primitives";
import type { Capture, LibraryNode, LibraryNodeDetail } from "../shared/types";
import { api } from "../shared/api";
import {
  categoryStyle,
  creatorHandle,
  libraryChangedEvent,
  longAge,
  platformName,
  plural,
  sentenceCase,
  shortAge,
  thumbTint,
} from "./knowledge-shared";
import "../knowledge.css";

type NodeCapture = LibraryNodeDetail["captures"][number];

type ListedCapture = {
  id: string;
  title: string;
  creator: string | null;
  platform: string;
  createdAt: string;
  takeaways: string[];
};

type RecentCapture = {
  id: string;
  title: string;
  path: string;
  createdAt: string;
};

type Insight = { text: string; capture: ListedCapture };

type LibraryView =
  | { kind: "home" }
  | {
      kind: "node";
      node: LibraryNodeDetail;
      topicsByCapture: Map<string, string[]>;
    }
  | { kind: "unclassified"; captures: Capture[] };

const recentLimit = 4;
const chipLimit = 3;

function fromNodeCapture(capture: NodeCapture): ListedCapture {
  return {
    id: capture.id,
    title: capture.title,
    creator: capture.creator,
    platform: capture.platform,
    createdAt: capture.createdAt,
    takeaways: capture.takeaways,
  };
}

function fromCapture(capture: Capture): ListedCapture {
  return {
    id: capture.id,
    title: capture.title,
    creator: capture.creator,
    platform: capture.platform,
    createdAt: capture.createdAt,
    takeaways: capture.analysis.takeaways ?? [],
  };
}

/** One insight per capture first, so the top of the list spans every source. */
function interleaveInsights(captures: ListedCapture[]): Insight[] {
  const result: Insight[] = [];
  const depth = Math.max(0, ...captures.map((capture) => capture.takeaways.length));
  for (let round = 0; round < depth; round += 1)
    for (const capture of captures) {
      const text = capture.takeaways[round];
      if (text) result.push({ text, capture });
    }
  return result;
}

function shortSourceTitle(title: string) {
  return title.replace(/\s*\([^)]*\)\s*$/, "");
}

async function loadNodeTopics(nodeId: string) {
  const topics = new Map<string, string[]>();
  let cursor: string | null = null;
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ nodeId, limit: "50" });
    if (cursor) query.set("cursor", cursor);
    const result = await api<{ captures: Capture[]; nextCursor: string | null }>(
      `/api/v1/captures?${query}`,
    );
    for (const capture of result.captures) topics.set(capture.id, capture.topics);
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  return topics;
}

function topicFacets(captures: ListedCapture[], topicsByCapture: Map<string, string[]>) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const capture of captures) {
    const seen = new Set<string>();
    for (const topic of topicsByCapture.get(capture.id) ?? []) {
      const key = topic.trim().toLocaleLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const current = counts.get(key);
      counts.set(key, {
        label: current?.label ?? sentenceCase(topic),
        count: (current?.count ?? 0) + 1,
      });
    }
  }
  return [...counts.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function Library({ onOpen }: { onOpen: (id: string) => void }) {
  const [nodes, setNodes] = useState<LibraryNode[]>([]);
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);
  const [treeState, setTreeState] = useState<"loading" | "ready" | "error">("loading");
  const [recent, setRecent] = useState<RecentCapture[] | null>(null);
  const [recentError, setRecentError] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<LibraryView>({ kind: "home" });
  const [navigation, setNavigation] = useState({ entries: ["home"], index: 0 });
  const [navigationLoading, setNavigationLoading] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [showAllInsights, setShowAllInsights] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigationRequest = useRef(0);
  const currentTarget = navigation.entries[navigation.index] ?? "home";

  useEffect(() => () => { navigationRequest.current += 1; }, []);

  async function loadTree() {
    try {
      const result = await api<{ nodes: LibraryNode[]; unclassifiedCount: number }>(
        "/api/v1/library/tree",
      );
      const visible = result.nodes.filter((item) => item.captureCount > 0);
      setNodes(visible);
      setUnclassifiedCount(result.unclassifiedCount);
      setTreeState("ready");
      void loadRecent(visible.filter((item) => item.parentId === null));
    } catch {
      setTreeState("error");
    }
  }

  async function loadRecent(roots: LibraryNode[]) {
    setRecentError(false);
    try {
      const details = await Promise.all(
        roots.map((root) =>
          api<{ node: LibraryNodeDetail }>(`/api/v1/library/nodes/${root.id}`),
        ),
      );
      setRecent(
        details
          .flatMap(({ node }) => node.captures)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, recentLimit)
          .map((capture) => ({
            id: capture.id,
            title: capture.title,
            path: capture.breadcrumb.map((part) => part.label).join(" / "),
            createdAt: capture.createdAt,
          })),
      );
    } catch {
      setRecentError(true);
    }
  }

  async function navigateLibrary(target: string, historyIndex?: number) {
    const request = ++navigationRequest.current;
    setNavigationLoading(true);
    setNavigationError("");
    try {
      let next: LibraryView = { kind: "home" };
      if (target === "unclassified") {
        const result = await api<{ captures: Capture[] }>("/api/v1/library/unclassified");
        next = { kind: "unclassified", captures: result.captures };
      } else if (target !== "home") {
        const [result, topicsByCapture] = await Promise.all([
          api<{ node: LibraryNodeDetail }>(`/api/v1/library/nodes/${target}`),
          loadNodeTopics(target),
        ]);
        next = { kind: "node", node: result.node, topicsByCapture };
      }
      if (request !== navigationRequest.current) return;
      setView(next);
      setTopicFilter(null);
      setShowAllInsights(false);
      setMenuOpen(false);
      setNavigation((current) =>
        historyIndex !== undefined
          ? { ...current, index: historyIndex }
          : current.entries[current.index] === target
            ? current
            : {
                entries: [...current.entries.slice(0, current.index + 1), target],
                index: current.index + 1,
              },
      );
    } catch {
      if (request === navigationRequest.current)
        setNavigationError("This page could not be loaded. Please try again.");
    } finally {
      if (request === navigationRequest.current) setNavigationLoading(false);
    }
  }

  async function refresh() {
    await loadTree();
    if (currentTarget !== "home") await navigateLibrary(currentTarget, navigation.index);
  }
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    void loadTree();
    const onChanged = () => void refreshRef.current();
    window.addEventListener(libraryChangedEvent, onChanged);
    return () => window.removeEventListener(libraryChangedEvent, onChanged);
  }, []);

  const openNode = (id: string) => void navigateLibrary(id);
  const goBack = () =>
    void navigateLibrary(navigation.entries[navigation.index - 1]!, navigation.index - 1);
  const goForward = () =>
    void navigateLibrary(navigation.entries[navigation.index + 1]!, navigation.index + 1);

  const feedback = (
    <>
      {navigationLoading && (
        <p className="kb-feedback" role="status">Loading…</p>
      )}
      {navigationError && (
        <p className="kb-feedback kb-feedback-error" role="alert">{navigationError}</p>
      )}
    </>
  );

  if (view.kind === "home")
    return (
      <LibraryHome
        nodes={nodes}
        unclassifiedCount={unclassifiedCount}
        treeState={treeState}
        recent={recent}
        recentError={recentError}
        query={query}
        onQuery={setQuery}
        onOpenNode={openNode}
        onOpenUnclassified={() => void navigateLibrary("unclassified")}
        onOpenCapture={onOpen}
        onRetry={() => {
          setTreeState("loading");
          void loadTree();
        }}
        feedback={feedback}
      />
    );

  const crumbs: Array<{ id: string; label: string }> =
    view.kind === "node"
      ? view.node.breadcrumb.map((part) => ({ id: part.id, label: part.label }))
      : [{ id: "unclassified", label: "Needs a home" }];

  const crumbBar = (actions?: ReactNode) => (
    <div className="kb-crumb-bar">
      <nav className="kb-crumbs" aria-label="Knowledge base location">
        <button
          type="button"
          className="kb-history-button"
          aria-label="Back in knowledge base"
          disabled={navigationLoading || navigation.index === 0}
          onClick={goBack}
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <button
          type="button"
          className="kb-history-button"
          aria-label="Forward in knowledge base"
          disabled={navigationLoading || navigation.index === navigation.entries.length - 1}
          onClick={goForward}
        >
          <ArrowRight aria-hidden="true" />
        </button>
        <ol>
          <li>
            <button type="button" onClick={() => void navigateLibrary("home")}>
              Knowledge base
            </button>
          </li>
          {crumbs.map((crumb, index) => (
            <li key={crumb.id}>
              <span className="kb-crumb-separator" aria-hidden="true">/</span>
              {index === crumbs.length - 1 ? (
                <span aria-current="page">{crumb.label}</span>
              ) : (
                <button type="button" onClick={() => openNode(crumb.id)}>
                  {crumb.label}
                </button>
              )}
            </li>
          ))}
        </ol>
      </nav>
      {actions}
    </div>
  );

  if (view.kind === "unclassified") {
    const captures = view.captures.map(fromCapture);
    return (
      <div className="kb-page kb-topic-page">
        {crumbBar()}
        {feedback}
        <div className="kb-topic-head">
          <IconBox icon={Inbox} size={44} background="var(--amber-tint)" color="var(--amber-icon)" />
          <div className="kb-topic-title">
            <h1>Needs a home</h1>
            <p>
              {captures.length
                ? `${plural(captures.length, "capture")} the AI wasn't confident where to file · open one and choose Move`
                : "Every capture has been filed."}
            </p>
          </div>
        </div>
        {captures.length > 0 && (
          <CaptureList captures={captures} onOpen={onOpen} wide />
        )}
      </div>
    );
  }

  const { node, topicsByCapture } = view;
  const root = node.breadcrumb[0] ?? node;
  const style = categoryStyle(root.label);
  const allCaptures = node.captures.map(fromNodeCapture);
  const children = nodes.filter((item) => item.parentId === node.id);
  const facets = children.length ? [] : topicFacets(allCaptures, topicsByCapture);
  const captures = topicFilter
    ? allCaptures.filter((capture) =>
        (topicsByCapture.get(capture.id) ?? []).some(
          (topic) => topic.trim().toLocaleLowerCase() === topicFilter,
        ),
      )
    : allCaptures;
  const insights = interleaveInsights(captures);
  const firstRound = captures.filter((capture) => capture.takeaways.length > 0).length;
  const shownInsights = showAllInsights ? insights : insights.slice(0, firstRound);
  const newest = allCaptures[0]?.createdAt;
  const HeaderIcon = node.kind === "city" || node.kind === "country" ? MapPin : style.icon;
  const askQuestion = `What have I saved about ${node.label}?`;

  async function rename() {
    setMenuOpen(false);
    const label = window.prompt("New category name", node.label)?.trim();
    if (!label || label === node.label) return;
    try {
      await api(`/api/v1/library/nodes/${node.id}`, {
        method: "PATCH",
        body: JSON.stringify({ label }),
      });
      await refresh();
    } catch (error) {
      setNavigationError(error instanceof Error ? error.message : "Rename failed.");
    }
  }

  async function merge() {
    setMenuOpen(false);
    const compatible = nodes.filter(
      (candidate) => candidate.kind === node.kind && candidate.id !== node.id,
    );
    if (!compatible.length) {
      window.alert(`There is no other ${node.kind} to merge ${node.label} into.`);
      return;
    }
    const targetLabel = window.prompt(
      `Merge into: ${compatible.map((candidate) => candidate.label).join(", ")}`,
    );
    const target = compatible.find(
      (candidate) => candidate.label.toLowerCase() === targetLabel?.trim().toLowerCase(),
    );
    if (!target || !window.confirm(`Merge ${node.label} into ${target.label}?`)) return;
    try {
      await api(`/api/v1/library/nodes/${node.id}/merge`, {
        method: "POST",
        body: JSON.stringify({ targetNodeId: target.id }),
      });
      await loadTree();
      await navigateLibrary(target.id);
    } catch (error) {
      setNavigationError(error instanceof Error ? error.message : "Merge failed.");
    }
  }

  return (
    <div className="kb-page kb-topic-page">
      {crumbBar(
        <div className="kb-menu-anchor">
          <button
            type="button"
            className="kb-menu-trigger"
            aria-label={`More actions for ${node.label}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Ellipsis aria-hidden="true" />
          </button>
          {menuOpen && (
            <div
              className="kb-menu"
              role="menu"
              onKeyDown={(event) => {
                if (event.key === "Escape") setMenuOpen(false);
              }}
            >
              <button type="button" role="menuitem" autoFocus onClick={() => void rename()}>
                Rename…
              </button>
              <button type="button" role="menuitem" onClick={() => void merge()}>
                Merge into…
              </button>
            </div>
          )}
        </div>,
      )}
      {feedback}
      <div className="kb-topic-head">
        <IconBox icon={HeaderIcon} size={44} background={style.accent.tint} color={style.accent.icon} />
        <div className="kb-topic-title">
          <h1>{node.label}</h1>
          <p>
            {plural(allCaptures.length, "capture")} · {plural(interleaveInsights(allCaptures).length, "insight")}
            {newest ? ` · last added ${longAge(newest)}` : ""}
          </p>
        </div>
        <div className="kb-topic-actions">
          <a
            className="ui-btn ui-btn-default"
            href={`/?tab=ask&q=${encodeURIComponent(askQuestion)}`}
          >
            <Sparkles className="ui-btn-icon" aria-hidden="true" />
            <span>Ask about {node.label}</span>
          </a>
        </div>
      </div>
      {children.length > 0 ? (
        <div className="kb-subtopics" role="group" aria-label="Topics">
          <Chip selected className="kb-subtopic">All {allCaptures.length}</Chip>
          {children.map((child) => (
            <button
              type="button"
              key={child.id}
              className="ui-chip kb-subtopic"
              onClick={() => openNode(child.id)}
            >
              {child.label} {child.captureCount}
            </button>
          ))}
        </div>
      ) : facets.length > 0 ? (
        <div className="kb-subtopics" role="group" aria-label="Filter by subtopic">
          <ChipButton
            selected={topicFilter === null}
            className="kb-subtopic"
            onClick={() => setTopicFilter(null)}
          >
            All {allCaptures.length}
          </ChipButton>
          {facets.map((facet) => (
            <ChipButton
              key={facet.key}
              selected={topicFilter === facet.key}
              className="kb-subtopic"
              onClick={() => setTopicFilter(topicFilter === facet.key ? null : facet.key)}
            >
              {facet.label} {facet.count}
            </ChipButton>
          ))}
        </div>
      ) : null}
      <div className="kb-topic-body">
        <Card className="kb-insights">
          <div className="kb-card-head">
            <div className="kb-card-head-text">
              <h2>Browse by insight</h2>
              <p>What your saves agree on</p>
            </div>
            {insights.length > firstRound && (
              <button
                type="button"
                className="kb-link"
                aria-expanded={showAllInsights}
                onClick={() => setShowAllInsights((value) => !value)}
              >
                {showAllInsights ? "Show fewer" : `Show all ${insights.length}`}
              </button>
            )}
          </div>
          {shownInsights.length ? (
            <ol className="kb-insight-list">
              {shownInsights.map((insight, index) => (
                <li className="kb-insight" key={`${insight.capture.id}-${index}`}>
                  <span
                    className="kb-insight-number"
                    style={{ background: style.accent.tint, color: style.accent.ink }}
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div className="kb-insight-text">
                    <p>{insight.text}</p>
                    <button
                      type="button"
                      className="kb-insight-source"
                      onClick={() => onOpen(insight.capture.id)}
                    >
                      <CornerDownRight aria-hidden="true" />
                      <span className="kb-insight-source-label">
                        <span className="kb-insight-source-title">
                          {shortSourceTitle(insight.capture.title)}
                        </span>
                        {` · ${creatorHandle(insight.capture.creator)}`}
                      </span>
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="kb-empty">No insights have been extracted from these captures yet.</p>
          )}
        </Card>
        <CaptureList captures={captures} onOpen={onOpen} />
      </div>
    </div>
  );
}

function CaptureList({
  captures,
  onOpen,
  wide = false,
}: {
  captures: ListedCapture[];
  onOpen: (id: string) => void;
  wide?: boolean;
}) {
  return (
    <Card className={cx("kb-captures", wide && "kb-captures-wide")}>
      <div className="kb-card-head">
        <div className="kb-card-head-text">
          <h2>Captures</h2>
          <p>{plural(captures.length, "saved post")}</p>
        </div>
      </div>
      <ul className="kb-capture-list">
        {captures.map((capture, index) => (
          <li key={capture.id}>
            <button type="button" className="kb-capture-row" onClick={() => onOpen(capture.id)}>
              <span className="kb-thumb" style={{ background: thumbTint(index) }} aria-hidden="true" />
              <span className="kb-capture-text">
                <strong>{capture.title}</strong>
                <small>
                  {creatorHandle(capture.creator)} · {platformName(capture.platform)}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function LibraryHome({
  nodes,
  unclassifiedCount,
  treeState,
  recent,
  recentError,
  query,
  onQuery,
  onOpenNode,
  onOpenUnclassified,
  onOpenCapture,
  onRetry,
  feedback,
}: {
  nodes: LibraryNode[];
  unclassifiedCount: number;
  treeState: "loading" | "ready" | "error";
  recent: RecentCapture[] | null;
  recentError: boolean;
  query: string;
  onQuery: (value: string) => void;
  onOpenNode: (id: string) => void;
  onOpenUnclassified: () => void;
  onOpenCapture: (id: string) => void;
  onRetry: () => void;
  feedback: ReactNode;
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const categories = useMemo(() => {
    const childrenOf = (id: string) =>
      nodes
        .filter((item) => item.parentId === id)
        .sort((a, b) => b.captureCount - a.captureCount || a.label.localeCompare(b.label));
    const descendants = (id: string): LibraryNode[] =>
      childrenOf(id).flatMap((child) => [child, ...descendants(child.id)]);
    return nodes
      .filter((item) => item.parentId === null)
      .sort((a, b) => b.captureCount - a.captureCount || a.label.localeCompare(b.label))
      .flatMap((category) => {
        const topics = childrenOf(category.id);
        if (!normalizedQuery)
          return [{ category, topics: topics.length, chips: topics.slice(0, chipLimit) }];
        const matches = descendants(category.id).filter((item) =>
          item.label.toLocaleLowerCase().includes(normalizedQuery),
        );
        if (!matches.length && !category.label.toLocaleLowerCase().includes(normalizedQuery))
          return [];
        return [
          {
            category,
            topics: topics.length,
            chips: matches.length ? matches.slice(0, 6) : topics.slice(0, chipLimit),
          },
        ];
      });
  }, [nodes, normalizedQuery]);

  return (
    <div className="kb-page kb-home">
      <div className="kb-head">
        <div className="kb-head-text">
          <p className="kb-kicker">Your knowledge</p>
          <h1>Knowledge base</h1>
          <p className="kb-description">
            Notes generated from your saves, organised by category. The original posts stay the source.
          </p>
        </div>
        <Input
          type="search"
          icon={Search}
          className="kb-search"
          placeholder="Search categories and topics…"
          aria-label="Search categories and topics"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </div>
      {feedback}
      {unclassifiedCount > 0 && (
        <div className="kb-needs-home">
          <Inbox aria-hidden="true" />
          <p>
            <strong>{plural(unclassifiedCount, "capture")} need{unclassifiedCount === 1 ? "s" : ""} a home</strong>
            <span>· the AI wasn't confident where to file {unclassifiedCount === 1 ? "it" : "them"}</span>
          </p>
          <ActionButton onClick={onOpenUnclassified}>Review</ActionButton>
        </div>
      )}
      {treeState === "loading" ? (
        <p className="kb-feedback" role="status">Loading your knowledge base…</p>
      ) : treeState === "error" ? (
        <div className="kb-feedback kb-feedback-error" role="alert">
          Your knowledge base could not be loaded.
          <ActionButton onClick={onRetry}>Retry</ActionButton>
        </div>
      ) : categories.length ? (
        <div className="kb-category-grid">
          {categories.map(({ category, topics, chips }) => {
            const style = categoryStyle(category.label);
            return (
              <article className="kb-category-card" key={category.id}>
                <div className="kb-category-top">
                  <IconBox icon={style.icon} background={style.accent.tint} color={style.accent.icon} />
                  <div className="kb-category-text">
                    <h2>
                      <button
                        type="button"
                        className="kb-category-link"
                        onClick={() => onOpenNode(category.id)}
                      >
                        {category.label}
                      </button>
                    </h2>
                    <p>
                      {plural(category.captureCount, "capture")}
                      {topics ? ` · ${plural(topics, "topic")}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="kb-category-chevron" aria-hidden="true" />
                </div>
                {chips.length > 0 && (
                  <div className="kb-category-topics">
                    {chips.map((chip) => (
                      <button
                        type="button"
                        key={chip.id}
                        className="ui-chip kb-chip-small"
                        onClick={() => onOpenNode(chip.id)}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="kb-feedback">
          {normalizedQuery
            ? "No categories or topics match your search."
            : "Notes appear here once your saved posts have been processed and filed."}
        </p>
      )}
      {treeState === "ready" && nodes.length > 0 && (
        <Card className="kb-recent">
          <div className="kb-card-head">
            <div className="kb-card-head-text">
              <h2>Recently filed</h2>
            </div>
            <a className="kb-link" href="/app">View all</a>
          </div>
          {recentError ? (
            <p className="kb-empty" role="alert">Recent notes could not be loaded.</p>
          ) : recent === null ? (
            <p className="kb-empty" role="status">Loading recent notes…</p>
          ) : (
            <ul className="kb-recent-list">
              {recent.map((capture) => (
                <li key={capture.id}>
                  <button
                    type="button"
                    className="kb-recent-row"
                    onClick={() => onOpenCapture(capture.id)}
                  >
                    <FileText aria-hidden="true" />
                    <span className="kb-recent-title">{capture.title}</span>
                    <span className="kb-recent-path">{capture.path}</span>
                    <span className="kb-recent-age">{shortAge(capture.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
