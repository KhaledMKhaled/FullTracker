import assert from "node:assert/strict";
import { test } from "node:test";
import type { Shipment, ShipmentPayment, PaymentAllocation } from "@shared/schema";
import { buildShipmentStatement } from "../services/shipmentStatement";
import { calculatePaymentSnapshot } from "../services/paymentCalculations";

const shipment = {
  id: 5, shipmentCode: "TEST-5", shipmentName: "شحنة اختبار",
  status: "مؤرشفة", purchaseCostRmb: "23000", shippingCostRmb: "500",
  commissionCostRmb: "92", customsCostEgp: "68000", takhreegCostEgp: "750",
  purchaseRmbToEgpRate: "7", partialDiscountRmb: "0",
  totalMissingCostEgp: "3017.83", finalTotalCostEgp: "234042",
  totalPaidEgp: "233894",
} as Shipment;
const payment = (id: number, costComponent: string, amountOriginal: string, paymentCurrency = "RMB"): ShipmentPayment => ({
  id, shipmentId: 5, paymentDate: new Date("2026-01-01"),
  costComponent, amountOriginal, paymentCurrency,
  amountEgp: String(Number(amountOriginal) * (paymentCurrency === "RMB" ? 7 : 1)),
  exchangeRateToEgp: paymentCurrency === "RMB" ? "7" : null,
  partyType: "supplier", partyId: 1, note: "ملاحظة",
} as ShipmentPayment);
const settledPayments = [
  payment(1, "تكلفة البضاعة", "23000"), payment(2, "الشحن", "500"),
  payment(3, "العمولة", "92"), payment(4, "الجمرك", "68000", "EGP"),
  payment(5, "التخريج", "750", "EGP"),
];
function store(s = shipment, payments = settledPayments, allocations: PaymentAllocation[] = []) {
  return {
    getShipment: async () => s,
    getShipmentItems: async () => [],
    getShipmentPayments: async () => payments,
    getPaymentAllocationsByShipmentId: async () => allocations,
    getSupplier: async () => ({ name: "مورد اختبار" } as any),
    getShippingCompany: async () => ({ name: "شركة اختبار" } as any),
  };
}

test("statement preserves historical missing costs and native settlement, including archived shipments", async () => {
  const result = await buildShipmentStatement(store(), 5);
  assert.equal(result.settlement.settled, true);
  assert.equal(result.settlement.remainingEgp, 0);
  assert.equal(result.settlement.remainingRmb, 0);
  assert.equal(result.shipment.totalMissingCostEgp, "3017.83");
  assert.equal(result.shipment.status, "مؤرشفة");
  assert.deepEqual(result.settlement, (await calculatePaymentSnapshot({ shipment, payments: settledPayments })).settlement);
});
test("stable chronological order; allocations never become cash movements and orphan allocations are excluded", async () => {
  const allocations = [
    { paymentId: 1, supplierId: 1, allocatedAmount: "23000" },
    { paymentId: 99, supplierId: 1, allocatedAmount: "9999" },
  ] as PaymentAllocation[];
  const result = await buildShipmentStatement(store(shipment, [...settledPayments].reverse(), allocations), 5);
  assert.deepEqual(result.payments.map(p => p.id), [1, 2, 3, 4, 5]);
  assert.equal(result.payments[0].allocations.length, 1);
  assert.equal(result.payments.length, 5);
  assert.equal(result.components[0].paid, 23000);
});
test("mixed currencies use recorded rate or explicit shipment fallback", async () => {
  const p = { ...payment(1, "تكلفة البضاعة", "700", "EGP"), exchangeRateToEgp: "5" };
  const result = await buildShipmentStatement(store(shipment, [p]), 5);
  assert.equal(result.payments[0].componentAmount, 140);
  assert.equal(result.components[0].paid, 140);
  const fallback = await buildShipmentStatement(store(shipment, [{ ...p, exchangeRateToEgp: null }]), 5);
  assert.equal(fallback.payments[0].componentAmount, 100);
  assert.match(fallback.payments[0].conversionBasis, /سعر الشحنة/);
});
test("discount applied once and a component surplus cannot hide another deficit", async () => {
  const s = { ...shipment, partialDiscountRmb: "100" };
  const result = await buildShipmentStatement(store(s, [payment(1, "تكلفة البضاعة", "24000")]), 5);
  assert.equal(result.components[0].cost, 22900);
  assert.equal(result.components[0].surplus, 1100);
  assert.equal(result.settlement.remainingRmb, 592);
  assert.equal(result.settlement.settled, false);
});
test("no payments and incomplete legacy data use unified status", async () => {
  const empty = await buildShipmentStatement(store(shipment, []), 5);
  assert.equal(empty.payments.length, 0);
  assert.equal(empty.settlement.remainingRmb, 23592);
  const legacy = { ...shipment, purchaseCostRmb: "0", purchaseCostEgp: "1000", finalTotalCostEgp: "1000", totalPaidEgp: "300" };
  const result = await buildShipmentStatement(store(legacy, []), 5);
  assert.equal(result.basis, "legacy-egp");
  assert.equal(result.legacy.remaining, 700);
});
test("regeneration from JSON-restored records preserves finances without any writes", async () => {
  const original = await buildShipmentStatement(store(), 5, new Date("2026-01-01"));
  const restored = await buildShipmentStatement(store(
    JSON.parse(JSON.stringify(shipment)), JSON.parse(JSON.stringify(settledPayments)),
  ), 5, new Date("2026-01-01"));
  assert.deepEqual(JSON.parse(JSON.stringify(original)), JSON.parse(JSON.stringify(restored)));
});
test("missing shipment fails explicitly", async () => {
  await assert.rejects(buildShipmentStatement({ ...store(), getShipment: async () => undefined }, 999),
    (error: any) => error.status === 404);
});
