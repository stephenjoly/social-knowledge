import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type {
  AskPreferences,
  AskSelection,
  ChatMessage,
  Conversation,
} from "./types";

/**
 * App-level chat history shared by the sidebar and the Ask page.
 *
 * The sidebar lists and manages chats; the Ask page shows `currentId` and
 * reports chats it creates or updates through `setCurrentId` and `upsert`.
 * Every request is scoped to the signed-in owner by the server.
 */
export type ConversationPatch = {
  title?: string;
  pinned?: boolean;
  selection?: AskSelection | null;
};

export type ConversationsController = {
  /** Summaries in server order: pinned first, then most recently updated. */
  conversations: Conversation[];
  loaded: boolean;
  error: string | null;
  /** Chat shown on the Ask page; null is a new, unsaved chat. */
  currentId: string | null;
  /** Increments on every `startNew()` so Ask can reset even when already new. */
  newChatToken: number;
  /** Shows an existing chat (the shell also switches to the Ask tab). */
  open: (id: string) => void;
  /** Starts a new chat (the shell also switches to the Ask tab). */
  startNew: () => void;
  /** Ask calls this after creating a chat; it does not navigate or reset. */
  setCurrentId: (id: string | null) => void;
  /** Ask reports a created or changed chat (title, updatedAt, lastStatus, selection). */
  upsert: (conversation: Conversation) => void;
  patch: (id: string, patch: ConversationPatch) => Promise<Conversation | null>;
  rename: (id: string, title: string) => Promise<boolean>;
  setPinned: (id: string, pinned: boolean) => Promise<boolean>;
  /** Asks to confirm, then deletes; a deleted current chat becomes a new chat. */
  remove: (id: string) => Promise<boolean>;
  /** Downloads the chat as a Markdown file built in the browser. */
  exportMarkdown: (id: string) => Promise<boolean>;
  refresh: () => Promise<void>;
};

