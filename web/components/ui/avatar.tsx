import type { ComponentPropsWithRef } from "react";
import { cx } from "./class-names";
import "./primitives.css";

export type AvatarProps = Omit<ComponentPropsWithRef<"span">, "children"> & {
  /** Display name; the avatar shows its first character. */
  name: string;
  /** Account colour. Defaults to the `--avatar` token. */
  color?: string;
  /** Diameter in px. The sidebar uses 28, profile rows 44. */
  size?: number;
  /** Decorative avatars sit beside a visible name and are hidden from assistive tech. */
  decorative?: boolean;
};

export function avatarInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toLocaleUpperCase() : "?";
}

export function avatarFontSize(size: number): number {
  return Math.round(size * 0.4);
}

export function Avatar({
  name,
  color,
  size = 28,
  decorative = true,
  className,
  style,
  ...props
}: AvatarProps) {
  return (
    <span
      className={cx("ui-avatar", className)}
      style={{
        width: size,
        height: size,
        fontSize: avatarFontSize(size),
        background: color,
        ...style,
      }}
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": name })}
      {...props}
    >
      {avatarInitial(name)}
    </span>
  );
}
