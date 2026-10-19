import { platformFor } from "../shared/format";

export function PlatformMark({ platform }: { platform: string }) {
  const normalized = platform.toLowerCase();
  if (normalized === "instagram")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.4" cy="6.7" r="1" className="platform-mark-fill" />
      </svg>
    );
  if (normalized === "facebook")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M14 21v-8h3l.5-3H14V8.2c0-.9.3-1.7 1.8-1.7H18V3.8c-.7-.1-1.5-.2-2.4-.2-2.5 0-4.3 1.6-4.3 4.4v2H8.5v3h2.8v8H14Z"
          className="platform-mark-fill"
        />
      </svg>
    );
  return <span aria-hidden="true">↗</span>;
}

export function PlatformIcon({ url }: { url: string }) {
  const platform = platformFor(url);
  return platform === "instagram" ? (
    <span className="platform-icon instagram" aria-label="Instagram">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle className="fill" cx="17.5" cy="6.5" r="1" />
      </svg>
    </span>
  ) : (
    <span className="platform-icon facebook" aria-label="Facebook">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 8h3V4.4c-.5-.1-2.2-.4-4.2-.4C8.8 4 6 6.4 6 10.8V14H2v4h4v6h5v-6h4l.7-4H11v-2.8C11 9.3 11.8 8 14 8Z" />
      </svg>
    </span>
  );
}
