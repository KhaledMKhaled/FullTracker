import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

export function PaymentReceiptUpload({ paymentId, hasReceipt, onSaved }: {
  paymentId: number; hasReceipt: boolean; onSaved: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!user || !["مدير", "محاسب"].includes(user.role)) return null;
  return <>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden"
      aria-label={`رفع إيصال الدفعة ${paymentId}`}
      onChange={async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          toast({ title: "يجب ألا يزيد حجم الصورة عن 2MB", variant: "destructive" }); return;
        }
        if (hasReceipt && !window.confirm("استبدال صورة الإيصال فقط؟ لن تتغير بيانات الدفعة.")) return;
        setBusy(true);
        try {
          const form = new FormData(); form.append("attachment", file);
          const response = await fetch(`/api/payments/${paymentId}/attachment`, {
            method: "POST", credentials: "include", body: form,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || result.error?.message || "تعذر رفع الإيصال");
          onSaved();
          await queryClient.invalidateQueries();
          toast({ title: "تم حفظ الإيصال", description: "سيُضمّن في النسخ الاحتياطية التالية دون تغيير بيانات الدفعة." });
        } catch (error) {
          toast({ title: error instanceof Error ? error.message : "تعذر رفع الإيصال", variant: "destructive" });
        } finally { setBusy(false); }
      }} />
    <Button type="button" variant="ghost" size="sm" disabled={busy}
      onClick={() => input.current?.click()} data-testid={`payment-reupload-${paymentId}`}>
      <Upload className="h-4 w-4 ml-1" />
      {busy ? "جارٍ الحفظ..." : hasReceipt ? "إعادة رفع الإيصال" : "رفع إيصال"}
    </Button>
  </>;
}
