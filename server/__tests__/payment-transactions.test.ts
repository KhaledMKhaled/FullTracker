import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";

process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL || "postgres://localhost:5432/test";

const { db, pool } = await import("../db");
const { storage } = await import("../storage");
const {
  paymentAllocations,
  shipmentItems,
  shipmentPayments,
  shipments,
  suppliers,
} = await import("@shared/schema");

const parseAmount = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : parseFloat(value as any);
  return Number.isFinite(parsed) ? parsed : 0;
};

async function createTestShipment(overrides: Partial<typeof shipments.$inferInsert> = {}) {
  const [shipment] = await db
    .insert(shipments)
    .values({
      shipmentCode: `TX-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      shipmentName: "Atomicity Check",
      purchaseDate: new Date(),
      purchaseCostRmb: "100.00",
      purchaseRmbToEgpRate: "10.00",
      customsCostEgp: "50.00",
      takhreegCostEgp: "0",
      commissionCostRmb: "0",
      shippingCostRmb: "0",
      status: "جديدة",
      ...overrides,
    })
    .returning();

  return shipment;
}

async function createSupplier(name: string) {
  const [supplier] = await db
    .insert(suppliers)
    .values({
      name,
      country: "الصين",
    })
    .returning();

  return supplier;
}

async function createShipmentItem({
  shipmentId,
  supplierId,
  totalPurchaseCostRmb,
}: {
  shipmentId: number;
  supplierId: number;
  totalPurchaseCostRmb: string;
}) {
  const [item] = await db
    .insert(shipmentItems)
    .values({
      shipmentId,
      supplierId,
      productName: `Item-${supplierId}`,
      totalPurchaseCostRmb,
    })
    .returning();

  return item;
}

async function cleanupShipment(shipmentId: number) {
  await db.delete(paymentAllocations).where(eq(paymentAllocations.shipmentId, shipmentId));
  await db.delete(shipmentItems).where(eq(shipmentItems.shipmentId, shipmentId));
  await db.delete(shipmentPayments).where(eq(shipmentPayments.shipmentId, shipmentId));
  await db.delete(shipments).where(eq(shipments.id, shipmentId));
}

const buildPayment = (shipmentId: number) => ({
  shipmentId,
  paymentDate: new Date(),
  paymentCurrency: "EGP",
  amountOriginal: "100.00",
  amountEgp: "100.00",
  costComponent: "تكلفة البضاعة",
  paymentMethod: "نقدي",
  createdByUserId: "tester",
});

describe("payment transaction atomicity", () => {
  after(async () => {
    await pool.end();
  });

  it("commits payment with synchronized totals", async () => {
    const shipment = await createTestShipment();

    try {
      const payment = await storage.createPayment(buildPayment(shipment.id));

      const [reloadedShipment] = await db
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipment.id));
      const payments = await db
        .select()
        .from(shipmentPayments)
        .where(eq(shipmentPayments.shipmentId, shipment.id));

      assert.equal(payments.length, 1);
      assert.equal(payments[0].id, payment.id);

      const expectedTotal = 1000 + 50; // RMB converted with rate + customs
      assert.equal(parseAmount(reloadedShipment.purchaseCostEgp), 1000);
      assert.equal(parseAmount(reloadedShipment.finalTotalCostEgp), expectedTotal);
      assert.equal(parseAmount(reloadedShipment.totalPaidEgp), 100);
      assert.equal(parseAmount(reloadedShipment.balanceEgp), expectedTotal - 100);
    } finally {
      await cleanupShipment(shipment.id);
    }
  });

  it("rolls back the payment insert and shipment updates when an error occurs after insert", async () => {
    const shipment = await createTestShipment();

    try {
      await assert.rejects(() =>
        storage.createPayment(buildPayment(shipment.id), {
          simulatePostInsertError: true,
        })
      );

      const payments = await db
        .select()
        .from(shipmentPayments)
        .where(eq(shipmentPayments.shipmentId, shipment.id));
      const [reloadedShipment] = await db
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipment.id));

      assert.equal(payments.length, 0);
      assert.equal(parseAmount(reloadedShipment.totalPaidEgp), 0);
      assert.equal(parseAmount(reloadedShipment.balanceEgp), 0);
      assert.equal(parseAmount(reloadedShipment.finalTotalCostEgp), 0);
    } finally {
      await cleanupShipment(shipment.id);
    }
  });

  it("skips auto allocations when autoAllocate is false", async () => {
    const shipment = await createTestShipment();
    const supplier = await createSupplier("Supplier Skip");
    await createShipmentItem({
      shipmentId: shipment.id,
      supplierId: supplier.id,
      totalPurchaseCostRmb: "100.00",
    });

    try {
      await storage.createPayment(
        {
          shipmentId: shipment.id,
          paymentDate: new Date(),
          paymentCurrency: "RMB",
          amountOriginal: "50.00",
          exchangeRateToEgp: "10.00",
          amountEgp: "500.00",
          costComponent: "تكلفة البضاعة",
          paymentMethod: "نقدي",
          createdByUserId: "tester",
          partyType: "shipping_company",
          partyId: 10,
        },
        { autoAllocate: false },
      );

      const allocations = await db
        .select()
        .from(paymentAllocations)
        .where(eq(paymentAllocations.shipmentId, shipment.id));

      assert.equal(allocations.length, 0);
    } finally {
      await cleanupShipment(shipment.id);
      await db.delete(suppliers).where(eq(suppliers.id, supplier.id));
    }
  });

  it("allocates proportionally so allocations sum to the payment amount", async () => {
    const shipment = await createTestShipment({ purchaseCostRmb: "300.00" });
    const supplierA = await createSupplier("Supplier A");
    const supplierB = await createSupplier("Supplier B");

    await createShipmentItem({
      shipmentId: shipment.id,
      supplierId: supplierA.id,
      totalPurchaseCostRmb: "100.00",
    });
    await createShipmentItem({
      shipmentId: shipment.id,
      supplierId: supplierB.id,
      totalPurchaseCostRmb: "200.00",
    });

    try {
      const payment = await storage.createPayment(
        {
          shipmentId: shipment.id,
          paymentDate: new Date(),
          paymentCurrency: "RMB",
          amountOriginal: "150.00",
          exchangeRateToEgp: "10.00",
          amountEgp: "1500.00",
          costComponent: "تكلفة البضاعة",
          paymentMethod: "نقدي",
          createdByUserId: "tester",
          partyType: "shipping_company",
          partyId: 10,
        },
        { autoAllocate: true },
      );

      const allocations = await db
        .select()
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, payment.id));

      const totalAllocated = allocations.reduce(
        (sum, allocation) => sum + parseAmount(allocation.allocatedAmount),
        0,
      );
      assert.equal(parseAmount(totalAllocated.toFixed(2)), 150);
    } finally {
      await cleanupShipment(shipment.id);
      await db.delete(suppliers).where(eq(suppliers.id, supplierA.id));
      await db.delete(suppliers).where(eq(suppliers.id, supplierB.id));
    }
  });
});
