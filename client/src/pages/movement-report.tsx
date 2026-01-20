import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaymentAttachmentIcon } from "@/components/payment-attachment-icon";
import {
  FileSpreadsheet,
  Filter,
  Download,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
} from "lucide-react";
import type { Shipment, ShippingCompany, Supplier } from "@shared/schema";
import { costComponentColors } from "@/lib/colorMaps";
import { formatCurrency, getCurrencyLabel } from "@/lib/currency";

interface MovementReportData {
  movements: Array<{
    date: Date | string;
    shipmentCode: string;
    shipmentName: string;
    partyName?: string;
    partyId?: number;
    partyType?: "supplier" | "shipping_company";
    movementType: string;
    costComponent?: string;
    paymentMethod?: string;
    originalCurrency?: string;
    amountOriginal?: string;
    amountEgp: string;
    amountRmb?: string;
    direction: 'cost' | 'payment';
    isAllocation?: boolean;
    userName?: string;
    paymentId?: number;
    attachmentUrl?: string | null;
    attachmentOriginalName?: string | null;
  }>;
  totalCostEgp: string;
  totalPaidEgp: string;
  netMovement: string;
  totalCostRmb?: string;
  totalPaidRmb?: string;
  netMovementRmb?: string;
}

function formatDate(date: string | Date | null) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("ar-EG");
}

const movementTypes = [
  { value: "all", label: "الكل" },
  { value: "تكلفة بضاعة", label: "تكلفة بضاعة" },
  { value: "تكلفة شحن", label: "تكلفة شحن" },
  { value: "عمولة", label: "عمولة" },
  { value: "جمرك", label: "جمرك" },
  { value: "تخريج", label: "تخريج" },
  { value: "دفعة", label: "دفعة" },
  { value: "تسوية/توزيع تكلفة", label: "تسوية/توزيع تكلفة" },
];

const costComponents = [
  { value: "all", label: "الكل" },
  { value: "تكلفة البضاعة", label: "تكلفة البضاعة" },
  { value: "الشحن", label: "الشحن" },
  { value: "الجمرك والتخريج", label: "الجمرك والتخريج" },
];

const paymentMethods = [
  { value: "all", label: "الكل" },
  { value: "نقدي", label: "نقدي" },
  { value: "محفظة الكترونية", label: "محفظة الكترونية" },
  { value: "إنستاباي", label: "إنستاباي" },
  { value: "تحويل بنكي", label: "تحويل بنكي" },
  { value: "نواقص", label: "نواقص" },
  { value: "AliPay", label: "AliPay" },
  { value: "WeChat", label: "WeChat" },
  { value: "أخرى", label: "أخرى" },
];

