import {
  createContext,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useContext,
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
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Cpu,
  type LucideIcon,
  MessageSquare,
  PanelRight,
  PencilLine,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Settings,
  Settings2,
  Share,
  Sparkles,
  Square,
  Trash2,
  X,
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
  AiThinkingLevel,
  AskPreferences,
  AskSelection,
  AskSource,
  Capture,
  ChatMessage,
  Conversation,
  SettingsTopic,
} from "../shared/types";
import type { ConversationsController } from "../shared/conversations";
import { api, assetUrl } from "../shared/api";
import { ActionButton } from "../components/ui/action-button";
import { IconBox } from "../components/ui/icon-box";
import {
  answerMeta,
  answerWithCaptureLinks,
  askFailure,
  type AskModelOption,
  askModelOptions,
  type AskRecovery,
  type CaptureFacets,
  citationsPerPoint,
  defaultAskSelection,
  modelLabel,
  questionExcerpt,
  questionFor,
  resolveAskSelection,
  safeSourceUrl,
  sameModel,
  sameSelection,
  selectionFor,
  sourceAttribution,
  sourcePanelFor,
  suggestionsFrom,
  thinkingName,
  thumbTint,
} from "./ask-format";
import "../ask.css";

/** How far from the end the reader can drift and still be following the answer. */
const followSlack = 48;
/** At and above this width the sources panel sits beside the thread. */
const sidePanelQuery = "(min-width: 1181px)";
const thinkingOrder: AiThinkingLevel[] = ["minimal", "low", "medium", "high"];

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

const providerLooks: Record<
  AskSelection["provider"],
  { background: string; color: string; icon: LucideIcon }
> = {
  openai: { background: "#18181b", color: "#ffffff", icon: Sparkles },
  cerebras: { background: "#fdeee3", color: "#c2410c", icon: Cpu },
};

function ProviderDot({
  provider,
  size,
}: {
  provider: AskSelection["provider"];
  size: "chip" | "row";
}) {
  const look = providerLooks[provider];
  const Icon = look.icon;
  return (
    <span
      className={`ask-pdot ask-pdot-${size}`}
      style={{ background: look.background, color: look.color }}
      aria-hidden="true"
    >
      <Icon size={size === "chip" ? 10 : 14} focusable="false" />
    </span>
  );
}

/** What a citation inside an answer needs; read through context so links stay mounted. */
type CitationApi = {
  highlight: string | null;
  boundAnswerId: string | null;
  onHover: (sourceId: string) => void;
  onShow: (message: ChatMessage, source: AskSource) => void;
};
const CitationContext = createContext<CitationApi | null>(null);
const AnswerContext = createContext<ChatMessage | null>(null);

function MarkdownLink({
  href,
  children,
}: {
  href?: string;
  children?: ReactNode;
}) {
  const citations = useContext(CitationContext);
  const message = useContext(AnswerContext);
  const source =
    href?.startsWith("capture:") && message
      ? message.sources.find(({ id }) => id === href.slice(8))
      : undefined;
  if (source && message && citations) {
    const bound = citations.boundAnswerId === message.id;
    return (
      <button
        type="button"
        className={`ask-cite${bound && citations.highlight === source.id ? " hl" : ""}`}
        data-source-id={source.id}
        aria-label={`Source ${source.citation}: ${source.title}`}
        title={source.title}
        onMouseEnter={() => bound && citations.onHover(source.id)}
        onFocus={() => bound && citations.onHover(source.id)}
        onClick={() => citations.onShow(message, source)}
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
}

/** Stable across renders: a new component type would remount citations mid-click. */
const markdownComponents: Components = {
  a: ({ href, children }) => (
    <MarkdownLink href={href}>{children}</MarkdownLink>
  ),
};

function wideScreen() {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
    ? window.matchMedia(sidePanelQuery).matches
    : true;
}

function typingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

/** Closes a popover on an outside press, or on Escape (which may also return focus). */
function useDismiss(
  open: boolean,
  close: () => void,
  ref: RefObject<HTMLElement | null>,
  onEscape: () => void = close,
) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onEscape();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, close, ref, onEscape]);
}

/** Moves focus between the menu's options with the arrow keys. */
function roveFocus(event: KeyboardEvent<HTMLElement>, selector: string) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(selector),
  ).filter((item) => !item.hasAttribute("disabled"));
  if (!items.length) return;
  event.preventDefault();
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (index + 1) % items.length
          : (index - 1 + items.length) % items.length;
  items[next]!.focus();
}

