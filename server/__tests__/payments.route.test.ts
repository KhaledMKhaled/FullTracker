import assert from "node:assert/strict";
import { createServer } from "http";
import type { AddressInfo } from "net";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import test, { beforeEach, mock } from "node:test";

import type { InsertShipmentPayment, ShipmentPayment } from "@shared/schema";

process.env.DATABASE_URL ||= "postgres://example.com:5432/test";
process.env.SESSION_SECRET ||= "test-secret";

type ShipmentState = {
  status: string;
  total: number;
  paid: number;
};

const shipmentSeeds = [
  { id: 101, status: "جديدة" },
  { id: 102, status: "في انتظار الشحن" },
  { id: 103, status: "جاهزة للاستلام" },
  { id: 104, status: "مستلمة بنجاح" },
];

const storageState: {
  shipments: Map<number, ShipmentState>;
  payments: ShipmentPayment[];
} = {
  shipments: new Map(),
  payments: [],
};

let shipmentSuppliers: number[] = [];
let shipmentShippingCompanyId: number | null = null;
const suppliersById = new Map<number, { id: number; name?: string }>();
const shippingCompaniesById = new Map<number, { id: number; name?: string }>();

const createAuditLogMock = mock.fn(async () => ({}));

const createPaymentMock = mock.fn(async (data: InsertShipmentPayment) => {
  const shipment = storageState.shipments.get(data.shipmentId);

  if (!shipment) {
    const error = new Error("Shipment not found");
    (error as any).status = 404;
    throw error;
  }

  const attempted = Number(data.amountEgp);
  const remaining = Math.max(0, shipment.total - shipment.paid);

  if (attempted > remaining + 0.0001) {
    const error = new Error("Overpay not allowed");
    (error as any).status = 409;
    throw error;
  }

  shipment.paid += attempted;

  const payment: ShipmentPayment = {
    id: storageState.payments.length + 1,
    shipmentId: data.shipmentId,
    partyType: data.partyType ?? null,
    partyId: data.partyId ?? null,
    paymentDate: data.paymentDate,
    paymentCurrency: data.paymentCurrency,
    amountOriginal: data.amountOriginal.toString(),
    exchangeRateToEgp: data.exchangeRateToEgp ? data.exchangeRateToEgp.toString() : null,
    amountEgp: data.amountEgp.toString(),
    costComponent: data.costComponent,
    paymentMethod: data.paymentMethod,
    cashReceiverName: data.cashReceiverName ?? null,
    referenceNumber: data.referenceNumber ?? null,
    note: data.note ?? null,
    attachmentUrl: data.attachmentUrl ?? null,
    attachmentMimeType: data.attachmentMimeType ?? null,
    attachmentSize: data.attachmentSize ?? null,
    attachmentOriginalName: data.attachmentOriginalName ?? null,
    attachmentUploadedAt: data.attachmentUploadedAt ?? null,
    createdByUserId: data.createdByUserId ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  storageState.payments.push(payment);

  return payment;
});

const storageModule = await import("../storage");
const storage = storageModule.storage as any;
const mockedCreatePayment = mock.method(storage, "createPayment", createPaymentMock);
const mockedCreateAuditLog = mock.method(storage, "createAuditLog", createAuditLogMock);
const mockedGetAllPayments = mock.method(storage, "getAllPayments", async () => storageState.payments);
const mockedGetShipmentsByIds = mock.method(
  storage,
  "getShipmentsByIds",
  async (ids: number[]) =>
    ids.map((id) => ({
      id,
      status: storageState.shipments.get(id)?.status,
    })),
);
const mockedGetPaymentById = mock.method(
  storage,
  "getPaymentById",
  async (id: number) => storageState.payments.find((payment) => payment.id === id),
);
const mockedGetShipmentSupplierContext = mock.method(
  storage,
  "getShipmentSupplierContext",
  async () => ({
    itemSuppliers: shipmentSuppliers,
    shippingCompanyId: shipmentShippingCompanyId,
    shipmentSuppliers,
  }),
);
const mockedGetSupplier = mock.method(
  storage,
  "getSupplier",
  async (id: number) => suppliersById.get(id),
);
const mockedGetShippingCompany = mock.method(
  storage,
  "getShippingCompany",
  async (id: number) => shippingCompaniesById.get(id),
);

const { registerRoutes } = await import("../routes");

function resetStorageState() {
  storageState.shipments = new Map(
    shipmentSeeds.map(({ id, status }) => [id, { status, total: 1_000, paid: 0 }])
  );
  storageState.payments = [];
  shipmentSuppliers = [];
  shipmentShippingCompanyId = null;
  suppliersById.clear();
  shippingCompaniesById.clear();
  createPaymentMock.mock.resetCalls();
  createAuditLogMock.mock.resetCalls();
  mockedCreatePayment.mock.resetCalls();
  mockedCreateAuditLog.mock.resetCalls();
  mockedGetAllPayments.mock.resetCalls();
  mockedGetShipmentsByIds.mock.resetCalls();
  mockedGetPaymentById.mock.resetCalls();
  mockedGetShipmentSupplierContext.mock.resetCalls();
  mockedGetSupplier.mock.resetCalls();
  mockedGetShippingCompany.mock.resetCalls();
}

function createPaymentPayload(shipmentId: number, amount = "150.00") {
  return {
    shipmentId,
    paymentDate: new Date().toISOString(),
    paymentCurrency: "EGP",
    amountOriginal: amount,
    exchangeRateToEgp: null,
    amountEgp: amount,
    costComponent: "تكلفة البضاعة",
    paymentMethod: "نقدي",
    cashReceiverName: "Tester",
  } satisfies Record<string, unknown>;
}

const samplePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+9gAAAABJRU5ErkJggg==",
  "base64",
);

