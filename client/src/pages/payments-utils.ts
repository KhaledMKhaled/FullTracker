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

// Upload attachment directly to local server storage (persistent, no Object Storage needed)
export async function uploadPaymentAttachment(file: File): Promise<{ attachmentUrl: string; attachmentOriginalName: string; attachmentMimeType: string; attachmentSize: number }> {
  const formData = new FormData();
  formData.append("attachment", file);

  const response = await fetch("/api/upload/payment-attachment/direct", {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "فشل رفع المرفق");
  }

  const result = await response.json();
  return {
    attachmentUrl: result.attachmentUrl,
    attachmentOriginalName: result.attachmentOriginalName || file.name,
    attachmentMimeType: result.attachmentMimeType || file.type || "image/jpeg",
    attachmentSize: result.attachmentSize || file.size,
  };
}
