import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { ApiError } from "../errors";
import { createPaymentHandler } from "../routes";

const actor = {
  id: "actor-1",
  username: "tester",
  firstName: "Test",
  lastName: "User",
  role: "مدير",
};

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  } as any;
}

const baseBody = {
  paymentDate: "2024-01-02",
  shipmentId: 1,
  paymentCurrency: "EGP",
  amountOriginal: "100",
  amountEgp: "100",
  costComponent: "تكلفة البضاعة",
  paymentMethod: "نقدي",
};

function createHandler(
  overrides: {
    createPayment?: (...args: any[]) => any;
    getShipmentSupplierContext?: (...args: any[]) => any;
    getSupplier?: (...args: any[]) => any;
    getShippingCompany?: (...args: any[]) => any;
    getShipment?: (...args: any[]) => any;
    getShipmentPayments?: (...args: any[]) => any;
    getShipmentItems?: (...args: any[]) => any;
    getPaymentAllocationsByShipmentId?: (...args: any[]) => any;
  } = {},
) {
  const storage = {
    createPayment: overrides.createPayment || (async () => ({ id: 99 })),
    getShipmentSupplierContext:
      overrides.getShipmentSupplierContext ||
      (async () => ({
        itemSuppliers: [],
        shippingCompanyId: null,
        shipmentSuppliers: [],
      })),
    getSupplier: overrides.getSupplier || (async (id: number) => ({ id })),
    getShippingCompany: overrides.getShippingCompany || (async (id: number) => ({ id })),
    getShipment: overrides.getShipment || (async (id: number) => ({ id })),
    getShipmentPayments: overrides.getShipmentPayments || (async () => []),
    getShipmentItems: overrides.getShipmentItems || (async () => []),
    getPaymentAllocationsByShipmentId:
      overrides.getPaymentAllocationsByShipmentId || (async () => []),
  } as any;

  const handler = createPaymentHandler({ storage, logAuditEvent: () => {} });
  return { handler, storage };
}

test("POST /api/payments writes an audit log entry", async () => {
  process.env.DATABASE_URL ||= "postgres://example.com:5432/test";
  const storageMock = {
    createPayment: mock.fn(async (data) => ({
      ...data,
      id: 501,
      paymentCurrency: data.paymentCurrency,
      amountEgp: data.amountEgp,
      paymentMethod: data.paymentMethod,
      shipmentId: data.shipmentId,
      createdAt: new Date("2024-02-02"),
      updatedAt: new Date("2024-02-02"),
    })),
    getShipmentSupplierContext: mock.fn(async () => ({
      itemSuppliers: [],
      shippingCompanyId: null,
      shipmentSuppliers: [],
    })),
    getSupplier: mock.fn(async (id) => ({ id })),
    getShippingCompany: mock.fn(async (id) => ({ id })),
    getShipment: mock.fn(async (id) => ({ id })),
    getShipmentPayments: mock.fn(async () => []),
    getShipmentItems: mock.fn(async () => []),
    getPaymentAllocationsByShipmentId: mock.fn(async () => []),
  };

  const auditLogger = mock.fn();

  const handler = createPaymentHandler({
    storage: storageMock as any,
    logAuditEvent: auditLogger as any,
  });

  const payload = {
    shipmentId: 42,
    paymentDate: new Date("2024-02-01").toISOString(),
    paymentCurrency: "EGP",
    amountOriginal: "150.00",
    exchangeRateToEgp: null,
    amountEgp: "150.00",
    costComponent: "تكلفة البضاعة",
    paymentMethod: "نقدي",
    cashReceiverName: "Ali",
    referenceNumber: "REF-123",
  };

  const req = {
    body: payload,
    user: actor,
    isAuthenticated: () => true,
  } as any;

  const res = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
  } as any;

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);

  assert.equal(storageMock.createPayment.mock.calls.length, 1);
  const { arguments: [paymentInput] } = storageMock.createPayment.mock.calls[0];
  assert.equal(paymentInput.createdByUserId, actor.id);
  assert.ok(paymentInput.paymentDate instanceof Date);

  assert.equal(auditLogger.mock.calls.length, 1);
  const { arguments: [auditEvent] } = auditLogger.mock.calls[0];

  assert.equal(auditEvent.entityType, "PAYMENT");
  assert.equal(auditEvent.actionType, "CREATE");
  assert.equal(auditEvent.userId, actor.id);
  assert.deepEqual(auditEvent.details, {
    shipmentId: payload.shipmentId,
    partyType: null,
    partyId: null,
    partyRule: {
      shipmentSuppliers: [],
      required: false,
      defaulted: false,
    },
    amount: payload.amountEgp,
    currency: payload.paymentCurrency,
    method: payload.paymentMethod,
    hasAttachment: false,
  });

  mock.restoreAll();
});

