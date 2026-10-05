import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import type { Shipment } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useShipmentStatementDownload } from "@/hooks/use-shipment-statement";

export function ShipmentStatementSelector() {
  const [selectedId, setSelectedId] = useState("");
  const { data: shipments, isLoading, isError, refetch } = useQuery<Shipment[]>({ queryKey: ["/api/shipments"] });
  const { download, pendingId, error } = useShipmentStatementDownload();
  return (
    <Card dir="rtl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5" /> كشف حساب شحنة
        </CardTitle>
        <p className="text-sm text-muted-foreground">كشف PDF لجميع بيانات الشحنة ومدفوعاتها. الاختيار مستقل عن فلاتر المحاسبة ويشمل الشحنات المؤرشفة.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <Skeleton className="h-10 w-full" /> : isError ? (
          <div className="flex flex-wrap items-center gap-3" role="alert">
            <p className="text-sm text-destructive">تعذر تحميل قائمة الشحنات.</p>
            <Button variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>
          </div>
        ) : !shipments?.length ? (
          <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">لا توجد شحنات متاحة لإصدار كشف حساب.</p>
        ) : (
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="account-statement-shipment">الشحنة</Label>
              <Select value={selectedId} onValueChange={setSelectedId} disabled={pendingId !== null}>
                <SelectTrigger id="account-statement-shipment" data-testid="select-account-statement-shipment">
                  <SelectValue placeholder="اختر شحنة لإصدار كشفها" />
                </SelectTrigger>
                <SelectContent>
                  {shipments.map(s => <SelectItem key={s.id} value={String(s.id)}>
                    {s.shipmentCode} — {s.shipmentName}{s.status === "مؤرشفة" ? " (مؤرشفة)" : ""}
                  </SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" disabled={!selectedId || pendingId !== null}
              onClick={() => download(Number(selectedId))}
              aria-busy={pendingId !== null} data-testid="button-download-account-statement">
              <Download className="ml-2 h-4 w-4" />
              {pendingId !== null ? "جارٍ إعداد الكشف..." : "تنزيل كشف حساب PDF"}
            </Button>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error} يمكنك إعادة المحاولة بزر التنزيل.</p>}
      </CardContent>
    </Card>
  );
}
