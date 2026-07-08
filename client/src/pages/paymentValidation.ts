export function deriveAmountEgp({
  paymentCurrency,
  amountOriginal,
  exchangeRate,
}: {
  paymentCurrency: "EGP" | "RMB" | string;
  amountOriginal: string;
  exchangeRate?: string | null;
}): number {
  const amountOriginalNumber = parseFloat(amountOriginal || "0");

  if (paymentCurrency === "EGP") {
    return amountOriginalNumber;
  }

  const exchangeRateNumber = parseFloat(exchangeRate || "0");

  if (!Number.isFinite(amountOriginalNumber) || !Number.isFinite(exchangeRateNumber)) {
    return NaN;
  }

  return amountOriginalNumber * exchangeRateNumber;
}

export const RMB_COST_COMPONENTS = ["تكلفة البضاعة", "الشحن", "العمولة"] as const;

export function getComponentCurrency(costComponent: string): "RMB" | "EGP" {
  return (RMB_COST_COMPONENTS as readonly string[]).includes(costComponent)
    ? "RMB"
    : "EGP";
}

export function deriveAmountInComponentCurrency({
  componentCurrency,
  paymentCurrency,
  amountOriginal,
  exchangeRate,
}: {
  componentCurrency: "RMB" | "EGP";
  paymentCurrency: "EGP" | "RMB" | string;
  amountOriginal: string;
  exchangeRate?: string | null;
}): number {
  const amountEgp = deriveAmountEgp({ paymentCurrency, amountOriginal, exchangeRate });

  if (componentCurrency === "EGP") {
    return amountEgp;
  }

  if (paymentCurrency === "RMB") {
    const amountOriginalNumber = parseFloat(amountOriginal || "0");
    return Number.isFinite(amountOriginalNumber) ? amountOriginalNumber : NaN;
  }

  const exchangeRateNumber = parseFloat(exchangeRate || "0");
  if (!Number.isFinite(amountEgp) || !(exchangeRateNumber > 0)) {
    return NaN;
  }

  return amountEgp / exchangeRateNumber;
}

export function buildOverpaymentMessage(
  remainingAllowed: number,
  formatter?: (value: number) => string,
  currencyLabel: string = "ج.م",
): string {
  const formattedValue = formatter ? formatter(remainingAllowed) : remainingAllowed.toFixed(2);
  return `لا يمكن دفع هذا المبلغ - الحد المسموح به حاليًا هو ${formattedValue} ${currencyLabel}`;
}

export function validateRemainingAllowance({
  remainingAllowed,
  attemptedAmount,
  formatter,
  currencyLabel,
}: {
  remainingAllowed?: number;
  attemptedAmount: number;
  formatter?: (value: number) => string;
  currencyLabel?: string;
}): { allowed: boolean; message?: string } {
  if (remainingAllowed === undefined || !Number.isFinite(attemptedAmount)) {
    return { allowed: true };
  }

  if (attemptedAmount > remainingAllowed + 0.0001) {
    return {
      allowed: false,
      message: buildOverpaymentMessage(remainingAllowed, formatter, currencyLabel),
    };
  }

  return { allowed: true };
}
