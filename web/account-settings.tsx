import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
  Copy,
  Ellipsis,
  Languages,
  Link as LinkIcon,
  Lock,
  LogOut,
  Monitor,
  RefreshCw,
  Search,
  Shield,
  Smartphone,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
import {
  ActionButton,
  Avatar,
  CardRow,
  IconBox,
  Input,
  Select,
  StatusPill,
  cx,
} from "./components/ui/primitives";
import {
  Feedback,
  SaveBar,
  SettingsDialog,
  SettingsPageHeader,
  SettingsSection,
  formatMonthYear,
  formatShortDate,
  formatUntil,
} from "./settings-ui";
import { confirmDiscardUnsaved, useUnsavedChanges } from "./unsaved-changes";

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
  createdByUserId?: string | null;
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

const displayNameOf = (user: Pick<AccountUser, "displayName" | "username">) =>
  user.displayName || user.username;

export const avatarColours = [
  { value: "#3f6b52", name: "Green" },
  { value: "#4f6fa8", name: "Blue" },
  { value: "#b4574f", name: "Red" },
  { value: "#c08a3e", name: "Amber" },
  { value: "#7a5ea8", name: "Purple" },
  { value: "#52525b", name: "Graphite" },
];

function describeSession(userAgent: string) {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "This browser";
  const system = /iPhone/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Windows/.test(userAgent)
            ? "Windows"
            : /Linux/.test(userAgent)
              ? "Linux"
              : null;
  return {
    label: system ? `${browser} on ${system}` : browser,
    mobile: /iPhone|Android|Mobile/.test(userAgent),
  };
}

