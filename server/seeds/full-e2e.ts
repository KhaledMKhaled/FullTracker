import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  exchangeRates,
  shipmentCustomsDetails,
  shipmentItems,
  shipmentShippingDetails,
  shipments,
  shippingCompanies,
  suppliers,
  users,
} from "@shared/schema";
import { db, pool } from "../db";
import { DatabaseStorage } from "../storage";

const storage = new DatabaseStorage();
type ShipmentRow = typeof shipments.$inferSelect;

const seedRandom = (seed = 20240315) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

const rng = seedRandom(20250311);
const pick = <T,>(items: T[]) => items[Math.floor(rng() * items.length)];

const formatDate = (date: Date) => date.toISOString().slice(0, 10);
const formatAmount = (value: number, decimals = 2) => value.toFixed(decimals);

async function resetDatabase() {
  console.log("Resetting tables...");
  await db.execute(
    sql`TRUNCATE TABLE
      audit_logs,
      shipment_payments,
      shipment_shipping_details,
      shipment_customs_details,
      shipment_items,
      shipments,
      shipping_companies,
      suppliers,
      exchange_rates,
      users
      RESTART IDENTITY CASCADE`,
  );
}

async function seedUsers() {
  console.log("Creating users...");
  const password = await bcrypt.hash("123123123", 10);

  const [root, manager, accountant] = await db
    .insert(users)
    .values([
      {
        username: "root",
        password,
        firstName: "المدير",
        lastName: "الرئيسي",
        role: "مدير",
      },
      {
        username: "manager",
        password,
        firstName: "مدير",
        lastName: "الشحنات",
        role: "مدير",
      },
      {
        username: "accountant",
        password,
        firstName: "محاسب",
        lastName: "مالي",
        role: "محاسب",
      },
    ])
    .returning();

  return { root, manager, accountant };
}

async function seedShippingCompanies() {
  console.log("Creating shipping companies...");
  const baseNames = [
    "دلتا",
    "الأفق",
    "السريع",
    "الشرق",
    "النورس",
    "الأمان",
    "السماء",
    "النجمة",
    "الميناء",
    "الطريق",
  ];

  const records = Array.from({ length: 30 }, (_, index) => {
    const suffix = (index + 1).toString().padStart(2, "0");
    return {
      name: `شركة شحن ${pick(baseNames)} ${suffix}`,
      contactName: `جهة اتصال ${suffix}`,
      phone: `+20-10-55${suffix}0${suffix}`,
      email: `shipping${suffix}@example.com`,
      address: `القاهرة، شارع ${suffix}`,
      notes: index % 3 === 0 ? "شركة شحن موثوقة" : null,
      isActive: true,
    };
  });

  return db.insert(shippingCompanies).values(records).returning();
}

async function seedSuppliers() {
  console.log("Creating suppliers...");
  const supplierNames = [
    "Dragon Imports",
    "Lotus Trading",
    "Sunrise Export",
    "Oriental Merchants",
    "Golden Gate Supply",
    "Jade Manufacturing",
  ];

  const records = Array.from({ length: 20 }, (_, index) => {
    const suffix = (index + 1).toString().padStart(2, "0");
    return {
      name: `${pick(supplierNames)} ${suffix}`,
      description: "مورد بضائع بالجملة",
      country: "الصين",
      phone: `+86-21-88${suffix}00`,
      email: `supplier${suffix}@example.cn`,
      address: `Yiwu, Block ${suffix}`,
    };
  });

  return db.insert(suppliers).values(records).returning();
}

async function seedExchangeRates() {
  console.log("Creating exchange rates...");
  const today = new Date();
  const entries = [];

  for (let i = 0; i < 5; i += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    entries.push(
      {
        rateDate: formatDate(date),
        fromCurrency: "RMB",
        toCurrency: "EGP",
        rateValue: formatAmount(7.1 + i * 0.03, 4),
        source: `سعر يوم ${i + 1}`,
      },
      {
        rateDate: formatDate(date),
        fromCurrency: "USD",
        toCurrency: "RMB",
        rateValue: formatAmount(7.05 + i * 0.02, 4),
        source: `سعر يوم ${i + 1}`,
      },
    );
  }

  await db.insert(exchangeRates).values(entries);
  return entries[0];
}

