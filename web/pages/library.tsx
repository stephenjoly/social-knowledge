import { useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  FileQuestion,
  Folder,
  FolderOpen,
  House,
  Search,
  X,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../components/ui/collapsible";
import { ScrollArea } from "../components/ui/scroll-area";
import type {
  Capture,
  LibraryExport,
  LibraryNode,
  LibraryNodeDetail,
} from "../shared/types";
import { api } from "../shared/api";

function markdownForDisplay(value: string) {
  return value.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
}

function markdownLinkText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[\r\n]+/g, " ")
    .replace(/[\[\]]/g, "\\$&");
}

function libraryHomeMarkdown(
  nodes: LibraryNode[],
  unclassifiedCount: number,
) {
  const populated = nodes.filter((node) => node.captureCount > 0);
  const domains = populated.filter((node) => node.parentId === null);
  const captureCount = domains.reduce((total, node) => total + node.captureCount, 0) + unclassifiedCount;
  const mapBranch = (parentId: string | null, depth = 0): string[] =>
    populated.filter((node) => node.parentId === parentId).flatMap((node) => [
      `${"  ".repeat(depth)}- [${markdownLinkText(node.label)}](library:${node.id}) — ${node.captureCount} ${node.captureCount === 1 ? "capture" : "captures"}`,
      ...mapBranch(node.id, depth + 1),
    ]);
  return [
    "# Social Knowledge",
    "",
    captureCount ? `Browse ${captureCount} saved ${captureCount === 1 ? "capture" : "captures"} across your knowledge base.` : "Your map of content will grow as you save and classify captures.",
    "",
    "## Map of content",
    "",
    ...mapBranch(null),
    ...(unclassifiedCount > 0 ? [`- [Unclassified](library:unclassified) — ${unclassifiedCount} captures`] : []),
    "",
    ...(captureCount > 0 ? ["Open a category to browse its subcategories, extracted insights, and source captures.", ""] : []),
  ].join("\n");
}

function externalLinkLabel(href: string | undefined, children: ReactNode) {
  if (
    href &&
    /^https?:\/\//i.test(href) &&
    typeof children === "string" &&
    /^https?:\/\//i.test(children.trim())
  ) {
    try {
      const hostname = new URL(href).hostname.replace(/^www\./, "");
      return `Open link on ${hostname} ↗`;
    } catch {
      return "Open external link ↗";
    }
  }
  return children;
}

