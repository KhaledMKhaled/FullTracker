import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { createServer } from "node:http";
import test, { beforeEach } from "node:test";
import express from "express";

import type { ExchangeRate, Shipment, ShipmentPayment } from "@shared/schema";
import { ApiError } from "../errors";
import { logAuditEvent } from "../audit";
import { normalizePaymentAmounts, roundAmount } from "../services/currency";

process.env.DATABASE_URL ||= "postgres://example.com:5432/test";
process.env.SESSION_SECRET ||= "test-secret";

type ShipmentItemCosts = {
  totalPurchaseCostRmb: number;
  cartonsCtn: number;
  customsCostPerCartonEgp?: number | null;
  takhreegCostPerCartonEgp?: number | null;
};

class FakeStorage {
  public shipments: Shipment[] = [];
  public payments: ShipmentPayment[] = [];
  public auditLogs: Array<Record<string, unknown>> = [];
  public exchangeRates: ExchangeRate[] = [];
  public itemsByShipment = new Map<number, ShipmentItemCosts[]>();

  private nextPaymentId = 1;

  reset() {
    this.shipments = [];
    this.payments = [];
    this.auditLogs = [];
    this.exchangeRates = [];
    this.itemsByShipment.clear();
    this.nextPaymentId = 1;
  }

  seedShipments(shipments: Shipment[]) {
    this.shipments = shipments.map((shipment) => ({ ...shipment }));
  }

  seedExchangeRates(rates: ExchangeRate[]) {
    this.exchangeRates = rates.map((rate) => ({ ...rate }));
  }

  seedItems(shipmentId: number, items: ShipmentItemCosts[]) {
    this.itemsByShipment.set(shipmentId, items);
  }

  async getShipment(id: number): Promise<Shipment | undefined> {
    return this.shipments.find((shipment) => shipment.id === id);
  }

  async getShipmentPayments(shipmentId: number) {
    return this.payments.filter((payment) => payment.shipmentId === shipmentId);
  }

  async getAllPayments() {
    return this.payments;
  }

  async getShipmentSupplierContext() {
    return {
      itemSuppliers: [],
      shippingCompanyId: null,
      shipmentSuppliers: [],
    };
  }

  async getSupplier(id: number) {
    return { id };
  }

  async getShippingCompany(id: number) {
    return { id };
  }

  async getLatestRate(from: string, to: string) {
    const sorted = this.exchangeRates
      .filter((rate) => rate.fromCurrency === from && rate.toCurrency === to)
      .sort(
        (a, b) =>
          new Date(b.rateDate).getTime() - new Date(a.rateDate).getTime(),
      );
    return sorted[0];
  }

  async createAuditLog(entry: Record<string, unknown>) {
    const record = { ...entry, id: this.auditLogs.length + 1 };
    this.auditLogs.push(record);
    return record;
  }

