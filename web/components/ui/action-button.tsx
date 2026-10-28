import type { ComponentPropsWithRef, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "./class-names";
import "./primitives.css";

export type ActionButtonVariant = "default" | "primary" | "danger" | "ghost";

export type ActionButtonProps = Omit<
  ComponentPropsWithRef<"button">,
  "children"
> & {
  variant?: ActionButtonVariant;
  icon?: LucideIcon;
  children: ReactNode;
};

export function ActionButton({
  variant = "default",
  icon: Icon,
  type = "button",
  className,
  children,
  ...props
}: ActionButtonProps) {
  return (
    <button
      type={type}
      className={cx("ui-btn", `ui-btn-${variant}`, className)}
      {...props}
    >
      {Icon ? (
        <Icon
          className="ui-btn-icon"
          size={14}
          aria-hidden="true"
          focusable="false"
        />
      ) : null}
      <span>{children}</span>
    </button>
  );
}
