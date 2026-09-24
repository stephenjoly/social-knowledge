import { verify } from "@node-rs/argon2";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { ensureDemoAccounts } from "../src/demo-accounts.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "./helpers.js";

describe("non-production demo accounts", () => {
  it("is disabled by default and does not advertise credentials", async () => {
    const config = testConfig("/tmp/demo-accounts-disabled");
    const store = new JobStore(":memory:");
    const app = buildApp(config, store, new EventHub());
    try {
      await ensureDemoAccounts(store, config);
      expect(store.userCount()).toBe(0);
      const response = await app.inject({
        method: "GET",
        url: "/api/auth/demo-accounts",
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
      store.close();
    }
  });

  it("reconciles isolated member/admin users and exposes login shortcuts", async () => {
    const config = testConfig("/tmp/demo-accounts-enabled");
    config.demoAccounts = [
      {
        username: "demo-member",
        password: "DemoMember123!",
        role: "member",
      },
      {
        username: "demo-admin",
        password: "DemoAdmin123!",
        role: "admin",
      },
    ];
    const store = new JobStore(":memory:");
    store.createUser("demo-member", "stale-hash", "admin");
    await ensureDemoAccounts(store, config);
    const app = buildApp(config, store, new EventHub());
    try {
      expect(store.listUsers()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ username: "demo-member", role: "member" }),
          expect.objectContaining({ username: "demo-admin", role: "admin" }),
        ]),
      );
      expect(
        await verify(
          store.getUserByUsername("demo-member")!.passwordHash,
          "DemoMember123!",
        ),
      ).toBe(true);

      const advertised = await app.inject({
        method: "GET",
        url: "/api/auth/demo-accounts",
      });
      expect(advertised.statusCode).toBe(200);
      expect(advertised.headers["cache-control"]).toBe("no-store");
      expect(advertised.json().accounts).toEqual(config.demoAccounts);

      for (const account of config.demoAccounts) {
        const login = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: {
            username: account.username,
            password: account.password,
          },
        });
        expect(login.statusCode).toBe(200);
        expect(login.json().user).toMatchObject({
          username: account.username,
          role: account.role,
        });
      }
    } finally {
      await app.close();
      store.close();
    }
  });
});