  async createPayment(data: any): Promise<ShipmentPayment> {
    const shipment = await this.getShipment(data.shipmentId);
    if (!shipment) {
      throw new ApiError("SHIPMENT_NOT_FOUND", undefined, 404, {
        shipmentId: data.shipmentId,
      });
    }

    if (shipment.status === "مؤرشفة") {
      throw new ApiError("SHIPMENT_LOCKED", undefined, 409, {
        shipmentId: data.shipmentId,
        status: shipment.status,
      });
    }

    const parseAmount = (value: unknown): number => {
      if (value === null || value === undefined) return 0;
      const parsed = typeof value === "number" ? value : parseFloat(value as any);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const computeKnownTotal = (s: Shipment): number => {
      const purchase = parseAmount(s.purchaseCostEgp);
      const commission = parseAmount(s.commissionCostEgp);
      const shipping = parseAmount(s.shippingCostEgp);
      const customs = parseAmount(s.customsCostEgp);
      const takhreeg = parseAmount(s.takhreegCostEgp);
      return purchase + commission + shipping + customs + takhreeg;
    };

    const amountOriginal = parseAmount(data.amountOriginal);
    let exchangeRate = data.exchangeRateToEgp
      ? parseAmount(data.exchangeRateToEgp)
      : null;

    if (data.paymentCurrency === "RMB" && !exchangeRate) {
      const latestRate = await this.getLatestRate("RMB", "EGP");
      if (latestRate) {
        exchangeRate = parseAmount(latestRate.rateValue);
      } else {
        throw new ApiError("PAYMENT_RATE_MISSING", undefined, 400, {
          shipmentId: data.shipmentId,
          currency: data.paymentCurrency,
        });
      }
    }

    let normalizedAmounts;
    try {
      normalizedAmounts = normalizePaymentAmounts({
        paymentCurrency: data.paymentCurrency,
        amountOriginal,
        exchangeRateToEgp: exchangeRate,
      });
    } catch (error) {
      const message = (error as Error)?.message || "";
      if (message.includes("سعر الصرف")) {
        throw new ApiError("PAYMENT_RATE_MISSING", undefined, 400, {
          shipmentId: data.shipmentId,
          currency: data.paymentCurrency,
        });
      }
      if (message.includes("عملة الدفع")) {
        throw new ApiError("PAYMENT_CURRENCY_UNSUPPORTED", undefined, 400, {
          currency: data.paymentCurrency,
        });
      }
      throw new ApiError("PAYMENT_PAYLOAD_INVALID", message, 400);
    }

    const { amountEgp, exchangeRateToEgp } = normalizedAmounts;

    const currentPaid = parseAmount(shipment.totalPaidEgp);
    let knownTotal = computeKnownTotal(shipment);

    if (knownTotal === 0) {
      const items = this.itemsByShipment.get(data.shipmentId) || [];
      if (items.length > 0) {
        const totalPurchaseCostRmb = items.reduce(
          (sum, item) => sum + item.totalPurchaseCostRmb,
          0,
        );
        const totalCustomsCostEgp = items.reduce(
          (sum, item) =>
            sum +
            (item.customsCostPerCartonEgp || 0) * (item.cartonsCtn || 0),
          0,
        );
        const totalTakhreegCostEgp = items.reduce(
          (sum, item) =>
            sum +
            (item.takhreegCostPerCartonEgp || 0) * (item.cartonsCtn || 0),
          0,
        );

        const fallbackRate =
          (await this.getLatestRate("RMB", "EGP"))?.rateValue || "7.15";
        const rmbToEgpRate = parseAmount(fallbackRate);
        const purchaseCostEgp = totalPurchaseCostRmb * rmbToEgpRate;
        const recoveredTotal =
          purchaseCostEgp + totalCustomsCostEgp + totalTakhreegCostEgp;

        if (recoveredTotal > 0) {
          knownTotal = recoveredTotal;
          shipment.purchaseCostRmb = totalPurchaseCostRmb.toFixed(2);
          shipment.purchaseCostEgp = purchaseCostEgp.toFixed(2);
          shipment.customsCostEgp = totalCustomsCostEgp.toFixed(2);
          shipment.takhreegCostEgp = totalTakhreegCostEgp.toFixed(2);
          shipment.finalTotalCostEgp = recoveredTotal.toFixed(2);
          shipment.balanceEgp = Math.max(
            0,
            recoveredTotal - currentPaid,
          ).toFixed(2);
        }
      }
    }

    const remainingAllowed = Math.max(0, knownTotal - currentPaid);
    if (amountEgp > remainingAllowed + 0.0001) {
      throw new ApiError(
        "PAYMENT_OVERPAY",
        `لا يمكن دفع هذا المبلغ - الحد المسموح به هو ${remainingAllowed.toFixed(2)} جنيه`,
        409,
        {
          shipmentId: data.shipmentId,
          knownTotal,
          alreadyPaid: currentPaid,
          remainingAllowed,
          attempted: amountEgp,
        },
      );
    }

    const now = new Date();
    const payment: ShipmentPayment = {
      id: this.nextPaymentId++,
      shipmentId: data.shipmentId,
      paymentDate: data.paymentDate || now,
      paymentCurrency: data.paymentCurrency,
      amountOriginal: roundAmount(amountOriginal, 2).toFixed(2),
      exchangeRateToEgp: exchangeRateToEgp
        ? roundAmount(exchangeRateToEgp, 4).toFixed(4)
        : null,
      amountEgp: roundAmount(amountEgp, 2).toFixed(2),
      costComponent: data.costComponent,
      paymentMethod: data.paymentMethod,
      cashReceiverName: data.cashReceiverName ?? null,
      referenceNumber: data.referenceNumber ?? null,
      note: data.note ?? null,
      attachmentUrl: data.attachmentUrl ?? null,
      attachmentMimeType: data.attachmentMimeType ?? null,
      attachmentSize: data.attachmentSize ?? null,
      attachmentOriginalName: data.attachmentOriginalName ?? null,
      attachmentUploadedAt: data.attachmentUploadedAt ?? null,
      createdByUserId: data.createdByUserId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.payments.push(payment);

    const paymentTotals = this.payments.filter(
      (p) => p.shipmentId === data.shipmentId,
    );
    const totalPaid = roundAmount(
      paymentTotals.reduce((sum, p) => sum + parseAmount(p.amountEgp), 0),
    );
    const balance = roundAmount(Math.max(0, knownTotal - totalPaid));
    const latestPaymentDate = paymentTotals.reduce(
      (latest, p) =>
        p.paymentDate && p.paymentDate > latest ? p.paymentDate : latest,
      data.paymentDate || now,
    );

    Object.assign(shipment, {
      totalPaidEgp: totalPaid.toFixed(2),
      balanceEgp: balance.toFixed(2),
      lastPaymentDate: latestPaymentDate,
      updatedAt: now,
    });

    return payment;
  }
}

const storage = new FakeStorage();

const { registerRoutes } = await import("../routes");

const authStubs = {
  setupAuth: async () => {},
  isAuthenticated: (_req: any, _res: any, next: () => void) => next(),
  requireRole: () => (req: any, _res: any, next: () => void) => {
    req.isAuthenticated = () => true;
    req.user ||= { id: "user-1", role: "مدير" };
    next();
  },
};

function shipmentFixture(id: number, overrides: Partial<Shipment> = {}): Shipment {
  const baseDate = new Date("2024-01-01T00:00:00Z");
  return {
    id,
    shipmentCode: `SH-${id}`,
    shipmentName: `Shipment ${id}`,
    purchaseDate: baseDate,
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
    createdAt: baseDate,
    updatedAt: baseDate,
    ...overrides,
  };
}

async function createTestServer() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  const httpServer = createServer(app);
  await registerRoutes(httpServer, app, {
    storage: storage as any,
    auditLogger: (event) => logAuditEvent(event, storage as any),
    auth: authStubs,
  });

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return { httpServer, baseUrl };
}

function jsonHeaders() {
  return { "Content-Type": "application/json" };
}

beforeEach(() => {
  storage.reset();
});

test("creates EGP and RMB payments and updates shipment aggregates", async () => {
  storage.seedShipments([
    shipmentFixture(1, { purchaseCostEgp: "200" }),
    shipmentFixture(2, { purchaseCostEgp: "300", status: "مستلمة بنجاح" }),
  ]);
  storage.seedExchangeRates([
    {
      id: 1,
      rateDate: new Date("2024-02-01"),
      fromCurrency: "RMB",
      toCurrency: "EGP",
      rateValue: "5.5000",
      source: "test",
      createdAt: new Date("2024-02-01"),
    },
  ]);

  const { httpServer, baseUrl } = await createTestServer();

  const egpResponse = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      shipmentId: 1,
      paymentDate: "2024-02-10",
      paymentCurrency: "EGP",
      amountOriginal: "120",
      amountEgp: "120",
      costComponent: "تكلفة البضاعة",
      paymentMethod: "نقدي",
      cashReceiverName: "Ali",
    }),
  });
  assert.equal(egpResponse.status, 200);
  const egpBody = (await egpResponse.json()) as any;
  assert.equal(egpBody.ok, true);
  assert.equal(egpBody.data.amountEgp, "120.00");

  const rmbResponse = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      shipmentId: 2,
      paymentDate: "2024-02-11",
      paymentCurrency: "RMB",
      amountOriginal: "10",
      exchangeRateToEgp: "5.5",
      amountEgp: "55",
      costComponent: "تكلفة البضاعة",
      paymentMethod: "تحويل بنكي",
    }),
  });
  assert.equal(rmbResponse.status, 200);
  const rmbBody = (await rmbResponse.json()) as any;
  assert.equal(rmbBody.ok, true);
  assert.equal(rmbBody.data.exchangeRateToEgp, "5.5000");

  httpServer.close();

  const [shipmentOne, shipmentTwo] = storage.shipments;

  assert.equal(shipmentOne.totalPaidEgp, "120.00");
  assert.equal(shipmentOne.balanceEgp, "80.00");
  assert.equal(
    new Date(shipmentOne.lastPaymentDate!).toISOString().startsWith("2024-02-10"),
    true,
  );

  assert.equal(shipmentTwo.totalPaidEgp, "55.00");
  assert.equal(shipmentTwo.balanceEgp, "245.00");
  assert.equal(
    new Date(shipmentTwo.lastPaymentDate!).toISOString().startsWith("2024-02-11"),
    true,
  );

  assert.equal(storage.payments.every((p) => p.createdByUserId === "user-1"), true);
  assert.equal(storage.auditLogs.length, 2);
});

