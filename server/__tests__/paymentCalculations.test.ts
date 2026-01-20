import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Shipment, ShipmentItem, ShipmentPayment } from "@shared/schema";
import { calculatePaymentSnapshot } from "../services/paymentCalculations";

const baseShipment: Shipment = {
  id: 99,
  shipmentCode: "SH-99",
  shipmentName: "Snapshot Test Shipment",
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
  costComponent: "تكلفة البضاعة",
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

describe("calculatePaymentSnapshot", () => {
  it("keeps invoice summary and payment limit aligned with partial cost data", async () => {
    const shipment: Shipment = {
      ...baseShipment,
      shippingCostEgp: "250",
      customsCostEgp: "500",
    };

    const payments: ShipmentPayment[] = [
      createPayment({ amountOriginal: "200", amountEgp: "200" }),
    ];

    const snapshot = await calculatePaymentSnapshot({
      shipment,
      payments,
    });

    assert.equal(snapshot.knownTotalCost, 750);
    assert.equal(snapshot.totalPaidEgp, 200);
    assert.equal(snapshot.remainingAllowed, 550);
    assert.equal(snapshot.paidByCurrency.EGP?.original, 200);
    assert.equal(snapshot.paidByCurrency.EGP?.convertedToEgp, 200);
  });

  it("tracks RMB and EGP payments consistently for remaining allowance", async () => {
    const shipment: Shipment = {
      ...baseShipment,
      purchaseCostEgp: "1000",
      shippingCostEgp: "500",
      takhreegCostEgp: "500",
    };

    const payments: ShipmentPayment[] = [
      createPayment({
        paymentCurrency: "RMB",
        amountOriginal: "100",
        exchangeRateToEgp: "7.50",
        amountEgp: "750",
      }),
      createPayment({
        id: 2,
        amountOriginal: "300",
        amountEgp: "300",
        paymentCurrency: "EGP",
      }),
    ];

    const snapshot = await calculatePaymentSnapshot({
      shipment,
      payments,
    });

    assert.equal(snapshot.knownTotalCost, 2000);
    assert.equal(snapshot.totalPaidEgp, 1050);
    assert.equal(snapshot.remainingAllowed, 950);
    assert.equal(snapshot.paidByCurrency.RMB?.original, 100);
    assert.equal(snapshot.paidByCurrency.RMB?.convertedToEgp, 750);
    assert.equal(snapshot.paidByCurrency.EGP?.original, 300);
    assert.equal(snapshot.paidByCurrency.EGP?.convertedToEgp, 300);
  });

  it("recovers totals from items to align payment acceptance with invoice summary", async () => {
    const shipment: Shipment = {
      ...baseShipment,
      purchaseCostEgp: "0",
      customsCostEgp: "0",
      takhreegCostEgp: "0",
    };

    const items: ShipmentItem[] = [
      {
        id: 1,
        shipmentId: shipment.id,
        supplierId: null,
        productId: null,
        productType: null,
        productName: "Widgets",
        description: null,
        countryOfOrigin: "CN",
        imageUrl: null,
        cartonsCtn: 10,
        piecesPerCartonPcs: 0,
        totalPiecesCou: 0,
        purchasePricePerPiecePriRmb: "0",
        totalPurchaseCostRmb: "100",
        customsCostPerCartonEgp: "5",
        totalCustomsCostEgp: "50",
        takhreegCostPerCartonEgp: "3",
        totalTakhreegCostEgp: "30",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
      },
    ];

    const payments: ShipmentPayment[] = [
      createPayment({ amountOriginal: "0", amountEgp: "0" }),
    ];

    const snapshot = await calculatePaymentSnapshot({
      shipment,
      payments,
      loadRecoveryData: async () => ({
        items,
        rmbToEgpRate: 7,
      }),
    });

    assert.equal(snapshot.knownTotalCost, 780);
    assert.equal(snapshot.remainingAllowed, 780);
    assert.ok(snapshot.recoveredTotals);
  });
});