async function seedShipments({
  shippingCompanyIds,
  supplierIds,
  userIds,
  rmbToEgpRate,
}: {
  shippingCompanyIds: number[];
  supplierIds: number[];
  userIds: string[];
  rmbToEgpRate: string;
}) {
  console.log("Creating shipments, items, and details...");
  const statuses = ["جديدة", "في انتظار الشحن", "جاهزة للاستلام", "مستلمة بنجاح"];
  const today = new Date();

  const shipmentRecords = Array.from({ length: 50 }, (_, index) => {
    const purchaseRmb = 1200 + Math.floor(rng() * 4000);
    const commissionRmb = Math.round(purchaseRmb * (0.04 + rng() * 0.06));
    const shippingRmb = Math.round(purchaseRmb * (0.1 + rng() * 0.2));
    const customsEgp = Math.round(3000 + rng() * 5000);
    const takhreegEgp = Math.round(500 + rng() * 1500);
    const purchaseRate = parseFloat(rmbToEgpRate);
    const purchaseEgp = purchaseRmb * purchaseRate;
    const commissionEgp = commissionRmb * purchaseRate;
    const shippingEgp = shippingRmb * purchaseRate;
    const finalTotal =
      purchaseEgp + commissionEgp + shippingEgp + customsEgp + takhreegEgp;

    const purchaseDate = new Date(today);
    purchaseDate.setDate(today.getDate() - index);

    return {
      shipmentCode: `SHIP-${(index + 1).toString().padStart(3, "0")}`,
      shipmentName: `شحنة رقم ${(index + 1).toString().padStart(2, "0")}`,
      purchaseDate: formatDate(purchaseDate),
      status: statuses[index % statuses.length],
      shippingCompanyId: pick(shippingCompanyIds),
      createdByUserId: pick(userIds),
      purchaseCostRmb: formatAmount(purchaseRmb),
      purchaseCostEgp: formatAmount(purchaseEgp),
      purchaseRmbToEgpRate: formatAmount(purchaseRate, 4),
      commissionCostRmb: formatAmount(commissionRmb),
      commissionCostEgp: formatAmount(commissionEgp),
      shippingCostRmb: formatAmount(shippingRmb),
      shippingCostEgp: formatAmount(shippingEgp),
      customsCostEgp: formatAmount(customsEgp),
      takhreegCostEgp: formatAmount(takhreegEgp),
      finalTotalCostEgp: formatAmount(finalTotal),
      totalPaidEgp: "0",
      balanceEgp: formatAmount(finalTotal),
    };
  });

  const shipmentRows = await db.insert(shipments).values(shipmentRecords).returning();

  const itemRows = shipmentRows.flatMap((shipment) =>
    Array.from({ length: 2 }, (_, index) => {
      const pieces = 40 + Math.floor(rng() * 60);
      const priceRmb = 12 + rng() * 8;
      const totalPurchase = pieces * priceRmb;
      return {
        shipmentId: shipment.id,
        supplierId: pick(supplierIds),
        productName: `منتج ${shipment.id}-${index + 1}`,
        cartonsCtn: 5 + Math.floor(rng() * 10),
        piecesPerCartonPcs: 10,
        totalPiecesCou: pieces,
        purchasePricePerPiecePriRmb: formatAmount(priceRmb, 4),
        totalPurchaseCostRmb: formatAmount(totalPurchase),
      };
    }),
  );
  await db.insert(shipmentItems).values(itemRows);

  const shippingDetailRows = shipmentRows.map((shipment) => {
    const area = 4 + rng() * 8;
    const costPerSqm = 16 + rng() * 6;
    const shippingUsd = area * costPerSqm;
    const usdToRmb = 7.1 + rng() * 0.4;
    const shippingRmb = shippingUsd * usdToRmb;
    const shippingEgp = shippingRmb * parseFloat(rmbToEgpRate);
    return {
      shipmentId: shipment.id,
      totalPurchaseCostRmb: shipment.purchaseCostRmb,
      commissionRatePercent: "6.00",
      commissionValueRmb: shipment.commissionCostRmb,
      commissionValueEgp: shipment.commissionCostEgp,
      shippingAreaSqm: formatAmount(area, 2),
      shippingCostPerSqmUsdOriginal: formatAmount(costPerSqm, 2),
      totalShippingCostUsdOriginal: formatAmount(shippingUsd, 2),
      totalShippingCostRmb: formatAmount(shippingRmb, 2),
      totalShippingCostEgp: formatAmount(shippingEgp, 2),
      shippingDate: formatDate(today),
      rmbToEgpRateAtShipping: formatAmount(parseFloat(rmbToEgpRate), 4),
      usdToRmbRateAtShipping: formatAmount(usdToRmb, 4),
      sourceOfRates: "Seed shipping quote",
      ratesUpdatedAt: new Date(),
    };
  });
  await db.insert(shipmentShippingDetails).values(shippingDetailRows);

  const customsRows = shipmentRows.map((shipment) => ({
    shipmentId: shipment.id,
    totalCustomsCostEgp: shipment.customsCostEgp,
    totalTakhreegCostEgp: shipment.takhreegCostEgp,
    customsInvoiceDate: formatDate(today),
  }));
  await db.insert(shipmentCustomsDetails).values(customsRows);

  return shipmentRows;
}