test("blocks overpayment and keeps storage unchanged", async () => {
  storage.seedShipments([shipmentFixture(1, { purchaseCostEgp: "100" })]);

  const { httpServer, baseUrl } = await createTestServer();

  const response = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      shipmentId: 1,
      paymentDate: "2024-02-10",
      paymentCurrency: "EGP",
      amountOriginal: "150",
      amountEgp: "150",
      costComponent: "تكلفة البضاعة",
      paymentMethod: "نقدي",
    }),
  });

  assert.equal(response.status, 409);
  const body = (await response.json()) as any;
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "PAYMENT_OVERPAY");
  assert.match(body.error.message, /الحد المسموح به هو 100.00/);
  assert.equal(storage.payments.length, 0);
  httpServer.close();
});

test("uses stored exchange rate for RMB payments and errors when missing", async () => {
  storage.seedShipments([shipmentFixture(1, { purchaseCostEgp: "200" })]);
  storage.seedExchangeRates([
    {
      id: 10,
      rateDate: new Date("2024-02-15"),
      fromCurrency: "RMB",
      toCurrency: "EGP",
      rateValue: "6.2000",
      source: "latest",
      createdAt: new Date("2024-02-15"),
    },
  ]);

  const { httpServer, baseUrl } = await createTestServer();

  const success = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      shipmentId: 1,
      paymentDate: "2024-03-01",
      paymentCurrency: "RMB",
      amountOriginal: "10",
      exchangeRateToEgp: null,
      amountEgp: "0",
      costComponent: "تكلفة البضاعة",
      paymentMethod: "نقدي",
    }),
  });

  assert.equal(success.status, 200);
  const successBody = (await success.json()) as any;
  assert.equal(successBody.data.amountEgp, "62.00");
  assert.equal(successBody.data.exchangeRateToEgp, "6.2000");

  storage.exchangeRates = [];
  storage.shipments.push(shipmentFixture(2, { purchaseCostEgp: "200" }));

  const failure = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      shipmentId: 2,
      paymentDate: "2024-03-02",
      paymentCurrency: "RMB",
      amountOriginal: "5",
      amountEgp: "0",
      costComponent: "تكلفة البضاعة",
      paymentMethod: "نقدي",
    }),
  });

  assert.equal(failure.status, 400);
  const failureBody = (await failure.json()) as any;
  assert.equal(failureBody.error.code, "PAYMENT_RATE_MISSING");
  assert.equal(storage.payments.length, 1);

  httpServer.close();
});

