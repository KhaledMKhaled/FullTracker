import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import type { ShipmentStatement } from "@shared/shipmentStatement";
import type { jsPDF } from "jspdf";
import { buildStatementLedger, createShipmentAccountStatement, orderedStatementPayments } from "./shipment-account-statement";

// Synthetic data only. No database or API access.
const fixture = {
  reference: "STMT-TEST-777",
  generatedAt: "2026-03-01T12:00:00Z",
  shipment: {
    id: 777, shipmentCode: "TEST-777", shipmentName: "شحنة اختبار غير شخصية",
    status: "مؤرشفة", purchaseDate: "2026-01-10",
    purchaseCostRmb: "1214.35", purchaseCostEgp: "8499.45",
    purchaseRmbToEgpRate: "7.0000", shippingCostRmb: "173.28",
    customsCostEgp: "428.16", totalMissingCostEgp: "58.40",
    partialDiscountRmb: "14.35", discountNotes: "خصم للتوضيح دون تكرار طرحه",
  },
  items: [{
    id: 1, lineNo: 1, productName: "صنف اختبار", supplierName: "مورد الاختبار",
    description: "تفصيل منتج دون بيانات شخصية", countryOfOrigin: "الصين",
    cartonsCtn: 7, piecesPerCartonPcs: 18, totalPiecesCou: 126,
    purchasePricePerPiecePriRmb: "9.5238", totalPurchaseCostRmb: "1200.00",
    totalCustomsCostEgp: "428.16", missingPieces: 2, missingCostEgp: "58.40",
  }],
  components: [
    { name: "تكلفة البضاعة", currency: "RMB", cost: 1200, paid: 1260, remaining: 0, surplus: 60 },
    { name: "الشحن", currency: "RMB", cost: 173.28, paid: 0, remaining: 173.28, surplus: 0 },
    { name: "الجمرك", currency: "EGP", cost: 428.16, paid: 0, remaining: 428.16, surplus: 0 },
  ],
  payments: Array.from({ length: 42 }, (_, i) => ({
    id: i + 1, shipmentId: 777,
    paymentDate: new Date(Date.UTC(2026, 0, 11 + Math.floor(i / 4))).toISOString(),
    createdAt: new Date(Date.UTC(2026, 0, 11 + Math.floor(i / 4), i % 4)).toISOString(),
    partyName: "مورد الاختبار", partyType: "supplier", partyId: 123,
    costComponent: "تكلفة البضاعة", paymentCurrency: i % 2 ? "EGP" : "RMB",
    amountOriginal: i % 2 ? "210.00" : "30.00", exchangeRateToEgp: "7.0000",
    amountEgp: "210.00", componentCurrency: "RMB", componentAmount: 30,
    conversionBasis: i % 2 ? "تحويل إلى عملة المكون بسعر الدفعة المسجل" : "بنفس عملة المكون",
    paymentMethod: "تحويل بنكي", referenceNumber: `FIXTURE-${i + 1}`,
    note: "ملاحظة اختبار طويلة للتأكد من التفاف السطر وعدم اقتطاع النص عند الانتقال إلى الصفحة التالية. ".repeat(i === 12 ? 36 : 1),
    allocations: [{ id: i + 1, supplierName: "مورد الاختبار", component: "تكلفة البضاعة", currency: "RMB", allocatedAmount: "30.00" }],
  })).reverse(),
  settlement: {
    status: "مدفوعة جزئياً", settled: false, remainingRmb: 173.28,
    remainingEgp: 428.16, displayRemainingEgp: 1641.12,
  },
  basis: "native-components",
  legacy: { cost: 10410.55, paid: 8820, remaining: 1590.55 },
  notes: ["تكلفة المكونات صافية بعد الخصم.", "النواقص القديمة محفوظة وليست دفعات."],
} as unknown as ShipmentStatement;

const registerFixtureFont = async (doc: jsPDF) => {
  const font = readFileSync("client/src/assets/fonts/Amiri-Regular.ttf").toString("base64");
  doc.addFileToVFS("Amiri-Regular.ttf", font);
  doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
  doc.setFont("Amiri", "normal");
};

test("chronology is stable and does not mutate input", () => {
  const first = fixture.payments[0].id;
  const sorted = orderedStatementPayments(fixture.payments);
  assert.equal(sorted[0].id, 1);
  assert.equal(sorted[41].id, 42);
  assert.equal(fixture.payments[0].id, first);
});

test("native credits count component equivalents once, ignoring explanatory allocations", () => {
  const ledger = buildStatementLedger(fixture, "RMB");
  assert.equal(ledger.entries.filter(e => e.payment).length, 42);
  assert.equal(ledger.entries.reduce((v, e) => v + e.credit, 0), 1260);
  assert.equal(ledger.entries.reduce((v, e) => v + e.debit, 0), 1373.28);
  assert.ok(Math.abs(ledger.closingBalance - 113.28) < 0.00001);
  assert.equal(buildStatementLedger(fixture, "EGP").closingBalance, 428.16);
  // The net balance does not replace the component debt of 173.28 and surplus of 60.
  assert.equal(fixture.settlement.remainingRmb, 173.28);
  assert.equal(fixture.components[0].surplus, 60);
});

test("legacy ledger uses historical EGP, and rejects unsupported RMB balances", () => {
  const legacy: ShipmentStatement = { ...fixture, basis: "legacy-egp", components: [] };
  const ledger = buildStatementLedger(legacy, "EGP");
  assert.equal(ledger.entries.reduce((v, e) => v + e.credit, 0), 8820);
  assert.ok(Math.abs(ledger.closingBalance - 1590.55) < 0.00001);
  assert.throws(() => buildStatementLedger(legacy, "RMB"));
});

test("long mixed-currency Arabic statement produces a multipage text PDF", async () => {
  const doc = await createShipmentAccountStatement(fixture, registerFixtureFont);
  assert.ok(doc.getNumberOfPages() > 5);
  const bytes = Buffer.from(doc.output("arraybuffer"));
  assert.ok(bytes.subarray(0, 5).equals(Buffer.from("%PDF-")));
  assert.equal(fixture.components[0].cost, 1200);
  assert.equal(fixture.payments.length, 42);
  if (process.env.STATEMENT_FIXTURE_EXPORT === "1") {
    mkdirSync("client/src/statement-test-artifacts", { recursive: true });
    writeFileSync("client/src/statement-test-artifacts/native-fixture.pdf", bytes);
  }
});

test("legacy and empty shipment produces a statement without native balances", async () => {
  const doc = await createShipmentAccountStatement({
    ...fixture, basis: "legacy-egp", components: [], payments: [], items: [],
    legacy: { cost: 10410.55, paid: 0, remaining: 10410.55 },
    settlement: {
      status: "لم يتم دفع أي مبلغ", settled: false, remainingRmb: 0,
      remainingEgp: 10410.55, displayRemainingEgp: 10410.55,
    },
  }, registerFixtureFont);
  assert.ok(doc.getNumberOfPages() >= 1);
  if (process.env.STATEMENT_FIXTURE_EXPORT === "1") {
    mkdirSync("client/src/statement-test-artifacts", { recursive: true });
    writeFileSync("client/src/statement-test-artifacts/legacy-empty-fixture.pdf", Buffer.from(doc.output("arraybuffer")));
  }
});
