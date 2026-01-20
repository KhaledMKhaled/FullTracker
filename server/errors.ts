export type ErrorCode =
  | "AUTH_REQUIRED"
  | "PERMISSION_DENIED"
  | "VALIDATION_ERROR"
  | "SHIPPING_COMPANY_NAME_EXISTS"
  | "SHIPMENT_NOT_FOUND"
  | "SHIPMENT_LOCKED"
  | "PAYMENT_DATE_INVALID"
  | "PAYMENT_PAYLOAD_INVALID"
  | "PAYMENT_RATE_MISSING"
  | "PAYMENT_CURRENCY_UNSUPPORTED"
  | "PAYMENT_OVERPAY"
  | "PAYMENT_TOTAL_MISSING"
  | "CONFLICT_RETRY"
  | "PAYMENT_DB_ERROR"
  | "PAYMENT_FETCH_FAILED"
  | "PAYMENT_DELETE_FAILED"
  | "UNKNOWN_ERROR";

export interface ApiErrorShape {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown> | null;
  };
}

const defaultMessages: Record<ErrorCode, string> = {
  AUTH_REQUIRED: "انتهت جلستك. سجّل الدخول لإكمال العملية.",
  PERMISSION_DENIED: "لا تملك صلاحية لإتمام هذه العملية.",
  VALIDATION_ERROR: "Validation error.",
  SHIPPING_COMPANY_NAME_EXISTS: "Shipping company name already exists",
  SHIPMENT_NOT_FOUND: "الشحنة غير موجودة. تأكد من اختيار شحنة صحيحة.",
  SHIPMENT_LOCKED: "لا يمكن إضافة دفعات على شحنة مغلقة أو مؤرشفة.",
  PAYMENT_DATE_INVALID: "تاريخ الدفع غير صالح. الرجاء اختيار تاريخ بصيغة YYYY-MM-DD.",
  PAYMENT_PAYLOAD_INVALID: "بيانات الدفعة غير مكتملة أو غير صحيحة. راجع الحقول المطلوبة.",
  PAYMENT_RATE_MISSING: "يلزم سعر صرف صحيح لدفعات RMB. أدخل سعر RMB→EGP لليوم.",
  PAYMENT_CURRENCY_UNSUPPORTED: "عملة الدفع غير مدعومة. استخدم EGP أو RMB فقط.",
  PAYMENT_OVERPAY: "لا يمكن دفع مبلغ أكبر من المتبقي على الشحنة. راجع الرصيد قبل الدفع.",
  PAYMENT_TOTAL_MISSING: "لا يمكن تسجيل دفعة قبل حساب إجمالي تكلفة الشحنة. راجع بيانات التكلفة للشحنة.",
  CONFLICT_RETRY: "حدث تعارض بسبب عملية أخرى على نفس الشحنة. أعد المحاولة بعد لحظات.",
  PAYMENT_DB_ERROR: "تعذر حفظ الدفعة بسبب خطأ في قاعدة البيانات.",
  PAYMENT_FETCH_FAILED: "تعذر جلب بيانات المدفوعات حالياً.",
  PAYMENT_DELETE_FAILED: "تعذر حذف الدفعة.",
  UNKNOWN_ERROR: "حدث خطأ غير متوقع أثناء حفظ الدفعة.",
};

export class ApiError extends Error {
  code: ErrorCode;
  status: number;
  details?: Record<string, unknown> | null;

  constructor(
    code: ErrorCode,
    message?: string,
    status = 400,
    details?: Record<string, unknown> | null,
  ) {
    super(message || defaultMessages[code]);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type Fallback = { code: ErrorCode; status?: number; message?: string; details?: Record<string, unknown> | null };

export function formatError(error: unknown, fallback?: Fallback): { status: number; body: ApiErrorShape } {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: {
          code: error.code,
          message: error.message || defaultMessages[error.code],
          details: error.details ?? null,
        },
      },
    };
  }

  const status = fallback?.status ?? 500;
  const code = fallback?.code ?? "UNKNOWN_ERROR";
  const message = fallback?.message || defaultMessages[code] || defaultMessages.UNKNOWN_ERROR;

  return {
    status,
    body: {
      ok: false,
      error: {
        code,
        message,
        details: fallback?.details ?? null,
      },
    },
  };
}

export function success<T>(data: T) {
  return { ok: true, data };
}

export const errors = { defaultMessages };
