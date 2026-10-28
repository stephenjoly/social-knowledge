import { describe, expect, it } from "vitest";
import {
  APP_SIDEBAR,
  SIDEBAR_CONTENT_RESERVE,
  clampSidebarWidth,
  containerSidebarMax,
  parseSidebarLayout,
  resizeSidebarWidth,
  serializeSidebarLayout,
  sidebarWidthForKey,
} from "../web/sidebar-layout.js";

describe("sidebar layout", () => {
  it("clamps drag movement to the sidebar limits", () => {
    expect(clampSidebarWidth(180, 220, 420)).toBe(220);
    expect(clampSidebarWidth(800, 220, 420)).toBe(420);
    expect(clampSidebarWidth(333.4, 220, 420)).toBe(333);
    expect(clampSidebarWidth(Number.NaN, 220, 420)).toBe(220);
    expect(resizeSidebarWidth(264, 40, 220, 420)).toBe(304);
    expect(resizeSidebarWidth(264, -200, 220, 420)).toBe(220);
  });

  it("resizes from the keyboard and ignores unrelated keys", () => {
    expect(sidebarWidthForKey(300, "ArrowRight", APP_SIDEBAR)).toBe(316);
    expect(sidebarWidthForKey(300, "ArrowLeft", APP_SIDEBAR, true)).toBe(268);
    expect(sidebarWidthForKey(300, "Home", APP_SIDEBAR)).toBe(APP_SIDEBAR.minWidth);
    expect(sidebarWidthForKey(300, "End", APP_SIDEBAR)).toBe(APP_SIDEBAR.maxWidth);
    expect(sidebarWidthForKey(300, "Escape", APP_SIDEBAR)).toBeNull();
  });

  it("keeps a readable content column when the window is narrow", () => {
    expect(containerSidebarMax(900, 220, 420, SIDEBAR_CONTENT_RESERVE)).toBe(420);
    expect(containerSidebarMax(700, 220, 420, SIDEBAR_CONTENT_RESERVE)).toBe(220);
    expect(containerSidebarMax(0, 220, 420)).toBe(420);
  });

  it("restores a saved width and discards malformed preferences", () => {
    expect(parseSidebarLayout(null, APP_SIDEBAR)).toEqual({
      width: 264,
      collapsed: false,
    });
    expect(parseSidebarLayout("{", APP_SIDEBAR)).toEqual({
      width: 264,
      collapsed: false,
    });
    expect(parseSidebarLayout("[]", APP_SIDEBAR)).toEqual({
      width: 264,
      collapsed: false,
    });
    expect(
      parseSidebarLayout(JSON.stringify({ width: 900, collapsed: "yes" }), APP_SIDEBAR),
    ).toEqual({ width: 420, collapsed: false });
    expect(
      parseSidebarLayout(
        JSON.stringify({ width: 100, collapsed: true, extra: "ignore" }),
        APP_SIDEBAR,
      ),
    ).toEqual({ width: 220, collapsed: true });

    const saved = parseSidebarLayout(
      serializeSidebarLayout({ width: 360, collapsed: true }),
      APP_SIDEBAR,
    );
    expect(saved).toEqual({ width: 360, collapsed: true });
  });
});
