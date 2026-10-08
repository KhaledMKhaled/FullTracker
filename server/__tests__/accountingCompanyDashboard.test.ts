import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { DatabaseStorage } from "../storage";
import type { Shipment, ShipmentPayment, ShippingCompany } from "@shared/schema";

function fixture() {
  const storage = new DatabaseStorage();
  const shipments = [
    { id: 8, shipmentCode: "1_AE", shippingCompanyId: 2, purchaseCostRmb: "614350.14", shippingCostRmb: "54149.40", commissionCostRmb: "30717.51", status: "جديدة" },
    { id: 9, shipmentCode: "2_AE", shippingCompanyId: 2, purchaseCostRmb: "96975.00", shippingCostRmb: "0", commissionCostRmb: "0", status: "مستلمة بنجاح" },
    { id: 10, shipmentCode: "OTHER", shippingCompanyId: 1, purchaseCostRmb: "1000", status: "جديدة" },
  ] as Shipment[];
  const payments = [
    { id: 1, shipmentId: 8, partyType: "shipping_company", partyId: 2, paymentCurrency: "RMB", amountOriginal: "489700", amountEgp: "3845175", costComponent: "تكلفة البضاعة" },
    { id: 2, shipmentId: 8, partyType: "supplier", partyId: 10, paymentCurrency: "RMB", amountOriginal: "40000", amountEgp: "312000", costComponent: "تكلفة البضاعة" },
    { id: 3, shipmentId: 9, partyType: "supplier", partyId: 28, paymentCurrency: "RMB", amountOriginal: "11500", amountEgp: "92000", costComponent: "تكلفة البضاعة" },
    { id: 4, shipmentId: 10, partyType: "shipping_company", partyId: 2, paymentCurrency: "RMB", amountOriginal: "777", amountEgp: "6216", costComponent: "تكلفة البضاعة" },
  ] as ShipmentPayment[];
  mock.method(storage, "getAllShipments", async () => shipments);
  mock.method(storage, "getAllPayments", async () => payments);
  mock.method(storage, "getShipmentItems", async () => []);
  mock.method(storage, "getAllShippingCompanies", async () => [{ id: 2, name: "soly" }] as ShippingCompany[]);
  return { storage, shipments, payments };
}

test("company dashboard deducts supplier payments from the whole shipments' costs", async () => {
  const { storage } = fixture();
  const result = await storage.getAccountingDashboard({ partyType: "shipping_company", partyId: 2 });
  assert.equal(result.shipmentsCount, 2);
  assert.equal(result.totalCostRmb, "796192.05");
  assert.equal(result.totalPaidRmb, "541200.00");
  assert.equal(result.totalBalanceRmb, "254992.05");
  assert.equal(result.totalBalancePurchaseRmb, "170125.14");
  assert.equal(result.totalBalanceShippingRmb, "54149.40");
  assert.equal(result.totalBalanceCommissionRmb, "30717.51");
});

test("company dashboard payment scope follows shipment and status filters", async () => {
  const { storage } = fixture();
  const result = await storage.getAccountingDashboard({
    partyType: "shipping_company", partyId: 2, shipmentCode: "2_AE",
  });
  assert.equal(result.totalPaidRmb, "11500.00");
  assert.equal(result.totalBalanceRmb, "85475.00");
  const statusResult = await storage.getAccountingDashboard({
    partyType: "shipping_company", partyId: 2, shipmentStatus: "مستلمة بنجاح",
  });
  assert.equal(statusResult.totalPaidRmb, "11500.00");
});

test("legacy unattributed payments reduce shipment dashboard balances exactly once", async () => {
  const { storage, payments } = fixture();
  payments.push({ ...payments[2], id: 5, partyType: null, partyId: null, amountOriginal: "100", amountEgp: "800" });
  const result = await storage.getAccountingDashboard({ partyType: "shipping_company", partyId: 2 });
  assert.equal(result.totalPaidRmb, "541300.00");
  assert.equal(result.totalBalanceRmb, "254892.05");
});

test("creditor ledger remains company-only and excludes supplier payments", async () => {
  const { storage } = fixture();
  const result = await storage.getShippingCompanyBalances({ shippingCompanyId: 2 });
  assert.equal(result[0].totalPaidRmb, "489700.00");
});
