import { FormEvent, useEffect, useRef, useState } from "react";
import { MoreHorizontal, X } from "lucide-react";

export type AccountUser = {
  id: string;
  username: string;
  displayName: string | null;
  avatarColor: string | null;
  role: string;
  suspendedAt: string | null;
  createdAt?: string;
};

type Invitation = {
  id: string;
  role: "admin" | "member";
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
};

async function request<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error || body.message || "Request failed");
  return body as T;
}

function readableError(error: unknown, fallback: string) {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    username_taken: "That username is already in use. Choose another one.",
    current_password_incorrect: "The current password is incorrect.",
    invalid_current_password: "The current password is incorrect.",
    password_too_short: "The new password must contain at least 12 characters.",
    cannot_suspend_self: "You cannot suspend your own account.",
    last_admin: "At least one active administrator is required.",
  };
  return (
    messages[code] || (code && !/^[a-z0-9_]+$/.test(code) ? code : fallback)
  );
}

const initials = (user: Pick<AccountUser, "displayName" | "username">) =>
  (user.displayName || user.username)
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const joined = (value?: string) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : "—";

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    panel.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab" || !panel.current) return;
      const controls = Array.from(
        panel.current.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
        ),
      );
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === panel.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === panel.current)
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.requestAnimationFrame(() => returnFocus.current?.focus());
    };
  }, []);
  return (
    <div
      className="account-dialog-layer"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={panel}
        className="account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-dialog-title"
        tabIndex={-1}
      >
        <header>
          <h2 id="account-dialog-title">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function MyAccount({
  user,
  onUserChange,
  onSignOut,
  onOpenData,
}: {
  user: AccountUser;
  onUserChange: (user: AccountUser) => void;
  onSignOut: () => Promise<void>;
  onOpenData: () => void;
}) {
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [username, setUsername] = useState(user.username);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarPending, setAvatarPending] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const colors = ["#315a48", "#355f78", "#73598d", "#9a5848", "#8a6a2f"];
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const result = await request<{ user: AccountUser }>(
        "/api/v1/account/profile",
        {
          method: "PATCH",
          body: JSON.stringify({
            displayName: displayName.trim() || null,
            username: username.trim(),
          }),
        },
      );
      onUserChange(result.user);
      setMessage("Profile saved.");
    } catch (error) {
      setMessage(readableError(error, "Profile could not be saved."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="account-page-stack">
      <section className="settings-card profile-card">
        <div className="account-card-heading">
          <div>
            <h2>Profile</h2>
            <p>How you appear in your personal workspace.</p>
          </div>
        </div>
        <form onSubmit={saveProfile} className="profile-form">
          <div className="profile-identity">
            <span
              className="profile-avatar"
              style={{ background: user.avatarColor || "#315a48" }}
            >
              {initials({ displayName, username })}
            </span>
            <div>
              <strong>{displayName || username}</strong>
              <small>
                {user.role === "admin" ? "Administrator" : "Member"} · Joined{" "}
                {joined(user.createdAt)}
              </small>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setAvatarError("");
                setAvatarOpen(true);
              }}
            >
              Change avatar
            </button>
          </div>
          <div className="profile-fields">
            <label>
              Display name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label>
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
              <small>Used to sign in to your account.</small>
            </label>
            <button disabled={saving || !username.trim()}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
        {message && (
          <p className="action-feedback" role="status">
            {message}
          </p>
        )}
      </section>
      <section className="settings-card account-rows">
        <h2>Sign-in &amp; security</h2>
        <div>
          <span>
            <strong>Password</strong>
            <small>Update the password used to access your account.</small>
          </span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setPasswordOpen(true)}
          >
            Change password
          </button>
        </div>
        <div>
          <span>
            <strong>Current session</strong>
            <small>This device</small>
          </span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void onSignOut()}
          >
            Sign out
          </button>
        </div>
      </section>
      <section className="settings-card archive-row">
        <div>
          <h2>Your archive</h2>
          <p>Manage downloads and exports from Data &amp; Export.</p>
          <small>
            Your captures, connections, and API keys belong to your account.
          </small>
        </div>
        <button type="button" className="secondary-button" onClick={onOpenData}>
          Data &amp; Export →
        </button>
      </section>
      {passwordOpen && (
        <PasswordDialog
          onClose={() => setPasswordOpen(false)}
          onChanged={onSignOut}
        />
      )}
      {avatarOpen && (
        <Dialog
          title="Choose avatar color"
          onClose={() => setAvatarOpen(false)}
        >
          <div className="avatar-picker">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Use ${color}`}
                aria-pressed={user.avatarColor === color}
                disabled={avatarPending}
                style={{ background: color }}
                onClick={async () => {
                  try {
                    setAvatarPending(true);
                    setAvatarError("");
                    const result = await request<{ user: AccountUser }>(
                      "/api/v1/account/profile",
                      {
                        method: "PATCH",
                        body: JSON.stringify({ avatarColor: color }),
                      },
                    );
                    onUserChange(result.user);
                    setAvatarOpen(false);
                  } catch (error) {
                    setAvatarError(
                      readableError(error, "Avatar color could not be saved."),
                    );
                  } finally {
                    setAvatarPending(false);
                  }
                }}
              />
            ))}
          </div>
          {avatarError && (
            <p className="dialog-error" role="alert">
              {avatarError}
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}

function PasswordDialog({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog title="Change password" onClose={onClose}>
      <form
        className="dialog-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError("");
          try {
            await request("/api/v1/account/password", {
              method: "POST",
              body: JSON.stringify({ currentPassword, newPassword }),
            });
            await onChanged();
          } catch (err) {
            setError(readableError(err, "Password could not be changed."));
            setPending(false);
          }
        }}
      >
        <p className="password-session-note">
          Changing your password signs out every device, including this one.
        </p>
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNext(e.target.value)}
            minLength={12}
            required
          />
          <small>Use at least 12 characters.</small>
        </label>
        {error && (
          <p role="alert" className="dialog-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button disabled={pending}>
            {pending ? "Changing…" : "Change password and sign out"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function RoleMenu({
  person,
  pending,
  onChange,
}: {
  person: AccountUser;
  pending: boolean;
  onChange: (role: "admin" | "member") => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const choose = (role: "admin" | "member") => {
    setOpen(false);
    onChange(role);
    window.requestAnimationFrame(() => trigger.current?.focus());
  };
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>("[role='menuitemradio']")?.focus();
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (
        event instanceof MouseEvent &&
        root.current?.contains(event.target as Node)
      )
        return;
      setOpen(false);
      if (event instanceof KeyboardEvent) trigger.current?.focus();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="role-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {person.role === "admin" ? "Administrator" : "Member"}{" "}
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div
          className="role-menu-popover"
          role="menu"
          aria-label={`Role for ${person.displayName || person.username}`}
          onKeyDown={(event) => {
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "[role='menuitemradio']",
              ),
            );
            const current = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            let next = current;
            if (event.key === "ArrowDown") next = (current + 1) % items.length;
            else if (event.key === "ArrowUp")
              next = (current - 1 + items.length) % items.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = items.length - 1;
            else return;
            event.preventDefault();
            items[next]?.focus();
          }}
        >
          {(["admin", "member"] as const).map((role) => (
            <button
              key={role}
              type="button"
              role="menuitemradio"
              aria-checked={person.role === role}
              onClick={() => choose(role)}
            >
              <strong>
                {role === "admin" ? "Administrator" : "Member"}
                {person.role === role ? " · current" : ""}
              </strong>
              <small>
                {role === "admin"
                  ? "Can invite people, change roles, and suspend account access."
                  : "Captures and manages their own archive. Can't manage other accounts."}
              </small>
            </button>
          ))}
          <p>
            Applies immediately. Personal archives and credentials stay private
            to each account.
          </p>
        </div>
      )}
    </div>
  );
}

export function PeopleAccess({
  currentUser,
  onMyAccount,
}: {
  currentUser: AccountUser;
  onMyAccount: () => void;
}) {
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [ack, setAck] = useState(false);
  const [message, setMessage] = useState("");
  const [fallbackUrl, setFallbackUrl] = useState("");
  const [invitationLinks, setInvitationLinks] = useState<
    Record<string, string>
  >({});
  const [menu, setMenu] = useState<string | null>(null);
  const [suspend, setSuspend] = useState<AccountUser | null>(null);
  const [suspendError, setSuspendError] = useState("");
  const [pending, setPending] = useState(false);
  const [invitationPending, setInvitationPending] = useState<string | null>(
    null,
  );
  const actionTrigger = useRef<HTMLButtonElement>(null);
  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [u, i] = await Promise.all([
        request<{ users: AccountUser[] }>("/api/v1/admin/users"),
        request<{ invitations: Invitation[] }>("/api/v1/admin/invitations"),
      ]);
      setUsers(u.users);
      setInvitations(i.invitations);
    } catch {
      setLoadError("People and invitations could not be loaded.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!menu) return;
    window.requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(".account-actions-menu [role='menuitem']")
        ?.focus(),
    );
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (
        e instanceof MouseEvent &&
        (e.target as Element).closest(".row-actions")
      )
        return;
      setMenu(null);
      if (e instanceof KeyboardEvent) actionTrigger.current?.focus();
    };
    document.addEventListener("keydown", close);
    document.addEventListener("mousedown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("mousedown", close);
    };
  }, [menu]);
  const updateUser = async (
    target: AccountUser,
    patch: { role?: string; suspended?: boolean },
  ) => {
    setPending(true);
    setMessage("");
    try {
      const result = await request<{ user: AccountUser }>(
        `/api/v1/admin/users/${target.id}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      setUsers((all) => all.map((u) => (u.id === target.id ? result.user : u)));
      setMessage("Account updated.");
      setMenu(null);
      setSuspend(null);
    } catch (e) {
      const detail = readableError(e, "Account could not be updated.");
      if (suspend) setSuspendError(detail);
      else setMessage(detail);
    } finally {
      setPending(false);
    }
  };
  const activeInvites = invitations.filter(
    (i) => !i.consumedAt && !i.revokedAt && new Date(i.expiresAt) > new Date(),
  );
  const filtered = users.filter((u) =>
    `${u.displayName || ""} ${u.username}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="people-page-stack">
      <section className="settings-card invite-card">
        <div>
          <h2>Invite someone</h2>
          <p>Create a link and share it with the person you want to invite.</p>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (role === "admin" && !ack) {
              setMessage(
                "Confirm administrator access before creating this invitation.",
              );
              return;
            }
            setPending(true);
            try {
              const result = await request<{
                invitation: Invitation;
                invitationUrl: string;
              }>("/api/v1/admin/invitations", {
                method: "POST",
                body: JSON.stringify({
                  role,
                  administratorAcknowledged: ack,
                }),
              });
              setFallbackUrl("");
              setInvitationLinks((links) => ({
                ...links,
                [result.invitation.id]: result.invitationUrl,
              }));
              setMessage(
                "Invitation created. Copy it now; it cannot be retrieved later.",
              );
              await load();
            } catch {
              setMessage("Invitation could not be created.");
            } finally {
              setPending(false);
            }
          }}
        >
          <label>
            Invitation role
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value as "member" | "admin");
                setAck(false);
              }}
            >
              <option value="member">
                Member — access to their own private archive
              </option>
              <option value="admin">Administrator — can manage access</option>
            </select>
          </label>
          {role === "admin" && (
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              I understand this grants administrator access.
            </label>
          )}
          <button disabled={pending}>Create invitation</button>
        </form>
        <small>
          {role === "admin"
            ? "Administrators can manage accounts and invitations."
            : "Members cannot manage other accounts or invitations."}
        </small>
        {fallbackUrl && (
          <div className="created-invite">
            <input
              readOnly
              aria-label="New invitation link"
              value={fallbackUrl}
            />
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard.writeText(fallbackUrl).then(
                  () => setMessage("Invitation link copied."),
                  () => setMessage("Select and copy the invitation link."),
                )
              }
            >
              Copy link
            </button>
          </div>
        )}
      </section>
      {message && (
        <p className="action-feedback" role="status">
          {message}
        </p>
      )}
      <section className="settings-card people-table-card">
        <header>
          <div>
            <h2>Accounts</h2>
            <small>{users.length} accounts</small>
          </div>
          <input
            type="search"
            placeholder="Search accounts…"
            aria-label="Search accounts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </header>
        {loadError && (
          <div className="settings-inline-error" role="alert">
            <span>{loadError}</span>
            <button type="button" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}
        <div className="people-table">
          <div className="people-table-head">
            <span>Account</span>
            <span>Role</span>
            <span>Joined</span>
            <span>Access</span>
            <span />
          </div>
          {filtered.map((person) => (
            <div className="people-table-row" key={person.id}>
              <div className="people-name">
                <span
                  className="mini-avatar"
                  style={{ background: person.avatarColor || "#315a48" }}
                >
                  {initials(person)}
                </span>
                <span>
                  <strong>{person.displayName || person.username}</strong>
                  <small>
                    {person.username}
                    {person.id === currentUser.id ? " · You" : ""}
                  </small>
                </span>
              </div>
              <div>
                {person.id === currentUser.id ? (
                  <span>
                    {person.role === "admin" ? "Administrator" : "Member"}
                  </span>
                ) : (
                  <RoleMenu
                    person={person}
                    pending={pending}
                    onChange={(role) => void updateUser(person, { role })}
                  />
                )}
              </div>
              <span>{joined(person.createdAt)}</span>
              <span
                className={person.suspendedAt ? "status suspended" : "status"}
              >
                {person.suspendedAt ? "Suspended" : "Active"}
              </span>
              <div className="row-actions">
                {person.id === currentUser.id ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={onMyAccount}
                  >
                    My account ↗
                  </button>
                ) : (
                  <>
                    <button
                      ref={menu === person.id ? actionTrigger : undefined}
                      type="button"
                      aria-label={`Actions for ${person.displayName || person.username}`}
                      aria-expanded={menu === person.id}
                      onClick={() =>
                        setMenu(menu === person.id ? null : person.id)
                      }
                    >
                      <MoreHorizontal />
                    </button>
                    {menu === person.id && (
                      <div className="account-actions-menu" role="menu">
                        <strong>{person.displayName || person.username}</strong>
                        <small>
                          {person.username} · Joined {joined(person.createdAt)}
                        </small>
                        <button
                          role="menuitem"
                          type="button"
                          onClick={() =>
                            person.suspendedAt
                              ? void updateUser(person, { suspended: false })
                              : (setSuspendError(""), setSuspend(person))
                          }
                        >
                          {person.suspendedAt
                            ? "Restore access"
                            : "Suspend access…"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        {loading && <p>Loading accounts…</p>}
        {!loading && !loadError && users.length === 0 && (
          <p className="people-empty">No accounts yet.</p>
        )}
        {!loading &&
          !loadError &&
          users.length > 0 &&
          filtered.length === 0 && (
            <p className="people-empty">No accounts match “{query}”.</p>
          )}
      </section>
      <section className="settings-card invitations-table">
        <header>
          <div>
            <h2>Invitations</h2>
            <small>{activeInvites.length} pending</small>
          </div>
        </header>
        <div className="invitation-table-head" aria-hidden="true">
          <span>Invitation</span>
          <span>Role</span>
          <span>Created</span>
          <span>Status</span>
          <span />
        </div>
        {!loading && !loadError && invitations.length === 0 && (
          <p className="people-empty">No invitations yet.</p>
        )}
        {invitations.map((inv, index) => {
          const state = inv.consumedAt
            ? "Used"
            : inv.revokedAt
              ? "Revoked"
              : new Date(inv.expiresAt) < new Date()
                ? "Expired"
                : "Pending";
          return (
            <div className="invitation-row" key={inv.id}>
              <span>
                <strong>Invite link {index + 1}</strong>
              </span>
              <span>{inv.role === "admin" ? "Administrator" : "Member"}</span>
              <span>{joined(inv.createdAt)}</span>
              <span className="status">{state}</span>
              <span>
                {state === "Pending" && invitationLinks[inv.id] && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={async () => {
                      const link = invitationLinks[inv.id];
                      if (!link) return;
                      try {
                        await navigator.clipboard.writeText(link);
                        setFallbackUrl("");
                        setMessage("Invitation link copied.");
                      } catch {
                        setFallbackUrl(link);
                        setMessage(
                          "Select and copy the invitation link above.",
                        );
                      }
                    }}
                  >
                    Copy link
                  </button>
                )}
                {state === "Pending" && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={invitationPending === inv.id}
                    onClick={async () => {
                      setInvitationPending(inv.id);
                      try {
                        await request(
                          `/api/v1/admin/invitations/${inv.id}/revoke`,
                          { method: "POST" },
                        );
                        if (fallbackUrl === invitationLinks[inv.id])
                          setFallbackUrl("");
                        setInvitationLinks((links) => {
                          const next = { ...links };
                          delete next[inv.id];
                          return next;
                        });
                        setMessage("Invitation revoked.");
                        await load();
                      } catch (error) {
                        setMessage(
                          error instanceof Error
                            ? error.message
                            : "Invitation could not be revoked.",
                        );
                      } finally {
                        setInvitationPending(null);
                      }
                    }}
                  >
                    Revoke
                  </button>
                )}
                {!inv.consumedAt && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={invitationPending === inv.id}
                    onClick={async () => {
                      setInvitationPending(inv.id);
                      try {
                        const result = await request<{
                          invitation: Invitation;
                          invitationUrl: string;
                        }>(`/api/v1/admin/invitations/${inv.id}/regenerate`, {
                          method: "POST",
                        });
                        setFallbackUrl("");
                        setInvitationLinks((links) => {
                          const next = {
                            ...links,
                            [result.invitation.id]: result.invitationUrl,
                          };
                          if (inv.id !== result.invitation.id)
                            delete next[inv.id];
                          return next;
                        });
                        setMessage(
                          "New invitation link created. Copy it now; the previous link no longer works.",
                        );
                        await load();
                      } catch (error) {
                        setMessage(
                          error instanceof Error
                            ? error.message
                            : "Invitation could not be regenerated.",
                        );
                      } finally {
                        setInvitationPending(null);
                      }
                    }}
                  >
                    Regenerate
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </section>
      <p className="privacy-note">
        Administration grants access management. Each person’s archive and
        credentials remain private.
      </p>
      {suspend && (
        <Dialog
          title={`Suspend ${suspend.displayName || suspend.username}’s access?`}
          onClose={() => setSuspend(null)}
        >
          <p>
            {suspend.displayName || suspend.username} won’t be able to sign in
            or use API keys until you restore access. Their archive and
            credentials stay intact and private.
          </p>
          <small>
            You can restore access anytime from People &amp; access.
          </small>
          {suspendError && (
            <p className="dialog-error" role="alert">
              {suspendError}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setSuspend(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={pending}
              onClick={() => void updateUser(suspend, { suspended: true })}
            >
              {pending ? "Suspending…" : "Suspend access"}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
