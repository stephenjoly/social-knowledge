import { Download } from "lucide-react";

// Pin the signed, native-tested release; branch changes must not replace it.
const releaseRoot =
  "https://raw.githubusercontent.com/stephenjoly/social-knowledge/e3c7c00b9ba53a24a699add68efb8698c21d68d9/shortcuts/";

export const shortcutDownloads = {
  completion: `${releaseRoot}Save-to-Social-Knowledge-Completion-v6.shortcut`,
  receipt: `${releaseRoot}Save-to-Social-Knowledge-Receipt-v6.shortcut`,
};

export function ShortcutSetup() {
  return (
    <section className="shortcut-setup" aria-labelledby="shortcut-setup-title">
      <h3 id="shortcut-setup-title">Save reels from your iPhone</h3>
      <p>
        Share a reel directly to Social Knowledge. The shortcut confirms your URL
        was saved, then checks for capture completion for up to one minute.
      </p>
      <div className="shortcut-download-actions">
        <a className="shortcut-download" href={shortcutDownloads.completion} rel="noreferrer">
          <Download size={16} aria-hidden="true" />
          Download iPhone Shortcut
        </a>
        <a href={shortcutDownloads.receipt} rel="noreferrer">Receipt-only version</a>
      </div>
      <ol>
        <li>Create an API key below and copy it.</li>
        <li>Open the downloaded file in Shortcuts and paste your key when asked. Omit “Bearer”.</li>
        <li>On a reel, tap Share and choose Save-to-Social-Knowledge-Completion-v6.</li>
      </ol>
      <p>
        Run it directly to paste a URL. Unsupported links are retained in Activity;
        longer captures can finish after the shortcut stops checking.
      </p>
      <p className="shortcut-release-note">
        Version 6 · Connects to social-knowledge.stephenjoly.net. The download
        contains no API key; you add yours in Shortcuts.
      </p>
    </section>
  );
}
