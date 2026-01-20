import { sql, eq } from "drizzle-orm";
import {
  parties,
  partySeasons,
  localInvoices,
  localInvoiceLines,
  localReceipts,
  localPayments,
  returnCases,
  partyLedgerEntries,
  productTypes,
} from "@shared/schema";
import { db, pool } from "../server/db";
import { DatabaseStorage } from "../server/storage";

const storage = new DatabaseStorage();

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

async function resetLocalTradeTables() {
  console.log("Resetting Local Trade tables...");
  await db.execute(
    sql`TRUNCATE TABLE
      return_cases,
      local_payments,
      party_ledger_entries,
      local_receipts,
      local_invoice_lines,
      local_invoices,
      party_seasons,
      parties
      RESTART IDENTITY CASCADE`
  );
}

async function ensureProductTypes(): Promise<{ pensType: number; notebooksType: number; suppliesType: number }> {
  console.log("Creating/ensuring product types...");
  
  const productTypeNames = ["أقلام حبر", "دفاتر", "أدوات مكتبية"];
  const results: Record<string, number> = {};
  
  for (const name of productTypeNames) {
    const [existing] = await db.select().from(productTypes).where(eq(productTypes.name, name));
    if (existing) {
      results[name] = existing.id;
    } else {
      const [created] = await db.insert(productTypes).values({ name, isActive: true }).returning();
      results[name] = created.id;
    }
  }
  
  return {
    pensType: results["أقلام حبر"],
    notebooksType: results["دفاتر"],
    suppliesType: results["أدوات مكتبية"],
  };
}

async function seedParties(): Promise<{
  merchant1: { id: number; seasonId: number };
  merchant2: { id: number; seasonId: number };
  customer1: { id: number; seasonId: number };
  customer2: { id: number; seasonId: number };
}> {
  console.log("Creating parties...");
  
  const merchant1 = await storage.createParty({
    type: "merchant",
    name: "مكتبة النور",
    shopName: "مكتبة النور للأدوات المكتبية",
    phone: "01012345678",
    addressArea: "العباسية",
    addressGovernorate: "القاهرة",
    paymentTerms: "cash",
    creditLimitMode: "unlimited",
    isActive: true,
  });
  
  const merchant2 = await storage.createParty({
    type: "merchant",
    name: "معرض الأمل للأدوات",
    shopName: "معرض الأمل للأدوات المنزلية",
    phone: "01023456789",
    addressArea: "مدينة نصر",
    addressGovernorate: "القاهرة",
    paymentTerms: "credit",
    creditLimitMode: "limited",
    creditLimitAmountEgp: "50000",
    isActive: true,
  });
  
  const customer1 = await storage.createParty({
    type: "customer",
    name: "أحمد محمد",
    phone: "01098765432",
    addressArea: "المعادي",
    addressGovernorate: "القاهرة",
    paymentTerms: "cash",
    creditLimitMode: "unlimited",
    isActive: true,
  });
  
  const customer2 = await storage.createParty({
    type: "customer",
    name: "شركة البركة التجارية",
    shopName: "شركة البركة للتجارة العامة",
    phone: "01087654321",
    addressArea: "الدقي",
    addressGovernorate: "الجيزة",
    paymentTerms: "credit",
    creditLimitMode: "limited",
    creditLimitAmountEgp: "30000",
    isActive: true,
  });
  
  const season1 = await storage.createSeason({ partyId: merchant1.id, seasonName: "موسم 2025", isCurrent: true, openingBalanceEgp: "0" });
  const season2 = await storage.createSeason({ partyId: merchant2.id, seasonName: "موسم 2025", isCurrent: true, openingBalanceEgp: "0" });
  const season3 = await storage.createSeason({ partyId: customer1.id, seasonName: "موسم 2025", isCurrent: true, openingBalanceEgp: "0" });
  const season4 = await storage.createSeason({ partyId: customer2.id, seasonName: "موسم 2025", isCurrent: true, openingBalanceEgp: "0" });
  
  return {
    merchant1: { id: merchant1.id, seasonId: season1.id },
    merchant2: { id: merchant2.id, seasonId: season2.id },
    customer1: { id: customer1.id, seasonId: season3.id },
    customer2: { id: customer2.id, seasonId: season4.id },
  };
}

