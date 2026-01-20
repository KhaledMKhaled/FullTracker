import { parseAmountOrZero } from "./paymentCalculations";

export type CurrencyTotalsInput = {
  paymentCurrency?: string | null;
  originalCurrency?: string | null;
  currency?: string | null;
  amountEgp?: number | string | null;
  amountRmb?: number | string | null;
  amountOriginal?: number | string | null;
  paidEgp?: number | string | null;
  paidRmb?: number | string | null;
  costEgp?: number | string | null;
  costRmb?: number | string | null;
};

const resolveCurrency = (item: CurrencyTotalsInput): string | null => {
  return item.paymentCurrency ?? item.originalCurrency ?? item.currency ?? null;
};

const resolveEgpAmount = (item: CurrencyTotalsInput): number => {
  return parseAmountOrZero(
    item.amountEgp ?? item.paidEgp ?? item.costEgp ?? item.amountOriginal,
  );
};

const resolveRmbAmount = (item: CurrencyTotalsInput): number => {
  return parseAmountOrZero(
    item.amountRmb ?? item.paidRmb ?? item.costRmb ?? item.amountOriginal,
  );
};

export const getCurrencyTotals = (items: CurrencyTotalsInput[]) => {
  let sumEgp = 0;
  let sumRmb = 0;

  for (const item of items) {
    const currency = resolveCurrency(item);
    if (currency === "RMB") {
      sumRmb += resolveRmbAmount(item);
      continue;
    }
    if (currency === "EGP") {
      sumEgp += resolveEgpAmount(item);
      continue;
    }
    sumEgp += resolveEgpAmount(item);
    sumRmb += resolveRmbAmount(item);
  }

  return { sumEgp, sumRmb };
};
