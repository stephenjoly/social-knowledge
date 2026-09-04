const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:8787").replace(
  /\/$/,
  "",
);

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "error" });
  return response;
}

const health = await request("/health");
if (!health.ok || (await health.json()).status !== "ok")
  throw new Error(`Health check failed (${health.status})`);

const home = await request("/");
const html = await home.text();
if (!home.ok || !html.includes("Social Knowledge"))
  throw new Error(`Dashboard shell failed (${home.status})`);

for (const asset of [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
  (match) => match[1],
)) {
  const response = await request(asset);
  if (!response.ok)
    throw new Error(`Static asset failed: ${asset} (${response.status})`);
}

const protectedResponse = await request("/api/v1/jobs");
if (protectedResponse.status !== 401)
  throw new Error(
    `Protected API boundary failed (${protectedResponse.status})`,
  );

console.log(`Smoke test passed: ${baseUrl}`);
