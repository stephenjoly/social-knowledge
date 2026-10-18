import { useRef, type FormEvent } from "react";
import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Link,
  Smartphone,
  X,
} from "lucide-react";
import { ActionButton } from "./ui/primitives";
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

export function CaptureDialog({
  url,
  note,
  onUrlChange,
  onNoteChange,
  submitting,
  submitted,
  message,
  error,
  onSubmit,
  onClose,
  onCaptureAnother,
  onViewActivity,
}: {
  url: string;
  note: string;
  onUrlChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  submitting: boolean;
  submitted: boolean;
  message: string;
  error: boolean;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  onCaptureAnother: () => void;
  onViewActivity: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, onClose);
  const detected = detectPost(url);
  const title = submitted ? "Post submitted" : "Capture a post";
  return (
    <div className="capture-scrim" role="presentation" onMouseDown={onClose}>
      <section
        ref={ref}
        className="capture-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-title"
        aria-describedby="capture-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="capture-dialog-head">
          <div>
            <h2 id="capture-title">{title}</h2>
            <p id="capture-description">
              {submitted
                ? "Your post is in the processing queue."
                : "Paste an Instagram or Facebook link to save it to your archive."}
            </p>
          </div>
          <button type="button" className="capture-dialog-close" aria-label="Close capture" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {submitted ? (
          <>
            <div className="capture-dialog-body">
              <p className="capture-dialog-confirmation" role="status">
                <CircleCheck size={15} aria-hidden="true" />
                {message}
              </p>
              <CaptureSteps />
            </div>
            <div className="capture-dialog-foot">
              <span className="capture-dialog-tip">Progress shows in Activity.</span>
              <ActionButton variant="ghost" onClick={onCaptureAnother}>Capture another</ActionButton>
              <ActionButton variant="primary" data-autofocus onClick={onViewActivity}>View activity</ActionButton>
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
              <CaptureSteps />
              {submitting && <span className="sr-only" role="status">Submitting…</span>}
            </div>
            <div className="capture-dialog-foot">
              <span className="capture-dialog-tip">
                <Smartphone size={13} aria-hidden="true" />
                Tip: share straight from iPhone
              </span>
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
