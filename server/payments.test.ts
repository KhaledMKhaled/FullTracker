import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { PaymentAllocation, Shipment, ShipmentPayment } from "@shared/schema";
import { getPaymentsWithShipments } from "./payments";

const baseShipment: Shipment = {
  id: 10,
  shipmentCode: "SH-10",
  shipmentName: "Test Shipment",
  purchaseDate: new Date("2024-01-01"),
  status: "جديدة",
  invoiceCustomsDate: null,
  createdByUserId: null,
  purchaseCostRmb: "0",
  purchaseCostEgp: "0",
  commissionCostRmb: "0",
  commissionCostEgp: "0",
  shippingCostRmb: "0",
  shippingCostEgp: "0",
  customsCostEgp: "0",
  takhreegCostEgp: "0",
  finalTotalCostEgp: "0",
  totalPaidEgp: "0",
  balanceEgp: "0",
  lastPaymentDate: null,
  createdAt: new Date("2024-01-02"),
  updatedAt: new Date("2024-01-02"),
};

const createPayment = (overrides: Partial<ShipmentPayment>): ShipmentPayment => ({
  id: 1,
  shipmentId: baseShipment.id,
  paymentDate: new Date("2024-02-01"),
  paymentCurrency: "EGP",
  amountOriginal: "100.00",
  exchangeRateToEgp: null,
  amountEgp: "100.00",
  paymentMethod: "نقدي",
  cashReceiverName: "Ali",
  referenceNumber: null,
  note: null,
  attachmentUrl: null,
  attachmentMimeType: null,
  attachmentSize: null,
  attachmentOriginalName: null,
  attachmentUploadedAt: null,
  createdByUserId: null,
  createdAt: new Date("2024-02-02"),
  updatedAt: new Date("2024-02-02"),
  ...overrides,
});

describe("getPaymentsWithShipments", () => {
  it("fetches shipments once for multiple payments and combines the results", async () => {
    const payments = [
      createPayment({ id: 1 }),
      createPayment({ id: 2, shipmentId: baseShipment.id }),
    ];

    const storage = {
      getAllPayments: mock.fn(async () => payments),
      getShipmentsByIds: mock.fn(async (_ids: number[]) => [baseShipment]),
      getPaymentAllocationsByPaymentIds: mock.fn(async () => [] as PaymentAllocation[]),
    };

    const result = await getPaymentsWithShipments(storage);

    assert.equal(storage.getShipmentsByIds.mock.calls.length, 1);
    assert.equal(result.length, payments.length);
    assert.ok(result.every((payment) => payment.shipment?.id === baseShipment.id));
    assert.ok(
      result.every(
        (payment) =>
          payment.allocationSummary.exists === false &&
          payment.allocationSummary.count === 0 &&
          payment.allocationSummary.totalAllocated === "0.00",
      ),
    );
  });

  it("skips shipment lookup when there are no payments", async () => {
    const storage = {
      getAllPayments: mock.fn(async () => [] as ShipmentPayment[]),
      getShipmentsByIds: mock.fn(async () => [] as Shipment[]),
      getPaymentAllocationsByPaymentIds: mock.fn(async () => [] as PaymentAllocation[]),
    };

    const result = await getPaymentsWithShipments(storage);

    assert.equal(storage.getShipmentsByIds.mock.calls.length, 0);
    assert.deepEqual(result, []);
  });

  it("includes allocations when requested", async () => {
    const payments = [createPayment({ id: 3 })];
    const allocations: PaymentAllocation[] = [
      {
        id: 1,
        paymentId: 3,
        shipmentId: baseShipment.id,
        supplierId: 77,
        component: "تكلفة البضاعة",
        currency: "RMB",
        allocatedAmount: "125.50",
        createdByUserId: null,
        createdAt: new Date("2024-02-03"),
      },
      {
        id: 2,
        paymentId: 3,
        shipmentId: baseShipment.id,
        supplierId: 88,
        component: "تكلفة البضاعة",
        currency: "RMB",
        allocatedAmount: "74.50",
        createdByUserId: null,
        createdAt: new Date("2024-02-03"),
      },
    ];

    const storage = {
      getAllPayments: mock.fn(async () => payments),
      getShipmentsByIds: mock.fn(async (_ids: number[]) => [baseShipment]),
      getPaymentAllocationsByPaymentIds: mock.fn(async () => allocations),
    };

    const result = await getPaymentsWithShipments(storage, { includeAllocations: true });

    assert.equal(result.length, 1);
    assert.deepEqual(result[0].allocations, allocations);
    assert.deepEqual(result[0].allocationSummary, {
      exists: true,
      count: 2,
      totalAllocated: "200.00",
    });
  });
});
