import path from "node:path";
import { loadConfig } from "../src/config.js";

export function testConfig(root: string) {
  return loadConfig({
    HOST: "127.0.0.1",
    PORT: "8787",
    LOG_LEVEL: "silent",
    DATA_DIR: path.join(root, "data"),
    VAULT_DIR: path.join(root, "vault"),
    MEDIA_DIR: path.join(root, "media"),
    API_TOKEN: "test-token-that-is-at-least-24-characters",
    OPENAI_API_KEY: "test-key",
    FETCH_COMMENTS: "false",
  });
}
