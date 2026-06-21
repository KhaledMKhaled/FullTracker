import { useState, useMemo } from "react";
import {
  BarChart2,
  FileText,
  Wallet,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useParties, useLocalInvoices, useLocalPayments, useReturnCases } from "@/hooks/use-local-trade";
import { Link } from "wouter";

function formatCurrency(val: string | number | null | undefined) {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ج.م";
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("ar-EG");
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    "مدفوع": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    "غير مدفوع": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    "مدفوع جزئياً": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    "pending": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    "resolved": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

function SummaryCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3" dir="rtl">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function LocalTradeReportsPage() {
  const { data: parties, isLoading: lp } = useParties();
  const { data: invoices, isLoading: li } = useLocalInvoices();
  const { data: payments, isLoading: lpay } = useLocalPayments();
  const { data: returnCases, isLoading: lr } = useReturnCases();

  const allParties = (parties as any[]) || [];
  const allInvoices = (invoices as any[]) || [];
  const allPayments = (payments as any[]) || [];
  const allReturns = (returnCases as any[]) || [];

  const partyMap = useMemo(() => {
    const m: Record<number, any> = {};
    allParties.forEach((p) => { m[p.id] = p; });
    return m;
  }, [allParties]);

  const purchaseInvoices = allInvoices.filter((i) => i.invoiceKind === "شراء");
  const saleInvoices = allInvoices.filter((i) => i.invoiceKind === "بيع");

  const totalPurchases = purchaseInvoices.reduce((s: number, i: any) => s + parseFloat(i.totalAmountEgp || "0"), 0);
  const totalSales = saleInvoices.reduce((s: number, i: any) => s + parseFloat(i.totalAmountEgp || "0"), 0);
  const totalPayments = allPayments.reduce((s: number, p: any) => s + parseFloat(p.amountEgp || "0"), 0);
  const pendingReturns = allReturns.filter((r) => r.status === "pending");

  const partyBalances = useMemo(() => {
    return allParties
      .map((p: any) => ({ ...p, balance: parseFloat(p.currentBalance || "0") }))
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [allParties]);

  const isLoading = lp || li || lpay || lr;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <BarChart2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">التقارير</h1>
          <p className="text-sm text-muted-foreground">تقارير شاملة للتجارة المحلية</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="إجمالي المشتريات" value={formatCurrency(totalPurchases)} sub={`${purchaseInvoices.length} فاتورة`} icon={TrendingDown} color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" />
        <SummaryCard label="إجمالي المبيعات" value={formatCurrency(totalSales)} sub={`${saleInvoices.length} فاتورة`} icon={TrendingUp} color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
        <SummaryCard label="إجمالي المدفوعات" value={formatCurrency(totalPayments)} sub={`${allPayments.length} دفعة`} icon={Wallet} color="bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400" />
        <SummaryCard label="مرتجعات معلقة" value={String(pendingReturns.length)} sub={`من ${allReturns.length} إجمالي`} icon={RotateCcw} color="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" />
      </div>

      <Tabs defaultValue="invoices">
        <TabsList className="w-full justify-start h-auto gap-1 flex-wrap">
          <TabsTrigger value="invoices" className="flex items-center gap-1 flex-row-reverse">
            <FileText className="w-4 h-4" /> الفواتير
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-1 flex-row-reverse">
            <Wallet className="w-4 h-4" /> المدفوعات
          </TabsTrigger>
          <TabsTrigger value="returns" className="flex items-center gap-1 flex-row-reverse">
            <RotateCcw className="w-4 h-4" /> المرتجعات
          </TabsTrigger>
          <TabsTrigger value="balances" className="flex items-center gap-1 flex-row-reverse">
            <Users className="w-4 h-4" /> أرصدة الأطراف
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-green-500" /> فواتير الشراء ({purchaseInvoices.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {li ? <div className="p-4"><Skeleton className="h-24 w-full" /></div> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">المورد</TableHead>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">المبلغ</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseInvoices.slice(0, 10).map((inv: any) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium text-sm">{partyMap[inv.partyId]?.name || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(inv.invoiceDate)}</TableCell>
                          <TableCell className="text-sm font-mono">{formatCurrency(inv.totalAmountEgp)}</TableCell>
                          <TableCell>{statusBadge(inv.paymentStatus)}</TableCell>
                        </TableRow>
                      ))}
                      {purchaseInvoices.length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">لا توجد فواتير</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" /> فواتير البيع ({saleInvoices.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {li ? <div className="p-4"><Skeleton className="h-24 w-full" /></div> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">العميل</TableHead>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">المبلغ</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {saleInvoices.slice(0, 10).map((inv: any) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium text-sm">{partyMap[inv.partyId]?.name || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(inv.invoiceDate)}</TableCell>
                          <TableCell className="text-sm font-mono">{formatCurrency(inv.totalAmountEgp)}</TableCell>
                          <TableCell>{statusBadge(inv.paymentStatus)}</TableCell>
                        </TableRow>
                      ))}
                      {saleInvoices.length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">لا توجد فواتير</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">سجل المدفوعات ({allPayments.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {lpay ? <div className="p-4"><Skeleton className="h-40 w-full" /></div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الطرف</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">المبلغ</TableHead>
                      <TableHead className="text-right">الملحوظة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allPayments.slice(0, 20).map((pay: any) => (
                      <TableRow key={pay.id}>
                        <TableCell className="font-medium text-sm">{partyMap[pay.partyId]?.name || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(pay.paymentDate)}</TableCell>
                        <TableCell className="text-sm font-mono font-bold text-teal-600">{formatCurrency(pay.amountEgp)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{pay.notes || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {allPayments.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">لا توجد مدفوعات</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="returns" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">سجل المرتجعات ({allReturns.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {lr ? <div className="p-4"><Skeleton className="h-40 w-full" /></div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الطرف</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">المبلغ</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allReturns.map((ret: any) => (
                      <TableRow key={ret.id}>
                        <TableCell className="font-medium text-sm">{partyMap[ret.partyId]?.name || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(ret.createdAt)}</TableCell>
                        <TableCell className="text-sm font-mono">{formatCurrency(ret.amountEgp)}</TableCell>
                        <TableCell>{statusBadge(ret.status)}</TableCell>
                      </TableRow>
                    ))}
                    {allReturns.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">لا توجد مرتجعات</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balances" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">أرصدة الأطراف ({allParties.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {lp ? <div className="p-4"><Skeleton className="h-40 w-full" /></div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الاسم</TableHead>
                      <TableHead className="text-right">النوع</TableHead>
                      <TableHead className="text-right">الرصيد الحالي</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partyBalances.map((party: any) => (
                      <TableRow key={party.id}>
                        <TableCell>
                          <Link href={`/local-trade/parties/${party.id}`}>
                            <span className="font-medium text-sm hover:text-primary cursor-pointer">{party.name}</span>
                          </Link>
                          {party.shopName && <p className="text-xs text-muted-foreground">{party.shopName}</p>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{party.type}</Badge>
                        </TableCell>
                        <TableCell className={`text-sm font-mono font-bold ${party.balance > 0 ? "text-red-600" : party.balance < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                          {formatCurrency(party.balance)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={party.isActive ? "default" : "secondary"} className="text-xs">
                            {party.isActive ? "نشط" : "غير نشط"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {allParties.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">لا توجد أطراف</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
