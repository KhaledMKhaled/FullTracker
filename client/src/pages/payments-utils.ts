export type AutoAllocationVisibilityInput = {
  costComponent: string;
  partyType: "supplier" | "shipping_company";
  selectedShipmentId: number | null;
  paymentCurrency?: string;
  shippingCompanyId?: number | null;
};

export const shouldShowAutoAllocationSection = ({
  costComponent,
  partyType,
  selectedShipmentId,
  shippingCompanyId,
}: AutoAllocationVisibilityInput): boolean =>
  costComponent === "تكلفة البضاعة" &&
  partyType === "shipping_company" &&
  Boolean(selectedShipmentId) &&
  typeof shippingCompanyId === "number";

export const canAutoAllocatePayment = ({
  paymentCurrency,
  ...rest
}: AutoAllocationVisibilityInput): boolean =>
  shouldShowAutoAllocationSection(rest) && paymentCurrency === "RMB";

type SupplierGoodsSummaryInput = {
  costComponent: string;
  partyType: "supplier" | "shipping_company";
  shipmentId: number | null;
  partyId: number | null;
};

export const shouldUseSupplierGoodsSummary = ({
  costComponent,
  partyType,
  shipmentId,
  partyId,
}: SupplierGoodsSummaryInput): boolean =>
  costComponent === "تكلفة البضاعة" &&
  partyType === "supplier" &&
  Boolean(shipmentId) &&
  Boolean(partyId);

export type PaymentPayloadInput = {
  selectedShipmentId: number;
  partyType: "supplier" | "shipping_company" | null;
  partyId: number | null;
  paymentDate: string;
  paymentCurrency: string;
  amountOriginal: string;
  exchangeRateToEgp: string;
  amountEgp: string;
  costComponent: string;
  paymentMethod: string;
  cashReceiverName?: string;
  referenceNumber?: string;
  note?: string;
  autoAllocate?: boolean;
  attachment?: File | null;
  attachmentUrl?: string | null;
  attachmentOriginalName?: string | null;
  attachmentMimeType?: string | null;
  attachmentSize?: number | null;
};

export const buildPaymentFormData = (input: PaymentPayloadInput): FormData => {
  const payload = new FormData();
  payload.append("shipmentId", String(input.selectedShipmentId));
  if (input.partyType && input.partyId) {
    payload.append("partyType", input.partyType);
    payload.append("partyId", String(input.partyId));
  }
  payload.append("paymentDate", input.paymentDate);
  payload.append("paymentCurrency", input.paymentCurrency);
  payload.append("amountOriginal", input.amountOriginal);
  if (input.paymentCurrency === "RMB") {
    payload.append("exchangeRateToEgp", input.exchangeRateToEgp);
  }
  payload.append("amountEgp", input.amountEgp);
  payload.append("costComponent", input.costComponent);
  payload.append("paymentMethod", input.paymentMethod);
  payload.append("cashReceiverName", input.cashReceiverName ?? "");
  payload.append("referenceNumber", input.referenceNumber ?? "");
  payload.append("note", input.note ?? "");
  if (input.autoAllocate) {
    payload.append("autoAllocate", "true");
  }
  // Use Object Storage URL if available, otherwise fallback to file upload
  if (input.attachmentUrl) {
    payload.append("attachmentUrl", input.attachmentUrl);
    if (input.attachmentOriginalName) {
      payload.append("attachmentOriginalName", input.attachmentOriginalName);
    }
    if (input.attachmentMimeType) {
      payload.append("attachmentMimeType", input.attachmentMimeType);
    }
    if (input.attachmentSize) {
      payload.append("attachmentSize", String(input.attachmentSize));
    }
  } else if (input.attachment) {
    payload.append("attachment", input.attachment);
  }
  return payload;
};

// Upload attachment to Object Storage and return the URL and metadata
// Uses the same approach as item images in shipment-wizard.tsx
export async function uploadPaymentAttachment(file: File): Promise<{ attachmentUrl: string; attachmentOriginalName: string; attachmentMimeType: string; attachmentSize: number }> {
  // Step 1: Request presigned URL from backend
  const urlResponse = await fetch("/api/upload/payment-attachment/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type || "image/jpeg",
    }),
  });

  if (!urlResponse.ok) {
    const error = await urlResponse.json().catch(() => ({}));
    throw new Error(error.message || "فشل الحصول على رابط الرفع");
  }

  const { uploadURL, objectPath } = await urlResponse.json();

  // Step 2: Upload file directly to Google Cloud Storage
  const uploadResponse = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "image/jpeg" },
  });

  if (!uploadResponse.ok) {
    throw new Error("فشل رفع المرفق");
  }

  // Step 3: Finalize upload (set ACL and get final path) - same as item images
  const finalizeResponse = await fetch("/api/upload/payment-attachment/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ objectPath, originalName: file.name }),
  });

  if (!finalizeResponse.ok) {
    const finalizeError = await finalizeResponse.json().catch(() => ({}));
    throw new Error(finalizeError.message || "فشل حفظ المرفق");
  }

  const result = await finalizeResponse.json();
  return {
    attachmentUrl: result.attachmentUrl,
    attachmentOriginalName: result.attachmentOriginalName || file.name,
    attachmentMimeType: file.type || "image/jpeg",
    attachmentSize: file.size,
  };
}
