import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  applyStreamEvent,
  finishStream,
  initialStreamState,
  mergeConversationSnapshot,
  reconcileConversationAttempt,
  SseDecoder,
  type StreamState,
} from "../chat-stream";
import type { AskSource, ChatMessage, Conversation } from "../shared/types";
import { api } from "../shared/api";
import { PlatformMark } from "../components/platform";

function answerWithCaptureLinks(content: string, sources: AskSource[]) {
  const sourcesByCitation = new Map(
    sources.map((source) => [source.citation, source]),
  );
  let normalized = content;
  let replacedCaptureId = false;
  for (const source of sources) {
    const captureCitation = `[${source.id}]`;
    if (normalized.includes(captureCitation)) {
      normalized = normalized.replaceAll(
        captureCitation,
        `[${source.citation}]`,
      );
      replacedCaptureId = true;
    }
  }
  if (replacedCaptureId)
    normalized = normalized.replace(/\n{2,}Sources:\s*(?:\[\d+]\s*)+$/i, "");
  return normalized.replace(/\[(\d+)]/g, (citation, value: string) => {
    const source = sourcesByCitation.get(Number(value));
    return source ? `[${value}](capture:${source.id})` : citation;
  });
}

export function AskAI({ onOpen }: { onOpen: (id: string) => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [reconciliationNotice, setReconciliationNotice] = useState("");
  const [conversationListOpen, setConversationListOpen] = useState(false);
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
  async function loadList(openFirst = true) {
    const result = await api<{ conversations: Conversation[] }>(
      "/api/v1/conversations",
    );
    setConversations(result.conversations);
    if (
      openFirst &&
      !selectedConversationIdRef.current &&
      result.conversations[0]
    )
      await openConversation(result.conversations[0].id);
  }
  async function fetchConversation(id: string) {
    const result = await api<{ conversation: Conversation }>(
      `/api/v1/conversations/${id}`,
    );
    return result.conversation;
  }
  async function openConversation(id: string) {
    selectedConversationIdRef.current = id;
    const conversation = await fetchConversation(id);
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
  async function createConversation() {
    const result = await api<{ conversation: Conversation }>(
      "/api/v1/conversations",
      { method: "POST", body: JSON.stringify({}) },
    );
    selectedConversationIdRef.current = result.conversation.id;
    setCurrent(result.conversation);
    const list = await api<{ conversations: Conversation[] }>(
      "/api/v1/conversations",
    );
    setConversations(list.conversations);
  }
  useEffect(() => {
    void loadList();
  }, []);

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
      throw Object.assign(
        new Error(
          problem.error === "conversation_busy"
            ? "This conversation is already answering in another tab."
            : problem.error === "ai_provider_required" ||
                problem.error === "analysis_provider_required"
              ? "Choose a connected analysis provider in Settings before using Ask AI."
              : problem.error === "invalid_message"
                ? "Enter a question between 1 and 2,000 characters."
                : problem.error === "invalid_request_id"
                  ? "The request identifier was invalid. Please try again."
                  : "Ask AI could not start the answer.",
        ),
        problem.assistantId ? { assistantId: problem.assistantId } : {},
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
    let outcome: StreamOutcome | null = null;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      outcome = await consumeStream(response, temporaryId);
      if (
        outcome.status === "failed" &&
        outcome.errorMessage &&
        selectedConversationIdRef.current === conversationId
      )
        setError(outcome.errorMessage);
    } catch (cause) {
      const aborted =
        (cause instanceof DOMException && cause.name === "AbortError") ||
        (cause instanceof Error && cause.name === "AbortError");
      if (!aborted) controller.abort();
      const answer = partialAnswersRef.current.get(temporaryId) ?? "";
      const responseAssistantId =
        cause instanceof Error &&
        "assistantId" in cause &&
        typeof cause.assistantId === "string"
          ? cause.assistantId
          : undefined;
      const assistantId =
        serverAssistantIdsRef.current.get(temporaryId) ?? responseAssistantId;
      outcome = {
        ...initialStreamState<AskSource>(),
        assistantId,
        text: answer,
        status: aborted ? "cancelled" : "failed",
        errorCode: aborted ? "cancelled" : "provider_error",
        errorMessage: aborted
          ? "Answer stopped."
          : cause instanceof Error
            ? cause.message
            : "Ask AI failed.",
      };
      updateAssistant(assistantId ?? temporaryId, {
        content: answer,
        status: outcome.status,
        errorCode: outcome.errorCode,
      });
      if (!aborted && selectedConversationIdRef.current === conversationId)
        setError(cause instanceof Error ? cause.message : "Ask AI failed.");
    } finally {
      abortRef.current = null;
      try {
        if (outcome) {
          await reconcileAttempt(conversationId, outcome, [
            temporaryId,
            ...(optimisticUserId ? [optimisticUserId] : []),
          ]);
        }
        await loadList(false).catch(() => undefined);
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
  async function send(text = question) {
    const cleaned = text.trim();
    if (!cleaned || streaming) return;
    let conversation = current;
    if (!conversation) {
      const result = await api<{ conversation: Conversation }>(
        "/api/v1/conversations",
        { method: "POST", body: JSON.stringify({}) },
      );
      conversation = result.conversation;
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
  const suggestions = [
    "What Lisbon restaurants have I saved?",
    "Summarize my saved Portugal recommendations.",
    "Which products have creators recommended?",
  ];
  return (
    <div className="ask-page-wrap">
      <div className="ask-page-intro">
        <div>
          <div className="eyebrow">Your saved archive</div>
          <h1>Ask</h1>
          <p>Answers from your saved posts, with sources.</p>
        </div>
      </div>
      <div className="ask-page">
        <aside
          className={`conversation-sidebar ${conversationListOpen ? "open" : ""}`}
          aria-label="Ask conversations"
        >
          <div className="conversation-sidebar-heading">
            <strong>Conversations</strong>
            <button
              type="button"
              className="conversation-list-toggle"
              aria-expanded={conversationListOpen}
              aria-controls="ask-conversation-list"
              onClick={() => setConversationListOpen((open) => !open)}
            >
              {conversationListOpen ? "Hide" : "Browse"}
            </button>
          </div>
          <button
            className="new-chat"
            onClick={() => void createConversation()}
          >
            ＋ New conversation
          </button>
          <div id="ask-conversation-list" className="conversation-list">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={current?.id === conversation.id ? "selected" : ""}
                onClick={() => {
                  setConversationListOpen(false);
                  void openConversation(conversation.id);
                }}
              >
                <span>{conversation.title}</span>
                <small>{conversation.messageCount ?? 0} messages</small>
              </button>
            ))}
          </div>
        </aside>
        <section className="chat-panel">
          <div className="chat-heading">
            <div>
              <div className="eyebrow">Your saved archive</div>
              <h1>Ask AI</h1>
            </div>
            {current && (
              <button
                className="delete-chat"
                disabled={streaming}
                onClick={async () => {
                  if (!window.confirm("Delete this conversation?")) return;
                  await api(`/api/v1/conversations/${current.id}`, {
                    method: "DELETE",
                  });
                  setCurrent(null);
                  selectedConversationIdRef.current = null;
                  await loadList();
                }}
              >
                Delete
              </button>
            )}
          </div>
          <div className="messages">
            {!current?.messages?.length && (
              <div className="ask-empty">
                <h2>Ask what you’ve saved.</h2>
                <p>
                  Answers are grounded only in your archived captures and link
                  back to their evidence.
                </p>
                <div className="suggestions">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => void send(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {current?.messages?.map((message) => (
              <article
                className={`chat-message ${message.role} ${message.status}`}
                key={message.id}
              >
                <div className="message-role">
                  {message.role === "user" ? "You" : "Social Knowledge"}
                </div>
                <div className="message-content">
                  {message.content ? (
                    message.role === "assistant" ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        urlTransform={(url) =>
                          /^(capture:|https?:|mailto:)/i.test(url) ? url : ""
                        }
                        components={{
                          a: ({ href, children }) => {
                            if (href?.startsWith("capture:")) {
                              const source = message.sources.find(
                                ({ id }) => id === href.slice(8),
                              );
                              if (source)
                                return (
                                  <button
                                    type="button"
                                    className={`inline-capture-link platform-${source.platform.toLowerCase()}`}
                                    aria-label={`Open ${source.platform} reel: ${source.title}`}
                                    title={`Open ${source.title}`}
                                    onClick={() => onOpen(source.id)}
                                  >
                                    <PlatformMark platform={source.platform} />
                                    <span>{children}</span>
                                  </button>
                                );
                            }
                            return (
                              <a href={href} target="_blank" rel="noreferrer">
                                {children}
                              </a>
                            );
                          },
                        }}
                      >
                        {answerWithCaptureLinks(
                          message.content,
                          message.sources,
                        )}
                      </ReactMarkdown>
                    ) : (
                      message.content
                    )
                  ) : message.status === "pending" ? (
                    <span className="typing">
                      {message.statusText || "Searching your archive…"}
                    </span>
                  ) : (
                    <span>
                      {message.status === "cancelled"
                        ? "Answer stopped."
                        : "Ask AI could not finish this answer."}
                    </span>
                  )}
                </div>
                {message.role === "assistant" &&
                  (message.status === "failed" ||
                    message.status === "cancelled") && (
                    <button
                      className="retry-answer"
                      disabled={streaming}
                      onClick={() => void retry(message)}
                    >
                      Retry
                    </button>
                  )}
                {message.role === "assistant" &&
                  message.sufficient === false && (
                    <small className="insufficient">
                      The saved archive did not contain enough evidence.
                    </small>
                  )}
                {message.sources?.length > 0 && (
                  <div className="answer-sources">
                    <strong>Sources</strong>
                    {message.sources.map((source) => (
                      <button
                        key={source.id}
                        aria-label={`Open ${source.platform} reel: ${source.title}`}
                        onClick={() => onOpen(source.id)}
                      >
                        <span
                          className={`source-number platform-${source.platform.toLowerCase()}`}
                        >
                          <PlatformMark platform={source.platform} />
                          <span>{source.citation}</span>
                        </span>
                        <span>
                          <b>{source.title}</b>
                          <small>
                            {source.breadcrumb.join(" › ") || source.platform}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
          {error && (
            <p className="chat-error" role="alert">
              {error}
            </p>
          )}
          {reconciliationNotice && (
            <p className="chat-error" role="status">
              {reconciliationNotice}
            </p>
          )}
          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <textarea
              aria-label="Ask your archive"
              placeholder="Ask about your saved places, products, recommendations…"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type={streaming ? "button" : "submit"}
              className={streaming ? "stop-answer" : ""}
              disabled={!streaming && !question.trim()}
              onClick={streaming ? () => abortRef.current?.abort() : undefined}
            >
              {streaming ? "Stop" : "Send"}
            </button>
          </form>
          <small className="grounding-note">
            Answers use only your saved archive. Open sources to verify creator
            claims.
          </small>
        </section>
      </div>
    </div>
  );
}
