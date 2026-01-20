import assert from "node:assert";
import test from "node:test";
import type { Request, Response } from "express";

process.env.DATABASE_URL ||= "postgres://example.com:5432/test";

const { requireRole } = await import("../auth");

type MiddlewareResult = {
  status: number;
  body?: unknown;
  nextCalled: boolean;
};

function runMiddleware(role: string): MiddlewareResult {
  const middleware = requireRole(["مدير", "محاسب"]);

  const req = {
    isAuthenticated: () => true,
    user: {
      id: "user-1",
      username: "tester",
      firstName: "Test",
      lastName: "User",
      role,
    },
  } as unknown as Request;

  const res = {
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
  } as unknown as Response & { statusCode: number; body?: unknown };

  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  return { status: (res as any).statusCode, body: (res as any).body, nextCalled };
}

test("viewer role receives 403 with Arabic message", () => {
  const result = runMiddleware("مشاهد");

  assert.strictEqual(result.status, 403);
  assert.deepStrictEqual(result.body, { message: "لا تملك صلاحية لتنفيذ هذا الإجراء" });
  assert.strictEqual(result.nextCalled, false);
});

test("inventory manager role receives 403 with Arabic message", () => {
  const result = runMiddleware("مسؤول مخزون");

  assert.strictEqual(result.status, 403);
  assert.deepStrictEqual(result.body, { message: "لا تملك صلاحية لتنفيذ هذا الإجراء" });
  assert.strictEqual(result.nextCalled, false);
});

test("manager role proceeds to next middleware", () => {
  const result = runMiddleware("مدير");

  assert.strictEqual(result.status, 200);
  assert.strictEqual(result.body, undefined);
  assert.strictEqual(result.nextCalled, true);
});
