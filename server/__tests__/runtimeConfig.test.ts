import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRuntimeConfig } from "../runtimeConfig";

test("production refuses missing or placeholder secrets", () => {
  assert.throws(() => validateRuntimeConfig({ NODE_ENV: "production" }), /DATABASE_URL/);
  assert.throws(() => validateRuntimeConfig({ NODE_ENV: "production", DATABASE_URL: "test" }), /SESSION_SECRET/);
  assert.throws(() => validateRuntimeConfig({ NODE_ENV: "production", DATABASE_URL: "test",
    SESSION_SECRET: "fallback-secret-change-in-production" }), /SESSION_SECRET/);
});
test("VPS binding and development defaults", () => {
  assert.deepEqual(validateRuntimeConfig({}), { host: "0.0.0.0", port: 5000 });
  assert.deepEqual(validateRuntimeConfig({ NODE_ENV: "production", DATABASE_URL: "test",
    SESSION_SECRET: "a".repeat(64), HOST: "127.0.0.1", STORAGE_MODE: "vps" }),
  { host: "127.0.0.1", port: 5000 });
  assert.throws(() => validateRuntimeConfig({ PORT: "5000oops" }));
  assert.throws(() => validateRuntimeConfig({ STORAGE_MODE: "unknown" }));
});
