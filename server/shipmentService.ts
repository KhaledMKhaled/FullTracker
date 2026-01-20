import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { ZodError } from "zod";
import {
  auditLogs,
  exchangeRates,
  insertShipmentItemSchema,
  insertShipmentSchema,
  inventoryMovements,
  shipmentItems,
  shipments,
  shipmentShippingDetails,
  shippingCompanies,
  type InsertShipmentItem,
  type Shipment,
  type ShipmentItem,
} from "@shared/schema";
import { db } from "./db";
import {
  convertRmbToEgp,
  convertUsdToRmb,
  roundAmount,
} from "./services/currency";

const CHUNK_SIZE = 50;

type CreateShipmentPayload = {
  items?: unknown[];
  [key: string]: unknown;
};

type UpdateShipmentPayload = {
  step?: number;
  shipmentData?: unknown;
  items?: unknown[];
  shippingData?: any;
};

function calculateItemTotals(items: ShipmentItem[]) {
  const purchaseCostRmb = items.reduce(
    (sum, item) => sum + parseFloat(item.totalPurchaseCostRmb || "0"),
    0
  );

  const customsCostEgp = items.reduce((sum, item) => {
    const pieces = item.totalPiecesCou || 0;
    const customsPerPiece = parseFloat(item.customsCostPerCartonEgp || "0");
    return sum + pieces * customsPerPiece;
  }, 0);

  const takhreegCostEgp = items.reduce((sum, item) => {
    const ctn = item.cartonsCtn || 0;
    const takhreegPerCarton = parseFloat(item.takhreegCostPerCartonEgp || "0");
    return sum + ctn * takhreegPerCarton;
  }, 0);

  return {
    purchaseCostRmb,
    customsCostEgp,
    takhreegCostEgp,
  };
}

async function ensureShippingCompanyExists(
  shippingCompanyId?: number | null
) {
  if (shippingCompanyId === undefined || shippingCompanyId === null) {
    return;
  }

  const [company] = await db
    .select()
    .from(shippingCompanies)
    .where(eq(shippingCompanies.id, shippingCompanyId));

  if (!company) {
    throw new Error("شركة الشحن غير موجودة");
  }
}

function prepareItemForInsert(item: Omit<InsertShipmentItem, 'shipmentId'>, shipmentId: number, lineNo: number) {
  const pieces = item.totalPiecesCou || 0;
  const cartons = item.cartonsCtn || 0;
  const customsPerPiece = parseFloat(item.customsCostPerCartonEgp?.toString() || "0");
  const takhreegPerCarton = parseFloat(item.takhreegCostPerCartonEgp?.toString() || "0");
  const totalCustomsCostEgp = (pieces * customsPerPiece).toFixed(2);
  const totalTakhreegCostEgp = (cartons * takhreegPerCarton).toFixed(2);

  return {
    ...item,
    shipmentId,
    lineNo,
    totalCustomsCostEgp,
    totalTakhreegCostEgp,
  };
}

async function bulkInsertItems(
  tx: any,
  items: Omit<InsertShipmentItem, 'shipmentId'>[],
  shipmentId: number,
  startLineNo: number
): Promise<ShipmentItem[]> {
  const allInsertedItems: ShipmentItem[] = [];
  
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const preparedChunk = chunk.map((item, idx) => 
      prepareItemForInsert(item, shipmentId, startLineNo + i + idx)
    );
    
    const insertedChunk = await tx
      .insert(shipmentItems)
      .values(preparedChunk)
      .returning();
    
    allInsertedItems.push(...insertedChunk);
  }
  
  return allInsertedItems;
}

