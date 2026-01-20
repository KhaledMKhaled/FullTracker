import { cn } from "@/lib/utils";

export type PaymentSummaryReceiptData = {
  referenceNumber?: string;
  createdAt?: string;
  shipmentLabel: string;
  paymentDate: string;
  currencyLabel: string;
  componentLabel: string;
  partyLabel: string;
  amountLabel: string;
  paymentMethodLabel: string;
  receiverLabel: string;
  note: string;
  attachmentLabel: string;
  allowanceLabel?: string;
};

type PaymentSummaryReceiptProps = {
  data: PaymentSummaryReceiptData;
  variant?: "display" | "export";
  className?: string;
};

function SummaryRow({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "display" | "export";
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span
        className={cn(
          "shrink-0",
          variant === "export" ? "text-slate-600" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span className="text-right font-medium break-words max-w-[60%]">
        {value}
      </span>
    </div>
  );
}

export function PaymentSummaryReceipt({
  data,
  variant = "display",
  className,
}: PaymentSummaryReceiptProps) {
  return (
    <div
      dir="rtl"
      className={cn(
        "min-w-0 space-y-4 rounded-lg border p-4 text-sm",
        variant === "export" ? "bg-white text-slate-900 border-slate-200" : "bg-background",
        className,
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h3 className="text-base font-semibold">ملخص الدفعة</h3>
        {data.referenceNumber && data.referenceNumber !== "-" && (
          <span className="max-w-[60%] break-words rounded-md border px-2 py-1 text-xs font-mono">
            {data.referenceNumber}
          </span>
        )}
      </div>
      <div className="space-y-2">
        <SummaryRow
          label="رقم المرجع"
          value={data.referenceNumber || "-"}
          variant={variant}
        />
        <SummaryRow
          label="تاريخ الدفع"
          value={data.paymentDate || "-"}
          variant={variant}
        />
        {data.createdAt && (
          <SummaryRow
            label="تاريخ/وقت الحفظ"
            value={data.createdAt}
            variant={variant}
          />
        )}
        <SummaryRow
          label="الشحنة"
          value={data.shipmentLabel}
          variant={variant}
        />
        <SummaryRow
          label="العملة"
          value={data.currencyLabel}
          variant={variant}
        />
        <SummaryRow
          label="البند"
          value={data.componentLabel}
          variant={variant}
        />
        <SummaryRow
          label="الطرف"
          value={data.partyLabel}
          variant={variant}
        />
        <SummaryRow
          label="المبلغ"
          value={data.amountLabel}
          variant={variant}
        />
        <SummaryRow
          label="طريقة الدفع"
          value={data.paymentMethodLabel}
          variant={variant}
        />
        <SummaryRow
          label="المستلم"
          value={data.receiverLabel}
          variant={variant}
        />
        <SummaryRow label="ملاحظات" value={data.note} variant={variant} />
        <SummaryRow label="المرفق" value={data.attachmentLabel} variant={variant} />
        {data.allowanceLabel && (
          <SummaryRow
            label="المتبقي بعد هذه الدفعة"
            value={data.allowanceLabel}
            variant={variant}
          />
        )}
      </div>
    </div>
  );
}
