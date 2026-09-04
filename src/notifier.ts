import type { AppConfig } from "./config.js";

export class Notifier {
  constructor(
    private readonly config: AppConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async send(input: {
    kind: "complete" | "failed";
    title: string;
    platform: string;
    jobId: string;
  }) {
    if (!this.config.ntfyUrl || !this.config.ntfyTopic) return;
    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      Title:
        input.kind === "complete"
          ? "Social Knowledge complete"
          : "Social Knowledge needs attention",
      Tags: input.kind === "complete" ? "white_check_mark" : "warning",
      Priority: input.kind === "complete" ? "default" : "high",
      Click: `${this.config.appUrl}/?tab=activity&job=${input.jobId}`,
    };
    if (this.config.ntfyToken)
      headers.Authorization = `Bearer ${this.config.ntfyToken}`;
    const safeTitle = input.title
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, 160);
    const response = await this.fetcher(
      `${this.config.ntfyUrl}/${encodeURIComponent(this.config.ntfyTopic)}`,
      { method: "POST", headers, body: `${input.platform} · ${safeTitle}` },
    );
    if (!response.ok) throw new Error(`ntfy returned ${response.status}`);
  }
}