export async function createShipmentWithItems(
  payload: CreateShipmentPayload,
  userId?: string
): Promise<Shipment> {
  const { items = [], ...shipmentData } = payload || {};

  try {
    const validatedShipment = insertShipmentSchema.parse({
      ...shipmentData,
      createdByUserId: userId,
    });

    await ensureShippingCompanyExists(validatedShipment.shippingCompanyId ?? null);

    const purchaseRateFromPayload = validatedShipment.purchaseRmbToEgpRate
      ? parseFloat(validatedShipment.purchaseRmbToEgpRate)
      : undefined;

    const parsedItems = (items as unknown[]).map((item) =>
      insertShipmentItemSchema.omit({ shipmentId: true }).parse(item)
    );

    const shipment = await db.transaction(async (tx) => {
      const [createdShipment] = await tx
        .insert(shipments)
        .values(validatedShipment)
        .returning();

      const insertedItems = await bulkInsertItems(tx, parsedItems, createdShipment.id, 1);

      const totals = calculateItemTotals(insertedItems);

      const [latestRmbRate] = await tx
        .select()
        .from(exchangeRates)
        .where(
          and(eq(exchangeRates.fromCurrency, "RMB"), eq(exchangeRates.toCurrency, "EGP"))
        )
        .orderBy(desc(exchangeRates.rateDate))
        .limit(1);

      const purchaseRate = purchaseRateFromPayload
        ? purchaseRateFromPayload
        : latestRmbRate
          ? parseFloat(latestRmbRate.rateValue)
          : 7.15;
      const purchaseCostEgp = convertRmbToEgp(totals.purchaseCostRmb, purchaseRate);
      const finalTotalCostEgp = roundAmount(
        purchaseCostEgp + totals.customsCostEgp + totals.takhreegCostEgp,
      );

      const [updatedShipment] = await tx
        .update(shipments)
        .set({
          purchaseCostRmb: totals.purchaseCostRmb.toFixed(2),
          purchaseCostEgp: purchaseCostEgp.toFixed(2),
          purchaseRmbToEgpRate: purchaseRate.toFixed(4),
          customsCostEgp: totals.customsCostEgp.toFixed(2),
          takhreegCostEgp: totals.takhreegCostEgp.toFixed(2),
          commissionCostRmb: "0.00",
          commissionCostEgp: "0.00",
          shippingCostRmb: "0.00",
          shippingCostEgp: "0.00",
          finalTotalCostEgp: finalTotalCostEgp.toFixed(2),
          balanceEgp: finalTotalCostEgp.toFixed(2),
          totalPaidEgp: "0.00",
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, createdShipment.id))
        .returning();

      return updatedShipment;
    });

    return shipment;
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`بيانات الشحنة أو البنود غير صالحة: ${fieldErrors}`);
    }
    const errorMessage = (error as Error)?.message || "خطأ غير معروف";
    throw new Error(`تعذر إنشاء الشحنة: ${errorMessage}`);
  }
}

