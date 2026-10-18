import { useId, useState } from "react";
import { Copy, Download, KeyRound, PlugZap, Smartphone } from "lucide-react";
import { ActionButton, CardRow, IconBox, Input } from "./components/ui/primitives";
import { shortcutDownloads } from "./shortcut-downloads";

export { shortcutDownloads };

export function ShortcutSetup({ onCreated, keyIds }: { onCreated: () => Promise<void>; keyIds: string[] }) {
  const [credential, setCredential] = useState<{ id: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = useId();
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
        setMessage("This key is no longer accepted. Revoke it above and create a new Shortcut key.");
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
    <div className="st-shortcut" role="region" aria-labelledby={titleId}>
      <CardRow
        leading={<IconBox icon={Smartphone} tone="green" />}
        title={<span id={titleId}>Social Knowledge Shortcut</span>}
        description="Version 6 · signed by Apple · confirms each save and tells you when it is ready"
      >
        <ActionButton
          variant="ghost"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
        >
          Setup guide
        </ActionButton>
        <a
          className="ui-btn ui-btn-primary"
          href={shortcutDownloads.completion}
          rel="noreferrer"
        >
          <Download className="ui-btn-icon" size={14} aria-hidden="true" />
          <span>Add to iPhone</span>
        </a>
      </CardRow>
      <div id={panelId} className="st-shortcut-guide" hidden={!open}>
        <ol className="st-steps">
          <li>
            <strong>Create a Shortcut key.</strong> It can submit links and check receipts, but cannot search or export your archive. Revoke it above at any time.
          </li>
          <li>
            <strong>Add the Shortcut.</strong> Open the download in Shortcuts and paste your key when asked. Omit “Bearer”.
          </li>
          <li>
            <strong>Share a post.</strong> On a reel, tap Share and choose Save-to-Social-Knowledge-Completion-v6. It confirms the save, then checks for completion for up to one minute.
          </li>
        </ol>
        <div className="st-inline-controls">
          <ActionButton icon={KeyRound} disabled={busy || Boolean(active)} onClick={() => void create()}>
            Create Shortcut key
          </ActionButton>
          {active && <>
            <ActionButton icon={Copy} onClick={() => void copy()}>Copy Shortcut key</ActionButton>
            <ActionButton icon={PlugZap} disabled={busy} onClick={() => void testConnection()}>Test connection</ActionButton>
          </>}
        </div>
        {active && (
          <div className="st-field">
            <label htmlFor={`${panelId}-key`}>Shortcut key (shown only this visit)</label>
            <Input
              id={`${panelId}-key`}
              className="st-mono"
              readOnly
              type="text"
              value={credential.token}
              autoComplete="off"
              spellCheck={false}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        )}
        {credential && !active && !busy && <p className="st-guide-note">This key is no longer in your key list. Create a new key to reconnect.</p>}
        {message && (!credential || active) && <p className="st-feedback" role="status">{message}</p>}
        <p className="st-guide-note">
          The connection test checks this browser’s access and your key. Run the Shortcut directly to paste a URL. Unsupported links are retained in Activity; longer captures can finish after the Shortcut stops checking.
        </p>
        <p className="st-guide-note">
          Version 6 · Connects to social-knowledge.stephenjoly.net. The download contains no API key; you add yours in Shortcuts. Prefer a quieter Shortcut?{" "}
          <a href={shortcutDownloads.receipt} rel="noreferrer">Receipt-only version</a>
        </p>
      </div>
    </div>
  );
}
