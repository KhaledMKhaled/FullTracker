import type { ShipmentPayment } from "@shared/schema";

export function hasPaymentAttachment(payment: Pick<ShipmentPayment, "attachmentUrl"> | null | undefined) {
  return Boolean(payment?.attachmentUrl);
}

export function getPaymentAttachmentPreviewUrl(paymentId: number) {
  return `/api/payments/${paymentId}/attachment/preview`;
}

export function getPaymentAttachmentDownloadUrl(paymentId: number) {
  return `/api/payments/${paymentId}/attachment`;
}
