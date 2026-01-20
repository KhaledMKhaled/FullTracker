import assert from "node:assert/strict";
import { createServer } from "http";
import type { AddressInfo } from "net";
import express from "express";
import test, { beforeEach, mock } from "node:test";

import type { Supplier } from "@shared/schema";

process.env.DATABASE_URL ||= "postgres://example.com:5432/test";
process.env.SESSION_SECRET ||= "test-secret";

const storageModule = await import("../storage");
const storage = storageModule.storage as any;

let suppliersFixture: Supplier[] = [];

const mockedGetAllSuppliers = mock.method(storage, "getAllSuppliers", async () => suppliersFixture);

const { registerRoutes } = await import("../routes");

function buildSupplier(overrides: Partial<Supplier>): Supplier {
  return {
    id: 1,
    name: "Supplier",
    description: null,
    country: "الصين",
    phone: null,
    email: null,
    address: null,
    isActive: true,
    createdAt: new Date("2024-01-02"),
    updatedAt: new Date("2024-01-02"),
    ...overrides,
  };
}

async function createTestServer(user?: { id: string; role: string }) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => {
    req.user = user as any;
    req.isAuthenticated = () => Boolean(user);
    next();
  });

  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;

  const close = () =>
    new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });

  return { port, close };
}

beforeEach(() => {
  mockedGetAllSuppliers.mock.resetCalls();
  suppliersFixture = [];
});

test("GET /api/suppliers returns all suppliers", async () => {
  suppliersFixture = [
    buildSupplier({ id: 1, name: "Visible Supplier" }),
    buildSupplier({ id: 2, name: "Second Supplier" }),
  ];

  const { port, close } = await createTestServer({ id: "manager-1", role: "مدير" });

  const response = await fetch(`http://127.0.0.1:${port}/api/suppliers`);
  const body = await response.json();
  await close();

  assert.equal(response.status, 200);
  assert.equal(body.length, 2);
  assert.deepEqual(
    body.map((supplier: Supplier) => supplier.name),
    ["Visible Supplier", "Second Supplier"],
  );
});
