import type { ComponentPropsWithRef } from "react";
import { cx } from "./class-names";
import "./primitives.css";

export type KeycapProps = ComponentPropsWithRef<"kbd">;

export function Keycap({ className, ...props }: KeycapProps) {
  return <kbd className={cx("ui-keycap", className)} {...props} />;
}