export default function MovementReportPage() {
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [partyType, setPartyType] = useState<"supplier" | "shipping_company">("supplier");
  const [partyId, setPartyId] = useState<string>("");
  const [shipmentId, setShipmentId] = useState<string>("");
  const [movementType, setMovementType] = useState<string>("all");
  const [costComponent, setCostComponent] = useState<string>("all");
  const [paymentMethod, setPaymentMethod] = useState<string>("all");
  const [shipmentStatus, setShipmentStatus] = useState<string>("all");
  const [paymentStatus, setPaymentStatus] = useState<string>("all");
  const [includeArchived, setIncludeArchived] = useState(false);

  const queryParams = new URLSearchParams();
  if (dateFrom) queryParams.append("dateFrom", dateFrom);
  if (dateTo) queryParams.append("dateTo", dateTo);
  if (partyId && partyId !== "all") {
    queryParams.append("partyType", partyType);
    queryParams.append("partyId", partyId);
  }
  if (shipmentId && shipmentId !== "all") queryParams.append("shipmentId", shipmentId);
  if (movementType && movementType !== "all") queryParams.append("movementType", movementType);
  if (costComponent && costComponent !== "all") queryParams.append("costComponent", costComponent);
  if (paymentMethod && paymentMethod !== "all") queryParams.append("paymentMethod", paymentMethod);
  if (shipmentStatus && shipmentStatus !== "all") queryParams.append("shipmentStatus", shipmentStatus);
  if (paymentStatus && paymentStatus !== "all") queryParams.append("paymentStatus", paymentStatus);
  if (includeArchived) queryParams.append("includeArchived", "true");

  const { data: report, isLoading } = useQuery<MovementReportData>({
    queryKey: [
      "/api/accounting/movement-report",
      dateFrom,
      dateTo,
      partyType,
      partyId,
      shipmentId,
      movementType,
      costComponent,
      paymentMethod,
      shipmentStatus,
      paymentStatus,
      includeArchived
    ],
    queryFn: async () => {
      const response = await fetch(`/api/accounting/movement-report?${queryParams.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    },
  });

  const { data: suppliers } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const { data: shippingCompanies } = useQuery<ShippingCompany[]>({
    queryKey: ["/api/shipping-companies"],
  });

  const { data: shipments } = useQuery<Shipment[]>({
    queryKey: ["/api/shipments"],
  });

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setPartyType("supplier");
    setPartyId("");
    setShipmentId("");
    setMovementType("all");
    setCostComponent("all");
    setPaymentMethod("all");
    setShipmentStatus("all");
    setPaymentStatus("all");
    setIncludeArchived(false);
  };

  useEffect(() => {
    setPartyId("");
  }, [partyType]);

  const exportToCSV = () => {
    if (!report?.movements) return;
    
    const headers = ["التاريخ", "رقم الشحنة", "اسم الشحنة", "الطرف", "نوع الحركة", "تحت حساب", "طريقة الدفع", "العملة", "المبلغ الأصلي", "المبلغ بالجنيه", "المبلغ بالرممبي", "الاتجاه"];
    const rows = report.movements.map(m => [
      formatDate(m.date),
      m.shipmentCode,
      m.shipmentName,
      m.partyName || "",
      m.movementType,
      m.costComponent || "",
      m.paymentMethod || "",
      m.originalCurrency || "",
      m.amountOriginal || "",
      m.amountEgp,
      m.amountRmb || "",
      m.direction === 'cost' ? 'تكلفة' : 'مدفوع'
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `movement-report-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" dir="rtl">
        <h1 className="text-2xl font-bold">كشف حركة الحساب</h1>
        <div className="space-y-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">كشف حركة الحساب</h1>
            <p className="text-muted-foreground text-sm">تقرير شامل لجميع التكاليف والمدفوعات</p>
          </div>
        </div>
        <Button onClick={exportToCSV} data-testid="button-export-csv">
          <Download className="w-4 h-4 ml-2" />
          تصدير Excel/CSV
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="w-5 h-5" />
            الفلاتر
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <div className="space-y-2">
              <Label>من تاريخ</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-date-from"
              />
            </div>
            <div className="space-y-2">
              <Label>إلى تاريخ</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-date-to"
              />
            </div>
            <div className="space-y-2">
              <Label>رقم الشحنة</Label>
              <Select value={shipmentId} onValueChange={setShipmentId}>
                <SelectTrigger data-testid="select-shipment">
                  <SelectValue placeholder="جميع الشحنات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الشحنات</SelectItem>
                  {shipments?.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.shipmentCode} - {s.shipmentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>نوع الطرف</Label>
              <Select
                value={partyType}
                onValueChange={(value) => setPartyType(value as "supplier" | "shipping_company")}
              >
                <SelectTrigger data-testid="select-party-type">
                  <SelectValue placeholder="اختر نوع الطرف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supplier">مورد</SelectItem>
                  <SelectItem value="shipping_company">شركة شحن</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الطرف</Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger data-testid="select-party">
                  <SelectValue placeholder="جميع الأطراف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الأطراف</SelectItem>
                  {(partyType === "supplier" ? suppliers : shippingCompanies)?.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>نوع الحركة</Label>
              <Select value={movementType} onValueChange={setMovementType}>
                <SelectTrigger data-testid="select-movement-type">
                  <SelectValue placeholder="الكل" />
                </SelectTrigger>
                <SelectContent>
                  {movementTypes.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>تحت حساب</Label>
              <Select value={costComponent} onValueChange={setCostComponent}>
                <SelectTrigger data-testid="select-cost-component">
                  <SelectValue placeholder="الكل" />
                </SelectTrigger>
                <SelectContent>
                  {costComponents.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>طريقة الدفع</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger data-testid="select-payment-method">
                  <SelectValue placeholder="الكل" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>حالة الشحنة</Label>
              <Select value={shipmentStatus} onValueChange={setShipmentStatus}>
                <SelectTrigger data-testid="select-shipment-status">
                  <SelectValue placeholder="الكل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="جديدة">جديدة</SelectItem>
                  <SelectItem value="في انتظار الشحن">في انتظار الشحن</SelectItem>
                  <SelectItem value="جاهزة للاستلام">جاهزة للاستلام</SelectItem>
                  <SelectItem value="مستلمة بنجاح">مستلمة بنجاح</SelectItem>
                  <SelectItem value="مؤرشفة">مؤرشفة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>حالة السداد</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger data-testid="select-payment-status">
                  <SelectValue placeholder="الكل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="لم يتم دفع أي مبلغ">لم يتم دفع أي مبلغ</SelectItem>
                  <SelectItem value="مدفوعة جزئياً">مدفوعة جزئياً</SelectItem>
                  <SelectItem value="مسددة بالكامل">مسددة بالكامل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>تضمين المؤرشفة</Label>
              <div className="flex items-center h-9">
                <Switch
                  checked={includeArchived}
                  onCheckedChange={setIncludeArchived}
                  data-testid="switch-include-archived"
                />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Button variant="outline" onClick={clearFilters} data-testid="button-clear-filters">
              مسح الفلاتر
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-red-600" />
              إجمالي التكلفة (جنيه)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-600" data-testid="text-total-cost">
              {formatCurrency(report?.totalCostEgp || "0", "EGP")}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-green-600" />
              إجمالي المدفوع (جنيه)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-green-600" data-testid="text-total-paid">
              {formatCurrency(report?.totalPaidEgp || "0", "EGP")}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-amber-600" />
              صافي الحركة (جنيه)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-amber-600" data-testid="text-net-movement">
              {formatCurrency(report?.netMovement || "0", "EGP")}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-50/70 dark:bg-red-950/20 border-red-200/70 dark:border-red-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-red-600" />
              إجمالي التكلفة (رممبي)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-600" data-testid="text-total-cost-rmb">
              {formatCurrency(report?.totalCostRmb || "0", "RMB")}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-green-50/70 dark:bg-green-950/20 border-green-200/70 dark:border-green-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-green-600" />
              إجمالي المدفوع (رممبي)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-green-600" data-testid="text-total-paid-rmb">
              {formatCurrency(report?.totalPaidRmb || "0", "RMB")}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50/70 dark:bg-amber-950/20 border-amber-200/70 dark:border-amber-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-amber-600" />
              صافي الحركة (رممبي)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-amber-600" data-testid="text-net-movement-rmb">
              {formatCurrency(report?.netMovementRmb || "0", "RMB")}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            حركات الحساب ({report?.movements?.length || 0} حركة)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right sticky top-0 bg-background">التاريخ</TableHead>
                  <TableHead className="text-right sticky top-0 bg-background">رقم الشحنة</TableHead>
                  <TableHead className="text-right sticky top-0 bg-background">الطرف</TableHead>
                  <TableHead className="text-right sticky top-0 bg-background">نوع الحركة</TableHead>
                  <TableHead className="text-right sticky top-0 bg-background">تحت حساب</TableHead>
                  <TableHead className="text-right sticky top-0 bg-background">طريقة الدفع</TableHead>
                  <TableHead className="text-right sticky top-0 bg-background">مرفق</TableHead>
                  <TableHead className="text-right sticky top-0 bg-background">العملة</TableHead>
                  <TableHead className="text-right sticky top-0 bg-background">المبلغ الأصلي</TableHead>
                  <TableHead className="text-right sticky top-0 bg-background">المبلغ بالجنيه</TableHead>
                  <TableHead className="text-right sticky top-0 bg-background">المبلغ بالرممبي</TableHead>
                  <TableHead className="text-right sticky top-0 bg-background">الاتجاه</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report?.movements?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground">
                      لا توجد حركات
                    </TableCell>
                  </TableRow>
                ) : (
                  report?.movements?.map((m, idx) => {
                    const currencyLabel = getCurrencyLabel(m.originalCurrency);
                    const originalAmountValue =
                      m.amountOriginal ??
                      (currencyLabel === "رممبي" ? m.amountRmb ?? "0" : m.amountEgp);
                    return (
                      <TableRow key={idx} data-testid={`row-movement-${idx}`}>
                        <TableCell>{formatDate(m.date)}</TableCell>
                        <TableCell className="font-mono">{m.shipmentCode}</TableCell>
                        <TableCell>{m.partyName || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{m.movementType}</Badge>
                        </TableCell>
                        <TableCell>
                          {m.costComponent ? (
                            <Badge
                              variant="outline"
                              className={costComponentColors[m.costComponent] || ""}
                            >
                              {m.costComponent}
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>{m.paymentMethod || "-"}</TableCell>
                        <TableCell>
                          {m.direction === "payment" ? (
                            <PaymentAttachmentIcon
                              paymentId={m.paymentId}
                              attachmentUrl={m.attachmentUrl}
                              attachmentOriginalName={m.attachmentOriginalName}
                            />
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>{currencyLabel}</TableCell>
                        <TableCell className={m.direction === 'cost' ? 'text-red-600' : 'text-green-600'}>
                          {formatCurrency(originalAmountValue, currencyLabel)}
                        </TableCell>
                        <TableCell className={m.direction === 'cost' ? 'text-red-600' : 'text-green-600'}>
                          {formatCurrency(m.amountEgp, "EGP")}
                        </TableCell>
                        <TableCell className={m.direction === 'cost' ? 'text-red-600' : 'text-green-600'}>
                          {m.amountRmb ? formatCurrency(m.amountRmb, "RMB") : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={m.direction === 'cost' ? 'destructive' : 'default'}>
                            {m.direction === 'cost' ? 'تكلفة' : 'مدفوع'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
