import { gunzipSync } from "node:zlib";
const base = (process.env.SMOKE_BASE_URL || "http://localhost:8787").replace(
  /\/$/,
  "",
);
const token = process.env.AGENT_API_TOKEN;
if (!token) throw new Error("Missing AGENT_API_TOKEN");
const headers = { Authorization: `Bearer ${token}` };
async function json(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  if (!response.ok) throw new Error(`${path} failed (${response.status})`);
  return response.json();
}
const spec = await fetch(base + "/openapi.json");
if (!spec.ok || (await spec.json()).openapi !== "3.1.0")
  throw new Error("OpenAPI document failed");
const search = await json("/api/v1/knowledge/search?q=lisbon&limit=2");
if (!search.results?.length)
  throw new Error("Knowledge canary returned no results");
const id = search.results[0].id;
if (
  "transcript" in search.results[0] ||
  JSON.stringify(search.results[0]).includes("notePath")
)
  throw new Error("Compact search leaked private fields");
const detail = await json(`/api/v1/knowledge/captures/${id}`);
if (
  "transcript" in detail.capture ||
  JSON.stringify(detail).includes("notePath") ||
  JSON.stringify(detail).includes('"path"')
)
  throw new Error("Default detail leaked excluded fields");
const included = await json(
  `/api/v1/knowledge/captures/${id}?include=transcript,comments`,
);
if (!("transcript" in included.capture) || !("comments" in included.capture))
  throw new Error("Explicit includes failed");
const list = await json("/api/v1/knowledge/captures?limit=2");
if (!list.captures?.length) throw new Error("Capture traversal failed");
const topics = await json("/api/v1/knowledge/topics");
if (!topics.nodes?.length) throw new Error("Topic discovery failed");
const created = await json("/api/v1/knowledge/exports", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ include: ["transcript"] }),
});
let status;
for (let attempt = 0; attempt < 30; attempt++) {
  status = await json(`/api/v1/knowledge/exports/${created.export.id}`);
  if (status.export.status !== "pending") break;
  await new Promise((resolve) => setTimeout(resolve, 200));
}
if (status?.export.status !== "complete")
  throw new Error("Export did not complete");
const download = await fetch(
  `${base}/api/v1/knowledge/exports/${created.export.id}/download`,
  { headers },
);
if (!download.ok) throw new Error("Export download failed");
const lines = gunzipSync(Buffer.from(await download.arrayBuffer()))
  .toString()
  .trim()
  .split("\n");
if (
  lines.length !== status.export.recordCount ||
  JSON.parse(lines[0]).schemaVersion !== "1"
)
  throw new Error("Export validation failed");
console.log("Agent API acceptance passed");
