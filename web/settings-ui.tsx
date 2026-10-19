import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  CircleDot,
  X,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import { Card, IconBox, SectionHeading, cx } from "./components/ui/primitives";

export function SettingsPageHeader({
  crumb,
  title,
  description,
  action,
}: {
  crumb: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="st-page-header">
      <div className="st-page-header-text">
        <p className="st-kicker">{crumb}</p>
        <h1 className="st-title settings-topic-heading" tabIndex={-1}>
          {title}
        </h1>
        <p className="st-description">{description}</p>
      </div>
      {action ? <div className="st-page-header-action">{action}</div> : null}
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  actions,
  className,
  children,
  after,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
  after?: ReactNode;
}) {
  const headingId = useId();
  return (
    <section className={cx("st-section", className)} aria-labelledby={headingId}>
      <SectionHeading
        title={title}
        description={description}
        actions={actions}
        headingId={headingId}
      />
      <Card className="st-card">{children}</Card>
      {after}
    </section>
  );
}

/** A card row that discloses more detail below it, drawn with a trailing chevron. */
export function DisclosureRow({
  icon,
  title,
  description,
  children,
  last,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
  last?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className={cx("st-disclosure", last && "ui-card-row-last")}>
      <button
        type="button"
        className="ui-card-row st-disclosure-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <IconBox icon={icon} size={28} className="st-icon-muted" />
        <span className="ui-card-row-text">
          <span className="ui-card-row-title st-disclosure-title">{title}</span>
          <span className="ui-card-row-description">{description}</span>
        </span>
        <ChevronDown
          className="st-disclosure-chevron"
          size={16}
          aria-hidden="true"
        />
      </button>
      <div id={panelId} className="st-disclosure-panel" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

export function SaveBar({
  message,
  saving,
  onDiscard,
  onSave,
  saveDisabled,
}: {
  message: string;
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
}) {
  return (
    <div className="st-savebar" role="region" aria-label="Unsaved changes">
      <CircleDot className="st-savebar-icon" size={15} aria-hidden="true" />
      <p className="st-savebar-message">{message}</p>
      <button
        type="button"
        className="st-savebar-discard"
        disabled={saving}
        onClick={onDiscard}
      >
        Discard
      </button>
      <button
        type="button"
        className="st-savebar-save"
        disabled={saving || saveDisabled}
        onClick={onSave}
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

export function Feedback({
  children,
  error,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  if (!children) return null;
  return (
    <p
      className={cx("st-feedback", error && "st-feedback-error")}
      role={error ? "alert" : "status"}
      aria-live="polite"
    >
      {children}
    </p>
  );
}

const focusableSelector =
  "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]";

export function SettingsDialog({
  title,
  description,
  onClose,
  closeDisabled = false,
  closeLabel = "Close",
  footer,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  closeLabel?: string;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLElement>(null);
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  const closeRef = useRef(onClose);
  const disabledRef = useRef(closeDisabled);
  closeRef.current = onClose;
  disabledRef.current = closeDisabled;
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!disabledRef.current) closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const controls = Array.from(
        panel.current.querySelectorAll<HTMLElement>(focusableSelector),
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
    const trigger = returnFocus.current;
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.requestAnimationFrame(() => trigger?.focus());
    };
  }, []);
  return (
    <div
      className="st-dialog-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose();
      }}
    >
      <section
        ref={panel}
        className={cx("st-dialog", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className="st-dialog-header">
          <div className="st-dialog-heading">
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button
            type="button"
            className="st-dialog-close"
            aria-label={closeLabel}
            disabled={closeDisabled}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {children ? <div className="st-dialog-body">{children}</div> : null}
        {footer ? <div className="st-dialog-footer">{footer}</div> : null}
      </section>
    </div>
  );
}

/** Lucide 1.x dropped brand marks; these redraw its former outlines. */
export const InstagramIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  ),
) as LucideIcon;
InstagramIcon.displayName = "InstagramIcon";

export const FacebookIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  ),
) as LucideIcon;
FacebookIcon.displayName = "FacebookIcon";

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const shortMonth = (date: Date) => monthNames[date.getMonth()]!.slice(0, 3);
const pad = (value: number) => String(value).padStart(2, "0");

/** `21 Sep`, adding the year only when it is not the current one. */
export function formatShortDate(value: string) {
  const date = new Date(value);
  return date.getFullYear() === new Date().getFullYear()
    ? `${date.getDate()} ${shortMonth(date)}`
    : formatLongDate(value);
}
/** `12 Sep 2026` */
export function formatLongDate(value: string) {
  const date = new Date(value);
  return `${date.getDate()} ${shortMonth(date)} ${date.getFullYear()}`;
}
/** `March 2026` */
export function formatMonthYear(value: string) {
  const date = new Date(value);
  return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}
/** `12 Oct 2026, 09:14` */
export function formatDateTime(value: string) {
  const date = new Date(value);
  return `${formatLongDate(value)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `2 hours ago`, `yesterday`, `12 days ago`. */
export function formatRelative(value: string, now = Date.now()) {
  const minutes = Math.round((now - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/** `in 6 days`, `tomorrow`, `in 3 hours`. */
export function formatUntil(value: string, now = Date.now()) {
  const minutes = Math.round((new Date(value).getTime() - now) / 60_000);
  if (minutes <= 0) return "now";
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
