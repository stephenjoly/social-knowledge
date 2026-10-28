// One wall-clock budget covers planning, retrieval, compaction and generation.
export const ASK_ATTEMPT_TIMEOUT_MS = 180_000;
// Recovery must leave active attempts their full budget plus a scheduling grace.
export const ASK_STALE_ATTEMPT_MS = ASK_ATTEMPT_TIMEOUT_MS + 60_000;
