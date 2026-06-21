import { useMemo } from "react";
import { Link } from "wouter";
import {
  LayoutDashboard,
  Users,
  FileText,
  Wallet,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useParties, useLocalInvoices, useLocalPayments, useReturnCases } from "@/hooks/use-local-trade";

function formatCurrency(val: string | number | null | undefined) {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ج.م";
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  loading,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between" dir="rtl">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-32 mb-1" />
            ) : (
              <p className="text-2xl font-bold">{value}</p>
            )}
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LocalTradeDashboardPage() {
  const { data: parties, isLoading: loadingParties } = useParties();
  const { data: invoices, isLoading: loadingInvoices } = useLocalInvoices();
  const { data: payments, isLoading: loadingPayments } = useLocalPayments();
  const { data: returnCases, isLoading: loadingReturns } = useReturnCases();

  const stats = useMemo(() => {
    const allParties = (parties as any[]) || [];
    const allInvoices = (invoices as any[]) || [];
    const allPayments = (payments as any[]) || [];
    const allReturns = (returnCases as any[]) || [];

    const suppliers = allParties.filter((p) => p.type === "تاجر" || p.type === "مزدوج");
    const customers = allParties.filter((p) => p.type === "عميل" || p.type === "مزدوج");

    const purchaseInvoices = allInvoices.filter((i) => i.invoiceKind === "شراء");
    const saleInvoices = allInvoices.filter((i) => i.invoiceKind === "بيع");

    const totalPurchases = purchaseInvoices.reduce((s: number, i: any) => s + parseFloat(i.totalAmountEgp || "0"), 0);
    const totalSales = saleInvoices.reduce((s: number, i: any) => s + parseFloat(i.totalAmountEgp || "0"), 0);
    const totalPayments = allPayments.reduce((s: number, p: any) => s + parseFloat(p.amountEgp || "0"), 0);

    const unpaidInvoices = allInvoices.filter((i) => i.paymentStatus === "غير مدفوع" || i.paymentStatus === "مدفوع جزئياً");
    const totalOutstanding = unpaidInvoices.reduce((s: number, i: any) => s + parseFloat(i.remainingAmountEgp || i.totalAmountEgp || "0"), 0);

    const pendingReturns = allReturns.filter((r) => r.status === "pending" || r.status === "معلق");

    const debtors = allParties
      .filter((p) => parseFloat(p.currentBalance || "0") > 0)
      .sort((a: any, b: any) => parseFloat(b.currentBalance) - parseFloat(a.currentBalance))
      .slice(0, 5);

    return {
      totalParties: allParties.length,
      suppliers: suppliers.length,
      customers: customers.length,
      totalInvoices: allInvoices.length,
      purchaseInvoices: purchaseInvoices.length,
      saleInvoices: saleInvoices.length,
      totalPurchases,
      totalSales,
      totalPayments,
      totalOutstanding,
      pendingReturns: pendingReturns.length,
      unpaidInvoices: unpaidInvoices.length,
      debtors,
    };
  }, [parties, invoices, payments, returnCases]);

  const isLoading = loadingParties || loadingInvoices || loadingPayments || loadingReturns;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <LayoutDashboard className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">لوحة التحكم</h1>
          <p className="text-sm text-muted-foreground">نظرة عامة على التجارة المحلية</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="إجمالي الأطراف"
          value={String(stats.totalParties)}
          subtitle={`${stats.suppliers} تاجر · ${stats.customers} عميل`}
          icon={Users}
          color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          loading={isLoading}
        />
        <KpiCard
          title="إجمالي الفواتير"
          value={String(stats.totalInvoices)}
          subtitle={`${stats.purchaseInvoices} شراء · ${stats.saleInvoices} بيع`}
          icon={FileText}
          color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
          loading={isLoading}
        />
        <KpiCard
          title="فواتير غير مدفوعة"
          value={String(stats.unpaidInvoices)}
          subtitle={formatCurrency(stats.totalOutstanding)}
          icon={AlertCircle}
          color="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
          loading={isLoading}
        />
        <KpiCard
          title="مرتجعات معلقة"
          value={String(stats.pendingReturns)}
          subtitle="بانتظار الحل"
          icon={RotateCcw}
          color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          loading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <TrendingDown className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">إجمالي المشتريات</p>
            </div>
            {isLoading ? <Skeleton className="h-7 w-36" /> : (
              <p className="text-xl font-bold text-green-600 dark:text-green-400">{formatCurrency(stats.totalPurchases)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">إجمالي المبيعات</p>
            </div>
            {isLoading ? <Skeleton className="h-7 w-36" /> : (
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(stats.totalSales)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">إجمالي المدفوعات</p>
            </div>
            {isLoading ? <Skeleton className="h-7 w-36" /> : (
              <p className="text-xl font-bold text-teal-600 dark:text-teal-400">{formatCurrency(stats.totalPayments)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-orange-500" />
            أعلى الأرصدة المستحقة
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : stats.debtors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
              <p>لا توجد أرصدة مستحقة</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.debtors.map((party: any) => (
                <Link key={party.id} href={`/local-trade/parties/${party.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold">
                        {party.name?.[0]}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{party.name}</p>
                        <p className="text-xs text-muted-foreground">{party.shopName || party.type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-xs">
                        {formatCurrency(party.currentBalance)}
                      </Badge>
                      <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/local-trade/parties", icon: Users, label: "الملفات", color: "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" },
          { href: "/local-trade/invoices", icon: FileText, label: "الفواتير", color: "bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800" },
          { href: "/local-trade/payments", icon: Wallet, label: "المدفوعات", color: "bg-teal-50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800" },
          { href: "/local-trade/returns", icon: RotateCcw, label: "المرتجعات", color: "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800" },
        ].map(({ href, icon: Icon, label, color }) => (
          <Link key={href} href={href}>
            <div className={`flex flex-col items-center justify-center p-4 rounded-lg border cursor-pointer hover:shadow-sm transition-all gap-2 ${color}`}>
              <Icon className="w-6 h-6" />
              <span className="text-sm font-medium">{label}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