const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024;

function createPaymentFormData(shipmentId: number, amount = "150.00") {
  const form = new FormData();
  form.append("shipmentId", shipmentId.toString());
  form.append("paymentDate", new Date().toISOString());
  form.append("paymentCurrency", "EGP");
  form.append("amountOriginal", amount);
  form.append("amountEgp", amount);
  form.append("costComponent", "تكلفة البضاعة");
  form.append("paymentMethod", "نقدي");
  form.append("cashReceiverName", "Tester");
  return form;
}

async function createTestServer(user?: { id: string; role: string }) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => {
    req.user = user as any;
    req.isAuthenticated = () => Boolean(user);
    next();
  });

  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;

  const close = () =>
    new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });

  return { port, close };
}

beforeEach(() => {
  resetStorageState();
});

test("manager and accountant roles can create payments", async () => {
  for (const role of ["مدير", "محاسب"]) {
    const { port, close } = await createTestServer({ id: `${role}-1`, role });

    const response = await fetch(`http://127.0.0.1:${port}/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createPaymentPayload(101)),
    });

    const body = await response.json();
    await close();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.data.shipmentId, 101);
  }

  assert.equal(createPaymentMock.mock.calls.length, 2);
});

test("viewer and inventory roles are forbidden", async () => {
  for (const role of ["مشاهد", "مسؤول مخزون"]) {
    const { port, close } = await createTestServer({ id: `${role}-1`, role });

    const response = await fetch(`http://127.0.0.1:${port}/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createPaymentPayload(101)),
    });

    const body = await response.json();
    await close();

    assert.equal(response.status, 403);
    assert.deepEqual(body, { message: "لا تملك صلاحية لتنفيذ هذا الإجراء" });
  }

  assert.equal(createPaymentMock.mock.calls.length, 0);
});

test("creates payment with valid supplier party", async () => {
  const { port, close } = await createTestServer({ id: "manager-1", role: "مدير" });
  shipmentSuppliers = [88];
  suppliersById.set(88, { id: 88, name: "Supplier 88" });

  const response = await fetch(`http://127.0.0.1:${port}/api/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...createPaymentPayload(101), partyType: "supplier", partyId: 88 }),
  });

  const body = await response.json();
  await close();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(createPaymentMock.mock.calls[0].arguments[0].partyId, 88);
  assert.equal(createPaymentMock.mock.calls[0].arguments[0].partyType, "supplier");
});

test("creates payment with shipping company party", async () => {
  const { port, close } = await createTestServer({ id: "manager-1", role: "مدير" });
  shipmentShippingCompanyId = 42;
  shippingCompaniesById.set(42, { id: 42, name: "Shipping Co" });

  const response = await fetch(`http://127.0.0.1:${port}/api/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...createPaymentPayload(101),
      costComponent: "الشحن",
      partyType: "shipping_company",
      partyId: 42,
    }),
  });

  const body = await response.json();
  await close();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(createPaymentMock.mock.calls[0].arguments[0].partyId, 42);
  assert.equal(createPaymentMock.mock.calls[0].arguments[0].partyType, "shipping_company");
});

test("creates purchase payment with shipping company party when shipment has company", async () => {
  const { port, close } = await createTestServer({ id: "manager-1", role: "مدير" });
  shipmentShippingCompanyId = 77;
  shippingCompaniesById.set(77, { id: 77, name: "Shipping Co" });

  const response = await fetch(`http://127.0.0.1:${port}/api/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...createPaymentPayload(101),
      costComponent: "تكلفة البضاعة",
      partyType: "shipping_company",
      partyId: 77,
    }),
  });

  const body = await response.json();
  await close();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(createPaymentMock.mock.calls[0].arguments[0].partyId, 77);
  assert.equal(createPaymentMock.mock.calls[0].arguments[0].partyType, "shipping_company");
});

test("rejects invalid supplier party", async () => {
  const { port, close } = await createTestServer({ id: "manager-1", role: "مدير" });

  const response = await fetch(`http://127.0.0.1:${port}/api/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...createPaymentPayload(101), partyType: "supplier", partyId: 999 }),
  });

  const body = await response.json();
  await close();

  assert.equal(response.status, 400);
  assert.equal(body?.error?.code, "SUPPLIER_NOT_FOUND");
  assert.equal(createPaymentMock.mock.calls.length, 0);
});