export async function updateShipmentWithItems(
  shipmentId: number,
  payload: UpdateShipmentPayload
): Promise<Shipment> {
  const { step, shipmentData, items, shippingData } = payload || {};

  try {
    const validatedShipmentData = shipmentData
      ? insertShipmentSchema.partial().parse(shipmentData)
      : undefined;

    if (validatedShipmentData?.shippingCompanyId !== undefined) {
      await ensureShippingCompanyExists(
        validatedShipmentData.shippingCompanyId ?? null
      );
    }

    const parsedItems = items && Array.isArray(items)
      ? (items as unknown[]).map((item) =>
          insertShipmentItemSchema.omit({ shipmentId: true }).parse(item)
        )
      : undefined;

    const shipment = await db.transaction(async (tx) => {
      const [existingShipment] = await tx
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipmentId));

      if (!existingShipment) {
        throw new Error("الشحنة غير موجودة");
      }

      let currentShipment = existingShipment;

      const purchaseRate = validatedShipmentData?.purchaseRmbToEgpRate
        ? parseFloat(validatedShipmentData.purchaseRmbToEgpRate)
        : parseFloat(existingShipment.purchaseRmbToEgpRate || "0") || 7.15;

      if (validatedShipmentData) {
        const [updated] = await tx
          .update(shipments)
          .set({ ...validatedShipmentData, updatedAt: new Date() })
          .where(eq(shipments.id, shipmentId))
          .returning();
        if (updated) {
          currentShipment = updated;
        }
      }

      if (parsedItems) {
        const existingItems = await tx
          .select()
          .from(shipmentItems)
          .where(eq(shipmentItems.shipmentId, shipmentId));

        const existingItemsById = new Map(
          existingItems.map(item => [item.id, item])
        );

        const incomingItemsWithId = parsedItems.filter((item: any) => item.id && existingItemsById.has(item.id));
        const newItems = parsedItems.filter((item: any) => !item.id || !existingItemsById.has(item.id));

        const incomingIds = new Set(incomingItemsWithId.map((item: any) => item.id));
        const itemsToDelete = existingItems.filter(item => !incomingIds.has(item.id));

        if (itemsToDelete.length > 0) {
          const idsToDelete = itemsToDelete.map(item => item.id);
          
          // First delete related inventory movements (for completed shipments)
          for (let i = 0; i < idsToDelete.length; i += CHUNK_SIZE) {
            const chunk = idsToDelete.slice(i, i + CHUNK_SIZE);
            await tx.delete(inventoryMovements).where(inArray(inventoryMovements.shipmentItemId, chunk));
          }
          
          // Then delete the items
          for (let i = 0; i < idsToDelete.length; i += CHUNK_SIZE) {
            const chunk = idsToDelete.slice(i, i + CHUNK_SIZE);
            await tx.delete(shipmentItems).where(inArray(shipmentItems.id, chunk));
          }
        }

        for (let i = 0; i < incomingItemsWithId.length; i += CHUNK_SIZE) {
          const chunk = incomingItemsWithId.slice(i, i + CHUNK_SIZE);
          for (const item of chunk) {
            const existingItem = existingItemsById.get((item as any).id);
            if (!existingItem) continue;

            const pieces = (item as InsertShipmentItem).totalPiecesCou || 0;
            const cartons = (item as InsertShipmentItem).cartonsCtn || 0;
            const customsPerPiece = parseFloat((item as InsertShipmentItem).customsCostPerCartonEgp?.toString() || "0");
            const takhreegPerCarton = parseFloat((item as InsertShipmentItem).takhreegCostPerCartonEgp?.toString() || "0");

            await tx
              .update(shipmentItems)
              .set({
                ...item,
                lineNo: existingItem.lineNo,
                totalCustomsCostEgp: (pieces * customsPerPiece).toFixed(2),
                totalTakhreegCostEgp: (cartons * takhreegPerCarton).toFixed(2),
                missingPieces: existingItem.missingPieces,
                missingCostEgp: existingItem.missingCostEgp,
                updatedAt: new Date(),
              })
              .where(eq(shipmentItems.id, (item as any).id));
          }
        }

        if (newItems.length > 0) {
          const [maxLineNoResult] = await tx
            .select({ maxLineNo: sql<number>`COALESCE(MAX(${shipmentItems.lineNo}), 0)` })
            .from(shipmentItems)
            .where(eq(shipmentItems.shipmentId, shipmentId));

          const startLineNo = (maxLineNoResult?.maxLineNo || 0) + 1;
          await bulkInsertItems(tx, newItems, shipmentId, startLineNo);
        }

        const updatedItems = await tx
          .select()
          .from(shipmentItems)
          .where(eq(shipmentItems.shipmentId, shipmentId));

        const totals = calculateItemTotals(updatedItems);

        const [updatedAfterItems] = await tx
          .update(shipments)
          .set({
            purchaseCostRmb: totals.purchaseCostRmb.toFixed(2),
            purchaseCostEgp: convertRmbToEgp(totals.purchaseCostRmb, purchaseRate).toFixed(2),
            purchaseRmbToEgpRate: purchaseRate.toFixed(4),
            customsCostEgp: totals.customsCostEgp.toFixed(2),
            takhreegCostEgp: totals.takhreegCostEgp.toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(shipments.id, shipmentId))
          .returning();

        if (updatedAfterItems) {
          currentShipment = updatedAfterItems;
        } else {
          currentShipment = {
            ...currentShipment,
            purchaseCostRmb: totals.purchaseCostRmb.toFixed(2),
            purchaseCostEgp: convertRmbToEgp(totals.purchaseCostRmb, purchaseRate).toFixed(2),
            purchaseRmbToEgpRate: purchaseRate.toFixed(4),
            customsCostEgp: totals.customsCostEgp.toFixed(2),
            takhreegCostEgp: totals.takhreegCostEgp.toFixed(2),
          } as Shipment;
        }
      }

      if (shippingData) {
        const rmbToEgpRaw =
          parseFloat(shippingData.rmbToEgpRate || "0") ||
          parseFloat(currentShipment.purchaseRmbToEgpRate || "0") ||
          1;
        const usdToRmbRaw = parseFloat(shippingData.usdToRmbRate || "0") || 1;
        const rmbToEgp = rmbToEgpRaw > 0 ? rmbToEgpRaw : 1;
        const usdToRmb = usdToRmbRaw > 0 ? usdToRmbRaw : 1;

        const totalPurchaseCostRmb = parseFloat(currentShipment.purchaseCostRmb || "0");
        const commissionRmb =
          (totalPurchaseCostRmb * parseFloat(shippingData.commissionRatePercent || "0")) /
          100;
        const commissionEgp = convertRmbToEgp(commissionRmb, rmbToEgp);

        const shippingCostUsd =
          parseFloat(shippingData.shippingAreaSqm || "0") *
          parseFloat(shippingData.shippingCostPerSqmUsdOriginal || "0");
        const shippingCostRmb = convertUsdToRmb(shippingCostUsd, usdToRmb);
        const shippingCostEgp = convertRmbToEgp(shippingCostRmb, rmbToEgp);

        const parsedShippingDate = shippingData.shippingDate || null;
        const parsedRatesUpdatedAt = shippingData.ratesUpdatedAt ? new Date(shippingData.ratesUpdatedAt) : null;

        await tx
          .insert(shipmentShippingDetails)
          .values({
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
            shippingDate: parsedShippingDate,
            rmbToEgpRateAtShipping: shippingData.rmbToEgpRate,
            usdToRmbRateAtShipping: shippingData.usdToRmbRate,
            sourceOfRates: shippingData.sourceOfRates,
            ratesUpdatedAt: parsedRatesUpdatedAt,
          })
          .onConflictDoUpdate({
            target: shipmentShippingDetails.shipmentId,
            set: {
              totalPurchaseCostRmb: totalPurchaseCostRmb.toFixed(2),
              commissionRatePercent: shippingData.commissionRatePercent,
              commissionValueRmb: commissionRmb.toFixed(2),
              commissionValueEgp: commissionEgp.toFixed(2),
              shippingAreaSqm: shippingData.shippingAreaSqm,
              shippingCostPerSqmUsdOriginal: shippingData.shippingCostPerSqmUsdOriginal,
              totalShippingCostUsdOriginal: shippingCostUsd.toFixed(2),
              totalShippingCostRmb: shippingCostRmb.toFixed(2),
              totalShippingCostEgp: shippingCostEgp.toFixed(2),
              shippingDate: parsedShippingDate,
              rmbToEgpRateAtShipping: shippingData.rmbToEgpRate,
              usdToRmbRateAtShipping: shippingData.usdToRmbRate,
              sourceOfRates: shippingData.sourceOfRates,
              ratesUpdatedAt: parsedRatesUpdatedAt,
              updatedAt: new Date(),
            },
          })
          .returning();

        const [updatedAfterShipping] = await tx
          .update(shipments)
          .set({
            purchaseCostEgp: convertRmbToEgp(totalPurchaseCostRmb, purchaseRate).toFixed(2),
            commissionCostRmb: commissionRmb.toFixed(2),
            commissionCostEgp: commissionEgp.toFixed(2),
            shippingCostRmb: shippingCostRmb.toFixed(2),
            shippingCostEgp: shippingCostEgp.toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(shipments.id, shipmentId))
          .returning();

        if (updatedAfterShipping) {
          currentShipment = updatedAfterShipping;
        }
      }

      const [latestShipment] = await tx
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipmentId));

      const shipmentForTotals = latestShipment || currentShipment;

      const purchaseCostEgp = parseFloat(shipmentForTotals.purchaseCostEgp || "0");
      const commissionCostEgp = parseFloat(shipmentForTotals.commissionCostEgp || "0");
      const shippingCostEgp = parseFloat(shipmentForTotals.shippingCostEgp || "0");
      const customsCostEgp = parseFloat(shipmentForTotals.customsCostEgp || "0");
      const takhreegCostEgp = parseFloat(shipmentForTotals.takhreegCostEgp || "0");

      // Recalculate missing costs for items with missingPieces > 0
      const allItems = await tx
        .select()
        .from(shipmentItems)
        .where(eq(shipmentItems.shipmentId, shipmentId));

      const totalPiecesForMissing = allItems.reduce((sum, item) => sum + (item.totalPiecesCou || 0), 0);
      const purchaseRateForMissing = parseFloat(shipmentForTotals.purchaseRmbToEgpRate || "7");
      
      let recalculatedTotalMissingCostEgp = 0;
      
      for (const item of allItems) {
        if ((item.missingPieces || 0) > 0) {
          // Calculate unit landed cost
          const itemPurchaseCostEgp = parseFloat(item.totalPurchaseCostRmb || "0") * purchaseRateForMissing;
          const pieceRatio = totalPiecesForMissing > 0 ? (item.totalPiecesCou || 0) / totalPiecesForMissing : 0;
          const itemShareOfExtras = pieceRatio * (customsCostEgp + takhreegCostEgp + shippingCostEgp + commissionCostEgp);
          const itemTotalCostEgp = itemPurchaseCostEgp + itemShareOfExtras;
          const unitCostEgp = (item.totalPiecesCou || 0) > 0 ? itemTotalCostEgp / (item.totalPiecesCou || 1) : 0;
          
          const newMissingCostEgp = roundAmount(item.missingPieces * unitCostEgp);
          recalculatedTotalMissingCostEgp += newMissingCostEgp;
          
          // Update item's missing cost if it changed
          if (parseFloat(item.missingCostEgp || "0") !== newMissingCostEgp) {
            await tx
              .update(shipmentItems)
              .set({
                missingCostEgp: newMissingCostEgp.toFixed(2),
                updatedAt: new Date(),
              })
              .where(eq(shipmentItems.id, item.id));
          }
        }
      }

      // Update shipment's total missing cost
      if (parseFloat(shipmentForTotals.totalMissingCostEgp || "0") !== recalculatedTotalMissingCostEgp) {
        await tx
          .update(shipments)
          .set({
            totalMissingCostEgp: recalculatedTotalMissingCostEgp.toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(shipments.id, shipmentId));
      }

      const finalTotalCostEgp = roundAmount(
        purchaseCostEgp + commissionCostEgp + shippingCostEgp + customsCostEgp + takhreegCostEgp - recalculatedTotalMissingCostEgp,
      );

      const totalPaidEgp = parseFloat(shipmentForTotals.totalPaidEgp || "0");
      const balanceEgp = roundAmount(Math.max(0, finalTotalCostEgp - totalPaidEgp));

      let newStatus = shipmentForTotals.status;
      const previousStatus = shipmentForTotals.status;
      
      // Don't downgrade status if shipment is already completed or archived
      const isCompletedOrArchived = previousStatus === "مستلمة بنجاح" || previousStatus === "مؤرشفة";
      
      if (!isCompletedOrArchived) {
        // Only update status for shipments that are still in progress
        if (step === 1) {
          newStatus = "في انتظار الشحن";
        } else if (step === 2 && shippingData) {
          newStatus = "في انتظار الشحن";
        } else if (step === 3) {
          newStatus = "جاهزة للاستلام";
        } else if (step === 4) {
          newStatus = "جاهزة للاستلام";
        } else if (step === 5) {
          newStatus = "مستلمة بنجاح";
        }
      }

      const [finalShipment] = await tx
        .update(shipments)
          .set({
            finalTotalCostEgp: finalTotalCostEgp.toFixed(2),
            balanceEgp: balanceEgp.toFixed(2),
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, shipmentId))
        .returning();

      // Always recreate inventory when step 5 is saved for a completed shipment
      // This ensures inventory always matches the latest shipment state
      if (step === 5 && newStatus === "مستلمة بنجاح") {
        // Delete existing inventory movements for this shipment first
        await tx.delete(inventoryMovements).where(eq(inventoryMovements.shipmentId, shipmentId));
        const shipmentItemsForInventory = await tx
          .select()
          .from(shipmentItems)
          .where(eq(shipmentItems.shipmentId, shipmentId));

        const purchaseRate = parseFloat(shipmentForTotals.purchaseRmbToEgpRate || "7");
        const totalCustomsCost = parseFloat(shipmentForTotals.customsCostEgp || "0");
        const totalTakhreegCost = parseFloat(shipmentForTotals.takhreegCostEgp || "0");
        const totalShippingCost = parseFloat(shipmentForTotals.shippingCostEgp || "0");
        const totalCommissionCost = parseFloat(shipmentForTotals.commissionCostEgp || "0");

        const totalPieces = shipmentItemsForInventory.reduce((sum, item) => sum + (item.totalPiecesCou || 0), 0);

        const inventoryBatches = [];
        for (const item of shipmentItemsForInventory) {
          const itemPurchaseCostEgp = parseFloat(item.totalPurchaseCostRmb || "0") * purchaseRate;
          
          const pieceRatio = totalPieces > 0 ? (item.totalPiecesCou || 0) / totalPieces : 0;
          const itemShareOfExtras = pieceRatio * (totalCustomsCost + totalTakhreegCost + totalShippingCost + totalCommissionCost);
          
          const itemTotalCostEgp = itemPurchaseCostEgp + itemShareOfExtras;
          const unitCostEgp = (item.totalPiecesCou || 0) > 0 ? itemTotalCostEgp / (item.totalPiecesCou || 1) : 0;
          const unitCostRmb = purchaseRate > 0 ? unitCostEgp / purchaseRate : 0;

          const actualPiecesReceived = (item.totalPiecesCou || 0) - (item.missingPieces || 0);
          const actualTotalCostEgp = actualPiecesReceived * unitCostEgp;

          inventoryBatches.push({
            shipmentId,
            shipmentItemId: item.id,
            productId: item.productId,
            totalPiecesIn: actualPiecesReceived,
            unitCostRmb: unitCostRmb.toFixed(4),
            unitCostEgp: unitCostEgp.toFixed(4),
            totalCostEgp: actualTotalCostEgp.toFixed(2),
            movementDate: new Date().toISOString().split("T")[0],
          });
        }

        for (let i = 0; i < inventoryBatches.length; i += CHUNK_SIZE) {
          const chunk = inventoryBatches.slice(i, i + CHUNK_SIZE);
          await tx.insert(inventoryMovements).values(chunk);
        }
      }

      return finalShipment || shipmentForTotals;
    });

    return shipment;
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`بيانات الشحنة أو البنود غير صالحة: ${fieldErrors}`);
    }
    const errorMessage = (error as Error)?.message || "خطأ غير معروف";
    throw new Error(`تعذر تحديث الشحنة: ${errorMessage}`);
  }
}

