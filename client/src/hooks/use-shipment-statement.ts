import { useRef, useState } from "react";
import type { ShipmentStatement } from "@shared/shipmentStatement";
import { apiRequest, getErrorMessage } from "@/lib/queryClient";
import { downloadShipmentAccountStatement } from "@/lib/shipment-account-statement";
import { useToast } from "@/hooks/use-toast";

export function useShipmentStatementDownload() {
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const { toast } = useToast();
  const download = async (shipmentId: number) => {
    if (lock.current || !Number.isSafeInteger(shipmentId) || shipmentId <= 0) return;
    lock.current = true;
    setPendingId(shipmentId);
    setError(null);
    try {
      // Always fetch a fresh, complete snapshot; never reuse dashboard-filtered data.
      const response = await apiRequest("GET", `/api/shipments/${shipmentId}/account-statement`);
      const statement: ShipmentStatement = await response.json();
      if (statement.shipment?.id !== shipmentId || !Array.isArray(statement.payments) ||
          !Array.isArray(statement.components) || !Array.isArray(statement.items) ||
          !Array.isArray(statement.notes) || !statement.settlement ||
          !["native-components", "legacy-egp"].includes(statement.basis)) {
        throw new Error("بيانات كشف الحساب غير مكتملة أو لا تطابق الشحنة المختارة.");
      }
      await downloadShipmentAccountStatement(statement);
      toast({ title: "تم تجهيز كشف حساب الشحنة", description: statement.shipment.shipmentCode });
    } catch (cause) {
      const message = getErrorMessage(cause, {
        401: "انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.",
        403: "ليست لديك صلاحية لعرض كشف هذه الشحنة.",
        404: "الشحنة غير متاحة أو لم يعد لها سجل.",
        500: "تعذر إعداد كشف الحساب. يرجى المحاولة مرة أخرى.",
        defaultMessage: "تعذر تنزيل الكشف. تحقق من الاتصال ثم أعد المحاولة.",
      });
      setError(message);
      toast({ title: "تعذر تنزيل كشف الحساب", description: message, variant: "destructive" });
    } finally {
      lock.current = false;
      setPendingId(null);
    }
  };
  return { download, pendingId, error };
}
