import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import test, { beforeEach } from "node:test";

import type {
  Shipment,
  ShipmentItem,
  ShipmentPayment,
  ShippingCompany,
  Supplier,
} from "@shared/schema";
import { registerRoutes } from "../routes";

process.env.DATABASE_URL ||= "postgres://example.com:5432/test";
process.env.SESSION_SECRET ||= "test-secret";

const paymentCalculations = await import("../services/paymentCalculations");
const { computeKnownTotalCost, parseAmountOrZero } = paymentCalculations;

const STATUSES = [
  "جديدة",
  "في انتظار الشحن",
  "جاهزة للاستلام",
  "مستلمة بنجاح",
] as const;

const RMB_TO_EGP_RATE = 10;

class FakeStorage {
  public shipments = new Map<number, Shipment>();
  public paymentsByShipment = new Map<number, ShipmentPayment[]>();
  public suppliers = new Map<number, Supplier>();
  public shippingCompanies = new Map<number, ShippingCompany>();
  public shipmentItems = new Map<number, ShipmentItem[]>();
  public shipmentSuppliers = new Map<number, number[]>();
  private nextPaymentId = 1;

  reset() {
    this.shipments.clear();
    this.paymentsByShipment.clear();
    this.suppliers.clear();
    this.shippingCompanies.clear();
    this.shipmentItems.clear();
    this.shipmentSuppliers.clear();
    this.nextPaymentId = 1;
  }

  async getShipment(id: number) {
    return this.shipments.get(id);
  }

  async getShipmentPayments(shipmentId: number) {
    return this.paymentsByShipment.get(shipmentId) ?? [];
  }

  async getShipmentItems(shipmentId: number) {
    return this.shipmentItems.get(shipmentId) ?? [];
  }

