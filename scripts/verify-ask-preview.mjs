// Read-only fixture acceptance. Uses only the public synthetic review account.
import assert from "node:assert/strict";
const origin = new URL(process.env.ASK_REVIEW_BASE_URL ?? "");
assert.equal(origin.protocol, "https:");
assert.match(origin.hostname, /^preview-social-knowledge-staging-[a-z0-9-]+\.staging\.stephenjoly\.net$/);
const health = await fetch(new URL("/health", origin));
assert.equal(health.status, 200);
const login = await fetch(new URL("/api/auth/login", origin), { method: "POST", headers: { "content-type": "application/json", origin: origin.origin }, body: JSON.stringify({ username: "ask-review", password: "synthetic-review-password" }) });
assert.equal(login.status, 200, "Synthetic review login must succeed");
const cookie = login.headers.getSetCookie().map((item) => item.split(";")[0]).join("; ");
assert.ok(cookie);
const get = async (path) => {
  const response = await fetch(new URL(path, origin), { headers: { cookie } });
  assert.equal(response.status, 200);
  return response.json();
};
try {
  const { conversations } = await get("/api/v1/conversations");
  const providers = await get("/api/v1/ai-providers");
  const { preferences } = await get("/api/v1/preferences");
  assert.ok(conversations.length >= 12);
  assert.ok(conversations.some((chat) => chat.pinnedAt));
  assert.ok(conversations.some((chat) => chat.lastStatus === "pending"));
  assert.ok(conversations.some((chat) => chat.lastStatus === "failed"));
  assert.deepEqual(providers.providers.filter((provider) => provider.connected).map((provider) => provider.id).sort(), ["cerebras", "openai"]);
  assert.equal(providers.readiness.ask, true);
  assert.equal(typeof preferences.askSourcesPanel, "boolean");
  assert.ok(["enter", "mod-enter"].includes(preferences.sendWith));
  console.log(JSON.stringify({ health: health.status, syntheticLogin: login.status, chats: conversations.length, pinned: conversations.filter((chat) => chat.pinnedAt).length, pending: conversations.filter((chat) => chat.lastStatus === "pending").length, failed: conversations.filter((chat) => chat.lastStatus === "failed").length, connectedProviders: ["openai", "cerebras"], preferences: "valid" }));
} finally {
  const logout = await fetch(new URL("/api/auth/logout", origin), { method: "POST", headers: { cookie, origin: origin.origin } });
  assert.equal(logout.status, 200);
}
