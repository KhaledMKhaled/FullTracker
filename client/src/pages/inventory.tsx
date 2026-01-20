import { useQuery } from "@tanstack/react-query";
import {
  Package,
  Search,
  Ship,
  Calendar,
  DollarSign,
  TrendingUp,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

const ITEMS_PER_PAGE = 25;
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import type { InventoryMovement, ShipmentItem, Shipment, ShipmentShippingDetails } from "@shared/schema";
import { ItemImage } from "@/components/item-image";

interface InventoryStats {
  totalPieces: number;
  totalCostEgp: string;
  totalItems: number;
  avgUnitCostEgp: string;
}

interface ExtendedInventoryMovement extends InventoryMovement {
  shipmentItem?: ShipmentItem;
  shipment?: Shipment;
  shippingDetails?: ShipmentShippingDetails;
  totalShipmentPieces?: number;
}

export default function Inventory() {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [shipmentCodeFilter, setShipmentCodeFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const { data: stats, isLoading: loadingStats } = useQuery<InventoryStats>({
    queryKey: ["/api/inventory/stats"],
  });

  const { data: movements, isLoading: loadingMovements } = useQuery<
    ExtendedInventoryMovement[]
  >({
    queryKey: ["/api/inventory"],
  });

  // Calculate cost per piece based on the formulas
  const calculateCostPerPiece = (movement: ExtendedInventoryMovement) => {
    const item = movement.shipmentItem;
    const shipment = movement.shipment;
    const shippingDetails = movement.shippingDetails;
    const totalShipmentPieces = movement.totalShipmentPieces || 0;

    if (!item || !shipment) {
      return { purchasePriceRmb: 0, shippingShareRmb: 0, commissionShareRmb: 0, clearanceShareEgp: 0, customsPerPieceEgp: 0, finalCostEgp: 0, exchangeRate: 0 };
    }

    // Exchange rate from shipment
    const exchangeRate = parseFloat(shipment.purchaseRmbToEgpRate?.toString() || "0");
    
    // Purchase price per piece in RMB
    const purchasePriceRmb = parseFloat(item.purchasePricePerPiecePriRmb?.toString() || "0");
    
    // Shipping share per piece = Total shipping cost RMB / Total pieces in shipment
    const totalShippingCostRmb = parseFloat(shippingDetails?.totalShippingCostRmb?.toString() || "0");
    const shippingShareRmb = totalShipmentPieces > 0 ? totalShippingCostRmb / totalShipmentPieces : 0;
    
    // Commission share per piece = Total commission cost RMB / Total pieces in shipment
    const commissionValueRmb = parseFloat(shippingDetails?.commissionValueRmb?.toString() || "0");
    const commissionShareRmb = totalShipmentPieces > 0 ? commissionValueRmb / totalShipmentPieces : 0;
    
    // Clearance (Takhreeg) share per piece = Total Takhreeg Cost / Total pieces for item
    const totalTakhreegCost = parseFloat(item.totalTakhreegCostEgp?.toString() || "0");
    const itemPieces = item.totalPiecesCou || 0;
    const clearanceShareEgp = itemPieces > 0 ? totalTakhreegCost / itemPieces : 0;
    
    // Customs per piece = Total Customs Cost / Total pieces for item
    const totalCustomsCost = parseFloat(item.totalCustomsCostEgp?.toString() || "0");
    const customsPerPieceEgp = itemPieces > 0 ? totalCustomsCost / itemPieces : 0;
    
    // Final formula: (Purchase price in RMB + Shipping share in RMB + Commission share in RMB) × Exchange rate + Customs + Clearance share in EGP
    const finalCostEgp = ((purchasePriceRmb + shippingShareRmb + commissionShareRmb) * exchangeRate) + customsPerPieceEgp + clearanceShareEgp;
    
    return {
      purchasePriceRmb,
      shippingShareRmb,
      commissionShareRmb,
      clearanceShareEgp,
      customsPerPieceEgp,
      finalCostEgp,
      exchangeRate,
    };
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

  const filteredMovements = movements?.filter((m) => {
    const matchesSearch =
      !search ||
      m.shipmentItem?.productName?.toLowerCase().includes(search.toLowerCase()) ||
      m.shipment?.shipmentCode?.toLowerCase().includes(search.toLowerCase());

    const matchesShipmentCode =
      !shipmentCodeFilter ||
      m.shipment?.shipmentCode?.toLowerCase().includes(shipmentCodeFilter.toLowerCase());

    // Date range filter
    let matchesDateRange = true;
    if (dateFrom || dateTo) {
      const movementDate = m.movementDate ? new Date(m.movementDate) : null;
      if (movementDate) {
        if (dateFrom) {
          const fromDate = new Date(dateFrom);
          if (movementDate < fromDate) matchesDateRange = false;
        }
        if (dateTo) {
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (movementDate > toDate) matchesDateRange = false;
        }
      }
    }

    return matchesSearch && matchesShipmentCode && matchesDateRange;
  });

  // Pagination
  const totalPages = Math.ceil((filteredMovements?.length || 0) / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedMovements = filteredMovements?.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  // CSV Export function
  const exportToCSV = () => {
    if (!filteredMovements || filteredMovements.length === 0) return;

    const headers = [
      "التاريخ",
      "رقم الشحنة",
      "المنتج",
      "عدد القطع",
      "تكلفة الوحدة (RMB)",
      "تكلفة الوحدة (ج.م)",
      "إجمالي التكلفة (ج.م)",
    ];

    const csvContent = [
      headers.join(","),
      ...filteredMovements.map((m) =>
        [
          m.movementDate ? new Date(m.movementDate).toLocaleDateString("ar-EG") : "-",
          m.shipment?.shipmentCode || "-",
          m.shipmentItem?.productName || "-",
          m.totalPiecesIn || 0,
          m.unitCostRmb || "-",
          m.unitCostEgp || 0,
          m.totalCostEgp || 0,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `inventory_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold">المخزون</h1>
        <p className="text-muted-foreground mt-1">
          متابعة الأصناف المستلمة وتكلفتها في المخزون
        </p>
      </div>
      {/* Stats Cards */}
      {loadingStats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="إجمالي الأصناف"
            value={stats?.totalItems?.toString() || "0"}
            icon={Package}
          />
          <StatCard
            title="إجمالي القطع"
            value={new Intl.NumberFormat("ar-EG").format(stats?.totalPieces || 0)}
            icon={Ship}
          />
          <StatCard
            title="إجمالي التكلفة"
            value={`${formatCurrency(stats?.totalCostEgp || 0)} ج.م`}
            icon={DollarSign}
          />
          <StatCard
            title="متوسط تكلفة الوحدة"
            value={`${formatCurrency(stats?.avgUnitCostEgp || 0)} ج.م`}
            icon={TrendingUp}
          />
        </div>
      )}
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالمنتج..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pr-10"
                data-testid="input-search-inventory"
              />
            </div>
            <div className="flex items-center gap-2">
              <Ship className="w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="رقم الشحنة..."
                value={shipmentCodeFilter}
                onChange={(e) => {
                  setShipmentCodeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-[150px]"
                data-testid="input-shipment-code-filter"
              />
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground whitespace-nowrap">من:</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-[140px]"
                  data-testid="input-date-from"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground whitespace-nowrap">إلى:</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-[140px]"
                  data-testid="input-date-to"
                />
              </div>
              {(dateFrom || dateTo || shipmentCodeFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                    setShipmentCodeFilter("");
                    setCurrentPage(1);
                  }}
                >
                  مسح الفلاتر
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Inventory Table */}
      <Card>
        <CardHeader className="pb-4 flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="w-5 h-5" />
            حركات المخزون
            {filteredMovements && (
              <Badge variant="secondary" className="mr-2">
                {filteredMovements.length}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            disabled={!filteredMovements || filteredMovements.length === 0}
            data-testid="button-export-csv"
          >
            <Download className="w-4 h-4 ml-2" />
            تصدير CSV
          </Button>
        </CardHeader>
        <CardContent>
          {loadingMovements ? (
            <TableSkeleton />
          ) : filteredMovements && filteredMovements.length > 0 ? (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">الشحنة</TableHead>
                      <TableHead className="text-right">الصورة</TableHead>
                      <TableHead className="text-right">المنتج</TableHead>
                      <TableHead className="text-right">عدد القطع</TableHead>
                      <TableHead className="text-right">الشراء (RMB)</TableHead>
                      <TableHead className="text-right">الشحن (RMB)</TableHead>
                      <TableHead className="text-right">العمولة (RMB)</TableHead>
                      <TableHead className="text-right">الجمرك (ج.م)</TableHead>
                      <TableHead className="text-right">التخريج (ج.م)</TableHead>
                      <TableHead className="text-right">تكلفة القطعة (ج.م)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedMovements?.map((movement) => {
                      const costs = calculateCostPerPiece(movement);
                      return (
                        <TableRow
                          key={movement.id}
                          data-testid={`row-inventory-${movement.id}`}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-muted-foreground" />
                              {formatDate(movement.movementDate)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {movement.shipment?.shipmentCode || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <ItemImage
                              src={movement.shipmentItem?.imageUrl}
                              alt={movement.shipmentItem?.productName || "صورة المنتج"}
                              size="sm"
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {movement.shipmentItem?.productName || "-"}
                          </TableCell>
                          <TableCell>
                            {new Intl.NumberFormat("ar-EG").format(
                              movement.totalPiecesIn || 0
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span>¥ {formatCurrency(costs.purchasePriceRmb || 0)}</span>
                              <span className="text-xs text-muted-foreground">السعر: {formatCurrency(costs.exchangeRate)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            ¥ {formatCurrency(costs.shippingShareRmb)}
                          </TableCell>
                          <TableCell>
                            ¥ {formatCurrency(costs.commissionShareRmb)}
                          </TableCell>
                          <TableCell>
                            {formatCurrency(costs.customsPerPieceEgp)} ج.م
                          </TableCell>
                          <TableCell>
                            {formatCurrency(costs.clearanceShareEgp)} ج.م
                          </TableCell>
                          <TableCell className="font-bold text-primary">
                            {formatCurrency(costs.finalCostEgp)} ج.م
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    data-testid="button-prev-page"
                  >
                    <ChevronRight className="w-4 h-4" />
                    السابق
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          data-testid={`button-page-${pageNum}`}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    data-testid="button-next-page"
                  >
                    التالي
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground mr-4">
                    صفحة {currentPage} من {totalPages}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <EmptyState />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: typeof Package;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon className="w-6 h-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
        <Package className="w-10 h-10 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-medium mb-2">لا توجد حركات مخزون</h3>
      <p className="text-muted-foreground">
        ستظهر الأصناف هنا بعد استلام الشحنات
      </p>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
