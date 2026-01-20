import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import test, { beforeEach, mock } from "node:test";

import type { PaymentAllocation, Shipment, ShipmentItem, ShipmentPayment, Supplier } from "@shared/schema";

process.env.DATABASE_URL ||= "postgres://example.com:5432/test";
process.env.SESSION_SECRET ||= "test-secret";

type ShipmentFixture = Shipment;
type SupplierFixture = Supplier;

const shipmentFixtures = new Map<number, ShipmentFixture>();
const supplierFixtures = new Map<number, SupplierFixture>();
const itemsByShipment = new Map<number, ShipmentItem[]>();
const paymentsByShipment = new Map<number, ShipmentPayment[]>();
const allocationsByShipment = new Map<number, PaymentAllocation[]>();

const storageModule = await import("../storage");
const storage = storageModule.storage as any;

const mockedGetShipment = mock.method(
  storage,
  "getShipment",
  async (id: number) => shipmentFixtures.get(id),
);
const mockedGetSupplier = mock.method(
  storage,
  "getSupplier",
  async (id: number) => supplierFixtures.get(id),
);
const mockedGetShipmentItems = mock.method(
  storage,
  "getShipmentItems",
  async (shipmentId: number) => itemsByShipment.get(shipmentId) ?? [],
);
const mockedGetShipmentPayments = mock.method(
  storage,
  "getShipmentPayments",
  async (shipmentId: number) => paymentsByShipment.get(shipmentId) ?? [],
);
const mockedGetPaymentAllocationsByShipmentId = mock.method(
  storage,
  "getPaymentAllocationsByShipmentId",
  async (shipmentId: number) => allocationsByShipment.get(shipmentId) ?? [],
);

const { registerRoutes } = await import("../routes");

function resetFixtures() {
  shipmentFixtures.clear();
  supplierFixtures.clear();
  itemsByShipment.clear();
  paymentsByShipment.clear();
  allocationsByShipment.clear();
  mockedGetShipment.mock.resetCalls();
  mockedGetSupplier.mock.resetCalls();
  mockedGetShipmentItems.mock.resetCalls();
  mockedGetShipmentPayments.mock.resetCalls();
  mockedGetPaymentAllocationsByShipmentId.mock.resetCalls();
}

async function createTestServer() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => {
    req.user = { id: "user-1", role: "مدير" } as any;
    req.isAuthenticated = () => true;
    next();
  });

  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const { port } = httpServer.address() as AddressInfo;
  return { httpServer, baseUrl: `http://127.0.0.1:${port}` };
}

beforeEach(() => {
  resetFixtures();
});

