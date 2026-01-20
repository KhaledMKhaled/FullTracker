import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  Shipment,
  ShipmentCustomsDetails,
  ShipmentItem,
  ShipmentShippingDetails,
  ShipmentPayment,
  PaymentAllocation,
  Supplier,
} from "@shared/schema";
import { computeShipmentKnownTotal, DatabaseStorage, MissingRmbRateError } from "./storage";

const baseShipment: Shipment = {
  id: 1,
  shipmentCode: "S-1",
  shipmentName: "Test",
  purchaseDate: new Date("2024-01-01"),
  status: "جديدة",
  invoiceCustomsDate: null,
  shippingCompanyId: null,
  createdByUserId: null,
  purchaseCostRmb: "0",
  purchaseCostEgp: "0",
  purchaseRmbToEgpRate: "0",
  commissionCostRmb: "0",
  commissionCostEgp: "0",
  shippingCostRmb: "0",
  shippingCostEgp: "0",
  customsCostEgp: "0",
  takhreegCostEgp: "0",
  finalTotalCostEgp: "0",
  totalPaidEgp: "0",
  balanceEgp: "0",
  partialDiscountRmb: "0",
  discountNotes: null,
  lastPaymentDate: null,
  createdAt: new Date("2024-01-02"),
  updatedAt: new Date("2024-01-02"),
};

const buildShipment = (overrides: Partial<Shipment>): Shipment => ({
  ...baseShipment,
  ...overrides,
});

const buildItem = (overrides: Partial<ShipmentItem>): ShipmentItem => ({
  id: 1,
  shipmentId: baseShipment.id,
  supplierId: null,
  productId: null,
  productType: null,
  productName: "Item",
  description: null,
  countryOfOrigin: "China",
  imageUrl: null,
  cartonsCtn: 0,
  piecesPerCartonPcs: 0,
  totalPiecesCou: 0,
  purchasePricePerPiecePriRmb: "0",
  totalPurchaseCostRmb: "0",
  customsCostPerCartonEgp: null,
  totalCustomsCostEgp: null,
  takhreegCostPerCartonEgp: null,
  totalTakhreegCostEgp: null,
  createdAt: new Date("2024-01-02"),
  updatedAt: new Date("2024-01-02"),
  ...overrides,
});

const buildSupplier = (overrides: Partial<Supplier>): Supplier => ({
  id: 1,
  name: "Supplier",
  description: null,
  country: "الصين",
  phone: null,
  email: null,
  address: null,
  isActive: true,
  createdAt: new Date("2024-01-02"),
  updatedAt: new Date("2024-01-02"),
  ...overrides,
});

const buildPayment = (overrides: Partial<ShipmentPayment>): ShipmentPayment => ({
  id: 1,
  shipmentId: baseShipment.id,
  partyType: null,
  partyId: null,
  paymentDate: new Date("2024-01-05"),
  paymentCurrency: "EGP",
  amountOriginal: "40",
  exchangeRateToEgp: null,
  amountEgp: "40",
  costComponent: "تكلفة البضاعة",
  paymentMethod: "نقدي",
  cashReceiverName: null,
  referenceNumber: null,
  note: null,
  attachmentUrl: null,
  attachmentMimeType: null,
  attachmentSize: null,
  attachmentOriginalName: null,
  attachmentUploadedAt: null,
  createdByUserId: "user-1",
  createdAt: new Date("2024-01-05"),
  updatedAt: new Date("2024-01-05"),
  ...overrides,
});

const buildReportingStorage = (data: {
  suppliers: Supplier[];
  shippingCompanies?: Array<{ id: number; name: string }>;
  shipments: Shipment[];
  payments: ShipmentPayment[];
  allocations?: PaymentAllocation[];
  itemsByShipment: Map<number, ShipmentItem[]>;
  users?: Array<{ id: string; firstName?: string; username?: string }>;
}) => {
  const storage = new DatabaseStorage();
  storage.getAllSuppliers = async () => data.suppliers;
  storage.getSupplier = async (id: number) =>
    data.suppliers.find((supplier) => supplier.id === id);
  storage.getAllShippingCompanies = async () => data.shippingCompanies ?? [];
  storage.getShippingCompany = async (id: number) =>
    data.shippingCompanies?.find((company) => company.id === id);
  storage.getAllShipments = async () => data.shipments;
  storage.getAllPayments = async () => data.payments;
  storage.getAllPaymentAllocations = async () => data.allocations ?? [];
  storage.getShipmentItems = async (shipmentId: number) =>
    data.itemsByShipment.get(shipmentId) ?? [];
  storage.getAllUsers = async () => data.users ?? [];
  return storage;
};

