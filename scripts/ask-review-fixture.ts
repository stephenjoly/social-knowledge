import { randomUUID } from "node:crypto";
import type { JobStore } from "../src/db.js";
import type { AskService, AskSource } from "../src/ask.js";

const references = [
  { title: "10 skip-level questions to ask your boss’s boss", creator: "leadwell.daily", platform: "instagram" as const, synopsis: "Use skip-levels to show strategic curiosity: risks, untapped opportunities, success metrics." },
  { title: "One-to-one questions to ask your manager", creator: "managermoves", platform: "facebook" as const, synopsis: "Bring two or three focused questions, in your own words. Ask what great looks like in six months." },
  { title: "Give leadership updates with the OWN structure", creator: "clearupdates", platform: "facebook" as const, synopsis: "Outcome, Why, what’s Next. Name blockers, offer options A and B, and share bad news early." },
];

export const reviewQuestion = "I’ve been saving stuff on how to be a good leader. I’m a new manager and want to get promoted — can you surface all of it?";
export const reviewAnswer = "Three of your saves cover this. Here’s what they say, grouped by goal.\n\n#### Promotion strategy and visibility\n\n- **10 skip-level questions to ask your boss’s boss** — use skip-levels to show strategic curiosity rather than to impress. Ask a few questions and follow up: current risks, untapped opportunities, what success looks like in three years, and which initiatives the leader is most excited about. [1]\n\n#### New-manager one-to-ones\n\n- **One-to-one questions to ask your manager** — bring two or three focused questions in your own words, not all ten. If you ask only one: “Is there anything I do that makes your job harder?” Others: where you can decide without asking, and what great looks like in six months. [4]\n\n#### Leadership communication\n\n- **Give leadership updates with the OWN structure** — Outcome, Why, what’s Next. When blocked, name the blocker, offer options A and B, and say which you lean toward. Share bad news early, and make any ask specific. [6]";

/** Caller must supply an explicitly disposable store and a synthetic owner. */
export function seedAskReviewFixture(store: JobStore, userId: string) {
  if (store.listConversations(userId).length) throw new Error("Review fixture requires an empty conversation list");
  const sources: AskSource[] = references.map((reference, index) => {
    const slug = `ask-review-${index + 1}`;
    const sourceUrl = reference.platform === "instagram" ? `https://www.instagram.com/reel/${slug}/` : `https://www.facebook.com/share/r/${slug}/`;
    const { job } = store.createOrGet({ ownerUserId: userId, sourceUrl, normalizedUrl: sourceUrl, sourceHash: slug });
    const capture = store.createCapture({
      job, sourceType: "video", sourceId: slug, platform: reference.platform,
      title: reference.title, creator: reference.creator, creatorUrl: null,
      description: reference.synopsis, transcript: reference.synopsis, sourceLanguage: "en",
      translatedTranscript: null, translationLanguage: null, comments: [],
      analysis: { title: reference.title, synopsis: reference.synopsis, whyUseful: "A practical synthetic leadership reference.", takeaways: [reference.synopsis], topics: ["leadership"], entities: [], recommendations: [], claimsNeedingVerification: [], evidence: [], classification: { primaryDomain: "Work & Career", country: null, city: null, subcategory: "Leadership", secondaryTopics: ["leadership"], confidence: 0.95 } },
      publishedAt: null, durationSeconds: 45, notePath: `Social Knowledge/Captures/${slug}.md`, assets: [],
    })!;
    store.complete(job.id, capture.notePath);
    return { id: capture.id, citation: [1, 4, 6][index]!, ...reference, sourceUrl, breadcrumb: ["Work & Career", "Leadership"] };
  });
  store.saveAiProviderConnection(userId, "openai", "synthetic-review-no-credential", "Simulated",);
  store.saveAiProviderConnection(userId, "cerebras", "synthetic-review-no-credential", "Simulated",);
  store.saveAiTaskSelections(userId, { transcriptionProvider: "openai", transcriptionModel: "gpt-4o-mini-transcribe", analysisProvider: "openai", analysisModel: "gpt-5-mini", analysisThinkingLevel: "medium" });
  const titles = ["Leadership advice for a new manager", "Lower back stretches under 10 minutes", "What have I saved about Lisbon?", "Sourdough starter troubleshooting", "Negotiating a raise — scripts I saved", "Rainy day activities for kids", "Compare the budgeting methods I saved", "Houseplants that survive low light", "AI agent demos worth rewatching", "Beginner running plans", "Desk setup ideas", "Weekly meal plan from my recipe saves"];
  const ages = [0, 0, 1, 1, 3, 4, 5, 6, 35, 36, 37, 2];
  const ids: string[] = [];
  for (const [index, title] of titles.entries()) {
    const conversation = store.createConversation(userId, title)!;
    const attempt = store.beginConversationTurn(userId, conversation.id, index === 0 ? reviewQuestion : `What have I saved about ${title.toLowerCase()}?`, randomUUID());
    if (index === 1) store.failConversationAttempt(userId, conversation.id, attempt.assistantId, "failed", "provider_error");
    else if (index !== 9) store.completeConversationAttempt(userId, conversation.id, attempt.assistantId, reviewAnswer, sources, true);
    const date = new Date();
    date.setDate(date.getDate() - ages[index]!);
    date.setHours(index === 0 ? 14 : 12, 2, 0, 0);
    const stamp = date.toISOString();
    store.database.prepare("UPDATE conversations SET created_at=?,updated_at=?,pinned_at=?,ask_provider='openai',ask_model='gpt-5-mini',ask_thinking_level='medium' WHERE id=? AND user_id=?").run(stamp, stamp, index === 11 ? stamp : null, conversation.id, userId);
    store.database.prepare("UPDATE conversation_messages SET created_at=?,provider=CASE WHEN role='assistant' THEN 'openai' END,model=CASE WHEN role='assistant' THEN 'gpt-5-mini' END,thinking_level=CASE WHEN role='assistant' THEN 'medium' END WHERE conversation_id=?").run(stamp, conversation.id);
    ids.push(conversation.id);
  }
  return { conversationIds: ids, sources };
}

export function syntheticReviewAsk(store: JobStore): Pick<AskService, "answer"> {
  return { answer: async (input) => {
    const captures = store.listCaptures({ userId: input.userId, limit: 100 }).captures;
    const sources = references.map((reference, index) => {
      const capture = captures.find((item) => item.creator === reference.creator);
      if (!capture) throw new Error("Synthetic review capture missing");
      return { id: capture.id, citation: [1, 4, 6][index]!, ...reference, sourceUrl: capture.sourceUrl, breadcrumb: ["Work & Career", "Leadership"] };
    });
    input.onStatus?.("Searching your archive…");
    for (const text of reviewAnswer.match(/.{1,100}(?:\n|$)|.{1,100}/gs) ?? [reviewAnswer]) {
      if (input.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      input.onDelta(text);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    store.completeConversationAttempt(input.userId, input.conversationId, input.assistantId, reviewAnswer, sources, true);
    return { answer: reviewAnswer, sources, sufficient: true, diagnostics: { action: "search_archive", standaloneQuestion: input.question, terms: ["leadership"], selected: [], reusedCaptureIds: [], compacted: false, compactionFallback: false, estimatedContextTokens: 0 } };
  } };
}
