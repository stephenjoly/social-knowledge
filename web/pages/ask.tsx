import {
  Children,
  isValidElement,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowDown,
  ArrowUp,
  Brain,
  Check,
  ChevronDown,
  Copy,
  CornerDownRight,
  History,
  LibraryBig,
  MessageSquare,
  PencilLine,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import {
  applyStreamEvent,
  finishStream,
  initialStreamState,
  mergeConversationSnapshot,
  reconcileConversationAttempt,
  SseDecoder,
  type StreamState,
} from "../chat-stream";
import type {
  AiProviderState,
  AskSource,
  Capture,
  ChatMessage,
  Conversation,
  SettingsTopic,
} from "../shared/types";
import { api, assetUrl } from "../shared/api";
import { ActionButton, Chip, IconBox } from "../components/ui/primitives";
import {
  answerWithCaptureLinks,
  askFailure,
  type AskRecovery,
  type CaptureFacets,
  conversationTimeLabel,
  questionExcerpt,
  questionFor,
  safeSourceUrl,
  sourcePanelFor,
  sourceAttribution,
  suggestionsFrom,
  thumbTint,
} from "./ask-format";
import "../ask.css";

const recentLimit = 5;
/** How far from the end the reader can drift and still be following the answer. */
const followSlack = 48;

type SourceDetails = { thumbUrl: string | null; sourceType: string | null };
type ArchiveState = "loading" | "empty" | "saved" | "unknown";
type ReadingPosition = {
  windowY: number;
  threadTop: number;
  trigger: HTMLElement | null;
  triggerSelector: string;
  triggerIndex: number;
};

/** A failed request, carrying a stored-error-style code for controlled copy. */
class AskRequestError extends Error {
  constructor(
    readonly code: string,
    readonly assistantId?: string,
  ) {
    super(code);
    this.name = "AskRequestError";
  }
}

const recoveryLabels: Record<AskRecovery, string> = {
  retry: "Retry",
  rephrase: "Edit question",
  "new-chat": "New chat",
  setup: "Check AI setup",
};

function isCitationLink(node: ReactNode) {
  if (!isValidElement(node)) return false;
  const href = (node.props as { href?: unknown }).href;
  return typeof href === "string" && href.startsWith("capture:");
}

/** Moves citations that end a list item into the right-hand citation column. */
function splitTrailingCitations(children: ReactNode) {
  const body = Children.toArray(children);
  const citations: ReactNode[] = [];
  while (body.length) {
    const last = body[body.length - 1];
    if (typeof last === "string" && !last.trim()) body.pop();
    else if (isCitationLink(last)) citations.unshift(body.pop());
    else break;
  }
  return { body, citations };
}

function useDismiss(
  open: boolean,
  close: () => void,
  ref: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, ref]);
}

function Composer({
  variant,
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  thinkingLevel,
  textareaRef,
}: {
  variant: "home" | "follow-up";
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  thinkingLevel: string | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      onSubmit();
    }
  };
  const chips = (
    <>
      <Chip className="ask-chip" icon={LibraryBig}>
        Whole archive
      </Chip>
      {variant === "home" && thinkingLevel && (
        <Chip className="ask-chip" icon={Brain}>
          Thinking: {thinkingLevel.slice(0, 1).toUpperCase()}
          {thinkingLevel.slice(1)}
        </Chip>
      )}
    </>
  );
  const send = (
    <button
      type={streaming ? "button" : "submit"}
      className={`ask-send${streaming ? " ask-stop" : ""}`}
      disabled={!streaming && !value.trim()}
      onClick={streaming ? onStop : undefined}
    >
      {streaming ? (
        <Square size={12} fill="currentColor" aria-hidden="true" />
      ) : (
        <ArrowUp size={16} aria-hidden="true" />
      )}
      <span className="sr-only">{streaming ? "Stop" : "Send"}</span>
    </button>
  );
  return (
    <form
      className={`ask-composer ask-composer-${variant}`}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        aria-label="Ask your archive"
        placeholder={
          variant === "home"
            ? "Ask anything about your archive…"
            : "Ask a follow-up…"
        }
        maxLength={2000}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {variant === "home" ? (
        <div className="ask-composer-bar">
          {chips}
          <span className="ask-composer-flex" />
          {send}
        </div>
      ) : (
        <>
          {chips}
          {send}
        </>
      )}
    </form>
  );
}

