import type { Shipment, ShipmentItem, ShipmentPayment } from "@shared/schema";
import { roundAmount } from "./currency";

export type PaidByCurrency = Record<
  string,
  { original: number; convertedToEgp: number }
>;

export type CurrencyAllowance = {
  knownTotal: number;
  paid: number;
  remaining: number;
};

export type PaymentSnapshot = {
  knownTotalCost: number;
  totalPaidEgp: number;
  remainingAllowed: number;
  currencyAllowance: {
    rmb: CurrencyAllowance;
    egp: CurrencyAllowance;
  };
  settlement: PaymentSettlement;
  paidByCurrency: PaidByCurrency;
  recoveredTotals?: {
    purchaseCostRmb: number;
    purchaseCostEgp: number;
    customsCostEgp: number;
    takhreegCostEgp: number;
    finalTotalCostEgp: number;
  };
};

export const RMB_COST_COMPONENTS = ["تكلفة البضاعة", "الشحن", "العمولة"] as const;
export const EGP_COST_COMPONENTS = ["الجمرك", "التخريج"] as const;

export type PaymentSettlementStatus =
  | "لم يتم دفع أي مبلغ"
  | "مدفوعة جزئياً"
  | "مسددة بالكامل";

export type PaymentSettlement = {
  status: PaymentSettlementStatus;
  settled: boolean;
  remainingRmb: number;
  remainingEgp: number;
  displayRemainingEgp: number;
};

export const parseAmountOrZero = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : parseFloat(value as any);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const computeKnownTotalCost = (shipment: Shipment): number => {
  const purchaseRate = parseAmountOrZero(shipment.purchaseRmbToEgpRate);
  const purchaseFromRmb =
    purchaseRate > 0
      ? parseAmountOrZero(shipment.purchaseCostRmb) * purchaseRate
      : 0;
  const purchase = parseAmountOrZero(shipment.purchaseCostEgp) || purchaseFromRmb;

  const commissionFromRmb =
    purchaseRate > 0
      ? parseAmountOrZero(shipment.commissionCostRmb) * purchaseRate
      : 0;
  const commission =
    parseAmountOrZero(shipment.commissionCostEgp) || commissionFromRmb;

  const shippingFromRmb =
    purchaseRate > 0
      ? parseAmountOrZero(shipment.shippingCostRmb) * purchaseRate
      : 0;
  const shipping = parseAmountOrZero(shipment.shippingCostEgp) || shippingFromRmb;
  const customs = parseAmountOrZero(shipment.customsCostEgp);
  const takhreeg = parseAmountOrZero(shipment.takhreegCostEgp);

  return roundAmount(purchase + commission + shipping + customs + takhreeg);
};

const computeRecoveredTotals = (
  items: ShipmentItem[],
  rmbToEgpRate?: number | null,
) => {
  if (items.length === 0) return undefined;

  const totalPurchaseCostRmb = items.reduce(
    (sum, item) => sum + parseAmountOrZero(item.totalPurchaseCostRmb),
    0,
  );

  const totalCustomsCostEgp = items.reduce((sum, item) => {
    return (
      sum +
      (item.cartonsCtn || 0) * parseAmountOrZero(item.customsCostPerCartonEgp)
    );
  }, 0);

  const totalTakhreegCostEgp = items.reduce((sum, item) => {
    return (
      sum +
      (item.cartonsCtn || 0) * parseAmountOrZero(item.takhreegCostPerCartonEgp)
    );
  }, 0);

  const effectiveRate =
    rmbToEgpRate && rmbToEgpRate > 0 ? rmbToEgpRate : 7.15;

  const purchaseCostEgp = totalPurchaseCostRmb * effectiveRate;
  const finalTotalCostEgp =
    purchaseCostEgp + totalCustomsCostEgp + totalTakhreegCostEgp;

  if (finalTotalCostEgp <= 0) return undefined;

  return {
    purchaseCostRmb: roundAmount(totalPurchaseCostRmb),
    purchaseCostEgp: roundAmount(purchaseCostEgp),
    customsCostEgp: roundAmount(totalCustomsCostEgp),
    takhreegCostEgp: roundAmount(totalTakhreegCostEgp),
    finalTotalCostEgp: roundAmount(finalTotalCostEgp),
  };
};

