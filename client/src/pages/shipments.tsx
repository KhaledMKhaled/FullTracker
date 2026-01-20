import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Ship,
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  Trash2,
  ChevronDown,
  Calendar,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { paymentStatusColors, shipmentStatusColors } from "@/lib/colorMaps";
import type { Shipment } from "@shared/schema";

export default function Shipments() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [shipmentToDelete, setShipmentToDelete] = useState<Shipment | null>(null);
  const [viewArchived, setViewArchived] = useState(false);
  const { toast } = useToast();

  const { data: shipments, isLoading } = useQuery<Shipment[]>({
    queryKey: ["/api/shipments"],
  });

  const activeShipments = shipments?.filter((shipment) => shipment.status !== "مؤرشفة");
  const archivedShipments = shipments?.filter((shipment) => shipment.status === "مؤرشفة");

  useEffect(() => {
    setStatusFilter("all");
    setPaymentStatusFilter("all");
  }, [viewArchived]);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/shipments/${id}`);
    },
    onSuccess: () => {
      toast({ title: "تم حذف الشحنة بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/shipments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setDeleteDialogOpen(false);
      setShipmentToDelete(null);
    },
    onError: () => {
      toast({ title: "حدث خطأ أثناء حذف الشحنة", variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return apiRequest("PATCH", `/api/shipments/${id}` , {
        shipmentData: { status },
      });
    },
    onSuccess: () => {
      toast({ title: viewArchived ? "تم إلغاء الأرشفة" : "تمت أرشفة الشحنة" });
      queryClient.invalidateQueries({ queryKey: ["/api/shipments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: () => {
      toast({ title: "تعذر تحديث حالة الشحنة", variant: "destructive" });
    },
  });

  const handleDeleteClick = (shipment: Shipment) => {
    setShipmentToDelete(shipment);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (shipmentToDelete) {
      deleteMutation.mutate(shipmentToDelete.id);
    }
  };

  const formatCurrency = (value: string | number | null) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("ar-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num || 0);
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("ar-EG");
  };

  const baseShipments = viewArchived ? archivedShipments : activeShipments;

  const filteredShipments = baseShipments?.filter((shipment) => {
    const matchesSearch =
      !search ||
      shipment.shipmentName.toLowerCase().includes(search.toLowerCase()) ||
      shipment.shipmentCode.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || shipment.status === statusFilter;

    const paymentStatus = getPaymentStatus(shipment);
    const matchesPaymentStatus =
      paymentStatusFilter === "all" || paymentStatus === paymentStatusFilter;
    
    // Date range filter
    let matchesDateRange = true;
    if (dateFrom || dateTo) {
      const purchaseDate = shipment.purchaseDate ? new Date(shipment.purchaseDate) : null;
      if (purchaseDate) {
        if (dateFrom) {
          const fromDate = new Date(dateFrom);
          if (purchaseDate < fromDate) matchesDateRange = false;
        }
        if (dateTo) {
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (purchaseDate > toDate) matchesDateRange = false;
        }
      }
    }
    
    return matchesSearch && matchesStatus && matchesPaymentStatus && matchesDateRange;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{viewArchived ? "الشحنات المؤرشفة" : "الشحنات"}</h1>
          <p className="text-muted-foreground mt-1">
            إدارة جميع الشحنات من لحظة الشراء حتى الاستلام
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border overflow-hidden">
            <Button
              type="button"
              variant={viewArchived ? "outline" : "default"}
              className={!viewArchived ? "rounded-none" : "rounded-none"}
              onClick={() => setViewArchived(false)}
            >
              الشحنات النشطة
            </Button>
            <Button
              type="button"
              variant={viewArchived ? "default" : "outline"}
              className={!viewArchived ? "rounded-none" : "rounded-none"}
              onClick={() => setViewArchived(true)}
            >
              الشحنات المؤرشفة
            </Button>
          </div>
          <Button asChild data-testid="button-add-shipment">
            <Link href="/shipments/new">
              <Plus className="w-4 h-4 ml-2" />
              إضافة شحنة جديدة
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث برقم أو اسم الشحنة..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-10"
                data-testid="input-search-shipments"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                  <SelectValue placeholder="حالة الشحنة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="جديدة">جديدة</SelectItem>
                  <SelectItem value="في انتظار الشحن">في انتظار الشحن</SelectItem>
                  <SelectItem value="جاهزة للاستلام">جاهزة للاستلام</SelectItem>
                  <SelectItem value="مستلمة بنجاح">مستلمة بنجاح</SelectItem>
                  <SelectItem value="مؤرشفة">مؤرشفة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                <SelectTrigger className="w-[200px]" data-testid="select-payment-status-filter">
                  <SelectValue placeholder="حالة السداد" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="لم يتم دفع أي مبلغ">لم يتم دفع أي مبلغ</SelectItem>
                  <SelectItem value="مدفوعة جزئياً">مدفوعة جزئياً</SelectItem>
                  <SelectItem value="مسددة بالكامل">مسددة بالكامل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground whitespace-nowrap">من:</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[140px]"
                  data-testid="input-date-from"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground whitespace-nowrap">إلى:</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[140px]"
                  data-testid="input-date-to"
                />
              </div>
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  مسح التاريخ
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shipments Table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Ship className="w-5 h-5" />
            قائمة الشحنات
            {filteredShipments && (
              <Badge variant="secondary" className="mr-2">
                {filteredShipments.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton />
          ) : filteredShipments && filteredShipments.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رقم الشحنة</TableHead>
                    <TableHead className="text-right">اسم الشحنة</TableHead>
                    <TableHead className="text-right">تاريخ الشراء</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">حالة السداد</TableHead>
                    <TableHead className="text-right">التكلفة (ج.م)</TableHead>
                    <TableHead className="text-right">المدفوع (ج.م)</TableHead>
                    <TableHead className="text-right">الرصيد</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredShipments.map((shipment) => (
                    <TableRow
                      key={shipment.id}
                      className="hover-elevate"
                      data-testid={`row-shipment-${shipment.id}`}
                    >
                      <TableCell className="font-medium">
                        {shipment.shipmentCode}
                      </TableCell>
                      <TableCell>{shipment.shipmentName}</TableCell>
                      <TableCell>{formatDate(shipment.purchaseDate)}</TableCell>
                      <TableCell>
                        <StatusBadge status={shipment.status} />
                      </TableCell>
                      <TableCell>
                        <PaymentStatusBadge status={getPaymentStatus(shipment)} />
                      </TableCell>
                      <TableCell>
                        {formatCurrency(shipment.finalTotalCostEgp)}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(shipment.totalPaidEgp)}
                      </TableCell>
                      <TableCell>
                        <BalanceBadge
                          cost={shipment.finalTotalCostEgp}
                          paid={shipment.totalPaidEgp}
                        />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              إجراءات
                              <ChevronDown className="w-4 h-4 mr-1" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/shipments/${shipment.id}`}>
                                <Eye className="w-4 h-4 ml-2" />
                                عرض
                              </Link>
                            </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/shipments/${shipment.id}/edit`}>
                              <Edit className="w-4 h-4 ml-2" />
                              تعديل
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              statusMutation.mutate({
                                id: shipment.id,
                                status: shipment.status === "مؤرشفة" ? "جديدة" : "مؤرشفة",
                              })
                            }
                          >
                            {shipment.status === "مؤرشفة" ? (
                              <ArchiveRestore className="w-4 h-4 ml-2" />
                            ) : (
                              <Archive className="w-4 h-4 ml-2" />
                            )}
                            {shipment.status === "مؤرشفة" ? "إلغاء الأرشفة" : "أرشفة"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteClick(shipment)}
                          >
                            <Trash2 className="w-4 h-4 ml-2" />
                              حذف
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState />
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الشحنة</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف الشحنة "{shipmentToDelete?.shipmentName}"؟
              <br />
              هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "جاري الحذف..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={shipmentStatusColors[status] || ""}>
      {status}
    </Badge>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={paymentStatusColors[status] || ""}>
      {status}
    </Badge>
  );
}

function BalanceBadge({
  cost,
  paid,
}: {
  cost: string | number | null;
  paid: string | number | null;
}) {
  const costValue = typeof cost === "string" ? parseFloat(cost) : cost || 0;
  const paidValue = typeof paid === "string" ? parseFloat(paid) : paid || 0;
  const remaining = Math.max(0, costValue - paidValue);

  const formatCurrency = (num: number) =>
    new Intl.NumberFormat("ar-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);

  if (remaining === 0) {
    return (
      <Badge
        variant="outline"
        className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      >
        مسددة
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
    >
      متبقي: {formatCurrency(remaining)} ج.م
    </Badge>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
        <Ship className="w-10 h-10 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-medium mb-2">لا توجد شحنات</h3>
      <p className="text-muted-foreground mb-6">
        ابدأ بإضافة شحنتك الأولى لتتبع التكاليف والمدفوعات
      </p>
      <Button asChild>
        <Link href="/shipments/new">
          <Plus className="w-4 h-4 ml-2" />
          إضافة شحنة جديدة
        </Link>
      </Button>
    </div>
  );
}

function getPaymentStatus(shipment: Shipment) {
  const cost = parseFloat(shipment.finalTotalCostEgp || "0");
  const paid = parseFloat(shipment.totalPaidEgp || "0");
  const balance = parseFloat(shipment.balanceEgp || (cost - paid).toString());

  if (paid <= 0.0001) return "لم يتم دفع أي مبلغ";
  if (balance <= 0.0001) return "مسددة بالكامل";
  return "مدفوعة جزئياً";
}

function TableSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