test("GET goods summary returns supplier-specific totals with allocations", async () => {
  const shipmentId = 1;
  const supplierId = 10;

  shipmentFixtures.set(shipmentId, {
    id: shipmentId,
    shipmentCode: "SHP-1",
    shipmentName: "شحنة اختبار",
    status: "جديدة",
    purchaseDate: null,
    arrivalDate: null,
    shippingCompanyId: null,
    purchaseCostRmb: "0",
    purchaseCostEgp: "0",
    shippingCostRmb: "0",
    shippingCostEgp: "0",
    commissionCostRmb: "0",
    commissionCostEgp: "0",
    customsCostEgp: "0",
    takhreegCostEgp: "0",
    finalTotalCostEgp: "0",
    totalPaidEgp: "0",
    balanceEgp: "0",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastPaymentDate: null,
    partialDiscountRmb: null,
  } as ShipmentFixture);

  supplierFixtures.set(supplierId, {
    id: supplierId,
    name: "Supplier A",
    contactName: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as SupplierFixture);

  itemsByShipment.set(shipmentId, [
    {
      id: 1,
      shipmentId,
      supplierId,
      productName: "Item A",
      totalPurchaseCostRmb: "500",
      cartonsCtn: 0,
      unitCostRmb: null,
      purchaseCostPerCartonRmb: null,
      customsCostPerCartonEgp: null,
      takhreegCostPerCartonEgp: null,
      totalCustomsCostEgp: null,
      totalTakhreegCostEgp: null,
      totalPieces: null,
      productTypeId: null,
      sku: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      shipmentId,
      supplierId,
      productName: "Item B",
      totalPurchaseCostRmb: "500",
      cartonsCtn: 0,
      unitCostRmb: null,
      purchaseCostPerCartonRmb: null,
      customsCostPerCartonEgp: null,
      takhreegCostPerCartonEgp: null,
      totalCustomsCostEgp: null,
      totalTakhreegCostEgp: null,
      totalPieces: null,
      productTypeId: null,
      sku: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ] as ShipmentItem[]);

  paymentsByShipment.set(shipmentId, [
    {
      id: 11,
      shipmentId,
      partyType: "supplier",
      partyId: supplierId,
      paymentDate: new Date(),
      paymentCurrency: "RMB",
      amountOriginal: "200",
      exchangeRateToEgp: null,
      amountEgp: "0",
      costComponent: "تكلفة البضاعة",
      paymentMethod: "نقدي",
      cashReceiverName: null,
      referenceNumber: null,
      note: null,
      attachmentUrl: null,
      attachmentMimeType: null,
      attachmentSize: null,
      attachmentOriginalName: null,
      attachmentUploadedAt: null,
      createdByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 12,
      shipmentId,
      partyType: "supplier",
      partyId: supplierId,
      paymentDate: new Date(),
      paymentCurrency: "EGP",
      amountOriginal: "0",
      exchangeRateToEgp: "5",
      amountEgp: "1000",
      costComponent: "تكلفة البضاعة",
      paymentMethod: "تحويل بنكي",
      cashReceiverName: null,
      referenceNumber: null,
      note: null,
      attachmentUrl: null,
      attachmentMimeType: null,
      attachmentSize: null,
      attachmentOriginalName: null,
      attachmentUploadedAt: null,
      createdByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ] as ShipmentPayment[]);

  allocationsByShipment.set(shipmentId, [
    {
      id: 21,
      paymentId: 99,
      shipmentId,
      supplierId,
      component: "تكلفة البضاعة",
      currency: "RMB",
      allocatedAmount: "100",
      createdByUserId: "user-1",
      createdAt: new Date(),
    },
  ] as PaymentAllocation[]);

  const { httpServer, baseUrl } = await createTestServer();

  const response = await fetch(
    `${baseUrl}/api/shipments/${shipmentId}/suppliers/${supplierId}/goods-summary`,
  );

  assert.equal(response.status, 200);
  const body = await response.json();

  assert.deepEqual(body, {
    supplierGoodsTotalRmb: "1000.00",
    supplierPaidRmb: "500.00",
    supplierRemainingRmb: "500.00",
  });

  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

test("GET goods summary returns 404 when supplier is missing", async () => {
  const shipmentId = 2;

  shipmentFixtures.set(shipmentId, {
    id: shipmentId,
    shipmentCode: "SHP-2",
    shipmentName: "شحنة اختبار 2",
    status: "جديدة",
    purchaseDate: null,
    arrivalDate: null,
    shippingCompanyId: null,
    purchaseCostRmb: "0",
    purchaseCostEgp: "0",
    shippingCostRmb: "0",
    shippingCostEgp: "0",
    commissionCostRmb: "0",
    commissionCostEgp: "0",
    customsCostEgp: "0",
    takhreegCostEgp: "0",
    finalTotalCostEgp: "0",
    totalPaidEgp: "0",
    balanceEgp: "0",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastPaymentDate: null,
    partialDiscountRmb: null,
  } as ShipmentFixture);

  const { httpServer, baseUrl } = await createTestServer();

  const response = await fetch(
    `${baseUrl}/api/shipments/${shipmentId}/suppliers/999/goods-summary`,
  );

  assert.equal(response.status, 404);

  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});