test("requires partyId when shipment has supplier attribution", async () => {
  const { port, close } = await createTestServer({ id: "manager-1", role: "مدير" });
  shipmentSuppliers = [70, 71];

  const response = await fetch(`http://127.0.0.1:${port}/api/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createPaymentPayload(101)),
  });

  const body = await response.json();
  await close();

  assert.equal(response.status, 400);
  assert.equal(body?.error?.code, "PARTY_REQUIRED");
  assert.equal(createPaymentMock.mock.calls.length, 0);
});

for (const { id, status } of shipmentSeeds) {
  test(`allows payment for shipment status ${status} when not overpaying`, async () => {
    const { port, close } = await createTestServer({ id: "manager-1", role: "مدير" });

    const response = await fetch(`http://127.0.0.1:${port}/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createPaymentPayload(id, "200.00")),
    });

    const body = await response.json();
    await close();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.data.shipmentId, id);
    assert.equal(body.data.amountEgp, "200.00");
  });
}

test("creates payment without attachment using multipart form data", async () => {
  const { port, close } = await createTestServer({ id: "manager-1", role: "مدير" });
  const form = createPaymentFormData(101);

  const response = await fetch(`http://127.0.0.1:${port}/api/payments`, {
    method: "POST",
    body: form,
  });

  const body = await response.json();
  await close();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.shipmentId, 101);
});

test("creates payment with valid attachment and stores metadata", async () => {
  const { port, close } = await createTestServer({ id: "manager-1", role: "مدير" });
  const form = createPaymentFormData(101);
  form.append("attachment", new Blob([samplePng], { type: "image/png" }), "receipt.png");

  const response = await fetch(`http://127.0.0.1:${port}/api/payments`, {
    method: "POST",
    body: form,
  });

  const body = await response.json();
  await close();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.ok(body.data.attachmentUrl);
  assert.equal(body.data.attachmentMimeType, "image/png");
  assert.equal(body.data.attachmentOriginalName, "receipt.png");
});

test("rejects oversized payment attachment", async () => {
  const { port, close } = await createTestServer({ id: "manager-1", role: "مدير" });
  const form = createPaymentFormData(101);
  const bigBuffer = new Uint8Array(MAX_ATTACHMENT_SIZE + 1);
  form.append("attachment", new Blob([bigBuffer], { type: "image/png" }), "big.png");

  const response = await fetch(`http://127.0.0.1:${port}/api/payments`, {
    method: "POST",
    body: form,
  });

  const body = await response.json();
  await close();

  assert.equal(response.status, 400);
  assert.equal(body?.error?.message, "Image must be 2MB or less.");
});

test("rejects non-image payment attachment", async () => {
  const { port, close } = await createTestServer({ id: "manager-1", role: "مدير" });
  const form = createPaymentFormData(101);
  form.append("attachment", new Blob(["not an image"], { type: "text/plain" }), "note.txt");

  const response = await fetch(`http://127.0.0.1:${port}/api/payments`, {
    method: "POST",
    body: form,
  });

  const body = await response.json();
  await close();

  assert.equal(response.status, 400);
  assert.equal(body?.error?.message, "Only image files are allowed.");
});

test("blocks attachment access when unauthenticated", async () => {
  const uploadDir = path.join(process.cwd(), "uploads", "payments");
  fs.mkdirSync(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, "test-attachment.png");
  fs.writeFileSync(filePath, samplePng);

  storageState.payments.push({
    id: 999,
    shipmentId: 101,
    paymentDate: new Date(),
    paymentCurrency: "EGP",
    amountOriginal: "10.00",
    exchangeRateToEgp: null,
    amountEgp: "10.00",
    costComponent: "تكلفة البضاعة",
    paymentMethod: "نقدي",
    cashReceiverName: null,
    referenceNumber: null,
    note: null,
    attachmentUrl: "/uploads/payments/test-attachment.png",
    attachmentMimeType: "image/png",
    attachmentSize: samplePng.length,
    attachmentOriginalName: "test-attachment.png",
    attachmentUploadedAt: new Date(),
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const { port, close } = await createTestServer();

  const response = await fetch(
    `http://127.0.0.1:${port}/api/payments/999/attachment/preview`,
  );

  await close();
  fs.unlinkSync(filePath);

  assert.equal(response.status, 401);
});