async function seedPayments({
  shipmentRows,
  userIds,
  shippingCompanyIdMap,
  rmbToEgpRate,
}: {
  shipmentRows: ShipmentRow[];
  userIds: string[];
  shippingCompanyIdMap: Map<number, number | null>;
  rmbToEgpRate: string;
}) {
  console.log("Creating payments...");

  for (const shipment of shipmentRows) {
    const purchasePayment = {
      shipmentId: shipment.id,
      paymentDate: new Date(),
      paymentCurrency: "RMB",
      amountOriginal: formatAmount(200 + rng() * 400),
      exchangeRateToEgp: rmbToEgpRate,
      amountEgp: "0",
      costComponent: "شراء",
      paymentMethod: "تحويل بنكي",
      cashReceiverName: "مورد رئيسي",
      referenceNumber: `PAY-${shipment.id}-P1`,
      note: "دفعة أولى على الشحنة",
      createdByUserId: pick(userIds),
    };

    const shippingPayment = {
      shipmentId: shipment.id,
      paymentDate: new Date(),
      paymentCurrency: "EGP",
      amountOriginal: formatAmount(500 + rng() * 1500),
      exchangeRateToEgp: null,
      amountEgp: formatAmount(500 + rng() * 1500),
      costComponent: "شحن",
      paymentMethod: "إنستاباي",
      cashReceiverName: "شركة الشحن",
      referenceNumber: `PAY-${shipment.id}-P2`,
      note: "دفعة شحن لاحقة",
      createdByUserId: pick(userIds),
      partyType: "shipping_company",
      partyId: shippingCompanyIdMap.get(shipment.id) ?? null,
    };

    const customsPayment = {
      shipmentId: shipment.id,
      paymentDate: new Date(),
      paymentCurrency: "EGP",
      amountOriginal: formatAmount(600 + rng() * 1200),
      exchangeRateToEgp: null,
      amountEgp: formatAmount(600 + rng() * 1200),
      costComponent: "جمارك",
      paymentMethod: "نقدي",
      cashReceiverName: "منفذ جمركي",
      referenceNumber: `PAY-${shipment.id}-P3`,
      note: "دفعة جمارك لاحقة",
      createdByUserId: pick(userIds),
    };

    await storage.createPayment(purchasePayment);
    await storage.createPayment(shippingPayment);
    await storage.createPayment(customsPayment);
  }
}

async function seed() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to run seeds.");
  }

  await resetDatabase();
  const userRefs = await seedUsers();
  const shippingCompanyRefs = await seedShippingCompanies();
  const supplierRefs = await seedSuppliers();
  const latestRate = await seedExchangeRates();

  const shippingCompanyIds = shippingCompanyRefs.map((company) => company.id);
  const supplierIds = supplierRefs.map((supplier) => supplier.id);
  const userIds = [userRefs.root.id, userRefs.manager.id, userRefs.accountant.id];

  const shipmentRows = await seedShipments({
    shippingCompanyIds,
    supplierIds,
    userIds,
    rmbToEgpRate: latestRate.rateValue,
  });

  const shippingCompanyIdMap = new Map(
    shipmentRows.map((shipment) => [shipment.id, shipment.shippingCompanyId ?? null]),
  );

  await seedPayments({
    shipmentRows,
    userIds,
    shippingCompanyIdMap,
    rmbToEgpRate: latestRate.rateValue,
  });

  console.log("Full E2E seed data created successfully.");
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
