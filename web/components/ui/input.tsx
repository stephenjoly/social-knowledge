import type { ComponentPropsWithRef, CSSProperties } from "react";
import { Lock, type LucideIcon } from "lucide-react";
import { cx } from "./class-names";
import "./primitives.css";

export type InputSize = "default" | "large";

export type InputProps = Omit<
  ComponentPropsWithRef<"input">,
  "className" | "style" | "size"
> & {
  /** Leading 14px icon. Disabled inputs always show a lock instead. */
  icon?: LucideIcon;
  /** `large` is the 40px field used on the sign-in card. */
  size?: InputSize;
  /** Applied to the outer frame so callers can set width and layout. */
  className?: string;
  style?: CSSProperties;
};

export function Input({
  icon,
  size = "default",
  disabled,
  className,
  style,
  ...props
}: InputProps) {
  const Icon = disabled ? Lock : icon;
  return (
    <span
      className={cx(
        "ui-input",
        size === "large" && "ui-input-large",
        disabled && "ui-input-disabled",
        className,
      )}
      style={style}
    >
      {Icon ? (
        <Icon
          className="ui-input-icon"
          size={14}
          aria-hidden="true"
          focusable="false"
        />
      ) : null}
      <input className="ui-input-control" disabled={disabled} {...props} />
    </span>
  );
}
