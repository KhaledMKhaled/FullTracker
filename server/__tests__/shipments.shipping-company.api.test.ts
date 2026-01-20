import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import test, { beforeEach } from "node:test";

import type { Shipment } from "@shared/schema";
import { registerRoutes } from "../routes";

process.env.DATABASE_URL ||= "postgres://example.com:5432/test";
process.env.SESSION_SECRET ||= "test-secret";

class FakeStorage {
  public shipments: Shipment[] = [];

  reset() {
    this.shipments = [];
  }

  async getShipment(id: number): Promise<Shipment | undefined> {
    return this.shipments.find((shipment) => shipment.id === id);
  }

  async getAllShipments(): Promise<Shipment[]> {
    return this.shipments;
  }
}

const storage = new FakeStorage();
const auditEvents: Array<Record<string, unknown>> = [];

const authStubs = {
  setupAuth: async () => {},
  isAuthenticated: (_req: any, _res: any, next: () => void) => next(),
  requireRole: () => (req: any, _res: any, next: () => void) => {
    req.isAuthenticated = () => true;
    req.user ||= { id: "user-1", role: "مدير" };
    next();
  },
};

const shipmentFixture = (id: number, overrides: Partial<Shipment> = {}): Shipment => {
  const now = new Date("2024-02-01T00:00:00Z");
  return {
    id,
    shipmentCode: `SHIP-${id}`,
    shipmentName: `Shipment ${id}`,
    purchaseDate: now,
    status: "جديدة",
    invoiceCustomsDate: null,
    shippingCompanyId: null,
    createdByUserId: null,
    purchaseCostRmb: "0",
    purchaseCostEgp: "0",
    purchaseRmbToEgpRate: "0",
    commissionCostRmb: "0",
    commissionCostEgp: "0",
    shippingCostRmb: "0",
    shippingCostEgp: "0",
    customsCostEgp: "0",
    takhreegCostEgp: "0",
    finalTotalCostEgp: "0",
    totalPaidEgp: "0",
    balanceEgp: "0",
    partialDiscountRmb: "0",
    discountNotes: null,
    lastPaymentDate: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

const shipmentsService = {
  createShipmentWithItems: async (payload: any, _userId?: string) => {
    const shipment = shipmentFixture(storage.shipments.length + 1, {
      shipmentCode: payload.shipmentCode,
      shipmentName: payload.shipmentName,
      purchaseDate: payload.purchaseDate ? new Date(payload.purchaseDate) : new Date(),
      purchaseRmbToEgpRate: payload.purchaseRmbToEgpRate ?? "0",
      shippingCompanyId: payload.shippingCompanyId ?? null,
    });
    storage.shipments.push(shipment);
    return shipment;
  },
  updateShipmentWithItems: async () => {
    throw new Error("Not implemented");
  },
};

async function createTestServer() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  const httpServer = createServer(app);
  await registerRoutes(httpServer, app, {
    storage: storage as any,
    shipments: shipmentsService as any,
    auditLogger: (event) => {
      auditEvents.push(event as Record<string, unknown>);
    },
    auth: authStubs,
  });

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return { httpServer, baseUrl };
}

beforeEach(() => {
  storage.reset();
  auditEvents.length = 0;
});

test("POST /api/shipments persists shippingCompanyId and can be fetched", async () => {
  const { httpServer, baseUrl } = await createTestServer();
  const shippingCompanyId = 42;

  const response = await fetch(`${baseUrl}/api/shipments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shipmentCode: "SHIP-TEST-1",
      shipmentName: "Hidden Supplier Shipment",
      purchaseDate: "2024-02-10",
      purchaseRmbToEgpRate: "7.1",
      shippingCompanyId,
      items: [],
    }),
  });

  assert.equal(response.status, 200);
  const created = await response.json();
  assert.equal(created.shippingCompanyId, shippingCompanyId);

  const fetchResponse = await fetch(`${baseUrl}/api/shipments/${created.id}`);
  assert.equal(fetchResponse.status, 200);
  const fetched = await fetchResponse.json();
  assert.equal(fetched.shippingCompanyId, shippingCompanyId);

  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});
