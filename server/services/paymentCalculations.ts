import type { Shipment, ShipmentItem, ShipmentPayment } from "@shared/schema";
import { roundAmount } from "./currency";

export type PaidByCurrency = Record<
  string,
  { original: number; convertedToEgp: number }
>;

export type PaymentSnapshot = {
  knownTotalCost: number;
  totalPaidEgp: number;
  remainingAllowed: number;
  paidByCurrency: PaidByCurrency;
  recoveredTotals?: {
    purchaseCostRmb: number;
    purchaseCostEgp: number;
    customsCostEgp: number;
    takhreegCostEgp: number;
    finalTotalCostEgp: number;
  };
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

  if (knownTotalCost === 0 && options.loadRecoveryData) {
    const { items, rmbToEgpRate } = await options.loadRecoveryData();
    recoveredTotals = computeRecoveredTotals(items, rmbToEgpRate);
    if (recoveredTotals) {
      knownTotalCost = recoveredTotals.finalTotalCostEgp;
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
    paidByCurrency: roundedPaidByCurrency,
    recoveredTotals,
  };
}
