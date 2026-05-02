import { useState, useEffect } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  Users,
  Plus,
  Search,
  Edit,
  Phone,
  Store,
  Building,
  MapPin,
  ChevronLeft,
  CreditCard,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useParties, useCreateParty, useUpdateParty } from "@/hooks/use-local-trade";
import { getErrorMessage } from "@/lib/queryClient";

interface Party {
  id: number;
  type: string;
  name: string;
  imageUrl?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  shopName?: string | null;
  addressArea?: string | null;
  addressGovernorate?: string | null;
  paymentTerms: string;
  creditLimitMode: string;
  creditLimitAmountEgp?: string | null;
  openingBalanceType: string;
  openingBalanceEgp: string;
  nextCollectionDate?: string | null;
  nextCollectionAmountEgp?: string | null;
  nextCollectionNote?: string | null;
  isActive: boolean;
  currentBalance?: string;
}

export default function PartiesPage() {
  const [location, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const typeFromUrl = params.get("type");
    return typeFromUrl && ["merchant", "customer", "both"].includes(typeFromUrl) ? typeFromUrl : "all";
  });
  const [showActiveOnly, setShowActiveOnly] = useState(false);

  useEffect(() => {
    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const typeFromUrl = params.get("type");
      if (typeFromUrl && ["merchant", "customer", "both"].includes(typeFromUrl)) {
        setTypeFilter(typeFromUrl);
      } else {
        setTypeFilter("all");
      }
    };
    window.addEventListener('popstate', handleUrlChange);
    handleUrlChange();
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, [location]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [formPaymentTerms, setFormPaymentTerms] = useState("cash");
  const [formCreditLimitMode, setFormCreditLimitMode] = useState("unlimited");
  const [formOpeningBalanceType, setFormOpeningBalanceType] = useState("debit");
  const { toast } = useToast();

  const filters = {
    type: typeFilter === "all" ? undefined : typeFilter,
    isActive: showActiveOnly ? true : undefined,
  };

  const { data: parties, isLoading } = useParties(filters);

  const createMutation = useCreateParty();
  const updateMutation = useUpdateParty();

  const filteredParties = (parties as Party[] | undefined)?.filter(
    (party) =>
      !search ||
      party.name.toLowerCase().includes(search.toLowerCase()) ||
      party.shopName?.toLowerCase().includes(search.toLowerCase()) ||
      party.phone?.includes(search)
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const data = {
      type: formData.get("type") as string,
      name: formData.get("name") as string,
      phone: (formData.get("phone") as string) || null,
      whatsapp: (formData.get("whatsapp") as string) || null,
      shopName: (formData.get("shopName") as string) || null,
      addressArea: (formData.get("addressArea") as string) || null,
      addressGovernorate: (formData.get("addressGovernorate") as string) || null,
      paymentTerms: formData.get("paymentTerms") as string,
      creditLimitMode: formData.get("creditLimitMode") as string || "unlimited",
      creditLimitAmountEgp: (formData.get("creditLimitAmountEgp") as string) || null,
      openingBalanceType: formOpeningBalanceType,
      openingBalanceEgp: (formData.get("openingBalanceEgp") as string) || "0",
      isActive: formData.get("isActive") === "on",
    };

    if (editingParty) {
      updateMutation.mutate(
        { id: editingParty.id, data },
        {
          onSuccess: () => {
            toast({ title: "تم تحديث البيانات بنجاح" });
            setIsDialogOpen(false);
            setEditingParty(null);
          },
          onError: (error) => {
            toast({ title: getErrorMessage(error), variant: "destructive" });
          },
        }
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: () => {
          toast({ title: "تم إضافة الملف بنجاح" });
          setIsDialogOpen(false);
          setEditingParty(null);
        },
        onError: (error) => {
          toast({ title: getErrorMessage(error), variant: "destructive" });
        },
      });
    }
  };

  const openEditDialog = (party: Party, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingParty(party);
    setFormPaymentTerms(party.paymentTerms);
    setFormCreditLimitMode(party.creditLimitMode);
    setFormOpeningBalanceType(party.openingBalanceType || "debit");
    setIsDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingParty(null);
    setFormPaymentTerms("cash");
    setFormCreditLimitMode("unlimited");
    setFormOpeningBalanceType("debit");
    setIsDialogOpen(true);
  };

  const getTypeLabel = (type: string) =>
    type === "merchant" ? "تاجر" : type === "customer" ? "عميل" : "مزدوج";

  const getTypeBadgeStyle = (type: string) => {
    if (type === "merchant") return "bg-blue-100 text-blue-700 border-blue-200";
    if (type === "customer") return "bg-purple-100 text-purple-700 border-purple-200";
    return "bg-amber-100 text-amber-700 border-amber-200";
  };

  const getPaymentTermsLabel = (terms: string) =>
    terms === "cash" ? "كاش" : "آجل";

  const formatCurrency = (value: string | number | null | undefined) => {
    if (!value) return "0";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return "0";
    return new Intl.NumberFormat("ar-EG").format(num);
  };

  const getBalance = (party: Party) => {
    const raw = parseFloat(party.currentBalance || "0");
    const abs = Math.abs(raw);
    const isDebit = raw > 0;
    const isCredit = raw < 0;
    return { raw, abs, isDebit, isCredit };
  };

  const getInitials = (name: string) =>
    name.trim().charAt(0).toUpperCase();

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">الملفات</h1>
          <p className="text-muted-foreground mt-1">
            إدارة بيانات التجار والعملاء في التجارة المحلية
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewDialog} data-testid="button-add-party">
              <Plus className="w-4 h-4 ml-2" />
              إضافة ملف جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>
                {editingParty ? "تعديل الملف" : "إضافة ملف جديد"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-3">
                <Label>نوع الملف *</Label>
                <RadioGroup
                  name="type"
                  defaultValue={editingParty?.type || "merchant"}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="merchant" id="type-merchant" />
                    <Label htmlFor="type-merchant" className="cursor-pointer">تاجر</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="customer" id="type-customer" />
                    <Label htmlFor="type-customer" className="cursor-pointer">عميل</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="both" id="type-both" />
                    <Label htmlFor="type-both" className="cursor-pointer">مزدوج</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">الاسم *</Label>
                  <Input id="name" name="name" defaultValue={editingParty?.name || ""} required data-testid="input-party-name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shopName">اسم المحل</Label>
                  <Input id="shopName" name="shopName" defaultValue={editingParty?.shopName || ""} data-testid="input-party-shop" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">الهاتف</Label>
                  <Input id="phone" name="phone" defaultValue={editingParty?.phone || ""} data-testid="input-party-phone" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">واتساب</Label>
                  <Input id="whatsapp" name="whatsapp" defaultValue={editingParty?.whatsapp || ""} data-testid="input-party-whatsapp" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="addressArea">المنطقة</Label>
                  <Input id="addressArea" name="addressArea" defaultValue={editingParty?.addressArea || ""} data-testid="input-party-area" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="addressGovernorate">المحافظة</Label>
                  <Input id="addressGovernorate" name="addressGovernorate" defaultValue={editingParty?.addressGovernorate || ""} data-testid="input-party-governorate" />
                </div>
              </div>

              <div className="space-y-3">
                <Label>نوع الدفع *</Label>
                <RadioGroup name="paymentTerms" value={formPaymentTerms} onValueChange={setFormPaymentTerms} className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="cash" id="payment-cash" />
                    <Label htmlFor="payment-cash" className="cursor-pointer">كاش</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="credit" id="payment-credit" />
                    <Label htmlFor="payment-credit" className="cursor-pointer">آجل</Label>
                  </div>
                </RadioGroup>
              </div>

              {formPaymentTerms === "credit" && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <div className="space-y-3">
                    <Label>حد الائتمان</Label>
                    <RadioGroup name="creditLimitMode" value={formCreditLimitMode} onValueChange={setFormCreditLimitMode} className="flex gap-6">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="unlimited" id="limit-unlimited" />
                        <Label htmlFor="limit-unlimited" className="cursor-pointer">غير محدود</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="limited" id="limit-limited" />
                        <Label htmlFor="limit-limited" className="cursor-pointer">محدود</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  {formCreditLimitMode === "limited" && (
                    <div className="space-y-2">
                      <Label htmlFor="creditLimitAmountEgp">قيمة الحد (ج.م)</Label>
                      <Input id="creditLimitAmountEgp" name="creditLimitAmountEgp" type="number" step="0.01" defaultValue={editingParty?.creditLimitAmountEgp || ""} data-testid="input-party-credit-limit" />
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4 p-4 border rounded-lg">
                <h4 className="font-medium">الرصيد الافتتاحي</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <Label>نوع الرصيد</Label>
                    <RadioGroup value={formOpeningBalanceType} onValueChange={setFormOpeningBalanceType} className="flex gap-6">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="debit" id="balance-debit" />
                        <Label htmlFor="balance-debit" className="cursor-pointer">مدين (عليه)</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="credit" id="balance-credit" />
                        <Label htmlFor="balance-credit" className="cursor-pointer">دائن (له)</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="openingBalanceEgp">قيمة الرصيد (ج.م)</Label>
                    <Input id="openingBalanceEgp" name="openingBalanceEgp" type="number" step="0.01" defaultValue={editingParty?.openingBalanceEgp || "0"} data-testid="input-party-opening-balance" />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch id="isActive" name="isActive" defaultChecked={editingParty?.isActive ?? true} />
                <Label htmlFor="isActive">نشط</Label>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" className="flex-1" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-party">
                  {createMutation.isPending || updateMutation.isPending ? "جاري الحفظ..." : "حفظ"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  إلغاء
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو المحل أو الهاتف..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-10"
                data-testid="input-search-parties"
              />
            </div>
            <Tabs value={typeFilter} onValueChange={setTypeFilter}>
              <TabsList>
                <TabsTrigger value="all">الكل</TabsTrigger>
                <TabsTrigger value="merchant">تاجر</TabsTrigger>
                <TabsTrigger value="customer">عميل</TabsTrigger>
                <TabsTrigger value="both">مزدوج</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <Checkbox
                id="activeOnly"
                checked={showActiveOnly}
                onCheckedChange={(checked) => setShowActiveOnly(checked === true)}
              />
              <Label htmlFor="activeOnly" className="cursor-pointer text-sm">النشطين فقط</Label>
            </div>
            {filteredParties && (
              <span className="text-sm text-muted-foreground mr-auto">
                {filteredParties.length} ملف
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : filteredParties && filteredParties.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="divide-y">
            {filteredParties.map((party) => {
              const { raw, abs, isDebit, isCredit } = getBalance(party);
              const address = [party.addressArea, party.addressGovernorate].filter(Boolean).join(" - ");

              return (
                <div
                  key={party.id}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer group"
                  onClick={() => navigate(`/local-trade/parties/${party.id}`)}
                  data-testid={`row-party-${party.id}`}
                >
                  {/* Avatar */}
                  <Avatar className="w-11 h-11 shrink-0 ring-2 ring-offset-1 ring-transparent group-hover:ring-primary/20 transition-all">
                    <AvatarImage src={party.imageUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-base">
                      {getInitials(party.name)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Name + Shop + Address */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-base leading-tight group-hover:text-primary transition-colors">
                        {party.name}
                      </span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getTypeBadgeStyle(party.type)}`}>
                        {getTypeLabel(party.type)}
                      </span>
                      {!party.isActive && (
                        <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 text-xs">
                          غير نشط
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {party.shopName && (
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Store className="w-3 h-3" />
                          {party.shopName}
                        </span>
                      )}
                      {party.phone && (
                        <span className="text-sm text-muted-foreground flex items-center gap-1" dir="ltr">
                          <Phone className="w-3 h-3" />
                          {party.phone}
                        </span>
                      )}
                      {address && (
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {address}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Payment Terms */}
                  <div className="hidden sm:flex flex-col items-center gap-1 shrink-0">
                    <span className="text-xs text-muted-foreground">نوع الدفع</span>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 border ${party.paymentTerms === "cash" ? "bg-green-50 text-green-700 border-green-200" : "bg-orange-50 text-orange-700 border-orange-200"}`}>
                      {party.paymentTerms === "cash" ? <Wallet className="w-3 h-3" /> : <CreditCard className="w-3 h-3" />}
                      {getPaymentTermsLabel(party.paymentTerms)}
                    </span>
                  </div>

                  {/* Balance */}
                  <div className="hidden md:flex flex-col items-end shrink-0 min-w-[110px]">
                    <span className="text-xs text-muted-foreground mb-0.5">الرصيد الحالي</span>
                    {raw === 0 ? (
                      <span className="font-mono text-sm text-muted-foreground">صفر</span>
                    ) : (
                      <div className="text-left">
                        <span className={`font-mono font-semibold text-sm ${isDebit ? "text-red-600" : "text-green-600"}`}>
                          {formatCurrency(abs.toFixed(2))} ج.م
                        </span>
                        <span className={`text-xs mr-1 ${isDebit ? "text-red-500" : "text-green-500"}`}>
                          ({isDebit ? "عليه" : "له"})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => openEditDialog(party, e)}
                      title="تعديل"
                      data-testid={`button-edit-party-${party.id}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <ChevronLeft className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
                <Users className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-medium mb-2">لا توجد ملفات</h3>
              <p className="text-muted-foreground mb-6">
                {search ? `لا توجد نتائج لـ "${search}"` : "ابدأ بإضافة تاجر أو عميل جديد"}
              </p>
              {!search && (
                <Button onClick={openNewDialog}>
                  <Plus className="w-4 h-4 ml-2" />
                  إضافة ملف جديد
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