test("accepts payment creation with a valid supplier party", async () => {
  const createPayment = mock.fn(async (data) => ({ id: 10, ...data }));
  const getShipmentSupplierContext = mock.fn(async () => ({
    itemSuppliers: [55],
    shippingCompanyId: null,
    shipmentSuppliers: [55],
  }));
  const getSupplier = mock.fn(async (id: number) => (id === 55 ? { id } : undefined));

  const { handler } = createHandler({
    createPayment,
    getShipmentSupplierContext,
    getSupplier,
  });

  const req = {
    body: { ...baseBody, partyType: "supplier", partyId: 55 },
    user: { id: "user-1" },
  } as any;
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(createPayment.mock.calls.length, 1);
  assert.equal(createPayment.mock.calls[0].arguments[0].partyId, 55);
  assert.equal(createPayment.mock.calls[0].arguments[0].partyType, "supplier");
});

test("accepts purchase payment with shipping company when shipment allows it", async () => {
  const createPayment = mock.fn(async (data) => ({ id: 10, ...data }));
  const getShipmentSupplierContext = mock.fn(async () => ({
    itemSuppliers: [55],
    shippingCompanyId: 77,
    shipmentSuppliers: [55],
  }));
  const getShippingCompany = mock.fn(async (id: number) => (id === 77 ? { id } : undefined));

  const { handler } = createHandler({
    createPayment,
    getShipmentSupplierContext,
    getShippingCompany,
  });

  const req = {
    body: { ...baseBody, partyType: "shipping_company", partyId: 77 },
    user: { id: "user-1" },
  } as any;
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(createPayment.mock.calls.length, 1);
  assert.equal(createPayment.mock.calls[0].arguments[0].partyId, 77);
  assert.equal(createPayment.mock.calls[0].arguments[0].partyType, "shipping_company");
});

test("returns 400 for invalid supplier party", async () => {
  const createPayment = mock.fn(async (data) => ({ id: 10, ...data }));
  const getSupplier = mock.fn(async () => undefined);

  const { handler } = createHandler({
    createPayment,
    getSupplier,
  });

  const req = {
    body: { ...baseBody, partyType: "supplier", partyId: 999 },
    user: { id: "user-1" },
  } as any;
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.error?.code, "SUPPLIER_NOT_FOUND");
  assert.equal(createPayment.mock.calls.length, 0);
});

test("requires partyId when shipment has supplier attribution", async () => {
  const createPayment = mock.fn(async (data) => ({ id: 10, ...data }));
  const getShipmentSupplierContext = mock.fn(async () => ({
    itemSuppliers: [5],
    shippingCompanyId: null,
    shipmentSuppliers: [5],
  }));

  const { handler } = createHandler({
    createPayment,
    getShipmentSupplierContext,
  });

  const req = {
    body: { ...baseBody, partyId: null },
    user: { id: "user-1" },
  } as any;
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.error?.code, "PARTY_REQUIRED");
  assert.equal(createPayment.mock.calls.length, 0);
});

