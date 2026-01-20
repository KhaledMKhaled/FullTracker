import { storage, type IStorage } from "./storage";
import type { InsertAuditLog } from "@shared/schema";

export type AuditActionType = "CREATE" | "UPDATE" | "DELETE" | "STATUS_CHANGE";
export type AuditEntityType =
  | "SHIPMENT"
  | "PAYMENT"
  | "EXCHANGE_RATE"
  | "USER"
  | "SHIPPING_COMPANY"
  | "BACKUP"
  | "PARTY"
  | "LOCAL_INVOICE"
  | "LOCAL_PAYMENT"
  | "RETURN_CASE"
  | "PARTY_SEASON";

interface AuditEvent {
  userId?: string | null;
  entityType: AuditEntityType;
  entityId: string | number;
  actionType: AuditActionType;
  details?: unknown;
}

function serializeDetails(details: unknown) {
  if (details === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(details));
  } catch (error) {
    console.error("Failed to serialize audit log details", error);
    return { error: "Unable to serialize details" };
  }
}

export function logAuditEvent(
  event: AuditEvent,
  auditStorage: Pick<IStorage, "createAuditLog"> = storage,
): void {
  const payload: InsertAuditLog = {
    userId: event.userId || null,
    entityType: event.entityType,
    entityId: String(event.entityId),
    actionType: event.actionType,
    details: serializeDetails(event.details),
  };

  void auditStorage.createAuditLog(payload).catch((error) => {
    console.error("Failed to write audit log", { error, payload });
  });
}
