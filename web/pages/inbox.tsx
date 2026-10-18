import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Capture, InboxSortKey } from "../shared/types";
import { assetUrl } from "../shared/api";
import { PlatformMark } from "../components/platform";

export const inboxSortOptions: Array<{
  key: InboxSortKey;
  label: string;
  ascending: string;
  descending: string;
}> = [
  {
    key: "savedAt",
    label: "Saved date",
    ascending: "Oldest first",
    descending: "Newest first",
  },
  {
    key: "title",
    label: "Title",
    ascending: "Title A–Z",
    descending: "Title Z–A",
  },
  {
    key: "source",
    label: "Source",
    ascending: "Source A–Z",
    descending: "Source Z–A",
  },
  {
    key: "category",
    label: "Category",
    ascending: "Category A–Z",
    descending: "Category Z–A",
  },
  {
    key: "topic",
    label: "Topic",
    ascending: "Topic A–Z",
    descending: "Topic Z–A",
  },
];

function captureSource(capture: Capture) {
  const platform = capture.platform
    ? `${capture.platform.slice(0, 1).toUpperCase()}${capture.platform.slice(1)}`
    : "Unknown platform";
  return capture.creator ? `${platform} · ${capture.creator}` : platform;
}

function formatCaptureDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function CaptureCard({
  capture,
  onOpen,
  categoryLabel,
}: {
  capture: Capture;
  onOpen: (id: string) => void;
  categoryLabel: string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const thumb = capture.assets.find(
    (a) => a.kind === "thumbnail" || a.kind === "image",
  );
  return (
    <button
      type="button"
      className="capture-card inbox-tile"
      onClick={() => onOpen(capture.id)}
    >
      <span className="inbox-tile-media">
        {thumb && !imageFailed ? (
          <img
            src={assetUrl(capture.id, thumb.id)}
            alt=""
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="placeholder" aria-hidden="true">
            {capture.platform.slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>
      <span className="card-body">
        <span className="inbox-tile-source">
          <span>
            <PlatformMark platform={capture.platform} />
            {captureSource(capture)}
          </span>
          <time dateTime={capture.createdAt}>
            {formatCaptureDate(capture.createdAt)}
          </time>
        </span>
        <strong className="inbox-tile-title">{capture.title}</strong>
        <span className="inbox-tile-summary">
          {capture.synopsis || "No summary is available yet."}
        </span>
        <span className="inbox-tile-footer">
          {categoryLabel && <span>Category: {categoryLabel}</span>}
          {capture.topics.slice(0, 1).map((topic) => (
            <span className="inbox-topic" key={topic}>
              {topic}
            </span>
          ))}
          <span className="inbox-open-detail">
            Open details <ChevronRight aria-hidden="true" />
          </span>
        </span>
      </span>
    </button>
  );
}

export function CaptureTableRow({
  capture,
  onOpen,
  categoryLabel,
}: {
  capture: Capture;
  onOpen: (id: string) => void;
  categoryLabel: string | null;
}) {
  return (
    <tr>
      <td>
        <button
          type="button"
          className="inbox-table-title"
          onClick={() => onOpen(capture.id)}
        >
          {capture.title}
          <ChevronRight aria-hidden="true" />
        </button>
      </td>
      <td>
        <time dateTime={capture.createdAt}>
          {formatCaptureDate(capture.createdAt)}
        </time>
      </td>
      <td>{captureSource(capture)}</td>
      <td>{categoryLabel || "—"}</td>
      <td>{capture.topics[0] || "—"}</td>
    </tr>
  );
}

export function CaptureMobileRow({
  capture,
  onOpen,
  categoryLabel,
}: {
  capture: Capture;
  onOpen: (id: string) => void;
  categoryLabel: string | null;
}) {
  return (
    <article className="inbox-mobile-row">
      <button type="button" onClick={() => onOpen(capture.id)}>
        <strong>
          {capture.title}
          <ChevronRight aria-hidden="true" />
        </strong>
        <span>
          <b>Saved date</b>
          <time dateTime={capture.createdAt}>
            {formatCaptureDate(capture.createdAt)}
          </time>
        </span>
        <span>
          <b>Source</b>
          {captureSource(capture)}
        </span>
        <span>
          <b>Category</b>
          {categoryLabel || "—"}
        </span>
        <span>
          <b>Topic</b>
          {capture.topics[0] || "—"}
        </span>
      </button>
    </article>
  );
}

export function InboxLoadingCards() {
  return (
    <div className="inbox-loading-cards" aria-label="Loading captures">
      {[1, 2, 3, 4].map((index) => (
        <div className="inbox-loading-card" key={index} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