  async getLatestRate(fromCurrency: string, toCurrency: string) {
    if (fromCurrency === "RMB" && toCurrency === "EGP") {
      return {
        id: 1,
        fromCurrency,
        toCurrency,
        rateValue: RMB_TO_EGP_RATE.toString(),
        rateDate: new Date().toISOString(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
    return undefined;
  }

  async getSupplier(id: number) {
    return this.suppliers.get(id);
  }

  async getShippingCompany(id: number) {
    return this.shippingCompanies.get(id);
  }

  async getShipmentSupplierContext(shipmentId: number) {
    const shipment = await this.getShipment(shipmentId);
    const suppliers = this.shipmentSuppliers.get(shipmentId) ?? [];
    return {
      itemSuppliers: suppliers,
      shippingCompanyId: shipment?.shippingCompanyId ?? null,
      shipmentSuppliers: suppliers,
    };
  }

  async getPaymentAllowance(shipmentId: number) {
    const shipment = await this.getShipment(shipmentId);
    if (!shipment) {
      throw new Error("Shipment not found");
    }

    const alreadyPaid = parseAmountOrZero(shipment.totalPaidEgp);
    let knownTotal = computeKnownTotalCost(shipment);
    let recoveredFromItems = false;

    if (knownTotal === 0) {
      const items = await this.getShipmentItems(shipmentId);
      if (items.length > 0) {
        const totalPurchaseCostRmb = items.reduce(
          (sum, item) => sum + parseAmountOrZero(item.totalPurchaseCostRmb),
          0,
        );
        const totalCustomsCostEgp = items.reduce(
          (sum, item) =>
            sum + (item.cartonsCtn || 0) * parseAmountOrZero(item.customsCostPerCartonEgp),
          0,
        );
        const totalTakhreegCostEgp = items.reduce(
          (sum, item) =>
            sum + (item.cartonsCtn || 0) * parseAmountOrZero(item.takhreegCostPerCartonEgp),
          0,
        );
        const purchaseCostEgp = totalPurchaseCostRmb * RMB_TO_EGP_RATE;
        const recoveredTotal = purchaseCostEgp + totalCustomsCostEgp + totalTakhreegCostEgp;
        if (recoveredTotal > 0) {
          knownTotal = recoveredTotal;
          recoveredFromItems = true;
        }
      }
    }

    const remainingAllowed = Math.max(0, knownTotal - alreadyPaid);

    return {
      knownTotal,
      alreadyPaid,
      remainingAllowed,
      recoveredFromItems,
    };
  }

  async createPayment(payload: any): Promise<ShipmentPayment> {
    const shipment = await this.getShipment(payload.shipmentId);
    if (!shipment) {
      throw new Error("Shipment not found");
    }

    const amountEgp = parseAmountOrZero(payload.amountEgp);
    const allowance = await this.getPaymentAllowance(payload.shipmentId);
    if (amountEgp > allowance.remainingAllowed + 0.0001) {
      throw new Error("PAYMENT_OVERPAY");
    }
    const payment: ShipmentPayment = {
      id: this.nextPaymentId++,
      shipmentId: payload.shipmentId,
      partyType: payload.partyType ?? null,
      partyId: payload.partyId ?? null,
      paymentDate: payload.paymentDate ? new Date(payload.paymentDate) : new Date(),
      paymentCurrency: payload.paymentCurrency,
      amountOriginal: payload.amountOriginal?.toString() ?? "0",
      exchangeRateToEgp: payload.exchangeRateToEgp?.toString() ?? null,
      amountEgp: amountEgp.toFixed(2),
      costComponent: payload.costComponent,
      paymentMethod: payload.paymentMethod,
      cashReceiverName: payload.cashReceiverName ?? null,
      referenceNumber: payload.referenceNumber ?? null,
      note: payload.note ?? payload.notes ?? null,
      attachmentUrl: null,
      attachmentMimeType: null,
      attachmentSize: null,
      attachmentOriginalName: null,
      attachmentUploadedAt: null,
      createdByUserId: payload.createdByUserId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const payments = this.paymentsByShipment.get(payload.shipmentId) ?? [];
    payments.push(payment);
    this.paymentsByShipment.set(payload.shipmentId, payments);

    const currentPaid = parseAmountOrZero(shipment.totalPaidEgp);
    shipment.totalPaidEgp = (currentPaid + amountEgp).toFixed(2);

    return payment;
  }
}

const storage = new FakeStorage();

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
  const now = new Date("2024-02-01T00:00:00Z");
  return {
    id,
    shipmentCode: `SHIP-${id}`,
    shipmentName: `Shipment ${id}`,
    purchaseDate: new Date("2024-01-01"),
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
  await registerRoutes(httpServer, app, {
    storage: storage as any,
    auditLogger: () => {},
    auth: authStubs,
  });

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return { httpServer, baseUrl };
}

beforeEach(() => {
  storage.reset();
});

for (const status of STATUSES) {
  test(`invoice summary + payments support shipping company for status ${status}`, async () => {
    const { httpServer, baseUrl } = await createTestServer();
    const shipmentId = 100 + STATUSES.indexOf(status);
    const supplierId = 200 + STATUSES.indexOf(status);
    const shippingCompanyId = 300 + STATUSES.indexOf(status);

    storage.suppliers.set(supplierId, {
      id: supplierId,
      name: `Supplier ${supplierId}`,
      contactName: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    storage.shippingCompanies.set(shippingCompanyId, {
      id: shippingCompanyId,
      name: `Shipping ${shippingCompanyId}`,
      contactName: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    storage.shipmentSuppliers.set(shipmentId, [supplierId]);

    storage.shipments.set(
      shipmentId,
      shipmentFixture(shipmentId, {
        status,
        shippingCompanyId,
        purchaseCostRmb: "1000",
        purchaseCostEgp: "10000",
        shippingCostRmb: "200",
        shippingCostEgp: "2000",
        commissionCostRmb: "100",
        commissionCostEgp: "1000",
        customsCostEgp: "500",
        takhreegCostEgp: "250",
        finalTotalCostEgp: "13750",
      }),
    );

    const supplierPaymentResponse = await fetch(`${baseUrl}/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shipmentId,
        partyType: "supplier",
        partyId: supplierId,
        paymentDate: "2024-02-10",
        paymentCurrency: "RMB",
        amountOriginal: "400",
        exchangeRateToEgp: RMB_TO_EGP_RATE.toString(),
        amountEgp: "4000",
        costComponent: "تكلفة البضاعة",
        paymentMethod: "نقدي",
      }),
    });

    assert.equal(supplierPaymentResponse.status, 200);

    const shippingPayments = [
      {
        costComponent: "الشحن",
        amountOriginal: "150",
        amountEgp: "1500",
      },
      {
        costComponent: "العمولة",
        amountOriginal: "50",
        amountEgp: "500",
      },
      {
        costComponent: "الجمرك",
        amountOriginal: "300",
        amountEgp: "300",
        paymentCurrency: "EGP",
      },
      {
        costComponent: "التخريج",
        amountOriginal: "100",
        amountEgp: "100",
        paymentCurrency: "EGP",
      },
      {
        costComponent: "تكلفة البضاعة",
        amountOriginal: "100",
        amountEgp: "1000",
      },
    ];

    for (const payment of shippingPayments) {
      const response = await fetch(`${baseUrl}/api/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipmentId,
          partyType: "shipping_company",
          partyId: shippingCompanyId,
          paymentDate: "2024-02-11",
          paymentCurrency: payment.paymentCurrency ?? "RMB",
          amountOriginal: payment.amountOriginal,
          exchangeRateToEgp:
            payment.paymentCurrency === "EGP" ? null : RMB_TO_EGP_RATE.toString(),
          amountEgp: payment.amountEgp,
          costComponent: payment.costComponent,
          paymentMethod: "نقدي",
        }),
      });

      assert.equal(response.status, 200);
    }

    const invoiceResponse = await fetch(
      `${baseUrl}/api/shipments/${shipmentId}/invoice-summary`,
    );
    assert.equal(invoiceResponse.status, 200);
    const invoice = await invoiceResponse.json();

    assert.deepEqual(invoice.paidByComponent, {
      "تكلفة البضاعة": "500.00",
      "الشحن": "150.00",
      "العمولة": "50.00",
      "الجمرك": "300.00",
      "التخريج": "100.00",
    });

    assert.deepEqual(invoice.remainingByComponent, {
      "تكلفة البضاعة": "500.00",
      "الشحن": "50.00",
      "العمولة": "50.00",
      "الجمرك": "200.00",
      "التخريج": "150.00",
    });

    assert.equal(invoice.knownTotalCost, "13750.00");
    assert.equal(invoice.totalPaidEgp, "7400.00");
    assert.equal(invoice.remainingAllowed, "6350.00");

    assert.deepEqual(invoice.paymentAllowance, {
      knownTotalEgp: "13750.00",
      alreadyPaidEgp: "7400.00",
      remainingAllowedEgp: "6350.00",
      source: "declared",
    });

    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });
}

test("accepts partial payments when some shipment cost components are missing", async () => {
  const { httpServer, baseUrl } = await createTestServer();
  const shipmentId = 999;
  const supplierId = 501;
  const shippingCompanyId = 601;

  storage.suppliers.set(supplierId, {
    id: supplierId,
    name: "Supplier Guard",
    contactName: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  storage.shippingCompanies.set(shippingCompanyId, {
    id: shippingCompanyId,
    name: "Shipping Guard",
    contactName: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  storage.shipmentSuppliers.set(shipmentId, [supplierId]);

  storage.shipments.set(
    shipmentId,
    shipmentFixture(shipmentId, {
      status: "جديدة",
      shippingCompanyId,
      purchaseCostRmb: "0",
      purchaseCostEgp: "0",
      shippingCostRmb: "0",
      shippingCostEgp: "0",
      commissionCostRmb: "0",
      commissionCostEgp: "0",
      customsCostEgp: "0",
      takhreegCostEgp: "0",
      finalTotalCostEgp: "0",
    }),
  );

  storage.shipmentItems.set(shipmentId, [
    {
      id: 1,
      shipmentId,
      supplierId,
      productName: "Sample Item",
      totalPurchaseCostRmb: "100",
      cartonsCtn: 2,
      unitCostRmb: null,
      purchaseCostPerCartonRmb: null,
      customsCostPerCartonEgp: "50",
      takhreegCostPerCartonEgp: "20",
      totalCustomsCostEgp: null,
      totalTakhreegCostEgp: null,
      totalPieces: null,
      productTypeId: null,
      sku: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  const initialInvoice = await fetch(
    `${baseUrl}/api/shipments/${shipmentId}/invoice-summary`,
  );
  assert.equal(initialInvoice.status, 200);
  const initialSummary = await initialInvoice.json();

  assert.equal(initialSummary.knownTotalCost, "1140.00");
  assert.deepEqual(initialSummary.paymentAllowance, {
    knownTotalEgp: "1140.00",
    alreadyPaidEgp: "0.00",
    remainingAllowedEgp: "1140.00",
    source: "recovered",
  });

  const paymentResponse = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shipmentId,
      partyType: "supplier",
      partyId: supplierId,
      paymentDate: "2024-02-12",
      paymentCurrency: "RMB",
      amountOriginal: "20",
      exchangeRateToEgp: RMB_TO_EGP_RATE.toString(),
      amountEgp: "200",
      costComponent: "تكلفة البضاعة",
      paymentMethod: "نقدي",
    }),
  });

  assert.equal(paymentResponse.status, 200);

  const updatedInvoice = await fetch(
    `${baseUrl}/api/shipments/${shipmentId}/invoice-summary`,
  );
  assert.equal(updatedInvoice.status, 200);
  const updatedSummary = await updatedInvoice.json();

  assert.equal(updatedSummary.remainingAllowed, "940.00");
  assert.deepEqual(updatedSummary.paymentAllowance, {
    knownTotalEgp: "1140.00",
    alreadyPaidEgp: "200.00",
    remainingAllowedEgp: "940.00",
    source: "recovered",
  });

  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});