test("allows payments when optional costs are null or zero", async () => {
  storage.seedShipments([
    shipmentFixture(1, {
      purchaseCostEgp: "250",
      commissionCostEgp: null as any,
      shippingCostEgp: "0",
      customsCostEgp: null as any,
      takhreegCostEgp: "0",
    }),
  ]);

  const { httpServer, baseUrl } = await createTestServer();

  const response = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      shipmentId: 1,
      paymentDate: "2024-02-12",
      paymentCurrency: "EGP",
      amountOriginal: "125",
      amountEgp: "125",
      costComponent: "تكلفة البضاعة",
      paymentMethod: "نقدي",
    }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as any;
  assert.equal(body.ok, true);
  assert.equal(storage.payments.length, 1);
  assert.equal(storage.shipments[0].balanceEgp, "125.00");

  httpServer.close();
});

test("applies overpayment tolerance but rejects amounts above it", async () => {
  storage.seedShipments([
    shipmentFixture(1, { purchaseCostEgp: "100", totalPaidEgp: "99.99" }),
    shipmentFixture(2, { purchaseCostEgp: "100", totalPaidEgp: "99.99" }),
  ]);

  const { httpServer, baseUrl } = await createTestServer();

  const withinTolerance = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      shipmentId: 1,
      paymentDate: "2024-02-13",
      paymentCurrency: "EGP",
      amountOriginal: "0.01009",
      amountEgp: "0.01009",
      costComponent: "تكلفة البضاعة",
      paymentMethod: "نقدي",
    }),
  });

  assert.equal(withinTolerance.status, 200);
  const tolerated = (await withinTolerance.json()) as any;
  assert.equal(tolerated.ok, true);

  const aboveTolerance = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      shipmentId: 2,
      paymentDate: "2024-02-14",
      paymentCurrency: "EGP",
      amountOriginal: "0.01011",
      amountEgp: "0.01011",
      costComponent: "تكلفة البضاعة",
      paymentMethod: "نقدي",
    }),
  });

  assert.equal(aboveTolerance.status, 409);
  const rejected = (await aboveTolerance.json()) as any;
  assert.equal(rejected.error.code, "PAYMENT_OVERPAY");
  assert.equal(storage.payments.length, 1);

  httpServer.close();
});

