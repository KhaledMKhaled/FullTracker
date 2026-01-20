import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOverpaymentMessage,
  deriveAmountEgp,
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

test("validateRemainingAllowance blocks amounts that exceed the remaining allowed value", () => {
  const validation = validateRemainingAllowance({
    remainingAllowedEgp: 500,
    attemptedAmountEgp: 600,
    formatter: (value) => value.toFixed(2),
  });

  assert.equal(validation.allowed, false);
  assert.equal(validation.message, buildOverpaymentMessage(500, (value) => value.toFixed(2)));
});

test("validateRemainingAllowance passes when amount is within the remaining allowed value", () => {
  const validation = validateRemainingAllowance({
    remainingAllowedEgp: 500,
    attemptedAmountEgp: 400,
  });

  assert.equal(validation.allowed, true);
  assert.equal(validation.message, undefined);
});
