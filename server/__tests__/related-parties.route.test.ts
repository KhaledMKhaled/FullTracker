import assert from "node:assert/strict";
import { createServer } from "http";
import express from "express";
import test, { beforeEach, mock } from "node:test";

import type { Supplier } from "@shared/schema";
import { deriveShipmentSupplierIds } from "../storage";
import { registerRoutes } from "../routes";

process.env.DATABASE_URL ||= "postgres://example.com:5432/test";
process.env.SESSION_SECRET ||= "test-secret";

const storageModule = await import("../storage");
const storage = storageModule.storage as any;

const mockGetShipment = mock.method(storage, "getShipment", async (id: number) =>
  id === 10 ? { id, shippingCompanyId: 5 } : undefined,
);
const mockGetSuppliersByIds = mock.method(storage, "getSuppliersByIds", async (ids: number[]) =>
  ids.map((id) => ({ id, name: `Supplier ${id}`, description: "ignore" })) as Supplier[],
);
const mockGetShippingCompany = mock.method(
  storage,
  "getShippingCompany",
  async (id: number) => ({ id, name: `Shipping ${id}` }) as any,
);
const mockGetShipmentSupplierContext = mock.method(
  storage,
  "getShipmentSupplierContext",
  async (id: number) =>
    id === 10
      ? { itemSuppliers: [1, 2], shippingCompanyId: 5, shipmentSuppliers: [1, 2] }
      : { itemSuppliers: [], shippingCompanyId: null, shipmentSuppliers: [] },
);

async function createTestServer() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "test-user" } as any;
    req.isAuthenticated = () => true;
    next();
  });

  const httpServer = createServer(app);
  await registerRoutes(httpServer, app, {
    auth: {
      setupAuth: async () => undefined,
      isAuthenticated: (_req, _res, next) => next(),
      requireRole: () => (_req, _res, next) => next(),
    },
  });
  await new Promise((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as any).port as number;

  const close = () =>
    new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });

  return { port, close };
}

beforeEach(() => {
  mockGetShipment.mock.resetCalls();
  mockGetSuppliersByIds.mock.resetCalls();
  mockGetShippingCompany.mock.resetCalls();
  mockGetShipmentSupplierContext.mock.resetCalls();
});

test("deriveShipmentSupplierIds falls back to product default suppliers", () => {
  const supplierIds = deriveShipmentSupplierIds([
    { supplierId: null, productDefaultSupplierId: 7 },
    { supplierId: 3, productDefaultSupplierId: null },
    { supplierId: null, productDefaultSupplierId: 7 },
  ]);

  assert.deepEqual(supplierIds.sort((a, b) => a - b), [3, 7]);
});

test("related parties endpoint returns distinct suppliers and shipping company", async () => {
  const { port, close } = await createTestServer();

  const response = await fetch(`http://127.0.0.1:${port}/api/shipments/10/related-parties`);
  const body = await response.json();

  await close();

  assert.equal(response.status, 200);
  assert.deepEqual(body.suppliers, [
    { id: 1, name: "Supplier 1" },
    { id: 2, name: "Supplier 2" },
  ]);
  assert.deepEqual(body.shippingCompanies, [{ id: 5, name: "Shipping 5" }]);
});
