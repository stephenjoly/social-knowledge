import type { ComponentPropsWithRef } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "./class-names";
import "./primitives.css";

/** 34 is the default, 28–30 compact rows, 44 page and topic headers. */
export type IconBoxSize = 28 | 30 | 34 | 44;
export type IconBoxTone = "neutral" | "green";

export type IconBoxProps = Omit<ComponentPropsWithRef<"span">, "children"> & {
  icon: LucideIcon;
  size?: IconBoxSize;
  tone?: IconBoxTone;
  /** Data-driven fill and icon colours, such as a provider brand; override `tone`. */
  background?: string;
  color?: string;
  /** When set, the box is announced as an image with this name; otherwise it is decorative. */
  label?: string;
};

export function iconSizeFor(boxSize: IconBoxSize): number {
  return Math.round(boxSize * 0.5);
}

export function IconBox({
  icon: Icon,
  size = 34,
  tone = "neutral",
  background,
  color,
  label,
  className,
  style,
  ...props
}: IconBoxProps) {
  return (
    <span
      className={cx("ui-icon-box", `ui-icon-box-${tone}`, className)}
      style={{ width: size, height: size, background, color, ...style }}
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true })}
      {...props}
    >
      <Icon size={iconSizeFor(size)} aria-hidden="true" focusable="false" />
    </span>
  );
}
