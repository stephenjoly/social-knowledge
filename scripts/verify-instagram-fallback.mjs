import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Run from the built repository/runtime root. All credentials, database rows,
// media, and subprocess responses are synthetic and removed on completion.
const loadRuntime = (name) =>
  import(pathToFileURL(path.resolve("dist", `${name}.js`)));
const [
  { MediaDownloader },
  { JobStore },
  { PlatformConnectionService },
  { loadConfig },
] = await Promise.all(
  ["downloader", "db", "platform-connections", "config"].map(loadRuntime),
);

if (process.argv.includes("--check-ytdlp")) {
  const probe = spawnSync(
    "yt-dlp",
    [
      "--ignore-config",
      "--no-cookies",
      "--no-cookies-from-browser",
      "--version",
    ],
    { encoding: "utf8" },
  );
  assert.equal(
    probe.status,
    0,
    "Installed yt-dlp must accept the anonymous flags",
  );
}

const root = await mkdtemp(path.join(tmpdir(), "instagram-fallback-smoke-"));
const originalPath = process.env.PATH;
let store;
try {
  const bin = path.join(root, "bin");
  await mkdir(bin);
  await mkdir(path.join(root, "data"));
  const attemptsPath = path.join(root, "attempts.jsonl");
  const executable = `#!${process.execPath}
import assert from "node:assert/strict";
import { appendFile, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
const args = process.argv.slice(2);
const output = args[args.indexOf("--output") + 1];
const cookieIndex = args.indexOf("--cookies");
await appendFile(${JSON.stringify(attemptsPath)}, JSON.stringify({ authenticated: cookieIndex !== -1 }) + "\\n");
if (cookieIndex !== -1) {
  assert.match(await readFile(args[cookieIndex + 1], "utf8"), /synthetic-session/);
  await writeFile(output.replace("%(ext)s", "mp4.part"), "incomplete");
  process.stderr.write("ERROR: [Instagram] synthetic-reel: Failed to parse JSON\\n");
  process.exit(1);
}
assert.deepEqual(await readdir(path.dirname(output)), []);
for (const flag of ["--ignore-config", "--no-cookies", "--no-cookies-from-browser"]) assert.ok(args.includes(flag));
await writeFile(output.replace("%(ext)s", "info.json"), JSON.stringify({ id: "synthetic-reel", extractor_key: "Instagram", duration: 15 }));
await writeFile(output.replace("%(ext)s", "mp4"), "synthetic-video");
`;
  await writeFile(path.join(bin, "yt-dlp"), executable, { mode: 0o700 });
  process.env.PATH = `${bin}${path.delimiter}${originalPath ?? ""}`;
  const config = loadConfig({
    DATA_DIR: path.join(root, "data"),
    VAULT_DIR: path.join(root, "vault"),
    MEDIA_DIR: path.join(root, "media"),
    API_TOKEN: "synthetic-smoke-token-at-least-32-characters",
    FETCH_COMMENTS: "false",
  });
  store = new JobStore(config.databasePath);
  const owner = store.createUser("synthetic-instagram-smoke", "unused");
  const connections = new PlatformConnectionService(store, config);
  connections.save(
    owner.id,
    "instagram",
    [
      "# Netscape HTTP Cookie File",
      ".instagram.com\tTRUE\t/\tTRUE\t1999999999\tsessionid\tsynthetic-session",
    ].join("\n"),
  );
  const sourceUrl = "https://www.instagram.com/reel/synthetic-reel/";
  const result = await new MediaDownloader(config, connections).download(
    "synthetic-job",
    sourceUrl,
    owner.id,
  );
  assert.equal(result.metadata.webpageUrl, sourceUrl);
  assert.equal(await readFile(result.videoPath, "utf8"), "synthetic-video");
  assert.deepEqual(
    (await readFile(attemptsPath, "utf8")).trim().split("\n").map(JSON.parse),
    [{ authenticated: true }, { authenticated: false }],
  );
  assert.equal(connections.list(owner.id)[1].lastUsedAt, null);
  assert.match(
    connections.cookiesFor(owner.id, "instagram"),
    /synthetic-session/,
  );
  console.log(
    "Instagram fallback smoke passed: authenticated JSON failure -> anonymous download; source and saved session preserved.",
  );
} finally {
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  store?.close();
  await rm(root, { recursive: true, force: true });
}