export function AskAI({
  onOpen,
  onOpenSettings,
  onCapture,
}: {
  onOpen: (id: string) => void;
  /** Opens a Settings topic, e.g. AI & models when Ask cannot answer yet. */
  onOpenSettings?: (topic: SettingsTopic) => void;
  /** Opens the Capture dialog from the empty-archive state. */
  onCapture?: () => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [listError, setListError] = useState("");
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [reconciliationNotice, setReconciliationNotice] = useState("");
  const [liveMessage, setLiveMessage] = useState("");
  const [facets, setFacets] = useState<CaptureFacets | null>(null);
  const [thinkingLevel, setThinkingLevel] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sourceDetails, setSourceDetails] = useState<
    Record<string, SourceDetails>
  >({});
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [archive, setArchive] = useState<ArchiveState>("loading");
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(
    null,
  );
  const [jumpVisible, setJumpVisible] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const titleMenuRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const sourcesHeadingRef = useRef<HTMLHeadingElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  /** Whether new answer text should keep the thread scrolled to its end. */
  const followRef = useRef(true);
  const lastScrollRef = useRef(0);
  const readingPositionRef = useRef<ReadingPosition | null>(null);
  /** Optimistic answers whose request failed before the server stored a turn. */
  const unsentAnswerIdsRef = useRef(new Set<string>());
  const abortRef = useRef<AbortController | null>(null);
  const selectedConversationIdRef = useRef<string | null>(null);
  const activeAttemptRef = useRef<{
    conversationId: string;
    temporaryId: string;
    optimisticUserId: string | null;
  } | null>(null);
  const partialAnswersRef = useRef(new Map<string, string>());
  const serverAssistantIdsRef = useRef(new Map<string, string>());

  type StreamOutcome = StreamState<AskSource>;

  function updateAssistant(temporaryId: string, patch: Partial<ChatMessage>) {
    setCurrent((existing) =>
      existing
        ? {
            ...existing,
            messages: (existing.messages ?? []).map((message) =>
              message.id === temporaryId ? { ...message, ...patch } : message,
            ),
          }
        : existing,
    );
  }
  async function loadList() {
    try {
      const result = await api<{ conversations: Conversation[] }>(
        "/api/v1/conversations",
      );
      setConversations(result.conversations);
      setListError("");
    } catch {
      setListError("Recent conversations could not be loaded.");
    } finally {
      setConversationsLoaded(true);
    }
  }
  async function fetchConversation(id: string) {
    const result = await api<{ conversation: Conversation }>(
      `/api/v1/conversations/${id}`,
    );
    return result.conversation;
  }
  async function openConversation(id: string) {
    selectedConversationIdRef.current = id;
    setHistoryOpen(false);
    setError("");
    let conversation: Conversation;
    try {
      conversation = await fetchConversation(id);
    } catch {
      if (selectedConversationIdRef.current === id)
        setError("This conversation could not be opened. Try again.");
      return;
    }
    if (selectedConversationIdRef.current !== id) return;
    const active = activeAttemptRef.current;
    const activeForConversation = active?.conversationId === id ? active : null;
    const activeAssistantId = activeForConversation
      ? (serverAssistantIdsRef.current.get(activeForConversation.temporaryId) ??
        conversation.messages?.find(
          (message) =>
            message.role === "assistant" && message.status === "pending",
        )?.id)
      : undefined;
    if (activeForConversation && activeAssistantId)
      serverAssistantIdsRef.current.set(
        activeForConversation.temporaryId,
        activeAssistantId,
      );
    setCurrent((existing) =>
      mergeConversationSnapshot(
        existing?.id === id ? existing : null,
        conversation,
        activeForConversation
          ? {
              assistantId: activeAssistantId,
              partialText: partialAnswersRef.current.get(
                activeForConversation.temporaryId,
              ),
              optimisticMessageIds: [
                activeForConversation.temporaryId,
                ...(activeForConversation.optimisticUserId
                  ? [activeForConversation.optimisticUserId]
                  : []),
              ],
            }
          : {},
      ),
    );
  }
  function startNewChat(keepQuestion = false) {
    selectedConversationIdRef.current = null;
    setCurrent(null);
    setSelectedAnswerId(null);
    setHistoryOpen(false);
    setTitleMenuOpen(false);
    setError("");
    if (!keepQuestion) setQuestion("");
  }
  async function deleteCurrent() {
    if (!current) return;
    setTitleMenuOpen(false);
    if (!window.confirm("Delete this conversation?")) return;
    try {
      await api(`/api/v1/conversations/${current.id}`, { method: "DELETE" });
    } catch {
      setError("This conversation could not be deleted. Try again.");
      return;
    }
    startNewChat();
    await loadList();
  }
  useEffect(() => {
    void loadList();
    void api<CaptureFacets>("/api/v1/capture-facets")
      .then(setFacets)
      .catch(() => setFacets(null));
    void api<AiProviderState>("/api/v1/ai-providers")
      .then((state) => {
        setThinkingLevel(state.selections.analysis?.thinkingLevel ?? null);
        setAiReady(state.readiness?.ask ?? null);
      })
      .catch(() => {
        setThinkingLevel(null);
        setAiReady(null);
      });
    void api<{ captures: unknown[] }>("/api/v1/captures?limit=1")
      .then((result) => setArchive(result.captures.length ? "saved" : "empty"))
      .catch(() => setArchive("unknown"));
  }, []);

  const panel = sourcePanelFor(current?.messages, selectedAnswerId);
  const panelSources = panel.answer?.sources ?? [];
  const panelSourceKey = panelSources.map((source) => source.id).join(",");
  useEffect(() => {
    const missing = panelSources.filter(
      (source) => !(source.id in sourceDetails),
    );
    if (!missing.length) return;
    let cancelled = false;
    void Promise.all(
      missing.map(async (source): Promise<[string, SourceDetails]> => {
        try {
          const { capture } = await api<{ capture: Capture }>(
            `/api/v1/captures/${source.id}`,
          );
          const thumb = capture.assets.find(
            (asset) => asset.kind === "thumbnail" || asset.kind === "image",
          );
          return [
            source.id,
            {
              thumbUrl: thumb ? assetUrl(capture.id, thumb.id) : null,
              sourceType: capture.sourceType,
            },
          ];
        } catch {
          return [source.id, { thumbUrl: null, sourceType: null }];
        }
      }),
    ).then((entries) => {
      if (!cancelled)
        setSourceDetails((existing) => ({
          ...existing,
          ...Object.fromEntries(entries),
        }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelSourceKey]);

  const messageCount = current?.messages?.length ?? 0;
  const lastContentLength =
    current?.messages?.[messageCount - 1]?.content.length ?? 0;
  const hasThread = messageCount > 0;

  /** Below 1180px the page scrolls; above it the thread is its own scroller. */
  function threadScrolls() {
    const thread = threadRef.current;
    return Boolean(thread && getComputedStyle(thread).overflowY !== "visible");
  }
  function scrollPosition() {
    return threadScrolls() ? threadRef.current!.scrollTop : window.scrollY;
  }
  function isHidden() {
    const root = rootRef.current;
    return !root || root.getClientRects().length === 0;
  }
  function isAtEnd() {
    const marker = threadEndRef.current;
    if (!marker) return true;
    const margin =
      Number.parseFloat(getComputedStyle(marker).scrollMarginBottom) || 0;
    const bottom = threadScrolls()
      ? threadRef.current!.getBoundingClientRect().bottom
      : window.innerHeight;
    return marker.getBoundingClientRect().bottom <= bottom - margin + followSlack;
  }
  function scrollToEnd() {
    threadEndRef.current?.scrollIntoView?.({ block: "end" });
    lastScrollRef.current = scrollPosition();
  }
  function followLatest() {
    followRef.current = true;
    setJumpVisible(false);
    scrollToEnd();
  }

  // Opening a conversation starts at its latest answer.
  useEffect(() => {
    followRef.current = true;
    setJumpVisible(false);
    if (!isHidden()) scrollToEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // New text follows the end only while the reader has not scrolled up.
  useEffect(() => {
    if (!hasThread || isHidden()) return;
    if (followRef.current) scrollToEnd();
    else setJumpVisible(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageCount, lastContentLength]);

  useEffect(() => {
    if (!hasThread) return;
    const thread = threadRef.current;
    lastScrollRef.current = scrollPosition();
    const onScroll = () => {
      if (isHidden()) return;
      const position = scrollPosition();
      if (position < lastScrollRef.current - 2) followRef.current = false;
      else if (isAtEnd()) followRef.current = true;
      lastScrollRef.current = position;
      if (followRef.current) setJumpVisible(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    thread?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      thread?.removeEventListener("scroll", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasThread]);

  // A saved note replaces Ask without unmounting it; on return, put the
  // reader back where they were and refocus what they opened it from.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    let wasHidden = isHidden();
    const observer = new ResizeObserver(() => {
      if (isHidden()) {
        wasHidden = true;
        return;
      }
      if (!wasHidden) return;
      wasHidden = false;
      const saved = readingPositionRef.current;
      readingPositionRef.current = null;
      if (!saved) return;
      const restore = () => {
        if (threadRef.current) threadRef.current.scrollTop = saved.threadTop;
        window.scrollTo(0, saved.windowY);
        lastScrollRef.current = scrollPosition();
        // Selecting an earlier answer can replace ReactMarkdown's citation
        // button. Resolve that same source in the same answer after rendering.
        const trigger = saved.trigger?.isConnected
          ? saved.trigger
          : root.querySelectorAll<HTMLElement>(saved.triggerSelector)[saved.triggerIndex];
        trigger?.focus({ preventScroll: true });
      };
      restore();
      window.requestAnimationFrame(restore);
    });
    observer.observe(root);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasThread]);

  function openSource(id: string, trigger: HTMLElement | null, answerId?: string) {
    const triggerSelector = answerId
      ? `#${CSS.escape(`ask-answer-${answerId}`)} .ask-cite[data-source-id="${CSS.escape(id)}"]`
      : `.ask-source-open[data-source-id="${CSS.escape(id)}"]`;
    const triggers = Array.from(rootRef.current?.querySelectorAll<HTMLElement>(triggerSelector) ?? []);
    readingPositionRef.current = {
      windowY: window.scrollY,
      threadTop: threadRef.current?.scrollTop ?? 0,
      trigger,
      triggerSelector,
      triggerIndex: trigger ? Math.max(0, triggers.indexOf(trigger)) : 0,
    };
    onOpen(id);
  }

  useDismiss(historyOpen, () => setHistoryOpen(false), historyRef);
  useDismiss(titleMenuOpen, () => setTitleMenuOpen(false), titleMenuRef);

  function applyConversationSnapshot(
    snapshot: Conversation,
    options: {
      assistantId?: string;
      partialText?: string;
      optimisticMessageIds?: string[];
    },
  ) {
    setCurrent((existing) =>
      existing?.id === snapshot.id &&
      selectedConversationIdRef.current === snapshot.id
        ? mergeConversationSnapshot(existing, snapshot, options)
        : existing,
    );
  }

  async function reconcileAttempt(
    conversationId: string,
    outcome: StreamOutcome,
    optimisticMessageIds: string[],
  ) {
    const assistantId = outcome.assistantId;
    const isSelected = () =>
      selectedConversationIdRef.current === conversationId;
    const result = await reconcileConversationAttempt(
      assistantId,
      () => fetchConversation(conversationId),
      {
        sleep: (milliseconds) =>
          new Promise((resolve) => window.setTimeout(resolve, milliseconds)),
        onSnapshot: (snapshot) => {
          const assistant = assistantId
            ? snapshot.messages?.find((message) => message.id === assistantId)
            : undefined;
          if (assistant?.status === "complete" && isSelected()) setError("");
          applyConversationSnapshot(snapshot, {
            assistantId,
            partialText: outcome.text,
            optimisticMessageIds,
          });
        },
        onStillPending: () => {
          if (isSelected()) setReconciliationNotice("Still stopping…");
        },
      },
    );
    if (result === "timeout" && isSelected())
      setError("The answer is still stopping. Refresh before retrying.");
  }

  async function consumeStream(
    response: Response,
    temporaryId: string,
  ): Promise<StreamOutcome> {
    if (!response.ok || !response.body) {
      const problem = (await response.json().catch(() => ({}))) as {
        error?: string;
        assistantId?: string;
      };
      if (
        problem.error === "ai_provider_required" ||
        problem.error === "analysis_provider_required"
      )
        setAiReady(false);
      throw new AskRequestError(
        typeof problem.error === "string" ? problem.error : "start_failed",
        typeof problem.assistantId === "string"
          ? problem.assistantId
          : undefined,
      );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseDecoder();
    let state = initialStreamState<AskSource>();
    let renderedId = temporaryId;

    const setRenderedId = (serverAssistantId: string) => {
      if (serverAssistantId === renderedId) return;
      const previousId = renderedId;
      renderedId = serverAssistantId;
      serverAssistantIdsRef.current.set(temporaryId, serverAssistantId);
      setCurrent((existing) =>
        existing
          ? {
              ...existing,
              messages: (existing.messages ?? []).map((message) =>
                message.id === previousId
                  ? { ...message, id: serverAssistantId }
                  : message,
              ),
            }
          : existing,
      );
    };
    const applyState = (next: StreamOutcome) => {
      state = next;
      if (state.assistantId) setRenderedId(state.assistantId);
      partialAnswersRef.current.set(temporaryId, state.text);
      updateAssistant(renderedId, {
        content: state.text,
        sources: state.sources,
        sufficient: state.sufficient,
        statusText: state.statusText,
        ...(state.status === "pending" ? {} : { status: state.status }),
        errorCode: state.errorCode,
      });
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        const chunk = decoder.decode(value ?? new Uint8Array(), {
          stream: !done,
        });
        for (const event of parser.push(chunk, done))
          applyState(applyStreamEvent(state, event));
        if (done) break;
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    }
    applyState(finishStream(state));
    return state;
  }
  async function runRequest(
    url: string,
    body: object,
    conversationId: string,
    temporaryId: string,
    optimisticUserId: string | null,
  ) {
    const controller = new AbortController();
    abortRef.current = controller;
    activeAttemptRef.current = {
      conversationId,
      temporaryId,
      optimisticUserId,
    };
    setStreaming(true);
    setError("");
    setReconciliationNotice("");
    setLiveMessage("Searching your archive…");
    let outcome: StreamOutcome | null = null;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      outcome = await consumeStream(response, temporaryId);
      setLiveMessage(
        outcome.status === "complete"
          ? "Answer ready."
          : `The answer did not finish. ${askFailure(outcome.errorCode, outcome.status).text}`,
      );
    } catch (cause) {
      const aborted =
        (cause instanceof DOMException && cause.name === "AbortError") ||
        (cause instanceof Error && cause.name === "AbortError");
      if (!aborted) controller.abort();
      const answer = partialAnswersRef.current.get(temporaryId) ?? "";
      const responseAssistantId =
        cause instanceof AskRequestError ? cause.assistantId : undefined;
      const assistantId =
        serverAssistantIdsRef.current.get(temporaryId) ?? responseAssistantId;
      const errorCode = aborted
        ? "cancelled"
        : cause instanceof AskRequestError
          ? cause.code
          : cause instanceof TypeError
            ? "connection_lost"
            : "provider_error";
      outcome = {
        ...initialStreamState<AskSource>(),
        assistantId,
        text: answer,
        status: aborted ? "cancelled" : "failed",
        errorCode,
      };
      if (!assistantId) unsentAnswerIdsRef.current.add(temporaryId);
      updateAssistant(assistantId ?? temporaryId, {
        content: answer,
        status: outcome.status,
        errorCode,
      });
      setLiveMessage(
        aborted
          ? "Answer stopped."
          : `The answer did not finish. ${askFailure(errorCode, "failed").text}`,
      );
    } finally {
      abortRef.current = null;
      try {
        if (outcome) {
          await reconcileAttempt(conversationId, outcome, [
            temporaryId,
            ...(optimisticUserId ? [optimisticUserId] : []),
          ]);
        }
        await loadList().catch(() => undefined);
      } finally {
        partialAnswersRef.current.delete(temporaryId);
        serverAssistantIdsRef.current.delete(temporaryId);
        if (activeAttemptRef.current?.temporaryId === temporaryId)
          activeAttemptRef.current = null;
        setReconciliationNotice("");
        setStreaming(false);
      }
    }
  }
  async function send(text = question, base: Conversation | null = current) {
    const cleaned = text.trim();
    if (!cleaned || streaming) return;
    let conversation = base;
    if (!conversation) {
      try {
        const result = await api<{ conversation: Conversation }>(
          "/api/v1/conversations",
          { method: "POST", body: JSON.stringify({}) },
        );
        conversation = result.conversation;
      } catch {
        setError("Ask AI could not start a conversation. Try again.");
        return;
      }
      selectedConversationIdRef.current = conversation.id;
      setCurrent(conversation);
    }
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: cleaned,
      sources: [],
      sufficient: null,
      status: "complete",
      statusText: null,
      errorCode: null,
      retryOf: null,
      userMessageId: null,
      createdAt: new Date().toISOString(),
    };
    const assistant: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      sources: [],
      sufficient: null,
      status: "pending",
      statusText: null,
      errorCode: null,
      retryOf: null,
      userMessageId: userMessage.id,
      createdAt: new Date().toISOString(),
    };
    setCurrent({
      ...conversation,
      messages: [...(conversation.messages ?? []), userMessage, assistant],
    });
    setQuestion("");
    setSelectedAnswerId(null);
    followRef.current = true;
    setJumpVisible(false);
    await runRequest(
      `/api/v1/conversations/${conversation.id}/messages`,
      { message: cleaned, requestId: crypto.randomUUID() },
      conversation.id,
      assistant.id,
      userMessage.id,
    );
  }
  async function retry(message: ChatMessage) {
    if (!current || streaming) return;
    if (unsentAnswerIdsRef.current.has(message.id)) {
      // Never stored on the server: ask the same question again instead.
      const asked = questionFor(current.messages, message);
      unsentAnswerIdsRef.current.delete(message.id);
      const remaining = (current.messages ?? []).filter(
        (item) => item.id !== message.id && item.id !== asked?.id,
      );
      const trimmed = { ...current, messages: remaining };
      setCurrent(trimmed);
      if (asked) await send(asked.content, trimmed);
      return;
    }
    setSelectedAnswerId(null);
    followRef.current = true;
    setJumpVisible(false);
    const temporary: ChatMessage = {
      ...message,
      id: crypto.randomUUID(),
      content: "",
      sources: [],
      sufficient: null,
      status: "pending",
      statusText: null,
      errorCode: null,
      retryOf: message.id,
    };
    setCurrent({
      ...current,
      messages: [...(current.messages ?? []), temporary],
    });
    await runRequest(
      `/api/v1/conversations/${current.id}/messages/${message.id}/retry`,
      { requestId: crypto.randomUUID() },
      current.id,
      temporary.id,
      null,
    );
  }
  async function copyAnswer(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      setLiveMessage("Answer copied.");
      window.setTimeout(
        () => setCopiedId((id) => (id === message.id ? null : id)),
        1600,
      );
    } catch {
      setLiveMessage("The answer could not be copied.");
    }
  }

  function bindPanelTo(message: ChatMessage) {
    setSelectedAnswerId(message.id === lastAssistant?.id ? null : message.id);
  }
  /** Points the sources panel at one answer; when stacked below, takes the reader there. */
  function showSourcesFor(message: ChatMessage) {
    bindPanelTo(message);
    const asked = questionFor(current?.messages, message);
    setLiveMessage(
      `Showing ${message.sources.length} ${message.sources.length === 1 ? "source" : "sources"} for ${asked ? `“${questionExcerpt(asked.content)}”` : "this answer"}.`,
    );
    if (!threadScrolls()) {
      followRef.current = false;
      window.requestAnimationFrame(() => {
        sourcesHeadingRef.current?.scrollIntoView?.({ block: "start" });
        sourcesHeadingRef.current?.focus({ preventScroll: true });
      });
    }
  }
  function goToAnswer(id: string) {
    const article = document.getElementById(`ask-answer-${id}`);
    if (!article) return;
    followRef.current = false;
    article.scrollIntoView?.({ block: "start" });
    article.focus({ preventScroll: true });
  }
  function editQuestion(message: ChatMessage) {
    const asked = questionFor(current?.messages, message);
    if (asked) setQuestion(asked.content);
    window.requestAnimationFrame(() => {
      const input = composerInputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }
  function recover(action: AskRecovery, message: ChatMessage) {
    if (action === "retry") void retry(message);
    else if (action === "rephrase") editQuestion(message);
    else if (action === "new-chat") {
      const asked = questionFor(current?.messages, message);
      startNewChat(true);
      if (asked) setQuestion(asked.content);
    } else onOpenSettings?.("ai");
  }

  function markdownComponents(message: ChatMessage): Components {
    return {
      a: ({ href, children }) => {
        if (href?.startsWith("capture:")) {
          const source = message.sources.find(
            ({ id }) => id === href.slice(8),
          );
          if (source)
            return (
              <button
                type="button"
                className="ask-cite"
                data-source-id={source.id}
                aria-label={`Open source ${source.citation}: ${source.title}`}
                title={source.title}
                onClick={(event) => {
                  bindPanelTo(message);
                  openSource(source.id, event.currentTarget, message.id);
                }}
              >
                {children}
              </button>
            );
        }
        return (
          <a href={href} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        );
      },
      li: ({ children }) => {
        const { body, citations } = splitTrailingCitations(children);
        return (
          <li>
            <span className="ask-bullet" aria-hidden="true" />
            <span className="ask-li-body">
              <span className="ask-li-text">{body}</span>
              {citations.length > 0 && (
                <span className="ask-li-cites">{citations}</span>
              )}
            </span>
          </li>
        );
      },
    };
  }

  const suggestions = suggestionsFrom(facets);
  const suggestionRows = [suggestions.slice(0, 2), suggestions.slice(2, 4)];
  const recent = showAllRecent
    ? conversations
    : conversations.slice(0, recentLimit);
  const lastAssistant = [...(current?.messages ?? [])]
    .reverse()
    .find((message) => message.role === "assistant");
  const panelQuestion = panel.answer
    ? questionFor(current?.messages, panel.answer)
    : null;
  const earlierQuestion = panel.earlierCited
    ? questionFor(current?.messages, panel.earlierCited)
    : null;
  const notices = (
    <>
      {error && (
        <p className="ask-notice ask-notice-error" role="alert">
          {error}
        </p>
      )}
      {reconciliationNotice && (
        <p className="ask-notice" role="status">
          {reconciliationNotice}
        </p>
      )}
    </>
  );
  const composer = (variant: "home" | "follow-up") => (
    <Composer
      variant={variant}
      value={question}
      onChange={setQuestion}
      onSubmit={() => void send()}
      onStop={() => abortRef.current?.abort()}
      streaming={streaming}
      thinkingLevel={thinkingLevel}
      textareaRef={composerInputRef}
    />
  );
  const liveRegion = (
    <p className="sr-only" role="status" aria-live="polite">
      {liveMessage}
    </p>
  );
  const setupCallout = aiReady === false && (
    <div className="ask-callout" role="note" aria-labelledby="ask-setup-title">
      <div className="ask-callout-text">
        <strong id="ask-setup-title">Ask needs an AI model to answer</strong>
        <span>
          Connect a provider and choose an Analysis model in AI &amp; models.
          Your archive stays private.
        </span>
      </div>
      {onOpenSettings && (
        <ActionButton
          variant="primary"
          icon={Settings2}
          onClick={() => onOpenSettings("ai")}
        >
          Set up AI
        </ActionButton>
      )}
    </div>
  );

  if (!current?.messages?.length)
    return (
      <div className="ask-v2" ref={rootRef}>
        {liveRegion}
        <section className="ask-home" aria-labelledby="ask-title">
          <IconBox icon={Sparkles} size={44} tone="green" />
          <div className="ask-home-heading">
            <h1 id="ask-title">Ask what you&apos;ve saved</h1>
            <p>
              Answers come only from your saved posts, with sources you can
              open.
            </p>
          </div>
          <div className="ask-home-column">
            {setupCallout}
            {composer("home")}
            {notices}
          </div>
          {archive === "empty" ? (
            <div
              className="ask-callout ask-home-column"
              role="note"
              aria-labelledby="ask-empty-title"
            >
              <div className="ask-callout-text">
                <strong id="ask-empty-title">Nothing saved yet</strong>
                <span>
                  Capture an Instagram or Facebook post. Once it&apos;s
                  processed, you can ask about it here.
                </span>
              </div>
              {onCapture && (
                <ActionButton icon={Plus} onClick={onCapture}>
                  Capture your first post
                </ActionButton>
              )}
            </div>
          ) : archive !== "loading" ? (
            <div
              className="ask-suggestions ask-home-column"
              aria-label="Suggested questions"
              role="group"
            >
              {suggestionRows.map((row, index) => (
                <div className="ask-suggestion-row" key={index}>
                  {row.map((suggestion) => (
                    <button
                      type="button"
                      className="ask-suggestion"
                      key={suggestion}
                      disabled={streaming || aiReady === false}
                      onClick={() => void send(suggestion)}
                    >
                      <CornerDownRight size={13} aria-hidden="true" />
                      <span>{suggestion}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
          {(conversations.length > 0 || listError) && (
            <section
              className="ask-recent ask-home-column"
              aria-labelledby="ask-recent-title"
            >
              <h2 id="ask-recent-title">Recent conversations</h2>
              {listError ? (
                <p className="ask-recent-error" role="alert">
                  {listError}{" "}
                  <button type="button" onClick={() => void loadList()}>
                    Retry
                  </button>
                </p>
              ) : (
                <ul>
                  {recent.map((conversation) => (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        className="ask-recent-row"
                        aria-current={
                          current?.id === conversation.id ? "true" : undefined
                        }
                        onClick={() => void openConversation(conversation.id)}
                      >
                        <MessageSquare size={14} aria-hidden="true" />
                        <span className="ask-recent-title">
                          {conversation.title}
                        </span>
                        <time dateTime={conversation.updatedAt}>
                          {conversationTimeLabel(conversation.updatedAt)}
                        </time>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!listError && conversations.length > recentLimit && (
                <button
                  type="button"
                  className="ask-recent-more"
                  onClick={() => setShowAllRecent((value) => !value)}
                >
                  {showAllRecent
                    ? "Show fewer"
                    : `Show all ${conversations.length} conversations`}
                </button>
              )}
            </section>
          )}
          {!conversationsLoaded && (
            <p className="sr-only" role="status">
              Loading conversations…
            </p>
          )}
        </section>
      </div>
    );

  return (
    <div className="ask-v2" ref={rootRef}>
      {liveRegion}
      <div className="ask-conversation">
        <section className="ask-chat" aria-labelledby="ask-chat-title">
          <div className="ask-chat-bar">
            <div className="ask-popover-anchor ask-title-anchor" ref={titleMenuRef}>
              <h1 id="ask-chat-title" className="ask-title-heading">
                <button
                  type="button"
                  className="ask-title"
                  aria-haspopup="menu"
                  aria-expanded={titleMenuOpen}
                  onClick={() => setTitleMenuOpen((open) => !open)}
                >
                  <span>{current.title}</span>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
              </h1>
              {titleMenuOpen && (
                <div className="ask-popover ask-title-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="ask-menu-item ask-menu-danger"
                    disabled={streaming}
                    onClick={() => void deleteCurrent()}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Delete conversation
                  </button>
                </div>
              )}
            </div>
            <div className="ask-popover-anchor" ref={historyRef}>
              <ActionButton
                variant="ghost"
                icon={History}
                aria-expanded={historyOpen}
                aria-controls="ask-history"
                onClick={() => setHistoryOpen((open) => !open)}
              >
                History
              </ActionButton>
              {historyOpen && (
                <div
                  id="ask-history"
                  className="ask-popover ask-history"
                  role="group"
                  aria-label="Conversation history"
                >
                  {conversations.length === 0 ? (
                    <p className="ask-history-empty">No conversations yet.</p>
                  ) : (
                    conversations.map((conversation) => (
                      <button
                        type="button"
                        key={conversation.id}
                        className="ask-history-row"
                        aria-current={
                          current.id === conversation.id ? "true" : undefined
                        }
                        onClick={() => void openConversation(conversation.id)}
                      >
                        <span>{conversation.title}</span>
                        <time dateTime={conversation.updatedAt}>
                          {conversationTimeLabel(conversation.updatedAt)}
                        </time>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <ActionButton icon={Plus} onClick={() => startNewChat()}>
              New chat
            </ActionButton>
          </div>
          <div className="ask-thread" ref={threadRef}>
            <div className="ask-thread-inner">
              {current.messages.map((message) => (
                <article
                  className={`ask-message ${message.role} ${message.status}`}
                  key={message.id}
                  id={
                    message.role === "assistant"
                      ? `ask-answer-${message.id}`
                      : undefined
                  }
                  tabIndex={message.role === "assistant" ? -1 : undefined}
                  aria-label={
                    message.role === "user" ? "Your question" : "Answer"
                  }
                >
                  {message.role === "user" ? (
                    <p className="ask-bubble">{message.content}</p>
                  ) : (
                    <>
                      <IconBox icon={Sparkles} size={28} tone="green" />
                      <div className="ask-answer">
                        {message.content ? (
                          <div className="ask-answer-body">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              skipHtml
                              urlTransform={(url) =>
                                /^(capture:|https?:|mailto:)/i.test(url)
                                  ? url
                                  : ""
                              }
                              components={markdownComponents(message)}
                            >
                              {answerWithCaptureLinks(
                                message.content,
                                message.sources,
                              )}
                            </ReactMarkdown>
                          </div>
                        ) : message.status === "pending" ? (
                          <p className="ask-pending">
                            {message.statusText || "Searching your archive…"}
                          </p>
                        ) : null}
                        {message.sufficient === false && (
                          <p className="ask-insufficient">
                            The saved archive did not contain enough evidence.
                          </p>
                        )}
                        {(message.status === "failed" ||
                          message.status === "cancelled") &&
                          (() => {
                            const failure = askFailure(
                              message.errorCode,
                              message.status,
                            );
                            const needsSetup =
                              message.errorCode ===
                                "analysis_provider_required" ||
                              message.errorCode === "ai_provider_required";
                            const actions = failure.actions.filter(
                              (action) =>
                                action !== "setup" || Boolean(onOpenSettings),
                            );
                            return (
                              <>
                                <p
                                  className="ask-answer-failed"
                                  data-error-code={message.errorCode ?? undefined}
                                >
                                  {failure.text}
                                </p>
                                <div className="ask-answer-actions">
                                  {actions.map((action, index) => (
                                    <ActionButton
                                      key={action}
                                      variant={index === 0 ? "default" : "ghost"}
                                      icon={
                                        action === "retry"
                                          ? RotateCcw
                                          : action === "rephrase"
                                            ? PencilLine
                                            : action === "new-chat"
                                              ? Plus
                                              : Settings2
                                      }
                                      disabled={
                                        streaming &&
                                        (action === "retry" ||
                                          action === "new-chat")
                                      }
                                      onClick={() => recover(action, message)}
                                    >
                                      {action === "setup" && needsSetup
                                        ? "Set up AI"
                                        : recoveryLabels[action]}
                                    </ActionButton>
                                  ))}
                                </div>
                              </>
                            );
                          })()}
                        {message.status === "complete" && message.content && (
                          <div className="ask-answer-actions">
                            {message.sources.length > 0 ? (
                              <button
                                type="button"
                                className="ask-sources-toggle"
                                aria-pressed={panel.answer?.id === message.id}
                                aria-controls="ask-sources"
                                onClick={() => showSourcesFor(message)}
                              >
                                <LibraryBig size={13} aria-hidden="true" />
                                {message.sources.length}{" "}
                                {message.sources.length === 1
                                  ? "source"
                                  : "sources"}
                                <span className="sr-only">
                                  {panel.answer?.id === message.id
                                    ? " (shown in Sources)"
                                    : " (show in Sources)"}
                                </span>
                              </button>
                            ) : message.sufficient !== false ? (
                              <span className="ask-no-sources">
                                No saved posts cited
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="ask-icon-action"
                              onClick={() => void copyAnswer(message)}
                            >
                              {copiedId === message.id ? (
                                <Check size={14} aria-hidden="true" />
                              ) : (
                                <Copy size={14} aria-hidden="true" />
                              )}
                              <span className="sr-only">
                                {copiedId === message.id
                                  ? "Copied"
                                  : "Copy answer"}
                              </span>
                            </button>
                            {message.id === lastAssistant?.id && (
                              <button
                                type="button"
                                className="ask-icon-action"
                                disabled={streaming}
                                onClick={() => {
                                  const asked = current.messages?.find(
                                    (item) => item.id === message.userMessageId,
                                  );
                                  if (asked) void send(asked.content);
                                }}
                              >
                                <RotateCcw size={14} aria-hidden="true" />
                                <span className="sr-only">Ask again</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </article>
              ))}
              <div ref={threadEndRef} />
            </div>
          </div>
          <div className="ask-composer-wrap">
            {jumpVisible && (
              <div className="ask-jump-row">
                <button
                  type="button"
                  className="ask-jump"
                  onClick={followLatest}
                >
                  <ArrowDown size={13} aria-hidden="true" />
                  {streaming ? "Follow the answer" : "Jump to latest"}
                </button>
              </div>
            )}
            {notices}
            {composer("follow-up")}
          </div>
        </section>
        <aside
          id="ask-sources"
          className="ask-sources"
          aria-labelledby="ask-sources-title"
        >
          <div className="ask-sources-head">
            <h2 id="ask-sources-title" ref={sourcesHeadingRef} tabIndex={-1}>
              Sources
            </h2>
            <span>
              {panelSources.length}{" "}
              {panelSources.length === 1 ? "saved post" : "saved posts"}
            </span>
          </div>
          {panel.answer && panelQuestion && (
            <p className="ask-sources-for">
              <span className="ask-sources-tag">
                {panel.isLatest ? "Latest answer" : "Earlier answer"}
              </span>
              <button
                type="button"
                className="ask-sources-question"
                onClick={() => goToAnswer(panel.answer!.id)}
              >
                <span className="sr-only">Go to the answer to </span>“
                {questionExcerpt(panelQuestion.content)}”
              </button>
            </p>
          )}
          {panelSources.length === 0 ? (
            <p className="ask-sources-empty">
              {!panel.answer
                ? "Saved posts an answer cites will appear here."
                : panel.answer.status === "pending"
                  ? "Looking for saved posts for this answer…"
                  : panel.answer.status !== "complete"
                    ? "This answer didn’t finish, so it cites no saved posts."
                    : panel.answer.sufficient === false
                      ? "Your archive didn’t have enough evidence for this answer, so it cites no saved posts."
                      : "This answer doesn’t cite any saved posts."}
            </p>
          ) : (
            <ol className="ask-source-list">
              {panelSources.map((source) => {
                const details = sourceDetails[source.id];
                const url = safeSourceUrl(source.sourceUrl);
                const attribution = sourceAttribution(
                  source,
                  details?.sourceType ?? undefined,
                );
                return (
                  <li className="ask-source" key={source.id}>
                    <span className="ask-source-thumb" aria-hidden="true">
                      <span
                        className="ask-source-image"
                        style={{ background: thumbTint(source.citation) }}
                      >
                        {details?.thumbUrl && (
                          <img
                            src={details.thumbUrl}
                            alt=""
                            onError={(event) => {
                              event.currentTarget.hidden = true;
                            }}
                          />
                        )}
                      </span>
                      <span className="ask-source-number">
                        {source.citation}
                      </span>
                    </span>
                    <span className="ask-source-text">
                      <button
                        type="button"
                        className="ask-source-open"
                        data-source-id={source.id}
                        onClick={(event) =>
                          openSource(source.id, event.currentTarget)
                        }
                      >
                        <span className="sr-only">
                          Source {source.citation}:{" "}
                        </span>
                        {source.title}
                      </button>
                      {url ? (
                        <a
                          className="ask-source-link"
                          href={url}
                          target="_blank"
                          rel="noreferrer noopener"
                          title="Open the original post"
                        >
                          {attribution}
                          <span className="sr-only"> (original post)</span>
                        </a>
                      ) : (
                        <span className="ask-source-link">{attribution}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          {!panel.isLatest && lastAssistant && (
            <button
              type="button"
              className="ask-sources-switch"
              onClick={() => showSourcesFor(lastAssistant)}
            >
              Show sources for the latest answer
            </button>
          )}
          {panel.isLatest && panel.earlierCited && earlierQuestion && (
            <button
              type="button"
              className="ask-sources-switch"
              onClick={() => showSourcesFor(panel.earlierCited!)}
            >
              Show sources for the earlier answer to “
              {questionExcerpt(earlierQuestion.content, 48)}”
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