const buildAllocation = (overrides: Partial<PaymentAllocation>): PaymentAllocation => ({
  id: 1,
  paymentId: 1,
  shipmentId: baseShipment.id,
  supplierId: 1,
  component: "تكلفة البضاعة",
  currency: "RMB",
  allocatedAmount: "40",
  createdByUserId: null,
  createdAt: new Date("2024-01-05"),
  ...overrides,
});

describe("computeShipmentKnownTotal", () => {
  it("sums available EGP components for جديدة without NaN", () => {
    const shipment = buildShipment({
      status: "جديدة",
      purchaseCostEgp: "150.50",
      customsCostEgp: "25",
      takhreegCostEgp: "0",
    });

    const total = computeShipmentKnownTotal({ shipment });

    assert.equal(total, 175.5);
  });

  it("converts RMB-only totals using the shipment purchase rate for في انتظار الشحن", () => {
    const shipment = buildShipment({
      status: "في انتظار الشحن",
      purchaseCostRmb: "200",
      shippingCostRmb: "30",
      commissionCostRmb: "20",
      purchaseRmbToEgpRate: "5",
    });

    const total = computeShipmentKnownTotal({ shipment });

    assert.equal(total, 1250);
  });

  it("uses shipping details and item fallbacks for جاهزة للاستلام", () => {
    const shipment = buildShipment({
      status: "جاهزة للاستلام",
      purchaseCostEgp: "0",
      purchaseCostRmb: "0",
      customsCostEgp: "0",
      takhreegCostEgp: "0",
    });

    const shippingDetails: ShipmentShippingDetails = {
      id: 1,
      shipmentId: shipment.id,
      totalPurchaseCostRmb: "0",
      commissionRatePercent: "0",
      commissionValueRmb: "10",
      commissionValueEgp: "0",
      shippingAreaSqm: "0",
      shippingCostPerSqmUsdOriginal: null,
      totalShippingCostUsdOriginal: null,
      totalShippingCostRmb: "0",
      totalShippingCostEgp: "40",
      shippingDate: null,
      rmbToEgpRateAtShipping: null,
      usdToRmbRateAtShipping: null,
      sourceOfRates: null,
      ratesUpdatedAt: null,
      createdAt: new Date("2024-01-03"),
      updatedAt: new Date("2024-01-03"),
    };

    const customsDetails: ShipmentCustomsDetails = {
      id: 1,
      shipmentId: shipment.id,
      totalCustomsCostEgp: "0",
      totalTakhreegCostEgp: "0",
      customsInvoiceDate: null,
      createdAt: new Date("2024-01-03"),
      updatedAt: new Date("2024-01-03"),
    };

    const items: ShipmentItem[] = [
      buildItem({
        id: 10,
        cartonsCtn: 2,
        totalPurchaseCostRmb: "60",
        customsCostPerCartonEgp: "5",
        takhreegCostPerCartonEgp: "3",
      }),
      buildItem({
        id: 11,
        cartonsCtn: 1,
        totalPurchaseCostRmb: "40",
        customsCostPerCartonEgp: "4",
        takhreegCostPerCartonEgp: "3",
      }),
    ];

    const total = computeShipmentKnownTotal({
      shipment,
      shippingDetails,
      customsDetails,
      items,
      latestRmbToEgpRate: 6.2,
    });

    assert.equal(total, 745);
  });

  it("prefers payment rates before defaults for مستلمة بنجاح", () => {
    const shipment = buildShipment({
      status: "مستلمة بنجاح",
      shippingCostRmb: "20",
      customsCostEgp: "10",
      purchaseRmbToEgpRate: "0",
    });

    const total = computeShipmentKnownTotal({
      shipment,
      paymentRmbToEgpRate: 5.5,
      defaultRmbToEgpRate: 6.5,
    });

    assert.equal(total, 120);
  });

  it("throws when RMB totals are present without any usable rate", () => {
    const shipment = buildShipment({
      status: "في انتظار الشحن",
      purchaseCostRmb: "100",
      purchaseRmbToEgpRate: "0",
    });

    assert.throws(() => {
      computeShipmentKnownTotal({ shipment });
    }, MissingRmbRateError);
  });
});

