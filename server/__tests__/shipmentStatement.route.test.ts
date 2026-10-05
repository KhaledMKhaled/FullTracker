import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { createServer } from "node:http";
import { registerRoutes } from "../routes";
import { isAuthenticated } from "../auth";

test("statement endpoint enforces existing read authentication, validates IDs and supports archived shipments", async () => {
  const app = express();
  let reads = 0;
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => req.headers["x-test-auth"] === "yes") as any;
    next();
  });
  const server = createServer(app);
  await registerRoutes(server, app, {
    auth: { setupAuth: async () => {}, isAuthenticated, requireRole: () => isAuthenticated },
    storage: {
      getShipment: async (id: number) => {
        reads++;
        return id === 5 ? { id: 5, status: "مؤرشفة", shipmentCode: "TEST" } : undefined;
      },
      getShipmentItems: async () => [],
      getShipmentPayments: async () => [],
      getPaymentAllocationsByShipmentId: async () => [],
    } as any,
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/api/shipments`;
  try {
    assert.equal((await fetch(`${url}/5/account-statement`)).status, 401);
    assert.equal(reads, 0);
    const headers = { "x-test-auth": "yes" };
    assert.equal((await fetch(`${url}/abc/account-statement`, { headers })).status, 400);
    assert.equal((await fetch(`${url}/999/account-statement`, { headers })).status, 404);
    const response = await fetch(`${url}/5/account-statement`, { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).shipment.status, "مؤرشفة");
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