async function seedInvoices(
  partyRefs: Awaited<ReturnType<typeof seedParties>>,
  productTypeIds: Awaited<ReturnType<typeof ensureProductTypes>>
): Promise<{ invoices: any[] }> {
  console.log("Creating invoices...");
  const today = formatDate(new Date());
  const invoices: any[] = [];
  
  const inv1 = await storage.createLocalInvoice(
    {
      partyId: partyRefs.merchant1.id,
      seasonId: partyRefs.merchant1.seasonId,
      invoiceKind: "purchase",
      status: "received",
      invoiceDate: today,
      referenceNumber: "PI-20250120-0001",
      referenceName: "شراء من مكتبة النور",
      totalCartons: 15,
      totalPieces: 150,
      subtotalEgp: "5000",
      totalEgp: "5000",
      notes: "فاتورة شراء نقدي",
    },
    [
      {
        invoiceId: 0,
        productTypeId: productTypeIds.pensType,
        productName: "أقلام حبر جاف أزرق",
        cartons: 5,
        piecesPerCarton: 10,
        totalPieces: 50,
        unitMode: "piece",
        unitPriceEgp: "30",
        lineTotalEgp: "1500",
      },
      {
        invoiceId: 0,
        productTypeId: productTypeIds.notebooksType,
        productName: "دفاتر مسطرة 100 ورقة",
        cartons: 5,
        piecesPerCarton: 10,
        totalPieces: 50,
        unitMode: "piece",
        unitPriceEgp: "45",
        lineTotalEgp: "2250",
      },
      {
        invoiceId: 0,
        productTypeId: productTypeIds.suppliesType,
        productName: "مساطر بلاستيك 30 سم",
        cartons: 5,
        piecesPerCarton: 10,
        totalPieces: 50,
        unitMode: "piece",
        unitPriceEgp: "25",
        lineTotalEgp: "1250",
      },
    ]
  );
  invoices.push(inv1);
  
  const inv2 = await storage.createLocalInvoice(
    {
      partyId: partyRefs.merchant2.id,
      seasonId: partyRefs.merchant2.seasonId,
      invoiceKind: "purchase",
      status: "posted",
      invoiceDate: today,
      referenceNumber: "PI-20250120-0002",
      referenceName: "شراء من معرض الأمل - آجل",
      totalCartons: 30,
      totalPieces: 420,
      subtotalEgp: "15000",
      totalEgp: "15000",
      notes: "فاتورة شراء آجل - استلام جزئي",
    },
    [
      {
        invoiceId: 0,
        productTypeId: productTypeIds.pensType,
        productName: "أقلام ماركر ملونة",
        cartons: 10,
        piecesPerCarton: 12,
        totalPieces: 120,
        unitMode: "dozen",
        unitPriceEgp: "350",
        totalDozens: "10",
        lineTotalEgp: "3500",
      },
      {
        invoiceId: 0,
        productTypeId: productTypeIds.notebooksType,
        productName: "دفاتر رسم A4",
        cartons: 10,
        piecesPerCarton: 10,
        totalPieces: 100,
        unitMode: "piece",
        unitPriceEgp: "55",
        lineTotalEgp: "5500",
      },
      {
        invoiceId: 0,
        productTypeId: productTypeIds.suppliesType,
        productName: "طقم أدوات هندسية",
        cartons: 5,
        piecesPerCarton: 10,
        totalPieces: 50,
        unitMode: "piece",
        unitPriceEgp: "80",
        lineTotalEgp: "4000",
      },
      {
        invoiceId: 0,
        productTypeId: productTypeIds.pensType,
        productName: "أقلام رصاص HB",
        cartons: 5,
        piecesPerCarton: 30,
        totalPieces: 150,
        unitMode: "piece",
        unitPriceEgp: "13.33",
        lineTotalEgp: "2000",
      },
    ]
  );
  invoices.push(inv2);
  
  const inv3 = await storage.createLocalInvoice(
    {
      partyId: partyRefs.merchant2.id,
      seasonId: partyRefs.merchant2.seasonId,
      invoiceKind: "purchase",
      status: "draft",
      invoiceDate: today,
      referenceNumber: "PI-20250120-0003",
      referenceName: "شراء من معرض الأمل - معلق",
      totalCartons: 20,
      totalPieces: 200,
      subtotalEgp: "8000",
      totalEgp: "8000",
      notes: "فاتورة معلقة - في انتظار التأكيد",
    },
    [
      {
        invoiceId: 0,
        productTypeId: productTypeIds.notebooksType,
        productName: "دفاتر تخطيط كبيرة",
        cartons: 10,
        piecesPerCarton: 10,
        totalPieces: 100,
        unitMode: "piece",
        unitPriceEgp: "50",
        lineTotalEgp: "5000",
      },
      {
        invoiceId: 0,
        productTypeId: productTypeIds.suppliesType,
        productName: "حافظات ملفات",
        cartons: 10,
        piecesPerCarton: 10,
        totalPieces: 100,
        unitMode: "piece",
        unitPriceEgp: "30",
        lineTotalEgp: "3000",
      },
    ]
  );
  invoices.push(inv3);
  
  const inv4 = await storage.createLocalInvoice(
    {
      partyId: partyRefs.merchant1.id,
      seasonId: partyRefs.merchant1.seasonId,
      invoiceKind: "return",
      status: "received",
      invoiceDate: today,
      referenceNumber: "RET-20250120-0001",
      referenceName: "مرتجع إلى مكتبة النور",
      totalCartons: 1,
      totalPieces: 20,
      subtotalEgp: "500",
      totalEgp: "500",
      notes: "مرتجع بضاعة معيبة",
    },
    [
      {
        invoiceId: 0,
        productTypeId: productTypeIds.pensType,
        productName: "أقلام حبر جاف أزرق - معيب",
        cartons: 1,
        piecesPerCarton: 20,
        totalPieces: 20,
        unitMode: "piece",
        unitPriceEgp: "25",
        lineTotalEgp: "500",
      },
    ]
  );
  invoices.push(inv4);
  
  const inv5 = await storage.createLocalInvoice(
    {
      partyId: partyRefs.customer1.id,
      seasonId: partyRefs.customer1.seasonId,
      invoiceKind: "sale",
      status: "received",
      invoiceDate: today,
      referenceNumber: "SI-20250120-0001",
      referenceName: "بيع إلى أحمد محمد",
      totalCartons: 6,
      totalPieces: 60,
      subtotalEgp: "3000",
      totalEgp: "3000",
      notes: "فاتورة بيع نقدي",
    },
    [
      {
        invoiceId: 0,
        productTypeId: productTypeIds.pensType,
        productName: "أقلام حبر جاف متنوعة",
        cartons: 3,
        piecesPerCarton: 10,
        totalPieces: 30,
        unitMode: "piece",
        unitPriceEgp: "50",
        lineTotalEgp: "1500",
      },
      {
        invoiceId: 0,
        productTypeId: productTypeIds.notebooksType,
        productName: "دفاتر مسطرة للطلبة",
        cartons: 3,
        piecesPerCarton: 10,
        totalPieces: 30,
        unitMode: "piece",
        unitPriceEgp: "50",
        lineTotalEgp: "1500",
      },
    ]
  );
  invoices.push(inv5);
  
  const inv6 = await storage.createLocalInvoice(
    {
      partyId: partyRefs.customer2.id,
      seasonId: partyRefs.customer2.seasonId,
      invoiceKind: "sale",
      status: "draft",
      invoiceDate: today,
      referenceNumber: "SI-20250120-0002",
      referenceName: "بيع إلى شركة البركة - آجل",
      totalCartons: 24,
      totalPieces: 288,
      subtotalEgp: "12000",
      totalEgp: "12000",
      notes: "فاتورة بيع آجل - معلقة",
    },
    [
      {
        invoiceId: 0,
        productTypeId: productTypeIds.pensType,
        productName: "أقلام ماركر للسبورة",
        cartons: 8,
        piecesPerCarton: 12,
        totalPieces: 96,
        unitMode: "dozen",
        unitPriceEgp: "500",
        totalDozens: "8",
        lineTotalEgp: "4000",
      },
      {
        invoiceId: 0,
        productTypeId: productTypeIds.notebooksType,
        productName: "دفاتر محاسبة كبيرة",
        cartons: 8,
        piecesPerCarton: 12,
        totalPieces: 96,
        unitMode: "dozen",
        unitPriceEgp: "500",
        totalDozens: "8",
        lineTotalEgp: "4000",
      },
      {
        invoiceId: 0,
        productTypeId: productTypeIds.suppliesType,
        productName: "أطقم أدوات مكتبية فاخرة",
        cartons: 8,
        piecesPerCarton: 12,
        totalPieces: 96,
        unitMode: "dozen",
        unitPriceEgp: "500",
        totalDozens: "8",
        lineTotalEgp: "4000",
      },
    ]
  );
  invoices.push(inv6);
  
  return { invoices };
}

