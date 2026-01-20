import { useQuery } from "@tanstack/react-query";
import { Ship, CreditCard, TrendingUp, TrendingDown, Package, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import type { Shipment } from "@shared/schema";

interface DashboardStats {
  totalShipments: number;
  totalCostEgp: string;
  totalPaidEgp: string;
  totalBalanceEgp: string;
  totalOverpaidEgp: string;
  recentShipments: Shipment[];
  pendingShipments: number;
  completedShipments: number;
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("ar-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num || 0);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">لوحة التحكم</h1>
          <p className="text-muted-foreground mt-1">نظرة عامة على الشحنات والمدفوعات</p>
        </div>
        <Button asChild data-testid="button-new-shipment">
          <Link href="/shipments/new">
            <Ship className="w-4 h-4 ml-2" />
            إضافة شحنة جديدة
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="إجمالي الشحنات"
          value={stats?.totalShipments?.toString() || "0"}
          icon={Ship}
          subtitle={`${stats?.pendingShipments || 0} قيد المعالجة`}
        />
        <StatCard
          title="إجمالي التكلفة"
          value={`${formatCurrency(stats?.totalCostEgp || 0)} ج.م`}
          icon={Package}
          subtitle="جنيه مصري"
        />
        <StatCard
          title="إجمالي المدفوع"
          value={`${formatCurrency(stats?.totalPaidEgp || 0)} ج.م`}
          icon={CreditCard}
          subtitle="جنيه مصري"
          trend="up"
        />
        <StatCard
          title="المتبقي"
          value={`${formatCurrency(stats?.totalBalanceEgp || 0)} ج.م`}
          icon={parseFloat(stats?.totalBalanceEgp || "0") > 0 ? TrendingDown : TrendingUp}
          subtitle={
            parseFloat(stats?.totalOverpaidEgp || "0") > 0
              ? `مدفوع زيادة: ${formatCurrency(stats?.totalOverpaidEgp || 0)} ج.م`
              : "المبلغ المستحق"
          }
          trend={parseFloat(stats?.totalBalanceEgp || "0") > 0 ? "down" : "up"}
        />
      </div>

      {/* Recent Shipments & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Shipments */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
            <CardTitle className="text-lg font-semibold">أحدث الشحنات</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/shipments">عرض الكل</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {stats?.recentShipments && stats.recentShipments.length > 0 ? (
              <div className="space-y-4">
                {stats.recentShipments.map((shipment) => (
                  <div
                    key={shipment.id}
                    className="flex items-center justify-between gap-4 p-4 rounded-md border bg-card hover-elevate"
                    data-testid={`shipment-row-${shipment.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                        <Ship className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{shipment.shipmentName}</p>
                        <p className="text-sm text-muted-foreground">
                          {shipment.shipmentCode}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <StatusBadge status={shipment.status} />
                      <div className="text-left">
                        <p className="font-medium">
                          {formatCurrency(shipment.finalTotalCostEgp || 0)} ج.م
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {(() => {
                            const cost = parseFloat(shipment.finalTotalCostEgp || "0");
                            const paid = parseFloat(shipment.totalPaidEgp || "0");
                            const remaining = Math.max(0, cost - paid);
                            const overpaid = Math.max(0, paid - cost);

                            if (overpaid > 0) {
                              return `مبلغ زيادة: ${formatCurrency(overpaid)}`;
                            }
                            if (remaining > 0) {
                              return `متبقي: ${formatCurrency(remaining)}`;
                            }
                            return "مسددة";
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Ship}
                title="لا توجد شحنات"
                description="ابدأ بإضافة شحنتك الأولى"
              />
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold">إجراءات سريعة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start gap-3" asChild>
              <Link href="/shipments/new">
                <Ship className="w-4 h-4" />
                إضافة شحنة جديدة
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3" asChild>
              <Link href="/suppliers">
                <Package className="w-4 h-4" />
                إدارة الموردين
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3" asChild>
              <Link href="/payments">
                <CreditCard className="w-4 h-4" />
                سداد الشحنات
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3" asChild>
              <Link href="/exchange-rates">
                <TrendingUp className="w-4 h-4" />
                أسعار الصرف
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  trend,
}: {
  title: string;
  value: string;
  icon: typeof Ship;
  subtitle: string;
  trend?: "up" | "down";
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold" data-testid={`stat-${title}`}>
              {value}
            </p>
            <p
              className={`text-xs ${
                trend === "up"
                  ? "text-green-600 dark:text-green-400"
                  : trend === "down"
                  ? "text-red-600 dark:text-red-400"
                  : "text-muted-foreground"
              }`}
            >
              {subtitle}
            </p>
          </div>
          <div
            className={`w-12 h-12 rounded-md flex items-center justify-center ${
              trend === "up"
                ? "bg-green-100 dark:bg-green-900/30"
                : trend === "down"
                ? "bg-red-100 dark:bg-red-900/30"
                : "bg-primary/10"
            }`}
          >
            <Icon
              className={`w-6 h-6 ${
                trend === "up"
                  ? "text-green-600 dark:text-green-400"
                  : trend === "down"
                  ? "text-red-600 dark:text-red-400"
                  : "text-primary"
              }`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    جديدة: "outline",
    "في انتظار الشحن": "secondary",
    "جاهزة للاستلام": "default",
    "مستلمة بنجاح": "default",
  };

  const colors: Record<string, string> = {
    جديدة: "",
    "في انتظار الشحن": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    "جاهزة للاستلام": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    "مستلمة بنجاح": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
  };

  return (
    <Badge
      variant={variants[status] || "outline"}
      className={colors[status] || ""}
    >
      {status}
    </Badge>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof AlertCircle;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="font-medium text-lg mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-32 mb-2" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-28" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
