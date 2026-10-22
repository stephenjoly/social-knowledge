export type Asset = {
  id: string;
  kind: "video" | "audio" | "image" | "thumbnail";
  mimeType: string;
  sizeBytes: number;
};
export type Capture = {
  id: string;
  jobId: string;
  title: string;
  creator: string | null;
  platform: string;
  sourceType: string;
  sourceUrl: string;
  synopsis: string;
  topics: string[];
  categoryLabel?: string | null;
  createdAt: string;
  description: string | null;
  transcript: string;
  sourceLanguage: string | null;
  translatedTranscript: string | null;
  translationLanguage: string | null;
  comments: Array<{
    author: string | null;
    text: string;
    likeCount: number | null;
    isPinned: boolean;
  }>;
  whyUseful: string | null;
  analysis: {
    takeaways?: string[];
    recommendations: string[];
    entities: Array<{
      name: string;
      type: string;
      location: string | null;
      description: string | null;
    }>;
    evidence: Array<{ claim: string; source: string; quote: string | null }>;
    claimsNeedingVerification: string[];
  };
  assets: Asset[];
  notePath: string;
};
export type ActivityStageName = "added" | "found" | "media" | "text" | "saved";
export type ActivityStageState = "queued" | "active" | "completed" | "failed";
export type ActivityStage = {
  name: ActivityStageName;
  state: ActivityStageState;
  durationMs: number | null;
};
export type ActivityJob = {
  id: string;
  status: string;
  normalizedUrl: string;
  displayTitle: string | null;
  attempts: number;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  /** Set when a terminal unsupported bookmark is hidden from attention views. */
  archivedAt?: string | null;
  reachedStages: ActivityStageName[];
  stages: ActivityStage[];
};
export type LibraryExport = {
  id: string;
  status: "pending" | "complete" | "failed";
  kind: "full";
  errorCode: string | null;
  recordCount: number | null;
  createdAt: string;
  expiresAt: string;
};
export type ActivityEvent = {
  id: string;
  attempt?: number | null;
  failureCode?: string | null;
  status: string;
  createdAt: string;
  label: string;
  message: string | null;
  durationMs: number | null;
  state: "pending" | "running" | "completed" | "failed";
};
export type ActivityDetails = { job: ActivityJob; events: ActivityEvent[] };
export type ActivityCounts = {
  active: number;
  queued: number;
  failed: number;
  savedToday: number;
  recentEvents: number;
};
export type ActivityPage = {
  jobs: ActivityJob[];
  nextCursor: string | null;
  generatedAt: string;
  counts: ActivityCounts;
};
export type FailedActivityPage = {
  failures: ActivityJob[];
  nextCursor: string | null;
  total: number;
};
export type LibraryNode = {
  id: string;
  parentId: string | null;
  label: string;
  slug: string;
  kind: string;
  captureCount: number;
  childCount: number;
};
export type LibraryNodeDetail = LibraryNode & {
  breadcrumb: LibraryNode[];
  children: LibraryNode[];
  captures: Array<{
    id: string;
    title: string;
    platform: string;
    creator: string | null;
    creatorUrl: string | null;
    sourceUrl: string;
    synopsis: string;
    takeaways: string[];
    createdAt: string;
    assignedNode: { id: string; label: string };
    breadcrumb: Array<{ id: string; label: string }>;
  }>;
};
export type CaptureFacets = {
  categories: Array<{
    id: string;
    label: string;
    kind: string;
    count: number;
  }>;
  topics: Array<{ label: string; count: number }>;
};
export type InboxView = "rows" | "tiles";
export type InboxSortKey = "title" | "savedAt" | "source" | "category" | "topic";
export type OAuthConnection = {
  clientId: string;
  name: string;
  scope: string;
  authorizedAt: string;
  lastUsedAt: string | null;
};
export type PlatformConnection = {
  platform: "facebook" | "instagram";
  connected: boolean;
  status: "connected" | "needs_attention" | "not_connected";
  cookieCount: number;
  lastValidatedAt: string | null;
  lastUsedAt: string | null;
  updatedAt: string | null;
};
export type AskSource = {
  id: string;
  citation: number;
  title: string;
  creator: string | null;
  platform: string;
  synopsis: string;
  sourceUrl: string;
  breadcrumb: string[];
};
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: AskSource[];
  sufficient: boolean | null;
  status: "pending" | "complete" | "failed" | "cancelled";
  statusText?: string | null;
  errorCode: string | null;
  retryOf: string | null;
  userMessageId: string | null;
  provider: AskSelection["provider"] | null;
  model: string | null;
  thinkingLevel: AiThinkingLevel | null;
  createdAt: string;
};
export type Conversation = {
  pinnedAt: string | null;
  selection: AskSelection | null;
  lastStatus?: ChatMessage["status"] | null;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  messages?: ChatMessage[];
};
export type ApiKey = {
  scope: "full" | "capture";
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};
export type AiThinkingLevel = "minimal" | "low" | "medium" | "high";
export type AiTaskOption = { model: string };
export type AiAnalysisTaskOption = AiTaskOption & {
  thinkingLevels: AiThinkingLevel[];
};
export type AiProvider = {
  id: "openai" | "cerebras";
  name: string;
  docsUrl: string;
  connected: boolean;
  status: string;
  keyHint: string | null;
  verifiedAt: string | null;
  supportsVision: boolean;
  capabilities: { transcription: boolean; analysis: boolean };
  models: { transcription: string[]; analysis: string[] };
  taskOptions: {
    transcription: AiTaskOption[];
    analysis: AiAnalysisTaskOption[];
  };
};
export type AiSelection = {
  provider: "openai" | "cerebras";
  model: string;
};
export type AiAnalysisSelection = AiSelection & { thinkingLevel: AiThinkingLevel | null };
export type AskSelection = AiAnalysisSelection;
export type AskPreferences = {
  askSourcesPanel: boolean;
  sendWith: "enter" | "mod-enter";
};
export type AiProviderState = {
  providers: AiProvider[];
  selections: {
    transcription: AiSelection | null;
    analysis: AiAnalysisSelection | null;
    ask: AskSelection | null;
  };
  readiness: { capture: boolean; ask: boolean };
};
export type AiDraftSelections = AiProviderState["selections"];
export type AiTestTask = "transcription" | "analysis" | "ask";
export type AiTestCode =
  | "ok"
  | "missing_selection"
  | "invalid_audio"
  | "unsupported_audio"
  | "invalid_audio_data"
  | "credential_error"
  | "model_error"
  | "quota_exceeded"
  | "rate_limited"
  | "timeout"
  | "provider_error"
  | "invalid_response"
  | "busy";
export type AiTestResult = {
  ok: boolean;
  code: AiTestCode;
  checkedAt: string;
  durationMs: number;
  selection: AiAnalysisSelection | AiSelection | null;
};
export type AiTestState = {
  result: AiTestResult | null;
  status: "idle" | "pending" | "stale" | "complete";
};
export type SettingsTopic =
  "overview" | "ai" | "connections" | "api" | "data" | "account" | "people" | "all";

export type AppTab = "inbox" | "library" | "ask" | "activity" | "capture" | "settings";
export type InvitationDetails = {
  role: "admin" | "member";
  expiresAt: string;
};
export type DemoAccount = {
  username: string;
  password: string;
  role: "admin" | "member";
};
