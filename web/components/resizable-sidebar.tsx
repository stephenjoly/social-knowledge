import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
} from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "./ui/button";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_CONTENT_RESERVE,
  SIDEBAR_DESKTOP_QUERY,
  clampSidebarWidth,
  containerSidebarMax,
  parseSidebarLayout,
  resizeSidebarWidth,
  serializeSidebarLayout,
  sidebarWidthForKey,
  type SidebarLimits,
} from "../sidebar-layout";

function readStored(storageKey: string, limits: SidebarLimits) {
  try {
    return parseSidebarLayout(window.localStorage.getItem(storageKey), limits);
  } catch {
    return parseSidebarLayout(null, limits);
  }
}

function useDesktopSidebar(query: string) {
  const [desktop, setDesktop] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return desktop;
}

export function useResizableSidebar(
  storageKey: string,
  limits: SidebarLimits,
  options: { desktopQuery?: string; contentReserve?: number } = {},
) {
  const { minWidth, maxWidth, defaultWidth } = limits;
  const desktopQuery = options.desktopQuery ?? SIDEBAR_DESKTOP_QUERY;
  const contentReserve = options.contentReserve ?? SIDEBAR_CONTENT_RESERVE;
  const layoutRef = useRef<HTMLElement>(null);
  const desktop = useDesktopSidebar(desktopQuery);
  const [layout, setLayout] = useState(() => readStored(storageKey, limits));
  const [containerMax, setContainerMax] = useState(maxWidth);
  const pendingFocus = useRef<"expand" | "collapse" | null>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const collapseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, serializeSidebarLayout(layout));
    } catch {
      // The sidebar still works when the browser refuses storage.
    }
  }, [layout, storageKey]);

  useEffect(() => {
    const frame = layoutRef.current?.parentElement;
    if (!frame || !desktop) return;
    const update = () => {
      setContainerMax(
        containerSidebarMax(frame.clientWidth, minWidth, maxWidth, contentReserve),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [contentReserve, desktop, maxWidth, minWidth]);

  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target === "expand") expandRef.current?.focus();
    if (target === "collapse") collapseRef.current?.focus();
  }, [layout.collapsed]);

  const widthLimit = Math.min(maxWidth, containerMax);
  const width = clampSidebarWidth(
    Math.min(layout.width, widthLimit),
    minWidth,
    maxWidth,
  );
  const collapsed = desktop && layout.collapsed;

  return {
    layoutRef,
    desktop,
    collapsed,
    width,
    minWidth,
    maxWidth: widthLimit,
    expandRef,
    collapseRef,
    layoutStyle: desktop
      ? {
          gridTemplateColumns: collapsed
            ? `${SIDEBAR_COLLAPSED_WIDTH}px minmax(0, 1fr)`
            : `${width}px minmax(0, 1fr)`,
        }
      : undefined,
    collapse() {
      pendingFocus.current = "expand";
      setLayout((current) => ({ ...current, collapsed: true }));
    },
    expand() {
      pendingFocus.current = "collapse";
      setLayout((current) => ({ ...current, collapsed: false }));
    },
    resize(next: number) {
      setLayout((current) => ({
        ...current,
        width: clampSidebarWidth(next, minWidth, widthLimit),
      }));
    },
    resetWidth() {
      setLayout((current) => ({ ...current, width: defaultWidth }));
    },
  };
}

export function SidebarCollapseButton({
  label,
  buttonRef,
  onClick,
}: {
  label: string;
  buttonRef: Ref<HTMLButtonElement>;
  onClick: () => void;
}) {
  return (
    <Button
      ref={buttonRef}
      type="button"
      variant="ghost"
      size="icon"
      className="sidebar-collapse"
      aria-label={`Hide ${label}`}
      aria-expanded={true}
      title={`Hide ${label}`}
      onClick={onClick}
    >
      <PanelLeftClose aria-hidden="true" />
    </Button>
  );
}

export function SidebarRail({
  label,
  buttonRef,
  onClick,
}: {
  label: string;
  buttonRef: Ref<HTMLButtonElement>;
  onClick: () => void;
}) {
  return (
    <div className="sidebar-rail">
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="icon"
        className="sidebar-expand"
        aria-label={`Show ${label}`}
        aria-expanded={false}
        title={`Show ${label}`}
        onClick={onClick}
      >
        <PanelLeftOpen aria-hidden="true" />
      </Button>
    </div>
  );
}

export function SidebarResizeHandle({
  label,
  width,
  minWidth,
  maxWidth,
  onResize,
  onReset,
}: {
  label: string;
  width: number;
  minWidth: number;
  maxWidth: number;
  onResize: (width: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(
    () => () => {
      document.body.classList.remove("sidebar-resizing");
    },
    [],
  );

  function finish(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    drag.current = null;
    delete event.currentTarget.dataset.dragging;
    document.body.classList.remove("sidebar-resizing");
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
    };
    event.currentTarget.dataset.dragging = "true";
    document.body.classList.add("sidebar-resizing");
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer move events still update the width while the pointer stays on the handle.
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    onResize(
      resizeSidebarWidth(
        active.startWidth,
        event.clientX - active.startX,
        minWidth,
        maxWidth,
      ),
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onReset();
      return;
    }
    const next = sidebarWidthForKey(
      width,
      event.key,
      { minWidth, maxWidth },
      event.shiftKey,
    );
    if (next === null) return;
    event.preventDefault();
    onResize(next);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      aria-valuetext={`${width} pixels`}
      title="Drag to resize. Double-click to reset."
      tabIndex={0}
      className="sidebar-resize-handle"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  );
}
