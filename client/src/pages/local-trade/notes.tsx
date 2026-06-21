import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  StickyNote,
  FileText,
  Wallet,
  RotateCcw,
  Search,
  Filter,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useParties, useLocalInvoices, useLocalPayments, useReturnCases } from "@/hooks/use-local-trade";

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}

function formatCurrency(val: string | number | null | undefined) {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ج.م";
}

interface NoteEntry {
  id: string;
  type: "invoice" | "payment" | "return";
  typeLabel: string;
  icon: React.ElementType;
  iconColor: string;
  partyId: number;
  partyName: string;
  date: string;
  amount: string;
  note: string;
  href: string;
  badge?: string;
}

export default function LocalTradeNotesPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "invoice" | "payment" | "return">("all");

  const { data: parties, isLoading: lp } = useParties();
  const { data: invoices, isLoading: li } = useLocalInvoices();
  const { data: payments, isLoading: lpay } = useLocalPayments();
  const { data: returnCases, isLoading: lr } = useReturnCases();

  const partyMap = useMemo(() => {
    const m: Record<number, any> = {};
    ((parties as any[]) || []).forEach((p) => { m[p.id] = p; });
    return m;
  }, [parties]);

  const allNotes: NoteEntry[] = useMemo(() => {
    const entries: NoteEntry[] = [];

    ((invoices as any[]) || [])
      .filter((i) => i.notes?.trim())
      .forEach((i) => {
        entries.push({
          id: `inv-${i.id}`,
          type: "invoice",
          typeLabel: i.invoiceKind === "شراء" ? "فاتورة شراء" : "فاتورة بيع",
          icon: FileText,
          iconColor: i.invoiceKind === "شراء"
            ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
          partyId: i.partyId,
          partyName: partyMap[i.partyId]?.name || "—",
          date: i.invoiceDate || i.createdAt,
          amount: formatCurrency(i.totalAmountEgp),
          note: i.notes,
          href: `/local-trade/parties/${i.partyId}`,
          badge: i.referenceNumber,
        });
      });

    ((payments as any[]) || [])
      .filter((p) => p.notes?.trim())
      .forEach((p) => {
        entries.push({
          id: `pay-${p.id}`,
          type: "payment",
          typeLabel: "دفعة",
          icon: Wallet,
          iconColor: "bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400",
          partyId: p.partyId,
          partyName: partyMap[p.partyId]?.name || "—",
          date: p.paymentDate || p.createdAt,
          amount: formatCurrency(p.amountEgp),
          note: p.notes,
          href: `/local-trade/parties/${p.partyId}`,
        });
      });

    ((returnCases as any[]) || [])
      .filter((r) => r.notes?.trim())
      .forEach((r) => {
        entries.push({
          id: `ret-${r.id}`,
          type: "return",
          typeLabel: "مرتجع",
          icon: RotateCcw,
          iconColor: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
          partyId: r.partyId,
          partyName: partyMap[r.partyId]?.name || "—",
          date: r.createdAt,
          amount: formatCurrency(r.amountEgp),
          note: r.notes,
          href: `/local-trade/parties/${r.partyId}`,
        });
      });

    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [invoices, payments, returnCases, partyMap]);

  const filtered = useMemo(() => {
    return allNotes.filter((n) => {
      if (filter !== "all" && n.type !== filter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          n.note.toLowerCase().includes(q) ||
          n.partyName.toLowerCase().includes(q) ||
          n.typeLabel.includes(q)
        );
      }
      return true;
    });
  }, [allNotes, filter, search]);

  const isLoading = lp || li || lpay || lr;

  const counts = useMemo(() => ({
    all: allNotes.length,
    invoice: allNotes.filter((n) => n.type === "invoice").length,
    payment: allNotes.filter((n) => n.type === "payment").length,
    return: allNotes.filter((n) => n.type === "return").length,
  }), [allNotes]);

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <StickyNote className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">الملحوظات</h1>
          <p className="text-sm text-muted-foreground">جميع الملحوظات المسجلة على الفواتير والمدفوعات والمرتجعات</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="ابحث في الملحوظات أو الأطراف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">الكل ({counts.all})</TabsTrigger>
            <TabsTrigger value="invoice">فواتير ({counts.invoice})</TabsTrigger>
            <TabsTrigger value="payment">مدفوعات ({counts.payment})</TabsTrigger>
            <TabsTrigger value="return">مرتجعات ({counts.return})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <StickyNote className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground font-medium">
            {allNotes.length === 0 ? "لا توجد ملحوظات مسجلة حتى الآن" : "لا توجد نتائج مطابقة"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {allNotes.length === 0
              ? "يمكنك إضافة ملحوظات عند إنشاء الفواتير أو تسجيل المدفوعات"
              : "جرب تغيير كلمة البحث أو الفلتر"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => {
            const Icon = entry.icon;
            return (
              <Link key={entry.id} href={entry.href}>
                <Card className="hover:shadow-sm transition-all cursor-pointer hover:border-primary/30">
                  <CardContent className="p-4">
                    <div className="flex gap-3 items-start">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${entry.iconColor}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm">{entry.partyName}</span>
                          <Badge variant="outline" className="text-xs">{entry.typeLabel}</Badge>
                          {entry.badge && (
                            <span className="text-xs text-muted-foreground font-mono">#{entry.badge}</span>
                          )}
                          <span className="text-xs text-muted-foreground mr-auto">{formatDate(entry.date)}</span>
                        </div>
                        <blockquote className="text-sm text-foreground/80 border-r-2 border-primary/40 pr-3 py-0.5 my-1 italic">
                          {entry.note}
                        </blockquote>
                        <p className="text-xs text-muted-foreground">{entry.amount}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
