import assert from "node:assert/strict";
import test from "node:test";
import {
  convertRmbToEgp,
  convertUsdToRmb,
  normalizePaymentAmounts,
} from "../services/currency";

test("convertRmbToEgp converts and rounds to 2 decimals", () => {
  const result = convertRmbToEgp(100, 7.1234);
  assert.equal(result, 712.34);
});

test("convertUsdToRmb converts and rounds to 2 decimals", () => {
  const result = convertUsdToRmb(50, 7.5);
  assert.equal(result, 375);
});

test("normalizePaymentAmounts converts RMB payments using provided rate", () => {
  const { amountEgp, exchangeRateToEgp } = normalizePaymentAmounts({
    paymentCurrency: "RMB",
    amountOriginal: 100,
    exchangeRateToEgp: 7.25,
  });
  assert.equal(amountEgp, 725);
  assert.equal(exchangeRateToEgp, 7.25);
});

test("normalizePaymentAmounts converts RMB payments using DB rate when payload is missing", () => {
  const latestDbRate = 7.4;
  const { amountEgp, exchangeRateToEgp } = normalizePaymentAmounts({
    paymentCurrency: "RMB",
    amountOriginal: 50,
    exchangeRateToEgp: latestDbRate,
  });
  assert.equal(amountEgp, 370);
  assert.equal(exchangeRateToEgp, latestDbRate);
});

test("normalizePaymentAmounts keeps EGP payments untouched", () => {
  const { amountEgp, exchangeRateToEgp } = normalizePaymentAmounts({
    paymentCurrency: "EGP",
    amountOriginal: 500,
  });
  assert.equal(amountEgp, 500);
  assert.equal(exchangeRateToEgp, null);
});

test("normalizePaymentAmounts rejects missing RMB rates", () => {
  assert.throws(
    () =>
      normalizePaymentAmounts({
        paymentCurrency: "RMB",
        amountOriginal: 10,
      }),
    /سعر الصرف غير صالح|يجب توفير سعر صرف صحيح لليوان/,
  );
});
