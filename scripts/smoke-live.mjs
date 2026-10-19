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
if (!home.ok || !html.includes("You saved it"))
  throw new Error(`Public landing failed (${home.status})`);

for (const asset of [...html.matchAll(/(?:src|href)="(\/landing\/[^\"]+\.(?:js|css))"/g)].map(
  (match) => match[1],
)) {
  const response = await request(asset);
  if (!response.ok)
    throw new Error(`Static asset failed: ${asset} (${response.status})`);
}

const login = await request("/login");
const loginHtml = await login.text();
if (!login.ok || !loginHtml.includes('id="root"'))
  throw new Error(`Login shell failed (${login.status})`);
for (const asset of [...loginHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1])) {
  if (!(await request(asset)).ok) throw new Error(`App asset failed: ${asset}`);
}
const app = await fetch(`${baseUrl}/app`, { redirect: "manual" });
if (app.status !== 302 || !app.headers.get("location")?.startsWith("/login?"))
  throw new Error(`Private app redirect failed (${app.status})`);

const protectedResponse = await request("/api/v1/jobs");
if (protectedResponse.status !== 401)
  throw new Error(
    `Protected API boundary failed (${protectedResponse.status})`,
  );

console.log(`Smoke test passed: ${baseUrl}`);
