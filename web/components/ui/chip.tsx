import type { ComponentPropsWithRef, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "./class-names";
import "./primitives.css";

type ChipContentProps = {
  icon?: LucideIcon | undefined;
  /** Colour of an optional leading 7px dot, such as a category accent. */
  dotColor?: string | undefined;
  children: ReactNode;
};

function ChipContent({ icon: Icon, dotColor, children }: ChipContentProps) {
  return (
    <>
      {dotColor ? (
        <span
          className="ui-chip-dot"
          style={{ background: dotColor }}
          aria-hidden="true"
        />
      ) : null}
      {Icon ? (
        <Icon
          className="ui-chip-icon"
          size={12}
          aria-hidden="true"
          focusable="false"
        />
      ) : null}
      {children}
    </>
  );
}

export type ChipProps = Omit<ComponentPropsWithRef<"span">, "children"> &
  ChipContentProps & {
    /** Inverted tone for a chip that represents the current selection. */
    selected?: boolean;
  };

/** A static label such as a topic or category. Use `ChipButton` for filters. */
export function Chip({
  selected = false,
  icon,
  dotColor,
  className,
  children,
  ...props
}: ChipProps) {
  return (
    <span
      className={cx("ui-chip", selected && "ui-chip-selected", className)}
      {...props}
    >
      <ChipContent icon={icon} dotColor={dotColor}>
        {children}
      </ChipContent>
    </span>
  );
}

export type ChipButtonProps = Omit<
  ComponentPropsWithRef<"button">,
  "children" | "aria-pressed"
> &
  ChipContentProps & {
    selected: boolean;
  };

/** A filter chip: a toggle button whose pressed state is the inverted tone. */
export function ChipButton({
  selected,
  icon,
  dotColor,
  type = "button",
  className,
  children,
  ...props
}: ChipButtonProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cx("ui-chip", selected && "ui-chip-selected", className)}
      {...props}
    >
      <ChipContent icon={icon} dotColor={dotColor}>
        {children}
      </ChipContent>
    </button>
  );
}
