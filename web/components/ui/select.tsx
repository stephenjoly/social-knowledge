import type { ComponentPropsWithRef, CSSProperties } from "react";
import { ChevronsUpDown } from "lucide-react";
import { cx } from "./class-names";
import "./primitives.css";

export type SelectProps = Omit<
  ComponentPropsWithRef<"select">,
  "className" | "style" | "multiple" | "size"
> & {
  /** Colour of the optional leading dot, such as a provider's brand colour. */
  dotColor?: string;
  /** Applied to the outer frame so callers can set width and layout. */
  className?: string;
  style?: CSSProperties;
};

export function Select({
  dotColor,
  className,
  style,
  disabled,
  children,
  ...props
}: SelectProps) {
  return (
    <span
      className={cx(
        "ui-select",
        dotColor && "ui-select-has-dot",
        disabled && "ui-select-disabled",
        className,
      )}
      style={style}
    >
      {dotColor ? (
        <span
          className="ui-select-dot"
          style={{ background: dotColor }}
          aria-hidden="true"
        />
      ) : null}
      <select className="ui-select-control" disabled={disabled} {...props}>
        {children}
      </select>
      <ChevronsUpDown
        className="ui-select-chevron"
        size={13}
        aria-hidden="true"
        focusable="false"
      />
    </span>
  );
}
