import { useState } from "react";
import { Download } from "lucide-react";

// Pin the signed, native-tested release; branch changes must not replace it.
const releaseRoot =
  "https://raw.githubusercontent.com/stephenjoly/social-knowledge/e3c7c00b9ba53a24a699add68efb8698c21d68d9/shortcuts/";
export const shortcutDownloads = {
  completion: `${releaseRoot}Save-to-Social-Knowledge-Completion-v6.shortcut`,
  receipt: `${releaseRoot}Save-to-Social-Knowledge-Receipt-v6.shortcut`,
};

export function ShortcutSetup({ onCreated, keyIds }: { onCreated: () => Promise<void>; keyIds: string[] }) {
  const [credential, setCredential] = useState<{ id: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = credential && keyIds.includes(credential.id);
  async function create() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "iPhone Shortcut", scope: "capture" }),
      });
      if (!response.ok) throw new Error("create_failed");
      const result = await response.json() as { token: string; apiKey: { id: string } };
      setCredential({ id: result.apiKey.id, token: result.token });
      await onCreated();
      setMessage("Your capture-only key is ready. Copy it, then paste it when Shortcuts asks.");
    } catch {
      setMessage("Could not create the key. Try again.");
    } finally { setBusy(false); }
  }
  async function copy() {
    if (!credential) return;
    try {
      await navigator.clipboard.writeText(credential.token);
      setMessage("Key copied. Download the Shortcut and paste the key when asked.");
    } catch {
      setMessage("Clipboard access is unavailable. Select and copy the key below.");
    }
  }
  async function testConnection() {
    if (!credential) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/shortcut/connection", {
        headers: { Authorization: `Bearer ${credential.token}` },
        credentials: "omit",
        cache: "no-store",
      });
      if (response.status === 401) {
        setMessage("This key is no longer accepted. Revoke it below and create a new Shortcut key.");
        return;
      }
      if (!response.ok) throw new Error("connection_failed");
      const result = await response.json() as { captureReady: boolean };
      setMessage(result.captureReady
        ? "Key accepted. AI setup is configured. No capture was created."
        : "Key accepted. Finish Transcription and Analysis setup in AI settings before capturing media. No capture was created.");
    } catch {
      setMessage("Could not check the connection. Check your network and try again.");
    } finally { setBusy(false); }
  }
  return (
    <section className="shortcut-setup" aria-labelledby="shortcut-setup-title">
      <h3 id="shortcut-setup-title">Save reels from your iPhone</h3>
      <p>Share a reel directly to Social Knowledge. The shortcut confirms your URL was saved, then checks for capture completion for up to one minute.</p>
      <p>Create a dedicated key that can submit links and check receipts, but cannot search or export your archive. Revoke it below at any time.</p>
      <div className="shortcut-download-actions">
        <button type="button" disabled={busy || Boolean(active)} onClick={() => void create()}>Create Shortcut key</button>
        {active && <>
          <button type="button" onClick={() => void copy()}>Copy Shortcut key</button>
          <button type="button" disabled={busy} onClick={() => void testConnection()}>Test connection</button>
        </>}
      </div>
      {active && <label>Shortcut key (shown only this visit)
        <input readOnly type="text" value={credential.token} autoComplete="off" spellCheck={false} onFocus={(event) => event.currentTarget.select()} />
      </label>}
      {credential && !active && !busy && <p>This key is no longer in your key list. Create a new key to reconnect.</p>}
      {message && <p role="status">{message}</p>}
      <p>The connection test checks this browser’s access and your key. After installing, share a link from your iPhone to verify the Shortcut itself.</p>
      <div className="shortcut-download-actions">
        <a className="shortcut-download" href={shortcutDownloads.completion} rel="noreferrer">
          <Download size={16} aria-hidden="true" />Download iPhone Shortcut
        </a>
        <a href={shortcutDownloads.receipt} rel="noreferrer">Receipt-only version</a>
      </div>
      <ol>
        <li>Create a Shortcut key above and copy it.</li>
        <li>Open the downloaded file in Shortcuts and paste your key when asked. Omit “Bearer”.</li>
        <li>On a reel, tap Share and choose Save-to-Social-Knowledge-Completion-v6.</li>
      </ol>
      <p>Run it directly to paste a URL. Unsupported links are retained in Activity; longer captures can finish after the shortcut stops checking.</p>
      <p className="shortcut-release-note">Version 6 · Connects to social-knowledge.stephenjoly.net. The download contains no API key; you add yours in Shortcuts.</p>
    </section>
  );
}