describe("supplier reporting with payment allocations", () => {
  it("uses allocations to calculate supplier balances in RMB", async () => {
    const supplierA = buildSupplier({ id: 1, name: "Supplier A" });
    const supplierB = buildSupplier({ id: 2, name: "Supplier B" });
    const shipment = buildShipment({
      id: 10,
      shipmentCode: "S-10",
      shipmentName: "Shipment 10",
      purchaseDate: new Date("2024-01-03"),
    });
    const itemsByShipment = new Map<number, ShipmentItem[]>([
      [
        shipment.id,
        [buildItem({ shipmentId: shipment.id, supplierId: 1, totalPurchaseCostRmb: "100" })],
      ],
    ]);
    const payment = buildPayment({
      shipmentId: shipment.id,
      partyType: "shipping_company",
      partyId: 99,
      paymentCurrency: "RMB",
      amountOriginal: "40",
      amountEgp: "0",
    });
    const allocation = buildAllocation({
      shipmentId: shipment.id,
      supplierId: supplierA.id,
      paymentId: payment.id,
      allocatedAmount: "40",
    });

    const storage = buildReportingStorage({
      suppliers: [supplierA, supplierB],
      shipments: [shipment],
      payments: [payment],
      allocations: [allocation],
      itemsByShipment,
    });

    const balances = await storage.getSupplierBalances();

    const balanceA = balances.find((row) => row.supplierId === supplierA.id);
    const balanceB = balances.find((row) => row.supplierId === supplierB.id);

    assert.equal(balanceA?.totalCostRmb, "100.00");
    assert.equal(balanceA?.totalPaidRmb, "40.00");
    assert.equal(balanceA?.balanceStatusRmb, "owing");

    assert.equal(balanceB?.totalCostRmb, "0.00");
    assert.equal(balanceB?.totalPaidRmb, "0.00");
    assert.equal(balanceB?.balanceStatusRmb, "settled");
  });

  it("includes allocation movements in supplier statements", async () => {
    const supplierA = buildSupplier({ id: 1, name: "Supplier A" });
    const supplierB = buildSupplier({ id: 2, name: "Supplier B" });
    const shipment = buildShipment({
      id: 11,
      shipmentCode: "S-11",
      shipmentName: "Shipment 11",
      purchaseDate: new Date("2024-01-04"),
    });
    const itemsByShipment = new Map<number, ShipmentItem[]>([
      [
        shipment.id,
        [buildItem({ shipmentId: shipment.id, supplierId: 1, totalPurchaseCostRmb: "75" })],
      ],
    ]);
    const payment = buildPayment({
      shipmentId: shipment.id,
      partyType: "shipping_company",
      partyId: 99,
      paymentCurrency: "RMB",
      amountOriginal: "20",
      amountEgp: "0",
      paymentDate: new Date("2024-01-06"),
    });
    const allocation = buildAllocation({
      shipmentId: shipment.id,
      supplierId: supplierA.id,
      paymentId: payment.id,
      allocatedAmount: "20",
    });

    const storage = buildReportingStorage({
      suppliers: [supplierA, supplierB],
      shipments: [shipment],
      payments: [payment],
      allocations: [allocation],
      itemsByShipment,
    });

    const statementA = await storage.getSupplierStatement(1);
    const allocationMovement = statementA.movements.find(
      (move) => move.description.includes("توزيع تلقائي"),
    );
    assert.equal(allocationMovement?.paidRmb, "20.00");
    assert.equal(allocationMovement?.runningBalanceRmb, "55.00");
    assert.equal(allocationMovement?.paymentId, payment.id);

    const statementB = await storage.getSupplierStatement(2);
    assert.equal(statementB.movements.length, 0);
  });

  it("adds allocation movements to the movement report", async () => {
    const supplierA = buildSupplier({ id: 1, name: "Supplier A" });
    const supplierB = buildSupplier({ id: 2, name: "Supplier B" });
    const shipment = buildShipment({
      id: 12,
      shipmentCode: "S-12",
      shipmentName: "Shipment 12",
      purchaseCostRmb: "100.00",
      purchaseDate: new Date("2024-01-04"),
    });
    const itemsByShipment = new Map<number, ShipmentItem[]>([
      [
        shipment.id,
        [buildItem({ shipmentId: shipment.id, supplierId: 1, totalPurchaseCostRmb: "100" })],
      ],
    ]);
    const payment = buildPayment({
      shipmentId: shipment.id,
      partyType: "shipping_company",
      partyId: 99,
      paymentCurrency: "RMB",
      amountOriginal: "30",
      amountEgp: "0",
      paymentDate: new Date("2024-01-07"),
    });
    const allocation = buildAllocation({
      shipmentId: shipment.id,
      supplierId: supplierA.id,
      paymentId: payment.id,
      allocatedAmount: "30",
    });

    const storage = buildReportingStorage({
      suppliers: [supplierA, supplierB],
      shipments: [shipment],
      payments: [payment],
      allocations: [allocation],
      itemsByShipment,
      users: [{ id: "user-1", firstName: "User" }],
    });

    const report = await storage.getMovementReport();
    const paymentMovement = report.movements.find(
      (movement) => movement.costComponent === "goods_cost",
    );
    const costMovement = report.movements.find(
      (movement) => movement.movementType === "تكلفة بضاعة",
    );

    assert.equal(paymentMovement?.partyId, supplierA.id);
    assert.equal(paymentMovement?.partyName, "Supplier A");
    assert.equal(paymentMovement?.partyType, "supplier");
    assert.equal(paymentMovement?.amountRmb, "30.00");
    assert.equal(paymentMovement?.paymentId, payment.id);
    assert.equal(costMovement?.partyId, supplierA.id);
  });

  it("maps shipping company costs to shipping company while purchase stays with item supplier", async () => {
    const purchaseSupplier = buildSupplier({ id: 5, name: "Purchase Supplier" });
    const shippingCompany = { id: 6, name: "Shipping Company" };
    const shipment = buildShipment({
      id: 20,
      shipmentCode: "S-20",
      shipmentName: "Shipment 20",
      purchaseDate: new Date("2024-02-01"),
      purchaseCostRmb: "200.00",
      purchaseCostEgp: "1400.00",
      shippingCostRmb: "50.00",
      shippingCostEgp: "350.00",
      commissionCostRmb: "10.00",
      commissionCostEgp: "70.00",
      customsCostEgp: "40.00",
      takhreegCostEgp: "30.00",
      shippingCompanyId: shippingCompany.id,
      finalTotalCostEgp: "1890.00",
    });
    const itemsByShipment = new Map<number, ShipmentItem[]>([
      [shipment.id, [buildItem({ shipmentId: shipment.id, supplierId: purchaseSupplier.id })]],
    ]);

    const storage = buildReportingStorage({
      suppliers: [purchaseSupplier],
      shippingCompanies: [shippingCompany],
      shipments: [shipment],
      payments: [],
      itemsByShipment,
    });

    const report = await storage.getMovementReport();
    const movementByType = new Map(
      report.movements.map((movement) => [movement.movementType, movement]),
    );

    assert.equal(movementByType.get("تكلفة بضاعة")?.partyId, purchaseSupplier.id);
    assert.equal(movementByType.get("تكلفة شحن")?.partyId, shippingCompany.id);
    assert.equal(movementByType.get("عمولة")?.partyId, shippingCompany.id);
    assert.equal(movementByType.get("جمرك")?.partyId, shippingCompany.id);
    assert.equal(movementByType.get("تخريج")?.partyId, shippingCompany.id);
  });
});
