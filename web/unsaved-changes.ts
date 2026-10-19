import { useEffect, useRef } from "react";

/**
 * Asks before discarding unsaved Settings edits. Returns true when there is
 * nothing to lose or the person chooses to leave anyway.
 */
export function confirmDiscardUnsaved(summary: string | null) {
  if (!summary) return true;
  return window.confirm(
    `${summary}\n\nLeave without saving? Your changes will be lost.`,
  );
}

/**
 * Reports a plain-language summary of unsaved edits (or null) to the owner of
 * navigation, and warns before the browser reloads or closes the page.
 */
export function useUnsavedChanges(
  summary: string | null,
  onChange: ((summary: string | null) => void) | undefined,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current?.(summary);
    if (!summary) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [summary]);
  useEffect(() => () => onChangeRef.current?.(null), []);
}
