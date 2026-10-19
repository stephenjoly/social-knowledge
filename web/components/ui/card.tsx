import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "./class-names";
import "./primitives.css";

export type CardProps = ComponentPropsWithRef<"div">;

export function Card({ className, ...props }: CardProps) {
  return <div className={cx("ui-card", className)} {...props} />;
}

export type CardRowProps = Omit<ComponentPropsWithRef<"div">, "title"> & {
  /** Leading visual such as an `IconBox` or `Avatar`. */
  leading?: ReactNode;
  /** Row title at 13.5px/600. When set, `children` render as trailing controls. */
  title?: ReactNode;
  /** Row help text at 12.5px under the title. */
  description?: ReactNode;
  /** Drops the hairline divider; also applied automatically to the last child. */
  last?: boolean;
};

export function CardRow({
  leading,
  title,
  description,
  last = false,
  className,
  children,
  ...props
}: CardRowProps) {
  return (
    <div
      className={cx("ui-card-row", last && "ui-card-row-last", className)}
      {...props}
    >
      {leading}
      {title !== undefined || description !== undefined ? (
        <div className="ui-card-row-text">
          {title !== undefined ? (
            <p className="ui-card-row-title">{title}</p>
          ) : null}
          {description !== undefined ? (
            <p className="ui-card-row-description">{description}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
