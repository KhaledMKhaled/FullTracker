/**
 * High-Volume Test Seed Script
 * Creates realistic data for comprehensive system testing
 * Focus: Payment flow validation
 */

import { db } from "../server/db";
import { 
  users, suppliers, products, shipments, shipmentItems, 
  shipmentShippingDetails, shipmentCustomsDetails, exchangeRates,
  shipmentPayments, inventoryMovements, auditLogs
} from "../shared/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

const SUPPLIER_COUNT = 25;
const SHIPMENT_COUNT = 250;
const EXCHANGE_RATE_DAYS = 60;

// Deterministic random generator for reproducibility
class SeededRandom {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
  decimal(min: number, max: number, precision = 2): string {
    return (this.next() * (max - min) + min).toFixed(precision);
  }
}

const rng = new SeededRandom(12345);

const STATUSES = ["جديدة", "في انتظار الشحن", "جاهزة للاستلام", "مستلمة بنجاح"];
const PRODUCT_TYPES = ["أحذية", "ملابس", "إلكترونيات", "أجهزة منزلية", "ألعاب", "حلويات", "أدوات"];
const PAYMENT_METHODS = ["نقدي", "فودافون كاش", "إنستاباي", "تحويل بنكي"];
const COST_COMPONENTS = ["goods", "commission", "shipping", "customs", "takhreeg"];

async function clearTestData() {
  console.log("Clearing existing test data...");
  await db.delete(inventoryMovements);
  await db.delete(shipmentPayments);
  await db.delete(shipmentCustomsDetails);
  await db.delete(shipmentShippingDetails);
  await db.delete(shipmentItems);
  await db.delete(shipments);
  await db.delete(exchangeRates);
  await db.delete(products);
  await db.delete(suppliers);
  await db.delete(auditLogs);
  // Keep root user, delete test users
  await db.delete(users).where(sql`username != 'root'`);
  console.log("Test data cleared.");
}

async function seedUsers(): Promise<Map<string, string>> {
  console.log("Seeding users...");
  const userMap = new Map<string, string>();
  
  const testUsers = [
    { username: "manager1", password: "manager123", role: "مدير", firstName: "أحمد", lastName: "المدير" },
    { username: "accountant1", password: "accountant123", role: "محاسب", firstName: "محمد", lastName: "المحاسب" },
    { username: "accountant2", password: "accountant123", role: "محاسب", firstName: "سارة", lastName: "المحاسبة" },
    { username: "inventory1", password: "inventory123", role: "مسؤول مخزون", firstName: "علي", lastName: "المخزون" },
    { username: "viewer1", password: "viewer123", role: "مشاهد", firstName: "فاطمة", lastName: "المشاهد" },
  ];

  for (const u of testUsers) {
    const hashedPassword = await bcrypt.hash(u.password, 10);
    const [created] = await db.insert(users).values({
      username: u.username,
      password: hashedPassword,
      role: u.role,
      firstName: u.firstName,
      lastName: u.lastName,
    }).returning();
    userMap.set(u.username, created.id);
  }

  // Get root user ID
  const [root] = await db.select().from(users).where(eq(users.username, "root"));
  if (root) userMap.set("root", root.id);

  console.log(`Created ${testUsers.length} test users.`);
  return userMap;
}

