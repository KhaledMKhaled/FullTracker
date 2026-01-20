import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DollarSign,
  Plus,
  Search,
  TrendingUp,
  Calendar,
  RefreshCw,
  Clock3,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ExchangeRate, InsertExchangeRate } from "@shared/schema";

const CURRENCIES = [
  { code: "RMB", name: "رممبي صيني", symbol: "¥" },
  { code: "EGP", name: "جنيه مصري", symbol: "ج.م" },
  { code: "USD", name: "دولار أمريكي", symbol: "$" },
];

export default function ExchangeRates() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [fromCurrency, setFromCurrency] = useState("RMB");
  const [toCurrency, setToCurrency] = useState("EGP");
  const { toast } = useToast();

  const { data: rates, isLoading } = useQuery<ExchangeRate[]>({
    queryKey: ["/api/exchange-rates"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertExchangeRate) => {
      return apiRequest("POST", "/api/exchange-rates", data);
    },
    onSuccess: () => {
      toast({ title: "تم إضافة سعر الصرف بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-rates"] });
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({ title: "حدث خطأ", variant: "destructive" });
    },
  });

  const manualRefresh = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/exchange-rates/refresh", {});
    },
    onSuccess: () => {
      toast({ title: "تم تحديث أسعار الصرف يدويًا" });
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-rates"] });
    },
    onError: () => {
      toast({ title: "تعذر تحديث الأسعار", variant: "destructive" });
    },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      manualRefresh.mutate();
    }, 60 * 60 * 1000); // تحديث كل ساعة
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: InsertExchangeRate = {
      rateDate: formData.get("rateDate") as string,
      fromCurrency: formData.get("fromCurrency") as string,
      toCurrency: formData.get("toCurrency") as string,
      rateValue: formData.get("rateValue") as string,
      source: (formData.get("source") as string) || "إدخال يدوي",
    };
    createMutation.mutate(data);
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("ar-EG");
  };

  const lastUpdated = rates?.reduce<Date | null>((latest, rate) => {
    const created = rate.createdAt ? new Date(rate.createdAt) : null;
    if (!created) return latest;
    if (!latest || created.getTime() > latest.getTime()) return created;
    return latest;
  }, null);

  // Get latest rates for quick view
  const latestRmbToEgp = rates?.find(
    (r) => r.fromCurrency === "RMB" && r.toCurrency === "EGP"
  );
  const latestUsdToRmb = rates?.find(
    (r) => r.fromCurrency === "USD" && r.toCurrency === "RMB"
  );
  const latestUsdToEgp = rates?.find(
    (r) => r.fromCurrency === "USD" && r.toCurrency === "EGP"
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">أسعار الصرف</h1>
          <p className="text-muted-foreground mt-1">
            إدارة أسعار تحويل العملات بين الرممبي والجنيه وباقي العملات
          </p>
          {lastUpdated && (
            <div className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Clock3 className="w-4 h-4" />
              <span>
                آخر تحديث: {new Date(lastUpdated).toLocaleString("ar-EG")}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => manualRefresh.mutate()}
            data-testid="button-refresh-rates"
          >
            <RefreshCw className="w-4 h-4 ml-2" />
            تحديث الأسعار
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-rate">
                <Plus className="w-4 h-4 ml-2" />
                إضافة سعر جديد
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة سعر صرف</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rateDate">التاريخ *</Label>
                <Input
                  id="rateDate"
                  name="rateDate"
                  type="date"
                  defaultValue={new Date().toISOString().split("T")[0]}
                  required
                  data-testid="input-rate-date"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fromCurrency">من العملة *</Label>
                  <Select
                    name="fromCurrency"
                    value={fromCurrency}
                    onValueChange={setFromCurrency}
                  >
                    <SelectTrigger data-testid="select-from-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.symbol} {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="toCurrency">إلى العملة *</Label>
                  <Select
                    name="toCurrency"
                    value={toCurrency}
                    onValueChange={setToCurrency}
                  >
                    <SelectTrigger data-testid="select-to-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.symbol} {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rateValue">سعر الصرف *</Label>
                <Input
                  id="rateValue"
                  name="rateValue"
                  type="number"
                  step="0.000001"
                  required
                  placeholder="7.0000"
                  data-testid="input-rate-value"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source">المصدر</Label>
                <Input
                  id="source"
                  name="source"
                  placeholder="إدخال يدوي"
                  data-testid="input-rate-source"
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createMutation.isPending}
                  data-testid="button-save-rate"
                >
                  {createMutation.isPending ? "جاري الحفظ..." : "حفظ"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  إلغاء
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Quick View Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RateCard
          title="RMB → EGP"
          fromSymbol="¥"
          toSymbol="ج.م"
          rate={latestRmbToEgp}
        />
        <RateCard
          title="USD → RMB"
          fromSymbol="$"
          toSymbol="¥"
          rate={latestUsdToRmb}
        />
        <RateCard
          title="USD → EGP"
          fromSymbol="$"
          toSymbol="ج.م"
          rate={latestUsdToEgp}
        />
      </div>

      {/* Rates Table */}
      <Card>
        <CardHeader className="pb-4 flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            سجل أسعار الصرف
            {rates && (
              <Badge variant="secondary" className="mr-2">
                {rates.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton />
          ) : rates && rates.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">من</TableHead>
                    <TableHead className="text-right">إلى</TableHead>
                    <TableHead className="text-right">السعر</TableHead>
                    <TableHead className="text-right">المصدر</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rates.map((rate) => (
                    <TableRow key={rate.id} data-testid={`row-rate-${rate.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          {formatDate(rate.rateDate)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{rate.fromCurrency}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{rate.toCurrency}</Badge>
                      </TableCell>
                      <TableCell className="font-mono font-bold">
                        {parseFloat(rate.rateValue).toFixed(4)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {rate.source || "إدخال يدوي"}
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
    </div>
  );
}

function RateCard({
  title,
  fromSymbol,
  toSymbol,
  rate,
}: {
  title: string;
  fromSymbol: string;
  toSymbol: string;
  rate?: ExchangeRate;
}) {
  const getTimeAgo = (dateStr: string | Date) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return "اليوم";
    if (diffInDays === 1) return "أمس";
    if (diffInDays < 7) return `منذ ${diffInDays} أيام`;
    if (diffInDays < 30) return `منذ ${Math.floor(diffInDays / 7)} أسابيع`;
    return new Date(dateStr).toLocaleDateString("ar-EG");
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-muted-foreground">{title}</span>
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-primary" />
          </div>
        </div>
        {rate ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">
                {parseFloat(rate.rateValue).toFixed(2)}
              </span>
              <span className="text-muted-foreground">{toSymbol}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              1 {fromSymbol} = {parseFloat(rate.rateValue).toFixed(4)} {toSymbol}
            </p>
            <div className="flex items-center gap-1 mt-2">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                آخر تحديث: {getTimeAgo(rate.rateDate)}
              </p>
            </div>
            {rate.createdAt && (
              <p className="text-xs text-muted-foreground opacity-60">
                تم الإدخال: {new Date(rate.createdAt).toLocaleString("ar-EG")}
              </p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">لا يوجد سعر مسجل</p>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
        <TrendingUp className="w-10 h-10 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-medium mb-2">لا توجد أسعار صرف</h3>
      <p className="text-muted-foreground mb-6">
        ابدأ بإضافة أسعار الصرف المستخدمة في الشحنات
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