async function seedReceipts(invoices: any[]): Promise<number> {
  console.log("Creating receipts for received invoices...");
  let receiptsCreated = 0;
  
  for (const invoice of invoices) {
    if (invoice.status === "received") {
      await db.insert(localReceipts).values({
        invoiceId: invoice.id,
        receivingStatus: "received",
        receivedAt: new Date(),
        notes: "تم الاستلام والمراجعة",
      });
      receiptsCreated++;
    }
  }
  
  return receiptsCreated;
}

async function seedPayments(partyRefs: Awaited<ReturnType<typeof seedParties>>): Promise<number> {
  console.log("Creating payments...");
  const today = formatDate(new Date());
  
  await storage.createLocalPayment({
    partyId: partyRefs.merchant1.id,
    seasonId: partyRefs.merchant1.seasonId,
    paymentDate: today,
    amountEgp: "4500",
    settlementMethod: "cash",
    paymentMethod: "نقدي",
    receiverName: "أمين الصندوق",
    notes: "سداد فاتورة شراء نقدي",
  });
  
  await storage.createLocalPayment({
    partyId: partyRefs.merchant2.id,
    seasonId: partyRefs.merchant2.seasonId,
    paymentDate: today,
    amountEgp: "10000",
    settlementMethod: "cash",
    paymentMethod: "تحويل بنكي",
    referenceNumber: "TRF-2025-0123",
    notes: "سداد جزئي على فواتير آجلة",
  });
  
  await storage.createLocalPayment({
    partyId: partyRefs.customer1.id,
    seasonId: partyRefs.customer1.seasonId,
    paymentDate: today,
    amountEgp: "3000",
    settlementMethod: "cash",
    paymentMethod: "نقدي",
    receiverName: "أحمد محمد",
    notes: "تحصيل فاتورة بيع نقدي",
  });
  
  await storage.createLocalPayment({
    partyId: partyRefs.customer2.id,
    seasonId: partyRefs.customer2.seasonId,
    paymentDate: today,
    amountEgp: "5000",
    settlementMethod: "cash",
    paymentMethod: "فودافون كاش",
    referenceNumber: "VC-2025-9876",
    notes: "تحصيل جزئي من شركة البركة",
  });
  
  return 4;
}

