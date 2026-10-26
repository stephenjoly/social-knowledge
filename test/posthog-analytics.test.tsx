import { afterEach, expect, it, vi } from "vitest";
import posthog from "posthog-js";

vi.mock("posthog-js", () => ({
  default: { init: vi.fn(), register: vi.fn() },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.resetModules();
});

it("tracks only the production host and attaches the site to sanitized pageviews", async () => {
  vi.stubGlobal("window", {
    location: {
      hostname: "social-knowledge.stephenjoly.net",
      origin: "https://social-knowledge.stephenjoly.net",
      pathname: "/app/capture/private-id",
    },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ key: "phc_test" }),
  }));

  await import("../web/analytics.js");
  await vi.waitFor(() => expect(posthog.init).toHaveBeenCalledOnce());
  expect(posthog.register).toHaveBeenCalledWith({ site: "social-knowledge.stephenjoly.net" });
  const config = vi.mocked(posthog.init).mock.calls[0]?.[1];
  expect(config).toMatchObject({
    api_host: "/ingest",
    capture_pageview: "history_change",
    autocapture: false,
    disable_session_recording: true,
  });
  const hook = config?.before_send;
  expect(typeof hook).toBe("function");
  if (typeof hook !== "function") throw new Error("missing pageview filter");
  const pageview = hook({
    uuid: "synthetic-event",
    event: "$pageview",
    properties: { $current_url: "https://social-knowledge.stephenjoly.net/app?email=private", email: "private" },
  });
  expect(pageview?.properties).toEqual({
    site: "social-knowledge.stephenjoly.net",
    $current_url: "https://social-knowledge.stephenjoly.net/app",
    $pathname: "/app",
  });
});

it.each(["localhost", "127.0.0.1", "preview-social-knowledge.staging.stephenjoly.net"])(
  "does not initialize on %s",
  async (hostname) => {
    vi.stubGlobal("window", { location: { hostname } });
    vi.stubGlobal("fetch", vi.fn());
    await import("../web/analytics.js");
    expect(fetch).not.toHaveBeenCalled();
    expect(posthog.init).not.toHaveBeenCalled();
  },
);
