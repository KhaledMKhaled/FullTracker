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

export function buildOverpaymentMessage(
  remainingAllowedEgp: number,
  formatter?: (value: number) => string,
): string {
  const formattedValue = formatter ? formatter(remainingAllowedEgp) : remainingAllowedEgp.toFixed(2);
  return `لا يمكن دفع هذا المبلغ - الحد المسموح به حاليًا هو ${formattedValue} ج.م`;
}

export function validateRemainingAllowance({
  remainingAllowedEgp,
  attemptedAmountEgp,
  formatter,
}: {
  remainingAllowedEgp?: number;
  attemptedAmountEgp: number;
  formatter?: (value: number) => string;
}): { allowed: boolean; message?: string } {
  if (remainingAllowedEgp === undefined || !Number.isFinite(attemptedAmountEgp)) {
    return { allowed: true };
  }

  if (attemptedAmountEgp > remainingAllowedEgp + 0.0001) {
    return {
      allowed: false,
      message: buildOverpaymentMessage(remainingAllowedEgp, formatter),
    };
  }

  return { allowed: true };
}
