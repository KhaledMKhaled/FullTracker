import { eq } from "drizzle-orm";
import {
  parties,
  partySeasons,
  localInvoices,
  localPayments,
  returnCases,
  partyLedgerEntries,
  productTypes,
} from "@shared/schema";
import { db, pool } from "../server/db";
import { DatabaseStorage } from "../server/storage";

const storage = new DatabaseStorage();

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

function checkEnvironment(): boolean {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "production") {
    console.error("❌ ERROR: Cannot run seed script in production environment!");
    console.error("   Set NODE_ENV to 'development' or 'test' to run this script.");
    return false;
  }
  return true;
}

function parseArgs(): { force: boolean } {
  const args = process.argv.slice(2);
  return {
    force: args.includes("--force"),
  };
}

async function checkExistingData(): Promise<{
  hasParties: boolean;
  hasInvoices: boolean;
  hasPayments: boolean;
  partiesCount: number;
  invoicesCount: number;
  paymentsCount: number;
}> {
  const existingParties = await db.select().from(parties);
  const existingInvoices = await db.select().from(localInvoices);
  const existingPayments = await db.select().from(localPayments);

  return {
    hasParties: existingParties.length > 0,
    hasInvoices: existingInvoices.length > 0,
    hasPayments: existingPayments.length > 0,
    partiesCount: existingParties.length,
    invoicesCount: existingInvoices.length,
    paymentsCount: existingPayments.length,
  };
}

async function findPartyByPhone(phone: string): Promise<{ id: number; name: string } | null> {
  const [existing] = await db.select().from(parties).where(eq(parties.phone, phone));
  return existing ? { id: existing.id, name: existing.name } : null;
}

async function findSeasonForParty(partyId: number): Promise<{ id: number; seasonName: string } | null> {
  const [existing] = await db
    .select()
    .from(partySeasons)
    .where(eq(partySeasons.partyId, partyId));
  return existing ? { id: existing.id, seasonName: existing.seasonName } : null;
}

async function ensureProductTypes(): Promise<{ pensType: number; notebooksType: number; suppliesType: number }> {
  console.log("📦 Ensuring product types exist...");

  const productTypeNames = ["أقلام حبر", "دفاتر", "أدوات مكتبية"];
  const results: Record<string, number> = {};

  for (const name of productTypeNames) {
    const [existing] = await db.select().from(productTypes).where(eq(productTypes.name, name));
    if (existing) {
      console.log(`   ↳ Product type "${name}" already exists (id=${existing.id})`);
      results[name] = existing.id;
    } else {
      const [created] = await db.insert(productTypes).values({ name, isActive: true }).returning();
      console.log(`   ↳ Created product type "${name}" (id=${created.id})`);
      results[name] = created.id;
    }
  }

  return {
    pensType: results["أقلام حبر"],
    notebooksType: results["دفاتر"],
    suppliesType: results["أدوات مكتبية"],
  };
}

interface PartyRef {
  id: number;
  seasonId: number;
  name: string;
  isNew: boolean;
}

interface PartyRefs {
  merchant1: PartyRef;
  merchant2: PartyRef;
  customer1: PartyRef;
  customer2: PartyRef;
}

const PARTY_DATA = [
  {
    key: "merchant1",
    type: "merchant" as const,
    name: "مكتبة النور",
    shopName: "مكتبة النور للأدوات المكتبية",
    phone: "01012345678",
    addressArea: "العباسية",
    addressGovernorate: "القاهرة",
    paymentTerms: "cash" as const,
    creditLimitMode: "unlimited" as const,
  },
  {
    key: "merchant2",
    type: "merchant" as const,
    name: "معرض الأمل للأدوات",
    shopName: "معرض الأمل للأدوات المنزلية",
    phone: "01023456789",
    addressArea: "مدينة نصر",
    addressGovernorate: "القاهرة",
    paymentTerms: "credit" as const,
    creditLimitMode: "limited" as const,
    creditLimitAmountEgp: "50000",
  },
  {
    key: "customer1",
    type: "customer" as const,
    name: "أحمد محمد",
    phone: "01098765432",
    addressArea: "المعادي",
    addressGovernorate: "القاهرة",
    paymentTerms: "cash" as const,
    creditLimitMode: "unlimited" as const,
  },
  {
    key: "customer2",
    type: "customer" as const,
    name: "شركة البركة التجارية",
    shopName: "شركة البركة للتجارة العامة",
    phone: "01087654321",
    addressArea: "الدقي",
    addressGovernorate: "الجيزة",
    paymentTerms: "credit" as const,
    creditLimitMode: "limited" as const,
    creditLimitAmountEgp: "30000",
  },
];

