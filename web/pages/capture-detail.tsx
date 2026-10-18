import { useEffect, useState } from "react";
import type { Capture } from "../shared/types";
import { api, assetUrl } from "../shared/api";

export function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const [capture, setCapture] = useState<Capture | null>(null);
  useEffect(() => {
    void api<{ capture: Capture }>(`/api/v1/captures/${id}`).then((x) =>
      setCapture(x.capture),
    );
  }, [id]);
  if (!capture)
    return (
      <div className="drawer">
        <p>Loading…</p>
      </div>
    );
  const video = capture.assets.find((a) => a.kind === "video");
  const images = capture.assets.filter((a) => a.kind === "image");
  const hasStructuredTakeaways = Boolean(capture.analysis.takeaways?.length);
  const takeaways = hasStructuredTakeaways
    ? capture.analysis.takeaways!
    : capture.analysis.recommendations;
  return (
    <div className="scrim" onClick={onClose}>
      <article className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>
          ×
        </button>
        {video && (
          <video
            controls
            preload="metadata"
            poster={
              capture.assets.find((a) => a.kind === "thumbnail")
                ? assetUrl(
                    capture.id,
                    capture.assets.find((a) => a.kind === "thumbnail")!.id,
                  )
                : undefined
            }
            src={assetUrl(capture.id, video.id)}
          />
        )}
        <div className="gallery">
          {images.map((image) => (
            <img key={image.id} src={assetUrl(capture.id, image.id)} alt="" />
          ))}
        </div>
        <div className="detail">
          <div className="eyebrow">
            {capture.platform} · {capture.creator || "Unknown creator"}
          </div>
          <h1>{capture.title}</h1>
          <p className="lead">{capture.synopsis}</p>
          {capture.whyUseful && (
            <>
              <h2>Bottom line</h2>
              <p className="bottom-line">{capture.whyUseful}</p>
            </>
          )}
          <h2>Key takeaways</h2>
          <ul className="takeaways">
            {takeaways.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          {hasStructuredTakeaways &&
            capture.analysis.recommendations.length > 0 && (
              <>
                <h2>Actions & recommendations</h2>
                <ul>
                  {capture.analysis.recommendations.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </>
            )}
          {capture.analysis.entities.length > 0 && (
            <details>
              <summary>Referenced people, places & products</summary>
              <div className="entities">
                {capture.analysis.entities.map((x) => (
                  <div key={x.name}>
                    <strong>{x.name}</strong>
                    <span>
                      {x.type}
                      {x.location ? ` · ${x.location}` : ""}
                    </span>
                    <p>{x.description}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
          <h2>Evidence</h2>
          <ul>
            {capture.analysis.evidence.map((x, i) => (
              <li key={i}>
                {x.claim} <em>({x.source})</em>
                {x.quote ? ` — “${x.quote}”` : ""}
              </li>
            ))}
          </ul>
          <details>
            <summary>Source description</summary>
            <p className="preserve">{capture.description || "Unavailable"}</p>
          </details>
          <details>
            <summary>Transcript</summary>
            <p className="preserve">{capture.transcript || "Unavailable"}</p>
          </details>
          {capture.translatedTranscript && (
            <details open>
              <summary>
                Translation · {capture.sourceLanguage || "Unknown language"} →{" "}
                {capture.translationLanguage}
              </summary>
              <p className="preserve">{capture.translatedTranscript}</p>
            </details>
          )}
          <details>
            <summary>
              Selected comments
              {capture.comments.length ? ` (${capture.comments.length})` : ""}
            </summary>
            {capture.comments.length ? (
              <ul className="comment-list">
                {capture.comments.map((comment, index) => (
                  <li key={`${comment.author ?? "unknown"}-${index}`}>
                    <strong>
                      {comment.isPinned ? "📌 " : ""}
                      {comment.author ?? "Unknown"}
                    </strong>
                    <p>{comment.text}</p>
                    {comment.likeCount !== null && (
                      <small>{comment.likeCount} likes</small>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No comments were available from the platform.</p>
            )}
          </details>
          <p>
            <a href={capture.sourceUrl} target="_blank" rel="noreferrer">
              Open original post ↗
            </a>
          </p>
          <small>Markdown: {capture.notePath}</small>
        </div>
      </article>
    </div>
  );
}
