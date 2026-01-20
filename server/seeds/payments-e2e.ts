import "dotenv/config";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  exchangeRates,
  shipmentCustomsDetails,
  shipmentItems,
  shipmentShippingDetails,
  shipments,
  suppliers,
  users,
} from "@shared/schema";
import { db, pool } from "../db";
import { DatabaseStorage } from "../storage";

const storage = new DatabaseStorage();
const formatDate = (date: Date) => date.toISOString().slice(0, 10);

async function resetDatabase() {
  console.log("Resetting payment-related tables...");
  await db.execute(
    sql`TRUNCATE TABLE shipment_payments, shipment_shipping_details, shipment_customs_details, shipment_items, shipments, suppliers, exchange_rates, users RESTART IDENTITY CASCADE`,
  );
}

async function seedUsers() {
  console.log("Creating users...");
  const password = await bcrypt.hash("123123123", 10);

  const [root, manager, accountant, viewer] = await db
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
      {
        username: "viewer",
        password,
        firstName: "مشاهد",
        lastName: "تقارير",
        role: "مشاهد",
      },
    ])
    .returning();

  return { root, manager, accountant, viewer };
}

async function seedSuppliers() {
  console.log("Creating suppliers...");
  const [dragon, lotus] = await db
    .insert(suppliers)
    .values([
      {
        name: "Dragon Imports",
        description: "مورد أجهزة وإلكترونيات من الصين",
        country: "الصين",
        phone: "+86-10-1234-5678",
        email: "sales@dragon.cn",
        address: "Guangzhou, China",
      },
      {
        name: "Lotus Trading",
        description: "مورد ملابس وأحذية بالجملة",
        country: "الصين",
        phone: "+86-21-9876-5432",
        email: "info@lotus.cn",
        address: "Yiwu, China",
      },
    ])
    .returning();

  return { dragon, lotus };
}

async function seedExchangeRates(today: Date, yesterday: Date) {
  console.log("Creating exchange rates...");
  const rmbToEgpToday = "7.2500";
  const rmbToEgpYesterday = "7.1000";
  const usdToRmbToday = "7.2100";
  const usdToRmbYesterday = "7.0500";

  await db.insert(exchangeRates).values([
    {
      rateDate: formatDate(yesterday),
      fromCurrency: "RMB",
      toCurrency: "EGP",
      rateValue: rmbToEgpYesterday,
      source: "إغلاق الأسبوع الماضي",
    },
    {
      rateDate: formatDate(today),
      fromCurrency: "RMB",
      toCurrency: "EGP",
      rateValue: rmbToEgpToday,
      source: "سعر اليوم",
    },
    {
      rateDate: formatDate(yesterday),
      fromCurrency: "USD",
      toCurrency: "RMB",
      rateValue: usdToRmbYesterday,
      source: "إغلاق الأسبوع الماضي",
    },
    {
      rateDate: formatDate(today),
      fromCurrency: "USD",
      toCurrency: "RMB",
      rateValue: usdToRmbToday,
      source: "سعر اليوم",
    },
  ]);

  return {
    rmbToEgpToday,
    usdToRmbToday,
  };
}