async function seedPartiesIdempotent(): Promise<PartyRefs> {
  console.log("\n👥 Seeding parties (idempotent)...");

  const results: Record<string, PartyRef> = {};

  for (const partyData of PARTY_DATA) {
    const existingParty = await findPartyByPhone(partyData.phone);

    if (existingParty) {
      const existingSeason = await findSeasonForParty(existingParty.id);
      if (existingSeason) {
        console.log(`   ↳ Party "${partyData.name}" already exists (id=${existingParty.id}, season=${existingSeason.id}), skipping...`);
        results[partyData.key] = {
          id: existingParty.id,
          seasonId: existingSeason.id,
          name: partyData.name,
          isNew: false,
        };
        continue;
      }
    }

    console.log(`   ↳ Creating party "${partyData.name}"...`);
    const { key, ...insertData } = partyData;
    const newParty = await storage.createParty({
      ...insertData,
      isActive: true,
    });

    const season = await storage.createSeason({
      partyId: newParty.id,
      seasonName: "موسم 2025",
      isCurrent: true,
      openingBalanceEgp: "0",
    });

    results[partyData.key] = {
      id: newParty.id,
      seasonId: season.id,
      name: partyData.name,
      isNew: true,
    };
    console.log(`   ✓ Created party "${partyData.name}" (id=${newParty.id}, season=${season.id})`);
  }

  return results as PartyRefs;
}

async function checkInvoiceExists(referenceNumber: string): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(localInvoices)
    .where(eq(localInvoices.referenceNumber, referenceNumber));
  return !!existing;
}