export function MyAccount({
  user,
  onUserChange,
  onSignOut,
  onOpenData,
  onOpenLanguage,
  noteLanguage = null,
  onUnsavedChange,
}: {
  user: AccountUser;
  onUserChange: (user: AccountUser) => void;
  onSignOut: () => Promise<void>;
  onOpenData: () => void;
  /** Opens Data & export at the note language setting. */
  onOpenLanguage?: () => void;
  noteLanguage?: string | null;
  /** Receives a summary of unsaved profile edits, or null. */
  onUnsavedChange?: (summary: string | null) => void;
}) {
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [username, setUsername] = useState(user.username);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarMessageIsError, setAvatarMessageIsError] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [avatarPending, setAvatarPending] = useState(false);
  const session = describeSession(navigator.userAgent);
  const name = displayName.trim() || username.trim() || user.username;
  const dirty =
    displayName.trim() !== (user.displayName || "") ||
    username.trim().toLowerCase() !== user.username;
  const report = (text: string, error = false) => {
    setMessage(text);
    setMessageIsError(error);
    if (text) setAvatarMessage("");
  };
  const reportAvatar = (text: string, error = false) => {
    setAvatarMessage(text);
    setAvatarMessageIsError(error);
    if (text) setMessage("");
  };
  const saveProfile = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!dirty || !username.trim()) return;
    setSaving(true);
    report("");
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
      setDisplayName(result.user.displayName || "");
      setUsername(result.user.username);
      report("Profile saved.");
    } catch (error) {
      report(readableError(error, "Profile could not be saved."), true);
    } finally {
      setSaving(false);
    }
  };
  const chooseColour = async (colour: string) => {
    if (avatarPending || colour === user.avatarColor) return;
    setAvatarPending(true);
    reportAvatar("");
    try {
      const result = await request<{ user: AccountUser }>(
        "/api/v1/account/profile",
        { method: "PATCH", body: JSON.stringify({ avatarColor: colour }) },
      );
      onUserChange(result.user);
      reportAvatar(
        dirty
          ? "Avatar colour saved. Your name changes still need Save."
          : "Avatar colour saved.",
      );
    } catch (error) {
      reportAvatar(
        readableError(error, "Avatar colour could not be saved."),
        true,
      );
    } finally {
      setAvatarPending(false);
    }
  };
  const changes = [
    displayName.trim() !== (user.displayName || "") ? "display name" : null,
    username.trim().toLowerCase() !== user.username ? "username" : null,
  ].filter(Boolean);
  useUnsavedChanges(
    dirty ? `Your ${changes.join(" and ")} changes aren’t saved.` : null,
    onUnsavedChange,
  );
  return (
    <>
      <SettingsPageHeader
        crumb="SETTINGS  /  ACCOUNT"
        title="My account"
        description="Your profile, sign-in details, and account preferences."
      />
      <SettingsSection
        title="Profile"
        description="Name changes apply when you save. Avatar colour saves as soon as you pick one."
        after={
          <>
            {dirty ? (
              <SaveBar
                message={`Your ${changes.join(" and ")} changed. Save to update your profile.`}
                saving={saving}
                saveDisabled={!username.trim()}
                onDiscard={() => {
                  setDisplayName(user.displayName || "");
                  setUsername(user.username);
                  report("");
                }}
                onSave={() => void saveProfile()}
              />
            ) : null}
            <Feedback error={messageIsError}>{message}</Feedback>
          </>
        }
      >
        <form className="st-form-rows" onSubmit={(event) => void saveProfile(event)}>
          <CardRow
            className="st-profile-row"
            leading={
              <Avatar
                name={name}
                color={user.avatarColor || undefined}
                size={44}
              />
            }
            title={name}
            description={`@${user.username} · ${user.role === "admin" ? "Admin" : "Member"}${user.createdAt ? ` · joined ${formatMonthYear(user.createdAt)}` : ""}`}
          />
          <CardRow
            title={<label htmlFor="account-display-name">Display name</label>}
            description="Shown on your avatar and to people you invite."
          >
            <Input
              id="account-display-name"
              className="st-control-260"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              maxLength={100}
            />
          </CardRow>
          <CardRow
            title={<label htmlFor="account-username">Username</label>}
            description="Used to sign in. Changing it changes how you sign in."
          >
            <Input
              id="account-username"
              className="st-control-260"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              maxLength={40}
              required
            />
          </CardRow>
          <CardRow
            title={<span id="account-avatar-colour">Avatar colour</span>}
            description={
              <>
                <span id="account-avatar-hint">
                  Saves immediately. No need to press Save.
                </span>
                {avatarMessage && (
                  <span
                    className={cx(
                      "st-inline-status",
                      avatarMessageIsError && "st-feedback-error",
                    )}
                    role={avatarMessageIsError ? "alert" : "status"}
                  >
                    {avatarMessage}
                  </span>
                )}
              </>
            }
            last
          >
            <div
              className="st-swatches"
              role="group"
              aria-labelledby="account-avatar-colour"
              aria-describedby="account-avatar-hint"
            >
              {avatarColours.map((colour) => {
                const selected = user.avatarColor === colour.value;
                return (
                  <button
                    key={colour.value}
                    type="button"
                    className={cx("st-swatch", selected && "st-swatch-selected")}
                    style={{ color: colour.value }}
                    aria-label={`${colour.name} avatar colour`}
                    aria-pressed={selected}
                    disabled={avatarPending}
                    onClick={() => void chooseColour(colour.value)}
                  >
                    <span aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </CardRow>
          <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
        </form>
      </SettingsSection>
      <SettingsSection title="Sign-in & security">
        <CardRow
          leading={<IconBox icon={Lock} size={30} />}
          title="Password"
          description="Changing it signs you out on every device."
        >
          <ActionButton onClick={() => setPasswordOpen(true)}>
            Change password
          </ActionButton>
        </CardRow>
        <CardRow
          leading={
            <IconBox icon={session.mobile ? Smartphone : Monitor} size={30} />
          }
          title="Current session"
          description={`${session.label} · active now`}
          last
        >
          <StatusPill tone="ok">This device</StatusPill>
          <ActionButton
            icon={LogOut}
            onClick={() => {
              if (
                confirmDiscardUnsaved(
                  dirty
                    ? `Your ${changes.join(" and ")} changes aren’t saved.`
                    : null,
                )
              )
                void onSignOut();
            }}
          >
            Sign out
          </ActionButton>
        </CardRow>
      </SettingsSection>
      <SettingsSection title="Your archive">
        {onOpenLanguage && (
          <CardRow
            leading={<IconBox icon={Languages} size={30} />}
            title="Note language"
            description={
              noteLanguage
                ? `New captures are written in ${noteLanguage}. Existing notes keep their language.`
                : "Choose the language new notes are written in. Existing notes keep their language."
            }
          >
            <ActionButton icon={ArrowRight} onClick={onOpenLanguage}>
              Change language
            </ActionButton>
          </CardRow>
        )}
        <CardRow
          leading={<IconBox icon={Archive} size={30} />}
          title="Exports and downloads"
          description="Everything you saved belongs to you. Export a copy whenever you want."
          last
        >
          <ActionButton icon={ArrowRight} onClick={onOpenData}>
            Data &amp; export
          </ActionButton>
        </CardRow>
      </SettingsSection>
      {passwordOpen && (
        <PasswordDialog
          onClose={() => setPasswordOpen(false)}
          onChanged={onSignOut}
        />
      )}
    </>
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
    <SettingsDialog
      title="Change password"
      description="Changing your password signs out every device, including this one."
      onClose={onClose}
      footer={
        <>
          <ActionButton variant="ghost" onClick={onClose}>
            Cancel
          </ActionButton>
          <ActionButton
            variant="primary"
            type="submit"
            form="change-password-form"
            disabled={pending}
          >
            {pending ? "Changing…" : "Change password and sign out"}
          </ActionButton>
        </>
      }
    >
      <form
        id="change-password-form"
        className="st-dialog-form"
        onSubmit={async (event) => {
          event.preventDefault();
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
        <div className="st-field">
          <label htmlFor="current-password">Current password</label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrent(event.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="st-field">
          <label htmlFor="new-password">New password</label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNext(event.target.value)}
            minLength={12}
            required
          />
          <small>Use at least 12 characters.</small>
        </div>
        {error && <Feedback error>{error}</Feedback>}
      </form>
    </SettingsDialog>
  );
}

function PersonActions({
  person,
  pending,
  onSuspend,
  onRestore,
}: {
  person: AccountUser;
  pending: boolean;
  onSuspend: () => void;
  onRestore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const name = displayNameOf(person);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
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
    <div className="st-menu-root" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="st-icon-button"
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen(!open)}
      >
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="st-menu" role="menu" aria-label={`Actions for ${name}`}>
          <button
            type="button"
            role="menuitem"
            className={person.suspendedAt ? undefined : "st-menu-danger"}
            onClick={() => {
              setOpen(false);
              if (person.suspendedAt) onRestore();
              else onSuspend();
            }}
          >
            {person.suspendedAt ? (
              <UserRoundCheck size={15} aria-hidden="true" />
            ) : (
              <UserRoundX size={15} aria-hidden="true" />
            )}
            {person.suspendedAt ? "Restore access" : "Suspend access…"}
          </button>
        </div>
      )}
    </div>
  );
}

function InviteDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (invitation: Invitation, url: string) => Promise<void>;
}) {
  const [role, setRole] = useState<"member" | "admin">("member");
  const [ack, setAck] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (role === "admin" && !ack) {
      setError("Confirm administrator access before creating this invitation.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await request<{
        invitation: Invitation;
        invitationUrl: string;
      }>("/api/v1/admin/invitations", {
        method: "POST",
        body: JSON.stringify({ role, administratorAcknowledged: ack }),
      });
      setLink(result.invitationUrl);
      await onCreated(result.invitation, result.invitationUrl);
    } catch {
      setError("Invitation could not be created.");
    } finally {
      setPending(false);
    }
  };
  return (
    <SettingsDialog
      title="Invite someone"
      description={
        link
          ? "Copy this link now. It can’t be shown again after you close this dialog; if it’s lost, use New link to replace it."
          : "Create a single-use link for one new account. They get their own private, empty archive; inviting someone never shares yours."
      }
      onClose={onClose}
      closeDisabled={pending}
      footer={
        link ? (
          <ActionButton variant="primary" onClick={onClose}>
            Done
          </ActionButton>
        ) : (
          <>
            <ActionButton variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </ActionButton>
            <ActionButton
              variant="primary"
              type="submit"
              form="invite-form"
              disabled={pending}
            >
              {pending ? "Creating…" : "Create invitation"}
            </ActionButton>
          </>
        )
      }
    >
      {link ? (
        <div className="st-field">
          <div className="st-inline-controls">
            {copyFailed && (
              <Input
                aria-label="New invitation link"
                className="st-grow st-mono"
                readOnly
                value={link}
                onFocus={(event) => event.currentTarget.select()}
              />
            )}
            <ActionButton
              icon={Copy}
              variant={copyFailed ? "default" : "primary"}
              onClick={() =>
                void navigator.clipboard.writeText(link).then(
                  () => {
                    setCopyFailed(false);
                    setCopyMessage("Invitation link copied.");
                  },
                  () => {
                    setCopyFailed(true);
                    setCopyMessage("Select and copy the invitation link.");
                  },
                )
              }
            >
              Copy link
            </ActionButton>
          </div>
          <Feedback>{copyMessage}</Feedback>
        </div>
      ) : (
        <form id="invite-form" className="st-dialog-form" onSubmit={create}>
          <div className="st-field">
            <label htmlFor="invitation-role">Invitation role</label>
            <Select
              id="invitation-role"
              value={role}
              onChange={(event) => {
                setRole(event.target.value as "member" | "admin");
                setAck(false);
              }}
            >
              <option value="member">Member — their own private archive</option>
              <option value="admin">Admin — can also manage access</option>
            </Select>
            <small>
              {role === "admin"
                ? "Admins can also invite people, change roles, and suspend access. They still can’t open anyone else’s archive."
                : "Members have their own private archive. They can’t see yours, and can’t manage accounts or invitations."}
            </small>
          </div>
          {role === "admin" && (
            <label className="st-check">
              <input
                type="checkbox"
                checked={ack}
                onChange={(event) => setAck(event.target.checked)}
              />
              I understand this grants administrator access.
            </label>
          )}
          {error && <Feedback error>{error}</Feedback>}
        </form>
      )}
    </SettingsDialog>
  );
}