async function seedSuppliers(): Promise<number[]> {
  console.log(`Seeding ${SUPPLIER_COUNT} suppliers...`);
  const supplierNames = [
    "شركة الصين للتجارة", "مصنع قوانغتشو", "تجارة شنزن", "مصنع ييوو", 
    "شركة شنغهاي", "تجارة بكين", "مصنع هانغتشو", "شركة نانجينغ",
    "مصنع تشينغداو", "تجارة ووهان", "شركة شيان", "مصنع تشنغدو",
    "تجارة دونغقوان", "مصنع فوشان", "شركة نينغبو", "تجارة ونزو",
    "مصنع سوتشو", "شركة تيانجين", "تجارة تشونغتشينغ", "مصنع شيامن",
    "شركة داليان", "تجارة تشانغشا", "مصنع جينان", "شركة تشنغتشو", "تجارة هاربين"
  ];

  const ids: number[] = [];
  for (let i = 0; i < SUPPLIER_COUNT; i++) {
    const [created] = await db.insert(suppliers).values({
      name: supplierNames[i],
      country: "الصين",
      phone: `+86${rng.int(100000000, 999999999)}`,
      email: `supplier${i + 1}@example.com`,
      isActive: true,
    }).returning();
    ids.push(created.id);
  }
  console.log(`Created ${SUPPLIER_COUNT} suppliers.`);
  return ids;
}

async function seedProducts(supplierIds: number[]): Promise<number[]> {
  console.log("Seeding products...");
  const productNames = [
    "حذاء رياضي رجالي", "حذاء نسائي كلاسيك", "قميص قطني", "بنطلون جينز",
    "جاكيت شتوي", "فستان صيفي", "شاحن لاسلكي", "سماعات بلوتوث",
    "خلاط كهربائي", "مكنسة كهربائية", "لعبة أطفال تعليمية", "دراجة أطفال",
    "شوكولاتة فاخرة", "حلوى جيلي", "طقم أدوات يدوية", "مفك كهربائي"
  ];

  const ids: number[] = [];
  for (let i = 0; i < productNames.length; i++) {
    const [created] = await db.insert(products).values({
      name: productNames[i],
      type: rng.pick(PRODUCT_TYPES),
      defaultSupplierId: rng.pick(supplierIds),
    }).returning();
    ids.push(created.id);
  }
  console.log(`Created ${productNames.length} products.`);
  return ids;
}

async function seedExchangeRates(): Promise<void> {
  console.log(`Seeding exchange rates for last ${EXCHANGE_RATE_DAYS} days...`);
  const today = new Date();
  
  for (let i = 0; i < EXCHANGE_RATE_DAYS; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    
    // RMB to EGP rate (fluctuating around 6.8-7.2)
    const rmbToEgp = parseFloat((6.8 + rng.next() * 0.4).toFixed(4));
    
    // USD to RMB rate (fluctuating around 7.0-7.3)
    const usdToRmb = parseFloat((7.0 + rng.next() * 0.3).toFixed(4));
    
    await db.insert(exchangeRates).values([
      { rateDate: dateStr, fromCurrency: "RMB", toCurrency: "EGP", rateValue: rmbToEgp.toString(), source: "seed" },
      { rateDate: dateStr, fromCurrency: "USD", toCurrency: "RMB", rateValue: usdToRmb.toString(), source: "seed" },
    ]);
  }
  console.log(`Created ${EXCHANGE_RATE_DAYS * 2} exchange rates.`);
}