async function seedInvoicesIdempotent(
  partyRefs: PartyRefs,
  productTypeIds: Awaited<ReturnType<typeof ensureProductTypes>>
): Promise<{ invoices: any[]; created: number; skipped: number }> {
  console.log("\n📄 Seeding invoices (idempotent)...");

  const today = formatDate(new Date());
  const invoices: any[] = [];
  let created = 0;
  let skipped = 0;

  const invoiceData = [
    {
      refNum: "PI-20250120-0001",
      partyRef: partyRefs.merchant1,
      header: {
        invoiceKind: "purchase" as const,
        status: "received" as const,
        invoiceDate: today,
        referenceName: "شراء من مكتبة النور",
        totalCartons: 15,
        totalPieces: 150,
        subtotalEgp: "5000",
        totalEgp: "5000",
        notes: "فاتورة شراء نقدي",
      },
      lines: [
        { productTypeId: productTypeIds.pensType, productName: "أقلام حبر جاف أزرق", cartons: 5, piecesPerCarton: 10, totalPieces: 50, unitMode: "piece", unitPriceEgp: "30", lineTotalEgp: "1500" },
        { productTypeId: productTypeIds.notebooksType, productName: "دفاتر مسطرة 100 ورقة", cartons: 5, piecesPerCarton: 10, totalPieces: 50, unitMode: "piece", unitPriceEgp: "45", lineTotalEgp: "2250" },
        { productTypeId: productTypeIds.suppliesType, productName: "مساطر بلاستيك 30 سم", cartons: 5, piecesPerCarton: 10, totalPieces: 50, unitMode: "piece", unitPriceEgp: "25", lineTotalEgp: "1250" },
      ],
    },
    {
      refNum: "PI-20250120-0002",
      partyRef: partyRefs.merchant2,
      header: {
        invoiceKind: "purchase" as const,
        status: "posted" as const,
        invoiceDate: today,
        referenceName: "شراء من معرض الأمل - آجل",
        totalCartons: 30,
        totalPieces: 420,
        subtotalEgp: "15000",
        totalEgp: "15000",
        notes: "فاتورة شراء آجل - استلام جزئي",
      },
      lines: [
        { productTypeId: productTypeIds.pensType, productName: "أقلام ماركر ملونة", cartons: 10, piecesPerCarton: 12, totalPieces: 120, unitMode: "dozen", unitPriceEgp: "350", totalDozens: "10", lineTotalEgp: "3500" },
        { productTypeId: productTypeIds.notebooksType, productName: "دفاتر رسم A4", cartons: 10, piecesPerCarton: 10, totalPieces: 100, unitMode: "piece", unitPriceEgp: "55", lineTotalEgp: "5500" },
        { productTypeId: productTypeIds.suppliesType, productName: "طقم أدوات هندسية", cartons: 5, piecesPerCarton: 10, totalPieces: 50, unitMode: "piece", unitPriceEgp: "80", lineTotalEgp: "4000" },
        { productTypeId: productTypeIds.pensType, productName: "أقلام رصاص HB", cartons: 5, piecesPerCarton: 30, totalPieces: 150, unitMode: "piece", unitPriceEgp: "13.33", lineTotalEgp: "2000" },
      ],
    },
    {
      refNum: "PI-20250120-0003",
      partyRef: partyRefs.merchant2,
      header: {
        invoiceKind: "purchase" as const,
        status: "draft" as const,
        invoiceDate: today,
        referenceName: "شراء من معرض الأمل - معلق",
        totalCartons: 20,
        totalPieces: 200,
        subtotalEgp: "8000",
        totalEgp: "8000",
        notes: "فاتورة معلقة - في انتظار التأكيد",
      },
      lines: [
        { productTypeId: productTypeIds.notebooksType, productName: "دفاتر تخطيط كبيرة", cartons: 10, piecesPerCarton: 10, totalPieces: 100, unitMode: "piece", unitPriceEgp: "50", lineTotalEgp: "5000" },
        { productTypeId: productTypeIds.suppliesType, productName: "حافظات ملفات", cartons: 10, piecesPerCarton: 10, totalPieces: 100, unitMode: "piece", unitPriceEgp: "30", lineTotalEgp: "3000" },
      ],
    },
    {
      refNum: "RET-20250120-0001",
      partyRef: partyRefs.merchant1,
      header: {
        invoiceKind: "return" as const,
        status: "received" as const,
        invoiceDate: today,
        referenceName: "مرتجع إلى مكتبة النور",
        totalCartons: 1,
        totalPieces: 20,
        subtotalEgp: "500",
        totalEgp: "500",
        notes: "مرتجع بضاعة معيبة",
      },
      lines: [
        { productTypeId: productTypeIds.pensType, productName: "أقلام حبر جاف أزرق - معيب", cartons: 1, piecesPerCarton: 20, totalPieces: 20, unitMode: "piece", unitPriceEgp: "25", lineTotalEgp: "500" },
      ],
    },
    {
      refNum: "SI-20250120-0001",
      partyRef: partyRefs.customer1,
      header: {
        invoiceKind: "sale" as const,
        status: "received" as const,
        invoiceDate: today,
        referenceName: "بيع إلى أحمد محمد",
        totalCartons: 6,
        totalPieces: 60,
        subtotalEgp: "3000",
        totalEgp: "3000",
        notes: "فاتورة بيع نقدي",
      },
      lines: [
        { productTypeId: productTypeIds.pensType, productName: "أقلام حبر جاف متنوعة", cartons: 3, piecesPerCarton: 10, totalPieces: 30, unitMode: "piece", unitPriceEgp: "50", lineTotalEgp: "1500" },
        { productTypeId: productTypeIds.notebooksType, productName: "دفاتر مسطرة للطلبة", cartons: 3, piecesPerCarton: 10, totalPieces: 30, unitMode: "piece", unitPriceEgp: "50", lineTotalEgp: "1500" },
      ],
    },
    {
      refNum: "SI-20250120-0002",
      partyRef: partyRefs.customer2,
      header: {
        invoiceKind: "sale" as const,
        status: "draft" as const,
        invoiceDate: today,
        referenceName: "بيع إلى شركة البركة - آجل",
        totalCartons: 24,
        totalPieces: 288,
        subtotalEgp: "12000",
        totalEgp: "12000",
        notes: "فاتورة بيع آجل - معلقة",
      },
      lines: [
        { productTypeId: productTypeIds.pensType, productName: "أقلام ماركر للسبورة", cartons: 8, piecesPerCarton: 12, totalPieces: 96, unitMode: "dozen", unitPriceEgp: "500", totalDozens: "8", lineTotalEgp: "4000" },
        { productTypeId: productTypeIds.notebooksType, productName: "دفاتر محاسبة كبيرة", cartons: 8, piecesPerCarton: 12, totalPieces: 96, unitMode: "dozen", unitPriceEgp: "500", totalDozens: "8", lineTotalEgp: "4000" },
        { productTypeId: productTypeIds.suppliesType, productName: "أطقم أدوات مكتبية فاخرة", cartons: 8, piecesPerCarton: 12, totalPieces: 96, unitMode: "dozen", unitPriceEgp: "500", totalDozens: "8", lineTotalEgp: "4000" },
      ],
    },
  ];

  for (const inv of invoiceData) {
    const exists = await checkInvoiceExists(inv.refNum);
    if (exists) {
      console.log(`   ↳ Invoice "${inv.refNum}" already exists, skipping...`);
      const [existingInv] = await db.select().from(localInvoices).where(eq(localInvoices.referenceNumber, inv.refNum));
      invoices.push(existingInv);
      skipped++;
      continue;
    }

    console.log(`   ↳ Creating invoice "${inv.refNum}"...`);
    const newInvoice = await storage.createLocalInvoice(
      {
        partyId: inv.partyRef.id,
        seasonId: inv.partyRef.seasonId,
        referenceNumber: inv.refNum,
        ...inv.header,
      },
      inv.lines.map((line) => ({ invoiceId: 0, ...line }))
    );
    invoices.push(newInvoice);
    created++;
    console.log(`   ✓ Created invoice "${inv.refNum}" (id=${newInvoice.id})`);
  }

  return { invoices, created, skipped };
}

