import { db } from "../db";
import {
  insertShipmentItemSchema,
  insertShipmentSchema,
  shipmentItems,
  shipmentShippingDetails,
  shipments,
  exchangeRates,
} from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";

class ShipmentServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function parseNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getLatestRmbToEgpRate(tx: any): Promise<number> {
  const [rate] = await tx
    .select()
    .from(exchangeRates)
    .where(and(eq(exchangeRates.fromCurrency, "RMB"), eq(exchangeRates.toCurrency, "EGP")))
    .orderBy(desc(exchangeRates.rateDate))
    .limit(1);

  return rate ? parseNumber(rate.rateValue) : 7.15;
}

export const shipmentService = {
  async createShipment(payload: any, userId?: string) {
    const { items = [], ...shipmentData } = payload || {};

    if (!Array.isArray(items)) {
      throw new ShipmentServiceError("قائمة البنود غير صالحة");
    }

    let parsedShipment;
    try {
      parsedShipment = insertShipmentSchema.parse({
        ...shipmentData,
        createdByUserId: userId ?? shipmentData.createdByUserId,
      });
    } catch (error) {
      throw new ShipmentServiceError("البيانات الأساسية للشحنة غير صالحة");
    }

    return db.transaction(async (tx) => {
      const [shipment] = await tx.insert(shipments).values(parsedShipment).returning();

      const validatedItems = items.map((item) => {
        try {
          return insertShipmentItemSchema.parse({ ...item, shipmentId: shipment.id });
        } catch (error) {
          throw new ShipmentServiceError("بيانات البنود غير صالحة");
        }
      });

      if (validatedItems.length > 0) {
        await tx.insert(shipmentItems).values(validatedItems);
      }

      const allItems = await tx
        .select()
        .from(shipmentItems)
        .where(eq(shipmentItems.shipmentId, shipment.id));

      const totalPurchaseCostRmb = allItems.reduce(
        (sum, item) => sum + parseNumber(item.totalPurchaseCostRmb),
        0
      );

      const totalCustomsCostEgp = allItems.reduce((sum, item) => {
        return sum + (item.cartonsCtn || 0) * parseNumber(item.customsCostPerCartonEgp);
      }, 0);

      const totalTakhreegCostEgp = allItems.reduce((sum, item) => {
        return sum + (item.cartonsCtn || 0) * parseNumber(item.takhreegCostPerCartonEgp);
      }, 0);

      const rmbToEgp = await getLatestRmbToEgpRate(tx);
      const purchaseCostEgp = totalPurchaseCostRmb * rmbToEgp;
      const knownTotalCostEgp = purchaseCostEgp + totalCustomsCostEgp + totalTakhreegCostEgp;

      // Initialize all cost and balance fields to support immediate payments
      // Note: commissionCostEgp, shippingCostEgp default to 0 (added later when shipping details entered)
      await tx
        .update(shipments)
        .set({
          purchaseCostRmb: totalPurchaseCostRmb.toFixed(2),
          purchaseCostEgp: purchaseCostEgp.toFixed(2),
          purchaseRmbToEgpRate: rmbToEgp.toFixed(4),
          customsCostEgp: totalCustomsCostEgp.toFixed(2),
          takhreegCostEgp: totalTakhreegCostEgp.toFixed(2),
          // Initialize optional cost fields to 0 (not NULL) for payment calculations
          commissionCostRmb: "0.00",
          commissionCostEgp: "0.00",
          shippingCostRmb: "0.00",
          shippingCostEgp: "0.00",
          // Set both final and known totals consistently
          finalTotalCostEgp: knownTotalCostEgp.toFixed(2),
          balanceEgp: knownTotalCostEgp.toFixed(2),
          totalPaidEgp: "0.00",
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, shipment.id));

      const [updatedShipment] = await tx.select().from(shipments).where(eq(shipments.id, shipment.id));
      return updatedShipment;
    });
  },

  async updateShipment(shipmentId: number, payload: any) {
    const { step, shipmentData, items, shippingData } = payload || {};

    return db.transaction(async (tx) => {
      const [existingShipment] = await tx
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipmentId));

      if (!existingShipment) {
        throw new ShipmentServiceError("الشحنة غير موجودة", 404);
      }

      if (shipmentData) {
        try {
          const { id: _, ...rest } = shipmentData;
          const parsedShipmentData = insertShipmentSchema.partial().parse(rest);
          await tx
            .update(shipments)
            .set({ ...parsedShipmentData, updatedAt: new Date() })
            .where(eq(shipments.id, shipmentId));
        } catch (error) {
          throw new ShipmentServiceError("بيانات الشحنة غير صالحة");
        }
      }

      if (items !== undefined) {
        if (!Array.isArray(items)) {
          throw new ShipmentServiceError("قائمة البنود غير صالحة");
        }

        const validatedItems = items.map((item) => {
          try {
            return insertShipmentItemSchema.parse({ ...item, shipmentId });
          } catch (error) {
            throw new ShipmentServiceError("بيانات البنود غير صالحة");
          }
        });

        await tx.delete(shipmentItems).where(eq(shipmentItems.shipmentId, shipmentId));
        if (validatedItems.length > 0) {
          await tx.insert(shipmentItems).values(validatedItems);
        }

        const allItems = await tx
          .select()
          .from(shipmentItems)
          .where(eq(shipmentItems.shipmentId, shipmentId));

        const totalPurchaseCostRmb = allItems.reduce(
          (sum, item) => sum + parseNumber(item.totalPurchaseCostRmb),
          0
        );

        const totalCustomsCostEgp = allItems.reduce((sum, item) => {
          return sum + (item.cartonsCtn || 0) * parseNumber(item.customsCostPerCartonEgp);
        }, 0);

        const totalTakhreegCostEgp = allItems.reduce((sum, item) => {
          return sum + (item.cartonsCtn || 0) * parseNumber(item.takhreegCostPerCartonEgp);
        }, 0);

        // CRITICAL FIX: When items are updated, must recalculate purchaseCostEgp (convert RMB→EGP)
        const rmbToEgpRate = await getLatestRmbToEgpRate(tx);
        const purchaseCostEgp = totalPurchaseCostRmb * rmbToEgpRate;

        await tx
          .update(shipments)
          .set({
            purchaseCostRmb: totalPurchaseCostRmb.toFixed(2),
            purchaseCostEgp: purchaseCostEgp.toFixed(2),
            purchaseRmbToEgpRate: rmbToEgpRate.toFixed(4),
            customsCostEgp: totalCustomsCostEgp.toFixed(2),
            takhreegCostEgp: totalTakhreegCostEgp.toFixed(2),
            // Initialize optional fields to "0.00" (prevent NULL in calculations)
            commissionCostRmb: "0.00",
            commissionCostEgp: "0.00",
            shippingCostRmb: "0.00",
            shippingCostEgp: "0.00",
            updatedAt: new Date(),
          })
          .where(eq(shipments.id, shipmentId));
      }

      if (shippingData) {
        const rmbToEgp = parseNumber(shippingData.rmbToEgpRate || 1);
        const usdToRmb = parseNumber(shippingData.usdToRmbRate || 1);

        const [shipmentForShipping] = await tx
          .select()
          .from(shipments)
          .where(eq(shipments.id, shipmentId));

        const totalPurchaseCostRmb = parseNumber(shipmentForShipping?.purchaseCostRmb);

        const commissionRmb =
          (totalPurchaseCostRmb * parseNumber(shippingData.commissionRatePercent)) / 100;
        const commissionEgp = commissionRmb * rmbToEgp;

        const shippingCostUsd =
          parseNumber(shippingData.shippingAreaSqm) *
          parseNumber(shippingData.shippingCostPerSqmUsdOriginal);
        const shippingCostRmb = shippingCostUsd * usdToRmb;
        const shippingCostEgp = shippingCostRmb * rmbToEgp;

        const shippingPayload = {
          shipmentId,
          totalPurchaseCostRmb: totalPurchaseCostRmb.toFixed(2),
          commissionRatePercent: shippingData.commissionRatePercent,
          commissionValueRmb: commissionRmb.toFixed(2),
          commissionValueEgp: commissionEgp.toFixed(2),
          shippingAreaSqm: shippingData.shippingAreaSqm,
          shippingCostPerSqmUsdOriginal: shippingData.shippingCostPerSqmUsdOriginal,
          totalShippingCostUsdOriginal: shippingCostUsd.toFixed(2),
          totalShippingCostRmb: shippingCostRmb.toFixed(2),
          totalShippingCostEgp: shippingCostEgp.toFixed(2),
          shippingDate: shippingData.shippingDate || null,
          rmbToEgpRateAtShipping: shippingData.rmbToEgpRate,
          usdToRmbRateAtShipping: shippingData.usdToRmbRate,
        };

        await tx
          .insert(shipmentShippingDetails)
          .values(shippingPayload)
          .onConflictDoUpdate({
            target: shipmentShippingDetails.shipmentId,
            set: { ...shippingPayload, updatedAt: new Date() },
          });

        const purchaseCostEgp = totalPurchaseCostRmb * rmbToEgp;

        await tx
          .update(shipments)
          .set({
            purchaseCostEgp: purchaseCostEgp.toFixed(2),
            commissionCostRmb: commissionRmb.toFixed(2),
            commissionCostEgp: commissionEgp.toFixed(2),
            shippingCostRmb: shippingCostRmb.toFixed(2),
            shippingCostEgp: shippingCostEgp.toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(shipments.id, shipmentId));
      }

      const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId));
      if (!shipment) {
        throw new ShipmentServiceError("تعذر تحديث الشحنة");
      }

      const purchaseCostEgp = parseNumber(shipment.purchaseCostEgp);
      const commissionCostEgp = parseNumber(shipment.commissionCostEgp);
      const shippingCostEgp = parseNumber(shipment.shippingCostEgp);
      const customsCostEgp = parseNumber(shipment.customsCostEgp);
      const takhreegCostEgp = parseNumber(shipment.takhreegCostEgp);

      const finalTotalCostEgp =
        purchaseCostEgp + commissionCostEgp + shippingCostEgp + customsCostEgp + takhreegCostEgp;

      const totalPaidEgp = parseNumber(shipment.totalPaidEgp);
      // Use knownTotal (same as payment validation) to calculate balance
      const knownTotal = finalTotalCostEgp;
      const balanceEgp = Math.max(0, knownTotal - totalPaidEgp);

      let newStatus = shipment.status;
      if (step === 1) {
        newStatus = "في انتظار الشحن";
      } else if (step === 2 && shippingData) {
        newStatus = "في انتظار الشحن";
      } else if (step === 3) {
        newStatus = "جاهزة للاستلام";
      } else if (step === 4) {
        newStatus = "مستلمة بنجاح";
      }

      // Ensure totalPaidEgp is set (initialize if missing to prevent NULL calculations in payments)
      const safelySetTotalPaid = shipment.totalPaidEgp || "0.00";

      await tx
        .update(shipments)
        .set({
          finalTotalCostEgp: finalTotalCostEgp.toFixed(2),
          balanceEgp: balanceEgp.toFixed(2),
          totalPaidEgp: safelySetTotalPaid,
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, shipmentId));

      const [updatedShipment] = await tx
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipmentId));
      return updatedShipment;
    });
  },
};

export { ShipmentServiceError };