async function seedShipments(
  userMap: Map<string, string>,
  supplierIds: number[],
  productIds: number[]
): Promise<{ shipmentId: number; status: string; totalCostEgp: number }[]> {
  console.log(`Seeding ${SHIPMENT_COUNT} shipments with items...`);
  const shipmentData: { shipmentId: number; status: string; totalCostEgp: number }[] = [];
  const managerIds = [userMap.get("root")!, userMap.get("manager1")!];
  
  for (let i = 0; i < SHIPMENT_COUNT; i++) {
    const status = rng.pick(STATUSES);
    const purchaseDate = new Date();
    purchaseDate.setDate(purchaseDate.getDate() - rng.int(1, 90));
    
    // Generate cost components
    const purchaseCostRmb = parseFloat(rng.decimal(500, 50000));
    const rmbToEgpRate = parseFloat(rng.decimal(6.8, 7.2, 4));
    const purchaseCostEgp = purchaseCostRmb * rmbToEgpRate;
    const commissionCostRmb = purchaseCostRmb * 0.03;
    const commissionCostEgp = commissionCostRmb * rmbToEgpRate;
    
    // Some shipments have shipping costs (status >= "في انتظار الشحن")
    let shippingCostRmb = 0;
    let shippingCostEgp = 0;
    if (status !== "جديدة" || rng.next() > 0.5) {
      shippingCostRmb = parseFloat(rng.decimal(100, 5000));
      shippingCostEgp = shippingCostRmb * rmbToEgpRate;
    }
    
    // Some shipments have customs/takhreeg (status >= "جاهزة للاستلام")
    let customsCostEgp = 0;
    let takhreegCostEgp = 0;
    if (["جاهزة للاستلام", "مستلمة بنجاح"].includes(status) || rng.next() > 0.7) {
      customsCostEgp = parseFloat(rng.decimal(200, 3000));
      takhreegCostEgp = parseFloat(rng.decimal(100, 1500));
    }
    
    const finalTotalCostEgp = purchaseCostEgp + commissionCostEgp + shippingCostEgp + customsCostEgp + takhreegCostEgp;
    
    // Generate partial payments (0-80% of total)
    const paymentPercentage = rng.next() * 0.8;
    const totalPaidEgp = finalTotalCostEgp * paymentPercentage;
    const balanceEgp = finalTotalCostEgp - totalPaidEgp;
    
    const [shipment] = await db.insert(shipments).values({
      shipmentCode: `SHP-${String(i + 1).padStart(5, "0")}`,
      shipmentName: `شحنة اختبار ${i + 1}`,
      purchaseDate: purchaseDate.toISOString().split("T")[0],
      status,
      createdByUserId: rng.pick(managerIds),
      purchaseCostRmb: purchaseCostRmb.toFixed(2),
      purchaseCostEgp: purchaseCostEgp.toFixed(2),
      purchaseRmbToEgpRate: rmbToEgpRate.toFixed(4),
      commissionCostRmb: commissionCostRmb.toFixed(2),
      commissionCostEgp: commissionCostEgp.toFixed(2),
      shippingCostRmb: shippingCostRmb.toFixed(2),
      shippingCostEgp: shippingCostEgp.toFixed(2),
      customsCostEgp: customsCostEgp.toFixed(2),
      takhreegCostEgp: takhreegCostEgp.toFixed(2),
      finalTotalCostEgp: finalTotalCostEgp.toFixed(2),
      totalPaidEgp: totalPaidEgp.toFixed(2),
      balanceEgp: balanceEgp.toFixed(2),
    }).returning();
    
    // Add 3-15 items per shipment
    const itemCount = rng.int(3, 15);
    for (let j = 0; j < itemCount; j++) {
      const cartons = rng.int(5, 100);
      const piecesPerCarton = rng.int(10, 500);
      const totalPieces = cartons * piecesPerCarton;
      const pricePerPieceRmb = parseFloat(rng.decimal(0.5, 50, 4));
      const totalPurchaseCostRmb = totalPieces * pricePerPieceRmb;
      
      await db.insert(shipmentItems).values({
        shipmentId: shipment.id,
        supplierId: rng.pick(supplierIds),
        productId: rng.pick(productIds),
        productName: `صنف ${j + 1} - شحنة ${i + 1}`,
        productType: rng.pick(PRODUCT_TYPES),
        cartonsCtn: cartons,
        piecesPerCartonPcs: piecesPerCarton,
        totalPiecesCou: totalPieces,
        purchasePricePerPiecePriRmb: pricePerPieceRmb.toFixed(4),
        totalPurchaseCostRmb: totalPurchaseCostRmb.toFixed(2),
        customsCostPerCartonEgp: rng.decimal(5, 30),
        takhreegCostPerCartonEgp: rng.decimal(2, 15),
      });
    }
    
    // Add shipping details for some shipments
    if (shippingCostRmb > 0) {
      await db.insert(shipmentShippingDetails).values({
        shipmentId: shipment.id,
        totalPurchaseCostRmb: purchaseCostRmb.toFixed(2),
        commissionRatePercent: "3.00",
        commissionValueRmb: commissionCostRmb.toFixed(2),
        commissionValueEgp: commissionCostEgp.toFixed(2),
        shippingAreaSqm: rng.decimal(10, 200),
        shippingCostPerSqmUsdOriginal: rng.decimal(30, 80),
        totalShippingCostRmb: shippingCostRmb.toFixed(2),
        totalShippingCostEgp: shippingCostEgp.toFixed(2),
        rmbToEgpRateAtShipping: rmbToEgpRate.toFixed(4),
        usdToRmbRateAtShipping: rng.decimal(7.0, 7.3, 4),
      });
    }
    
    // Add customs details for some shipments
    if (customsCostEgp > 0) {
      await db.insert(shipmentCustomsDetails).values({
        shipmentId: shipment.id,
        totalCustomsCostEgp: customsCostEgp.toFixed(2),
        totalTakhreegCostEgp: takhreegCostEgp.toFixed(2),
      });
    }
    
    shipmentData.push({ shipmentId: shipment.id, status, totalCostEgp: finalTotalCostEgp });
    
    if ((i + 1) % 50 === 0) console.log(`  Created ${i + 1}/${SHIPMENT_COUNT} shipments...`);
  }
  
  console.log(`Created ${SHIPMENT_COUNT} shipments with items.`);
  return shipmentData;
}