async function seedShipments({
  rmbToEgpRate,
  usdToRmbRate,
  suppliers: supplierRefs,
  users: userRefs,
}: {
  rmbToEgpRate: string;
  usdToRmbRate: string;
  suppliers: Awaited<ReturnType<typeof seedSuppliers>>;
  users: Awaited<ReturnType<typeof seedUsers>>;
}) {
  console.log("Creating shipments and items...");
  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);
  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(today.getDate() - 14);
  const lastMonth = new Date(today);
  lastMonth.setDate(today.getDate() - 30);

  const [newShipment, awaitingShipment, readyShipment, deliveredShipment] = await db
    .insert(shipments)
    .values([
      {
        shipmentCode: "PAY-NEW-001",
        shipmentName: "أحذية رياضية",
        purchaseDate: formatDate(twoWeeksAgo),
        status: "جديدة",
        createdByUserId: userRefs.root.id,
        purchaseCostRmb: "1500.00",
        purchaseCostEgp: "10650.00",
        purchaseRmbToEgpRate: "7.1000",
        commissionCostRmb: "0",
        commissionCostEgp: "0",
        shippingCostRmb: "0",
        shippingCostEgp: "0",
        customsCostEgp: "0",
        takhreegCostEgp: "0",
        finalTotalCostEgp: "10650.00",
        totalPaidEgp: "0",
        balanceEgp: "10650.00",
      },
      {
        shipmentCode: "PAY-TRANSIT-002",
        shipmentName: "معدات إلكترونية",
        purchaseDate: formatDate(lastWeek),
        status: "في انتظار الشحن",
        createdByUserId: userRefs.manager.id,
        purchaseCostRmb: "2200.00",
        purchaseCostEgp: "15950.00",
        purchaseRmbToEgpRate: rmbToEgpRate,
        commissionCostRmb: "120.00",
        commissionCostEgp: "870.00",
        shippingCostRmb: "648.00",
        shippingCostEgp: "4698.00",
        customsCostEgp: "0",
        takhreegCostEgp: "0",
        finalTotalCostEgp: "21518.00",
        totalPaidEgp: "0",
        balanceEgp: "21518.00",
      },
      {
        shipmentCode: "PAY-READY-003",
        shipmentName: "ملابس موسمية",
        purchaseDate: formatDate(lastMonth),
        status: "جاهزة للاستلام",
        createdByUserId: userRefs.manager.id,
        purchaseCostRmb: "3000.00",
        purchaseCostEgp: "21750.00",
        purchaseRmbToEgpRate: rmbToEgpRate,
        commissionCostRmb: "200.00",
        commissionCostEgp: "1450.00",
        shippingCostRmb: "800.00",
        shippingCostEgp: "5800.00",
        customsCostEgp: "4000.00",
        takhreegCostEgp: "0",
        finalTotalCostEgp: "33000.00",
        totalPaidEgp: "0",
        balanceEgp: "33000.00",
      },
      {
        shipmentCode: "PAY-DONE-004",
        shipmentName: "أكسسوارات وإكسسوارات",
        purchaseDate: formatDate(lastMonth),
        status: "مستلمة بنجاح",
        createdByUserId: userRefs.root.id,
        purchaseCostRmb: "4000.00",
        purchaseCostEgp: "29000.00",
        purchaseRmbToEgpRate: rmbToEgpRate,
        commissionCostRmb: "300.00",
        commissionCostEgp: "2175.00",
        shippingCostRmb: "1000.00",
        shippingCostEgp: "7250.00",
        customsCostEgp: "6000.00",
        takhreegCostEgp: "2000.00",
        finalTotalCostEgp: "46425.00",
        totalPaidEgp: "0",
        balanceEgp: "46425.00",
      },
    ])
    .returning();

  await db.insert(shipmentItems).values([
    {
      shipmentId: newShipment.id,
      supplierId: supplierRefs.dragon.id,
      productName: "حذاء جري مهوّى",
      productType: "أحذية",
      cartonsCtn: 10,
      piecesPerCartonPcs: 20,
      totalPiecesCou: 200,
      purchasePricePerPiecePriRmb: "4.50",
      totalPurchaseCostRmb: "900.00",
    },
    {
      shipmentId: newShipment.id,
      supplierId: supplierRefs.lotus.id,
      productName: "حذاء تدريب",
      productType: "أحذية",
      cartonsCtn: 5,
      piecesPerCartonPcs: 15,
      totalPiecesCou: 75,
      purchasePricePerPiecePriRmb: "8.00",
      totalPurchaseCostRmb: "600.00",
    },
    {
      shipmentId: awaitingShipment.id,
      supplierId: supplierRefs.dragon.id,
      productName: "لوحة تحكم إلكترونية",
      productType: "إلكترونيات",
      cartonsCtn: 4,
      piecesPerCartonPcs: 10,
      totalPiecesCou: 40,
      purchasePricePerPiecePriRmb: "55.00",
      totalPurchaseCostRmb: "2200.00",
    },
    {
      shipmentId: readyShipment.id,
      supplierId: supplierRefs.lotus.id,
      productName: "سترات شتوية",
      productType: "ملابس",
      cartonsCtn: 6,
      piecesPerCartonPcs: 20,
      totalPiecesCou: 120,
      purchasePricePerPiecePriRmb: "25.00",
      totalPurchaseCostRmb: "3000.00",
    },
    {
      shipmentId: deliveredShipment.id,
      supplierId: supplierRefs.dragon.id,
      productName: "ساعات ذكية",
      productType: "إلكترونيات",
      cartonsCtn: 8,
      piecesPerCartonPcs: 15,
      totalPiecesCou: 120,
      purchasePricePerPiecePriRmb: "33.33",
      totalPurchaseCostRmb: "3999.60",
    },
  ]);

  await db.insert(shipmentShippingDetails).values([
    {
      shipmentId: awaitingShipment.id,
      totalPurchaseCostRmb: "2200.00",
      commissionRatePercent: "5.00",
      commissionValueRmb: "120.00",
      commissionValueEgp: "870.00",
      shippingAreaSqm: "5.00",
      shippingCostPerSqmUsdOriginal: "18.00",
      totalShippingCostUsdOriginal: "90.00",
      totalShippingCostRmb: "648.00",
      totalShippingCostEgp: "4698.00",
      shippingDate: formatDate(lastWeek),
      rmbToEgpRateAtShipping: rmbToEgpRate,
      usdToRmbRateAtShipping: usdToRmbRate,
      sourceOfRates: "Seed shipping quote",
      ratesUpdatedAt: lastWeek,
    },
    {
      shipmentId: readyShipment.id,
      totalPurchaseCostRmb: "3000.00",
      commissionRatePercent: "6.50",
      commissionValueRmb: "200.00",
      commissionValueEgp: "1450.00",
      shippingAreaSqm: "8.00",
      shippingCostPerSqmUsdOriginal: "17.00",
      totalShippingCostUsdOriginal: "136.00",
      totalShippingCostRmb: "800.00",
      totalShippingCostEgp: "5800.00",
      shippingDate: formatDate(lastMonth),
      rmbToEgpRateAtShipping: rmbToEgpRate,
      usdToRmbRateAtShipping: usdToRmbRate,
      sourceOfRates: "Seed shipping quote",
      ratesUpdatedAt: lastMonth,
    },
    {
      shipmentId: deliveredShipment.id,
      totalPurchaseCostRmb: "4000.00",
      commissionRatePercent: "7.00",
      commissionValueRmb: "300.00",
      commissionValueEgp: "2175.00",
      shippingAreaSqm: "9.50",
      shippingCostPerSqmUsdOriginal: "18.50",
      totalShippingCostUsdOriginal: "175.75",
      totalShippingCostRmb: "1000.00",
      totalShippingCostEgp: "7250.00",
      shippingDate: formatDate(lastMonth),
      rmbToEgpRateAtShipping: rmbToEgpRate,
      usdToRmbRateAtShipping: usdToRmbRate,
      sourceOfRates: "Seed shipping quote",
      ratesUpdatedAt: lastMonth,
    },
  ]);

  await db.insert(shipmentCustomsDetails).values([
    {
      shipmentId: readyShipment.id,
      totalCustomsCostEgp: "4000.00",
      totalTakhreegCostEgp: "0",
      customsInvoiceDate: formatDate(lastWeek),
    },
    {
      shipmentId: deliveredShipment.id,
      totalCustomsCostEgp: "6000.00",
      totalTakhreegCostEgp: "2000.00",
      customsInvoiceDate: formatDate(today),
    },
  ]);

  return {
    newShipment,
    awaitingShipment,
    readyShipment,
    deliveredShipment,
  };
}

