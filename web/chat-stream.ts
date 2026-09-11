export type SseEvent = {
  event: string;
  data: Record<string, unknown>;
};

function parseBlock(block: string): SseEvent | null {
  const event = block.match(/^event:\s*(.+)$/m)?.[1];
  const dataLines = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  if (!event || !dataLines.length) {
    const commentOnly = block
      .split(/\r?\n/)
      .every((line) => !line.trim() || line.startsWith(":"));
    if (commentOnly) return null;
    throw new Error("invalid_sse_event");
  }
  const parsed: unknown = JSON.parse(dataLines.join("\n"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("invalid_sse_data");
  return { event, data: parsed as Record<string, unknown> };
}

/** Incrementally decodes SSE records without assuming network read boundaries. */
export class SseDecoder {
  private buffer = "";

  push(chunk: string, done = false) {
    this.buffer += chunk;
    const blocks = this.buffer.split(/\r?\n\r?\n/);
    const remainder = blocks.pop() ?? "";
    if (done) {
      if (remainder.trim()) blocks.push(remainder);
      this.buffer = "";
    } else this.buffer = remainder;
    return blocks
      .map((block) => parseBlock(block))
      .filter((event): event is SseEvent => event !== null);
  }
}

export type StreamStatus = "pending" | "complete" | "failed" | "cancelled";

export type StreamState<Source = unknown> = {
  assistantId: string | undefined;
  text: string;
  sources: Source[];
  sufficient: boolean | null;
  status: StreamStatus;
  errorCode: string | null;
  errorMessage: string | undefined;
};

export function initialStreamState<Source = unknown>(): StreamState<Source> {
  return {
    assistantId: undefined,
    text: "",
    sources: [],
    sufficient: null,
    status: "pending",
    errorCode: null,
    errorMessage: undefined,
  };
}

/** Applies one server event while keeping all text received so far. */
export function applyStreamEvent<Source = unknown>(
  state: StreamState<Source>,
  event: SseEvent,
): StreamState<Source> {
  const data = event.data;
  if (event.event === "started") {
    return {
      ...state,
      assistantId:
        typeof data.assistantId === "string"
          ? data.assistantId
          : state.assistantId,
    };
  }
  if (event.event === "delta") {
    return typeof data.text === "string" && data.text
      ? { ...state, text: state.text + data.text }
      : state;
  }
  if (event.event === "sources") {
    return {
      ...state,
      sources: Array.isArray(data.sources) ? (data.sources as Source[]) : [],
      sufficient: typeof data.sufficient === "boolean" ? data.sufficient : null,
    };
  }
  if (event.event === "completed") return { ...state, status: "complete" };
  if (event.event === "cancelled")
    return {
      ...state,
      status: "cancelled",
      errorCode:
        typeof data.errorCode === "string" ? data.errorCode : "cancelled",
      errorMessage: typeof data.message === "string" ? data.message : undefined,
    };
  if (event.event === "error")
    return {
      ...state,
      status: "failed",
      errorCode: typeof data.errorCode === "string" ? data.errorCode : null,
      errorMessage: typeof data.message === "string" ? data.message : undefined,
    };
  return state;
}

export function finishStream<Source>(
  state: StreamState<Source>,
): StreamState<Source> {
  return state.status === "pending"
    ? {
        ...state,
        status: "failed",
        errorCode: "provider_error",
        errorMessage: "The answer stream ended before it completed.",
      }
    : state;
}

type AttemptMessage = { id: string; status: string };

/**
 * Reads an attempt back until the database has left the pending state. The
 * caller supplies timing and snapshot callbacks so this race-prone path can
 * be tested without a browser or real timers.
 */
export async function reconcileConversationAttempt<
  Conversation extends { messages?: AttemptMessage[] },
>(
  assistantId: string | undefined,
  fetchSnapshot: () => Promise<Conversation>,
  options: {
    sleep: (milliseconds: number) => Promise<void>;
    onSnapshot?: (snapshot: Conversation) => void;
    onStillPending?: () => void;
    now?: () => number;
    initialDelays?: readonly number[];
    pollInterval?: number;
    timeout?: number;
  },
): Promise<"settled" | "timeout"> {
  const now = options.now ?? Date.now;
  const deadline = now() + (options.timeout ?? 60000);
  let latest: Conversation | null = null;
  const readback = async () => {
    let snapshot: Conversation;
    try {
      snapshot = await fetchSnapshot();
    } catch {
      return false;
    }
    latest = snapshot;
    const attempt = assistantId
      ? snapshot.messages?.find((message) => message.id === assistantId)
      : undefined;
    const settled =
      !assistantId || Boolean(attempt && attempt.status !== "pending");
    if (settled) options.onSnapshot?.(snapshot);
    return settled;
  };
  const initialDelays = options.initialDelays ?? [
    0, 50, 100, 200, 400, 800, 1000,
  ];
  for (const delay of initialDelays) {
    if (now() >= deadline) break;
    if (delay) await options.sleep(delay);
    if (await readback()) return "settled";
  }
  if (now() >= deadline) {
    if (latest) options.onSnapshot?.(latest);
    return "timeout";
  }
  options.onStillPending?.();
  const pollInterval = options.pollInterval ?? 1000;
  while (now() < deadline) {
    await options.sleep(pollInterval);
    if (await readback()) return "settled";
  }
  if (latest) options.onSnapshot?.(latest);
  return "timeout";
}

type MessageShape = {
  id: string;
  role: string;
  content: string;
  sources?: unknown[];
  sufficient?: boolean | null;
  status: string;
  errorCode?: string | null;
  userMessageId?: string | null;
};

/**
 * Merges an authoritative conversation without dropping newer optimistic
 * messages. Partial answer text is only overlaid on an empty active/terminal
 * attempt; a completed server answer always wins.
 */
export function mergeConversationSnapshot<
  Conversation extends { id: string; messages?: Message[] },
  Message extends MessageShape,
>(
  current: Conversation | null,
  snapshot: Conversation,
  options: {
    assistantId?: string;
    partialText?: string;
    optimisticMessageIds?: string[];
  } = {},
): Conversation {
  const localMessages =
    current?.id === snapshot.id ? (current.messages ?? []) : [];
  const serverMessages = snapshot.messages ?? [];
  const localById = new Map(
    localMessages.map((message) => [message.id, message]),
  );
  const optimisticIds = new Set(options.optimisticMessageIds ?? []);
  const serverIds = new Set(serverMessages.map((message) => message.id));
  const serverAssistant = options.assistantId
    ? serverMessages.find((message) => message.id === options.assistantId)
    : undefined;
  const linkedServerUserId = serverAssistant?.userMessageId;
  const mergedMessages = serverMessages.map((message) => {
    const local = localById.get(message.id);
    const pendingWithLocalState =
      message.status === "pending" &&
      local &&
      (local.status !== "pending" ||
        Boolean(local.content) ||
        Boolean(local.sources?.length) ||
        (local.sufficient !== undefined && local.sufficient !== null) ||
        Boolean(local.errorCode));
    const merged = pendingWithLocalState
      ? {
          ...message,
          content: message.content || local.content,
          sources: message.sources?.length ? message.sources : local.sources,
          sufficient: message.sufficient ?? local.sufficient,
          status: local.status,
          errorCode: message.errorCode ?? local.errorCode,
        }
      : message;
    if (
      merged.id === options.assistantId &&
      options.partialText &&
      !merged.content &&
      (merged.status === "pending" ||
        merged.status === "failed" ||
        merged.status === "cancelled")
    )
      return { ...merged, content: options.partialText };
    return merged;
  });
  const localOnly = localMessages.filter((message) => {
    if (serverIds.has(message.id)) return false;
    if (!optimisticIds.has(message.id)) return true;
    if (
      message.role === "assistant" &&
      options.assistantId &&
      serverIds.has(options.assistantId)
    )
      return false;
    if (message.role !== "user") return true;
    const linked =
      linkedServerUserId !== undefined &&
      linkedServerUserId !== null &&
      serverIds.has(linkedServerUserId);
    return !linked;
  });
  return {
    ...snapshot,
    messages: [...mergedMessages, ...localOnly],
  } as Conversation;
}