export function Library({ onOpen }: { onOpen: (id: string) => void }) {
  const [nodes, setNodes] = useState<LibraryNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    try {
      const saved = window.localStorage.getItem(
        "social-knowledge-library-expanded-v2",
      );
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);
  const [selected, setSelected] = useState<string>("home");
  const [navigation, setNavigation] = useState({ entries: ["home"], index: 0 });
  const [navigationLoading, setNavigationLoading] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  const navigationRequest = useRef(0);
  useEffect(() => () => { navigationRequest.current += 1; }, []);
  const [node, setNode] = useState<LibraryNodeDetail | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [selectedCapture, setSelectedCapture] = useState<string | null>(null);
  const [treeQuery, setTreeQuery] = useState("");
  const [mobilePane, setMobilePane] = useState<"browse" | "reading">("browse");
  const [libraryExports, setLibraryExports] = useState<LibraryExport[]>([]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  async function loadTree() {
    const result = await api<{
      nodes: LibraryNode[];
      unclassifiedCount: number;
    }>("/api/v1/library/tree");
    setNodes(result.nodes.filter((item) => item.captureCount > 0));
    setUnclassifiedCount(result.unclassifiedCount);
  }
  async function loadExports() {
    const result = await api<{ exports: LibraryExport[] }>(
      "/api/v1/library-exports",
    );
    setLibraryExports(result.exports);
  }
  useEffect(() => {
    void loadTree();
    void loadExports();
  }, []);
  useEffect(() => {
    if (!libraryExports.some((item) => item.status === "pending")) {
      if (exportMessage === "Preparing your archive…") {
        setExportMessage(
          libraryExports[0]?.status === "complete"
            ? "Your archive is ready to download."
            : libraryExports[0]?.status === "failed"
              ? "Archive export could not be completed. You can try again."
              : "",
        );
      }
      return;
    }
    const timer = window.setInterval(() => void loadExports(), 2500);
    return () => window.clearInterval(timer);
  }, [exportMessage, libraryExports]);
  useEffect(() => {
    if (!nodes.length) return;
    try {
      window.localStorage.setItem(
        "social-knowledge-library-expanded-v2",
        JSON.stringify([...expandedNodes]),
      );
    } catch {
      // Browsing still works when storage is unavailable.
    }
  }, [expandedNodes, nodes.length]);
  async function navigateLibrary(target: string, historyIndex?: number) {
    const request = ++navigationRequest.current;
    setNavigationLoading(true);
    setNavigationError("");
    try {
      let nextNode: LibraryNodeDetail | null = null;
      let nextMarkdown = "";
      let nextCapture: string | null = null;
      if (target === "unclassified") {
        const result = await api<{ captures: Capture[] }>("/api/v1/library/unclassified");
        nextMarkdown = ["# Unclassified", "", "These captures need a confident placement.", "", ...result.captures.map((capture) => `- [${markdownLinkText(capture.title)}](capture:${capture.id})`)].join("\n");
      } else if (target.startsWith("capture:")) {
        nextCapture = target.slice(8);
        const result = await api<{ markdown: string }>(`/api/v1/captures/${nextCapture}/markdown`);
        nextMarkdown = result.markdown;
      } else if (target !== "home") {
        const result = await api<{ node: LibraryNodeDetail; markdown: string }>(`/api/v1/library/nodes/${target}`);
        nextNode = result.node;
        nextMarkdown = result.markdown;
      }
      if (request !== navigationRequest.current) return;
      setSelected(target);
      setNode(nextNode);
      setMarkdown(nextMarkdown);
      setSelectedCapture(nextCapture);
      setMobilePane("reading");
      setNavigation((current) => historyIndex !== undefined
        ? { ...current, index: historyIndex }
        : current.entries[current.index] === target
          ? current
          : { entries: [...current.entries.slice(0, current.index + 1), target], index: current.index + 1 });
    } catch {
      if (request === navigationRequest.current) setNavigationError("This page could not be loaded. Please try again.");
    } finally {
      if (request === navigationRequest.current) setNavigationLoading(false);
    }
  }
  const openNode = (id: string) => navigateLibrary(id);
  const openCapture = (id: string) => navigateLibrary(`capture:${id}`);
  const openUnclassified = () => navigateLibrary("unclassified");
  const children = (parentId: string | null) =>
    nodes.filter((candidate) => candidate.parentId === parentId);
  const nodeMatchesTreeQuery = (item: LibraryNode): boolean => {
    const query = treeQuery.trim().toLocaleLowerCase();
    if (!query) return true;
    if (item.label.toLocaleLowerCase().includes(query)) return true;
    return children(item.id).some(nodeMatchesTreeQuery);
  };
  const branch = (parentId: string | null, depth = 0): ReactNode =>
    children(parentId)
      .filter(nodeMatchesTreeQuery)
      .map((item) => {
        const expandable = children(item.id).length > 0;
        const expanded = expandedNodes.has(item.id);
        const branchId = `library-branch-${item.id}`;
        return (
          <Collapsible
            key={item.id}
            open={expanded}
            onOpenChange={(open) =>
              setExpandedNodes((current) => {
                const next = new Set(current);
                if (open) next.add(item.id);
                else next.delete(item.id);
                return next;
              })
            }
          >
            <div
              className={`library-tree-row ${selected === item.id ? "selected" : ""}`}
              style={{ paddingLeft: 4 + depth * 16 }}
            >
              {expandable ? (
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="library-tree-toggle"
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${item.label}`}
                    aria-controls={branchId}
                  >
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </CollapsibleTrigger>
              ) : (
                <span className="library-tree-leaf" aria-hidden="true" />
              )}
              <Button
                type="button"
                variant="ghost"
                className="library-tree-node"
                onClick={() => void openNode(item.id)}
              >
                <span className="library-tree-label">
                  {expandable && expanded ? <FolderOpen /> : <Folder />}
                  <span>{item.label}</span>
                </span>
                <small className="library-count">{item.captureCount}</small>
              </Button>
            </div>
            {expandable && (
              <CollapsibleContent id={branchId} className="library-tree-branch">
                {branch(item.id, depth + 1)}
              </CollapsibleContent>
            )}
          </Collapsible>
        );
      });
  async function refresh() {
    await loadTree();
    if (node) await openNode(node.id);
  }
  const selectedTitle =
    node?.label ??
    (selectedCapture
      ? "Capture note"
      : selected === "unclassified"
        ? "Unclassified"
        : "Home");
  const preparingExport = libraryExports.some(
    (item) => item.status === "pending",
  );
  return (
    <div className="library-page">
      <div className="knowledge-page-heading">
        <div>
          <div className="eyebrow">Knowledge base</div>
          <h1>{selectedTitle}</h1>
          <p>
            {selectedCapture
              ? "Generated Markdown, source context, and the original capture."
              : "Browse generated notes by category. Your saved posts remain the source."}
          </p>
        </div>
        <div className="knowledge-page-actions">
          <a className="knowledge-back-link" href="/">
            ← Back to Inbox
          </a>
          <button
            type="button"
            className="knowledge-export-button"
            onClick={() => setExportDialogOpen(true)}
          >
            Export archive
          </button>
        </div>
      </div>
      <div
        className="library-mobile-switch"
        role="tablist"
        aria-label="Knowledge base view"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === "browse"}
          onClick={() => setMobilePane("browse")}
        >
          Browse tree
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === "reading"}
          onClick={() => setMobilePane("reading")}
        >
          Reading pane
        </button>
      </div>
      <div className={`library-layout mobile-${mobilePane}`}>
        <aside className="library-sidebar" aria-label="Knowledge tree">
          <div className="library-sidebar-header">
            <div>
              <strong>Knowledge base</strong>
              <small>{nodes.length} categories</small>
            </div>
            <div className="library-tree-actions">
            <Button type="button" variant="ghost" className="library-collapse-all"
              disabled={!nodes.some((item) => children(item.id).length > 0 && !expandedNodes.has(item.id))}
              onClick={() => setExpandedNodes(new Set(nodes.filter((item) => children(item.id).length > 0).map((item) => item.id)))}>
              Expand all
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="library-collapse-all"
              disabled={!nodes.some((item) => children(item.id).length > 0 && expandedNodes.has(item.id))}
              onClick={() => setExpandedNodes(new Set())}
            >
              Collapse all
            </Button>
            </div>
          </div>
          <label className="knowledge-tree-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Search categories</span>
            <input
              type="search"
              placeholder="Search categories"
              value={treeQuery}
              onChange={(event) => setTreeQuery(event.target.value)}
            />
            {treeQuery && (
              <button
                type="button"
                aria-label="Clear category search"
                onClick={() => setTreeQuery("")}
              >
                <X aria-hidden="true" />
              </button>
            )}
          </label>
          <ScrollArea className="library-tree">
            <Button
              type="button"
              variant="ghost"
              className={`library-root-row ${selected === "home" ? "selected" : ""}`}
              onClick={() => void navigateLibrary("home")}
            >
              <House aria-hidden="true" />
              <span>Home</span>
              <small className="library-count">
                {nodes
                  .filter((n) => n.parentId === null)
                  .reduce((sum, n) => sum + n.captureCount, 0) + unclassifiedCount}
              </small>
            </Button>
            {branch(null)}
            {unclassifiedCount > 0 && <Button
              type="button"
              variant="ghost"
              className={`library-root-row ${selected === "unclassified" ? "selected" : ""}`}
              onClick={() => void openUnclassified()}
            >
              <FileQuestion aria-hidden="true" />
              <span>Unclassified</span>
              <small className="library-count">{unclassifiedCount}</small>
            </Button>}
          </ScrollArea>
        </aside>
        <section className="markdown-pane" aria-label="Reading pane">
          <div className="library-toolbar library-navigation">
            <nav aria-label="Knowledge base history">
              <button type="button" aria-label="Back in knowledge base" disabled={navigationLoading || navigation.index === 0}
                onClick={() => void navigateLibrary(navigation.entries[navigation.index - 1]!, navigation.index - 1)}><ArrowLeft aria-hidden="true" /> Back</button>
              <button type="button" aria-label="Forward in knowledge base" disabled={navigationLoading || navigation.index === navigation.entries.length - 1}
                onClick={() => void navigateLibrary(navigation.entries[navigation.index + 1]!, navigation.index + 1)}><ArrowRight aria-hidden="true" /> Forward</button>
            </nav>
            {selectedCapture && <button type="button" onClick={() => onOpen(selectedCapture)}>Open capture</button>}
          </div>
          {navigationLoading && <p className="library-navigation-feedback" role="status">Loading page…</p>}
          {navigationError && <p className="library-navigation-feedback" role="alert">{navigationError}</p>}
          {node && (
            <div className="library-toolbar">
              <div className="library-breadcrumb">
                {node.breadcrumb.map((part) => part.label).join("  ›  ")}
              </div>
              <div>
                <button
                  onClick={async () => {
                    const label = window.prompt(
                      "New category name",
                      node.label,
                    );
                    if (!label) return;
                    await api(`/api/v1/library/nodes/${node.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ label }),
                    });
                    await refresh();
                  }}
                >
                  Rename
                </button>
                <button
                  onClick={async () => {
                    const compatible = nodes.filter(
                      (candidate) =>
                        candidate.kind === node.kind &&
                        candidate.id !== node.id,
                    );
                    const targetLabel = window.prompt(
                      `Merge into: ${compatible.map((candidate) => candidate.label).join(", ")}`,
                    );
                    const target = compatible.find(
                      (candidate) =>
                        candidate.label.toLowerCase() ===
                        targetLabel?.toLowerCase(),
                    );
                    if (
                      !target ||
                      !window.confirm(
                        `Merge ${node.label} into ${target.label}?`,
                      )
                    )
                      return;
                    await api(`/api/v1/library/nodes/${node.id}/merge`, {
                      method: "POST",
                      body: JSON.stringify({ targetNodeId: target.id }),
                    });
                    setSelected(target.id);
                    await loadTree();
                    await openNode(target.id);
                  }}
                >
                  Merge
                </button>
              </div>
            </div>
          )}
          <article className="markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              urlTransform={(url) =>
                /^(capture:|library:|https?:|mailto:|\/)/i.test(url) ? url : ""
              }
              components={{
                a: ({ href, children }) => {
                  if (href?.startsWith("capture:"))
                    return (
                      <button
                        className="markdown-link"
                        onClick={() => void openCapture(href.slice(8))}
                      >
                        {children}
                      </button>
                    );
                  if (href?.startsWith("library:"))
                    return (
                      <button
                        className="markdown-link"
                        onClick={() => void (href === "library:unclassified" ? openUnclassified() : openNode(href.slice(8)))}
                      >
                        {children}
                      </button>
                    );
                  return (
                    <a href={href} target="_blank" rel="noreferrer">
                      {externalLinkLabel(href, children)}
                    </a>
                  );
                },
              }}
            >
              {markdownForDisplay(
                selected === "home"
                  ? libraryHomeMarkdown(nodes, unclassifiedCount)
                  : markdown,
              )}
            </ReactMarkdown>
          </article>
        </section>
      </div>
      {exportDialogOpen && (
        <div
          className="knowledge-export-scrim"
          role="presentation"
          onClick={() => setExportDialogOpen(false)}
        >
          <section
            className="knowledge-export-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-archive-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <div className="eyebrow">Portable backup</div>
              <h2 id="export-archive-title">Download your archive</h2>
              <p>
                Create a complete private copy of your saved knowledge. Account
                credentials and server configuration are excluded.
              </p>
            </div>
            <ul className="knowledge-export-contents">
              <li>Markdown notes and capture metadata</li>
              <li>Transcripts, comments, images, audio, and video</li>
              <li>One secure download link, available for 24 hours</li>
            </ul>
            {exportMessage && (
              <p className="knowledge-export-message" role="status">
                {exportMessage}
              </p>
            )}
            {libraryExports[0]?.status === "complete" && (
              <a
                className="knowledge-export-ready"
                href={`/api/v1/library-exports/${libraryExports[0].id}/download`}
              >
                Download ready archive
              </a>
            )}
            <div className="knowledge-export-actions">
              <button
                type="button"
                className="knowledge-dialog-cancel"
                onClick={() => setExportDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="knowledge-export-button"
                disabled={preparingExport}
                onClick={async () => {
                  setExportMessage("Preparing your archive…");
                  try {
                    await api("/api/v1/library-exports", { method: "POST" });
                    await loadExports();
                  } catch (error) {
                    setExportMessage(
                      error instanceof Error
                        ? error.message
                        : "Archive export could not start.",
                    );
                  }
                }}
              >
                {preparingExport ? "Preparing…" : "Prepare download"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
