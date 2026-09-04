import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import type { ComponentPropsWithoutRef } from "react";

export function ScrollArea({
  className = "",
  children,
  ...props
}: ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      className={`ui-scroll-area ${className}`.trim()}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport className="ui-scroll-viewport">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        className="ui-scrollbar"
        orientation="vertical"
      >
        <ScrollAreaPrimitive.Thumb className="ui-scroll-thumb" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}
