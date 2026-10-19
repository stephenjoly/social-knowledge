import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "./class-names";
import "./primitives.css";

export type StatusTone = "ok" | "off" | "warn";

export type StatusPillProps = Omit<
  ComponentPropsWithRef<"span">,
  "children"
> & {
  tone?: StatusTone;
  /** The visible label carries the meaning; the dot is decorative. */
  children: ReactNode;
};

export function StatusPill({
  tone = "ok",
  className,
  children,
  ...props
}: StatusPillProps) {
  return (
    <span
      className={cx("ui-status", `ui-status-${tone}`, className)}
      {...props}
    >
      <span className="ui-status-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