export type MissingPiecesUpdate = {
  itemId: number;
  missingPieces: number;
};

export async function updateMissingPieces(
  shipmentId: number,
  updates: MissingPiecesUpdate[],
  userId?: string
): Promise<Shipment> {
  try {
    const shipment = await db.transaction(async (tx) => {
      const [existingShipment] = await tx
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipmentId));

      if (!existingShipment) {
        throw new Error("الشحنة غير موجودة");
      }

      const existingItems = await tx
        .select()
        .from(shipmentItems)
        .where(eq(shipmentItems.shipmentId, shipmentId));

      const itemsMap = new Map(existingItems.map(item => [item.id, item]));

      for (const update of updates) {
        const existingItem = itemsMap.get(update.itemId);
        if (!existingItem) {
          throw new Error(`البند رقم ${update.itemId} غير موجود في الشحنة`);
        }

        if (update.missingPieces < 0) {
          throw new Error("عدد النواقص لا يمكن أن يكون سالباً");
        }

        if (update.missingPieces > (existingItem.totalPiecesCou || 0)) {
          throw new Error(`عدد النواقص (${update.missingPieces}) أكبر من إجمالي القطع (${existingItem.totalPiecesCou})`);
        }
      }

      const purchaseRate = parseFloat(existingShipment.purchaseRmbToEgpRate || "7");
      const totalCustomsCost = parseFloat(existingShipment.customsCostEgp || "0");
      const totalTakhreegCost = parseFloat(existingShipment.takhreegCostEgp || "0");
      const totalShippingCost = parseFloat(existingShipment.shippingCostEgp || "0");
      const totalCommissionCost = parseFloat(existingShipment.commissionCostEgp || "0");
      const totalPieces = existingItems.reduce((sum, item) => sum + (item.totalPiecesCou || 0), 0);

      const auditDetails: any[] = [];
      let totalMissingCostEgp = 0;

      for (const update of updates) {
        const item = itemsMap.get(update.itemId)!;
        const oldMissingPieces = item.missingPieces || 0;
        const newMissingPieces = update.missingPieces;

        const itemPurchaseCostEgp = parseFloat(item.totalPurchaseCostRmb || "0") * purchaseRate;
        const pieceRatio = totalPieces > 0 ? (item.totalPiecesCou || 0) / totalPieces : 0;
        const itemShareOfExtras = pieceRatio * (totalCustomsCost + totalTakhreegCost + totalShippingCost + totalCommissionCost);
        const itemTotalCostEgp = itemPurchaseCostEgp + itemShareOfExtras;
        const unitCostEgp = (item.totalPiecesCou || 0) > 0 ? itemTotalCostEgp / (item.totalPiecesCou || 1) : 0;

        const missingCostEgp = roundAmount(newMissingPieces * unitCostEgp);
        totalMissingCostEgp += missingCostEgp;

        await tx
          .update(shipmentItems)
          .set({
            missingPieces: newMissingPieces,
            missingCostEgp: missingCostEgp.toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(shipmentItems.id, update.itemId));

        if (oldMissingPieces !== newMissingPieces) {
          auditDetails.push({
            itemId: item.id,
            productName: item.productName,
            oldMissingPieces,
            newMissingPieces,
            unitCostEgp: unitCostEgp.toFixed(4),
            missingCostEgp: missingCostEgp.toFixed(2),
          });
        }
      }

      for (const item of existingItems) {
        if (!updates.some(u => u.itemId === item.id)) {
          totalMissingCostEgp += parseFloat(item.missingCostEgp || "0");
        }
      }

      const purchaseCostEgp = parseFloat(existingShipment.purchaseCostEgp || "0");
      const commissionCostEgp = parseFloat(existingShipment.commissionCostEgp || "0");
      const shippingCostEgp = parseFloat(existingShipment.shippingCostEgp || "0");
      const customsCostEgp = parseFloat(existingShipment.customsCostEgp || "0");
      const takhreegCostEgp = parseFloat(existingShipment.takhreegCostEgp || "0");

      const finalTotalCostEgp = roundAmount(
        purchaseCostEgp + commissionCostEgp + shippingCostEgp + customsCostEgp + takhreegCostEgp - totalMissingCostEgp
      );

      const totalPaidEgp = parseFloat(existingShipment.totalPaidEgp || "0");
      const balanceEgp = roundAmount(Math.max(0, finalTotalCostEgp - totalPaidEgp));

      const [updatedShipment] = await tx
        .update(shipments)
        .set({
          totalMissingCostEgp: totalMissingCostEgp.toFixed(2),
          finalTotalCostEgp: finalTotalCostEgp.toFixed(2),
          balanceEgp: balanceEgp.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, shipmentId))
        .returning();

      if (auditDetails.length > 0) {
        await tx.insert(auditLogs).values({
          userId: userId || null,
          entityType: "shipment",
          entityId: shipmentId.toString(),
          actionType: "missing_pieces_updated",
          details: {
            shipmentCode: existingShipment.shipmentCode,
            updates: auditDetails,
            oldTotalMissingCost: existingShipment.totalMissingCostEgp,
            newTotalMissingCost: totalMissingCostEgp.toFixed(2),
          },
        });
      }

      return updatedShipment;
    });

    return shipment;
  } catch (error) {
    const errorMessage = (error as Error)?.message || "خطأ غير معروف";
    throw new Error(`تعذر تحديث النواقص: ${errorMessage}`);
  }
}

