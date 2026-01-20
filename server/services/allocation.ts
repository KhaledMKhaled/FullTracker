import { roundAmount } from "./currency";
import { parseAmountOrZero } from "./paymentCalculations";

export type SupplierGoodsTotal = {
  supplierId: number;
  goodsTotal: number;
  goodsPaid: number;
  outstanding: number;
};

export type SupplierGoodsAllocation = {
  supplierId: number;
  allocatedAmount: number;
};

export class SupplierAllocationError extends Error {
  details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.details = details;
  }
}

export const buildSupplierGoodsTotals = (options: {
  items: Array<{ supplierId: number | null; totalPurchaseCostRmb?: unknown }>;
  priorAllocations?: Array<{ supplierId: number; allocatedAmount?: unknown }>;
}): {
  supplierTotals: SupplierGoodsTotal[];
  shipmentGoodsTotal: number;
  totalOutstanding: number;
} => {
  const supplierGoodsMap = new Map<number, number>();

  for (const item of options.items) {
    if (!item.supplierId) continue;
    const current = supplierGoodsMap.get(item.supplierId) ?? 0;
    supplierGoodsMap.set(
      item.supplierId,
      current + parseAmountOrZero(item.totalPurchaseCostRmb),
    );
  }

  const paidMap = new Map<number, number>();
  for (const allocation of options.priorAllocations ?? []) {
    const current = paidMap.get(allocation.supplierId) ?? 0;
    paidMap.set(
      allocation.supplierId,
      current + parseAmountOrZero(allocation.allocatedAmount),
    );
  }

  const supplierTotals: SupplierGoodsTotal[] = Array.from(
    supplierGoodsMap.entries(),
  ).map(([supplierId, goodsTotal]) => {
    const goodsPaid = paidMap.get(supplierId) ?? 0;
    const outstanding = roundAmount(Math.max(0, goodsTotal - goodsPaid), 2);
    return {
      supplierId,
      goodsTotal: roundAmount(goodsTotal, 2),
      goodsPaid: roundAmount(goodsPaid, 2),
      outstanding,
    };
  });

  const shipmentGoodsTotal = roundAmount(
    supplierTotals.reduce((sum, supplier) => sum + supplier.goodsTotal, 0),
    2,
  );
  const totalOutstanding = roundAmount(
    supplierTotals.reduce((sum, supplier) => sum + supplier.outstanding, 0),
    2,
  );

  return { supplierTotals, shipmentGoodsTotal, totalOutstanding };
};

const adjustRemainder = (
  roundedShares: Map<number, number>,
  rawShares: Map<number, number>,
  delta: number,
): void => {
  if (Math.abs(delta) < 0.01) return;

  const candidates = Array.from(rawShares.entries()).sort((a, b) => b[1] - a[1]);
  const targetSupplierId = candidates[0]?.[0];
  if (targetSupplierId === undefined) return;

  const current = roundedShares.get(targetSupplierId) ?? 0;
  roundedShares.set(targetSupplierId, roundAmount(current + delta, 2));
};

export const allocateShipmentGoodsPayment = (options: {
  paymentAmount: number;
  items: Array<{ supplierId: number | null; totalPurchaseCostRmb?: unknown }>;
  priorAllocations?: Array<{ supplierId: number; allocatedAmount?: unknown }>;
}): {
  allocations: SupplierGoodsAllocation[];
  supplierTotals: SupplierGoodsTotal[];
  shipmentGoodsTotal: number;
  totalOutstanding: number;
} => {
  const { supplierTotals, shipmentGoodsTotal, totalOutstanding } =
    buildSupplierGoodsTotals({
      items: options.items,
      priorAllocations: options.priorAllocations,
    });

  if (shipmentGoodsTotal <= 0) {
    throw new SupplierAllocationError(
      "لا يمكن توزيع المدفوعات لأن إجمالي البضاعة في هذه الشحنة يساوي صفر.",
      { shipmentGoodsTotal },
    );
  }

  const paymentAmount = roundAmount(options.paymentAmount, 2);

  if (paymentAmount - totalOutstanding > 0.0001) {
    throw new SupplierAllocationError(
      "مبلغ التوزيع أكبر من المتبقي على الموردين في هذه الشحنة.",
      {
        paymentAmount,
        totalOutstanding,
        shipmentGoodsTotal,
      },
    );
  }

  const remainingOutstanding = new Map<number, number>();
  supplierTotals.forEach((supplier) => {
    remainingOutstanding.set(supplier.supplierId, supplier.outstanding);
  });

  const allocations = new Map<number, number>();
  let remainingPayment = paymentAmount;

  let eligibleSuppliers = supplierTotals.filter((supplier) => supplier.outstanding > 0);

  while (remainingPayment > 0.0001 && eligibleSuppliers.length > 0) {
    const basisTotal = eligibleSuppliers.reduce(
      (sum, supplier) => sum + supplier.goodsTotal,
      0,
    );

    if (basisTotal <= 0) break;

    const rawShares = new Map<number, number>();
    const roundedShares = new Map<number, number>();

    for (const supplier of eligibleSuppliers) {
      const rawShare = (remainingPayment * supplier.goodsTotal) / basisTotal;
      rawShares.set(supplier.supplierId, rawShare);
      roundedShares.set(supplier.supplierId, roundAmount(rawShare, 2));
    }

    const sumRounded = roundAmount(
      Array.from(roundedShares.values()).reduce((sum, value) => sum + value, 0),
      2,
    );
    const delta = roundAmount(remainingPayment - sumRounded, 2);
    adjustRemainder(roundedShares, rawShares, delta);

    let allocatedThisRound = 0;

    for (const supplier of eligibleSuppliers) {
      const desired = roundedShares.get(supplier.supplierId) ?? 0;
      if (desired <= 0) continue;

      const remainingSupplier = remainingOutstanding.get(supplier.supplierId) ?? 0;
      if (remainingSupplier <= 0) continue;

      const allocation = Math.min(desired, remainingSupplier);
      if (allocation <= 0) continue;

      allocations.set(
        supplier.supplierId,
        roundAmount((allocations.get(supplier.supplierId) ?? 0) + allocation, 2),
      );
      remainingOutstanding.set(
        supplier.supplierId,
        roundAmount(remainingSupplier - allocation, 2),
      );
      allocatedThisRound = roundAmount(allocatedThisRound + allocation, 2);
    }

    if (allocatedThisRound <= 0) break;

    remainingPayment = roundAmount(remainingPayment - allocatedThisRound, 2);
    eligibleSuppliers = eligibleSuppliers.filter(
      (supplier) => (remainingOutstanding.get(supplier.supplierId) ?? 0) > 0,
    );
  }

  const allocationResults = Array.from(allocations.entries())
    .map(([supplierId, allocatedAmount]) => ({
      supplierId,
      allocatedAmount: roundAmount(allocatedAmount, 2),
    }))
    .filter((allocation) => allocation.allocatedAmount > 0);

  return {
    allocations: allocationResults,
    supplierTotals,
    shipmentGoodsTotal,
    totalOutstanding,
  };
};
