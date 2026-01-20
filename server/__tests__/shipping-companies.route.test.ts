import assert from "node:assert/strict";
import { createServer } from "http";
import type { AddressInfo } from "net";
import express from "express";
import test, { beforeEach, mock } from "node:test";

import type { ShippingCompany } from "@shared/schema";
import { isAuthenticated, requireRole } from "../auth";

process.env.DATABASE_URL ||= "postgres://example.com:5432/test";
process.env.SESSION_SECRET ||= "test-secret";

const storageModule = await import("../storage");
const storage = storageModule.storage as any;

let companiesFixture: ShippingCompany[] = [];

const mockedGetAllShippingCompanies = mock.method(
  storage,
  "getAllShippingCompanies",
  async () => companiesFixture,
);
const mockedCreateShippingCompany = mock.method(
  storage,
  "createShippingCompany",
  async (payload: Partial<ShippingCompany>) =>
    buildCompany({ id: 3, name: payload.name ?? "شركة شحن" }),
);
const mockedGetShippingCompanyByName = mock.method(
  storage,
  "getShippingCompanyByName",
  async () => undefined,
);

const { registerRoutes } = await import("../routes");

function buildCompany(overrides: Partial<ShippingCompany>): ShippingCompany {
  return {
    id: 1,
    name: "شركة شحن",
    contactName: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    isActive: true,
    createdAt: new Date("2024-01-02"),
    updatedAt: new Date("2024-01-02"),
    ...overrides,
  };
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
  await registerRoutes(httpServer, app, {
    storage,
    auditLogger: () => {},
    auth: {
      setupAuth: async () => {},
      isAuthenticated,
      requireRole,
    },
  });

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;

  const close = () =>
    new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });

  return { port, close };
}

beforeEach(() => {
  mockedGetAllShippingCompanies.mock.resetCalls();
  mockedCreateShippingCompany.mock.resetCalls();
  mockedGetShippingCompanyByName.mock.resetCalls();
  companiesFixture = [];
});

test("GET /api/shipping-companies returns all companies", async () => {
  companiesFixture = [
    buildCompany({ id: 1, name: "شركة شحن أ" }),
    buildCompany({ id: 2, name: "شركة شحن ب" }),
  ];

  const { port, close } = await createTestServer({ id: "manager-1", role: "مدير" });

  const response = await fetch(`http://127.0.0.1:${port}/api/shipping-companies`);
  const body = await response.json();
  await close();

  assert.equal(response.status, 200);
  assert.equal(body.length, 2);
  assert.deepEqual(
    body.map((company: ShippingCompany) => company.name),
    ["شركة شحن أ", "شركة شحن ب"],
  );
});

test("POST /api/shipping-companies creates a company for allowed roles", async () => {
  const { port, close } = await createTestServer({ id: "manager-1", role: "مدير" });

  const response = await fetch(`http://127.0.0.1:${port}/api/shipping-companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "شركة الشحن الجديدة", isActive: true }),
  });
  const body = await response.json();
  await close();

  assert.equal(response.status, 200);
  assert.equal(body.name, "شركة الشحن الجديدة");
  assert.equal(mockedCreateShippingCompany.mock.calls.length, 1);
});

test("POST /api/shipping-companies returns 403 for unauthorized role", async () => {
  const { port, close } = await createTestServer({ id: "viewer-1", role: "مشاهد" });

  const response = await fetch(`http://127.0.0.1:${port}/api/shipping-companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "شركة شحن" }),
  });
  const body = await response.json();
  await close();

  assert.equal(response.status, 403);
  assert.equal(body.message, "لا تملك صلاحية لتنفيذ هذا الإجراء");
});

test("POST /api/shipping-companies returns 409 for duplicate name", async () => {
  mockedGetShippingCompanyByName.mock.mockImplementationOnce(async () =>
    buildCompany({ id: 9, name: "شركة متكررة" }),
  );
  const { port, close } = await createTestServer({ id: "manager-1", role: "مدير" });

  const response = await fetch(`http://127.0.0.1:${port}/api/shipping-companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "شركة متكررة" }),
  });
  const body = await response.json();
  await close();

  assert.equal(response.status, 409);
  assert.equal(body.error.message, "Shipping company name already exists");
});

test("POST /api/shipping-companies returns 400 for invalid payload", async () => {
  const { port, close } = await createTestServer({ id: "manager-1", role: "مدير" });

  const response = await fetch(`http://127.0.0.1:${port}/api/shipping-companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: null }),
  });
  const body = await response.json();
  await close();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.ok(Array.isArray(body.error.details?.fields));
});
