import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  decimal,
  boolean,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table with username/password auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username", { length: 50 }).unique().notNull(),
  password: varchar("password", { length: 255 }).notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  role: varchar("role").default("مشاهد").notNull(), // مدير, محاسب, مسؤول مخزون, مشاهد
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Suppliers table (الموردون)
export const suppliers = pgTable("suppliers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  country: varchar("country", { length: 100 }).default("الصين"),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Shipping Companies table (شركات الشحن)
export const shippingCompanies = pgTable("shipping_companies", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  contactName: varchar("contact_name", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Product Types table (أنواع الأصناف)
export const productTypes = pgTable("product_types", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).unique().notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Products table (الأصناف)
export const products = pgTable("products", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 100 }), // Category like أحذية, حلويات, ملابس
  defaultImageUrl: varchar("default_image_url"),
  defaultSupplierId: integer("default_supplier_id").references(() => suppliers.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Shipments table (الشحنات)
export const shipments = pgTable("shipments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  shipmentCode: varchar("shipment_code", { length: 50 }).unique().notNull(),
  shipmentName: varchar("shipment_name", { length: 255 }).notNull(),
  purchaseDate: date("purchase_date").notNull(),
  status: varchar("status", { length: 50 }).default("جديدة").notNull(), // جديدة, في انتظار الشحن, جاهزة للاستلام, مستلمة بنجاح, مؤرشفة
  invoiceCustomsDate: date("invoice_customs_date"),
  shippingCompanyId: integer("shipping_company_id").references(() => shippingCompanies.id),
  createdByUserId: varchar("created_by_user_id").references(() => users.id),
  // Cost breakdown fields
  purchaseCostRmb: decimal("purchase_cost_rmb", { precision: 15, scale: 2 }).default("0"),
  purchaseCostEgp: decimal("purchase_cost_egp", { precision: 15, scale: 2 }).default("0"),
  purchaseRmbToEgpRate: decimal("purchase_rmb_to_egp_rate", { precision: 10, scale: 4 }).default("0"),
  commissionCostRmb: decimal("commission_cost_rmb", { precision: 15, scale: 2 }).default("0"),
  commissionCostEgp: decimal("commission_cost_egp", { precision: 15, scale: 2 }).default("0"),
  shippingCostRmb: decimal("shipping_cost_rmb", { precision: 15, scale: 2 }).default("0"),
  shippingCostEgp: decimal("shipping_cost_egp", { precision: 15, scale: 2 }).default("0"),
  customsCostEgp: decimal("customs_cost_egp", { precision: 15, scale: 2 }).default("0"),
  takhreegCostEgp: decimal("takhreeg_cost_egp", { precision: 15, scale: 2 }).default("0"),
  totalMissingCostEgp: decimal("total_missing_cost_egp", { precision: 15, scale: 2 }).default("0"),
  finalTotalCostEgp: decimal("final_total_cost_egp", { precision: 15, scale: 2 }).default("0"),
  totalPaidEgp: decimal("total_paid_egp", { precision: 15, scale: 2 }).default("0"),
  balanceEgp: decimal("balance_egp", { precision: 15, scale: 2 }).default("0"),
  partialDiscountRmb: decimal("partial_discount_rmb", { precision: 15, scale: 2 }).default("0"),
  discountNotes: text("discount_notes"),
  lastPaymentDate: timestamp("last_payment_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Shipment Items table (بنود الشحنة)
export const shipmentItems = pgTable("shipment_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  shipmentId: integer("shipment_id").references(() => shipments.id).notNull(),
  lineNo: integer("line_no").notNull().default(1),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  productId: integer("product_id").references(() => products.id),
  productTypeId: integer("product_type_id").references(() => productTypes.id),
  productName: varchar("product_name", { length: 255 }).notNull(),
  description: text("description"),
  countryOfOrigin: varchar("country_of_origin", { length: 100 }).default("الصين"),
  imageUrl: varchar("image_url"),
  cartonsCtn: integer("cartons_ctn").default(0).notNull(),
  piecesPerCartonPcs: integer("pieces_per_carton_pcs").default(0).notNull(),
  totalPiecesCou: integer("total_pieces_cou").default(0).notNull(),
  purchasePricePerPiecePriRmb: decimal("purchase_price_per_piece_pri_rmb", { precision: 10, scale: 4 }).default("0"),
  totalPurchaseCostRmb: decimal("total_purchase_cost_rmb", { precision: 15, scale: 2 }).default("0"),
  customsCostPerCartonEgp: decimal("customs_cost_per_carton_egp", { precision: 10, scale: 2 }),
  totalCustomsCostEgp: decimal("total_customs_cost_egp", { precision: 15, scale: 2 }),
  takhreegCostPerCartonEgp: decimal("takhreeg_cost_per_carton_egp", { precision: 10, scale: 2 }),
  totalTakhreegCostEgp: decimal("total_takhreeg_cost_egp", { precision: 15, scale: 2 }),
  missingPieces: integer("missing_pieces").default(0).notNull(),
  missingCostEgp: decimal("missing_cost_egp", { precision: 15, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Shipping Details table (بيانات الشحن)
export const shipmentShippingDetails = pgTable("shipment_shipping_details", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  shipmentId: integer("shipment_id").references(() => shipments.id).unique().notNull(),
  totalPurchaseCostRmb: decimal("total_purchase_cost_rmb", { precision: 15, scale: 2 }).default("0"),
  commissionRatePercent: decimal("commission_rate_percent", { precision: 5, scale: 2 }).default("0"),
  commissionValueRmb: decimal("commission_value_rmb", { precision: 15, scale: 2 }).default("0"),
  commissionValueEgp: decimal("commission_value_egp", { precision: 15, scale: 2 }).default("0"),
  shippingAreaSqm: decimal("shipping_area_sqm", { precision: 10, scale: 2 }).default("0"),
  shippingCostPerSqmUsdOriginal: decimal("shipping_cost_per_sqm_usd_original", { precision: 10, scale: 2 }),
  totalShippingCostUsdOriginal: decimal("total_shipping_cost_usd_original", { precision: 15, scale: 2 }),
  totalShippingCostRmb: decimal("total_shipping_cost_rmb", { precision: 15, scale: 2 }).default("0"),
  totalShippingCostEgp: decimal("total_shipping_cost_egp", { precision: 15, scale: 2 }).default("0"),
  shippingDate: date("shipping_date"),
  rmbToEgpRateAtShipping: decimal("rmb_to_egp_rate_at_shipping", { precision: 10, scale: 4 }),
  usdToRmbRateAtShipping: decimal("usd_to_rmb_rate_at_shipping", { precision: 10, scale: 4 }),
  sourceOfRates: varchar("source_of_rates", { length: 100 }),
  ratesUpdatedAt: timestamp("rates_updated_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Customs Details table (الجمارك والتخريج)
export const shipmentCustomsDetails = pgTable("shipment_customs_details", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  shipmentId: integer("shipment_id").references(() => shipments.id).unique().notNull(),
  totalCustomsCostEgp: decimal("total_customs_cost_egp", { precision: 15, scale: 2 }).default("0"),
  totalTakhreegCostEgp: decimal("total_takhreeg_cost_egp", { precision: 15, scale: 2 }).default("0"),
  customsInvoiceDate: date("customs_invoice_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Exchange Rates table (أسعار الصرف)
export const exchangeRates = pgTable("exchange_rates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  rateDate: date("rate_date").notNull(),
  fromCurrency: varchar("from_currency", { length: 10 }).notNull(),
  toCurrency: varchar("to_currency", { length: 10 }).notNull(),
  rateValue: decimal("rate_value", { precision: 15, scale: 6 }).notNull(),
  source: varchar("source", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Shipment Payments table (سداد الشحنات)
export const shipmentPayments = pgTable("shipment_payments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  shipmentId: integer("shipment_id").references(() => shipments.id).notNull(),
  partyType: varchar("party_type", { length: 50 }),
  partyId: integer("party_id"),
  paymentDate: timestamp("payment_date").notNull(),
  paymentCurrency: varchar("payment_currency", { length: 10 }).notNull(), // RMB or EGP
  amountOriginal: decimal("amount_original", { precision: 15, scale: 2 }).notNull(),
  exchangeRateToEgp: decimal("exchange_rate_to_egp", { precision: 10, scale: 4 }),
  amountEgp: decimal("amount_egp", { precision: 15, scale: 2 }).notNull(),
  costComponent: varchar("cost_component", { length: 50 }).notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }).notNull(), // نقدي, فودافون كاش, إنستاباي, تحويل بنكي, أخرى
  cashReceiverName: varchar("cash_receiver_name", { length: 255 }),
  referenceNumber: varchar("reference_number", { length: 100 }),
  note: text("note"),
  attachmentUrl: varchar("attachment_url"),
  attachmentMimeType: varchar("attachment_mime_type", { length: 255 }),
  attachmentSize: integer("attachment_size"),
  attachmentOriginalName: varchar("attachment_original_name", { length: 255 }),
  attachmentUploadedAt: timestamp("attachment_uploaded_at"),
  createdByUserId: varchar("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payment Allocations table (تخصيصات المدفوعات)
export const paymentAllocations = pgTable("payment_allocations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  paymentId: integer("payment_id").references(() => shipmentPayments.id).notNull(),
  shipmentId: integer("shipment_id").references(() => shipments.id).notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  component: varchar("component", { length: 50 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull(),
  allocatedAmount: decimal("allocated_amount", { precision: 15, scale: 2 }).notNull(),
  createdByUserId: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Inventory Movements table (حركات المخزون)
export const inventoryMovements = pgTable("inventory_movements", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  shipmentId: integer("shipment_id").references(() => shipments.id),
  shipmentItemId: integer("shipment_item_id").references(() => shipmentItems.id),
  productId: integer("product_id").references(() => products.id),
  totalPiecesIn: integer("total_pieces_in").default(0),
  unitCostRmb: decimal("unit_cost_rmb", { precision: 10, scale: 4 }),
  unitCostEgp: decimal("unit_cost_egp", { precision: 10, scale: 4 }).notNull(),
  totalCostEgp: decimal("total_cost_egp", { precision: 15, scale: 2 }).notNull(),
  movementDate: date("movement_date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Backup Jobs table (وظائف النسخ الاحتياطي)
export const backupJobs = pgTable("backup_jobs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  jobType: varchar("job_type", { length: 20 }).notNull(), // 'backup' | 'restore'
  status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending' | 'running' | 'completed' | 'failed'
  progress: integer("progress").default(0), // 0-100
  outputPath: varchar("output_path", { length: 500 }),
  fileSize: integer("file_size"),
  error: text("error"),
  manifest: jsonb("manifest"),
  createdByUserId: varchar("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Audit Logs table (سجل التغييرات)
export const auditLogs = pgTable("audit_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").references(() => users.id),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: varchar("entity_id", { length: 255 }).notNull(),
  actionType: varchar("action_type", { length: 50 }).notNull(), // CREATE, UPDATE, DELETE, STATUS_CHANGE
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  details: jsonb("details"),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  shipments: many(shipments),
  payments: many(shipmentPayments),
  paymentAllocations: many(paymentAllocations),
  auditLogs: many(auditLogs),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  products: many(products),
  shipmentItems: many(shipmentItems),
  paymentAllocations: many(paymentAllocations),
}));

export const shippingCompaniesRelations = relations(shippingCompanies, ({ many }) => ({
  shipments: many(shipments),
}));

export const productTypesRelations = relations(productTypes, ({ many }) => ({
  shipmentItems: many(shipmentItems),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  defaultSupplier: one(suppliers, {
    fields: [products.defaultSupplierId],
    references: [suppliers.id],
  }),
  shipmentItems: many(shipmentItems),
  inventoryMovements: many(inventoryMovements),
}));

export const shipmentsRelations = relations(shipments, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [shipments.createdByUserId],
    references: [users.id],
  }),
  shippingCompany: one(shippingCompanies, {
    fields: [shipments.shippingCompanyId],
    references: [shippingCompanies.id],
  }),
  items: many(shipmentItems),
  shippingDetails: one(shipmentShippingDetails),
  customsDetails: one(shipmentCustomsDetails),
  payments: many(shipmentPayments),
  paymentAllocations: many(paymentAllocations),
  inventoryMovements: many(inventoryMovements),
}));

export const shipmentItemsRelations = relations(shipmentItems, ({ one }) => ({
  shipment: one(shipments, {
    fields: [shipmentItems.shipmentId],
    references: [shipments.id],
  }),
  supplier: one(suppliers, {
    fields: [shipmentItems.supplierId],
    references: [suppliers.id],
  }),
  product: one(products, {
    fields: [shipmentItems.productId],
    references: [products.id],
  }),
  productType: one(productTypes, {
    fields: [shipmentItems.productTypeId],
    references: [productTypes.id],
  }),
}));

export const shipmentShippingDetailsRelations = relations(shipmentShippingDetails, ({ one }) => ({
  shipment: one(shipments, {
    fields: [shipmentShippingDetails.shipmentId],
    references: [shipments.id],
  }),
}));

export const shipmentCustomsDetailsRelations = relations(shipmentCustomsDetails, ({ one }) => ({
  shipment: one(shipments, {
    fields: [shipmentCustomsDetails.shipmentId],
    references: [shipments.id],
  }),
}));

export const shipmentPaymentsRelations = relations(shipmentPayments, ({ one }) => ({
  shipment: one(shipments, {
    fields: [shipmentPayments.shipmentId],
    references: [shipments.id],
  }),
  createdBy: one(users, {
    fields: [shipmentPayments.createdByUserId],
    references: [users.id],
  }),
}));

export const paymentAllocationsRelations = relations(paymentAllocations, ({ one }) => ({
  payment: one(shipmentPayments, {
    fields: [paymentAllocations.paymentId],
    references: [shipmentPayments.id],
  }),
  shipment: one(shipments, {
    fields: [paymentAllocations.shipmentId],
    references: [shipments.id],
  }),
  supplier: one(suppliers, {
    fields: [paymentAllocations.supplierId],
    references: [suppliers.id],
  }),
  createdBy: one(users, {
    fields: [paymentAllocations.createdByUserId],
    references: [users.id],
  }),
}));

export const inventoryMovementsRelations = relations(inventoryMovements, ({ one }) => ({
  shipment: one(shipments, {
    fields: [inventoryMovements.shipmentId],
    references: [shipments.id],
  }),
  shipmentItem: one(shipmentItems, {
    fields: [inventoryMovements.shipmentItemId],
    references: [shipmentItems.id],
  }),
  product: one(products, {
    fields: [inventoryMovements.productId],
    references: [products.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const backupJobsRelations = relations(backupJobs, ({ one }) => ({
  createdBy: one(users, {
    fields: [backupJobs.createdByUserId],
    references: [users.id],
  }),
}));

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({ createdAt: true, updatedAt: true });
export const insertSupplierSchema = createInsertSchema(suppliers).omit({ createdAt: true, updatedAt: true });
export const insertShippingCompanySchema = createInsertSchema(shippingCompanies).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertProductTypeSchema = createInsertSchema(productTypes).omit({ createdAt: true, updatedAt: true });
export const insertProductSchema = createInsertSchema(products).omit({ createdAt: true, updatedAt: true });
export const insertShipmentSchema = createInsertSchema(shipments).omit({ createdAt: true, updatedAt: true });
export const insertShipmentItemSchema = createInsertSchema(shipmentItems).omit({ createdAt: true, updatedAt: true });
export const insertShipmentShippingDetailsSchema = createInsertSchema(shipmentShippingDetails).omit({ createdAt: true, updatedAt: true });
export const insertShipmentCustomsDetailsSchema = createInsertSchema(shipmentCustomsDetails).omit({ createdAt: true, updatedAt: true });
export const insertExchangeRateSchema = createInsertSchema(exchangeRates).omit({ createdAt: true });
export const insertShipmentPaymentSchema = createInsertSchema(shipmentPayments).omit({ createdAt: true, updatedAt: true });
export const insertPaymentAllocationSchema = createInsertSchema(paymentAllocations).omit({ createdAt: true });
export const insertInventoryMovementSchema = createInsertSchema(inventoryMovements).omit({ createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs);
export const insertBackupJobSchema = createInsertSchema(backupJobs).omit({ createdAt: true });

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliers.$inferSelect;
export type InsertShippingCompany = z.infer<typeof insertShippingCompanySchema>;
export type ShippingCompany = typeof shippingCompanies.$inferSelect;
export type InsertProductType = z.infer<typeof insertProductTypeSchema>;
export type ProductType = typeof productTypes.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;
export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipments.$inferSelect;
export type InsertShipmentItem = z.infer<typeof insertShipmentItemSchema>;
export type ShipmentItem = typeof shipmentItems.$inferSelect;
export type InsertShipmentShippingDetails = z.infer<typeof insertShipmentShippingDetailsSchema>;
export type ShipmentShippingDetails = typeof shipmentShippingDetails.$inferSelect;
export type InsertShipmentCustomsDetails = z.infer<typeof insertShipmentCustomsDetailsSchema>;
export type ShipmentCustomsDetails = typeof shipmentCustomsDetails.$inferSelect;
export type InsertExchangeRate = z.infer<typeof insertExchangeRateSchema>;
export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type InsertShipmentPayment = z.infer<typeof insertShipmentPaymentSchema>;
export type ShipmentPayment = typeof shipmentPayments.$inferSelect;
export type InsertPaymentAllocation = z.infer<typeof insertPaymentAllocationSchema>;
export type PaymentAllocation = typeof paymentAllocations.$inferSelect;
export type InsertInventoryMovement = z.infer<typeof insertInventoryMovementSchema>;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertBackupJob = z.infer<typeof insertBackupJobSchema>;
export type BackupJob = typeof backupJobs.$inferSelect;
