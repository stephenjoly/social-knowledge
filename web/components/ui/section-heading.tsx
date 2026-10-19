import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "./class-names";
import "./primitives.css";

export type SectionHeadingLevel = 2 | 3 | 4;

export type SectionHeadingProps = Omit<
  ComponentPropsWithRef<"div">,
  "title"
> & {
  title: ReactNode;
  description?: ReactNode;
  /** Right-hand slot, aligned to the bottom of the text column. */
  actions?: ReactNode;
  /** Heading level for the document outline; the visual style does not change. */
  level?: SectionHeadingLevel;
  /** Id for the heading element so a section can be `aria-labelledby` it. */
  headingId?: string;
};

export function SectionHeading({
  title,
  description,
  actions,
  level = 2,
  headingId,
  className,
  ...props
}: SectionHeadingProps) {
  const Heading = `h${level}` as const;
  return (
    <div className={cx("ui-section-heading", className)} {...props}>
      <div className="ui-section-heading-text">
        <Heading id={headingId} className="ui-section-heading-title">
          {title}
        </Heading>
        {description !== undefined ? (
          <p className="ui-section-heading-description">{description}</p>
        ) : null}
      </div>
      {actions !== undefined ? (
        <div className="ui-section-heading-actions">{actions}</div>
      ) : null}
    </div>
  );
}