async function seedPayments(
  shipmentData: { shipmentId: number; status: string; totalCostEgp: number }[],
  userMap: Map<string, string>
): Promise<void> {
  console.log("Seeding payments...");
  const payerIds = [userMap.get("manager1")!, userMap.get("accountant1")!, userMap.get("accountant2")!];
  let paymentCount = 0;
  
  for (const { shipmentId, totalCostEgp } of shipmentData) {
    // 0-5 payments per shipment
    const numPayments = rng.int(0, 5);
    if (numPayments === 0) continue;
    
    let remainingToDistribute = totalCostEgp * rng.next() * 0.8; // up to 80% paid
    
    for (let p = 0; p < numPayments && remainingToDistribute > 10; p++) {
      const isRmb = rng.next() > 0.6;
      const paymentDate = new Date();
      paymentDate.setDate(paymentDate.getDate() - rng.int(1, 60));
      
      let amountEgp = Math.min(remainingToDistribute, parseFloat(rng.decimal(100, remainingToDistribute)));
      let amountOriginal: string;
      let exchangeRateToEgp: string | null = null;
      let paymentCurrency: string;
      
      if (isRmb) {
        const rate = parseFloat(rng.decimal(6.8, 7.2, 4));
        const amountRmb = amountEgp / rate;
        amountOriginal = amountRmb.toFixed(2);
        exchangeRateToEgp = rate.toFixed(4);
        paymentCurrency = "RMB";
      } else {
        amountOriginal = amountEgp.toFixed(2);
        paymentCurrency = "EGP";
      }
      
      await db.insert(shipmentPayments).values({
        shipmentId,
        paymentDate: paymentDate,
        paymentCurrency,
        amountOriginal,
        exchangeRateToEgp,
        amountEgp: amountEgp.toFixed(2),
        costComponent: rng.pick(COST_COMPONENTS),
        paymentMethod: rng.pick(PAYMENT_METHODS),
        cashReceiverName: rng.next() > 0.5 ? `مستلم ${rng.int(1, 10)}` : null,
        referenceNumber: rng.next() > 0.6 ? `REF-${rng.int(100000, 999999)}` : null,
        createdByUserId: rng.pick(payerIds),
      });
      
      remainingToDistribute -= amountEgp;
      paymentCount++;
    }
  }
  
  console.log(`Created ${paymentCount} payments.`);
}

