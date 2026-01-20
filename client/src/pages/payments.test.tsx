import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPaymentFormData,
  canAutoAllocatePayment,
  shouldShowAutoAllocationSection,
  shouldUseSupplierGoodsSummary,
} from "./payments-utils";

test("auto allocation visibility rules", () => {
  assert.equal(
    shouldShowAutoAllocationSection({
      costComponent: "تكلفة البضاعة",
      partyType: "shipping_company",
      selectedShipmentId: 12,
      shippingCompanyId: 5,
    }),
    true,
  );

  assert.equal(
    shouldShowAutoAllocationSection({
      costComponent: "الشحن",
      partyType: "shipping_company",
      selectedShipmentId: 12,
      shippingCompanyId: 5,
    }),
    false,
  );

  assert.equal(
    shouldShowAutoAllocationSection({
      costComponent: "تكلفة البضاعة",
      partyType: "supplier",
      selectedShipmentId: 12,
      shippingCompanyId: 5,
    }),
    false,
  );

  assert.equal(
    shouldShowAutoAllocationSection({
      costComponent: "تكلفة البضاعة",
      partyType: "shipping_company",
      selectedShipmentId: null,
      shippingCompanyId: 5,
    }),
    false,
  );

  assert.equal(
    shouldShowAutoAllocationSection({
      costComponent: "تكلفة البضاعة",
      partyType: "shipping_company",
      selectedShipmentId: 12,
      shippingCompanyId: null,
    }),
    false,
  );
});

test("auto allocate toggle requires RMB payments", () => {
  assert.equal(
    canAutoAllocatePayment({
      costComponent: "تكلفة البضاعة",
      partyType: "shipping_company",
      selectedShipmentId: 44,
      paymentCurrency: "RMB",
      shippingCompanyId: 7,
    }),
    true,
  );

  assert.equal(
    canAutoAllocatePayment({
      costComponent: "تكلفة البضاعة",
      partyType: "shipping_company",
      selectedShipmentId: 44,
      paymentCurrency: "EGP",
      shippingCompanyId: 7,
    }),
    false,
  );
});

test("buildPaymentFormData includes autoAllocate when enabled", () => {
  const payload = buildPaymentFormData({
    selectedShipmentId: 1,
    partyType: "shipping_company",
    partyId: 99,
    paymentDate: "2024-02-01",
    paymentCurrency: "RMB",
    amountOriginal: "50",
    exchangeRateToEgp: "10",
    amountEgp: "500.00",
    costComponent: "تكلفة البضاعة",
    paymentMethod: "نقدي",
    cashReceiverName: "",
    referenceNumber: "",
    note: "",
    autoAllocate: true,
    attachment: null,
  });

  const entries = new Map(payload.entries());
  assert.equal(entries.get("autoAllocate"), "true");
});

test("supplier goods summary visibility requires supplier goods selection", () => {
  assert.equal(
    shouldUseSupplierGoodsSummary({
      costComponent: "تكلفة البضاعة",
      partyType: "supplier",
      shipmentId: 55,
      partyId: 12,
    }),
    true,
  );

  assert.equal(
    shouldUseSupplierGoodsSummary({
      costComponent: "تكلفة البضاعة",
      partyType: "shipping_company",
      shipmentId: 55,
      partyId: 12,
    }),
    false,
  );

  assert.equal(
    shouldUseSupplierGoodsSummary({
      costComponent: "الشحن",
      partyType: "supplier",
      shipmentId: 55,
      partyId: 12,
    }),
    false,
  );

  assert.equal(
    shouldUseSupplierGoodsSummary({
      costComponent: "تكلفة البضاعة",
      partyType: "supplier",
      shipmentId: null,
      partyId: 12,
    }),
    false,
  );
});
