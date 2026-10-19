export type SidebarLayout = {
  width: number;
  collapsed: boolean;
};

export type SidebarLimits = {
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
};

export const APP_SIDEBAR: SidebarLimits = {
  defaultWidth: 264,
  minWidth: 220,
  maxWidth: 420,
};

export const SIDEBAR_CONTENT_RESERVE = 480;
export const SIDEBAR_COLLAPSED_WIDTH = 72;
export const SIDEBAR_DESKTOP_QUERY = "(min-width: 781px)";

export function clampSidebarWidth(
  width: number,
  minWidth: number,
  maxWidth: number,
): number {
  if (!Number.isFinite(width)) return minWidth;
  return Math.round(Math.min(maxWidth, Math.max(minWidth, width)));
}

export function resizeSidebarWidth(
  startWidth: number,
  deltaX: number,
  minWidth: number,
  maxWidth: number,
): number {
  return clampSidebarWidth(startWidth + deltaX, minWidth, maxWidth);
}

export function sidebarWidthForKey(
  width: number,
  key: string,
  limits: Pick<SidebarLimits, "minWidth" | "maxWidth">,
  shiftKey = false,
): number | null {
  if (key === "Home") return limits.minWidth;
  if (key === "End") return limits.maxWidth;
  const step = key === "ArrowLeft" ? -16 : key === "ArrowRight" ? 16 : 0;
  if (step === 0) return null;
  return clampSidebarWidth(
    width + (shiftKey ? step * 2 : step),
    limits.minWidth,
    limits.maxWidth,
  );
}

export function containerSidebarMax(
  containerWidth: number,
  minWidth: number,
  maxWidth: number,
  reservedContentWidth = SIDEBAR_CONTENT_RESERVE,
): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return maxWidth;
  return Math.max(
    minWidth,
    Math.min(maxWidth, Math.floor(containerWidth - reservedContentWidth)),
  );
}

export function parseSidebarLayout(
  raw: string | null,
  limits: SidebarLimits,
): SidebarLayout {
  const fallback: SidebarLayout = {
    width: limits.defaultWidth,
    collapsed: false,
  };
  if (!raw) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (!parsed || typeof parsed !== "object") return fallback;
  const record = parsed as Record<string, unknown>;
  return {
    width:
      typeof record.width === "number"
        ? clampSidebarWidth(record.width, limits.minWidth, limits.maxWidth)
        : fallback.width,
    collapsed: typeof record.collapsed === "boolean" ? record.collapsed : false,
  };
}

export function serializeSidebarLayout(layout: SidebarLayout): string {
  return JSON.stringify({
    width: layout.width,
    collapsed: layout.collapsed,
  });
}