export function calculateUnitLandedCost(
  item: ShipmentItem,
  shipmentData: {
    purchaseRmbToEgpRate: string;
    commissionCostEgp: string;
    shippingCostEgp: string;
    customsCostEgp: string;
    takhreegCostEgp: string;
  },
  totalShipmentPieces: number
): { unitCostEgp: number; unitCostRmb: number } {
  const purchaseRate = parseFloat(shipmentData.purchaseRmbToEgpRate || "7");
  const totalCommissionCost = parseFloat(shipmentData.commissionCostEgp || "0");
  const totalShippingCost = parseFloat(shipmentData.shippingCostEgp || "0");
  const totalCustomsCost = parseFloat(shipmentData.customsCostEgp || "0");
  const totalTakhreegCost = parseFloat(shipmentData.takhreegCostEgp || "0");

  const itemPurchaseCostEgp = parseFloat(item.totalPurchaseCostRmb || "0") * purchaseRate;
  const pieceRatio = totalShipmentPieces > 0 ? (item.totalPiecesCou || 0) / totalShipmentPieces : 0;
  const itemShareOfExtras = pieceRatio * (totalCustomsCost + totalTakhreegCost + totalShippingCost + totalCommissionCost);
  const itemTotalCostEgp = itemPurchaseCostEgp + itemShareOfExtras;
  const unitCostEgp = (item.totalPiecesCou || 0) > 0 ? itemTotalCostEgp / (item.totalPiecesCou || 1) : 0;
  const unitCostRmb = purchaseRate > 0 ? unitCostEgp / purchaseRate : 0;

  return { unitCostEgp, unitCostRmb };
}