export function PeopleAccess({ currentUser }: { currentUser: AccountUser }) {
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitationLinks, setInvitationLinks] = useState<
    Record<string, string>
  >({});
  const [invitationMessage, setInvitationMessage] = useState("");
  const [fallbackUrl, setFallbackUrl] = useState("");
  const [suspend, setSuspend] = useState<AccountUser | null>(null);
  const [suspendError, setSuspendError] = useState("");
  const [pending, setPending] = useState(false);
  const [invitationPending, setInvitationPending] = useState<string | null>(
    null,
  );
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
      setSuspend(null);
    } catch (e) {
      const detail = readableError(e, "Account could not be updated.");
      if (suspend) setSuspendError(detail);
      else setMessage(detail);
    } finally {
      setPending(false);
    }
  };
  const runInvitationAction = async (
    invitation: Invitation,
    action: "revoke" | "regenerate",
  ) => {
    setInvitationPending(invitation.id);
    setInvitationMessage("");
    setFallbackUrl("");
    try {
      if (action === "revoke") {
        await request(`/api/v1/admin/invitations/${invitation.id}/revoke`, {
          method: "POST",
        });
        setInvitationLinks((links) => {
          const next = { ...links };
          delete next[invitation.id];
          return next;
        });
        setInvitationMessage("Invitation revoked.");
      } else {
        const result = await request<{
          invitation: Invitation;
          invitationUrl: string;
        }>(`/api/v1/admin/invitations/${invitation.id}/regenerate`, {
          method: "POST",
        });
        setInvitationLinks((links) => {
          const next = {
            ...links,
            [result.invitation.id]: result.invitationUrl,
          };
          if (invitation.id !== result.invitation.id)
            delete next[invitation.id];
          return next;
        });
        setInvitationMessage(
          "New invitation link created. Copy it now; the previous link no longer works.",
        );
      }
      await load();
    } catch (error) {
      setInvitationMessage(
        error instanceof Error && !/^[a-z0-9_]+$/.test(error.message)
          ? error.message
          : action === "revoke"
            ? "Invitation could not be revoked."
            : "Invitation could not be regenerated.",
      );
    } finally {
      setInvitationPending(null);
    }
  };
  const now = Date.now();
  const openInvitations = invitations.filter(
    (i) => !i.consumedAt && !i.revokedAt && new Date(i.expiresAt).getTime() > now,
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = users.filter((u) =>
    `${u.displayName || ""} ${u.username}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
  const creatorName = (id?: string | null) => {
    const creator = users.find((u) => u.id === id);
    return creator ? displayNameOf(creator) : "an admin";
  };
  return (
    <>
      <SettingsPageHeader
        crumb="SETTINGS  /  ADMINISTRATION"
        title="People & access"
        description="Manage who can sign in and what they can administer. Every archive stays private to its owner."
        action={
          <ActionButton
            variant="primary"
            icon={UserPlus}
            onClick={() => setInviteOpen(true)}
          >
            Invite someone
          </ActionButton>
        }
      />
      <SettingsSection
        title="Members"
        description={`${users.length} ${users.length === 1 ? "person" : "people"} · roles control who manages access; every archive stays private to its owner`}
        actions={
          <Input
            icon={Search}
            className="st-control-220"
            type="search"
            placeholder="Search people…"
            aria-label="Search people"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        }
        after={<Feedback>{message}</Feedback>}
      >
        <div className="st-people" role="table" aria-label="Members">
          <div className="st-people-head" role="row">
            <span role="columnheader">Name</span>
            <span role="columnheader">Role</span>
            <span role="columnheader">Joined</span>
            <span role="columnheader">
              <span className="sr-only">Actions</span>
            </span>
          </div>
          {filtered.map((person) => {
            const isSelf = person.id === currentUser.id;
            const name = displayNameOf(person);
            return (
              <div className="st-people-row" role="row" key={person.id}>
                <div className="st-people-name" role="cell">
                  <Avatar
                    name={name}
                    color={person.avatarColor || undefined}
                    size={32}
                  />
                  <span className="st-people-text">
                    <strong>{name}</strong>
                    <small>
                      @{person.username}
                      {isSelf ? " · you" : ""}
                      {person.suspendedAt ? " · suspended" : ""}
                    </small>
                  </span>
                </div>
                <div className="st-people-role" role="cell">
                  {isSelf ? (
                    <span
                      className={cx(
                        "st-role-badge",
                        person.role === "admin" && "st-role-badge-admin",
                      )}
                    >
                      {person.role === "admin" ? "Admin" : "Member"}
                    </span>
                  ) : (
                    <Select
                      className="st-control-116"
                      aria-label={`Role for ${name}`}
                      value={person.role === "admin" ? "admin" : "member"}
                      disabled={pending}
                      onChange={(event) =>
                        void updateUser(person, { role: event.target.value })
                      }
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </Select>
                  )}
                </div>
                <div className="st-people-meta" role="cell">
                  {person.createdAt ? formatShortDate(person.createdAt) : "—"}
                </div>
                <div className="st-people-actions" role="cell">
                  {!isSelf && (
                    <PersonActions
                      person={person}
                      pending={pending}
                      onSuspend={() => {
                        setSuspendError("");
                        setSuspend(person);
                      }}
                      onRestore={() =>
                        void updateUser(person, { suspended: false })
                      }
                    />
                  )}
                </div>
              </div>
            );
          })}
          {loading && !users.length && (
            <p className="st-empty-row" role="status">
              Loading people…
            </p>
          )}
          {loadError && (
            <div className="st-empty-row st-error-row" role="alert">
              <span>{loadError}</span>
              <ActionButton onClick={() => void load()}>Retry</ActionButton>
            </div>
          )}
          {!loading && !loadError && users.length > 0 && !filtered.length && (
            <p className="st-empty-row">No one matches “{query}”.</p>
          )}
        </div>
      </SettingsSection>
      <SettingsSection
        title="Open invitations"
        description="Links expire after 24 hours and create one account each. A link is shown once; New link replaces it, and the earlier link stops working."
        after={
          <>
            {fallbackUrl && (
              <Input
                className="st-mono"
                readOnly
                aria-label="New invitation link"
                value={fallbackUrl}
                onFocus={(event) => event.currentTarget.select()}
              />
            )}
            <Feedback>{invitationMessage}</Feedback>
          </>
        }
      >
        {openInvitations.map((invitation) => {
          const link = invitationLinks[invitation.id];
          const busy = invitationPending === invitation.id;
          const admin = invitation.role === "admin";
          return (
            <CardRow
              key={invitation.id}
              leading={<IconBox icon={admin ? Shield : LinkIcon} size={30} />}
              title={admin ? "Admin invite" : "Member invite"}
              description={`Created by ${creatorName(invitation.createdByUserId)} · expires ${formatUntil(invitation.expiresAt, now)} · ${link ? "copy it now; it’s shown only once" : "New link replaces the earlier link"}`}
            >
              {admin && <StatusPill tone="warn">Admin</StatusPill>}
              {link ? (
                <ActionButton
                  icon={Copy}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      setFallbackUrl("");
                      setInvitationMessage("Invitation link copied.");
                    } catch {
                      setFallbackUrl(link);
                      setInvitationMessage(
                        "Select and copy the invitation link above.",
                      );
                    }
                  }}
                >
                  Copy link
                </ActionButton>
              ) : (
                <ActionButton
                  icon={RefreshCw}
                  disabled={busy}
                  title="Creates a new link for this invitation. The earlier link stops working immediately."
                  onClick={() => void runInvitationAction(invitation, "regenerate")}
                >
                  New link
                </ActionButton>
              )}
              <ActionButton
                variant="danger"
                disabled={busy}
                onClick={() => void runInvitationAction(invitation, "revoke")}
              >
                Revoke
              </ActionButton>
            </CardRow>
          );
        })}
        {!loading && !loadError && !openInvitations.length && (
          <p className="st-empty-row">
            No open invitations. Invite someone to create a link.
          </p>
        )}
      </SettingsSection>
      {inviteOpen && (
        <InviteDialog
          onClose={() => setInviteOpen(false)}
          onCreated={async (invitation, url) => {
            setInvitationLinks((links) => ({ ...links, [invitation.id]: url }));
            setFallbackUrl("");
            setInvitationMessage(
              "Invitation created. Copy it now; it cannot be retrieved later.",
            );
            await load();
          }}
        />
      )}
      {suspend && (
        <SettingsDialog
          title={`Suspend ${displayNameOf(suspend)}’s access?`}
          description={`${displayNameOf(suspend)} won’t be able to sign in or use API keys until you restore access. Their archive and credentials stay intact and private.`}
          onClose={() => setSuspend(null)}
          closeDisabled={pending}
          footer={
            <>
              <ActionButton variant="ghost" onClick={() => setSuspend(null)}>
                Cancel
              </ActionButton>
              <ActionButton
                variant="danger"
                disabled={pending}
                onClick={() => void updateUser(suspend, { suspended: true })}
              >
                {pending ? "Suspending…" : "Suspend access"}
              </ActionButton>
            </>
          }
        >
          <p className="st-dialog-note">
            You can restore access anytime from People &amp; access.
          </p>
          {suspendError && <Feedback error>{suspendError}</Feedback>}
        </SettingsDialog>
      )}
    </>
  );
}