test("returns 404 for missing shipments and 400 for invalid dates", async () => {
  storage.seedShipments([shipmentFixture(1, { purchaseCostEgp: "100" })]);
  const { httpServer, baseUrl } = await createTestServer();

  const missingShipment = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      shipmentId: 999,
      paymentDate: "2024-02-15",
      paymentCurrency: "EGP",
      amountOriginal: "10",
      amountEgp: "10",
      costComponent: "تكلفة البضاعة",
      paymentMethod: "نقدي",
    }),
  });

  assert.equal(missingShipment.status, 404);
  const missingBody = (await missingShipment.json()) as any;
  assert.equal(missingBody.error.code, "SHIPMENT_NOT_FOUND");

  const invalidDate = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      shipmentId: 1,
      paymentDate: "not-a-date",
      paymentCurrency: "EGP",
      amountOriginal: "10",
      amountEgp: "10",
      costComponent: "تكلفة البضاعة",
      paymentMethod: "نقدي",
    }),
  });

  assert.equal(invalidDate.status, 400);
  const invalidDateBody = (await invalidDate.json()) as any;
  assert.equal(invalidDateBody.error.code, "PAYMENT_DATE_INVALID");
  assert.equal(storage.payments.length, 0);

  httpServer.close();
});

test("creates payment with shipping company party details", async () => {
  storage.seedShipments([
    shipmentFixture(10, { purchaseCostEgp: "150", shippingCompanyId: 20 }),
  ]);

  const { httpServer, baseUrl } = await createTestServer();

  const response = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      shipmentId: 10,
      paymentDate: "2024-03-05",
      paymentCurrency: "EGP",
      amountOriginal: "50",
      amountEgp: "50",
      costComponent: "الشحن",
      paymentMethod: "نقدي",
      cashReceiverName: "Mona",
      partyType: "shipping_company",
      partyId: 20,
    }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as any;
  assert.equal(body.ok, true);
  assert.equal(body.data.partyType, "shipping_company");
  assert.equal(body.data.partyId, 20);

  httpServer.close();
});