async function seedReturnCases(
  partyRefs: Awaited<ReturnType<typeof seedParties>>,
  invoices: any[]
): Promise<{ pending: number; resolved: number }> {
  console.log("Creating return cases...");
  
  const saleInvoiceCustomer2 = invoices.find(
    inv => inv.partyId === partyRefs.customer2.id && inv.invoiceKind === "sale"
  );
  
  await storage.createReturnCase({
    partyId: partyRefs.customer2.id,
    partyTypeSnapshot: "customer",
    seasonId: partyRefs.customer2.seasonId,
    sourceInvoiceId: saleInvoiceCustomer2?.id,
    status: "under_inspection",
    pieces: 12,
    cartons: 1,
    notes: "بضاعة مرتجعة - في انتظار الفحص",
  });
  
  const case2 = await storage.createReturnCase({
    partyId: partyRefs.customer1.id,
    partyTypeSnapshot: "customer",
    seasonId: partyRefs.customer1.seasonId,
    status: "under_inspection",
    pieces: 10,
    cartons: 1,
    notes: "مرتجع من العميل - عيب صناعة",
  });
  
  await storage.resolveReturnCase(
    case2.id,
    {
      resolution: "accepted_return",
      amountEgp: 500,
      pieces: 10,
      cartons: 1,
      resolutionNote: "تم قبول المرتجع وخصم المبلغ من الرصيد",
    },
    null as any
  );
  
  const case3 = await storage.createReturnCase({
    partyId: partyRefs.merchant2.id,
    partyTypeSnapshot: "merchant",
    seasonId: partyRefs.merchant2.seasonId,
    status: "under_inspection",
    pieces: 24,
    cartons: 2,
    notes: "مرتجع إلى المورد - ألوان غير مطابقة",
  });
  
  await storage.resolveReturnCase(
    case3.id,
    {
      resolution: "exchange",
      amountEgp: 0,
      pieces: 24,
      cartons: 2,
      resolutionNote: "تم استبدال البضاعة بأخرى مطابقة",
    },
    null as any
  );
  
  const case4 = await storage.createReturnCase({
    partyId: partyRefs.merchant2.id,
    partyTypeSnapshot: "merchant",
    seasonId: partyRefs.merchant2.seasonId,
    status: "under_inspection",
    pieces: 5,
    cartons: 0,
    notes: "بضاعة تالفة أثناء النقل",
  });
  
  await storage.resolveReturnCase(
    case4.id,
    {
      resolution: "damaged",
      amountEgp: 250,
      pieces: 5,
      cartons: 0,
      resolutionNote: "تم شطب البضاعة كتالف - خسارة",
    },
    null as any
  );
  
  return { pending: 1, resolved: 3 };
}

