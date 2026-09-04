const base = process.env.E2E_BASE_URL || "http://localhost:8787";
const token = process.env.AGENT_API_TOKEN;
if (!token) throw new Error("AGENT_API_TOKEN is required");
async function call(id, method, params = {}) {
  const response = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  if (!response.ok) throw new Error(`MCP ${method} failed: ${response.status}`);
  return response.json();
}
const initialized = await call(1, "initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "deployment-smoke", version: "1.0.0" },
});
if (initialized.result?.serverInfo?.name !== "Social Knowledge")
  throw new Error("MCP initialization failed");
const listed = await call(2, "tools/list");
const names = listed.result?.tools?.map((tool) => tool.name) || [];
for (const expected of [
  "search_knowledge",
  "get_capture",
  "list_topics",
  "browse_category",
])
  if (!names.includes(expected))
    throw new Error(`Missing MCP tool: ${expected}`);
if (
  listed.result.tools.some(
    (tool) =>
      !tool.annotations?.readOnlyHint || tool.annotations?.destructiveHint,
  )
)
  throw new Error("Unsafe MCP tool annotation");
const search = await call(3, "tools/call", {
  name: "search_knowledge",
  arguments: { query: "lisbon", limit: 2 },
});
if (!Array.isArray(search.result?.structuredContent?.results))
  throw new Error("MCP search did not return structured results");
console.log("MCP smoke passed");
