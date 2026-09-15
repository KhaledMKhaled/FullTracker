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

  it("computes independent per-currency allowances (RMB vs EGP)", async () => {
    const shipment: Shipment = {
      ...baseShipment,
      purchaseCostRmb: "1000",
      shippingCostRmb: "200",
      commissionCostRmb: "100",
      customsCostEgp: "500",
      takhreegCostEgp: "300",
      purchaseCostEgp: "7000",
      shippingCostEgp: "1400",
      commissionCostEgp: "700",
    } as Shipment;

    const payments: ShipmentPayment[] = [
      createPayment({
        paymentCurrency: "RMB",
        costComponent: "تكلفة البضاعة",
        amountOriginal: "400",
        exchangeRateToEgp: "7.00",
        amountEgp: "2800",
      }),
      createPayment({
        id: 2,
        paymentCurrency: "EGP",
        costComponent: "الجمرك",
        amountOriginal: "200",
        amountEgp: "200",
      }),
    ];

    const snapshot = await calculatePaymentSnapshot({ shipment, payments });

    assert.equal(snapshot.currencyAllowance.rmb.knownTotal, 1300);
    assert.equal(snapshot.currencyAllowance.rmb.paid, 400);
    assert.equal(snapshot.currencyAllowance.rmb.remaining, 900);
    assert.equal(snapshot.currencyAllowance.egp.knownTotal, 800);
    assert.equal(snapshot.currencyAllowance.egp.paid, 200);
    assert.equal(snapshot.currencyAllowance.egp.remaining, 600);
  });

  it("marks a shipment settled when every native-currency component is fully paid despite historical EGP conversion differences", async () => {
    const shipment: Shipment = {
      ...baseShipment,
      purchaseCostRmb: "20000",
      shippingCostRmb: "2592",
      commissionCostRmb: "1000",
      customsCostEgp: "66250",
      takhreegCostEgp: "2500",
      purchaseCostEgp: "154000",
      shippingCostEgp: "20736",
      commissionCostEgp: "8000",
      totalMissingCostEgp: "3017.83",
      finalTotalCostEgp: "251486",
      totalPaidEgp: "251338",
      balanceEgp: "148",
      purchaseRmbToEgpRate: "7.70",
    } as Shipment;

    const payments: ShipmentPayment[] = [
      createPayment({
        paymentCurrency: "RMB",
        costComponent: "تكلفة البضاعة",
        amountOriginal: "20000",
        exchangeRateToEgp: "7.75",
        amountEgp: "155000",
      }),
      createPayment({
        id: 2,
        paymentCurrency: "RMB",
        costComponent: "الشحن",
        amountOriginal: "2592",
        exchangeRateToEgp: "7.75",
        amountEgp: "20088",
      }),
      createPayment({
        id: 3,
        paymentCurrency: "RMB",
        costComponent: "العمولة",
        amountOriginal: "1000",
        exchangeRateToEgp: "7.50",
        amountEgp: "7500",
      }),
      createPayment({
        id: 4,
        paymentCurrency: "EGP",
        costComponent: "الجمرك",
        amountOriginal: "66250",
        amountEgp: "66250",
      }),
      createPayment({
        id: 5,
        paymentCurrency: "EGP",
        costComponent: "التخريج",
        amountOriginal: "2500",
        amountEgp: "2500",
      }),
    ];

    const snapshot = await calculatePaymentSnapshot({ shipment, payments });

    assert.equal(snapshot.totalPaidEgp, 251338);
    assert.equal(snapshot.remainingAllowed, 148);
    assert.deepEqual(snapshot.settlement, {
      status: "مسددة بالكامل",
      settled: true,
      remainingRmb: 0,
      remainingEgp: 0,
      displayRemainingEgp: 0,
    });
  });

  it("does not let an overpayment on one component hide a balance on another", async () => {
    const shipment: Shipment = {
      ...baseShipment,
      purchaseCostRmb: "1000",
      shippingCostRmb: "200",
      purchaseRmbToEgpRate: "7",
    } as Shipment;
    const payments: ShipmentPayment[] = [
      createPayment({
        paymentCurrency: "RMB",
        costComponent: "تكلفة البضاعة",
        amountOriginal: "1100",
        exchangeRateToEgp: "7",
        amountEgp: "7700",
      }),
      createPayment({
        id: 2,
        paymentCurrency: "RMB",
        costComponent: "الشحن",
        amountOriginal: "100",
        exchangeRateToEgp: "7",
        amountEgp: "700",
      }),
    ];

    const snapshot = await calculatePaymentSnapshot({ shipment, payments });

    assert.equal(snapshot.currencyAllowance.rmb.remaining, 0);
    assert.equal(snapshot.settlement.status, "مدفوعة جزئياً");
    assert.equal(snapshot.settlement.remainingRmb, 100);
    assert.equal(snapshot.settlement.displayRemainingEgp, 700);
  });

  it("uses the historical EGP balance when only a final total is available", async () => {
    const shipment: Shipment = {
      ...baseShipment,
      finalTotalCostEgp: "1000",
      totalPaidEgp: "400",
      balanceEgp: "600",
    };

    const snapshot = await calculatePaymentSnapshot({
      shipment,
      payments: [createPayment({ amountOriginal: "400", amountEgp: "400" })],
    });

    assert.equal(snapshot.settlement.status, "مدفوعة جزئياً");
    assert.equal(snapshot.settlement.displayRemainingEgp, 600);
  });

  it("uses the historical EGP balance when an RMB component exists only as a converted value", async () => {
    const shipment: Shipment = {
      ...baseShipment,
      shippingCostEgp: "700",
      customsCostEgp: "100",
      finalTotalCostEgp: "800",
      totalPaidEgp: "100",
      balanceEgp: "700",
    };

    const snapshot = await calculatePaymentSnapshot({
      shipment,
      payments: [
        createPayment({
          paymentCurrency: "EGP",
          costComponent: "الجمرك",
          amountOriginal: "100",
          amountEgp: "100",
        }),
      ],
    });

    assert.equal(snapshot.settlement.status, "مدفوعة جزئياً");
    assert.equal(snapshot.settlement.displayRemainingEgp, 700);
  });

  it("requires native-currency components to be paid even when missing-piece costs adjust the historical EGP total", async () => {
    const shipment: Shipment = {
      ...baseShipment,
      purchaseCostRmb: "100",
      purchaseCostEgp: "700",
      purchaseRmbToEgpRate: "7",
      totalMissingCostEgp: "100",
      finalTotalCostEgp: "600",
      totalPaidEgp: "600",
      balanceEgp: "0",
    } as Shipment;

    const snapshot = await calculatePaymentSnapshot({
      shipment,
      payments: [
        createPayment({
          paymentCurrency: "EGP",
          costComponent: "تكلفة البضاعة",
          amountOriginal: "600",
          exchangeRateToEgp: "7",
          amountEgp: "600",
        }),
      ],
    });

    assert.equal(snapshot.settlement.status, "مدفوعة جزئياً");
    assert.equal(snapshot.settlement.remainingRmb, 14.29);
    assert.equal(snapshot.settlement.displayRemainingEgp, 100.03);
  });

  it("counts EGP payments on RMB components against the RMB allowance via exchange rate", async () => {
    const shipment: Shipment = {
      ...baseShipment,
      purchaseCostRmb: "1000",
      partialDiscountRmb: "100",
    } as Shipment;

    const payments: ShipmentPayment[] = [
      createPayment({
        paymentCurrency: "EGP",
        costComponent: "تكلفة البضاعة",
        amountOriginal: "700",
        exchangeRateToEgp: "7.00",
        amountEgp: "700",
      }),
    ];

    const snapshot = await calculatePaymentSnapshot({ shipment, payments });

    assert.equal(snapshot.currencyAllowance.rmb.knownTotal, 900);
    assert.equal(snapshot.currencyAllowance.rmb.paid, 100);
    assert.equal(snapshot.currencyAllowance.rmb.remaining, 800);
    assert.equal(snapshot.currencyAllowance.egp.knownTotal, 0);
    assert.equal(snapshot.currencyAllowance.egp.remaining, 0);
  });

  it("builds per-currency allowances from recovered totals when shipment fields are empty", async () => {
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
      createPayment({
        paymentCurrency: "EGP",
        costComponent: "تكلفة البضاعة",
        amountOriginal: "70",
        exchangeRateToEgp: null,
        amountEgp: "70",
      }),
    ];

    const snapshot = await calculatePaymentSnapshot({
      shipment,
      payments,
      loadRecoveryData: async () => ({
        items,
        rmbToEgpRate: 7,
      }),
    });

    assert.equal(snapshot.currencyAllowance.rmb.knownTotal, 100);
    assert.equal(snapshot.currencyAllowance.rmb.paid, 10);
    assert.equal(snapshot.currencyAllowance.rmb.remaining, 90);
    assert.equal(snapshot.currencyAllowance.egp.knownTotal, 80);
    assert.equal(snapshot.currencyAllowance.egp.remaining, 80);
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
