import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOverpaymentMessage,
  deriveAmountEgp,
  deriveAmountInComponentCurrency,
  getComponentCurrency,
  validateRemainingAllowance,
} from "./paymentValidation";

test("deriveAmountEgp returns original value for EGP payments", () => {
  const amount = deriveAmountEgp({
    paymentCurrency: "EGP",
    amountOriginal: "250.50",
    exchangeRate: null,
  });

  assert.equal(amount, 250.5);
});

test("deriveAmountEgp converts RMB amounts using the provided rate", () => {
  const amount = deriveAmountEgp({
    paymentCurrency: "RMB",
    amountOriginal: "100",
    exchangeRate: "5",
  });

  assert.equal(amount, 500);
});

test("getComponentCurrency maps components to their currency", () => {
  assert.equal(getComponentCurrency("تكلفة البضاعة"), "RMB");
  assert.equal(getComponentCurrency("الشحن"), "RMB");
  assert.equal(getComponentCurrency("العمولة"), "RMB");
  assert.equal(getComponentCurrency("الجمرك"), "EGP");
  assert.equal(getComponentCurrency("التخريج"), "EGP");
});

test("deriveAmountInComponentCurrency keeps RMB amounts for RMB components", () => {
  const amount = deriveAmountInComponentCurrency({
    componentCurrency: "RMB",
    paymentCurrency: "RMB",
    amountOriginal: "100",
    exchangeRate: "7.5",
  });

  assert.equal(amount, 100);
});

test("deriveAmountInComponentCurrency converts EGP payments to RMB for RMB components", () => {
  const amount = deriveAmountInComponentCurrency({
    componentCurrency: "RMB",
    paymentCurrency: "EGP",
    amountOriginal: "750",
    exchangeRate: "7.5",
  });

  assert.equal(amount, 100);
});

test("deriveAmountInComponentCurrency uses EGP amount for EGP components", () => {
  const amount = deriveAmountInComponentCurrency({
    componentCurrency: "EGP",
    paymentCurrency: "EGP",
    amountOriginal: "300",
    exchangeRate: null,
  });

  assert.equal(amount, 300);
});

test("validateRemainingAllowance blocks amounts that exceed the remaining allowed value", () => {
  const validation = validateRemainingAllowance({
    remainingAllowed: 500,
    attemptedAmount: 600,
    formatter: (value) => value.toFixed(2),
  });

  assert.equal(validation.allowed, false);
  assert.equal(validation.message, buildOverpaymentMessage(500, (value) => value.toFixed(2)));
});

test("validateRemainingAllowance passes when amount is within the remaining allowed value", () => {
  const validation = validateRemainingAllowance({
    remainingAllowed: 500,
    attemptedAmount: 400,
  });

  assert.equal(validation.allowed, true);
  assert.equal(validation.message, undefined);
});

test("validateRemainingAllowance uses the provided currency label in the message", () => {
  const validation = validateRemainingAllowance({
    remainingAllowed: 100,
    attemptedAmount: 150,
    currencyLabel: "¥",
  });

  assert.equal(validation.allowed, false);
  assert.ok(validation.message?.includes("¥"));
});