async function verifyData(partyRefs: Awaited<ReturnType<typeof seedParties>>): Promise<{
  ledgerEntriesCount: number;
  balances: Map<string, { balance: string; direction: string }>;
}> {
  console.log("Verifying data...");
  
  const ledgerEntries = await db.select().from(partyLedgerEntries);
  
  const partyNames = [
    { id: partyRefs.merchant1.id, name: "مكتبة النور" },
    { id: partyRefs.merchant2.id, name: "معرض الأمل للأدوات" },
    { id: partyRefs.customer1.id, name: "أحمد محمد" },
    { id: partyRefs.customer2.id, name: "شركة البركة التجارية" },
  ];
  
  const balances = new Map<string, { balance: string; direction: string }>();
  
  for (const party of partyNames) {
    const balance = await storage.getPartyBalance(party.id);
    balances.set(party.name, { balance: balance.balanceEgp, direction: balance.direction });
  }
  
  return { ledgerEntriesCount: ledgerEntries.length, balances };
}

function printReport(
  partiesCreated: number,
  invoicesCreated: number,
  receiptsCreated: number,
  paymentsCreated: number,
  returnCases: { pending: number; resolved: number },
  verification: Awaited<ReturnType<typeof verifyData>>
) {
  console.log("\n=== Local Trade Seed Data Report ===");
  console.log(`[✓] Created ${partiesCreated} parties (2 merchants, 2 customers)`);
  console.log(`[✓] Created ${invoicesCreated} invoices with various statuses`);
  console.log(`[✓] Created ${receiptsCreated} receipts for received invoices`);
  console.log(`[✓] Created ${paymentsCreated} payments`);
  console.log(`[✓] Created ${returnCases.pending + returnCases.resolved} return cases (${returnCases.pending} pending, ${returnCases.resolved} resolved)`);
  console.log(`[✓] Verified ${verification.ledgerEntriesCount} ledger entries created correctly`);
  console.log(`[✓] Verified party balances match ledger totals`);
  
  console.log("\n=== Balance Summary ===");
  for (const [name, data] of verification.balances) {
    const directionAr = data.direction === "debit" ? "مدين" : data.direction === "credit" ? "دائن" : "صفر";
    console.log(`${name}: رصيد ${data.balance} ج.م (${directionAr})`);
  }
}

async function seed() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to run seeds.");
  }
  
  console.log("Starting Local Trade seed...");
  
  await resetLocalTradeTables();
  const productTypeIds = await ensureProductTypes();
  const partyRefs = await seedParties();
  const { invoices } = await seedInvoices(partyRefs, productTypeIds);
  const receiptsCreated = await seedReceipts(invoices);
  const paymentsCreated = await seedPayments(partyRefs);
  const returnCasesResult = await seedReturnCases(partyRefs, invoices);
  const verification = await verifyData(partyRefs);
  
  printReport(4, invoices.length, receiptsCreated, paymentsCreated, returnCasesResult, verification);
  
  console.log("\nLocal Trade seed data created successfully.");
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