function normalizeAmount(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function checkPaymentExists(partyId: number, amountEgp: string, notes: string): Promise<boolean> {
  const existing = await db
    .select()
    .from(localPayments)
    .where(eq(localPayments.partyId, partyId));
  const targetAmount = normalizeAmount(amountEgp);
  return existing.some((p) => {
    const existingAmount = normalizeAmount(p.amountEgp);
    const notesMatch = (p.notes || "").trim() === (notes || "").trim();
    return Math.abs(existingAmount - targetAmount) < 0.01 && notesMatch;
  });
}

async function seedPaymentsIdempotent(partyRefs: PartyRefs): Promise<{ created: number; skipped: number }> {
  console.log("\n💰 Seeding payments (idempotent)...");

  const today = formatDate(new Date());
  let created = 0;
  let skipped = 0;

  const paymentData = [
    {
      partyRef: partyRefs.merchant1,
      amountEgp: "4500",
      settlementMethod: "cash" as const,
      paymentMethod: "نقدي",
      receiverName: "أمين الصندوق",
      notes: "سداد فاتورة شراء نقدي",
    },
    {
      partyRef: partyRefs.merchant2,
      amountEgp: "10000",
      settlementMethod: "cash" as const,
      paymentMethod: "تحويل بنكي",
      referenceNumber: "TRF-2025-0123",
      notes: "سداد جزئي على فواتير آجلة",
    },
    {
      partyRef: partyRefs.customer1,
      amountEgp: "3000",
      settlementMethod: "cash" as const,
      paymentMethod: "نقدي",
      receiverName: "أحمد محمد",
      notes: "تحصيل فاتورة بيع نقدي",
    },
    {
      partyRef: partyRefs.customer2,
      amountEgp: "5000",
      settlementMethod: "cash" as const,
      paymentMethod: "فودافون كاش",
      referenceNumber: "VC-2025-9876",
      notes: "تحصيل جزئي من شركة البركة",
    },
  ];

  for (const pmt of paymentData) {
    const exists = await checkPaymentExists(pmt.partyRef.id, pmt.amountEgp, pmt.notes);
    if (exists) {
      console.log(`   ↳ Payment for "${pmt.partyRef.name}" (${pmt.amountEgp} EGP) already exists, skipping...`);
      skipped++;
      continue;
    }

    console.log(`   ↳ Creating payment for "${pmt.partyRef.name}" (${pmt.amountEgp} EGP)...`);
    await storage.createLocalPayment({
      partyId: pmt.partyRef.id,
      seasonId: pmt.partyRef.seasonId,
      paymentDate: today,
      amountEgp: pmt.amountEgp,
      settlementMethod: pmt.settlementMethod,
      paymentMethod: pmt.paymentMethod,
      receiverName: pmt.receiverName,
      referenceNumber: pmt.referenceNumber,
      notes: pmt.notes,
    });
    created++;
    console.log(`   ✓ Created payment for "${pmt.partyRef.name}"`);
  }

  return { created, skipped };
}

async function checkReturnCaseExists(partyId: number, notes: string, resolutionNote?: string): Promise<boolean> {
  const existing = await db
    .select()
    .from(returnCases)
    .where(eq(returnCases.partyId, partyId));
  const normalizedNotes = (notes || "").trim();
  const normalizedResolutionNote = (resolutionNote || "").trim();
  return existing.some((rc) => {
    const existingNotes = (rc.notes || "").trim();
    return existingNotes === normalizedNotes || (normalizedResolutionNote && existingNotes === normalizedResolutionNote);
  });
}

async function seedReturnCasesIdempotent(
  partyRefs: PartyRefs,
  invoices: any[]
): Promise<{ created: number; skipped: number; resolved: number }> {
  console.log("\n🔄 Seeding return cases (idempotent)...");

  let created = 0;
  let skipped = 0;
  let resolved = 0;

  const saleInvoiceCustomer2 = invoices.find(
    (inv) => inv.partyId === partyRefs.customer2.id && inv.invoiceKind === "sale"
  );

  const returnCaseData = [
    {
      partyRef: partyRefs.customer2,
      partyTypeSnapshot: "customer" as const,
      sourceInvoiceId: saleInvoiceCustomer2?.id,
      status: "under_inspection" as const,
      pieces: 12,
      cartons: 1,
      notes: "بضاعة مرتجعة - في انتظار الفحص",
      resolution: null,
    },
    {
      partyRef: partyRefs.customer1,
      partyTypeSnapshot: "customer" as const,
      status: "under_inspection" as const,
      pieces: 10,
      cartons: 1,
      notes: "مرتجع من العميل - عيب صناعة",
      resolution: {
        resolution: "accepted_return" as const,
        amountEgp: 500,
        pieces: 10,
        cartons: 1,
        resolutionNote: "تم قبول المرتجع وخصم المبلغ من الرصيد",
      },
    },
    {
      partyRef: partyRefs.merchant2,
      partyTypeSnapshot: "merchant" as const,
      status: "under_inspection" as const,
      pieces: 24,
      cartons: 2,
      notes: "مرتجع إلى المورد - ألوان غير مطابقة",
      resolution: {
        resolution: "exchange" as const,
        amountEgp: 0,
        pieces: 24,
        cartons: 2,
        resolutionNote: "تم استبدال البضاعة بأخرى مطابقة",
      },
    },
    {
      partyRef: partyRefs.merchant2,
      partyTypeSnapshot: "merchant" as const,
      status: "under_inspection" as const,
      pieces: 5,
      cartons: 0,
      notes: "بضاعة تالفة أثناء النقل",
      resolution: {
        resolution: "damaged" as const,
        amountEgp: 250,
        pieces: 5,
        cartons: 0,
        resolutionNote: "تم شطب البضاعة كتالف - خسارة",
      },
    },
  ];

  for (const rc of returnCaseData) {
    const resolutionNote = rc.resolution?.resolutionNote;
    const exists = await checkReturnCaseExists(rc.partyRef.id, rc.notes, resolutionNote);
    if (exists) {
      console.log(`   ↳ Return case "${rc.notes.substring(0, 30)}..." already exists, skipping...`);
      skipped++;
      continue;
    }

    console.log(`   ↳ Creating return case for "${rc.partyRef.name}"...`);
    const newCase = await storage.createReturnCase({
      partyId: rc.partyRef.id,
      partyTypeSnapshot: rc.partyTypeSnapshot,
      seasonId: rc.partyRef.seasonId,
      sourceInvoiceId: rc.sourceInvoiceId,
      status: rc.status,
      pieces: rc.pieces,
      cartons: rc.cartons,
      notes: rc.notes,
    });
    created++;

    if (rc.resolution) {
      await storage.resolveReturnCase(newCase.id, rc.resolution, null as any);
      resolved++;
      console.log(`   ✓ Created and resolved return case (id=${newCase.id})`);
    } else {
      console.log(`   ✓ Created return case (id=${newCase.id})`);
    }
  }

  return { created, skipped, resolved };
}

interface VerificationResult {
  passed: boolean;
  message: string;
}

async function verifyData(partyRefs: PartyRefs): Promise<{
  checks: VerificationResult[];
  ledgerEntriesCount: number;
  balances: Map<string, { balance: string; direction: string }>;
}> {
  console.log("\n🔍 Verifying data...");

  const checks: VerificationResult[] = [];

  const allParties = await db.select().from(parties);
  const partiesCheck = allParties.length >= 4;
  checks.push({
    passed: partiesCheck,
    message: `Parties count >= 4: ${allParties.length} found`,
  });

  const allInvoices = await db.select().from(localInvoices);
  const invoicesCheck = allInvoices.length >= 6;
  checks.push({
    passed: invoicesCheck,
    message: `Invoices count >= 6: ${allInvoices.length} found`,
  });

  const allPayments = await db.select().from(localPayments);
  const paymentsCheck = allPayments.length >= 4;
  checks.push({
    passed: paymentsCheck,
    message: `Payments count >= 4: ${allPayments.length} found`,
  });

  const ledgerEntries = await db.select().from(partyLedgerEntries);
  const ledgerCheck = ledgerEntries.length > 0;
  checks.push({
    passed: ledgerCheck,
    message: `Ledger entries exist: ${ledgerEntries.length} found`,
  });

  const allReturnCases = await db.select().from(returnCases);
  const returnCasesCheck = allReturnCases.length >= 4;
  checks.push({
    passed: returnCasesCheck,
    message: `Return cases count >= 4: ${allReturnCases.length} found`,
  });

  const partyNames = [
    { id: partyRefs.merchant1.id, name: "مكتبة النور" },
    { id: partyRefs.merchant2.id, name: "معرض الأمل للأدوات" },
    { id: partyRefs.customer1.id, name: "أحمد محمد" },
    { id: partyRefs.customer2.id, name: "شركة البركة التجارية" },
  ];

  const balances = new Map<string, { balance: string; direction: string }>();

  for (const party of partyNames) {
    try {
      const balance = await storage.getPartyBalance(party.id);
      balances.set(party.name, { balance: balance.balanceEgp, direction: balance.direction });
      checks.push({
        passed: true,
        message: `Balance for "${party.name}": ${balance.balanceEgp} EGP (${balance.direction})`,
      });
    } catch (error) {
      checks.push({
        passed: false,
        message: `Failed to get balance for "${party.name}": ${error}`,
      });
    }
  }

  return { checks, ledgerEntriesCount: ledgerEntries.length, balances };
}

function printReport(
  stats: {
    partiesCreated: number;
    partiesSkipped: number;
    invoicesCreated: number;
    invoicesSkipped: number;
    paymentsCreated: number;
    paymentsSkipped: number;
    returnCasesCreated: number;
    returnCasesSkipped: number;
    returnCasesResolved: number;
  },
  verification: Awaited<ReturnType<typeof verifyData>>
) {
  console.log("\n" + "═".repeat(60));
  console.log("               LOCAL TRADE SEED DATA REPORT");
  console.log("═".repeat(60));

  console.log("\n📊 SEEDING SUMMARY:");
  console.log(`   Parties:      ${stats.partiesCreated} created, ${stats.partiesSkipped} skipped`);
  console.log(`   Invoices:     ${stats.invoicesCreated} created, ${stats.invoicesSkipped} skipped`);
  console.log(`   Payments:     ${stats.paymentsCreated} created, ${stats.paymentsSkipped} skipped`);
  console.log(`   Return Cases: ${stats.returnCasesCreated} created, ${stats.returnCasesSkipped} skipped (${stats.returnCasesResolved} resolved)`);
  console.log(`   Ledger Entries: ${verification.ledgerEntriesCount} total`);

  console.log("\n✅ VERIFICATION RESULTS:");
  let allPassed = true;
  for (const check of verification.checks) {
    const status = check.passed ? "[PASS]" : "[FAIL]";
    const icon = check.passed ? "✓" : "✗";
    console.log(`   ${icon} ${status} ${check.message}`);
    if (!check.passed) allPassed = false;
  }

  console.log("\n💰 BALANCE SUMMARY:");
  for (const [name, data] of verification.balances) {
    const directionAr = data.direction === "debit" ? "مدين" : data.direction === "credit" ? "دائن" : "صفر";
    console.log(`   ${name}: ${data.balance} ج.م (${directionAr})`);
  }

  console.log("\n" + "═".repeat(60));
  if (allPassed) {
    console.log("✅ ALL CHECKS PASSED - Seed completed successfully!");
  } else {
    console.log("⚠️  SOME CHECKS FAILED - Review the results above.");
  }
  console.log("═".repeat(60));
}

async function seed() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to run seeds.");
  }

  if (!checkEnvironment()) {
    process.exitCode = 1;
    return;
  }

  const { force } = parseArgs();

  console.log("═".repeat(60));
  console.log("       LOCAL TRADE SEED SCRIPT (SAFE / IDEMPOTENT)");
  console.log("═".repeat(60));
  console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`   Force mode:  ${force ? "ON" : "OFF"}`);
  console.log("");

  const existingData = await checkExistingData();

  if (existingData.hasParties || existingData.hasInvoices || existingData.hasPayments) {
    console.log("⚠️  WARNING: Existing data detected:");
    console.log(`   - Parties:  ${existingData.partiesCount}`);
    console.log(`   - Invoices: ${existingData.invoicesCount}`);
    console.log(`   - Payments: ${existingData.paymentsCount}`);
    console.log("");
    console.log("   This script will ADD new data without deleting existing records.");
    console.log("   Duplicate checks are in place to prevent re-creating existing items.");

    if (!force) {
      console.log("\n   To proceed with existing data, run with --force flag:");
      console.log("   npx tsx scripts/seed-local-trade.ts --force");
      console.log("");
      console.log("   Proceeding anyway (idempotent mode)...");
    }
  }

  console.log("\n🚀 Starting Local Trade seed...\n");

  const productTypeIds = await ensureProductTypes();
  const partyRefs = await seedPartiesIdempotent();
  const { invoices, created: invoicesCreated, skipped: invoicesSkipped } = await seedInvoicesIdempotent(partyRefs, productTypeIds);
  const { created: paymentsCreated, skipped: paymentsSkipped } = await seedPaymentsIdempotent(partyRefs);
  const { created: returnCasesCreated, skipped: returnCasesSkipped, resolved: returnCasesResolved } = await seedReturnCasesIdempotent(partyRefs, invoices);

  const partiesCreated = Object.values(partyRefs).filter((p) => p.isNew).length;
  const partiesSkipped = Object.values(partyRefs).filter((p) => !p.isNew).length;

  const verification = await verifyData(partyRefs);

  printReport(
    {
      partiesCreated,
      partiesSkipped,
      invoicesCreated,
      invoicesSkipped,
      paymentsCreated,
      paymentsSkipped,
      returnCasesCreated,
      returnCasesSkipped,
      returnCasesResolved,
    },
    verification
  );
}

seed()
  .catch((error) => {
    console.error("\n❌ Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
