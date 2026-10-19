import { useRef, type FormEvent } from "react";
import {
  Archive,
  Bookmark,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Hourglass,
  Link,
  RotateCcw,
  Settings2,
  Smartphone,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ActivityJob } from "../shared/types";
import { ActionButton, cx } from "./ui/primitives";
import { useDialogFocus } from "./use-dialog-focus";

const captureSteps = ["Fetch post", "Transcribe", "Analyse", "File in knowledge base"];

/** Names the post a link points at, using the same hosts the server accepts. */
export function detectPost(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  const path = url.pathname;
  if (host === "instagram.com") {
    if (/^\/(reel|reels)\//.test(path)) return "Instagram reel";
    if (/^\/(p|tv)\//.test(path)) return "Instagram post";
    return null;
  }
  if (host === "facebook.com" || host === "fb.watch") {
    if (host === "fb.watch" || /\/(videos|watch)\b/.test(path) || url.searchParams.has("v"))
      return "Facebook video";
    if (/\/(reel|share\/r)\//.test(path)) return "Facebook reel";
    if (path.length > 1) return "Facebook post";
  }
  return null;
}

/** True for a parseable web link on a site that is not Instagram or Facebook. */
function isOtherSite(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.replace(/^(www|m)\./, "");
    return !["instagram.com", "facebook.com", "fb.watch"].includes(host);
  } catch {
    return false;
  }
}

/**
 * What a submission actually did. Only `queued` and `requeued` start new work;
 * every other outcome retains or reuses the link without processing it.
 */
export type CaptureOutcome =
  | "queued"
  | "requeued"
  | "alreadyQueued"
  | "processing"
  | "saved"
  | "unsupported"
  | "archived"
  | "setup"
  | "failed";

export type CaptureReceipt = {
  outcome: CaptureOutcome;
  created: boolean;
  job: ActivityJob;
};

export function captureOutcome(result: {
  created: boolean;
  retried?: boolean;
  job: ActivityJob;
}): CaptureOutcome {
  const { job } = result;
  if (job.status === "complete") return "saved";
  if (job.errorCode === "unsupported_platform")
    return job.archivedAt ? "archived" : "unsupported";
  if (job.status === "failed")
    return job.errorCode === "ai_setup_required" ? "setup" : "failed";
  if (result.retried) return "requeued";
  if (result.created) return "queued";
  return job.status === "queued" ? "alreadyQueued" : "processing";
}

export function processingWillRun(outcome: CaptureOutcome) {
  return outcome === "queued" || outcome === "requeued";
}

const receiptCopy: Record<
  CaptureOutcome,
  { title: (created: boolean) => string; description: string; icon: LucideIcon; tone: "ok" | "info" | "warn" }
> = {
  queued: {
    title: () => "Post queued",
    description: "It’s queued and will be processed shortly. It appears in your Inbox when it’s ready.",
    icon: CircleCheck,
    tone: "ok",
  },
  requeued: {
    title: () => "Retrying this post",
    description: "You saved this link before and it failed. The earlier attempt is queued again.",
    icon: RotateCcw,
    tone: "ok",
  },
  alreadyQueued: {
    title: () => "Already queued",
    description: "This link is already waiting in the queue and will be processed shortly. Nothing new was added.",
    icon: Hourglass,
    tone: "info",
  },
  processing: {
    title: () => "Already processing",
    description: "This link is already being processed. Nothing new was added.",
    icon: Hourglass,
    tone: "info",
  },
  saved: {
    title: () => "Already in your archive",
    description: "This post was saved earlier. Nothing new will run.",
    icon: CircleCheck,
    tone: "info",
  },
  unsupported: {
    title: (created) => (created ? "Bookmark saved" : "Already saved as a bookmark"),
    description:
      "Only Instagram and Facebook posts are processed. This link is kept as a bookmark in Activity; nothing will be downloaded or analysed.",
    icon: Bookmark,
    tone: "info",
  },
  archived: {
    title: () => "Already saved as an archived bookmark",
    description:
      "This link was saved earlier and archived. Nothing new was added. Restore it from Activity to show it again.",
    icon: Archive,
    tone: "info",
  },
  setup: {
    title: () => "Link saved — AI setup needed",
    description:
      "Your link is kept in Activity. Nothing will be processed until transcription and analysis are set up. Then retry it in one click.",
    icon: Settings2,
    tone: "warn",
  },
  failed: {
    title: () => "Already saved — needs attention",
    description:
      "This link was saved earlier but its capture failed. Nothing new was added. Activity shows why and how to retry.",
    icon: CircleAlert,
    tone: "warn",
  },
};

export function receiptTitle(receipt: CaptureReceipt) {
  return receiptCopy[receipt.outcome].title(receipt.created);
}

export function CaptureDialog({
  url,
  note,
  onUrlChange,
  onNoteChange,
  submitting,
  receipt,
  message,
  error,
  onSubmit,
  onClose,
  onCaptureAnother,
  onViewActivity,
  onSetUpAi,
  onSetUpIphone,
}: {
  url: string;
  note: string;
  onUrlChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  submitting: boolean;
  receipt: CaptureReceipt | null;
  message: string;
  error: boolean;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  onCaptureAnother: () => void;
  onViewActivity: (job: ActivityJob) => void;
  onSetUpAi: (job: ActivityJob | null) => void;
  onSetUpIphone: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, onClose);
  const detected = detectPost(url);
  const otherSite = !detected && isOtherSite(url);
  const copy = receipt ? receiptCopy[receipt.outcome] : null;
  const title = receipt ? receiptTitle(receipt) : "Capture a post";
  const ReceiptIcon = copy?.icon ?? CircleCheck;
  return (
    <div className="capture-scrim" role="presentation" onMouseDown={onClose}>
      <section
        ref={ref}
        className="capture-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-title"
        aria-describedby="capture-description"
        data-outcome={receipt?.outcome}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="capture-dialog-head">
          <div>
            <h2 id="capture-title">{title}</h2>
            <p id="capture-description">
              {copy
                ? copy.description
                : "Paste an Instagram or Facebook link to save it to your archive."}
            </p>
          </div>
          <button type="button" className="capture-dialog-close" aria-label="Close capture" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {receipt && copy ? (
          <>
            <div className="capture-dialog-body">
              <p className={cx("capture-dialog-confirmation", copy.tone)} role="status">
                <ReceiptIcon size={15} aria-hidden="true" />
                <span>
                  <span className="capture-receipt-label">{receiptStatus(receipt.outcome)}</span>
                  <span className="capture-receipt-link">{receiptLink(receipt.job)}</span>
                </span>
              </p>
              {processingWillRun(receipt.outcome) && <CaptureSteps />}
            </div>
            <div className="capture-dialog-foot">
              <span className="capture-dialog-tip">
                {processingWillRun(receipt.outcome) || (receipt.outcome === "processing" || receipt.outcome === "alreadyQueued")
                  ? "Progress shows in Activity."
                  : receipt.outcome === "setup"
                    ? "Retry from Settings or Activity once setup is saved."
                    : null}
              </span>
              <ActionButton variant="ghost" onClick={onCaptureAnother}>Capture another</ActionButton>
              {receipt.outcome === "setup" ? (
                <>
                  <ActionButton onClick={() => onViewActivity(receipt.job)}>View in Activity</ActionButton>
                  <ActionButton variant="primary" data-autofocus onClick={() => onSetUpAi(receipt.job)}>
                    Set up AI
                  </ActionButton>
                </>
              ) : (
                <ActionButton variant="primary" data-autofocus onClick={() => onViewActivity(receipt.job)}>
                  {processingWillRun(receipt.outcome) || (receipt.outcome === "processing" || receipt.outcome === "alreadyQueued")
                    ? "View progress"
                    : receipt.outcome === "archived"
                      ? "View archived bookmark"
                      : "View in Activity"}
                </ActionButton>
              )}
            </div>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate={false}>
            <div className="capture-dialog-body">
              <div className="capture-field">
                <label htmlFor="capture-url">Post link</label>
                <span className="capture-url">
                  <Link size={15} aria-hidden="true" />
                  <input
                    id="capture-url"
                    data-autofocus
                    type="url"
                    required
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    value={url}
                    aria-invalid={error || undefined}
                    aria-describedby="capture-url-status"
                    onChange={(event) => onUrlChange(event.target.value)}
                    placeholder="https://www.instagram.com/reel/…"
                  />
                </span>
                <span id="capture-url-status" className="capture-url-status">
                  {error && message ? (
                    <span className="capture-url-error" role="alert">
                      <CircleAlert size={13} aria-hidden="true" />
                      {message}
                    </span>
                  ) : detected ? (
                    <span className="capture-url-detected">
                      <CircleCheck size={13} aria-hidden="true" />
                      {detected} detected
                    </span>
                  ) : otherSite ? (
                    <span className="capture-url-note">
                      <Bookmark size={13} aria-hidden="true" />
                      Not Instagram or Facebook: it will be kept as a bookmark, not processed.
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="capture-field">
                <label htmlFor="capture-note">
                  Note for your future self <span className="capture-optional">Optional</span>
                </label>
                <textarea
                  id="capture-note"
                  value={note}
                  maxLength={2000}
                  onChange={(event) => onNoteChange(event.target.value)}
                  placeholder="Why are you saving this? e.g. “Try this before the trip”"
                />
              </div>
              {!otherSite && <CaptureSteps />}
              {submitting && <span className="sr-only" role="status">Submitting…</span>}
            </div>
            <div className="capture-dialog-foot">
              <button type="button" className="capture-dialog-tip capture-dialog-tip-link" onClick={onSetUpIphone}>
                <Smartphone size={13} aria-hidden="true" />
                <span className="capture-tip-action">Set up iPhone sharing</span>
              </button>
              <ActionButton variant="ghost" onClick={onClose}>Cancel</ActionButton>
              <ActionButton variant="primary" type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save to archive"}
              </ActionButton>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function receiptStatus(outcome: CaptureOutcome) {
  switch (outcome) {
    case "queued":
    case "requeued":
      return "Queued for processing";
    case "alreadyQueued":
      return "Already in the queue";
    case "processing":
      return "Already in progress";
    case "saved":
      return "Saved earlier";
    case "unsupported":
      return "Kept as a bookmark";
    case "archived":
      return "Archived bookmark";
    case "setup":
      return "Saved, waiting for AI setup";
    case "failed":
      return "Saved earlier, capture failed";
  }
}

/** The retained link, shown without the scheme so users can confirm what was kept. */
function receiptLink(job: ActivityJob) {
  if (job.displayTitle) return job.displayTitle;
  try {
    const parsed = new URL(job.normalizedUrl);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return "Your link";
  }
}

function CaptureSteps() {
  return (
    <ol className="capture-steps" aria-label="What happens next">
      {captureSteps.map((step, index) => (
        <li key={step}>
          {index > 0 && <ChevronRight size={12} aria-hidden="true" />}
          {step}
        </li>
      ))}
    </ol>
  );
}