test("defaults party allocation for shipping and purchase payments", async () => {
  const createPayment = mock.fn(async (data) => ({
    id: createPayment.mock.calls.length + 1,
    ...data,
  }));
  const getShipmentSupplierContext = mock.fn(async () => ({
    itemSuppliers: [11],
    shippingCompanyId: 22,
    shipmentSuppliers: [11],
  }));
  const getSupplier = mock.fn(async (id: number) => ({ id }));

  const { handler } = createHandler({
    createPayment,
    getShipmentSupplierContext,
    getSupplier,
  });

  const shippingReq = {
    body: {
      ...baseBody,
      costComponent: "الشحن",
      partyId: null,
    },
    user: { id: "user-1" },
  } as any;
  const shippingRes = createResponse();

  await handler(shippingReq, shippingRes);

  assert.equal(shippingRes.statusCode, 200);
  assert.equal(createPayment.mock.calls[0].arguments[0].partyId, 22);
  assert.equal(createPayment.mock.calls[0].arguments[0].partyType, "shipping_company");

  const purchaseReq = {
    body: {
      ...baseBody,
      costComponent: "تكلفة البضاعة",
      partyId: null,
    },
    user: { id: "user-1" },
  } as any;
  const purchaseRes = createResponse();

  await handler(purchaseReq, purchaseRes);

  assert.equal(purchaseRes.statusCode, 200);
  assert.equal(createPayment.mock.calls[1].arguments[0].partyId, 11);
  assert.equal(createPayment.mock.calls[1].arguments[0].partyType, "supplier");
});

test("returns PAYMENT_DATE_INVALID for malformed paymentDate", async () => {
  const { handler } = createHandler();
  const req = {
    body: { ...baseBody, paymentDate: "invalid-date" },
    user: { id: "user-1" },
  } as any;
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.error?.code, "PAYMENT_DATE_INVALID");
  assert.equal(
    res.body?.error?.message,
    "تاريخ الدفع غير صالح. الرجاء اختيار تاريخ بصيغة YYYY-MM-DD.",
  );
});

test("rejects non-numeric amountOriginal with clear message", async () => {
  const { handler } = createHandler();
  const req = {
    body: { ...baseBody, amountOriginal: "abc" },
    user: { id: "user-1" },
  } as any;
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.error?.code, "PAYMENT_PAYLOAD_INVALID");
  assert.equal(res.body?.error?.message, "المبلغ الأصلي يجب أن يكون رقمًا صحيحًا");
  assert.equal(res.body?.error?.details?.field, "amountOriginal");
});

test("rejects non-numeric exchange rate for RMB payments", async () => {
  const { handler } = createHandler();
  const req = {
    body: {
      ...baseBody,
      paymentCurrency: "RMB",
      exchangeRateToEgp: "rate",
    },
    user: { id: "user-1" },
  } as any;
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.error?.code, "PAYMENT_RATE_MISSING");
  assert.equal(res.body?.error?.message, "سعر الصرف لليوان يجب أن يكون رقمًا صحيحًا");
  assert.equal(res.body?.error?.details?.field, "exchangeRateToEgp");
});

test("returns 400 when shipment id is missing", async () => {
  const { handler } = createHandler();
  const req = {
    body: { ...baseBody, shipmentId: undefined },
    user: { id: "user-1" },
  } as any;
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.error?.code, "PAYMENT_PAYLOAD_INVALID");
  assert.equal(res.body?.error?.details?.field, "shipmentId");
});

test("rejects zero exchange rate for RMB payments", async () => {
  const { handler } = createHandler();
  const req = {
    body: {
      ...baseBody,
      paymentCurrency: "RMB",
      exchangeRateToEgp: "0",
    },
    user: { id: "user-1" },
  } as any;
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.error?.code, "PAYMENT_RATE_MISSING");
  assert.equal(res.body?.error?.message, "سعر الصرف لليوان يجب أن يكون أكبر من صفر");
  assert.equal(res.body?.error?.details?.field, "exchangeRateToEgp");
});

test("returns 404 when shipment is missing", async () => {
  const missingShipmentError = new ApiError("SHIPMENT_NOT_FOUND", undefined, 404);
  let createPaymentCalled = 0;
  const { handler } = createHandler({
    createPayment: async () => {
      createPaymentCalled += 1;
      throw missingShipmentError;
    },
  });
  const req = {
    body: baseBody,
    user: { id: "user-1" },
  } as any;
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body?.error?.code, "SHIPMENT_NOT_FOUND");
  assert.equal(res.body?.error?.message, "الشحنة غير موجودة. تأكد من اختيار شحنة صحيحة.");
  assert.equal(createPaymentCalled, 1);
});
