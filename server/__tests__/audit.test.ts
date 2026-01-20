import assert from "node:assert/strict";
import test from "node:test";
import { logAuditEvent, type AuditEvent } from "../audit";

type CapturedAudit = AuditEvent & { id?: number };

class MockStorage {
  public logs: CapturedAudit[] = [];

  async createAuditLog(data: AuditEvent) {
    const entry = { ...data, id: this.logs.length + 1 };
    this.logs.push(entry);
    return entry as any;
  }
}

test("logAuditEvent records audit entries", async () => {
  const storage = new MockStorage();
  const event: AuditEvent = {
    userId: "user-1",
    entityType: "SHIPMENT",
    entityId: "123",
    actionType: "CREATE",
    details: { status: "جديدة" },
  };

  await logAuditEvent(event, storage as any);

  assert.equal(storage.logs.length, 1);
  assert.deepEqual(storage.logs[0], {
    ...event,
    id: 1,
  });
});

test("logAuditEvent swallows storage errors", async () => {
  const storage = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async createAuditLog(_data: AuditEvent) {
      throw new Error("DB unavailable");
    },
  };

  await assert.doesNotReject(async () => {
    await logAuditEvent(
      {
        entityType: "SHIPMENT",
        entityId: "999",
        actionType: "DELETE",
      },
      storage as any,
    );
  });
});
