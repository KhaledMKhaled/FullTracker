import assert from "node:assert/strict";
import test from "node:test";
import { requireRole } from "../server/auth";

type MockRequest = {
  isAuthenticated: () => boolean;
  user?: Express.User;
};

type MockResponse = {
  statusCode: number;
  payload: any;
  status: (code: number) => MockResponse;
  json: (body: any) => MockResponse;
};

type NextFn = () => void;

function createResponse(): MockResponse {
  return {
    statusCode: 200,
    payload: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.payload = body;
      return this;
    },
  };
}

test("returns 401 when unauthenticated", async () => {
  const middleware = requireRole(["مدير", "محاسب"]);
  const req: MockRequest = {
    isAuthenticated: () => false,
  } as any;
  const res = createResponse();
  let nextCalled = false;

  await middleware(req as any, res as any, (() => {
    nextCalled = true;
  }) as NextFn);

  assert.equal(res.statusCode, 401);
  assert.equal(res.payload?.message, "يجب تسجيل الدخول أولاً");
  assert.equal(nextCalled, false);
});

test("blocks roles outside the allowed list with 403", async () => {
  const middleware = requireRole(["مدير", "محاسب"]);
  const req: MockRequest = {
    isAuthenticated: () => true,
    user: { id: "1", username: "viewer", firstName: null, lastName: null, role: "مشاهد" },
  } as any;
  const res = createResponse();
  let nextCalled = false;

  await middleware(req as any, res as any, (() => {
    nextCalled = true;
  }) as NextFn);

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload?.message, "لا تملك صلاحية لتنفيذ هذا الإجراء");
  assert.equal(nextCalled, false);
});

test("allows permitted roles to continue", async () => {
  const middleware = requireRole(["مدير", "محاسب"]);
  const req: MockRequest = {
    isAuthenticated: () => true,
    user: { id: "1", username: "admin", firstName: null, lastName: null, role: "مدير" },
  } as any;
  const res = createResponse();
  let nextCalled = false;

  await middleware(req as any, res as any, (() => {
    nextCalled = true;
  }) as NextFn);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload, undefined);
  assert.equal(nextCalled, true);
});