export async function calculatePaymentSnapshot(options: {
  shipment: Shipment;
  payments: ShipmentPayment[];
  loadRecoveryData?: () => Promise<{
    items: ShipmentItem[];
    rmbToEgpRate?: number | null;
  }>;
}): Promise<PaymentSnapshot> {
  let knownTotalCost = computeKnownTotalCost(options.shipment);
  let recoveredTotals: PaymentSnapshot["recoveredTotals"];
  let recoveryRate: number | undefined;

  if (knownTotalCost === 0 && options.loadRecoveryData) {
    const { items, rmbToEgpRate } = await options.loadRecoveryData();
    recoveredTotals = computeRecoveredTotals(items, rmbToEgpRate);
    if (recoveredTotals) {
      knownTotalCost = recoveredTotals.finalTotalCostEgp;
      recoveryRate =
        rmbToEgpRate && rmbToEgpRate > 0 ? rmbToEgpRate : 7.15;
    }
  }

  const paidByCurrency: PaidByCurrency = {};

  for (const payment of options.payments) {
    const currency = payment.paymentCurrency;
    if (!paidByCurrency[currency]) {
      paidByCurrency[currency] = { original: 0, convertedToEgp: 0 };
    }

    paidByCurrency[currency].original += parseAmountOrZero(
      payment.amountOriginal,
    );
    paidByCurrency[currency].convertedToEgp += parseAmountOrZero(
      payment.amountEgp,
    );
  }

  const totalPaidEgp = roundAmount(
    options.payments.reduce(
      (sum, payment) => sum + parseAmountOrZero(payment.amountEgp),
      0,
    ),
  );

  const remainingAllowed = roundAmount(
    Math.max(0, knownTotalCost - totalPaidEgp),
  );

  // Per-currency allowances: RMB components (goods, shipping, commission) vs EGP components (customs, takhreeg)
  const goodsTotalRmbGross = parseAmountOrZero(options.shipment.purchaseCostRmb);
  const partialDiscountRmb = parseAmountOrZero(
    options.shipment.partialDiscountRmb,
  );
  const goodsTotalRmb = Math.max(0, goodsTotalRmbGross - partialDiscountRmb);
  let rmbKnownTotal = roundAmount(
    goodsTotalRmb +
      parseAmountOrZero(options.shipment.shippingCostRmb) +
      parseAmountOrZero(options.shipment.commissionCostRmb),
  );
  let egpKnownTotal = roundAmount(
    parseAmountOrZero(options.shipment.customsCostEgp) +
      parseAmountOrZero(options.shipment.takhreegCostEgp),
  );

  // If shipment fields were empty but totals were recovered from items,
  // build the per-currency limits from the recovered totals too.
  if (recoveredTotals) {
    if (rmbKnownTotal === 0) {
      rmbKnownTotal = roundAmount(recoveredTotals.purchaseCostRmb);
    }
    if (egpKnownTotal === 0) {
      egpKnownTotal = roundAmount(
        recoveredTotals.customsCostEgp + recoveredTotals.takhreegCostEgp,
      );
    }
  }

  const shipmentRate =
    parseAmountOrZero(options.shipment.purchaseRmbToEgpRate) ||
    (recoveryRate ?? 0);
  let paidRmbComponents = 0;
  let paidEgpComponents = 0;
  const paidByComponentRmb: Record<string, number> = {};
  const paidByComponentEgp: Record<string, number> = {};

  for (const payment of options.payments) {
    const isRmbComponent = RMB_COST_COMPONENTS.includes(
      payment.costComponent as (typeof RMB_COST_COMPONENTS)[number],
    );

    if (isRmbComponent) {
      let paidAmountRmb = 0;
      if (payment.paymentCurrency === "RMB") {
        paidAmountRmb = parseAmountOrZero(payment.amountOriginal);
      } else {
        const rate =
          parseAmountOrZero(payment.exchangeRateToEgp) ||
          (shipmentRate > 0 ? shipmentRate : 0);
        if (rate > 0) {
          paidAmountRmb = parseAmountOrZero(payment.amountEgp) / rate;
        }
      }
      paidRmbComponents += paidAmountRmb;
      paidByComponentRmb[payment.costComponent] =
        (paidByComponentRmb[payment.costComponent] ?? 0) + paidAmountRmb;
    } else {
      const paidAmountEgp = parseAmountOrZero(payment.amountEgp);
      paidEgpComponents += paidAmountEgp;
      paidByComponentEgp[payment.costComponent] =
        (paidByComponentEgp[payment.costComponent] ?? 0) + paidAmountEgp;
    }
  }

  const currencyAllowance = {
    rmb: {
      knownTotal: rmbKnownTotal,
      paid: roundAmount(paidRmbComponents),
      remaining: roundAmount(Math.max(0, rmbKnownTotal - paidRmbComponents)),
    },
    egp: {
      knownTotal: egpKnownTotal,
      paid: roundAmount(paidEgpComponents),
      remaining: roundAmount(Math.max(0, egpKnownTotal - paidEgpComponents)),
    },
  };

  const componentTotalsRmb: Record<(typeof RMB_COST_COMPONENTS)[number], number> = {
    "تكلفة البضاعة": goodsTotalRmb,
    "الشحن": parseAmountOrZero(options.shipment.shippingCostRmb),
    "العمولة": parseAmountOrZero(options.shipment.commissionCostRmb),
  };
  const componentTotalsEgp: Record<(typeof EGP_COST_COMPONENTS)[number], number> = {
    "الجمرك": parseAmountOrZero(options.shipment.customsCostEgp),
    "التخريج": parseAmountOrZero(options.shipment.takhreegCostEgp),
  };

  if (recoveredTotals) {
    if (componentTotalsRmb["تكلفة البضاعة"] === 0) {
      componentTotalsRmb["تكلفة البضاعة"] = recoveredTotals.purchaseCostRmb;
    }
    if (componentTotalsEgp["الجمرك"] === 0) {
      componentTotalsEgp["الجمرك"] = recoveredTotals.customsCostEgp;
    }
    if (componentTotalsEgp["التخريج"] === 0) {
      componentTotalsEgp["التخريج"] = recoveredTotals.takhreegCostEgp;
    }
  }

  let remainingRmb = roundAmount(
    RMB_COST_COMPONENTS.reduce(
      (sum, component) =>
        sum +
        Math.max(
          0,
          componentTotalsRmb[component] - (paidByComponentRmb[component] ?? 0),
        ),
      0,
    ),
  );
  let remainingEgp = roundAmount(
    EGP_COST_COMPONENTS.reduce(
      (sum, component) =>
        sum +
        Math.max(
          0,
          componentTotalsEgp[component] - (paidByComponentEgp[component] ?? 0),
        ),
      0,
    ),
  );

  const hasKnownCurrencyComponents = rmbKnownTotal > 0 || egpKnownTotal > 0;
  const hasAnyPayment = options.payments.some(
    (payment) =>
      parseAmountOrZero(payment.amountOriginal) > 0.0001 ||
      parseAmountOrZero(payment.amountEgp) > 0.0001,
  );
  const hasConvertedOnlyRmbComponent =
    (parseAmountOrZero(options.shipment.purchaseCostEgp) > 0 &&
      parseAmountOrZero(options.shipment.purchaseCostRmb) <= 0) ||
    (parseAmountOrZero(options.shipment.shippingCostEgp) > 0 &&
      parseAmountOrZero(options.shipment.shippingCostRmb) <= 0) ||
    (parseAmountOrZero(options.shipment.commissionCostEgp) > 0 &&
      parseAmountOrZero(options.shipment.commissionCostRmb) <= 0);
  const hasMissingCostAdjustment =
    parseAmountOrZero(options.shipment.totalMissingCostEgp) > 0.01;
  const componentSettlementIsReliable =
    hasKnownCurrencyComponents &&
    !hasConvertedOnlyRmbComponent &&
    !hasMissingCostAdjustment;

  let settlementStatus: PaymentSettlementStatus;
  if (!componentSettlementIsReliable) {
    const legacyPaidEgp = parseAmountOrZero(options.shipment.totalPaidEgp);
    const legacyRemainingEgp = roundAmount(
      Math.max(
        0,
        parseAmountOrZero(options.shipment.finalTotalCostEgp) - legacyPaidEgp,
      ),
    );
    remainingRmb = 0;
    remainingEgp = legacyRemainingEgp;
    settlementStatus =
      legacyPaidEgp <= 0.0001
        ? "لم يتم دفع أي مبلغ"
        : legacyRemainingEgp <= 0.01
          ? "مسددة بالكامل"
          : "مدفوعة جزئياً";
  } else {
    settlementStatus = !hasAnyPayment
      ? "لم يتم دفع أي مبلغ"
      : remainingRmb <= 0.01 && remainingEgp <= 0.01
        ? "مسددة بالكامل"
        : "مدفوعة جزئياً";
  }

  const settled = settlementStatus === "مسددة بالكامل";
  const displayRate = shipmentRate > 0 ? shipmentRate : 7.15;
  const settlement: PaymentSettlement = {
    status: settlementStatus,
    settled,
    remainingRmb,
    remainingEgp,
    displayRemainingEgp: roundAmount(remainingEgp + remainingRmb * displayRate),
  };

  const roundedPaidByCurrency = Object.fromEntries(
    Object.entries(paidByCurrency).map(([currency, values]) => [
      currency,
      {
        original: roundAmount(values.original),
        convertedToEgp: roundAmount(values.convertedToEgp),
      },
    ]),
  ) as PaidByCurrency;

  return {
    knownTotalCost,
    totalPaidEgp,
    remainingAllowed,
    currencyAllowance,
    settlement,
    paidByCurrency: roundedPaidByCurrency,
    recoveredTotals,
  };
}
