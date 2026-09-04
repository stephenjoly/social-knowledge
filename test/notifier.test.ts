import { describe, expect, it, vi } from "vitest";
import { Notifier } from "../src/notifier.js";
import { testConfig } from "./helpers.js";

describe("ntfy notifications", () => {
  it("sends a safe completion message and authenticated dashboard link", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const fetcher = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        requestedUrl = String(url);
        requestedInit = init;
        return new Response("ok", { status: 200 });
      },
    );
    const config = {
      ...testConfig("/tmp/social-knowledge-notifier"),
      ntfyUrl: "https://notify.example",
      ntfyTopic: "social-knowledge",
      ntfyToken: "test-token",
    };
    const notifier = new Notifier(config, fetcher as typeof fetch);
    await notifier.send({
      kind: "complete",
      title: "Lisbon places\nsecret",
      platform: "instagram",
      jobId: "job-1",
    });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(requestedUrl).toBe("https://notify.example/social-knowledge");
    const headers = requestedInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(headers.Click).toContain("?tab=activity&job=job-1");
    expect(requestedInit?.body).toBe("instagram · Lisbon places secret");
  });
});