function ModelOptionRows({
  options,
  selected,
  defaultSelection,
  onChoose,
  showThinking,
  onThinking,
}: {
  options: AskModelOption[];
  selected: AskSelection | null;
  defaultSelection: AskSelection | null;
  onChoose: (option: AskModelOption) => void;
  showThinking: boolean;
  onThinking?: (level: AiThinkingLevel) => void;
}) {
  const providers = [...new Set(options.map((option) => option.provider))];
  return (
    <>
      {providers.map((provider) => {
        const rows = options.filter((option) => option.provider === provider);
        const groupId = `ask-pgroup-${provider}`;
        return (
          <div role="group" aria-labelledby={groupId} key={provider}>
            <div className="ask-pgroup" id={groupId}>
              <span>{rows[0]!.providerName}</span>
              <span className="ask-pgroup-ok">Connected</span>
            </div>
            {rows.map((option) => {
              const picked = sameModel(option, selected);
              const isDefault = sameModel(option, defaultSelection);
              return (
                <div key={option.model}>
                  <button
                    type="button"
                    className={`ask-opt${picked ? " picked" : ""}`}
                    aria-pressed={picked}
                    onClick={() => onChoose(option)}
                  >
                    <ProviderDot provider={option.provider} size="row" />
                    <span className="ask-opt-text">
                      <b>
                        {modelLabel(option.model)}
                        {isDefault && (
                          <span className="ask-default">Default</span>
                        )}
                      </b>
                      <small>
                        {option.thinkingLevels.length
                          ? "Thinking levels"
                          : "No thinking"}{" "}
                        · <code>{option.model}</code>
                      </small>
                    </span>
                    <Check
                      className="ask-opt-check"
                      size={16}
                      aria-hidden="true"
                    />
                  </button>
                  {showThinking &&
                    picked &&
                    option.thinkingLevels.length > 0 &&
                    onThinking && (
                      <div className="ask-think">
                        <div className="ask-think-label" id="ask-think-label">
                          <span>Thinking</span>
                          Higher = better synthesis, slower
                        </div>
                        <div
                          className="ask-seg"
                          role="radiogroup"
                          aria-labelledby="ask-think-label"
                        >
                          {thinkingOrder
                            .filter((level) =>
                              option.thinkingLevels.includes(level),
                            )
                            .map((level) => (
                              <button
                                type="button"
                                role="radio"
                                aria-checked={selected?.thinkingLevel === level}
                                className={
                                  selected?.thinkingLevel === level ? "on" : ""
                                }
                                key={level}
                                onClick={() => onThinking(level)}
                              >
                                {thinkingName(level)}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

function ModelPicker({
  options,
  selection,
  defaultSelection,
  loaded,
  onChange,
  onSetDefault,
  onManage,
  disabled,
}: {
  options: AskModelOption[];
  selection: AskSelection | null;
  defaultSelection: AskSelection | null;
  loaded: boolean;
  onChange: (selection: AskSelection) => void;
  onSetDefault: () => void;
  onManage?: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  const escape = () => {
    setOpen(false);
    chipRef.current?.focus({ preventScroll: true });
  };
  useDismiss(open, close, anchorRef, escape);
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    (
      panel?.querySelector<HTMLElement>(".ask-opt.picked") ??
      panel?.querySelector<HTMLElement>(".ask-opt")
    )?.focus({ preventScroll: true });
  }, [open]);

  if (!loaded)
    return (
      <span className="ask-pickbtn ask-pickbtn-loading" aria-hidden="true" />
    );
  if (!options.length || !selection)
    return (
      <button
        type="button"
        className="ask-pickbtn"
        onClick={onManage}
        disabled={!onManage}
      >
        <Settings size={14} aria-hidden="true" />
        Connect a model
      </button>
    );
  const option = options.find((item) => sameModel(item, selection));
  const isDefault = sameSelection(selection, defaultSelection);
  return (
    <div className="ask-picker-anchor" ref={anchorRef}>
      {open && (
        <div
          className="ask-picker"
          role="dialog"
          aria-label="Model for this chat"
          ref={panelRef}
          onKeyDown={(event) =>
            roveFocus(event, ".ask-opt, .ask-seg button, .ask-pfoot button")
          }
        >
          <div className="ask-picker-head">
            <b>Model for this chat</b>
            <small>From AI &amp; models</small>
          </div>
          <ModelOptionRows
            options={options}
            selected={selection}
            defaultSelection={defaultSelection}
            showThinking
            onChoose={(choice) =>
              onChange(selectionFor(choice, selection, defaultSelection))
            }
            onThinking={(thinkingLevel) =>
              onChange({ ...selection, thinkingLevel })
            }
          />
          <div className="ask-pfoot">
            <button
              type="button"
              disabled={isDefault}
              title={
                isDefault ? "Already the default for new chats" : undefined
              }
              onClick={onSetDefault}
            >
              <Check size={14} aria-hidden="true" />
              Set as default
            </button>
            {onManage && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onManage();
                }}
              >
                <Settings size={14} aria-hidden="true" />
                Manage models
              </button>
            )}
          </div>
        </div>
      )}
      <button
        type="button"
        ref={chipRef}
        className={`ask-pickbtn${open ? " on" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        title="Choose model for this chat"
        onClick={() => setOpen((value) => !value)}
      >
        <ProviderDot provider={selection.provider} size="chip" />
        <span className="sr-only">Model: </span>
        {modelLabel(selection.model)}
        {option?.thinkingLevels.length && selection.thinkingLevel ? (
          <span className="ask-pickbtn-level">
            · {thinkingName(selection.thinkingLevel)}
          </span>
        ) : null}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function RetryWith({
  options,
  defaultSelection,
  disabled,
  onRetry,
}: {
  options: AskModelOption[];
  defaultSelection: AskSelection | null;
  disabled: boolean;
  onRetry: (selection: AskSelection) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  const escape = () => {
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  };
  useDismiss(open, close, anchorRef, escape);
  useEffect(() => {
    if (open)
      anchorRef.current
        ?.querySelector<HTMLElement>(".ask-opt")
        ?.focus({ preventScroll: true });
  }, [open]);
  if (!options.length) return null;
  return (
    <div className="ask-picker-anchor" ref={anchorRef}>
      <button
        type="button"
        ref={buttonRef}
        className="ask-ghost"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        title="Retry with another model"
        onClick={() => setOpen((value) => !value)}
      >
        <RotateCcw size={14} aria-hidden="true" />
        Retry with…
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="ask-picker ask-retry-menu"
          role="dialog"
          aria-label="Retry this answer with"
          onKeyDown={(event) => roveFocus(event, ".ask-opt")}
        >
          <div className="ask-picker-head">
            <b>Retry this answer with</b>
            <small>Once, for this answer</small>
          </div>
          <ModelOptionRows
            options={options}
            selected={null}
            defaultSelection={defaultSelection}
            showThinking={false}
            onChoose={(choice) => {
              setOpen(false);
              onRetry(selectionFor(choice, null, defaultSelection));
            }}
          />
        </div>
      )}
    </div>
  );
}

function Composer({
  variant,
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  sendWith,
  picker,
  textareaRef,
}: {
  variant: "home" | "follow-up";
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  sendWith: AskPreferences["sendWith"];
  picker: ReactNode;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);
  const modEnter = sendWith === "mod-enter";
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    const withModifier = event.metaKey || event.ctrlKey;
    if (modEnter ? withModifier : !event.shiftKey && !withModifier) {
      event.preventDefault();
      onSubmit();
    }
  };
  const sendHint = modEnter ? "⌘ Enter" : "Enter";
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
        aria-keyshortcuts={modEnter ? "Meta+Enter Control+Enter" : "Enter"}
        placeholder={
          variant === "home"
            ? "Ask anything about what you’ve saved…"
            : "Ask a follow-up…"
        }
        maxLength={2000}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="ask-composer-row">
        {picker}
        <span className="ask-composer-flex" />
        <button
          type={streaming ? "button" : "submit"}
          className={`ask-send${streaming ? " ask-stop" : ""}`}
          disabled={!streaming && !value.trim()}
          title={streaming ? "Stop" : `Send (${sendHint})`}
          onClick={streaming ? onStop : undefined}
        >
          {streaming ? (
            <Square size={12} fill="currentColor" aria-hidden="true" />
          ) : (
            <ArrowUp size={16} aria-hidden="true" />
          )}
          <span className="sr-only">{streaming ? "Stop" : "Send"}</span>
        </button>
      </div>
    </form>
  );
}

export type AskAIProps = {
  onOpen: (id: string) => void;
  /** Opens a Settings topic in the Settings modal, e.g. AI & models. */
  onOpenSettings?: (topic: SettingsTopic) => void;
  /** Opens the Capture dialog from the empty-archive state. */
  onCapture?: () => void;
  /** App-level chat history shared with the sidebar. */
  chats: ConversationsController;
  preferences: AskPreferences;
  onPreferencesChange?: (patch: Partial<AskPreferences>) => Promise<boolean>;
  /** Increments when Settings saves AI providers or task models. */
  aiRevision?: number;
  /** Reports AI state changed here (Set as default) so the shell can refresh readiness. */
  onAiStateChange?: (state: AiProviderState) => void;
};

export function AskAI({
  onOpen,
  onOpenSettings,
  onCapture,
  chats,
  preferences,
  onPreferencesChange,
  aiRevision = 0,
  onAiStateChange,
}: AskAIProps) {
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [reconciliationNotice, setReconciliationNotice] = useState("");
  const [liveMessage, setLiveMessage] = useState("");
  const [facets, setFacets] = useState<CaptureFacets | null>(null);
  const [aiState, setAiState] = useState<AiProviderState | null>(null);
  const [aiLoaded, setAiLoaded] = useState(false);
  /** The model chosen on the new-chat screen before the chat exists. */
  const [draftSelection, setDraftSelection] = useState<AskSelection | null>(
    null,
  );
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sourceDetails, setSourceDetails] = useState<
    Record<string, SourceDetails>
  >({});
  const [archive, setArchive] = useState<ArchiveState>("loading");
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(
    () => preferences.askSourcesPanel && wideScreen(),
  );
  const [highlight, setHighlight] = useState<string | null>(null);
  const [jumpVisible, setJumpVisible] = useState(false);
  const titleMenuRef = useRef<HTMLDivElement>(null);
  const titleButtonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const sourcesRef = useRef<HTMLElement>(null);
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
  const newChatTokenRef = useRef(chats.newChatToken);
  /** Set once the reader shows or hides the panel in this view. */
  const panelTouchedRef = useRef(false);
  /** Guards the rename field, which both submits and blurs. */
  const renamingRef = useRef(false);

  type StreamOutcome = StreamState<AskSource>;

  const modelOptions = askModelOptions(aiState);
  const defaultSelection = defaultAskSelection(aiState);
  const chatSelection = current ? current.selection : draftSelection;
  const activeSelection = resolveAskSelection(chatSelection, aiState);
  const aiReady = aiLoaded && aiState ? (aiState.readiness?.ask ?? null) : null;

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
  async function fetchConversation(id: string) {
    const result = await api<{ conversation: Conversation }>(
      `/api/v1/conversations/${id}`,
    );
    return result.conversation;
  }
  async function openConversation(id: string) {
    selectedConversationIdRef.current = id;
    setTitleMenuOpen(false);
    renamingRef.current = false;
    setRenaming(false);
    setSelectedAnswerId(null);
    setHighlight(null);
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
  function resetToNewChat(keepQuestion = false) {
    selectedConversationIdRef.current = null;
    setCurrent(null);
    setDraftSelection(null);
    setSelectedAnswerId(null);
    setHighlight(null);
    setTitleMenuOpen(false);
    setRenaming(false);
    setError("");
    if (!keepQuestion) setQuestion("");
    window.requestAnimationFrame(() =>
      composerInputRef.current?.focus({ preventScroll: true }),
    );
  }

  // The sidebar chooses the chat; null is a new, unsaved chat.
  useEffect(() => {
    const id = chats.currentId;
    if (id === selectedConversationIdRef.current) return;
    if (id) void openConversation(id);
    else resetToNewChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats.currentId]);

  // A new chat is ready to type into.
  useEffect(() => {
    if (!chats.currentId && !isHidden())
      composerInputRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "New chat" resets even when this is already a new chat.
  useEffect(() => {
    if (chats.newChatToken === newChatTokenRef.current) return;
    newChatTokenRef.current = chats.newChatToken;
    if (chats.currentId === null) resetToNewChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats.newChatToken]);

  async function loadAiState() {
    try {
      setAiState(await api<AiProviderState>("/api/v1/ai-providers"));
    } catch {
      setAiState(null);
    } finally {
      setAiLoaded(true);
    }
  }
  useEffect(() => {
    void loadAiState();
  }, [aiRevision]);

  useEffect(() => {
    void api<CaptureFacets>("/api/v1/capture-facets")
      .then(setFacets)
      .catch(() => setFacets(null));
    void api<{ captures: unknown[] }>("/api/v1/captures?limit=1")
      .then((result) => setArchive(result.captures.length ? "saved" : "empty"))
      .catch(() => setArchive("unknown"));
  }, []);

  // The saved preference ("by default") opens the panel until the reader
  // toggles it here; after that, a slow or failed save can never undo their
  // choice. Narrow screens start closed because the panel covers the thread.
  useEffect(() => {
    if (panelTouchedRef.current) return;
    setSourcesOpen(preferences.askSourcesPanel && wideScreen());
  }, [preferences.askSourcesPanel]);

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

  /** On phones the page scrolls; otherwise the thread is its own scroller. */
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
    return (
      marker.getBoundingClientRect().bottom <= bottom - margin + followSlack
    );
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
        const trigger = saved.trigger?.isConnected
          ? saved.trigger
          : root.querySelectorAll<HTMLElement>(saved.triggerSelector)[
              saved.triggerIndex
            ];
        trigger?.focus({ preventScroll: true });
      };
      restore();
      window.requestAnimationFrame(restore);
    });
    observer.observe(root);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasThread]);

  function openSource(id: string, trigger: HTMLElement | null) {
    const triggerSelector = `.ask-source-open[data-source-id="${CSS.escape(id)}"]`;
    const triggers = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>(triggerSelector) ?? [],
    );
    readingPositionRef.current = {
      windowY: window.scrollY,
      threadTop: threadRef.current?.scrollTop ?? 0,
      trigger,
      triggerSelector,
      triggerIndex: trigger ? Math.max(0, triggers.indexOf(trigger)) : 0,
    };
    onOpen(id);
  }

  function setPanelOpen(open: boolean) {
    panelTouchedRef.current = true;
    setSourcesOpen(open);
    if (!open) setHighlight(null);
    if (wideScreen())
      void onPreferencesChange?.({ askSourcesPanel: open }).catch(() => false);
  }

  // S shows or hides the sources panel while a chat is open.
  useEffect(() => {
    if (!hasThread) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key?.toLowerCase() !== "s" ||
        typingTarget(event.target) ||
        isHidden() ||
        document.querySelector('[role="dialog"][aria-modal="true"]')
      )
        return;
      event.preventDefault();
      setPanelOpen(!sourcesOpen);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasThread, sourcesOpen, preferences.askSourcesPanel]);

  const closeTitleMenu = () => setTitleMenuOpen(false);
  const escapeTitleMenu = () => {
    setTitleMenuOpen(false);
    titleButtonRef.current?.focus({ preventScroll: true });
  };
  useDismiss(titleMenuOpen, closeTitleMenu, titleMenuRef, escapeTitleMenu);

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
        void loadAiState();
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
    conversation: Conversation,
    temporaryId: string,
    optimisticUserId: string | null,
  ) {
    const conversationId = conversation.id;
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
    chats.upsert({
      ...conversation,
      messages: undefined,
      lastStatus: "pending",
      updatedAt: new Date().toISOString(),
    });
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
        await chats.refresh().catch(() => undefined);
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
          {
            method: "POST",
            body: JSON.stringify(
              draftSelection ? { selection: draftSelection } : {},
            ),
          },
        );
        conversation = result.conversation;
      } catch {
        setError("Ask AI could not start a conversation. Try again.");
        return;
      }
      selectedConversationIdRef.current = conversation.id;
      setCurrent(conversation);
      setDraftSelection(null);
      chats.setCurrentId(conversation.id);
    }
    const now = new Date().toISOString();
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
      provider: null,
      model: null,
      thinkingLevel: null,
      createdAt: now,
    };
    const assistant: ChatMessage = {
      ...userMessage,
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      status: "pending",
      userMessageId: userMessage.id,
    };
    setCurrent({
      ...conversation,
      messages: [...(conversation.messages ?? []), userMessage, assistant],
    });
    setQuestion("");
    setSelectedAnswerId(null);
    setHighlight(null);
    followRef.current = true;
    setJumpVisible(false);
    await runRequest(
      `/api/v1/conversations/${conversation.id}/messages`,
      { message: cleaned, requestId: crypto.randomUUID() },
      conversation,
      assistant.id,
      userMessage.id,
    );
  }
  async function retry(message: ChatMessage, selection?: AskSelection) {
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
    setHighlight(null);
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
      provider: null,
      model: null,
      thinkingLevel: null,
      createdAt: new Date().toISOString(),
    };
    setCurrent({
      ...current,
      messages: [...(current.messages ?? []), temporary],
    });
    await runRequest(
      `/api/v1/conversations/${current.id}/messages/${message.id}/retry`,
      { requestId: crypto.randomUUID(), ...(selection ? { selection } : {}) },
      current,
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

  async function chooseModel(selection: AskSelection) {
    if (!current) {
      setDraftSelection(selection);
      return;
    }
    const previous = current.selection;
    const id = current.id;
    setCurrent((existing) =>
      existing?.id === id ? { ...existing, selection } : existing,
    );
    const updated = await chats.patch(id, { selection });
    if (!updated) {
      setCurrent((existing) =>
        existing?.id === id ? { ...existing, selection: previous } : existing,
      );
      setError("The model for this chat could not be changed. Try again.");
    }
  }
  async function setAsDefault() {
    if (!aiState || !activeSelection) return;
    try {
      const result = await api<AiProviderState>("/api/v1/ai-settings", {
        method: "PUT",
        body: JSON.stringify({ ask: activeSelection }),
      });
      setAiState(result);
      onAiStateChange?.(result);
      setLiveMessage(
        `${modelLabel(activeSelection.model)} is now the default for new chats.`,
      );
    } catch {
      setError("The default model could not be saved. Try again.");
    }
  }

  function startRename() {
    setTitleMenuOpen(false);
    setTitleDraft(chatTitle);
    renamingRef.current = true;
    setRenaming(true);
  }
  function cancelRename() {
    renamingRef.current = false;
    setRenaming(false);
    window.requestAnimationFrame(() =>
      titleButtonRef.current?.focus({ preventScroll: true }),
    );
  }
  async function renameCurrent() {
    if (!current || !renamingRef.current) return;
    renamingRef.current = false;
    const title = titleDraft.trim();
    setRenaming(false);
    window.requestAnimationFrame(() =>
      titleButtonRef.current?.focus({ preventScroll: true }),
    );
    if (!title || title === chatTitle) return;
    const id = current.id;
    if (await chats.rename(id, title))
      setCurrent((existing) =>
        existing?.id === id ? { ...existing, title } : existing,
      );
    else setError("This chat could not be renamed. Try again.");
  }
  async function togglePin() {
    if (!current) return;
    setTitleMenuOpen(false);
    const pinned = !chatPinned;
    if (!(await chats.setPinned(current.id, pinned)))
      setError("This chat could not be pinned. Try again.");
  }
  async function exportCurrent() {
    if (!current) return;
    setTitleMenuOpen(false);
    setLiveMessage(
      (await chats.exportMarkdown(current.id))
        ? "Chat exported as Markdown."
        : "This chat could not be exported. Try again.",
    );
  }
  async function deleteCurrent() {
    if (!current) return;
    setTitleMenuOpen(false);
    await chats.remove(current.id);
  }

  function bindPanelTo(message: ChatMessage) {
    setSelectedAnswerId(message.id === lastAssistant?.id ? null : message.id);
  }
  /** Points the sources panel at one answer and shows it. */
  function showSourcesFor(message: ChatMessage) {
    bindPanelTo(message);
    setHighlight(null);
    if (!sourcesOpen) setPanelOpen(true);
    const asked = questionFor(current?.messages, message);
    setLiveMessage(
      `Showing ${message.sources.length} ${message.sources.length === 1 ? "source" : "sources"} for ${asked ? `“${questionExcerpt(asked.content)}”` : "this answer"}.`,
    );
  }
  /** A citation reopens the panel on its answer and highlights its card. */
  function showCitation(message: ChatMessage, source: AskSource) {
    bindPanelTo(message);
    if (!sourcesOpen) setPanelOpen(true);
    setHighlight(source.id);
    setLiveMessage(`Source ${source.citation}: ${source.title}.`);
    window.requestAnimationFrame(() => {
      const card = sourcesRef.current?.querySelector<HTMLElement>(
        `.ask-source[data-source-id="${CSS.escape(source.id)}"]`,
      );
      card?.scrollIntoView?.({ block: "nearest" });
      card
        ?.querySelector<HTMLElement>(".ask-source-open")
        ?.focus({ preventScroll: true });
    });
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
      resetToNewChat(true);
      chats.setCurrentId(null);
      if (asked) setQuestion(asked.content);
    } else onOpenSettings?.("ai");
  }

  const citationApi: CitationApi = {
    highlight,
    boundAnswerId: panel.answer?.id ?? null,
    onHover: setHighlight,
    onShow: showCitation,
  };
  const summaryRow = current
    ? chats.conversations.find((item) => item.id === current.id)
    : undefined;
  const chatTitle = summaryRow?.title ?? current?.title ?? "";
  const chatPinned = Boolean(
    summaryRow ? summaryRow.pinnedAt : current?.pinnedAt,
  );
  const suggestions = suggestionsFrom(facets).slice(0, 3);
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
  const picker = (
    <ModelPicker
      options={modelOptions}
      selection={activeSelection}
      defaultSelection={defaultSelection}
      loaded={aiLoaded}
      disabled={streaming}
      onChange={(selection) => void chooseModel(selection)}
      onSetDefault={() => void setAsDefault()}
      onManage={onOpenSettings ? () => onOpenSettings("ai") : undefined}
    />
  );
  const composer = (variant: "home" | "follow-up") => (
    <Composer
      variant={variant}
      value={question}
      onChange={setQuestion}
      onSubmit={() => void send()}
      onStop={() => abortRef.current?.abort()}
      streaming={streaming}
      sendWith={preferences.sendWith}
      picker={picker}
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
          Connect a provider in AI &amp; models. Your archive stays private.
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
          <div className="ask-top" aria-hidden="true" />
          <div className="ask-hero">
            <div className="ask-home-heading">
              <h1 id="ask-title">What do you want to find?</h1>
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
                className="ask-chips"
                aria-label="Suggested questions"
                role="group"
              >
                {suggestions.map((suggestion) => (
                  <button
                    type="button"
                    className="ask-suggestion"
                    key={suggestion}
                    disabled={streaming || aiReady === false}
                    onClick={() => void send(suggestion)}
                  >
                    <MessageSquare size={14} aria-hidden="true" />
                    <span>{suggestion}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    );

  const panelCount = panelSources.length;
  return (
    <div className="ask-v2" ref={rootRef}>
      {liveRegion}
      <div className={`ask-conversation${sourcesOpen ? " sources-open" : ""}`}>
        <section className="ask-chat" aria-labelledby="ask-chat-title">
          <header className="ask-chat-bar">
            <div
              className="ask-popover-anchor ask-title-anchor"
              ref={titleMenuRef}
            >
              {renaming ? (
                <form
                  className="ask-rename"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void renameCurrent();
                  }}
                >
                  <label className="sr-only" htmlFor="ask-rename-input">
                    Chat title
                  </label>
                  <input
                    id="ask-rename-input"
                    autoFocus
                    maxLength={100}
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={() => void renameCurrent()}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        cancelRename();
                      }
                    }}
                  />
                </form>
              ) : (
                <h1 id="ask-chat-title" className="ask-title-heading">
                  <button
                    type="button"
                    ref={titleButtonRef}
                    className="ask-title"
                    aria-haspopup="menu"
                    aria-expanded={titleMenuOpen}
                    title="Rename, pin, export or delete"
                    onClick={() => setTitleMenuOpen((open) => !open)}
                  >
                    <span>{chatTitle}</span>
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                </h1>
              )}
              {titleMenuOpen && (
                <div
                  className="ask-popover ask-title-menu"
                  role="menu"
                  aria-label="Chat actions"
                  onKeyDown={(event) => roveFocus(event, ".ask-menu-item")}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="ask-menu-item"
                    autoFocus
                    onClick={startRename}
                  >
                    <PencilLine size={14} aria-hidden="true" />
                    Rename
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="ask-menu-item"
                    onClick={() => void togglePin()}
                  >
                    {chatPinned ? (
                      <PinOff size={14} aria-hidden="true" />
                    ) : (
                      <Pin size={14} aria-hidden="true" />
                    )}
                    {chatPinned ? "Unpin" : "Pin to top"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="ask-menu-item"
                    onClick={() => void exportCurrent()}
                  >
                    <Share size={14} aria-hidden="true" />
                    Export as Markdown
                  </button>
                  <hr />
                  <button
                    type="button"
                    role="menuitem"
                    className="ask-menu-item ask-menu-danger"
                    disabled={streaming}
                    onClick={() => void deleteCurrent()}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Delete…
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="ask-ghost ask-ghost-icon"
              title="Share or export"
              onClick={() => void exportCurrent()}
            >
              <Share size={16} aria-hidden="true" />
              <span className="sr-only">Export as Markdown</span>
            </button>
            <button
              type="button"
              className={`ask-panel-toggle${sourcesOpen ? " on" : ""}`}
              aria-pressed={sourcesOpen}
              aria-controls="ask-sources"
              aria-keyshortcuts="S"
              title="Show or hide sources (S)"
              onClick={() => setPanelOpen(!sourcesOpen)}
            >
              <PanelRight size={16} aria-hidden="true" />
              Sources
              <span className="ask-panel-count">{panelCount}</span>
            </button>
          </header>
          <div className="ask-thread" ref={threadRef}>
            <CitationContext.Provider value={citationApi}>
              <div className="ask-thread-inner">
                {current.messages.map((message) => {
                  if (message.role === "user")
                    return (
                      <article
                        className={`ask-message user ${message.status}`}
                        key={message.id}
                        aria-label="Your question"
                      >
                        <p className="ask-bubble">{message.content}</p>
                      </article>
                    );
                  const meta = answerMeta(message);
                  const isLast = message.id === lastAssistant?.id;
                  return (
                    <article
                      className={`ask-message assistant ${message.status}`}
                      key={message.id}
                      id={`ask-answer-${message.id}`}
                      tabIndex={-1}
                      aria-label="Answer"
                    >
                      <IconBox icon={Sparkles} size={28} tone="green" />
                      <div className="ask-answer">
                        {message.status !== "pending" &&
                          (meta.model || meta.parts.length > 0) && (
                            <p className="ask-meta">
                              {[meta.model, ...meta.parts]
                                .filter((part): part is string => Boolean(part))
                                .map((part, index) => (
                                  <span
                                    key={index}
                                    className={
                                      index === 0 && meta.model
                                        ? "ask-meta-model"
                                        : undefined
                                    }
                                  >
                                    {index > 0 && (
                                      <span
                                        className="ask-meta-dot"
                                        aria-hidden="true"
                                      >
                                        ·
                                      </span>
                                    )}
                                    {index > 0 && (
                                      <span className="sr-only">, </span>
                                    )}
                                    {part}
                                  </span>
                                ))}
                            </p>
                          )}
                        {message.content ? (
                          <AnswerContext.Provider value={message}>
                            <div className="ask-answer-body">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                skipHtml
                                urlTransform={(url) =>
                                  /^(capture:|https?:|mailto:)/i.test(url)
                                    ? url
                                    : ""
                                }
                                components={markdownComponents}
                              >
                                {citationsPerPoint(
                                  answerWithCaptureLinks(
                                    message.content,
                                    message.sources,
                                  ),
                                )}
                              </ReactMarkdown>
                            </div>
                          </AnswerContext.Provider>
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
                                  data-error-code={
                                    message.errorCode ?? undefined
                                  }
                                >
                                  {failure.text}
                                </p>
                                <div className="ask-answer-actions">
                                  {actions.map((action, index) => (
                                    <ActionButton
                                      key={action}
                                      variant={
                                        index === 0 ? "default" : "ghost"
                                      }
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
                                  {isLast && !needsSetup && (
                                    <RetryWith
                                      options={modelOptions}
                                      defaultSelection={defaultSelection}
                                      disabled={streaming}
                                      onRetry={(selection) =>
                                        void retry(message, selection)
                                      }
                                    />
                                  )}
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
                                aria-pressed={
                                  sourcesOpen && panel.answer?.id === message.id
                                }
                                aria-controls="ask-sources"
                                onClick={() => showSourcesFor(message)}
                              >
                                <span className="ask-faces" aria-hidden="true">
                                  {message.sources.slice(0, 3).map((source) => {
                                    const thumb =
                                      sourceDetails[source.id]?.thumbUrl;
                                    return (
                                      <i
                                        key={source.id}
                                        style={
                                          {
                                            background: thumb
                                              ? `center / cover url("${thumb}") ${thumbTint(source.citation)}`
                                              : thumbTint(source.citation),
                                          } as CSSProperties
                                        }
                                      />
                                    );
                                  })}
                                </span>
                                {message.sources.length}{" "}
                                {message.sources.length === 1
                                  ? "source"
                                  : "sources"}
                                <span className="sr-only">
                                  {sourcesOpen &&
                                  panel.answer?.id === message.id
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
                              className="ask-ghost ask-ghost-icon"
                              title="Copy answer"
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
                            {isLast && (
                              <>
                                <button
                                  type="button"
                                  className="ask-ghost ask-ghost-icon"
                                  title="Retry"
                                  disabled={streaming}
                                  onClick={() => void retry(message)}
                                >
                                  <RotateCcw size={14} aria-hidden="true" />
                                  <span className="sr-only">Retry</span>
                                </button>
                                <RetryWith
                                  options={modelOptions}
                                  defaultSelection={defaultSelection}
                                  disabled={streaming}
                                  onRetry={(selection) =>
                                    void retry(message, selection)
                                  }
                                />
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
                <div ref={threadEndRef} />
              </div>
            </CitationContext.Provider>
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
          hidden={!sourcesOpen}
          ref={sourcesRef}
        >
          <div className="ask-sources-inner">
            <div className="ask-sources-head">
              <h2 id="ask-sources-title">Sources</h2>
              <span>
                {panelCount} {panelCount === 1 ? "saved post" : "saved posts"}
              </span>
              <span className="ask-composer-flex" />
              <button
                type="button"
                className="ask-ghost ask-ghost-icon"
                title="Hide sources (S)"
                onClick={() => {
                  setPanelOpen(false);
                  window.requestAnimationFrame(() =>
                    rootRef.current
                      ?.querySelector<HTMLElement>(".ask-panel-toggle")
                      ?.focus({ preventScroll: true }),
                  );
                }}
              >
                <X size={16} aria-hidden="true" />
                <span className="sr-only">Hide sources</span>
              </button>
            </div>
            <div className="ask-sources-body">
              {panel.answer && (
                <p className="ask-sources-for">
                  <span className="ask-sources-tag">
                    {panel.isLatest
                      ? "Cited in latest answer"
                      : "Cited in an earlier answer"}
                  </span>
                  {!panel.isLatest && panelQuestion && (
                    <button
                      type="button"
                      className="ask-sources-question"
                      onClick={() => goToAnswer(panel.answer!.id)}
                    >
                      <span className="sr-only">Go to the answer to </span>“
                      {questionExcerpt(panelQuestion.content)}”
                    </button>
                  )}
                </p>
              )}
              {panelCount === 0 ? (
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
                      <li
                        className={`ask-source${highlight === source.id ? " hl" : ""}`}
                        key={source.id}
                        data-source-id={source.id}
                        onMouseEnter={() => setHighlight(source.id)}
                        onMouseLeave={() =>
                          setHighlight((id) => (id === source.id ? null : id))
                        }
                      >
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
                          <b className="ask-source-title">
                            <span className="sr-only">
                              Source {source.citation}:{" "}
                            </span>
                            {source.title}
                          </b>
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
                            <span className="ask-source-link">
                              {attribution}
                            </span>
                          )}
                          {source.synopsis && (
                            <span className="ask-source-synopsis">
                              {source.synopsis}
                            </span>
                          )}
                          <button
                            type="button"
                            className="ask-source-open"
                            data-source-id={source.id}
                            onFocus={() => setHighlight(source.id)}
                            onClick={(event) =>
                              openSource(source.id, event.currentTarget)
                            }
                          >
                            Open note
                            <span className="sr-only">: {source.title}</span>
                            <ArrowUpRight size={12} aria-hidden="true" />
                          </button>
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
              {panel.answer && (
                <p className="ask-earlier">
                  Earlier answers in this chat keep their own sources. Click a{" "}
                  <b>
                    {panelCount} {panelCount === 1 ? "source" : "sources"}
                  </b>{" "}
                  button to switch.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
