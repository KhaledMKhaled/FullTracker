export function roundAmount(value: number, fractionDigits = 2): number {
  return Number.parseFloat(value.toFixed(fractionDigits));
}

export function convertRmbToEgp(amountRmb: number, rate: number): number {
  if (!Number.isFinite(amountRmb) || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("سعر الصرف غير صالح");
  }
  return roundAmount(amountRmb * rate, 2);
}

export function convertUsdToRmb(amountUsd: number, rate: number): number {
  if (!Number.isFinite(amountUsd) || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("سعر الصرف غير صالح");
  }
  return roundAmount(amountUsd * rate, 2);
}

export type PaymentConversionInput = {
  paymentCurrency: string;
  amountOriginal: number;
  exchangeRateToEgp?: number | null;
};

export function normalizePaymentAmounts(input: PaymentConversionInput) {
  const currency = input.paymentCurrency;
  if (currency === "RMB") {
    if (!input.exchangeRateToEgp || input.exchangeRateToEgp <= 0) {
      throw new Error("يجب توفير سعر صرف صحيح لليوان");
    }
    const amountEgp = convertRmbToEgp(
      input.amountOriginal,
      input.exchangeRateToEgp,
    );
    return { amountEgp, exchangeRateToEgp: input.exchangeRateToEgp };
  }

  if (currency === "EGP") {
    return { amountEgp: roundAmount(input.amountOriginal), exchangeRateToEgp: null };
  }

  throw new Error("عملة الدفع غير مدعومة");
}