async function seedPayments({
  rmbToEgpRate,
  shipments: shipmentRefs,
  users: userRefs,
}: {
  rmbToEgpRate: string;
  shipments: Awaited<ReturnType<typeof seedShipments>>;
  users: Awaited<ReturnType<typeof seedUsers>>;
}) {
  console.log("Creating payments...");

  await storage.createPayment({
    shipmentId: shipmentRefs.newShipment.id,
    paymentDate: new Date(),
    paymentCurrency: "RMB",
    amountOriginal: "300.00",
    exchangeRateToEgp: rmbToEgpRate,
    amountEgp: "0",
    costComponent: "شراء",
    paymentMethod: "تحويل بنكي",
    cashReceiverName: "Dragon Imports",
    referenceNumber: "NEW-001-RMB",
    note: "دفعة مبدئية على الشحنة الجديدة",
    createdByUserId: userRefs.root.id,
  });

  await storage.createPayment({
    shipmentId: shipmentRefs.awaitingShipment.id,
    paymentDate: new Date(),
    paymentCurrency: "EGP",
    amountOriginal: "4000.00",
    exchangeRateToEgp: null,
    amountEgp: "4000.00",
    costComponent: "شحن",
    paymentMethod: "إنستاباي",
    cashReceiverName: "Dragon Imports",
    referenceNumber: "TRANSIT-002-EGP",
    note: "دفعة تغطي جزء من الشحن أثناء الانتظار",
    createdByUserId: userRefs.accountant.id,
  });

  await storage.createPayment({
    shipmentId: shipmentRefs.readyShipment.id,
    paymentDate: new Date(),
    paymentCurrency: "RMB",
    amountOriginal: "500.00",
    exchangeRateToEgp: rmbToEgpRate,
    amountEgp: "0",
    costComponent: "عمولة",
    paymentMethod: "تحويل بنكي",
    cashReceiverName: "Lotus Trading",
    referenceNumber: "READY-003-RMB",
    note: "سداد عمولة مع اقتراب الاستلام",
    createdByUserId: userRefs.manager.id,
  });

  await storage.createPayment({
    shipmentId: shipmentRefs.deliveredShipment.id,
    paymentDate: new Date(),
    paymentCurrency: "EGP",
    amountOriginal: "20000.00",
    exchangeRateToEgp: null,
    amountEgp: "20000.00",
    costComponent: "جمارك",
    paymentMethod: "تحويل بنكي",
    cashReceiverName: "منفذ جمركي",
    referenceNumber: "DONE-004-EGP",
    note: "سداد جمارك بعد التسليم",
    createdByUserId: userRefs.accountant.id,
  });
}

async function seed() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 3);

  await resetDatabase();
  const users = await seedUsers();
  const suppliers = await seedSuppliers();
  const { rmbToEgpToday, usdToRmbToday } = await seedExchangeRates(today, yesterday);
  const shipments = await seedShipments({
    rmbToEgpRate: rmbToEgpToday,
    usdToRmbRate: usdToRmbToday,
    suppliers,
    users,
  });
  await seedPayments({
    rmbToEgpRate: rmbToEgpToday,
    shipments,
    users,
  });

  console.log("Payment E2E seed data created successfully.");
}

seed()
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
