import { eq, desc, asc, and, sql, inArray, lte, gte } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  suppliers,
  shippingCompanies,
  productTypes,
  products,
  shipments,
  shipmentItems,
  shipmentShippingDetails,
  shipmentCustomsDetails,
  exchangeRates,
  shipmentPayments,
  paymentAllocations,
  inventoryMovements,
  auditLogs,
  parties,
  partySeasons,
  localInvoices,
  localInvoiceLines,
  localReceipts,
  partyLedgerEntries,
  localPayments,
  returnCases,
  partyCollections,
  notifications,
  type User,
  type UpsertUser,
  type Supplier,
  type InsertSupplier,
  type ShippingCompany,
  type InsertShippingCompany,
  type ProductType,
  type InsertProductType,
  type Product,
  type InsertProduct,
  type Shipment,
  type InsertShipment,
  type ShipmentItem,
  type InsertShipmentItem,
  type ShipmentShippingDetails,
  type InsertShipmentShippingDetails,
  type ShipmentCustomsDetails,
  type InsertShipmentCustomsDetails,
  type ExchangeRate,
  type InsertExchangeRate,
  type ShipmentPayment,
  type InsertShipmentPayment,
  type PaymentAllocation,
  type InventoryMovement,
  type InsertInventoryMovement,
  type AuditLog,
  type InsertAuditLog,
  type Party,
  type InsertParty,
  type PartySeason,
  type InsertPartySeason,
  type LocalInvoice,
  type InsertLocalInvoice,
  type LocalInvoiceLine,
  type InsertLocalInvoiceLine,
  type LocalReceipt,
  type InsertLocalReceipt,
  type PartyLedgerEntry,
  type InsertPartyLedgerEntry,
  type LocalPayment,
  type InsertLocalPayment,
  type ReturnCase,
  type InsertReturnCase,
  type Notification,
  type InsertNotification,
} from "@shared/schema";
import { normalizePaymentAmounts, roundAmount } from "./services/currency";
import { getCurrencyTotals } from "./services/currencyTotals";
import {
  calculatePaymentSnapshot,
  parseAmountOrZero,
} from "./services/paymentCalculations";
import { ApiError } from "./errors";

const RMB_TO_EGP_FALLBACK_RATE = 7.15;

const parseAmount = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : parseFloat(value as any);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function deriveShipmentSupplierIds(
  rows: Array<{ supplierId: number | null; productDefaultSupplierId: number | null }>,
): number[] {
  return Array.from(
    new Set(
      rows
        .map((row) => row.supplierId ?? row.productDefaultSupplierId)
        .filter((supplierId): supplierId is number => typeof supplierId === "number"),
    ),
  );
}

const PURCHASE_COST_COMPONENT = "تكلفة البضاعة";
const CUSTOMS_COST_COMPONENTS = new Set(["الجمرك", "التخريج", "الجمرك والتخريج"]);

type AllocationBasis = {
  supplierId: number;
  totalAmount: number;
  remainingAmount: number;
};

type AllocationResult = {
  supplierId: number;
  allocatedAmount: number;
};

const computeProportionalAllocations = (
  paymentAmount: number,
  suppliers: AllocationBasis[],
): AllocationResult[] => {
  const normalizedSuppliers = suppliers.filter(
    (supplier) => supplier.totalAmount > 0 && supplier.remainingAmount > 0,
  );
  const totalRemaining = normalizedSuppliers.reduce(
    (sum, supplier) => sum + supplier.remainingAmount,
    0,
  );
  const cappedPayment = Math.min(paymentAmount, totalRemaining);

  if (cappedPayment <= 0 || normalizedSuppliers.length === 0) {
    return [];
  }

  const remainingBySupplier = new Map<number, number>();
  const totalBySupplier = new Map<number, number>();
  const allocations = new Map<number, number>();

  normalizedSuppliers.forEach((supplier) => {
    remainingBySupplier.set(supplier.supplierId, supplier.remainingAmount);
    totalBySupplier.set(supplier.supplierId, supplier.totalAmount);
    allocations.set(supplier.supplierId, 0);
  });

  let remainingPayment = cappedPayment;
  let eligibleSupplierIds = normalizedSuppliers.map((supplier) => supplier.supplierId);

  while (remainingPayment > 0.0001 && eligibleSupplierIds.length > 0) {
    const basisTotal = eligibleSupplierIds.reduce(
      (sum, supplierId) => sum + (totalBySupplier.get(supplierId) ?? 0),
      0,
    );

    if (basisTotal <= 0) {
      break;
    }

    let allocatedThisRound = 0;

    for (const supplierId of eligibleSupplierIds) {
      const supplierBasis = totalBySupplier.get(supplierId) ?? 0;
      const remainingSupplier = remainingBySupplier.get(supplierId) ?? 0;
      if (remainingSupplier <= 0 || supplierBasis <= 0) continue;

      const proportionalShare = (remainingPayment * supplierBasis) / basisTotal;
      const allocation = Math.min(proportionalShare, remainingSupplier);

      allocations.set(
        supplierId,
        (allocations.get(supplierId) ?? 0) + allocation,
      );
      remainingBySupplier.set(supplierId, remainingSupplier - allocation);
      allocatedThisRound += allocation;
    }

    if (allocatedThisRound <= 0) {
      break;
    }

    remainingPayment -= allocatedThisRound;
    eligibleSupplierIds = eligibleSupplierIds.filter(
      (supplierId) => (remainingBySupplier.get(supplierId) ?? 0) > 0.0001,
    );
  }

  const roundedAllocations = Array.from(allocations.entries())
    .filter(([, amount]) => amount > 0)
    .map(([supplierId, amount]) => ({
      supplierId,
      allocatedAmount: roundAmount(amount, 2),
    }));

  const targetTotal = roundAmount(cappedPayment, 2);
  const roundedTotal = roundAmount(
    roundedAllocations.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0),
    2,
  );
  let delta = roundAmount(targetTotal - roundedTotal, 2);

  if (Math.abs(delta) >= 0.01) {
    const capacityMap = new Map<number, number>();
    normalizedSuppliers.forEach((supplier) => {
      capacityMap.set(supplier.supplierId, roundAmount(supplier.remainingAmount, 2));
    });

    while (Math.abs(delta) >= 0.01) {
      const deltaCents = Math.round(delta * 100);
      if (deltaCents === 0) break;

      if (deltaCents > 0) {
        const candidate = roundedAllocations
          .map((allocation) => {
            const cap = capacityMap.get(allocation.supplierId) ?? 0;
            return { allocation, remaining: cap - allocation.allocatedAmount };
          })
          .filter((entry) => entry.remaining > 0)
          .sort((a, b) => b.remaining - a.remaining)[0];

        if (!candidate) break;
        const adjustment = Math.min(deltaCents, Math.round(candidate.remaining * 100));
        candidate.allocation.allocatedAmount = roundAmount(
          candidate.allocation.allocatedAmount + adjustment / 100,
          2,
        );
        delta = roundAmount(delta - adjustment / 100, 2);
      } else {
        const candidate = roundedAllocations
          .filter((allocation) => allocation.allocatedAmount > 0)
          .sort((a, b) => b.allocatedAmount - a.allocatedAmount)[0];

        if (!candidate) break;
        const adjustment = Math.min(
          Math.abs(deltaCents),
          Math.round(candidate.allocatedAmount * 100),
        );
        candidate.allocatedAmount = roundAmount(
          candidate.allocatedAmount - adjustment / 100,
          2,
        );
        delta = roundAmount(delta + adjustment / 100, 2);
      }
    }

  }

  return roundedAllocations.filter((allocation) => allocation.allocatedAmount > 0);
};

const getShipmentPurchaseCostEgp = (shipment: Shipment, items: ShipmentItem[]): number => {
  const purchaseCostEgp = parseAmount(shipment.purchaseCostEgp);
  if (purchaseCostEgp > 0) return purchaseCostEgp;

  const purchaseCostRmb = parseAmount(shipment.purchaseCostRmb);
  const rate = parseAmount(shipment.purchaseRmbToEgpRate);
  if (purchaseCostRmb > 0 && rate > 0) return purchaseCostRmb * rate;

  if (rate > 0) {
    const itemsRmb = items.reduce(
      (sum, item) => sum + parseAmount(item.totalPurchaseCostRmb),
      0
    );
    if (itemsRmb > 0) return itemsRmb * rate;
  }

  return 0;
};

const getShipmentShippingCompanyCostEgp = (shipment: Shipment): number => {
  return (
    parseAmount(shipment.shippingCostEgp) +
    parseAmount(shipment.commissionCostEgp) +
    parseAmount(shipment.customsCostEgp) +
    parseAmount(shipment.takhreegCostEgp)
  );
};

const getShipmentShippingCompanyCostRmb = (shipment: Shipment): number => {
  return (
    parseAmount(shipment.shippingCostRmb) +
    parseAmount(shipment.commissionCostRmb)
  );
};

const buildShipmentSupplierMaps = (
  shipments: Shipment[],
  itemsByShipment: ShipmentItem[][]
) => {
  const shipmentItemSuppliersMap = new Map<number, Set<number>>();
  const shipmentAnySuppliersMap = new Map<number, Set<number>>();
  const shipmentShippingCompanyMap = new Map<number, number | undefined>();
  const purchaseCostByShipmentSupplierMap = new Map<number, Map<number, number>>();

  shipments.forEach((shipment, index) => {
    const items = itemsByShipment[index] ?? [];
    const supplierTotalsRmb = new Map<number, number>();

    for (const item of items) {
      if (!item.supplierId) continue;
      const current = supplierTotalsRmb.get(item.supplierId) ?? 0;
      supplierTotalsRmb.set(item.supplierId, current + parseAmount(item.totalPurchaseCostRmb));
    }

    const itemSuppliers = new Set<number>(supplierTotalsRmb.keys());
    const shippingCompanyId = shipment.shippingCompanyId ?? undefined;
    const anySuppliers = new Set<number>(itemSuppliers);

    const purchaseCostEgp = getShipmentPurchaseCostEgp(shipment, items);
    const totalRmb = Array.from(supplierTotalsRmb.values()).reduce((sum, val) => sum + val, 0);
    const purchaseCostMap = new Map<number, number>();
    if (purchaseCostEgp > 0 && itemSuppliers.size > 0) {
      if (totalRmb > 0) {
        supplierTotalsRmb.forEach((rmbAmount, supplierId) => {
          purchaseCostMap.set(supplierId, purchaseCostEgp * (rmbAmount / totalRmb));
        });
      } else {
        const share = purchaseCostEgp / itemSuppliers.size;
        itemSuppliers.forEach((supplierId) => {
          purchaseCostMap.set(supplierId, share);
        });
      }
    }

    shipmentItemSuppliersMap.set(shipment.id, itemSuppliers);
    shipmentAnySuppliersMap.set(shipment.id, anySuppliers);
    shipmentShippingCompanyMap.set(shipment.id, shippingCompanyId);
    purchaseCostByShipmentSupplierMap.set(shipment.id, purchaseCostMap);
  });

  return {
    shipmentItemSuppliersMap,
    shipmentAnySuppliersMap,
    shipmentShippingCompanyMap,
    purchaseCostByShipmentSupplierMap,
  };
};

const paymentMatchesSupplier = (
  payment: ShipmentPayment,
  supplierId: number,
  shipmentItemSuppliersMap: Map<number, Set<number>>,
  shipmentShippingCompanyMap: Map<number, number | undefined>
) => {
  if (payment.partyType && payment.partyId !== null && payment.partyId !== undefined) {
    return payment.partyType === "supplier" && payment.partyId === supplierId;
  }

  const itemSuppliers = shipmentItemSuppliersMap.get(payment.shipmentId) ?? new Set<number>();
  return itemSuppliers.has(supplierId);
};

const getSupplierShipmentCost = (
  shipment: Shipment,
  supplierId: number,
  purchaseCostByShipmentSupplierMap: Map<number, Map<number, number>>,
  shipmentShippingCompanyMap: Map<number, number | undefined>
) => {
  const purchaseCost =
    purchaseCostByShipmentSupplierMap.get(shipment.id)?.get(supplierId) ?? 0;
  return roundAmount(purchaseCost);
};

const paymentMatchesShippingCompany = (
  payment: ShipmentPayment,
  shippingCompanyId: number
) => {
  if (payment.partyType && payment.partyId !== null && payment.partyId !== undefined) {
    return payment.partyType === "shipping_company" && payment.partyId === shippingCompanyId;
  }
  return false;
};

const getShippingCompanyShipmentCost = (shipment: Shipment, shippingCompanyId: number) => {
  return shipment.shippingCompanyId === shippingCompanyId
    ? roundAmount(getShipmentShippingCompanyCostEgp(shipment))
    : 0;
};

const getItemCustomsCostEgp = (item: ShipmentItem): number => {
  const totalCustoms = parseAmount(item.totalCustomsCostEgp);
  if (totalCustoms > 0) return totalCustoms;
  const cartons = parseAmount(item.cartonsCtn);
  const perCarton = parseAmount(item.customsCostPerCartonEgp);
  return cartons * perCarton;
};

const getItemTakhreegCostEgp = (item: ShipmentItem): number => {
  const totalTakhreeg = parseAmount(item.totalTakhreegCostEgp);
  if (totalTakhreeg > 0) return totalTakhreeg;
  const cartons = parseAmount(item.cartonsCtn);
  const perCarton = parseAmount(item.takhreegCostPerCartonEgp);
  return cartons * perCarton;
};

const getSupplierShipmentGoodsCostRmb = (items: ShipmentItem[], supplierId: number): number => {
  return roundAmount(
    items.reduce((sum, item) => {
      if (item.supplierId !== supplierId) return sum;
      return sum + parseAmount(item.totalPurchaseCostRmb);
    }, 0),
  );
};

const getSupplierShipmentCustomsCostEgp = (
  items: ShipmentItem[],
  supplierId: number,
): number => {
  return roundAmount(
    items.reduce((sum, item) => {
      if (item.supplierId !== supplierId) return sum;
      return sum + getItemCustomsCostEgp(item) + getItemTakhreegCostEgp(item);
    }, 0),
  );
};

const computeKnownTotal = (shipment: Shipment): number => {
  const purchaseRate = parseAmount(shipment.purchaseRmbToEgpRate);
  const purchaseFromRmb =
    purchaseRate > 0 ? parseAmount(shipment.purchaseCostRmb) * purchaseRate : 0;
  const purchase = parseAmount(shipment.purchaseCostEgp) || purchaseFromRmb;

  const commissionFromRmb =
    purchaseRate > 0 ? parseAmount(shipment.commissionCostRmb) * purchaseRate : 0;
  const commission =
    parseAmount(shipment.commissionCostEgp) || commissionFromRmb;

  const shippingFromRmb =
    purchaseRate > 0 ? parseAmount(shipment.shippingCostRmb) * purchaseRate : 0;
  const shipping = parseAmount(shipment.shippingCostEgp) || shippingFromRmb;
  const customs = parseAmount(shipment.customsCostEgp);
  const takhreeg = parseAmount(shipment.takhreegCostEgp);

  return purchase + commission + shipping + customs + takhreeg;
};

async function recoverKnownTotalFromItems(
  shipmentId: number,
  executor: typeof db | any,
): Promise<{
  recoveredTotal: number;
  purchaseCostRmb: number;
  purchaseCostEgp: number;
  customsCostEgp: number;
  takhreegCostEgp: number;
}> {
  const itemsList = await executor
    .select()
    .from(shipmentItems)
    .where(eq(shipmentItems.shipmentId, shipmentId));

  if (itemsList.length === 0) {
    return {
      recoveredTotal: 0,
      purchaseCostRmb: 0,
      purchaseCostEgp: 0,
      customsCostEgp: 0,
      takhreegCostEgp: 0,
    };
  }

  const totalPurchaseCostRmb = itemsList.reduce(
    (sum: number, item: any) => sum + parseAmount(item.totalPurchaseCostRmb),
    0,
  );

  const totalCustomsCostEgp = itemsList.reduce((sum: number, item: any) => {
    return sum + (item.cartonsCtn || 0) * parseAmount(item.customsCostPerCartonEgp);
  }, 0);

  const totalTakhreegCostEgp = itemsList.reduce((sum: number, item: any) => {
    return sum + (item.cartonsCtn || 0) * parseAmount(item.takhreegCostPerCartonEgp);
  }, 0);

  const rateResult = await executor
    .select()
    .from(exchangeRates)
    .where(
      and(eq(exchangeRates.fromCurrency, "RMB"), eq(exchangeRates.toCurrency, "EGP")),
    )
    .orderBy(desc(exchangeRates.rateDate))
    .limit(1);

  const rmbToEgpRate =
    rateResult.length > 0 ? parseAmount(rateResult[0].rateValue) : RMB_TO_EGP_FALLBACK_RATE;
  const purchaseCostEgp = totalPurchaseCostRmb * rmbToEgpRate;
  const recoveredTotal = purchaseCostEgp + totalCustomsCostEgp + totalTakhreegCostEgp;

  return {
    recoveredTotal,
    purchaseCostRmb: totalPurchaseCostRmb,
    purchaseCostEgp,
    customsCostEgp: totalCustomsCostEgp,
    takhreegCostEgp: totalTakhreegCostEgp,
  };
}
export class MissingRmbRateError extends Error {
  constructor() {
    super("RMB_RATE_MISSING");
  }
}

type KnownTotalContext = {
  shipment: Shipment;
  shippingDetails?: ShipmentShippingDetails | null;
  customsDetails?: ShipmentCustomsDetails | null;
  items?: ShipmentItem[];
  latestRmbToEgpRate?: number | null;
  paymentRmbToEgpRate?: number | null;
  defaultRmbToEgpRate?: number | null;
};

