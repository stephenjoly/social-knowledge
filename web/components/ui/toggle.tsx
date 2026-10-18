import type { ChangeEvent, ComponentPropsWithRef, KeyboardEvent } from "react";
import { cx } from "./class-names";
import "./primitives.css";

type ToggleName =
  | { label: string; "aria-labelledby"?: never }
  | { label?: never; "aria-labelledby": string };

export type ToggleProps = Omit<
  ComponentPropsWithRef<"input">,
  | "type"
  | "role"
  | "checked"
  | "defaultChecked"
  | "onChange"
  | "children"
  | "aria-label"
  | "aria-labelledby"
  | "aria-checked"
> &
  ToggleName & {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  };

/**
 * Space toggles a checkbox natively; Enter is the optional second key the
 * ARIA switch pattern allows, routed through a click so `change` still fires.
 */
export function handleToggleKeyDown(
  event: Pick<
    KeyboardEvent<HTMLInputElement>,
    "key" | "preventDefault" | "currentTarget"
  >,
) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.currentTarget.click();
}

export function Toggle({
  checked,
  onCheckedChange,
  label,
  className,
  onKeyDown,
  ...props
}: ToggleProps) {
  return (
    <span className={cx("ui-toggle", className)}>
      <input
        {...props}
        type="checkbox"
        role="switch"
        className="ui-toggle-input"
        aria-label={label}
        checked={checked}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onCheckedChange(event.currentTarget.checked)
        }
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (!event.defaultPrevented) handleToggleKeyDown(event);
        }}
      />
      <span className="ui-toggle-track" aria-hidden="true">
        <span className="ui-toggle-knob" />
      </span>
    </span>
  );
}
