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

// ============================================================
// LOCAL TRADE MODULE TABLES (التجارة المحلية)
// ============================================================

// Parties table (الملفات - التجار والعملاء)
export const parties = pgTable("parties", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  type: varchar("type", { length: 20 }).notNull(), // 'merchant' (تاجر) | 'customer' (عميل)
  name: varchar("name", { length: 255 }).notNull(),
  imageUrl: varchar("image_url"),
  phone: varchar("phone", { length: 50 }),
  whatsapp: varchar("whatsapp", { length: 50 }),
  shopName: varchar("shop_name", { length: 255 }),
  addressArea: varchar("address_area", { length: 255 }),
  addressGovernorate: varchar("address_governorate", { length: 255 }),
  locationLat: decimal("location_lat", { precision: 10, scale: 7 }),
  locationLng: decimal("location_lng", { precision: 10, scale: 7 }),
  paymentTerms: varchar("payment_terms", { length: 20 }).default("cash").notNull(), // 'cash' | 'credit'
  creditLimitMode: varchar("credit_limit_mode", { length: 20 }).default("unlimited").notNull(), // 'unlimited' | 'limited'
  creditLimitAmountEgp: decimal("credit_limit_amount_egp", { precision: 15, scale: 2 }),
  openingBalanceType: varchar("opening_balance_type", { length: 20 }).default("debit").notNull(), // 'debit' | 'credit'
  openingBalanceEgp: decimal("opening_balance_egp", { precision: 15, scale: 2 }).default("0").notNull(),
  nextCollectionDate: date("next_collection_date"),
  nextCollectionAmountEgp: decimal("next_collection_amount_egp", { precision: 15, scale: 2 }),
  nextCollectionNote: text("next_collection_note"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Party Seasons table (مواسم الملفات)
export const partySeasons = pgTable("party_seasons", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  partyId: integer("party_id").references(() => parties.id).notNull(),
  seasonName: varchar("season_name", { length: 255 }),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  isCurrent: boolean("is_current").default(true).notNull(),
  openingBalanceEgp: decimal("opening_balance_egp", { precision: 15, scale: 2 }).default("0").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Party Collections table (مواعيد التحصيل)
export const partyCollections = pgTable("party_collections", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  partyId: integer("party_id").references(() => parties.id).notNull(),
  collectionOrder: integer("collection_order").notNull(), // 1, 2, 3, or 4
  collectionDate: date("collection_date").notNull(),
  amountEgp: decimal("amount_egp", { precision: 15, scale: 2 }),
  notes: text("notes"),
  reminderSent: boolean("reminder_sent").default(false).notNull(),
  reminderSentAt: timestamp("reminder_sent_at"),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // 'pending' | 'collected' | 'postponed'
  collectedAt: timestamp("collected_at"),
  linkedPaymentId: integer("linked_payment_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Local Invoices table (الفواتير المحلية)
export const localInvoices = pgTable("local_invoices", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  partyId: integer("party_id").references(() => parties.id).notNull(),
  seasonId: integer("season_id").references(() => partySeasons.id),
  invoiceKind: varchar("invoice_kind", { length: 20 }).notNull(), // 'purchase' | 'sale' | 'settlement' | 'return'
  status: varchar("status", { length: 20 }).default("draft").notNull(), // 'draft' | 'posted' | 'received' | 'archived'
  invoiceDate: date("invoice_date").notNull(),
  referenceName: varchar("reference_name", { length: 255 }),
  referenceNumber: varchar("reference_number", { length: 50 }).unique().notNull(),
  totalCartons: integer("total_cartons").default(0).notNull(),
  totalPieces: integer("total_pieces").default(0).notNull(),
  subtotalEgp: decimal("subtotal_egp", { precision: 15, scale: 2 }).default("0").notNull(),
  totalEgp: decimal("total_egp", { precision: 15, scale: 2 }).default("0").notNull(),
  notes: text("notes"),
  createdByUserId: varchar("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Local Invoice Lines table (بنود الفواتير المحلية)
export const localInvoiceLines = pgTable("local_invoice_lines", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  invoiceId: integer("invoice_id").references(() => localInvoices.id).notNull(),
  productTypeId: integer("product_type_id").references(() => productTypes.id),
  productName: varchar("product_name", { length: 255 }).notNull(),
  imageUrl: varchar("image_url"),
  cartons: integer("cartons").default(0).notNull(),
  piecesPerCarton: integer("pieces_per_carton").default(0).notNull(),
  totalPieces: integer("total_pieces").default(0).notNull(),
  receivedPieces: integer("received_pieces"), // null = not received yet, number = actual received quantity
  unitMode: varchar("unit_mode", { length: 20 }).default("piece").notNull(), // 'piece' | 'dozen'
  unitPriceEgp: decimal("unit_price_egp", { precision: 10, scale: 2 }).default("0").notNull(),
  totalDozens: decimal("total_dozens", { precision: 10, scale: 2 }).default("0"),
  lineTotalEgp: decimal("line_total_egp", { precision: 15, scale: 2 }).default("0").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Local Receipts table (استلام الفواتير)
export const localReceipts = pgTable("local_receipts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  invoiceId: integer("invoice_id").references(() => localInvoices.id).notNull(),
  receivingStatus: varchar("receiving_status", { length: 20 }).default("pending").notNull(), // 'pending' | 'received'
  receivedAt: timestamp("received_at"),
  receivedByUserId: varchar("received_by_user_id").references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Party Ledger Entries table (قيود حساب الملف)
// Sign convention: + = party owes us (for customers) / we owe party (for merchants)
export const partyLedgerEntries = pgTable("party_ledger_entries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  partyId: integer("party_id").references(() => parties.id).notNull(),
  seasonId: integer("season_id").references(() => partySeasons.id),
  entryType: varchar("entry_type", { length: 30 }).notNull(), // 'invoice' | 'payment' | 'credit_note' | 'debit_note' | 'adjustment' | 'settlement' | 'opening_balance'
  sourceType: varchar("source_type", { length: 50 }), // 'local_invoice' | 'local_payment' | 'return_case' | etc.
  sourceId: integer("source_id"),
  amountEgp: decimal("amount_egp", { precision: 15, scale: 2 }).notNull(),
  runningBalanceEgp: decimal("running_balance_egp", { precision: 15, scale: 2 }),
  note: text("note"),
  createdByUserId: varchar("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Local Payments table (الدفعات المحلية)
export const localPayments = pgTable("local_payments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  partyId: integer("party_id").references(() => parties.id).notNull(),
  seasonId: integer("season_id").references(() => partySeasons.id),
  invoiceId: integer("invoice_id").references(() => localInvoices.id),
  linkedCollectionId: integer("linked_collection_id"),
  paymentDate: date("payment_date").notNull(),
  amountEgp: decimal("amount_egp", { precision: 15, scale: 2 }).notNull(),
  settlementMethod: varchar("settlement_method", { length: 30 }).default("cash").notNull(), // 'cash' | 'credit_balance'
  paymentMethod: varchar("payment_method", { length: 50 }).default("نقدي").notNull(), // نقدي, فودافون كاش, إنستاباي, تحويل بنكي, أخرى
  receiverName: varchar("receiver_name", { length: 255 }),
  referenceNumber: varchar("reference_number", { length: 100 }),
  notes: text("notes"),
  attachmentUrl: varchar("attachment_url"),
  attachmentMimeType: varchar("attachment_mime_type", { length: 255 }),
  attachmentSize: integer("attachment_size"),
  attachmentOriginalName: varchar("attachment_original_name", { length: 255 }),
  createdByUserId: varchar("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Notifications table (الإشعارات)
export const notifications = pgTable("notifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // collection_due, collection_overdue
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  referenceType: varchar("reference_type", { length: 50 }), // party, collection
  referenceId: integer("reference_id"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Return Cases table (حالات الهوامش والنواقص)
export const returnCases = pgTable("return_cases", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  partyId: integer("party_id").references(() => parties.id).notNull(),
  partyTypeSnapshot: varchar("party_type_snapshot", { length: 20 }).notNull(), // 'merchant' | 'customer'
  seasonId: integer("season_id").references(() => partySeasons.id),
  sourceInvoiceId: integer("source_invoice_id").references(() => localInvoices.id),
  sourceLineId: integer("source_line_id").references(() => localInvoiceLines.id),
  status: varchar("status", { length: 30 }).default("under_inspection").notNull(), // 'under_inspection' | 'resolved'
  resolution: varchar("resolution", { length: 30 }), // 'accepted_return' | 'exchange' | 'deduct_value' | 'damaged' | 'rejected'
  cartons: integer("cartons").default(0),
  pieces: integer("pieces").default(0).notNull(),
  amountEgp: decimal("amount_egp", { precision: 15, scale: 2 }).default("0"),
  notes: text("notes"),
  resolvedAt: timestamp("resolved_at"),
  resolvedByUserId: varchar("resolved_by_user_id").references(() => users.id),
  createdByUserId: varchar("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Local Trade Relations
export const partiesRelations = relations(parties, ({ many }) => ({
  seasons: many(partySeasons),
  invoices: many(localInvoices),
  payments: many(localPayments),
  ledgerEntries: many(partyLedgerEntries),
  returnCases: many(returnCases),
  collections: many(partyCollections),
}));

export const partyCollectionsRelations = relations(partyCollections, ({ one }) => ({
  party: one(parties, {
    fields: [partyCollections.partyId],
    references: [parties.id],
  }),
}));

export const partySeasonsRelations = relations(partySeasons, ({ one, many }) => ({
  party: one(parties, {
    fields: [partySeasons.partyId],
    references: [parties.id],
  }),
  invoices: many(localInvoices),
  payments: many(localPayments),
  ledgerEntries: many(partyLedgerEntries),
  returnCases: many(returnCases),
}));

export const localInvoicesRelations = relations(localInvoices, ({ one, many }) => ({
  party: one(parties, {
    fields: [localInvoices.partyId],
    references: [parties.id],
  }),
  season: one(partySeasons, {
    fields: [localInvoices.seasonId],
    references: [partySeasons.id],
  }),
  createdBy: one(users, {
    fields: [localInvoices.createdByUserId],
    references: [users.id],
  }),
  lines: many(localInvoiceLines),
  receipts: many(localReceipts),
  payments: many(localPayments),
  returnCases: many(returnCases),
}));

export const localInvoiceLinesRelations = relations(localInvoiceLines, ({ one }) => ({
  invoice: one(localInvoices, {
    fields: [localInvoiceLines.invoiceId],
    references: [localInvoices.id],
  }),
  productType: one(productTypes, {
    fields: [localInvoiceLines.productTypeId],
    references: [productTypes.id],
  }),
}));

export const localReceiptsRelations = relations(localReceipts, ({ one }) => ({
  invoice: one(localInvoices, {
    fields: [localReceipts.invoiceId],
    references: [localInvoices.id],
  }),
  receivedBy: one(users, {
    fields: [localReceipts.receivedByUserId],
    references: [users.id],
  }),
}));

export const partyLedgerEntriesRelations = relations(partyLedgerEntries, ({ one }) => ({
  party: one(parties, {
    fields: [partyLedgerEntries.partyId],
    references: [parties.id],
  }),
  season: one(partySeasons, {
    fields: [partyLedgerEntries.seasonId],
    references: [partySeasons.id],
  }),
  createdBy: one(users, {
    fields: [partyLedgerEntries.createdByUserId],
    references: [users.id],
  }),
}));

export const localPaymentsRelations = relations(localPayments, ({ one }) => ({
  party: one(parties, {
    fields: [localPayments.partyId],
    references: [parties.id],
  }),
  season: one(partySeasons, {
    fields: [localPayments.seasonId],
    references: [partySeasons.id],
  }),
  invoice: one(localInvoices, {
    fields: [localPayments.invoiceId],
    references: [localInvoices.id],
  }),
  createdBy: one(users, {
    fields: [localPayments.createdByUserId],
    references: [users.id],
  }),
}));

export const returnCasesRelations = relations(returnCases, ({ one }) => ({
  party: one(parties, {
    fields: [returnCases.partyId],
    references: [parties.id],
  }),
  season: one(partySeasons, {
    fields: [returnCases.seasonId],
    references: [partySeasons.id],
  }),
  sourceInvoice: one(localInvoices, {
    fields: [returnCases.sourceInvoiceId],
    references: [localInvoices.id],
  }),
  sourceLine: one(localInvoiceLines, {
    fields: [returnCases.sourceLineId],
    references: [localInvoiceLines.id],
  }),
  resolvedBy: one(users, {
    fields: [returnCases.resolvedByUserId],
    references: [users.id],
  }),
  createdBy: one(users, {
    fields: [returnCases.createdByUserId],
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

// Local Trade Insert Schemas
export const insertPartySchema = createInsertSchema(parties).omit({ createdAt: true, updatedAt: true });
export const insertPartySeasonSchema = createInsertSchema(partySeasons).omit({ createdAt: true });
export const insertLocalInvoiceSchema = createInsertSchema(localInvoices).omit({ createdAt: true, updatedAt: true });
export const insertLocalInvoiceLineSchema = createInsertSchema(localInvoiceLines).omit({ createdAt: true, updatedAt: true });
export const insertLocalReceiptSchema = createInsertSchema(localReceipts).omit({ createdAt: true });
export const insertPartyLedgerEntrySchema = createInsertSchema(partyLedgerEntries).omit({ createdAt: true });
export const insertLocalPaymentSchema = createInsertSchema(localPayments).omit({ createdAt: true });
export const insertReturnCaseSchema = createInsertSchema(returnCases).omit({ createdAt: true, updatedAt: true });
export const insertPartyCollectionSchema = createInsertSchema(partyCollections).omit({ createdAt: true, updatedAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ createdAt: true });

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

// Local Trade Types
export type InsertParty = z.infer<typeof insertPartySchema>;
export type Party = typeof parties.$inferSelect;
export type InsertPartySeason = z.infer<typeof insertPartySeasonSchema>;
export type PartySeason = typeof partySeasons.$inferSelect;
export type InsertLocalInvoice = z.infer<typeof insertLocalInvoiceSchema>;
export type LocalInvoice = typeof localInvoices.$inferSelect;
export type InsertLocalInvoiceLine = z.infer<typeof insertLocalInvoiceLineSchema>;
export type LocalInvoiceLine = typeof localInvoiceLines.$inferSelect;
export type InsertLocalReceipt = z.infer<typeof insertLocalReceiptSchema>;
export type LocalReceipt = typeof localReceipts.$inferSelect;
export type InsertPartyLedgerEntry = z.infer<typeof insertPartyLedgerEntrySchema>;
export type PartyLedgerEntry = typeof partyLedgerEntries.$inferSelect;
export type InsertLocalPayment = z.infer<typeof insertLocalPaymentSchema>;
export type LocalPayment = typeof localPayments.$inferSelect;
export type InsertReturnCase = z.infer<typeof insertReturnCaseSchema>;
export type ReturnCase = typeof returnCases.$inferSelect;
export type InsertPartyCollection = z.infer<typeof insertPartyCollectionSchema>;
export type PartyCollection = typeof partyCollections.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;