export const computeShipmentKnownTotal = (context: KnownTotalContext): number => {
  const {
    shipment,
    shippingDetails,
    customsDetails,
    items = [],
    latestRmbToEgpRate,
    paymentRmbToEgpRate,
    defaultRmbToEgpRate,
  } = context;

  const rateCandidates = [
    parseAmount(shipment.purchaseRmbToEgpRate),
    parseAmount(latestRmbToEgpRate),
    parseAmount(paymentRmbToEgpRate),
    parseAmount(defaultRmbToEgpRate),
  ];

  let resolvedRate = rateCandidates.find((rate) => rate > 0) ?? null;

  const requireRate = () => {
    if (resolvedRate && resolvedRate > 0) return resolvedRate;
    throw new MissingRmbRateError();
  };

  const pickComponent = (egpCandidates: number[], rmbCandidates: number[]) => {
    const egpValue = egpCandidates.find((value) => value > 0) ?? 0;
    if (egpValue > 0) return egpValue;

    const rmbValue = rmbCandidates.find((value) => value > 0) ?? 0;
    if (rmbValue > 0) {
      return rmbValue * requireRate();
    }

    return 0;
  };

  const itemPurchaseRmb = items.reduce(
    (sum, item) => sum + parseAmount(item.totalPurchaseCostRmb),
    0
  );

  const itemCustomsEgp = items.reduce((sum, item) => {
    const totalCustoms = parseAmount(item.totalCustomsCostEgp);
    if (totalCustoms > 0) return sum + totalCustoms;
    const cartons = parseAmount(item.cartonsCtn);
    const perCarton = parseAmount(item.customsCostPerCartonEgp);
    return sum + cartons * perCarton;
  }, 0);

  const itemTakhreegEgp = items.reduce((sum, item) => {
    const totalTakhreeg = parseAmount(item.totalTakhreegCostEgp);
    if (totalTakhreeg > 0) return sum + totalTakhreeg;
    const cartons = parseAmount(item.cartonsCtn);
    const perCarton = parseAmount(item.takhreegCostPerCartonEgp);
    return sum + cartons * perCarton;
  }, 0);

  const purchaseTotal = pickComponent(
    [parseAmount(shipment.purchaseCostEgp)],
    [
      parseAmount(shipment.purchaseCostRmb),
      parseAmount(shippingDetails?.totalPurchaseCostRmb),
      itemPurchaseRmb,
    ]
  );

  const commissionTotal = pickComponent(
    [parseAmount(shipment.commissionCostEgp), parseAmount(shippingDetails?.commissionValueEgp)],
    [parseAmount(shipment.commissionCostRmb), parseAmount(shippingDetails?.commissionValueRmb)]
  );

  const shippingTotal = pickComponent(
    [parseAmount(shipment.shippingCostEgp), parseAmount(shippingDetails?.totalShippingCostEgp)],
    [parseAmount(shipment.shippingCostRmb), parseAmount(shippingDetails?.totalShippingCostRmb)]
  );

  const customsTotal = pickComponent(
    [parseAmount(shipment.customsCostEgp), parseAmount(customsDetails?.totalCustomsCostEgp), itemCustomsEgp],
    []
  );

  const takhreegTotal = pickComponent(
    [parseAmount(shipment.takhreegCostEgp), parseAmount(customsDetails?.totalTakhreegCostEgp), itemTakhreegEgp],
    []
  );

  const total = purchaseTotal + commissionTotal + shippingTotal + customsTotal + takhreegTotal;
  return roundAmount(total);
};

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, data: Partial<UpsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(id: string, role: string): Promise<User | undefined>;

  // Suppliers
  getAllSuppliers(): Promise<Supplier[]>;
  getSupplier(id: number): Promise<Supplier | undefined>;
  getSuppliersByIds(ids: number[]): Promise<Supplier[]>;
  createSupplier(data: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: number, data: Partial<InsertSupplier>): Promise<Supplier | undefined>;
  deleteSupplier(id: number): Promise<boolean>;

  // Shipping Companies
  getAllShippingCompanies(): Promise<ShippingCompany[]>;
  getShippingCompany(id: number): Promise<ShippingCompany | undefined>;
  getShippingCompanyByName(name: string): Promise<ShippingCompany | undefined>;
  createShippingCompany(data: InsertShippingCompany): Promise<ShippingCompany>;
  updateShippingCompany(
    id: number,
    data: Partial<InsertShippingCompany>
  ): Promise<ShippingCompany | undefined>;
  deleteShippingCompany(id: number): Promise<boolean>;

  // Product Types
  getAllProductTypes(): Promise<ProductType[]>;
  getProductType(id: number): Promise<ProductType | undefined>;
  createProductType(data: InsertProductType): Promise<ProductType>;
  updateProductType(id: number, data: Partial<InsertProductType>): Promise<ProductType | undefined>;
  deleteProductType(id: number): Promise<boolean>;

  // Products
  getAllProducts(): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(data: InsertProduct): Promise<Product>;
  updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined>;

  // Shipments
  getAllShipments(): Promise<Shipment[]>;
  getShipment(id: number): Promise<Shipment | undefined>;
  getShipmentsByIds(ids: number[]): Promise<Shipment[]>;
  createShipment(data: InsertShipment): Promise<Shipment>;
  updateShipment(id: number, data: Partial<InsertShipment>): Promise<Shipment | undefined>;
  deleteShipment(id: number): Promise<boolean>;

  // Shipment Items
  getShipmentItems(shipmentId: number): Promise<ShipmentItem[]>;
  getShipmentSuppliers(shipmentId: number): Promise<number[]>;
  getShipmentSupplierContext(shipmentId: number): Promise<{
    itemSuppliers: number[];
    shippingCompanyId: number | null;
    shipmentSuppliers: number[];
  }>;
  createShipmentItem(data: InsertShipmentItem): Promise<ShipmentItem>;
  updateShipmentItem(id: number, data: Partial<InsertShipmentItem>): Promise<ShipmentItem | undefined>;
  deleteShipmentItem(id: number): Promise<boolean>;
  deleteShipmentItems(shipmentId: number): Promise<boolean>;

  // Shipping Details
  getShippingDetails(shipmentId: number): Promise<ShipmentShippingDetails | undefined>;
  upsertShippingDetails(data: InsertShipmentShippingDetails): Promise<ShipmentShippingDetails>;

  // Customs Details
  getCustomsDetails(shipmentId: number): Promise<ShipmentCustomsDetails | undefined>;
  upsertCustomsDetails(data: InsertShipmentCustomsDetails): Promise<ShipmentCustomsDetails>;

  // Exchange Rates
  getAllExchangeRates(): Promise<ExchangeRate[]>;
  getLatestRate(from: string, to: string): Promise<ExchangeRate | undefined>;
  createExchangeRate(data: InsertExchangeRate): Promise<ExchangeRate>;

  // Payments
  getAllPayments(): Promise<ShipmentPayment[]>;
  getPaymentById(paymentId: number): Promise<ShipmentPayment | undefined>;
  getShipmentPayments(shipmentId: number): Promise<ShipmentPayment[]>;
  getAllPaymentAllocations(): Promise<PaymentAllocation[]>;
  getPaymentAllocationsByPaymentId(paymentId: number): Promise<PaymentAllocation[]>;
  getPaymentAllocationsByPaymentIds(paymentIds: number[]): Promise<PaymentAllocation[]>;
  getPaymentAllocationsByShipmentId(shipmentId: number): Promise<PaymentAllocation[]>;
  getPaymentAllocationsByShipmentIds(shipmentIds: number[]): Promise<PaymentAllocation[]>;
  getPaymentAllocationsBySupplierId(supplierId: number): Promise<PaymentAllocation[]>;
  getPaymentAllocationsBySupplierIds(supplierIds: number[]): Promise<PaymentAllocation[]>;
  getPaymentAllocationPreview(
    shipmentId: number,
    paymentAmountRmb: number,
  ): Promise<{
    shipmentId: number;
    amountRmb: number;
    totalOutstandingRmb: number;
    suppliers: Array<{
      supplierId: number;
      goodsTotalRmb: number;
      outstandingRmb: number;
      allocatedRmb: number;
    }>;
  }>;
  createPayment(
    data: InsertShipmentPayment,
    options?: { simulatePostInsertError?: boolean; autoAllocate?: boolean }
  ): Promise<ShipmentPayment>;
  getPaymentAllowance(
    shipmentId: number,
    options?: { shipment?: Shipment },
  ): Promise<{
    knownTotal: number;
    alreadyPaid: number;
    remainingAllowed: number;
    recoveredFromItems: boolean;
  }>;
  deletePayment(paymentId: number): Promise<{ deleted: boolean; allocationsDeleted: number }>;

  // Inventory
  getAllInventoryMovements(): Promise<InventoryMovement[]>;
  createInventoryMovement(data: InsertInventoryMovement): Promise<InventoryMovement>;

  // Audit
  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;

  // Dashboard Stats
  getDashboardStats(): Promise<{
    totalShipments: number;
    totalCostEgp: string;
    totalPaidEgp: string;
    totalBalanceEgp: string;
    recentShipments: Shipment[];
    pendingShipments: number;
    completedShipments: number;
  }>;

  // Payment Stats
  getPaymentStats(): Promise<{
    totalCostEgp: string;
    totalPaidEgp: string;
    totalBalanceEgp: string;
    lastPayment: ShipmentPayment | null;
  }>;

  // Inventory Stats
  getInventoryStats(): Promise<{
    totalPieces: number;
    totalCostEgp: string;
    totalItems: number;
    avgUnitCostEgp: string;
  }>;

  // Accounting Methods
  getAccountingDashboard(filters?: {
    dateFrom?: string;
    dateTo?: string;
    partyType?: "supplier" | "shipping_company";
    partyId?: number;
    shipmentCode?: string;
    shipmentStatus?: string;
    paymentStatus?: string;
    includeArchived?: boolean;
  }): Promise<{
    totalPurchaseRmb: string;
    totalPurchaseEgp: string;
    totalShippingRmb: string;
    totalShippingEgp: string;
    totalCommissionRmb: string;
    totalCommissionEgp: string;
    totalCustomsEgp: string;
    totalTakhreegEgp: string;
    totalCostEgp: string;
    totalPaidEgp: string;
    totalBalanceEgp: string;
    unsettledShipmentsCount: number;
  }>;

  getSupplierBalances(filters?: {
    dateFrom?: string;
    dateTo?: string;
    supplierId?: number;
    balanceType?: 'owing' | 'credit' | 'all';
  }): Promise<Array<{
    supplierId: number;
    supplierName: string;
    totalCostEgp: string;
    totalPaidEgp: string;
    balanceEgp: string;
    balanceStatus: 'owing' | 'settled' | 'credit';
  }>>;

  getSupplierStatement(supplierId: number, filters?: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{
    supplier: Supplier;
    movements: Array<{
      date: Date | string;
      type: 'shipment' | 'payment';
      description: string;
      shipmentCode?: string;
      costEgp?: string;
      paidEgp?: string;
      runningBalance: string;
    }>;
  }>;

  getShippingCompanyBalances(filters?: {
    dateFrom?: string;
    dateTo?: string;
    shippingCompanyId?: number;
    balanceType?: 'owing' | 'credit' | 'all';
  }): Promise<Array<{
    shippingCompanyId: number;
    shippingCompanyName: string;
    totalCostEgp: string;
    totalPaidEgp: string;
    totalPaidRmb: string;
    balanceEgp: string;
    balanceRmb: string;
    balanceStatus: 'owing' | 'settled' | 'credit';
  }>>;

  getShippingCompanyStatement(shippingCompanyId: number, filters?: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{
    shippingCompany: ShippingCompany;
    movements: Array<{
      date: Date | string;
      type: 'shipment' | 'payment';
      description: string;
      shipmentCode?: string;
      costEgp?: string;
      costRmb?: string;
      paidEgp?: string;
      paidRmb?: string;
      runningBalanceRmb?: string;
      originalCurrency?: string;
      runningBalance: string;
      paymentId?: number;
      attachmentUrl?: string | null;
      attachmentOriginalName?: string | null;
    }>;
    totalPaidEgp: string;
    totalPaidRmb: string;
  }>;

  getMovementReport(filters?: {
    dateFrom?: string;
    dateTo?: string;
    shipmentId?: number;
    partyType?: "supplier" | "shipping_company";
    partyId?: number;
    movementType?: string;
    costComponent?: string;
    paymentMethod?: string;
    shipmentStatus?: string;
    paymentStatus?: string;
    includeArchived?: boolean;
  }): Promise<{
    movements: Array<{
      date: Date | string;
      shipmentCode: string;
      shipmentName: string;
      partyName?: string;
      partyId?: number;
      partyType?: "supplier" | "shipping_company";
      movementType: string;
      costComponent?: string;
      paymentMethod?: string;
      originalCurrency?: string;
      amountOriginal?: string;
      amountEgp: string;
      direction: 'cost' | 'payment';
      userName?: string;
    }>;
    totalCostEgp: string;
    totalPaidEgp: string;
    netMovement: string;
  }>;

  getPaymentMethodsReport(filters?: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<Array<{
    paymentMethod: string;
    paymentCount: number;
    totalAmountEgp: string;
  }>>;

  // ============================================================
  // LOCAL TRADE MODULE METHODS
  // ============================================================

  // Parties
  getAllParties(filters?: { type?: string; isActive?: boolean }): Promise<Party[]>;
  getParty(id: number): Promise<Party | undefined>;
  createParty(data: InsertParty): Promise<Party>;
  updateParty(id: number, data: Partial<InsertParty>): Promise<Party | undefined>;
  getPartyBalance(partyId: number, seasonId?: number): Promise<{ balanceEgp: string; direction: 'debit' | 'credit' | 'zero' }>;
  getPartyProfile(partyId: number): Promise<{
    party: Party;
    currentSeason: PartySeason | null;
    balance: { balanceEgp: string; direction: 'debit' | 'credit' | 'zero' };
    totalInvoices: number;
    totalPayments: number;
    openReturnCases: number;
  } | undefined>;

  // Party Seasons
  getPartySeasons(partyId: number): Promise<PartySeason[]>;
  getCurrentSeason(partyId: number): Promise<PartySeason | undefined>;
  createSeason(data: InsertPartySeason): Promise<PartySeason>;
  closeSeason(seasonId: number): Promise<PartySeason | undefined>;

  // Local Invoices
  getAllLocalInvoices(filters?: { partyId?: number; invoiceKind?: string; status?: string }): Promise<LocalInvoice[]>;
  getLocalInvoice(id: number): Promise<{ invoice: LocalInvoice; lines: LocalInvoiceLine[] } | undefined>;
  createLocalInvoice(data: InsertLocalInvoice, lines: InsertLocalInvoiceLine[]): Promise<LocalInvoice>;
  updateLocalInvoice(id: number, data: Partial<InsertLocalInvoice>): Promise<LocalInvoice | undefined>;
  generateInvoiceReferenceNumber(kind: string): Promise<string>;

  // Local Invoice Lines
  getInvoiceLines(invoiceId: number): Promise<LocalInvoiceLine[]>;
  createInvoiceLine(data: InsertLocalInvoiceLine): Promise<LocalInvoiceLine>;
  updateInvoiceLine(id: number, data: Partial<InsertLocalInvoiceLine>): Promise<LocalInvoiceLine | undefined>;
  deleteInvoiceLine(id: number): Promise<boolean>;

  // Local Receipts
  createReceipt(data: InsertLocalReceipt): Promise<LocalReceipt>;
  receiveInvoice(invoiceId: number, userId: string): Promise<{ receipt: LocalReceipt; movementsCreated: number }>;

  // Party Ledger Entries
  getPartyLedger(partyId: number, seasonId?: number): Promise<PartyLedgerEntry[]>;
  createLedgerEntry(data: InsertPartyLedgerEntry): Promise<PartyLedgerEntry>;
  recalculatePartyBalance(partyId: number, seasonId?: number): Promise<{ balanceEgp: string; direction: 'debit' | 'credit' | 'zero' }>;

  // Local Payments
  getLocalPayments(filters?: { partyId?: number }): Promise<LocalPayment[]>;
  createLocalPayment(data: InsertLocalPayment): Promise<LocalPayment>;

  // Return Cases
  getReturnCases(filters?: { partyId?: number; status?: string }): Promise<ReturnCase[]>;
  getReturnCase(id: number): Promise<ReturnCase | undefined>;
  createReturnCase(data: InsertReturnCase): Promise<ReturnCase>;
  resolveReturnCase(id: number, data: { resolution: string; amountEgp: number; pieces: number; cartons: number; resolutionNote: string | null }, userId: string): Promise<ReturnCase | undefined>;
  
  // Party Collections
  getPartyCollections(partyId: number): Promise<any[]>;
  upsertPartyCollections(partyId: number, collections: Array<{
    collectionOrder: number;
    collectionDate: string;
    amountEgp?: string;
    notes?: string;
  }>): Promise<any[]>;
  updateCollectionStatus(id: number, status: string, linkedPaymentId?: number): Promise<any>;
  markCollectionReminderSent(id: number): Promise<any>;
  deletePartyCollection(id: number): Promise<void>;
  getPartyTimeline(partyId: number): Promise<any[]>;
  
  // Notifications
  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(data: InsertNotification): Promise<Notification>;
  markNotificationRead(id: number): Promise<Notification | undefined>;
  checkAndCreateCollectionReminders(userId: string): Promise<void>;

  getPartyProfileSummary(partyId: number, seasonId?: number): Promise<{
    party: Party;
    seasonId: number | undefined;
    kpis: {
      totalInvoicesEgp: string;
      invoicesCount: number;
      totalPaidEgp: string;
      paymentsCount: number;
      remainingBalanceEgp: string;
      creditBalanceEgp: string;
      underInspectionEgp: string;
      pendingReturnsCount: number;
      upcomingCollectionsCount: number;
    };
    lastActivity: {
      lastInvoiceDate: string | null;
      lastPaymentDate: string | null;
      lastCollectionDate: string | null;
    };
  }>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(userData: UpsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<UpsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUserRole(id: string, role: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Suppliers
  async getAllSuppliers(): Promise<Supplier[]> {
    return db.select().from(suppliers).orderBy(desc(suppliers.createdAt));
  }

  async getSupplier(id: number): Promise<Supplier | undefined> {
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    return supplier;
  }

  async getSuppliersByIds(ids: number[]): Promise<Supplier[]> {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(suppliers)
      .where(inArray(suppliers.id, ids))
      .orderBy(asc(suppliers.name));
  }

  async createSupplier(data: InsertSupplier): Promise<Supplier> {
    const [supplier] = await db.insert(suppliers).values(data).returning();
    return supplier;
  }

  async updateSupplier(id: number, data: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    const [supplier] = await db
      .update(suppliers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(suppliers.id, id))
      .returning();
    return supplier;
  }

  async deleteSupplier(id: number): Promise<boolean> {
    const result = await db.delete(suppliers).where(eq(suppliers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Shipping Companies
  async getAllShippingCompanies(): Promise<ShippingCompany[]> {
    return db.select().from(shippingCompanies).orderBy(desc(shippingCompanies.createdAt));
  }

  async getShippingCompany(id: number): Promise<ShippingCompany | undefined> {
    const [company] = await db
      .select()
      .from(shippingCompanies)
      .where(eq(shippingCompanies.id, id));
    return company;
  }

  async getShippingCompanyByName(name: string): Promise<ShippingCompany | undefined> {
    const [company] = await db
      .select()
      .from(shippingCompanies)
      .where(sql`lower(${shippingCompanies.name}) = lower(${name})`);
    return company;
  }

  async createShippingCompany(data: InsertShippingCompany): Promise<ShippingCompany> {
    const [company] = await db.insert(shippingCompanies).values(data).returning();
    return company;
  }

  async updateShippingCompany(
    id: number,
    data: Partial<InsertShippingCompany>
  ): Promise<ShippingCompany | undefined> {
    const [company] = await db
      .update(shippingCompanies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(shippingCompanies.id, id))
      .returning();
    return company;
  }

  async deleteShippingCompany(id: number): Promise<boolean> {
    const result = await db.delete(shippingCompanies).where(eq(shippingCompanies.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Product Types
  async getAllProductTypes(): Promise<ProductType[]> {
    return db.select().from(productTypes).orderBy(desc(productTypes.createdAt));
  }

  async getProductType(id: number): Promise<ProductType | undefined> {
    const [type] = await db.select().from(productTypes).where(eq(productTypes.id, id));
    return type;
  }

  async createProductType(data: InsertProductType): Promise<ProductType> {
    const [type] = await db.insert(productTypes).values(data).returning();
    return type;
  }

  async updateProductType(id: number, data: Partial<InsertProductType>): Promise<ProductType | undefined> {
    const [type] = await db
      .update(productTypes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(productTypes.id, id))
      .returning();
    return type;
  }

  async deleteProductType(id: number): Promise<boolean> {
    const result = await db.delete(productTypes).where(eq(productTypes.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Products
  async getAllProducts(): Promise<Product[]> {
    return db.select().from(products).orderBy(desc(products.createdAt));
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(data: InsertProduct): Promise<Product> {
    const [product] = await db.insert(products).values(data).returning();
    return product;
  }

  async updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined> {
    const [product] = await db
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return product;
  }

  // Shipments
  async getAllShipments(): Promise<Shipment[]> {
    return db.select().from(shipments).orderBy(desc(shipments.createdAt));
  }

  async getShipment(id: number): Promise<Shipment | undefined> {
    const [shipment] = await db.select().from(shipments).where(eq(shipments.id, id));
    return shipment;
  }

  async getShipmentsByIds(ids: number[]): Promise<Shipment[]> {
    if (ids.length === 0) return [];
    return db.select().from(shipments).where(inArray(shipments.id, ids));
  }

  async createShipment(data: InsertShipment): Promise<Shipment> {
    const [shipment] = await db.insert(shipments).values(data).returning();
    return shipment;
  }

  async updateShipment(id: number, data: Partial<InsertShipment>): Promise<Shipment | undefined> {
    const [shipment] = await db
      .update(shipments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(shipments.id, id))
      .returning();
    return shipment;
  }

  async deleteShipment(id: number): Promise<boolean> {
    const result = await db.delete(shipments).where(eq(shipments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Shipment Items
  async getShipmentItems(shipmentId: number): Promise<ShipmentItem[]> {
    return db.select().from(shipmentItems).where(eq(shipmentItems.shipmentId, shipmentId)).orderBy(asc(shipmentItems.lineNo));
  }

  async getShipmentSupplierContext(shipmentId: number): Promise<{
    itemSuppliers: number[];
    shippingCompanyId: number | null;
    shipmentSuppliers: number[];
  }> {
    const [shipment] = await db
      .select({ shippingCompanyId: shipments.shippingCompanyId })
      .from(shipments)
      .where(eq(shipments.id, shipmentId));

    const rows = await db
      .select({
        supplierId: shipmentItems.supplierId,
        productDefaultSupplierId: products.defaultSupplierId,
      })
      .from(shipmentItems)
      .leftJoin(products, eq(shipmentItems.productId, products.id))
      .where(eq(shipmentItems.shipmentId, shipmentId));

    const itemSuppliers = deriveShipmentSupplierIds(rows);

    const shippingCompanyId = shipment?.shippingCompanyId ?? null;
    const shipmentSuppliers = new Set(itemSuppliers);

    return {
      itemSuppliers,
      shippingCompanyId,
      shipmentSuppliers: Array.from(shipmentSuppliers),
    };
  }

  async getShipmentSuppliers(shipmentId: number): Promise<number[]> {
    const { shipmentSuppliers } = await this.getShipmentSupplierContext(shipmentId);
    return shipmentSuppliers;
  }

  async createShipmentItem(data: InsertShipmentItem): Promise<ShipmentItem> {
    const [item] = await db.insert(shipmentItems).values(data).returning();
    return item;
  }

  async updateShipmentItem(id: number, data: Partial<InsertShipmentItem>): Promise<ShipmentItem | undefined> {
    const [item] = await db
      .update(shipmentItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(shipmentItems.id, id))
      .returning();
    return item;
  }

  async deleteShipmentItem(id: number): Promise<boolean> {
    const result = await db.delete(shipmentItems).where(eq(shipmentItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteShipmentItems(shipmentId: number): Promise<boolean> {
    await db.delete(shipmentItems).where(eq(shipmentItems.shipmentId, shipmentId));
    return true;
  }

  // Shipping Details
  async getShippingDetails(shipmentId: number): Promise<ShipmentShippingDetails | undefined> {
    const [details] = await db
      .select()
      .from(shipmentShippingDetails)
      .where(eq(shipmentShippingDetails.shipmentId, shipmentId));
    return details;
  }

  async upsertShippingDetails(data: InsertShipmentShippingDetails): Promise<ShipmentShippingDetails> {
    // Ensure date fields are properly handled (can be null, string, or Date)
    const cleanedData = {
      ...data,
      shippingDate: data.shippingDate || null,
    };
    const [details] = await db
      .insert(shipmentShippingDetails)
      .values(cleanedData)
      .onConflictDoUpdate({
        target: shipmentShippingDetails.shipmentId,
        set: { ...cleanedData, updatedAt: new Date() },
      })
      .returning();
    return details;
  }

  // Customs Details
  async getCustomsDetails(shipmentId: number): Promise<ShipmentCustomsDetails | undefined> {
    const [details] = await db
      .select()
      .from(shipmentCustomsDetails)
      .where(eq(shipmentCustomsDetails.shipmentId, shipmentId));
    return details;
  }

  async upsertCustomsDetails(data: InsertShipmentCustomsDetails): Promise<ShipmentCustomsDetails> {
    // Ensure date fields are properly handled (can be null, string, or Date)
    const cleanedData = {
      ...data,
      customsInvoiceDate: data.customsInvoiceDate || null,
    };
    const [details] = await db
      .insert(shipmentCustomsDetails)
      .values(cleanedData)
      .onConflictDoUpdate({
        target: shipmentCustomsDetails.shipmentId,
        set: { ...cleanedData, updatedAt: new Date() },
      })
      .returning();
    return details;
  }

  // Exchange Rates
  async getAllExchangeRates(): Promise<ExchangeRate[]> {
    return db.select().from(exchangeRates).orderBy(desc(exchangeRates.rateDate));
  }

  async getLatestRate(from: string, to: string): Promise<ExchangeRate | undefined> {
    const [rate] = await db
      .select()
      .from(exchangeRates)
      .where(
        and(eq(exchangeRates.fromCurrency, from), eq(exchangeRates.toCurrency, to))
      )
      .orderBy(desc(exchangeRates.rateDate))
      .limit(1);
    return rate;
  }

  async createExchangeRate(data: InsertExchangeRate): Promise<ExchangeRate> {
    const [rate] = await db.insert(exchangeRates).values(data).returning();
    return rate;
  }

  // Payments
  async getAllPayments(): Promise<ShipmentPayment[]> {
    return db.select().from(shipmentPayments).orderBy(desc(shipmentPayments.paymentDate));
  }

  async getPaymentById(paymentId: number): Promise<ShipmentPayment | undefined> {
    const [payment] = await db
      .select()
      .from(shipmentPayments)
      .where(eq(shipmentPayments.id, paymentId));
    return payment;
  }

  async getShipmentPayments(shipmentId: number): Promise<ShipmentPayment[]> {
    return db
      .select()
      .from(shipmentPayments)
      .where(eq(shipmentPayments.shipmentId, shipmentId))
      .orderBy(desc(shipmentPayments.paymentDate));
  }

  async getAllPaymentAllocations(): Promise<PaymentAllocation[]> {
    return db.select().from(paymentAllocations).orderBy(desc(paymentAllocations.createdAt));
  }

  async getPaymentAllocationsByPaymentId(paymentId: number): Promise<PaymentAllocation[]> {
    return db
      .select()
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, paymentId))
      .orderBy(desc(paymentAllocations.createdAt));
  }

  async getPaymentAllocationsByPaymentIds(
    paymentIds: number[],
  ): Promise<PaymentAllocation[]> {
    if (paymentIds.length === 0) return [];
    return db
      .select()
      .from(paymentAllocations)
      .where(inArray(paymentAllocations.paymentId, paymentIds))
      .orderBy(desc(paymentAllocations.createdAt));
  }

  async getPaymentAllocationsByShipmentId(shipmentId: number): Promise<PaymentAllocation[]> {
    return db
      .select()
      .from(paymentAllocations)
      .where(eq(paymentAllocations.shipmentId, shipmentId))
      .orderBy(desc(paymentAllocations.createdAt));
  }

  async getPaymentAllocationsByShipmentIds(
    shipmentIds: number[],
  ): Promise<PaymentAllocation[]> {
    if (shipmentIds.length === 0) return [];
    return db
      .select()
      .from(paymentAllocations)
      .where(inArray(paymentAllocations.shipmentId, shipmentIds))
      .orderBy(desc(paymentAllocations.createdAt));
  }

  async getPaymentAllocationsBySupplierId(supplierId: number): Promise<PaymentAllocation[]> {
    return db
      .select()
      .from(paymentAllocations)
      .where(eq(paymentAllocations.supplierId, supplierId))
      .orderBy(desc(paymentAllocations.createdAt));
  }

  async getPaymentAllocationsBySupplierIds(
    supplierIds: number[],
  ): Promise<PaymentAllocation[]> {
    if (supplierIds.length === 0) return [];
    return db
      .select()
      .from(paymentAllocations)
      .where(inArray(paymentAllocations.supplierId, supplierIds))
      .orderBy(desc(paymentAllocations.createdAt));
  }

  async getPaymentAllocationPreview(
    shipmentId: number,
    paymentAmountRmb: number,
  ): Promise<{
    shipmentId: number;
    amountRmb: number;
    totalOutstandingRmb: number;
    suppliers: Array<{
      supplierId: number;
      goodsTotalRmb: number;
      outstandingRmb: number;
      allocatedRmb: number;
    }>;
  }> {
    const items = await db
      .select({
        supplierId: shipmentItems.supplierId,
        totalPurchaseCostRmb: shipmentItems.totalPurchaseCostRmb,
      })
      .from(shipmentItems)
      .where(eq(shipmentItems.shipmentId, shipmentId));

    const supplierTotals = new Map<number, number>();
    for (const item of items) {
      if (!item.supplierId) continue;
      const current = supplierTotals.get(item.supplierId) ?? 0;
      supplierTotals.set(
        item.supplierId,
        current + parseAmountOrZero(item.totalPurchaseCostRmb),
      );
    }

    const existingAllocations = await db
      .select({
        supplierId: paymentAllocations.supplierId,
        totalAllocated: sql<string>`COALESCE(SUM(${paymentAllocations.allocatedAmount}), 0)`,
      })
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.shipmentId, shipmentId),
          eq(paymentAllocations.component, PURCHASE_COST_COMPONENT),
          eq(paymentAllocations.currency, "RMB"),
        ),
      )
      .groupBy(paymentAllocations.supplierId);

    const allocatedMap = new Map<number, number>();
    existingAllocations.forEach((allocation) => {
      allocatedMap.set(
        allocation.supplierId,
        parseAmountOrZero(allocation.totalAllocated),
      );
    });

    const supplierRows = Array.from(supplierTotals.entries()).map(
      ([supplierId, goodsTotal]) => {
        const allocated = allocatedMap.get(supplierId) ?? 0;
        const outstanding = Math.max(0, goodsTotal - allocated);
        return {
          supplierId,
          goodsTotalRmb: roundAmount(goodsTotal, 2),
          outstandingRmb: roundAmount(outstanding, 2),
        };
      },
    );

    const totalOutstanding = roundAmount(
      supplierRows.reduce((sum, row) => sum + row.outstandingRmb, 0),
      2,
    );

    const effectiveAmount = Math.min(Math.max(0, paymentAmountRmb), totalOutstanding);

    const allocationInputs: AllocationBasis[] = supplierRows.map((row) => ({
      supplierId: row.supplierId,
      totalAmount: row.goodsTotalRmb,
      remainingAmount: row.outstandingRmb,
    }));

    const allocations = computeProportionalAllocations(effectiveAmount, allocationInputs);

    const allocationMap = new Map<number, number>();
    allocations.forEach((allocation) => {
      allocationMap.set(allocation.supplierId, allocation.allocatedAmount);
    });

    return {
      shipmentId,
      amountRmb: roundAmount(effectiveAmount, 2),
      totalOutstandingRmb: totalOutstanding,
      suppliers: supplierRows.map((row) => ({
        supplierId: row.supplierId,
        goodsTotalRmb: row.goodsTotalRmb,
        outstandingRmb: row.outstandingRmb,
        allocatedRmb: roundAmount(allocationMap.get(row.supplierId) ?? 0, 2),
      })),
    };
  }

  async createPayment(
    data: InsertShipmentPayment,
    options?: { simulatePostInsertError?: boolean; autoAllocate?: boolean }
  ): Promise<ShipmentPayment> {
    return db.transaction(async (tx) => {
      const lockedShipment = await tx.execute(sql<Shipment>`SELECT * FROM shipments WHERE id = ${data.shipmentId} FOR UPDATE`);
      const rawRow = lockedShipment.rows?.[0] as Record<string, unknown> | undefined;

      if (!rawRow) {
        throw new ApiError("SHIPMENT_NOT_FOUND", undefined, 404, { shipmentId: data.shipmentId });
      }

      // Convert snake_case raw SQL result to camelCase Shipment type
      const shipment: Shipment = {
        id: rawRow.id as number,
        shipmentCode: rawRow.shipment_code as string,
        shipmentName: rawRow.shipment_name as string,
        purchaseDate: rawRow.purchase_date as string,
        status: rawRow.status as string,
        invoiceCustomsDate: rawRow.invoice_customs_date as string | null,
        shippingCompanyId: rawRow.shipping_company_id as number | null,
        createdByUserId: rawRow.created_by_user_id as string | null,
        purchaseCostRmb: rawRow.purchase_cost_rmb as string | null,
        purchaseCostEgp: rawRow.purchase_cost_egp as string | null,
        purchaseRmbToEgpRate: rawRow.purchase_rmb_to_egp_rate as string | null,
        commissionCostRmb: rawRow.commission_cost_rmb as string | null,
        commissionCostEgp: rawRow.commission_cost_egp as string | null,
        shippingCostRmb: rawRow.shipping_cost_rmb as string | null,
        shippingCostEgp: rawRow.shipping_cost_egp as string | null,
        customsCostEgp: rawRow.customs_cost_egp as string | null,
        takhreegCostEgp: rawRow.takhreeg_cost_egp as string | null,
        finalTotalCostEgp: rawRow.final_total_cost_egp as string | null,
        totalPaidEgp: rawRow.total_paid_egp as string | null,
        balanceEgp: rawRow.balance_egp as string | null,
        partialDiscountRmb: rawRow.partial_discount_rmb as string | null,
        discountNotes: rawRow.discount_notes as string | null,
        lastPaymentDate: rawRow.last_payment_date as Date | null,
        createdAt: rawRow.created_at as Date | null,
        updatedAt: rawRow.updated_at as Date | null,
      };

      if (shipment.status === "مؤرشفة") {
        throw new ApiError("SHIPMENT_LOCKED", undefined, 409, { shipmentId: data.shipmentId, status: shipment.status });
      }

      const parseAmount = (value: unknown): number => {
        if (value === null || value === undefined) return 0;
        const parsed = typeof value === "number" ? value : parseFloat(value as any);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      // Compute the "known total" - sum of cost components that are available/entered
      // Uses RMB values (with stored rate) when EGP amounts are missing to avoid losing information
      const computeKnownTotals = (s: Shipment) => {
        const purchaseRate = parseAmount(s.purchaseRmbToEgpRate);

        const purchaseFromRmb = purchaseRate > 0 ? parseAmount(s.purchaseCostRmb) * purchaseRate : 0;
        const purchase = parseAmount(s.purchaseCostEgp) || purchaseFromRmb;

        const commissionFromRmb = purchaseRate > 0 ? parseAmount(s.commissionCostRmb) * purchaseRate : 0;
        const commission = parseAmount(s.commissionCostEgp) || commissionFromRmb;

        const shippingFromRmb = purchaseRate > 0 ? parseAmount(s.shippingCostRmb) * purchaseRate : 0;
        const shipping = parseAmount(s.shippingCostEgp) || shippingFromRmb;

        const customs = parseAmount(s.customsCostEgp);
        const takhreeg = parseAmount(s.takhreegCostEgp);

        const componentTotal = purchase + commission + shipping + customs + takhreeg;
        const existingFinal = parseAmount(s.finalTotalCostEgp);
        const bestKnownTotal = Math.max(componentTotal, existingFinal);

        return {
          bestKnownTotal,
          componentTotal,
          normalizedComponents: {
            purchaseCostEgp: purchase,
            commissionCostEgp: commission,
            shippingCostEgp: shipping,
            customsCostEgp: customs,
            takhreegCostEgp: takhreeg,
          },
        };
      };

      const amountOriginal = parseAmountOrZero(data.amountOriginal as any);
      let exchangeRate = data.exchangeRateToEgp
        ? parseAmountOrZero(data.exchangeRateToEgp as any)
        : null;

      if (data.paymentCurrency === "RMB" && !exchangeRate) {
        const [latestRate] = await tx
          .select()
          .from(exchangeRates)
          .where(
            and(
              eq(exchangeRates.fromCurrency, "RMB"),
              eq(exchangeRates.toCurrency, "EGP"),
            ),
          )
          .orderBy(desc(exchangeRates.rateDate))
          .limit(1);

        if (latestRate?.rateValue) {
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
      const { bestKnownTotal, normalizedComponents: computedComponents } = computeKnownTotals(shipment);
      let normalizedComponents = { ...computedComponents };
      let knownTotal = bestKnownTotal;

      const canonicalUpdates: Partial<typeof shipments.$inferInsert> = {};

      // Backfill EGP fields when only RMB values are present so future totals stay consistent
      if (normalizedComponents.purchaseCostEgp > 0 && parseAmount(shipment.purchaseCostEgp) === 0) {
        canonicalUpdates.purchaseCostEgp = roundAmount(normalizedComponents.purchaseCostEgp, 2).toFixed(2);
      }

      if (normalizedComponents.commissionCostEgp > 0 && parseAmount(shipment.commissionCostEgp) === 0) {
        canonicalUpdates.commissionCostEgp = roundAmount(normalizedComponents.commissionCostEgp, 2).toFixed(2);
      }

      if (normalizedComponents.shippingCostEgp > 0 && parseAmount(shipment.shippingCostEgp) === 0) {
        canonicalUpdates.shippingCostEgp = roundAmount(normalizedComponents.shippingCostEgp, 2).toFixed(2);
      }

      const existingPayments = await tx
        .select()
        .from(shipmentPayments)
        .where(eq(shipmentPayments.shipmentId, data.shipmentId));

      const paymentSnapshot = await calculatePaymentSnapshot({
        shipment,
        payments: existingPayments,
        loadRecoveryData: async () => {
          const itemsList = await tx
            .select()
            .from(shipmentItems)
            .where(eq(shipmentItems.shipmentId, data.shipmentId));

          const rateResult = await tx
            .select()
            .from(exchangeRates)
            .where(
              and(
                eq(exchangeRates.fromCurrency, "RMB"),
                eq(exchangeRates.toCurrency, "EGP"),
              ),
            )
            .orderBy(desc(exchangeRates.rateDate))
            .limit(1);

          return {
            items: itemsList,
            rmbToEgpRate:
              rateResult.length > 0
                ? parseAmountOrZero(rateResult[0].rateValue)
                : 7.15,
          };
        },
      });

      if (paymentSnapshot.recoveredTotals) {
        try {
          await tx
            .update(shipments)
            .set({
              purchaseCostRmb: paymentSnapshot.recoveredTotals.purchaseCostRmb.toFixed(2),
              purchaseCostEgp: paymentSnapshot.recoveredTotals.purchaseCostEgp.toFixed(2),
              customsCostEgp: paymentSnapshot.recoveredTotals.customsCostEgp.toFixed(2),
              takhreegCostEgp: paymentSnapshot.recoveredTotals.takhreegCostEgp.toFixed(2),
              finalTotalCostEgp: paymentSnapshot.recoveredTotals.finalTotalCostEgp.toFixed(2),
              balanceEgp: Math.max(
                0,
                paymentSnapshot.recoveredTotals.finalTotalCostEgp -
                  paymentSnapshot.totalPaidEgp,
              ).toFixed(2),
            })
            .where(eq(shipments.id, data.shipmentId));
        } catch (error) {
          console.error(
            `[PAYMENT RECOVERY ERROR] Failed to recover costs for shipment ${data.shipmentId}:`,
            error,
          );
        }
      }

      // Align final total with the best-known calculated total without overwriting higher-confidence values
      if (paymentSnapshot.knownTotalCost > 0 && (parseAmount(shipment.finalTotalCostEgp) === 0 || paymentSnapshot.knownTotalCost > parseAmount(shipment.finalTotalCostEgp))) {
        canonicalUpdates.finalTotalCostEgp = roundAmount(paymentSnapshot.knownTotalCost, 2).toFixed(2);
      }

      // Enforce strict per-party/component remaining rules
      const componentCurrency =
        data.costComponent === "الجمرك" || data.costComponent === "التخريج" ? "EGP" : "RMB";
      let validationRateToEgp = exchangeRateToEgp;

      if (componentCurrency === "RMB" && data.paymentCurrency === "EGP") {
        if (!validationRateToEgp) {
          const [latestRate] = await tx
            .select()
            .from(exchangeRates)
            .where(
              and(
                eq(exchangeRates.fromCurrency, "RMB"),
                eq(exchangeRates.toCurrency, "EGP"),
              ),
            )
            .orderBy(desc(exchangeRates.rateDate))
            .limit(1);

          validationRateToEgp = latestRate?.rateValue
            ? parseAmount(latestRate.rateValue)
            : RMB_TO_EGP_FALLBACK_RATE;
        }
      }

      const amountInComponentCurrency =
        componentCurrency === "EGP"
          ? amountEgp
          : data.paymentCurrency === "RMB"
            ? amountOriginal
            : validationRateToEgp
              ? amountEgp / validationRateToEgp
              : 0;

      let remainingBefore = Infinity;

      if (data.partyType === "supplier") {
        if (data.costComponent !== PURCHASE_COST_COMPONENT) {
          throw new ApiError(
            "PAYMENT_COMPONENT_INVALID",
            "المكون غير صالح للمورد",
            400,
            { component: data.costComponent },
          );
        }

        const items = await tx
          .select()
          .from(shipmentItems)
          .where(eq(shipmentItems.shipmentId, data.shipmentId));

        const allocations = await tx
          .select()
          .from(paymentAllocations)
          .where(eq(paymentAllocations.shipmentId, data.shipmentId));

        const supplierGoodsTotalRmb = items.reduce((sum, item) => {
          if (item.supplierId !== data.partyId) return sum;
          return sum + parseAmountOrZero(item.totalPurchaseCostRmb);
        }, 0);

        const supplierDirectPaidRmb = existingPayments.reduce((sum, payment) => {
          if (
            payment.partyType !== "supplier" ||
            payment.partyId !== data.partyId ||
            payment.costComponent !== PURCHASE_COST_COMPONENT
          ) {
            return sum;
          }

          if (payment.paymentCurrency === "RMB") {
            return sum + parseAmountOrZero(payment.amountOriginal);
          }

          if (payment.paymentCurrency === "EGP" && payment.exchangeRateToEgp) {
            const rate = parseAmountOrZero(payment.exchangeRateToEgp);
            if (rate > 0) {
              return sum + parseAmountOrZero(payment.amountEgp) / rate;
            }
          }

          return sum;
        }, 0);

        const supplierAllocatedPaidRmb = allocations.reduce((sum, allocation) => {
          if (
            allocation.supplierId !== data.partyId ||
            allocation.component !== PURCHASE_COST_COMPONENT ||
            allocation.currency !== "RMB"
          ) {
            return sum;
          }

          return sum + parseAmountOrZero(allocation.allocatedAmount);
        }, 0);

        const supplierPaidRmb = supplierDirectPaidRmb + supplierAllocatedPaidRmb;
        remainingBefore = Math.max(0, supplierGoodsTotalRmb - supplierPaidRmb);
      }

      if (data.partyType === "shipping_company") {
        const goodsTotalRmbGross = parseAmountOrZero(shipment.purchaseCostRmb || "0");
        const partialDiscountRmb = parseAmountOrZero(shipment.partialDiscountRmb || "0");
        const goodsTotalRmb = Math.max(0, goodsTotalRmbGross - partialDiscountRmb);

        const componentTotals: Record<string, number> = {
          "تكلفة البضاعة": goodsTotalRmb,
          "الشحن": parseAmountOrZero(shipment.shippingCostRmb || "0"),
          "العمولة": parseAmountOrZero(shipment.commissionCostRmb || "0"),
          "الجمرك": parseAmountOrZero(shipment.customsCostEgp || "0"),
          "التخريج": parseAmountOrZero(shipment.takhreegCostEgp || "0"),
        };

        const totalAllowed = componentTotals[data.costComponent] ?? 0;

        const paidSoFar = existingPayments.reduce((sum, payment) => {
          if (
            payment.partyType !== "shipping_company" ||
            payment.partyId !== data.partyId ||
            payment.costComponent !== data.costComponent
          ) {
            return sum;
          }

          if (componentCurrency === "RMB") {
            if (payment.paymentCurrency === "RMB") {
              return sum + parseAmountOrZero(payment.amountOriginal);
            }
            if (payment.paymentCurrency === "EGP" && payment.exchangeRateToEgp) {
              const rate = parseAmountOrZero(payment.exchangeRateToEgp);
              if (rate > 0) {
                return sum + parseAmountOrZero(payment.amountEgp) / rate;
              }
            }
            return sum;
          }

          return sum + parseAmountOrZero(payment.amountEgp);
        }, 0);

        remainingBefore = Math.max(0, totalAllowed - paidSoFar);
      }

      if (Number.isFinite(remainingBefore) && amountInComponentCurrency > remainingBefore + 0.0001) {
        throw new ApiError(
          "PAYMENT_OVERPAY",
          "المبلغ أكبر من المتبقي المسموح",
          400,
          {
            remainingBefore,
            attempted: amountInComponentCurrency,
            currency: componentCurrency,
            partyType: data.partyType,
            partyId: data.partyId,
            component: data.costComponent,
          },
        );
      }

      // ONLY block if payment exceeds what's currently known/allowed
      if (amountEgp > paymentSnapshot.remainingAllowed + 0.0001) {
        throw new ApiError("PAYMENT_OVERPAY", 
          `لا يمكن دفع هذا المبلغ - الحد المسموح به هو ${paymentSnapshot.remainingAllowed.toFixed(2)} جنيه`, 409, {
          shipmentId: data.shipmentId,
          knownTotal: paymentSnapshot.knownTotalCost,
          alreadyPaid: paymentSnapshot.totalPaidEgp,
          remainingAllowed: paymentSnapshot.remainingAllowed,
          attempted: amountEgp,
        });
      }

      let allocationPlan: AllocationResult[] | null = null;

      if (options?.autoAllocate) {
        if (data.partyType !== "shipping_company") {
          throw new ApiError("AUTO_ALLOCATION_NOT_ELIGIBLE", undefined, 400, {
            reason: "partyType",
            expected: "shipping_company",
            received: data.partyType,
          });
        }

        if (data.costComponent !== PURCHASE_COST_COMPONENT) {
          throw new ApiError("AUTO_ALLOCATION_NOT_ELIGIBLE", undefined, 400, {
            reason: "costComponent",
            expected: PURCHASE_COST_COMPONENT,
            received: data.costComponent,
          });
        }

        if (data.paymentCurrency !== "RMB") {
          throw new ApiError("AUTO_ALLOCATION_NOT_ELIGIBLE", undefined, 400, {
            reason: "paymentCurrency",
            expected: "RMB",
            received: data.paymentCurrency,
          });
        }

        const items = await tx
          .select({
            supplierId: shipmentItems.supplierId,
            totalPurchaseCostRmb: shipmentItems.totalPurchaseCostRmb,
          })
          .from(shipmentItems)
          .where(eq(shipmentItems.shipmentId, data.shipmentId));

        const supplierTotals = new Map<number, number>();
        for (const item of items) {
          if (!item.supplierId) continue;
          const current = supplierTotals.get(item.supplierId) ?? 0;
          supplierTotals.set(
            item.supplierId,
            current + parseAmountOrZero(item.totalPurchaseCostRmb),
          );
        }

        const shipmentGoodsTotal = Array.from(supplierTotals.values()).reduce(
          (sum, value) => sum + value,
          0,
        );

        if (shipmentGoodsTotal <= 0) {
          throw new ApiError("AUTO_ALLOCATION_NOT_ELIGIBLE", undefined, 400, {
            reason: "shipmentGoodsTotal",
            shipmentGoodsTotal,
          });
        }

        const existingAllocations = await tx
          .select({
            supplierId: paymentAllocations.supplierId,
            totalAllocated: sql<string>`COALESCE(SUM(${paymentAllocations.allocatedAmount}), 0)`,
          })
          .from(paymentAllocations)
          .where(
            and(
              eq(paymentAllocations.shipmentId, data.shipmentId),
              eq(paymentAllocations.component, PURCHASE_COST_COMPONENT),
              eq(paymentAllocations.currency, "RMB"),
            ),
          )
          .groupBy(paymentAllocations.supplierId);

        const allocatedMap = new Map<number, number>();
        existingAllocations.forEach((allocation) => {
          allocatedMap.set(
            allocation.supplierId,
            parseAmountOrZero(allocation.totalAllocated),
          );
        });

        const allocationInputs: AllocationBasis[] = Array.from(supplierTotals.entries()).map(
          ([supplierId, totalAmount]) => ({
            supplierId,
            totalAmount,
            remainingAmount: Math.max(
              0,
              totalAmount - (allocatedMap.get(supplierId) ?? 0),
            ),
          }),
        );

        allocationPlan = computeProportionalAllocations(amountOriginal, allocationInputs);
      }

      // Ensure paymentDate is a proper Date object
      const paymentDate = data.paymentDate instanceof Date 
        ? data.paymentDate 
        : new Date(data.paymentDate as unknown as string);

      const [payment] = await tx
        .insert(shipmentPayments)
        .values({
          ...data,
          paymentDate,
          amountOriginal: roundAmount(amountOriginal, 2).toFixed(2),
          exchangeRateToEgp: exchangeRateToEgp ? roundAmount(exchangeRateToEgp, 4).toFixed(4) : null,
          amountEgp: roundAmount(amountEgp, 2).toFixed(2),
        })
        .returning();

      if (allocationPlan && allocationPlan.length > 0) {
        const allocationRows = allocationPlan.map((allocation) => ({
          paymentId: payment.id,
          shipmentId: data.shipmentId,
          supplierId: allocation.supplierId,
          component: PURCHASE_COST_COMPONENT,
          currency: "RMB",
          allocatedAmount: roundAmount(allocation.allocatedAmount, 2).toFixed(2),
          createdByUserId: data.createdByUserId ?? null,
        }));

        await tx.insert(paymentAllocations).values(allocationRows);

        const totalAllocated = allocationPlan.reduce(
          (sum, allocation) => sum + allocation.allocatedAmount,
          0,
        );

        await tx.insert(auditLogs).values({
          userId: data.createdByUserId ?? null,
          entityType: "PAYMENT",
          entityId: String(payment.id),
          actionType: "AUTO_ALLOCATION_CREATED",
          details: {
            paymentId: payment.id,
            shipmentId: data.shipmentId,
            totalAllocated: roundAmount(totalAllocated, 2).toFixed(2),
            allocationCount: allocationPlan.length,
            method: "proportional",
          },
        });
      }

      if (options?.simulatePostInsertError) {
        throw new Error("Simulated failure after inserting payment");
      }

      const [paymentTotals] = await tx
        .select({
          totalPaid: sql<string>`COALESCE(SUM(${shipmentPayments.amountEgp}), 0)`,
          lastPaymentDate: sql<Date>`MAX(${shipmentPayments.paymentDate})`,
        })
        .from(shipmentPayments)
        .where(eq(shipmentPayments.shipmentId, data.shipmentId));

      const totalPaidNumber = roundAmount(parseFloat(paymentTotals?.totalPaid || "0"));
      // Use known total for balance calculation (allows partial payments)
      const balance = roundAmount(
        Math.max(0, paymentSnapshot.knownTotalCost - totalPaidNumber),
      );
      // Ensure date is a proper Date object (raw SQL may return string)
      const rawLatestDate = paymentTotals?.lastPaymentDate || data.paymentDate || new Date();
      const latestPaymentDate = rawLatestDate instanceof Date 
        ? rawLatestDate 
        : new Date(rawLatestDate as string);

      const finalTotalForShipment = knownTotal > 0 ? roundAmount(knownTotal, 2).toFixed(2) : undefined;
      const computedBalance = balance.toFixed(2);

      const shipmentUpdatePayload: Partial<typeof shipments.$inferInsert> = {
        ...canonicalUpdates,
        totalPaidEgp: totalPaidNumber.toFixed(2),
        balanceEgp: computedBalance,
        lastPaymentDate: latestPaymentDate,
        updatedAt: new Date(),
      };

      if (finalTotalForShipment) {
        shipmentUpdatePayload.finalTotalCostEgp = finalTotalForShipment;
      }

      // Update shipment with new totals atomically
      await tx
        .update(shipments)
        .set(shipmentUpdatePayload)
        .where(eq(shipments.id, data.shipmentId));

      return payment;
    });
  }

  async getPaymentAllowance(
    shipmentId: number,
    options?: { shipment?: Shipment },
  ): Promise<{
    knownTotal: number;
    alreadyPaid: number;
    remainingAllowed: number;
    recoveredFromItems: boolean;
  }> {
    const shipment = options?.shipment ?? (await this.getShipment(shipmentId));

    if (!shipment) {
      throw new ApiError("SHIPMENT_NOT_FOUND", undefined, 404, { shipmentId });
    }

    const alreadyPaid = parseAmount(shipment.totalPaidEgp);
    let knownTotal = computeKnownTotal(shipment);
    let recoveredFromItems = false;

    if (knownTotal === 0) {
      try {
        const recovery = await recoverKnownTotalFromItems(shipmentId, db);
        if (recovery.recoveredTotal > 0) {
          knownTotal = recovery.recoveredTotal;
          recoveredFromItems = true;
        }
      } catch (error) {
        console.error(`[PAYMENT ALLOWANCE] Failed to recover costs for shipment ${shipmentId}:`, error);
      }
    }

    const remainingAllowed = Math.max(0, knownTotal - alreadyPaid);

    return { knownTotal, alreadyPaid, remainingAllowed, recoveredFromItems };
  }

  async deletePayment(paymentId: number): Promise<{ deleted: boolean; allocationsDeleted: number }> {
    return db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(shipmentPayments)
        .where(eq(shipmentPayments.id, paymentId));

      if (!payment) {
        return { deleted: false, allocationsDeleted: 0 };
      }

      const shipmentId = payment.shipmentId;
      const paymentAmountEgp = parseAmount(payment.amountEgp);

      const allocationsResult = await tx
        .delete(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, paymentId))
        .returning();
      const allocationsDeleted = allocationsResult.length;

      await tx.delete(shipmentPayments).where(eq(shipmentPayments.id, paymentId));

      const remainingPayments = await tx
        .select()
        .from(shipmentPayments)
        .where(eq(shipmentPayments.shipmentId, shipmentId));

      const newTotalPaid = remainingPayments.reduce(
        (sum, p) => sum + parseAmount(p.amountEgp),
        0
      );

      const latestPaymentDate = remainingPayments.length > 0
        ? remainingPayments.reduce((latest, p) => {
            const pDate = p.paymentDate instanceof Date ? p.paymentDate : new Date(p.paymentDate);
            return pDate > latest ? pDate : latest;
          }, new Date(0))
        : null;

      const [currentShipment] = await tx
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipmentId));

      if (currentShipment) {
        const finalTotal = parseAmount(currentShipment.finalTotalCostEgp);
        const newBalance = Math.max(0, finalTotal - newTotalPaid);

        await tx
          .update(shipments)
          .set({
            totalPaidEgp: newTotalPaid.toFixed(2),
            balanceEgp: newBalance.toFixed(2),
            lastPaymentDate: latestPaymentDate,
            updatedAt: new Date(),
          })
          .where(eq(shipments.id, shipmentId));
      }

      return { deleted: true, allocationsDeleted };
    });
  }

  // Inventory
  async getAllInventoryMovements(): Promise<InventoryMovement[]> {
    return db.select().from(inventoryMovements).orderBy(desc(inventoryMovements.movementDate));
  }

  async createInventoryMovement(data: InsertInventoryMovement): Promise<InventoryMovement> {
    const [movement] = await db.insert(inventoryMovements).values(data).returning();
    return movement;
  }

  // Audit
  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values(data).returning();
    return log;
  }

  // Dashboard Stats
  async getDashboardStats() {
    const allShipments = await this.getAllShipments();

    const totalCostEgp = allShipments.reduce(
      (sum, s) => sum + parseFloat(s.finalTotalCostEgp || "0"),
      0
    );

    const totalPaidEgp = allShipments.reduce(
      (sum, s) => sum + parseFloat(s.totalPaidEgp || "0"),
      0
    );

    // Calculate remaining correctly
    // remaining = max(0, cost - paid) per shipment
    let totalBalanceEgp = 0;

    allShipments.forEach((s) => {
      const cost = parseFloat(s.finalTotalCostEgp || "0");
      const paid = parseFloat(s.totalPaidEgp || "0");
      const remaining = Math.max(0, cost - paid);
      totalBalanceEgp += remaining;
    });

    const pendingShipments = allShipments.filter(
      (s) => s.status !== "مستلمة بنجاح"
    ).length;

    const completedShipments = allShipments.filter(
      (s) => s.status === "مستلمة بنجاح"
    ).length;

    const recentShipments = allShipments.slice(0, 5);

    return {
      totalShipments: allShipments.length,
      totalCostEgp: totalCostEgp.toFixed(2),
      totalPaidEgp: totalPaidEgp.toFixed(2),
      totalBalanceEgp: totalBalanceEgp.toFixed(2),
      recentShipments,
      pendingShipments,
      completedShipments,
    };
  }

  // Payment Stats
  async getPaymentStats() {
    const allShipments = await this.getAllShipments();
    const allPayments = await this.getAllPayments();

    // Initialize accumulators for each component
    let purchaseCostRmb = 0, purchasePaidRmb = 0;
    let shippingCostRmb = 0, shippingPaidRmb = 0;
    let commissionCostRmb = 0, commissionPaidRmb = 0;
    let customsCostEgp = 0, customsPaidEgp = 0;
    let takhreegCostEgp = 0, takhreegPaidEgp = 0;
    let totalPaidEgp = 0;

    // Sum costs from shipments
    for (const s of allShipments) {
      purchaseCostRmb += parseFloat(s.purchaseCostRmb || "0");
      shippingCostRmb += parseFloat(s.shippingCostRmb || "0");
      commissionCostRmb += parseFloat(s.commissionCostRmb || "0");
      customsCostEgp += parseFloat(s.customsCostEgp || "0");
      takhreegCostEgp += parseFloat(s.takhreegCostEgp || "0");
    }

    // Sum payments by component
    for (const p of allPayments) {
      const amountEgp = parseFloat(p.amountEgp || "0");
      const amountOriginal = parseFloat(p.amountOriginal || "0");
      
      totalPaidEgp += amountEgp;

      if (p.costComponent === "تكلفة البضاعة") {
        if (p.paymentCurrency === "RMB") {
          purchasePaidRmb += amountOriginal;
        }
      } else if (p.costComponent === "الشحن") {
        if (p.paymentCurrency === "RMB") {
          shippingPaidRmb += amountOriginal;
        }
      } else if (p.costComponent === "العمولة") {
        if (p.paymentCurrency === "RMB") {
          commissionPaidRmb += amountOriginal;
        }
      } else if (p.costComponent === "الجمرك") {
        if (p.paymentCurrency === "EGP") {
          customsPaidEgp += amountOriginal;
        }
      } else if (p.costComponent === "التخريج") {
        if (p.paymentCurrency === "EGP") {
          takhreegPaidEgp += amountOriginal;
        }
      }
    }

    // Calculate balances
    const purchaseBalanceRmb = Math.max(0, purchaseCostRmb - purchasePaidRmb);
    const shippingBalanceRmb = Math.max(0, shippingCostRmb - shippingPaidRmb);
    const commissionBalanceRmb = Math.max(0, commissionCostRmb - commissionPaidRmb);
    const customsBalanceEgp = Math.max(0, customsCostEgp - customsPaidEgp);
    const takhreegBalanceEgp = Math.max(0, takhreegCostEgp - takhreegPaidEgp);

    // Calculate overall totals
    const totalCostEgp = customsCostEgp + takhreegCostEgp;
    const totalBalanceEgp = customsBalanceEgp + takhreegBalanceEgp;

    const lastPayment = allPayments.length > 0 ? allPayments[0] : null;

    return {
      totalCostEgp: totalCostEgp.toFixed(2),
      totalPaidEgp: totalPaidEgp.toFixed(2),
      totalBalanceEgp: totalBalanceEgp.toFixed(2),
      purchaseCostRmb: purchaseCostRmb.toFixed(2),
      purchasePaidRmb: purchasePaidRmb.toFixed(2),
      purchaseBalanceRmb: purchaseBalanceRmb.toFixed(2),
      shippingCostRmb: shippingCostRmb.toFixed(2),
      shippingPaidRmb: shippingPaidRmb.toFixed(2),
      shippingBalanceRmb: shippingBalanceRmb.toFixed(2),
      commissionCostRmb: commissionCostRmb.toFixed(2),
      commissionPaidRmb: commissionPaidRmb.toFixed(2),
      commissionBalanceRmb: commissionBalanceRmb.toFixed(2),
      customsCostEgp: customsCostEgp.toFixed(2),
      customsPaidEgp: customsPaidEgp.toFixed(2),
      customsBalanceEgp: customsBalanceEgp.toFixed(2),
      takhreegCostEgp: takhreegCostEgp.toFixed(2),
      takhreegPaidEgp: takhreegPaidEgp.toFixed(2),
      takhreegBalanceEgp: takhreegBalanceEgp.toFixed(2),
      lastPayment,
    };
  }

  // Inventory Stats
  async getInventoryStats() {
    const movements = await this.getAllInventoryMovements();

    const totalPieces = movements.reduce(
      (sum, m) => sum + (m.totalPiecesIn || 0),
      0
    );

    const totalCostEgp = movements.reduce(
      (sum, m) => sum + parseFloat(m.totalCostEgp || "0"),
      0
    );

    const avgUnitCostEgp = totalPieces > 0 ? totalCostEgp / totalPieces : 0;

    return {
      totalPieces,
      totalCostEgp: totalCostEgp.toFixed(2),
      totalItems: movements.length,
      avgUnitCostEgp: avgUnitCostEgp.toFixed(4),
    };
  }

  // Accounting Dashboard
  async getAccountingDashboard(filters?: {
    dateFrom?: string;
    dateTo?: string;
    partyType?: "supplier" | "shipping_company";
    partyId?: number;
    shipmentCode?: string;
    shipmentStatus?: string;
    paymentStatus?: string;
    includeArchived?: boolean;
  }) {
    const allShipments = await this.getAllShipments();
    const allPayments = await this.getAllPayments();
    const allItems = await Promise.all(
      allShipments.map(s => this.getShipmentItems(s.id))
    );

    const {
      shipmentItemSuppliersMap,
      shipmentAnySuppliersMap,
      shipmentShippingCompanyMap,
    } = buildShipmentSupplierMaps(allShipments, allItems);

    let filteredShipments = allShipments;
    
    if (!filters?.includeArchived) {
      filteredShipments = filteredShipments.filter(s => s.status !== "مؤرشفة");
    }

    if (filters?.shipmentCode) {
      filteredShipments = filteredShipments.filter(s => 
        s.shipmentCode?.toLowerCase().includes(filters.shipmentCode!.toLowerCase())
      );
    }

    if (filters?.shipmentStatus && filters.shipmentStatus !== "all") {
      filteredShipments = filteredShipments.filter(s => s.status === filters.shipmentStatus);
    }

    if (filters?.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filteredShipments = filteredShipments.filter(s => {
        const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
        return purchaseDate && purchaseDate >= fromDate;
      });
    }

    if (filters?.dateTo) {
      const toDate = new Date(filters.dateTo);
      filteredShipments = filteredShipments.filter(s => {
        const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
        return purchaseDate && purchaseDate <= toDate;
      });
    }

    const baseFilteredShipmentIds = new Set(filteredShipments.map(s => s.id));

    if (filters?.partyType && filters.partyId) {
      if (filters.partyType === "supplier") {
        const shipmentIdsWithSupplier = new Set<number>();
        shipmentAnySuppliersMap.forEach((suppliers, shipmentId) => {
          if (suppliers.has(filters.partyId!)) {
            shipmentIdsWithSupplier.add(shipmentId);
          }
        });
        filteredShipments = filteredShipments.filter(s => shipmentIdsWithSupplier.has(s.id));
      } else if (filters.partyType === "shipping_company") {
        filteredShipments = filteredShipments.filter(
          s => s.shippingCompanyId === filters.partyId,
        );
      }
    }

    if (filters?.paymentStatus && filters.paymentStatus !== "all") {
      filteredShipments = filteredShipments.filter((s) => {
        const cost = parseFloat(s.finalTotalCostEgp || "0");
        const paid = parseFloat(s.totalPaidEgp || "0");
        const balance = Math.max(0, cost - paid);
        if (filters.paymentStatus === "لم يتم دفع أي مبلغ") return paid <= 0.0001;
        if (filters.paymentStatus === "مسددة بالكامل") return balance <= 0.0001;
        if (filters.paymentStatus === "مدفوعة جزئياً") return paid > 0.0001 && balance > 0.0001;
        return true;
      });
    }

    const filteredShipmentIds = new Set(filteredShipments.map(s => s.id));
    const filteredPayments = allPayments.filter(p => {
      if (!baseFilteredShipmentIds.has(p.shipmentId)) return false;
      if (filters?.partyType && filters.partyId) {
        if (filters.partyType === "supplier") {
          return paymentMatchesSupplier(
            p,
            filters.partyId,
            shipmentItemSuppliersMap,
            shipmentShippingCompanyMap
          );
        }
        return paymentMatchesShippingCompany(p, filters.partyId);
      }
      return filteredShipmentIds.has(p.shipmentId);
    });

    const totalPurchaseRmb = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.purchaseCostRmb || "0"), 0
    );
    const totalPurchaseEgp = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.purchaseCostEgp || "0"), 0
    );
    const totalDiscountRmb = filteredShipments.reduce(
      (sum, s) => sum + parseFloat((s as any).purchaseDiscount || "0"), 0
    );
    const totalShippingRmb = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.shippingCostRmb || "0"), 0
    );
    const totalShippingEgp = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.shippingCostEgp || "0"), 0
    );
    const totalCommissionRmb = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.commissionCostRmb || "0"), 0
    );
    const totalCommissionEgp = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.commissionCostEgp || "0"), 0
    );
    const totalCustomsEgp = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.customsCostEgp || "0"), 0
    );
    const totalTakhreegEgp = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.takhreegCostEgp || "0"), 0
    );
    const totalCostEgp = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.finalTotalCostEgp || "0"), 0
    );
    const totalPaidEgp = filteredPayments.reduce(
      (sum, p) => sum + parseFloat(p.amountEgp || "0"), 0
    );
    const totalPaidRmb = filteredPayments.reduce(
      (sum, p) => p.paymentCurrency === "RMB" ? sum + parseFloat(p.amountOriginal || "0") : sum, 0
    );
    const totalBalanceEgp = filteredShipments.reduce((sum, s) => {
      const cost = parseFloat(s.finalTotalCostEgp || "0");
      const paid = parseFloat(s.totalPaidEgp || "0");
      return sum + Math.max(0, cost - paid);
    }, 0);

    // Calculate paid and remaining for purchase cost
    const totalPaidPurchaseRmb = filteredPayments
      .filter(p => p.costComponent === "تكلفة البضاعة" && p.paymentCurrency === "RMB")
      .reduce((sum, p) => sum + parseFloat(p.amountOriginal || "0"), 0);
    const totalPaidPurchaseEgp = filteredPayments
      .filter(p => p.costComponent === "تكلفة البضاعة")
      .reduce((sum, p) => sum + parseFloat(p.amountEgp || "0"), 0);
    const totalBalancePurchaseRmb = Math.max(0, totalPurchaseRmb - totalPaidPurchaseRmb);
    const totalBalancePurchaseEgp = Math.max(0, totalPurchaseEgp - totalPaidPurchaseEgp);

    // Calculate paid and remaining for shipping
    const totalPaidShippingRmb = filteredPayments
      .filter(p => p.costComponent === "الشحن" && p.paymentCurrency === "RMB")
      .reduce((sum, p) => sum + parseFloat(p.amountOriginal || "0"), 0);
    const totalPaidShippingEgp = filteredPayments
      .filter(p => p.costComponent === "الشحن")
      .reduce((sum, p) => sum + parseFloat(p.amountEgp || "0"), 0);
    const totalBalanceShippingRmb = Math.max(0, totalShippingRmb - totalPaidShippingRmb);
    const totalBalanceShippingEgp = Math.max(0, totalShippingEgp - totalPaidShippingEgp);

    // Calculate paid and remaining for commission
    const totalPaidCommissionRmb = filteredPayments
      .filter(p => p.costComponent === "العمولة" && p.paymentCurrency === "RMB")
      .reduce((sum, p) => sum + parseFloat(p.amountOriginal || "0"), 0);
    const totalPaidCommissionEgp = filteredPayments
      .filter(p => p.costComponent === "العمولة")
      .reduce((sum, p) => sum + parseFloat(p.amountEgp || "0"), 0);
    const totalBalanceCommissionRmb = Math.max(0, totalCommissionRmb - totalPaidCommissionRmb);
    const totalBalanceCommissionEgp = Math.max(0, totalCommissionEgp - totalPaidCommissionEgp);

    // Calculate paid and remaining for customs
    const totalPaidCustomsEgp = filteredPayments
      .filter(p => p.costComponent === "الجمرك")
      .reduce((sum, p) => sum + parseFloat(p.amountEgp || "0"), 0);
    const totalBalanceCustomsEgp = Math.max(0, totalCustomsEgp - totalPaidCustomsEgp);

    // Calculate paid and remaining for takhreeg
    const totalPaidTakhreegEgp = filteredPayments
      .filter(p => p.costComponent === "التخريج")
      .reduce((sum, p) => sum + parseFloat(p.amountEgp || "0"), 0);
    const totalBalanceTakhreegEgp = Math.max(0, totalTakhreegEgp - totalPaidTakhreegEgp);

    const filteredItems = allItems.flat().filter(item => filteredShipmentIds.has(item.shipmentId));
    const totalCartons = filteredItems.reduce((sum, item) => sum + (item.cartonsCtn || 0), 0);
    const totalPieces = filteredItems.reduce((sum, item) => sum + (item.totalPiecesCou || 0), 0);

    const totalCostRmb = totalPurchaseRmb + totalShippingRmb + totalCommissionRmb - totalDiscountRmb;
    const totalBalanceRmb = Math.max(0, totalCostRmb - totalPaidRmb);

    const unsettledShipmentsCount = filteredShipments.filter(s => {
      const cost = parseFloat(s.finalTotalCostEgp || "0");
      const paid = parseFloat(s.totalPaidEgp || "0");
      return Math.max(0, cost - paid) > 0.0001;
    }).length;

    return {
      totalPurchaseRmb: totalPurchaseRmb.toFixed(2),
      totalPurchaseEgp: totalPurchaseEgp.toFixed(2),
      totalDiscountRmb: totalDiscountRmb.toFixed(2),
      totalShippingRmb: totalShippingRmb.toFixed(2),
      totalShippingEgp: totalShippingEgp.toFixed(2),
      totalCommissionRmb: totalCommissionRmb.toFixed(2),
      totalCommissionEgp: totalCommissionEgp.toFixed(2),
      totalCustomsEgp: totalCustomsEgp.toFixed(2),
      totalTakhreegEgp: totalTakhreegEgp.toFixed(2),
      totalCostEgp: totalCostEgp.toFixed(2),
      totalCostRmb: totalCostRmb.toFixed(2),
      totalPaidEgp: totalPaidEgp.toFixed(2),
      totalPaidRmb: totalPaidRmb.toFixed(2),
      totalBalanceEgp: totalBalanceEgp.toFixed(2),
      totalBalanceRmb: totalBalanceRmb.toFixed(2),
      totalCartons,
      totalPieces,
      unsettledShipmentsCount,
      shipmentsCount: filteredShipments.length,
      totalPaidShippingRmb: totalPaidShippingRmb.toFixed(2),
      totalBalanceShippingRmb: totalBalanceShippingRmb.toFixed(2),
      totalPaidShippingEgp: totalPaidShippingEgp.toFixed(2),
      totalBalanceShippingEgp: totalBalanceShippingEgp.toFixed(2),
      totalPaidCommissionRmb: totalPaidCommissionRmb.toFixed(2),
      totalBalanceCommissionRmb: totalBalanceCommissionRmb.toFixed(2),
      totalPaidCommissionEgp: totalPaidCommissionEgp.toFixed(2),
      totalBalanceCommissionEgp: totalBalanceCommissionEgp.toFixed(2),
      totalPaidPurchaseRmb: totalPaidPurchaseRmb.toFixed(2),
      totalBalancePurchaseRmb: totalBalancePurchaseRmb.toFixed(2),
      totalPaidPurchaseEgp: totalPaidPurchaseEgp.toFixed(2),
      totalBalancePurchaseEgp: totalBalancePurchaseEgp.toFixed(2),
      totalPaidCustomsEgp: totalPaidCustomsEgp.toFixed(2),
      totalBalanceCustomsEgp: totalBalanceCustomsEgp.toFixed(2),
      totalPaidTakhreegEgp: totalPaidTakhreegEgp.toFixed(2),
      totalBalanceTakhreegEgp: totalBalanceTakhreegEgp.toFixed(2),
    };
  }

  // Supplier Balances
  async getSupplierBalances(filters?: {
    dateFrom?: string;
    dateTo?: string;
    supplierId?: number;
    balanceType?: 'owing' | 'credit' | 'all';
  }) {
    const allSuppliers = await this.getAllSuppliers();
    const allShipments = await this.getAllShipments();
    const allPayments = await this.getAllPayments();
    const allAllocations = await this.getAllPaymentAllocations();
    const allItems = await Promise.all(
      allShipments.map(s => this.getShipmentItems(s.id))
    );

    const {
      shipmentItemSuppliersMap,
      shipmentAnySuppliersMap,
      shipmentShippingCompanyMap,
    } = buildShipmentSupplierMaps(allShipments, allItems);

    const itemsByShipmentId = new Map<number, ShipmentItem[]>();
    allShipments.forEach((shipment, index) => {
      itemsByShipmentId.set(shipment.id, allItems[index] ?? []);
    });

    const result: Array<{
      supplierId: number;
      supplierName: string;
      totalCostRmb: string;
      totalPaidRmb: string;
      balanceRmb: string;
      totalCostEgp: string;
      totalPaidEgp: string;
      balanceEgp: string;
      balanceStatusRmb: 'owing' | 'settled' | 'credit';
      balanceStatusEgp: 'owing' | 'settled' | 'credit';
      balanceStatus: 'owing' | 'settled' | 'credit';
    }> = [];

    for (const supplier of allSuppliers) {
      if (filters?.supplierId && supplier.id !== filters.supplierId) continue;

      let supplierShipments = allShipments.filter(s => {
        const anySuppliers = shipmentAnySuppliersMap.get(s.id);
        return anySuppliers?.has(supplier.id);
      });

      if (filters?.dateFrom) {
        const fromDate = new Date(filters.dateFrom);
        supplierShipments = supplierShipments.filter(s => {
          const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
          return purchaseDate && purchaseDate >= fromDate;
        });
      }

      if (filters?.dateTo) {
        const toDate = new Date(filters.dateTo);
        supplierShipments = supplierShipments.filter(s => {
          const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
          return purchaseDate && purchaseDate <= toDate;
        });
      }

      const supplierShipmentIdsFiltered = new Set(supplierShipments.map(s => s.id));
      const supplierPayments = allPayments.filter(p => {
        if (!supplierShipmentIdsFiltered.has(p.shipmentId)) return false;
        if (!paymentMatchesSupplier(
          p,
          supplier.id,
          shipmentItemSuppliersMap,
          shipmentShippingCompanyMap
        )) {
          return false;
        }
        return CUSTOMS_COST_COMPONENTS.has(p.costComponent);
      });

      const supplierAllocations = allAllocations.filter((allocation) => {
        if (!supplierShipmentIdsFiltered.has(allocation.shipmentId)) return false;
        return (
          allocation.supplierId === supplier.id &&
          allocation.component === PURCHASE_COST_COMPONENT &&
          allocation.currency === "RMB"
        );
      });
      let supplierDirectPaymentsRmb = allPayments.filter((payment) => {
        if (!supplierShipmentIdsFiltered.has(payment.shipmentId)) return false;
        return (
          payment.partyType === "supplier" &&
          payment.partyId === supplier.id &&
          payment.costComponent === PURCHASE_COST_COMPONENT &&
          payment.paymentCurrency === "RMB"
        );
      });

      if (filters?.dateFrom) {
        const fromDate = new Date(filters.dateFrom);
        supplierDirectPaymentsRmb = supplierDirectPaymentsRmb.filter(
          (payment) => new Date(payment.paymentDate) >= fromDate,
        );
      }

      if (filters?.dateTo) {
        const toDate = new Date(filters.dateTo);
        supplierDirectPaymentsRmb = supplierDirectPaymentsRmb.filter(
          (payment) => new Date(payment.paymentDate) <= toDate,
        );
      }

      const totalCostRmb = supplierShipments.reduce((sum, shipment) => {
        const items = itemsByShipmentId.get(shipment.id) ?? [];
        return sum + getSupplierShipmentGoodsCostRmb(items, supplier.id);
      }, 0);
      const supplierPaymentsTotals = getCurrencyTotals(
        supplierPayments.map((payment) => ({
          paymentCurrency: payment.paymentCurrency,
          amountEgp: payment.amountEgp,
          amountOriginal: payment.amountOriginal,
        })),
      );
      const supplierRmbTotals = getCurrencyTotals([
        ...supplierAllocations.map((allocation) => ({
          originalCurrency: "RMB",
          amountOriginal: allocation.allocatedAmount,
        })),
        ...supplierDirectPaymentsRmb.map((payment) => ({
          paymentCurrency: payment.paymentCurrency,
          amountOriginal: payment.amountOriginal,
        })),
      ]);
      const totalPaidRmb = supplierRmbTotals.sumRmb;
      const balanceRmb = totalCostRmb - totalPaidRmb;

      const totalCostEgp = supplierShipments.reduce((sum, shipment) => {
        const items = itemsByShipmentId.get(shipment.id) ?? [];
        return sum + getSupplierShipmentCustomsCostEgp(items, supplier.id);
      }, 0);
      const totalPaidEgp = supplierPaymentsTotals.sumEgp;
      const balanceEgp = totalCostEgp - totalPaidEgp;

      const getBalanceStatus = (value: number): 'owing' | 'settled' | 'credit' => {
        if (value > 0.0001) return 'owing';
        if (value < -0.0001) return 'credit';
        return 'settled';
      };

      const balanceStatusRmb = getBalanceStatus(balanceRmb);
      const balanceStatusEgp = getBalanceStatus(balanceEgp);
      const balanceStatus = balanceStatusRmb;

      if (filters?.balanceType && filters.balanceType !== 'all') {
        if (filters.balanceType === 'owing' && balanceStatus !== 'owing') continue;
        if (filters.balanceType === 'credit' && balanceStatus !== 'credit') continue;
      }

      result.push({
        supplierId: supplier.id,
        supplierName: supplier.name,
        totalCostRmb: totalCostRmb.toFixed(2),
        totalPaidRmb: totalPaidRmb.toFixed(2),
        balanceRmb: balanceRmb.toFixed(2),
        totalCostEgp: totalCostEgp.toFixed(2),
        totalPaidEgp: totalPaidEgp.toFixed(2),
        balanceEgp: balanceEgp.toFixed(2),
        balanceStatusRmb,
        balanceStatusEgp,
        balanceStatus,
      });
    }

    return result;
  }

  // Supplier Statement
  async getSupplierStatement(supplierId: number, filters?: {
    dateFrom?: string;
    dateTo?: string;
  }) {
    const supplier = await this.getSupplier(supplierId);
    if (!supplier) {
      throw new Error("Supplier not found");
    }

    const allShipments = await this.getAllShipments();
    const allPayments = await this.getAllPayments();
    const allAllocations = await this.getAllPaymentAllocations();
    const allItems = await Promise.all(
      allShipments.map(s => this.getShipmentItems(s.id))
    );

    const {
      shipmentItemSuppliersMap,
      shipmentAnySuppliersMap,
      shipmentShippingCompanyMap,
    } = buildShipmentSupplierMaps(allShipments, allItems);

    const itemsByShipmentId = new Map<number, ShipmentItem[]>();
    allShipments.forEach((shipment, index) => {
      itemsByShipmentId.set(shipment.id, allItems[index] ?? []);
    });

    let supplierShipments = allShipments.filter(s => {
      const suppliers = shipmentAnySuppliersMap.get(s.id);
      return suppliers?.has(supplierId);
    });
    let supplierPayments = allPayments.filter(p => {
      if (!paymentMatchesSupplier(
        p,
        supplierId,
        shipmentItemSuppliersMap,
        shipmentShippingCompanyMap
      )) {
        return false;
      }
      return CUSTOMS_COST_COMPONENTS.has(p.costComponent);
    });
    let directSupplierPayments = allPayments.filter((payment) => {
      return (
        payment.partyType === "supplier" &&
        payment.partyId === supplierId &&
        payment.costComponent === PURCHASE_COST_COMPONENT &&
        payment.paymentCurrency === "RMB"
      );
    });

    const paymentById = new Map(allPayments.map((payment) => [payment.id, payment]));
    let supplierAllocations = allAllocations.filter((allocation) => {
      return (
        allocation.supplierId === supplierId &&
        allocation.component === PURCHASE_COST_COMPONENT &&
        allocation.currency === "RMB"
      );
    });

    if (filters?.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      supplierShipments = supplierShipments.filter(s => {
        const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
        return purchaseDate && purchaseDate >= fromDate;
      });
      supplierPayments = supplierPayments.filter(p => new Date(p.paymentDate) >= fromDate);
      directSupplierPayments = directSupplierPayments.filter(
        (payment) => new Date(payment.paymentDate) >= fromDate,
      );
      supplierAllocations = supplierAllocations.filter((allocation) => {
        const payment = paymentById.get(allocation.paymentId);
        if (!payment?.paymentDate) return false;
        return new Date(payment.paymentDate) >= fromDate;
      });
    }

    if (filters?.dateTo) {
      const toDate = new Date(filters.dateTo);
      supplierShipments = supplierShipments.filter(s => {
        const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
        return purchaseDate && purchaseDate <= toDate;
      });
      supplierPayments = supplierPayments.filter(p => new Date(p.paymentDate) <= toDate);
      directSupplierPayments = directSupplierPayments.filter(
        (payment) => new Date(payment.paymentDate) <= toDate,
      );
      supplierAllocations = supplierAllocations.filter((allocation) => {
        const payment = paymentById.get(allocation.paymentId);
        if (!payment?.paymentDate) return false;
        return new Date(payment.paymentDate) <= toDate;
      });
    }

    const movements: Array<{
      date: Date | string;
      type: 'shipment' | 'payment';
      description: string;
      shipmentCode?: string;
      costEgp?: string;
      costRmb?: string;
      paidEgp?: string;
      paidRmb?: string;
      currency?: string;
      runningBalance: string;
      runningBalanceRmb?: string;
      runningBalanceEgp?: string;
      paymentId?: number;
      attachmentUrl?: string | null;
      attachmentOriginalName?: string | null;
    }> = [];

    supplierShipments.forEach(s => {
      const items = itemsByShipmentId.get(s.id) ?? [];
      const costRmb = getSupplierShipmentGoodsCostRmb(items, supplierId);
      const costEgp = getSupplierShipmentCustomsCostEgp(items, supplierId);
      if (costRmb <= 0 && costEgp <= 0) return;
      movements.push({
        date: s.purchaseDate || s.createdAt || new Date(),
        type: 'shipment',
        description: `شحنة: ${s.shipmentName}`,
        shipmentCode: s.shipmentCode,
        costEgp: costEgp > 0 ? costEgp.toFixed(2) : undefined,
        costRmb: costRmb > 0 ? costRmb.toFixed(2) : undefined,
        runningBalance: "0",
      });
    });

    supplierPayments.forEach(p => {
      const shipment = allShipments.find(s => s.id === p.shipmentId);
      movements.push({
        date: p.paymentDate,
        type: 'payment',
        description: `دفعة - ${p.costComponent}`,
        shipmentCode: shipment?.shipmentCode,
        paidEgp: p.amountEgp || "0",
        currency: p.paymentCurrency,
        runningBalance: "0",
        paymentId: p.id,
        attachmentUrl: p.attachmentUrl ?? null,
        attachmentOriginalName: p.attachmentOriginalName ?? null,
      });
    });

    directSupplierPayments.forEach((payment) => {
      const shipment = allShipments.find((s) => s.id === payment.shipmentId);
      movements.push({
        date: payment.paymentDate,
        type: 'payment',
        description: `دفعة مباشرة - ${payment.costComponent}`,
        shipmentCode: shipment?.shipmentCode,
        paidRmb: parseAmount(payment.amountOriginal).toFixed(2),
        currency: payment.paymentCurrency,
        runningBalance: "0",
        paymentId: payment.id,
        attachmentUrl: payment.attachmentUrl ?? null,
        attachmentOriginalName: payment.attachmentOriginalName ?? null,
      });
    });

    supplierAllocations.forEach((allocation) => {
      const payment = paymentById.get(allocation.paymentId);
      if (!payment) return;
      const shipment = allShipments.find(s => s.id === allocation.shipmentId);
      movements.push({
        date: payment.paymentDate,
        type: 'payment',
        description: `سداد تكلفة بضاعة عبر شركة الشحن (توزيع تلقائي) - دفعة ${allocation.paymentId} / شحنة ${allocation.shipmentId}`,
        shipmentCode: shipment?.shipmentCode,
        paidRmb: parseAmount(allocation.allocatedAmount).toFixed(2),
        currency: payment.paymentCurrency,
        runningBalance: "0",
        paymentId: allocation.paymentId,
        attachmentUrl: payment.attachmentUrl ?? null,
        attachmentOriginalName: payment.attachmentOriginalName ?? null,
      });
    });

    movements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalanceRmb = 0;
    let runningBalanceEgp = 0;
    movements.forEach((m) => {
      if (m.type === "shipment") {
        const { sumEgp, sumRmb } = getCurrencyTotals([
          { costEgp: m.costEgp, costRmb: m.costRmb },
        ]);
        runningBalanceRmb += sumRmb;
        runningBalanceEgp += sumEgp;
      } else {
        const { sumEgp, sumRmb } = getCurrencyTotals([
          { paidEgp: m.paidEgp, paidRmb: m.paidRmb, currency: m.currency },
        ]);
        runningBalanceRmb -= sumRmb;
        runningBalanceEgp -= sumEgp;
      }
      m.runningBalanceRmb = runningBalanceRmb.toFixed(2);
      m.runningBalanceEgp = runningBalanceEgp.toFixed(2);
      m.runningBalance = runningBalanceEgp.toFixed(2);
    });

    return { supplier, movements };
  }

  // Shipping Company Balances
  async getShippingCompanyBalances(filters?: {
    dateFrom?: string;
    dateTo?: string;
    shippingCompanyId?: number;
    balanceType?: 'owing' | 'credit' | 'all';
  }) {
    const allShippingCompanies = await this.getAllShippingCompanies();
    const allShipments = await this.getAllShipments();
    const allPayments = await this.getAllPayments();

    const result: Array<{
      shippingCompanyId: number;
      shippingCompanyName: string;
      totalCostEgp: string;
      totalPaidEgp: string;
      totalPaidRmb: string;
      balanceEgp: string;
      balanceRmb: string;
      balanceStatus: 'owing' | 'settled' | 'credit';
    }> = [];

    for (const company of allShippingCompanies) {
      if (filters?.shippingCompanyId && company.id !== filters.shippingCompanyId) continue;

      let companyShipments = allShipments.filter(s => s.shippingCompanyId === company.id);

      if (filters?.dateFrom) {
        const fromDate = new Date(filters.dateFrom);
        companyShipments = companyShipments.filter(s => {
          const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
          return purchaseDate && purchaseDate >= fromDate;
        });
      }

      if (filters?.dateTo) {
        const toDate = new Date(filters.dateTo);
        companyShipments = companyShipments.filter(s => {
          const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
          return purchaseDate && purchaseDate <= toDate;
        });
      }

      const companyShipmentIds = new Set(companyShipments.map(s => s.id));
      const companyPayments = allPayments.filter(p => {
        if (!companyShipmentIds.has(p.shipmentId)) return false;
        return paymentMatchesShippingCompany(p, company.id);
      });

      const totalCost = companyShipments.reduce(
        (sum, s) => sum + getShippingCompanyShipmentCost(s, company.id),
        0,
      );
      const totalCostRmb = companyShipments.reduce(
        (sum, s) => sum + getShipmentShippingCompanyCostRmb(s),
        0,
      );
      const companyPaymentTotals = getCurrencyTotals(
        companyPayments.map((payment) => ({
          paymentCurrency: payment.paymentCurrency,
          amountEgp: payment.amountEgp,
          amountOriginal: payment.amountOriginal,
        })),
      );
      const totalPaid = companyPaymentTotals.sumEgp;
      const totalPaidRmb = companyPaymentTotals.sumRmb;
      const balance = totalCost - totalPaid;
      const balanceRmb = totalCostRmb - totalPaidRmb;

      let balanceStatus: 'owing' | 'settled' | 'credit' = 'settled';
      if (balance > 0.0001) balanceStatus = 'owing';
      else if (balance < -0.0001) balanceStatus = 'credit';

      if (filters?.balanceType && filters.balanceType !== 'all') {
        if (filters.balanceType === 'owing' && balanceStatus !== 'owing') continue;
        if (filters.balanceType === 'credit' && balanceStatus !== 'credit') continue;
      }

      result.push({
        shippingCompanyId: company.id,
        shippingCompanyName: company.name,
        totalCostEgp: totalCost.toFixed(2),
        totalPaidEgp: totalPaid.toFixed(2),
        totalPaidRmb: totalPaidRmb.toFixed(2),
        balanceEgp: balance.toFixed(2),
        balanceRmb: balanceRmb.toFixed(2),
        balanceStatus,
      });
    }

    return result;
  }

  // Shipping Company Statement
  async getShippingCompanyStatement(shippingCompanyId: number, filters?: {
    dateFrom?: string;
    dateTo?: string;
  }) {
    const shippingCompany = await this.getShippingCompany(shippingCompanyId);
    if (!shippingCompany) {
      throw new Error("Shipping company not found");
    }

    const allShipments = await this.getAllShipments();
    const allPayments = await this.getAllPayments();

    let companyShipments = allShipments.filter(s => s.shippingCompanyId === shippingCompanyId);
    let companyPayments = allPayments.filter(p => paymentMatchesShippingCompany(p, shippingCompanyId));

    if (filters?.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      companyShipments = companyShipments.filter(s => {
        const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
        return purchaseDate && purchaseDate >= fromDate;
      });
      companyPayments = companyPayments.filter(p => new Date(p.paymentDate) >= fromDate);
    }

    if (filters?.dateTo) {
      const toDate = new Date(filters.dateTo);
      companyShipments = companyShipments.filter(s => {
        const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
        return purchaseDate && purchaseDate <= toDate;
      });
      companyPayments = companyPayments.filter(p => new Date(p.paymentDate) <= toDate);
    }

    const movements: Array<{
      date: Date | string;
      type: 'shipment' | 'payment';
      description: string;
      shipmentCode?: string;
      costEgp?: string;
      paidEgp?: string;
      paidRmb?: string;
      runningBalance: string;
      runningBalanceRmb?: string;
      originalCurrency?: string;
      paymentId?: number;
      attachmentUrl?: string | null;
      attachmentOriginalName?: string | null;
    }> = [];

    companyShipments.forEach(s => {
      const costEgp = getShippingCompanyShipmentCost(s, shippingCompanyId);
      const costRmb = getShipmentShippingCompanyCostRmb(s);
      if (costEgp <= 0 && costRmb <= 0) return;
      movements.push({
        date: s.purchaseDate || s.createdAt || new Date(),
        type: 'shipment',
        description: `شحنة: ${s.shipmentName}`,
        shipmentCode: s.shipmentCode,
        costEgp: costEgp > 0 ? costEgp.toFixed(2) : undefined,
        costRmb: costRmb > 0 ? costRmb.toFixed(2) : undefined,
        originalCurrency: costRmb > 0 ? "RMB" : "EGP",
        runningBalance: "0",
      });
    });

    companyPayments.forEach(p => {
      const shipment = allShipments.find(s => s.id === p.shipmentId);
      movements.push({
        date: p.paymentDate,
        type: 'payment',
        description: `دفعة - ${p.costComponent}`,
        shipmentCode: shipment?.shipmentCode,
        paidEgp: p.amountEgp || "0",
        paidRmb: p.paymentCurrency === "RMB" ? p.amountOriginal || "0" : undefined,
        originalCurrency: p.paymentCurrency,
        runningBalance: "0",
        paymentId: p.id,
        attachmentUrl: p.attachmentUrl ?? null,
        attachmentOriginalName: p.attachmentOriginalName ?? null,
      });
    });

    movements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    let runningBalanceRmb = 0;
    movements.forEach((m) => {
      if (m.type === "shipment") {
        const { sumEgp, sumRmb } = getCurrencyTotals([
          { costEgp: m.costEgp, costRmb: m.costRmb },
        ]);
        runningBalance += sumEgp;
        runningBalanceRmb += sumRmb;
      } else {
        const { sumEgp, sumRmb } = getCurrencyTotals([
          {
            paidEgp: m.paidEgp,
            paidRmb: m.paidRmb,
            originalCurrency: m.originalCurrency,
          },
        ]);
        runningBalance -= sumEgp;
        runningBalanceRmb -= sumRmb;
      }
      m.runningBalance = runningBalance.toFixed(2);
      m.runningBalanceRmb = runningBalanceRmb.toFixed(2);
    });

    const companyPaymentTotals = getCurrencyTotals(
      companyPayments.map((payment) => ({
        paymentCurrency: payment.paymentCurrency,
        amountEgp: payment.amountEgp,
        amountOriginal: payment.amountOriginal,
      })),
    );
    const totalPaidEgp = companyPaymentTotals.sumEgp;
    const totalPaidRmb = companyPaymentTotals.sumRmb;

    return {
      shippingCompany,
      movements,
      totalPaidEgp: totalPaidEgp.toFixed(2),
      totalPaidRmb: totalPaidRmb.toFixed(2),
    };
  }

  // Movement Report
  async getMovementReport(filters?: {
    dateFrom?: string;
    dateTo?: string;
    shipmentId?: number;
    partyType?: "supplier" | "shipping_company";
    partyId?: number;
    movementType?: string;
    costComponent?: string;
    paymentMethod?: string;
    shipmentStatus?: string;
    paymentStatus?: string;
    includeArchived?: boolean;
  }) {
    const allShipments = await this.getAllShipments();
    const allPayments = await this.getAllPayments();
    const allAllocations = await this.getAllPaymentAllocations();
    const allSuppliers = await this.getAllSuppliers();
    const allShippingCompanies = await this.getAllShippingCompanies();
    const allUsers = await this.getAllUsers();
    const allItems = await Promise.all(
      allShipments.map(s => this.getShipmentItems(s.id))
    );

    const supplierMap = new Map(allSuppliers.map(s => [s.id, s.name]));
    const shippingCompanyMap = new Map(allShippingCompanies.map(c => [c.id, c.name]));
    const userMap = new Map(allUsers.map(u => [u.id, u.firstName || u.username]));
    const {
      shipmentItemSuppliersMap,
      shipmentAnySuppliersMap,
      shipmentShippingCompanyMap,
    } = buildShipmentSupplierMaps(allShipments, allItems);

    let filteredShipments = allShipments;
    
    if (!filters?.includeArchived) {
      filteredShipments = filteredShipments.filter(s => s.status !== "مؤرشفة");
    }

    if (filters?.shipmentStatus && filters.shipmentStatus !== "all") {
      filteredShipments = filteredShipments.filter((s) => s.status === filters.shipmentStatus);
    }

    if (filters?.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filteredShipments = filteredShipments.filter(s => {
        const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
        return purchaseDate && purchaseDate >= fromDate;
      });
    }

    if (filters?.dateTo) {
      const toDate = new Date(filters.dateTo);
      filteredShipments = filteredShipments.filter(s => {
        const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
        return purchaseDate && purchaseDate <= toDate;
      });
    }

    if (filters?.shipmentId) {
      filteredShipments = filteredShipments.filter(s => s.id === filters.shipmentId);
    }

    const baseFilteredShipmentIds = new Set(filteredShipments.map(s => s.id));

    if (filters?.partyType && filters.partyId) {
      if (filters.partyType === "supplier") {
        const shipmentIdsWithSupplier = new Set<number>();
        shipmentAnySuppliersMap.forEach((suppliers, shipmentId) => {
          if (suppliers.has(filters.partyId!)) {
            shipmentIdsWithSupplier.add(shipmentId);
          }
        });
        filteredShipments = filteredShipments.filter(s => shipmentIdsWithSupplier.has(s.id));
      } else {
        filteredShipments = filteredShipments.filter(
          s => s.shippingCompanyId === filters.partyId,
        );
      }
    }

    if (filters?.paymentStatus && filters.paymentStatus !== "all") {
      filteredShipments = filteredShipments.filter((s) => {
        const cost = parseFloat(s.finalTotalCostEgp || "0");
        const paid = parseFloat(s.totalPaidEgp || "0");
        const balance = Math.max(0, cost - paid);
        if (filters.paymentStatus === "لم يتم دفع أي مبلغ") return paid <= 0.0001;
        if (filters.paymentStatus === "مسددة بالكامل") return balance <= 0.0001;
        if (filters.paymentStatus === "مدفوعة جزئياً") return paid > 0.0001 && balance > 0.0001;
        return true;
      });
    }

    const filteredShipmentIds = new Set(filteredShipments.map(s => s.id));

    const movements: Array<{
      date: Date | string;
      shipmentCode: string;
      shipmentName: string;
      partyName?: string;
      partyId?: number;
      partyType?: "supplier" | "shipping_company";
      movementType: string;
      costComponent?: string;
      paymentMethod?: string;
      originalCurrency?: string;
      amountOriginal?: string;
      amountRmb?: string;
      amountEgp: string;
      direction: 'cost' | 'payment';
      isAllocation?: boolean;
      userName?: string;
      paymentId?: number;
      attachmentUrl?: string | null;
      attachmentOriginalName?: string | null;
    }> = [];

    const shipmentSupplierMap = new Map<number, number | undefined>();
    allItems.forEach((items, idx) => {
      const firstSupplier = items.find(i => i.supplierId)?.supplierId;
      shipmentSupplierMap.set(allShipments[idx].id, firstSupplier ?? undefined);
    });

    for (const s of filteredShipments) {
      const purchaseSupplierId = shipmentSupplierMap.get(s.id);
      const purchaseSupplierName = purchaseSupplierId ? supplierMap.get(purchaseSupplierId) : undefined;
      const shippingCompanyId = shipmentShippingCompanyMap.get(s.id);
      const shippingCompanyName = shippingCompanyId
        ? shippingCompanyMap.get(shippingCompanyId)
        : undefined;

      const costTypes = [
        {
          type: "تكلفة بضاعة",
          rmb: s.purchaseCostRmb,
          egp: s.purchaseCostEgp,
          partyId: purchaseSupplierId,
          partyName: purchaseSupplierName,
          partyType: "supplier" as const,
        },
        {
          type: "تكلفة شحن",
          rmb: s.shippingCostRmb,
          egp: s.shippingCostEgp,
          partyId: shippingCompanyId,
          partyName: shippingCompanyName,
          partyType: "shipping_company" as const,
        },
        {
          type: "عمولة",
          rmb: s.commissionCostRmb,
          egp: s.commissionCostEgp,
          partyId: shippingCompanyId,
          partyName: shippingCompanyName,
          partyType: "shipping_company" as const,
        },
        {
          type: "جمرك",
          rmb: null,
          egp: s.customsCostEgp,
          partyId: shippingCompanyId,
          partyName: shippingCompanyName,
          partyType: "shipping_company" as const,
        },
        {
          type: "تخريج",
          rmb: null,
          egp: s.takhreegCostEgp,
          partyId: shippingCompanyId,
          partyName: shippingCompanyName,
          partyType: "shipping_company" as const,
        },
      ];

      for (const ct of costTypes) {
        const egpAmount = parseFloat(ct.egp || "0");
        const rmbAmount = parseFloat(ct.rmb || "0");
        if (egpAmount <= 0 && rmbAmount <= 0) continue;

        if (filters?.partyType && ct.partyType !== filters.partyType) {
          continue;
        }

        if (filters?.movementType && filters.movementType !== ct.type && filters.movementType !== 'all') {
          continue;
        }

        movements.push({
          date: s.purchaseDate || s.createdAt || new Date(),
          shipmentCode: s.shipmentCode,
          shipmentName: s.shipmentName,
          partyName: ct.partyName,
          partyId: ct.partyId,
          partyType: ct.partyType,
          movementType: ct.type,
          originalCurrency: ct.rmb ? "RMB" : "EGP",
          amountOriginal: ct.rmb || ct.egp || "0",
          amountRmb: rmbAmount > 0 ? rmbAmount.toFixed(2) : undefined,
          amountEgp: rmbAmount > 0 ? "0" : ct.egp || "0",
          direction: 'cost',
        });
      }
    }

    let filteredPayments = allPayments.filter(p => {
      if (!baseFilteredShipmentIds.has(p.shipmentId)) return false;
      if (filters?.partyType && filters.partyId) {
        if (filters.partyType === "supplier") {
          return paymentMatchesSupplier(
            p,
            filters.partyId,
            shipmentItemSuppliersMap,
            shipmentShippingCompanyMap
          );
        }
        return paymentMatchesShippingCompany(p, filters.partyId);
      }
      return filteredShipmentIds.has(p.shipmentId);
    });

    if (filters?.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filteredPayments = filteredPayments.filter(p => new Date(p.paymentDate) >= fromDate);
    }

    if (filters?.dateTo) {
      const toDate = new Date(filters.dateTo);
      filteredPayments = filteredPayments.filter(p => new Date(p.paymentDate) <= toDate);
    }

    if (filters?.costComponent) {
      filteredPayments = filteredPayments.filter(p => p.costComponent === filters.costComponent);
    }

    if (filters?.paymentMethod) {
      filteredPayments = filteredPayments.filter(p => p.paymentMethod === filters.paymentMethod);
    }

    for (const p of filteredPayments) {
      const shipment = allShipments.find(s => s.id === p.shipmentId);
      if (!shipment) continue;

      if (
        filters?.movementType &&
        filters.movementType !== "دفعة" &&
        filters.movementType !== "all"
      ) {
        continue;
      }

      const partyType = (p.partyType ?? "supplier") as "supplier" | "shipping_company";
      const partyId = p.partyId ?? null;
      const partyName =
        partyType === "shipping_company"
          ? (partyId ? shippingCompanyMap.get(partyId) : undefined)
          : (partyId ? supplierMap.get(partyId) : undefined);
      const userName = p.createdByUserId ? userMap.get(p.createdByUserId) : undefined;

      movements.push({
        date: p.paymentDate,
        shipmentCode: shipment.shipmentCode,
        shipmentName: shipment.shipmentName,
        partyName,
        partyId: partyId ?? undefined,
        partyType,
        movementType: "دفعة",
        costComponent: p.costComponent,
        paymentMethod: p.paymentMethod,
        originalCurrency: p.paymentCurrency,
        amountOriginal: p.amountOriginal || "0",
        amountRmb:
          p.paymentCurrency === "RMB" ? parseAmount(p.amountOriginal).toFixed(2) : undefined,
        amountEgp: p.paymentCurrency === "RMB" ? "0" : p.amountEgp || "0",
        direction: 'payment',
        isAllocation: false,
        userName,
        paymentId: p.id,
        attachmentUrl: p.attachmentUrl ?? null,
        attachmentOriginalName: p.attachmentOriginalName ?? null,
      });
    }

    const paymentById = new Map(allPayments.map((payment) => [payment.id, payment]));
    let filteredAllocations = allAllocations.filter((allocation) => {
      if (!baseFilteredShipmentIds.has(allocation.shipmentId)) return false;
      if (
        allocation.component !== PURCHASE_COST_COMPONENT ||
        allocation.currency !== "RMB"
      ) {
        return false;
      }
      if (filters?.partyType && filters.partyId) {
        if (filters.partyType !== "supplier") return false;
        return allocation.supplierId === filters.partyId;
      }
      return filteredShipmentIds.has(allocation.shipmentId);
    });

    if (filters?.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filteredAllocations = filteredAllocations.filter((allocation) => {
        const payment = paymentById.get(allocation.paymentId);
        if (!payment?.paymentDate) return false;
        return new Date(payment.paymentDate) >= fromDate;
      });
    }

    if (filters?.dateTo) {
      const toDate = new Date(filters.dateTo);
      filteredAllocations = filteredAllocations.filter((allocation) => {
        const payment = paymentById.get(allocation.paymentId);
        if (!payment?.paymentDate) return false;
        return new Date(payment.paymentDate) <= toDate;
      });
    }

    if (filters?.costComponent) {
      filteredAllocations = filteredAllocations.filter(
        () => filters.costComponent === PURCHASE_COST_COMPONENT,
      );
    }

    for (const allocation of filteredAllocations) {
      const shipment = allShipments.find((s) => s.id === allocation.shipmentId);
      const payment = paymentById.get(allocation.paymentId);
      if (!shipment || !payment) continue;

      if (filters?.movementType && filters.movementType !== "all") {
        if (filters.movementType !== "تسوية/توزيع تكلفة") {
          continue;
        }
      }

      const partyName = supplierMap.get(allocation.supplierId);
      const userName = payment.createdByUserId
        ? userMap.get(payment.createdByUserId)
        : undefined;

      movements.push({
        date: payment.paymentDate,
        shipmentCode: shipment.shipmentCode,
        shipmentName: shipment.shipmentName,
        partyName,
        partyId: allocation.supplierId,
        partyType: "supplier",
        movementType: "تسوية/توزيع تكلفة",
        costComponent: PURCHASE_COST_COMPONENT,
        paymentMethod: payment.paymentMethod,
        originalCurrency: "RMB",
        amountOriginal: parseAmount(allocation.allocatedAmount).toFixed(2),
        amountRmb: parseAmount(allocation.allocatedAmount).toFixed(2),
        amountEgp: "0",
        direction: 'payment',
        isAllocation: true,
        userName,
        paymentId: allocation.paymentId,
        attachmentUrl: payment.attachmentUrl ?? null,
        attachmentOriginalName: payment.attachmentOriginalName ?? null,
      });
    }

    movements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const includeAllocationsInTotals =
      filters?.movementType === "تسوية/توزيع تكلفة";

    const costTotals = getCurrencyTotals(
      movements
        .filter((m) => m.direction === "cost")
        .map((m) => ({
          originalCurrency: m.originalCurrency,
          amountEgp: m.amountEgp,
          amountRmb: m.amountRmb,
          amountOriginal: m.amountOriginal,
        })),
    );

    const paymentTotals = getCurrencyTotals(
      movements
        .filter(
          (m) =>
            m.direction === "payment" &&
            (includeAllocationsInTotals || !m.isAllocation),
        )
        .map((m) => ({
          originalCurrency: m.originalCurrency,
          amountEgp: m.amountEgp,
          amountRmb: m.amountRmb,
          amountOriginal: m.amountOriginal,
        })),
    );

    const totalCostEgp = costTotals.sumEgp;
    const totalPaidEgp = paymentTotals.sumEgp;
    const totalCostRmb = costTotals.sumRmb;
    const totalPaidRmb = paymentTotals.sumRmb;

    return {
      movements,
      totalCostEgp: totalCostEgp.toFixed(2),
      totalPaidEgp: totalPaidEgp.toFixed(2),
      netMovement: (totalCostEgp - totalPaidEgp).toFixed(2),
      totalCostRmb: totalCostRmb.toFixed(2),
      totalPaidRmb: totalPaidRmb.toFixed(2),
      netMovementRmb: (totalCostRmb - totalPaidRmb).toFixed(2),
    };
  }

  // Payment Methods Report
  async getPaymentMethodsReport(filters?: {
    dateFrom?: string;
    dateTo?: string;
  }) {
    let allPayments = await this.getAllPayments();

    if (filters?.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      allPayments = allPayments.filter(p => new Date(p.paymentDate) >= fromDate);
    }

    if (filters?.dateTo) {
      const toDate = new Date(filters.dateTo);
      allPayments = allPayments.filter(p => new Date(p.paymentDate) <= toDate);
    }

    const methodStats = new Map<
      string,
      { count: number; totalEgp: number; totalRmb: number }
    >();

    for (const p of allPayments) {
      const method = p.paymentMethod || "أخرى";
      const current = methodStats.get(method) || {
        count: 0,
        totalEgp: 0,
        totalRmb: 0,
      };
      current.count += 1;
      const { sumEgp, sumRmb } = getCurrencyTotals([
        {
          paymentCurrency: p.paymentCurrency,
          amountEgp: p.amountEgp,
          amountOriginal: p.amountOriginal,
        },
      ]);
      current.totalEgp += sumEgp;
      current.totalRmb += sumRmb;
      methodStats.set(method, current);
    }

    return Array.from(methodStats.entries()).map(([method, stats]) => ({
      paymentMethod: method,
      paymentCount: stats.count,
      totalAmountEgp: stats.totalEgp.toFixed(2),
      totalAmountRmb: stats.totalRmb.toFixed(2),
    }));
  }

  // ============================================================
  // LOCAL TRADE MODULE METHODS
  // ============================================================

  // Parties
  async getAllParties(filters?: { type?: string; isActive?: boolean }): Promise<Party[]> {
    let query = db.select().from(parties);
    const conditions: any[] = [];

    if (filters?.type) {
      conditions.push(eq(parties.type, filters.type));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(parties.isActive, filters.isActive));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return query.orderBy(desc(parties.createdAt));
  }

  async getParty(id: number): Promise<Party | undefined> {
    const [party] = await db.select().from(parties).where(eq(parties.id, id));
    return party;
  }

  async createParty(data: InsertParty): Promise<Party> {
    const [party] = await db.insert(parties).values(data).returning();
    return party;
  }

  async updateParty(id: number, data: Partial<InsertParty>): Promise<Party | undefined> {
    const [party] = await db
      .update(parties)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(parties.id, id))
      .returning();
    return party;
  }

  async getPartyBalance(partyId: number, seasonId?: number): Promise<{ balanceEgp: string; direction: 'debit' | 'credit' | 'zero' }> {
    const conditions = [eq(partyLedgerEntries.partyId, partyId)];
    if (seasonId !== undefined) {
      conditions.push(eq(partyLedgerEntries.seasonId, seasonId));
    }

    const entries = await db
      .select()
      .from(partyLedgerEntries)
      .where(and(...conditions));
    const totalBalance = entries.reduce((sum, entry) => sum + parseAmount(entry.amountEgp), 0);
    
    let direction: 'debit' | 'credit' | 'zero' = 'zero';
    if (totalBalance > 0) {
      direction = 'debit';
    } else if (totalBalance < 0) {
      direction = 'credit';
    }

    return {
      balanceEgp: Math.abs(totalBalance).toFixed(2),
      direction,
    };
  }

  async getPartyProfile(partyId: number): Promise<{
    party: Party;
    currentSeason: PartySeason | null;
    balance: { balanceEgp: string; direction: 'debit' | 'credit' | 'zero' };
    totalInvoices: number;
    totalPayments: number;
    openReturnCases: number;
  } | undefined> {
    const party = await this.getParty(partyId);
    if (!party) return undefined;

    const currentSeason = await this.getCurrentSeason(partyId) ?? null;
    const balance = await this.getPartyBalance(partyId, currentSeason?.id);

    const invoices = await db.select().from(localInvoices).where(eq(localInvoices.partyId, partyId));
    const payments = await db.select().from(localPayments).where(eq(localPayments.partyId, partyId));
    const openCases = await db.select().from(returnCases).where(
      and(
        eq(returnCases.partyId, partyId),
        eq(returnCases.status, 'under_inspection')
      )
    );

    return {
      party,
      currentSeason,
      balance,
      totalInvoices: invoices.length,
      totalPayments: payments.length,
      openReturnCases: openCases.length,
    };
  }

  // Party Seasons
  async getPartySeasons(partyId: number): Promise<PartySeason[]> {
    return db.select().from(partySeasons).where(eq(partySeasons.partyId, partyId)).orderBy(desc(partySeasons.startedAt));
  }

  async getCurrentSeason(partyId: number): Promise<PartySeason | undefined> {
    const [season] = await db
      .select()
      .from(partySeasons)
      .where(and(eq(partySeasons.partyId, partyId), eq(partySeasons.isCurrent, true)));
    return season;
  }

  async createSeason(data: InsertPartySeason): Promise<PartySeason> {
    const [season] = await db.insert(partySeasons).values(data).returning();
    return season;
  }

  async closeSeason(seasonId: number): Promise<PartySeason | undefined> {
    const [season] = await db
      .update(partySeasons)
      .set({ isCurrent: false, endedAt: new Date() })
      .where(eq(partySeasons.id, seasonId))
      .returning();
    return season;
  }

  // Local Invoices
  async getAllLocalInvoices(filters?: { partyId?: number; invoiceKind?: string; status?: string }): Promise<LocalInvoice[]> {
    let query = db.select().from(localInvoices);
    const conditions: any[] = [];

    if (filters?.partyId) {
      conditions.push(eq(localInvoices.partyId, filters.partyId));
    }
    if (filters?.invoiceKind) {
      conditions.push(eq(localInvoices.invoiceKind, filters.invoiceKind));
    }
    if (filters?.status) {
      conditions.push(eq(localInvoices.status, filters.status));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return query.orderBy(desc(localInvoices.createdAt));
  }

  async getLocalInvoice(id: number): Promise<{ invoice: LocalInvoice; lines: LocalInvoiceLine[] } | undefined> {
    const [invoice] = await db.select().from(localInvoices).where(eq(localInvoices.id, id));
    if (!invoice) return undefined;

    const lines = await this.getInvoiceLines(id);
    return { invoice, lines };
  }

  async createLocalInvoice(data: InsertLocalInvoice, lines: InsertLocalInvoiceLine[]): Promise<LocalInvoice> {
    // Validate dozen (دستة) unit quantities as safety check
    for (const line of lines) {
      if (line.unitMode === 'dozen' && (line.totalPieces || 0) % 12 !== 0) {
        throw new Error(
          `الكمية ${line.totalPieces} لا يمكن تقسيمها على 12. يجب أن تكون الكمية بالدستة قابلة للقسمة على 12.`
        );
      }
    }
    
    return db.transaction(async (tx) => {
      const [invoice] = await tx.insert(localInvoices).values(data).returning();
      
      if (lines.length > 0) {
        const linesWithInvoiceId = lines.map(line => ({ ...line, invoiceId: invoice.id }));
        await tx.insert(localInvoiceLines).values(linesWithInvoiceId);
      }

      const invoiceTotal = parseAmount(data.totalEgp);
      if (invoiceTotal !== 0) {
        let entryType: string;
        let amountEgp: number;
        let description: string;
        
        if (data.invoiceKind === 'purchase') {
          entryType = 'debit';
          amountEgp = invoiceTotal;
          description = `فاتورة شراء رقم ${invoice.referenceNumber}`;
        } else if (data.invoiceKind === 'return') {
          entryType = 'credit';
          amountEgp = -invoiceTotal;
          description = `مرتجعات رقم ${invoice.referenceNumber}`;
        } else if (data.invoiceKind === 'sale') {
          entryType = 'invoice';
          amountEgp = invoiceTotal;
          description = `فاتورة بيع رقم ${invoice.referenceNumber}`;
        } else {
          entryType = 'invoice';
          amountEgp = 0;
          description = `فاتورة رقم ${invoice.referenceNumber}`;
        }

        await tx.insert(partyLedgerEntries).values({
          partyId: data.partyId,
          seasonId: data.seasonId,
          entryType,
          sourceType: 'local_invoice',
          sourceId: invoice.id,
          amountEgp: amountEgp.toString(),
          note: description,
          createdByUserId: data.createdByUserId,
        });
      }

      return invoice;
    });
  }

  async updateLocalInvoice(id: number, data: Partial<InsertLocalInvoice>): Promise<LocalInvoice | undefined> {
    const [invoice] = await db
      .update(localInvoices)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(localInvoices.id, id))
      .returning();
    return invoice;
  }

  async generateInvoiceReferenceNumber(kind: string): Promise<string> {
    const prefixMap: Record<string, string> = {
      purchase: 'PI',
      sale: 'SI',
      settlement: 'SET',
      return: 'RET',
    };
    const prefix = prefixMap[kind] || 'INV';
    
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    
    const existingInvoices = await db
      .select()
      .from(localInvoices)
      .where(
        and(
          eq(localInvoices.invoiceKind, kind),
          sql`${localInvoices.createdAt} >= ${todayStart}`,
          sql`${localInvoices.createdAt} < ${todayEnd}`
        )
      );
    
    const sequence = (existingInvoices.length + 1).toString().padStart(4, '0');
    return `${prefix}-${dateStr}-${sequence}`;
  }

  // Local Invoice Lines
  async getInvoiceLines(invoiceId: number): Promise<LocalInvoiceLine[]> {
    return db.select().from(localInvoiceLines).where(eq(localInvoiceLines.invoiceId, invoiceId));
  }

  async createInvoiceLine(data: InsertLocalInvoiceLine): Promise<LocalInvoiceLine> {
    const [line] = await db.insert(localInvoiceLines).values(data).returning();
    return line;
  }

  async updateInvoiceLine(id: number, data: Partial<InsertLocalInvoiceLine>): Promise<LocalInvoiceLine | undefined> {
    const [line] = await db
      .update(localInvoiceLines)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(localInvoiceLines.id, id))
      .returning();
    return line;
  }

  async deleteInvoiceLine(id: number): Promise<boolean> {
    const result = await db.delete(localInvoiceLines).where(eq(localInvoiceLines.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Local Receipts
  async createReceipt(data: InsertLocalReceipt): Promise<LocalReceipt> {
    const [receipt] = await db.insert(localReceipts).values(data).returning();
    return receipt;
  }

  async receiveInvoice(invoiceId: number, userId: string): Promise<{ receipt: LocalReceipt; movementsCreated: number }> {
    const invoiceData = await this.getLocalInvoice(invoiceId);
    if (!invoiceData) {
      throw new Error('Invoice not found');
    }

    const { invoice, lines } = invoiceData;

    await this.updateLocalInvoice(invoiceId, { status: 'received' });

    const receipt = await this.createReceipt({
      invoiceId,
      receivingStatus: 'received',
      receivedAt: new Date(),
      receivedByUserId: userId,
    });

    let movementsCreated = 0;
    const movementDate = new Date().toISOString().slice(0, 10);

    for (const line of lines) {
      if (invoice.invoiceKind === 'purchase') {
        await this.createInventoryMovement({
          productId: line.productTypeId,
          totalPiecesIn: line.totalPieces,
          unitCostEgp: line.unitPriceEgp,
          totalCostEgp: line.lineTotalEgp,
          movementDate,
        });
        movementsCreated++;
      }
    }

    return { receipt, movementsCreated };
  }

  // Party Ledger Entries
  async getPartyLedger(partyId: number, seasonId?: number): Promise<PartyLedgerEntry[]> {
    const conditions = [eq(partyLedgerEntries.partyId, partyId)];
    if (seasonId !== undefined) {
      conditions.push(eq(partyLedgerEntries.seasonId, seasonId));
    }

    return db
      .select()
      .from(partyLedgerEntries)
      .where(and(...conditions))
      .orderBy(asc(partyLedgerEntries.createdAt));
  }

  async createLedgerEntry(data: InsertPartyLedgerEntry): Promise<PartyLedgerEntry> {
    const [entry] = await db.insert(partyLedgerEntries).values(data).returning();
    return entry;
  }

  // Local Payments
  async getLocalPayments(filters?: { partyId?: number }): Promise<LocalPayment[]> {
    let query = db.select().from(localPayments);
    
    if (filters?.partyId) {
      query = query.where(eq(localPayments.partyId, filters.partyId)) as any;
    }

    return query.orderBy(desc(localPayments.createdAt));
  }

  async createLocalPayment(data: InsertLocalPayment): Promise<LocalPayment> {
    return db.transaction(async (tx) => {
      const [payment] = await tx.insert(localPayments).values(data).returning();
      
      const paymentAmount = parseAmount(data.amountEgp);
      if (paymentAmount !== 0) {
        const description = `سداد مبلغ ${paymentAmount.toFixed(2)} ج.م`;
        
        await tx.insert(partyLedgerEntries).values({
          partyId: data.partyId,
          seasonId: data.seasonId,
          entryType: 'credit',
          sourceType: 'local_payment',
          sourceId: payment.id,
          amountEgp: (-paymentAmount).toString(),
          note: description,
          createdByUserId: data.createdByUserId,
        });
      }

      return payment;
    });
  }

  // Return Cases
  async getReturnCases(filters?: { partyId?: number; status?: string }): Promise<ReturnCase[]> {
    let query = db.select().from(returnCases);
    const conditions: any[] = [];

    if (filters?.partyId) {
      conditions.push(eq(returnCases.partyId, filters.partyId));
    }
    if (filters?.status) {
      conditions.push(eq(returnCases.status, filters.status));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return query.orderBy(desc(returnCases.createdAt));
  }

  async getReturnCase(id: number): Promise<ReturnCase | undefined> {
    const [returnCase] = await db.select().from(returnCases).where(eq(returnCases.id, id));
    return returnCase;
  }

  async createReturnCase(data: InsertReturnCase): Promise<ReturnCase> {
    const [returnCase] = await db.insert(returnCases).values(data).returning();
    return returnCase;
  }

  async resolveReturnCase(
    id: number, 
    data: { resolution: string; amountEgp: number; pieces: number; cartons: number; resolutionNote: string | null }, 
    userId: string
  ): Promise<ReturnCase | undefined> {
    return db.transaction(async (tx) => {
      const [existingCase] = await tx
        .select()
        .from(returnCases)
        .where(eq(returnCases.id, id));
      
      if (!existingCase) return undefined;
      
      const { resolution, amountEgp, pieces, cartons, resolutionNote } = data;
      const quantity = pieces || existingCase.pieces || 0;
      
      const [returnCase] = await tx
        .update(returnCases)
        .set({
          status: 'resolved',
          resolution,
          amountEgp: amountEgp.toString(),
          pieces: pieces || existingCase.pieces,
          cartons: cartons || existingCase.cartons,
          notes: resolutionNote || existingCase.notes,
          resolvedAt: new Date(),
          resolvedByUserId: userId,
          updatedAt: new Date(),
        })
        .where(eq(returnCases.id, id))
        .returning();
      
      if (!returnCase) return undefined;

      const partyType = existingCase.partyTypeSnapshot;
      let ledgerAmount = 0;
      let ledgerNote = '';
      let entryType: 'credit' | 'debit' | 'adjustment' = 'adjustment';

      switch (resolution) {
        case 'accepted_return':
          if (partyType === 'customer') {
            ledgerAmount = -amountEgp;
            entryType = 'credit';
          } else {
            ledgerAmount = -amountEgp;
            entryType = 'debit';
          }
          ledgerNote = `مرتجع مقبول - ${quantity} قطعة`;
          break;
          
        case 'exchange':
          ledgerAmount = 0;
          entryType = 'adjustment';
          ledgerNote = `استبدال - ${quantity} قطعة`;
          break;
          
        case 'deduct_value':
          ledgerAmount = -amountEgp;
          entryType = 'credit';
          ledgerNote = `خصم قيمة - ${amountEgp.toFixed(2)} ج.م`;
          break;
          
        case 'damaged':
          ledgerAmount = 0;
          entryType = 'adjustment';
          ledgerNote = `شطب تالف - ${quantity} قطعة`;
          break;
      }

      await tx.insert(partyLedgerEntries).values({
        partyId: returnCase.partyId,
        seasonId: returnCase.seasonId,
        entryType,
        sourceType: 'return_case',
        sourceId: returnCase.id,
        amountEgp: ledgerAmount.toString(),
        note: ledgerNote,
        createdByUserId: userId,
      });

      if ((resolution === 'accepted_return' || resolution === 'damaged') && quantity > 0) {
        const today = new Date().toISOString().split('T')[0];
        await tx.insert(inventoryMovements).values({
          shipmentId: null,
          shipmentItemId: null,
          productId: null,
          totalPiecesIn: -quantity,
          unitCostRmb: null,
          unitCostEgp: quantity > 0 ? (amountEgp / quantity).toFixed(4) : "0",
          totalCostEgp: amountEgp.toString(),
          movementDate: today,
        });
      }

      return returnCase;
    });
  }

  async recalculatePartyBalance(partyId: number, seasonId?: number): Promise<{ balanceEgp: string; direction: 'debit' | 'credit' | 'zero' }> {
    const conditions = [eq(partyLedgerEntries.partyId, partyId)];
    if (seasonId !== undefined) {
      conditions.push(eq(partyLedgerEntries.seasonId, seasonId));
    }

    const entries = await db
      .select()
      .from(partyLedgerEntries)
      .where(and(...conditions));
    
    const totalBalance = entries.reduce((sum, entry) => sum + parseAmount(entry.amountEgp), 0);
    
    let direction: 'debit' | 'credit' | 'zero' = 'zero';
    if (totalBalance > 0) {
      direction = 'debit';
    } else if (totalBalance < 0) {
      direction = 'credit';
    }

    return {
      balanceEgp: Math.abs(totalBalance).toFixed(2),
      direction,
    };
  }

  // ============ Party Collections (التحصيل) ============
  
  async getPartyCollections(partyId: number) {
    return await db.select()
      .from(partyCollections)
      .where(eq(partyCollections.partyId, partyId))
      .orderBy(partyCollections.collectionOrder);
  }

  async upsertPartyCollections(partyId: number, collections: Array<{
    collectionOrder: number;
    collectionDate: string;
    amountEgp?: string;
    notes?: string;
  }>) {
    return await db.transaction(async (tx) => {
      const results = [];
      for (const coll of collections) {
        const existing = await tx.select()
          .from(partyCollections)
          .where(and(
            eq(partyCollections.partyId, partyId),
            eq(partyCollections.collectionOrder, coll.collectionOrder)
          ))
          .limit(1);
        
        if (existing.length > 0) {
          const [updated] = await tx.update(partyCollections)
            .set({
              collectionDate: coll.collectionDate,
              amountEgp: coll.amountEgp,
              notes: coll.notes,
              updatedAt: new Date(),
            })
            .where(eq(partyCollections.id, existing[0].id))
            .returning();
          results.push(updated);
        } else {
          const [created] = await tx.insert(partyCollections)
            .values({
              partyId,
              collectionOrder: coll.collectionOrder,
              collectionDate: coll.collectionDate,
              amountEgp: coll.amountEgp,
              notes: coll.notes,
            })
            .returning();
          results.push(created);
        }
      }
      return results;
    });
  }

  async updateCollectionStatus(id: number, status: string, linkedPaymentId?: number) {
    const [result] = await db.update(partyCollections)
      .set({
        status,
        collectedAt: status === 'collected' ? new Date() : null,
        linkedPaymentId: linkedPaymentId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(partyCollections.id, id))
      .returning();
    return result;
  }

  async markCollectionReminderSent(id: number) {
    const [result] = await db.update(partyCollections)
      .set({
        reminderSent: true,
        reminderSentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(partyCollections.id, id))
      .returning();
    return result;
  }

  async deletePartyCollection(id: number) {
    await db.delete(partyCollections).where(eq(partyCollections.id, id));
  }

  async getPartyTimeline(partyId: number) {
    const invoicesData = await db.select()
      .from(localInvoices)
      .where(eq(localInvoices.partyId, partyId));
    
    const paymentsData = await db.select()
      .from(localPayments)
      .where(eq(localPayments.partyId, partyId));
    
    const returnsData = await db.select()
      .from(returnCases)
      .where(eq(returnCases.partyId, partyId));
    
    const collectionsData = await db.select()
      .from(partyCollections)
      .where(eq(partyCollections.partyId, partyId));
    
    const ledgerData = await db.select()
      .from(partyLedgerEntries)
      .where(eq(partyLedgerEntries.partyId, partyId));
    
    const timeline = [
      ...invoicesData.map(inv => ({
        type: 'invoice' as const,
        date: inv.invoiceDate,
        id: inv.id,
        title: inv.invoiceKind === 'purchase' ? 'فاتورة شراء' : inv.invoiceKind === 'sale' ? 'فاتورة بيع' : inv.invoiceKind === 'return' ? 'فاتورة مرتجع' : 'تسوية',
        description: inv.referenceNumber,
        amount: inv.totalEgp,
        status: inv.status,
        referenceNumber: inv.referenceNumber,
      })),
      ...paymentsData.map(pay => ({
        type: 'payment' as const,
        date: pay.paymentDate,
        id: pay.id,
        title: 'سداد',
        description: pay.paymentMethod === 'cash' ? 'نقداً' : pay.paymentMethod,
        amount: pay.amountEgp,
        status: null,
        referenceNumber: null,
      })),
      ...returnsData.map(ret => ({
        type: 'return' as const,
        date: ret.createdAt?.toISOString().split('T')[0] || '',
        id: ret.id,
        title: 'حالة مرتجع',
        description: ret.notes || '',
        amount: ret.amountEgp,
        status: ret.status,
        referenceNumber: null,
      })),
      ...collectionsData.map(coll => ({
        type: 'collection' as const,
        date: coll.collectionDate,
        id: coll.id,
        title: `موعد تحصيل ${coll.collectionOrder}`,
        description: coll.notes || '',
        amount: coll.amountEgp,
        status: coll.status,
        referenceNumber: null,
      })),
    ];
    
    return timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async getPartyProfileSummary(partyId: number, seasonId?: number) {
    let targetSeasonId = seasonId;
    if (!targetSeasonId) {
      const currentSeason = await db.select()
        .from(partySeasons)
        .where(and(
          eq(partySeasons.partyId, partyId),
          eq(partySeasons.isCurrent, true)
        ))
        .limit(1);
      targetSeasonId = currentSeason[0]?.id;
    }

    const party = await db.select().from(parties).where(eq(parties.id, partyId)).limit(1);
    if (!party[0]) throw new Error("Party not found");

    const invoicesResult = await db.select({
      total: sql<string>`COALESCE(SUM(${localInvoices.totalEgp}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(localInvoices)
      .where(and(
        eq(localInvoices.partyId, partyId),
        targetSeasonId ? eq(localInvoices.seasonId, targetSeasonId) : undefined,
        sql`${localInvoices.invoiceKind} IN ('purchase', 'sale')`
      ));

    const paymentsResult = await db.select({
      total: sql<string>`COALESCE(SUM(${localPayments.amountEgp}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(localPayments)
      .where(and(
        eq(localPayments.partyId, partyId),
        targetSeasonId ? eq(localPayments.seasonId, targetSeasonId) : undefined
      ));

    const pendingReturnsResult = await db.select({
      total: sql<string>`COALESCE(SUM(${returnCases.amountEgp}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(returnCases)
      .where(and(
        eq(returnCases.partyId, partyId),
        eq(returnCases.status, "pending")
      ));

    const lastInvoice = await db.select({ date: localInvoices.invoiceDate })
      .from(localInvoices)
      .where(eq(localInvoices.partyId, partyId))
      .orderBy(desc(localInvoices.invoiceDate))
      .limit(1);

    const lastPayment = await db.select({ date: localPayments.paymentDate })
      .from(localPayments)
      .where(eq(localPayments.partyId, partyId))
      .orderBy(desc(localPayments.paymentDate))
      .limit(1);

    const lastCollection = await db.select({ date: partyCollections.collectionDate })
      .from(partyCollections)
      .where(and(
        eq(partyCollections.partyId, partyId),
        eq(partyCollections.status, "collected")
      ))
      .orderBy(desc(partyCollections.collectionDate))
      .limit(1);

    const upcomingCollections = await db.select({ count: sql<number>`COUNT(*)` })
      .from(partyCollections)
      .where(and(
        eq(partyCollections.partyId, partyId),
        eq(partyCollections.status, "pending")
      ));

    const currentBalance = parseFloat(party[0].currentBalanceEgp || "0");

    return {
      party: party[0],
      seasonId: targetSeasonId,
      kpis: {
        totalInvoicesEgp: invoicesResult[0]?.total || "0",
        invoicesCount: invoicesResult[0]?.count || 0,
        totalPaidEgp: paymentsResult[0]?.total || "0",
        paymentsCount: paymentsResult[0]?.count || 0,
        remainingBalanceEgp: Math.max(0, currentBalance).toString(),
        creditBalanceEgp: Math.abs(Math.min(0, currentBalance)).toString(),
        underInspectionEgp: pendingReturnsResult[0]?.total || "0",
        pendingReturnsCount: pendingReturnsResult[0]?.count || 0,
        upcomingCollectionsCount: upcomingCollections[0]?.count || 0,
      },
      lastActivity: {
        lastInvoiceDate: lastInvoice[0]?.date || null,
        lastPaymentDate: lastPayment[0]?.date || null,
        lastCollectionDate: lastCollection[0]?.date || null,
      },
    };
  }

  // Notifications
  async getNotifications(userId: string): Promise<Notification[]> {
    return db.select()
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ))
      .orderBy(desc(notifications.createdAt));
  }

  async createNotification(data: InsertNotification): Promise<Notification> {
    const [notification] = await db.insert(notifications).values(data).returning();
    return notification;
  }

  async markNotificationRead(id: number): Promise<Notification | undefined> {
    const [notification] = await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return notification;
  }

  async checkAndCreateCollectionReminders(userId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const todayStart = new Date(today);
    
    // Get collections due today or overdue
    const dueCollections = await db.select({
      collection: partyCollections,
      party: parties,
    })
      .from(partyCollections)
      .innerJoin(parties, eq(partyCollections.partyId, parties.id))
      .where(and(
        eq(partyCollections.status, "pending"),
        lte(partyCollections.collectionDate, today)
      ));
    
    for (const { collection, party } of dueCollections) {
      // Check if notification already exists for today for this collection
      const existing = await db.select().from(notifications)
        .where(and(
          eq(notifications.referenceType, "collection"),
          eq(notifications.referenceId, collection.id),
          gte(notifications.createdAt, todayStart)
        ))
        .limit(1);
      
      if (existing.length === 0) {
        const isOverdue = collection.collectionDate < today;
        await db.insert(notifications).values({
          userId,
          type: isOverdue ? "collection_overdue" : "collection_due",
          title: isOverdue ? "تحصيل متأخر" : "موعد تحصيل اليوم",
          message: `تحصيل بقيمة ${collection.amountEgp || '0'} ج.م من ${party.name}`,
          referenceType: "collection",
          referenceId: collection.id,
        });
      }
    }
  }
}

export const storage = new DatabaseStorage();