async function seedInventoryMovements(
  shipmentData: { shipmentId: number; status: string; totalCostEgp: number }[]
): Promise<void> {
  console.log("Seeding inventory movements for received shipments...");
  let movementCount = 0;
  
  const receivedShipments = shipmentData.filter(s => s.status === "مستلمة بنجاح");
  
  for (const { shipmentId, totalCostEgp } of receivedShipments) {
    const items = await db.select().from(shipmentItems).where(eq(shipmentItems.shipmentId, shipmentId));
    
    for (const item of items) {
      const unitCostEgp = totalCostEgp / items.length / (item.totalPiecesCou || 1);
      
      await db.insert(inventoryMovements).values({
        shipmentId,
        shipmentItemId: item.id,
        productId: item.productId,
        totalPiecesIn: item.totalPiecesCou,
        unitCostRmb: item.purchasePricePerPiecePriRmb,
        unitCostEgp: unitCostEgp.toFixed(4),
        totalCostEgp: (unitCostEgp * (item.totalPiecesCou || 0)).toFixed(2),
        movementDate: new Date().toISOString().split("T")[0],
      });
      movementCount++;
    }
  }
  
  console.log(`Created ${movementCount} inventory movements.`);
}

async function verifySeedData(): Promise<void> {
  console.log("\n=== Verification Summary ===");
  
  const userCount = await db.select({ count: sql<number>`count(*)` }).from(users);
  const supplierCount = await db.select({ count: sql<number>`count(*)` }).from(suppliers);
  const productCount = await db.select({ count: sql<number>`count(*)` }).from(products);
  const shipmentCount = await db.select({ count: sql<number>`count(*)` }).from(shipments);
  const itemCount = await db.select({ count: sql<number>`count(*)` }).from(shipmentItems);
  const rateCount = await db.select({ count: sql<number>`count(*)` }).from(exchangeRates);
  const paymentCount = await db.select({ count: sql<number>`count(*)` }).from(shipmentPayments);
  const movementCount = await db.select({ count: sql<number>`count(*)` }).from(inventoryMovements);
  
  console.log(`Users: ${userCount[0].count}`);
  console.log(`Suppliers: ${supplierCount[0].count}`);
  console.log(`Products: ${productCount[0].count}`);
  console.log(`Shipments: ${shipmentCount[0].count}`);
  console.log(`Shipment Items: ${itemCount[0].count}`);
  console.log(`Exchange Rates: ${rateCount[0].count}`);
  console.log(`Payments: ${paymentCount[0].count}`);
  console.log(`Inventory Movements: ${movementCount[0].count}`);
  
  // Check for orphan records
  const orphanItems = await db.execute(sql`
    SELECT COUNT(*) as count FROM shipment_items 
    WHERE shipment_id NOT IN (SELECT id FROM shipments)
  `);
  const orphanPayments = await db.execute(sql`
    SELECT COUNT(*) as count FROM shipment_payments 
    WHERE shipment_id NOT IN (SELECT id FROM shipments)
  `);
  
  console.log(`\nOrphan Items: ${(orphanItems.rows[0] as any).count}`);
  console.log(`Orphan Payments: ${(orphanPayments.rows[0] as any).count}`);
  
  // Status distribution
  const statusDist = await db.execute(sql`
    SELECT status, COUNT(*) as count FROM shipments GROUP BY status ORDER BY count DESC
  `);
  console.log("\nShipment Status Distribution:");
  for (const row of statusDist.rows as any[]) {
    console.log(`  ${row.status}: ${row.count}`);
  }
  
  console.log("\n=== Seed Complete ===");
}

async function main() {
  try {
    console.log("Starting high-volume test data seeding...\n");
    
    await clearTestData();
    const userMap = await seedUsers();
    const supplierIds = await seedSuppliers();
    const productIds = await seedProducts(supplierIds);
    await seedExchangeRates();
    const shipmentData = await seedShipments(userMap, supplierIds, productIds);
    await seedPayments(shipmentData, userMap);
    await seedInventoryMovements(shipmentData);
    await verifySeedData();
    
    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
}

main();
