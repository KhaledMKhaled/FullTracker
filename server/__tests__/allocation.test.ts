import assert from "node:assert/strict";
import test from "node:test";

import {
  allocateShipmentGoodsPayment,
  SupplierAllocationError,
} from "../services/allocation";

test("redistributes allocations when a supplier reaches its outstanding cap", () => {
  const result = allocateShipmentGoodsPayment({
    paymentAmount: 50,
    items: [
      { supplierId: 1, totalPurchaseCostRmb: 100 },
      { supplierId: 2, totalPurchaseCostRmb: 100 },
    ],
    priorAllocations: [{ supplierId: 1, allocatedAmount: 90 }],
  });

  const allocationBySupplier = new Map(
    result.allocations.map((allocation) => [
      allocation.supplierId,
      allocation.allocatedAmount,
    ]),
  );

  assert.equal(allocationBySupplier.get(1), 10);
  assert.equal(allocationBySupplier.get(2), 40);
  assert.equal(
    result.allocations.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0),
    50,
  );
});

test("rejects allocations when payment exceeds total outstanding", () => {
  assert.throws(
    () =>
      allocateShipmentGoodsPayment({
        paymentAmount: 200,
        items: [
          { supplierId: 1, totalPurchaseCostRmb: 60 },
          { supplierId: 2, totalPurchaseCostRmb: 50 },
        ],
        priorAllocations: [{ supplierId: 1, allocatedAmount: 0 }],
      }),
    SupplierAllocationError,
  );
});