function sortConversations(list: Conversation[]) {
  return [...list].sort((a, b) => {
    if (a.pinnedAt && b.pinnedAt) return Date.parse(b.pinnedAt) - Date.parse(a.pinnedAt);
    if (a.pinnedAt) return -1;
    if (b.pinnedAt) return 1;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

function summary(conversation: Conversation): Conversation {
  const { messages, ...rest } = conversation;
  if (!messages) return rest;
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  return {
    ...rest,
    messageCount: messages.length,
    lastStatus: lastAssistant?.status ?? rest.lastStatus ?? null,
  };
}

export function useConversations(ownerId: string | null): ConversationsController {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [newChatToken, setNewChatToken] = useState(0);
  const generation = useRef(0);
  const currentRef = useRef(currentId);
  currentRef.current = currentId;

  const refresh = useCallback(async () => {
    if (!ownerId) return;
    const request = generation.current;
    try {
      const result = await api<{ conversations: Conversation[] }>("/api/v1/conversations");
      if (request !== generation.current) return;
      setConversations(sortConversations(result.conversations));
      setError(null);
    } catch {
      if (request === generation.current) setError("Chats could not be loaded.");
    } finally {
      if (request === generation.current) setLoaded(true);
    }
  }, [ownerId]);

  useEffect(() => {
    generation.current += 1;
    setConversations([]);
    setLoaded(false);
    setError(null);
    setCurrentId(null);
    if (ownerId) void refresh();
  }, [ownerId, refresh]);

  const upsert = useCallback((conversation: Conversation) => {
    const next = summary(conversation);
    setConversations((list) => {
      const existing = list.find((item) => item.id === next.id);
      const merged = existing ? { ...existing, ...next } : next;
      return sortConversations([merged, ...list.filter((item) => item.id !== next.id)]);
    });
  }, []);

  const patch = useCallback(
    async (id: string, body: ConversationPatch) => {
      const request = generation.current;
      try {
        const result = await api<{ conversation: Conversation }>(`/api/v1/conversations/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        if (request !== generation.current) return null;
        upsert(result.conversation);
        return result.conversation;
      } catch {
        return null;
      }
    },
    [upsert],
  );

  const remove = useCallback(async (id: string) => {
    const request = generation.current;
    if (!window.confirm("Delete this chat? This can’t be undone.")) return false;
    try {
      await api(`/api/v1/conversations/${id}`, { method: "DELETE" });
    } catch (e) {
      if ((e as { status?: number }).status !== 404) return false;
    }
    if (request !== generation.current) return false;
    setConversations((list) => list.filter((item) => item.id !== id));
    if (currentRef.current === id) {
      setCurrentId(null);
      setNewChatToken((token) => token + 1);
    }
    return true;
  }, []);

  const exportMarkdown = useCallback(async (id: string) => {
    try {
      const result = await api<{ conversation: Conversation }>(`/api/v1/conversations/${id}`);
      downloadMarkdown(result.conversation);
      return true;
    } catch {
      return false;
    }
  }, []);

  return useMemo<ConversationsController>(
    () => ({
      conversations,
      loaded,
      error,
      currentId,
      newChatToken,
      open: (id) => setCurrentId(id),
      startNew: () => {
        setCurrentId(null);
        setNewChatToken((token) => token + 1);
      },
      setCurrentId,
      upsert,
      patch,
      rename: async (id, title) => (await patch(id, { title: title.trim() })) !== null,
      setPinned: async (id, pinned) => (await patch(id, { pinned })) !== null,
      remove,
      exportMarkdown,
      refresh,
    }),
    [conversations, loaded, error, currentId, newChatToken, upsert, patch, remove, exportMarkdown, refresh],
  );
}

/* ── Sidebar grouping and search ───────────────────────────────────── */

export type ConversationGroup = { label: string; items: Conversation[] };

const DAY = 86_400_000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Pinned, Today, Yesterday, Previous 7 days, then one group per month. */
export function groupConversations(list: Conversation[], now = new Date()): ConversationGroup[] {
  const today = startOfDay(now);
  const groups = new Map<string, Conversation[]>();
  const add = (label: string, item: Conversation) => {
    const items = groups.get(label);
    if (items) items.push(item);
    else groups.set(label, [item]);
  };
  for (const item of list.filter((entry) => entry.pinnedAt)) add("Pinned", item);
  const dated = list
    .filter((entry) => !entry.pinnedAt)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  for (const item of dated) {
    const updated = new Date(item.updatedAt);
    const day = startOfDay(updated);
    if (day >= today) add("Today", item);
    else if (day >= today - DAY) add("Yesterday", item);
    else if (day >= today - 7 * DAY) add("Previous 7 days", item);
    else
      add(
        updated.toLocaleDateString("en-GB", {
          month: "long",
          ...(updated.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
        }),
        item,
      );
  }
  return [...groups].map(([label, items]) => ({ label, items }));
}

/** Case-insensitive title filter. */
export function filterConversations(list: Conversation[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return list;
  return list.filter((item) => item.title.toLowerCase().includes(needle));
}

/** Splits a title around the first match so the sidebar can mark it. */
export function highlightParts(title: string, query: string) {
  const needle = query.trim().toLowerCase();
  const index = needle ? title.toLowerCase().indexOf(needle) : -1;
  if (index < 0) return null;
  return {
    before: title.slice(0, index),
    match: title.slice(index, index + needle.length),
    after: title.slice(index + needle.length),
  };
}

/* ── Markdown export (client-side) ─────────────────────────────────── */

const thinkingLabel = (level: ChatMessage["thinkingLevel"]) =>
  level ? `${level[0]!.toUpperCase()}${level.slice(1)} thinking` : null;

/** Escapes characters that would change Markdown link text. */
function linkText(text: string) {
  return text.replace(/([\\[\]])/g, "\\$1").replace(/\s+/g, " ").trim();
}

export function conversationMarkdown(conversation: Conversation) {
  const lines = [`# ${conversation.title.replace(/\s+/g, " ").trim()}`, ""];
  lines.push(`Exported from Social Knowledge on ${new Date().toISOString().slice(0, 10)}.`, "");
  for (const message of conversation.messages ?? []) {
    if (message.role === "user") {
      lines.push("## You", "", message.content.trim(), "");
      continue;
    }
    if (message.status !== "complete") continue;
    lines.push("## Ask AI", "");
    const model = [message.model, thinkingLabel(message.thinkingLevel)].filter(Boolean).join(" · ");
    if (model) lines.push(`_${model}_`, "");
    lines.push(message.content.trim(), "");
    if (message.sources.length) {
      lines.push("Sources:", "");
      for (const source of message.sources) {
        const by = source.creator ? ` — ${linkText(source.creator)}` : "";
        lines.push(`${source.citation}. [${linkText(source.title)}](<${source.sourceUrl}>)${by}, ${source.platform}`);
      }
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function markdownFilename(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "chat"}.md`;
}

function downloadMarkdown(conversation: Conversation) {
  const blob = new Blob([conversationMarkdown(conversation)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = markdownFilename(conversation.title);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* ── Ask preferences ───────────────────────────────────────────────── */

export const defaultAskPreferences: AskPreferences = { askSourcesPanel: true, sendWith: "enter" };

export type AskPreferencesController = {
  preferences: AskPreferences;
  loaded: boolean;
  /** Optimistic; reverts and returns false when the server rejects it. */
  update: (patch: Partial<AskPreferences>) => Promise<boolean>;
  /** Applies a server response from another editor (e.g. the Settings modal). */
  replace: (next: Partial<AskPreferences>) => void;
};

function pickAskPreferences(value: unknown): Partial<AskPreferences> {
  const source = (value ?? {}) as Record<string, unknown>;
  const next: Partial<AskPreferences> = {};
  if (typeof source.askSourcesPanel === "boolean") next.askSourcesPanel = source.askSourcesPanel;
  if (source.sendWith === "enter" || source.sendWith === "mod-enter") next.sendWith = source.sendWith;
  return next;
}

export function useAskPreferences(ownerId: string | null): AskPreferencesController {
  const [preferences, setPreferences] = useState<AskPreferences>(defaultAskPreferences);
  const [loaded, setLoaded] = useState(false);
  const generation = useRef(0);
  const latest = useRef(preferences);
  latest.current = preferences;

  useEffect(() => {
    const request = ++generation.current;
    setPreferences(defaultAskPreferences);
    setLoaded(false);
    if (!ownerId) return;
    void api<{ preferences: unknown }>("/api/v1/preferences")
      .then((result) => {
        if (request === generation.current)
          setPreferences({ ...defaultAskPreferences, ...pickAskPreferences(result.preferences) });
      })
      .catch(() => undefined)
      .finally(() => {
        if (request === generation.current) setLoaded(true);
      });
  }, [ownerId]);

  const update = useCallback(async (patch: Partial<AskPreferences>) => {
    const request = generation.current;
    const previous = latest.current;
    setPreferences({ ...previous, ...patch });
    try {
      const result = await api<{ preferences: unknown }>("/api/v1/preferences", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (request === generation.current)
        setPreferences((current) => ({ ...current, ...pickAskPreferences(result.preferences) }));
      return true;
    } catch {
      if (request === generation.current) setPreferences(previous);
      return false;
    }
  }, []);

  const replace = useCallback((next: Partial<AskPreferences>) => {
    setPreferences((current) => ({ ...current, ...pickAskPreferences(next) }));
  }, []);

  return useMemo(() => ({ preferences, loaded, update, replace }), [preferences, loaded, update, replace]);
}
