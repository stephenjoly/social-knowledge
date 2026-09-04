import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { loadConfig } from "./config.js";
import { JobStore } from "./db.js";
import { AuthService } from "./auth.js";

const [action, username, extra] = process.argv.slice(2);
if (
  !username ||
  (!username.startsWith("deploy-smoke-") &&
    username !== loadConfig().bootstrapAdminUsername.toLowerCase())
)
  throw new Error("invalid_smoke_username");
const store = new JobStore(loadConfig().databasePath);
try {
  if (action === "create") {
    const password = process.env.SMOKE_USER_PASSWORD;
    if (!password) throw new Error("missing_smoke_password");
    const user = store.createUser(username, await hash(password), "smoke");
    store.seedSmokeArchive(user.id);
  } else if (action === "delete") {
    store.deleteUser(username);
  } else if (action === "create-key") {
    const user = store.getUserByUsername(username);
    if (!user) throw new Error("user_not_found");
    const token = `sk_${randomBytes(32).toString("base64url")}`;
    const key = store.createApiKey(
      user.id,
      extra || "Deployment Agent API",
      AuthService.hashToken(token),
      token.slice(0, 10),
    );
    process.stdout.write(`${key.id}\t${token}`);
  } else if (action === "delete-key") {
    const user = store.getUserByUsername(username);
    if (user && extra) store.deleteApiKey(user.id, extra);
  } else throw new Error("invalid_action");
} finally {
  store.close();
}
