import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";

process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL || "postgres://localhost:5432/test";

const { db, pool } = await import("../db");
const { shippingCompanies, shipments, shipmentItems } = await import("@shared/schema");
const { createShipmentWithItems, updateShipmentWithItems } = await import("../shipmentService");

async function createShippingCompany(
  overrides: Partial<typeof shippingCompanies.$inferInsert> = {},
) {
  const [company] = await db
    .insert(shippingCompanies)
    .values({
      name: `Shipping ${Math.random().toString(16).slice(2, 6)}`,
      ...overrides,
    })
    .returning();
  return company;
}

async function cleanupShipment(shipmentId: number) {
  await db.delete(shipmentItems).where(eq(shipmentItems.shipmentId, shipmentId));
  await db.delete(shipments).where(eq(shipments.id, shipmentId));
}

async function cleanupShippingCompany(companyId: number) {
  await db.delete(shippingCompanies).where(eq(shippingCompanies.id, companyId));
}

describe("shipmentService shipping company", () => {
  after(async () => {
    await pool.end();
  });

  it("creates shipments with a shipping company", async () => {
    const company = await createShippingCompany({
      name: "Shipping Company",
    });

    const payload = {
      shipmentCode: `SHIP-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      shipmentName: "Hidden Shipping Supplier Shipment",
      purchaseDate: new Date("2024-02-01"),
      purchaseRmbToEgpRate: "7.10",
      shippingCompanyId: company.id,
    };

    let shipmentId: number | null = null;

    try {
      const shipment = await createShipmentWithItems(payload);
      shipmentId = shipment.id;

      assert.equal(shipment.shippingCompanyId, company.id);
    } finally {
      if (shipmentId) {
        await cleanupShipment(shipmentId);
      }
      await cleanupShippingCompany(company.id);
    }
  });

  it("updates shippingCompanyId for existing shipments", async () => {
    const initialCompany = await createShippingCompany({ name: "Initial Shipping Company" });
    const updatedCompany = await createShippingCompany({
      name: "Updated Shipping Company",
    });

    const payload = {
      shipmentCode: `SHIP-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      shipmentName: "Shipping Supplier Update",
      purchaseDate: new Date("2024-02-05"),
      purchaseRmbToEgpRate: "7.20",
      shippingCompanyId: initialCompany.id,
    };

    let shipmentId: number | null = null;

    try {
      const shipment = await createShipmentWithItems(payload);
      shipmentId = shipment.id;

      const updatedShipment = await updateShipmentWithItems(shipment.id, {
        shipmentData: {
          shippingCompanyId: updatedCompany.id,
        },
      });

      assert.equal(updatedShipment.shippingCompanyId, updatedCompany.id);
    } finally {
      if (shipmentId) {
        await cleanupShipment(shipmentId);
      }
      await cleanupShippingCompany(initialCompany.id);
      await cleanupShippingCompany(updatedCompany.id);
    }
  });
});
