import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Users,
  Plus,
  Search,
  Edit,
  Eye,
  Phone,
  Store,
  Building,
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
  const [location] = useLocation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>(() => {
    // Initialize from URL on first render
    const params = new URLSearchParams(window.location.search);
    const typeFromUrl = params.get("type");
    return typeFromUrl && ["merchant", "customer", "both"].includes(typeFromUrl) ? typeFromUrl : "all";
  });
  const [showActiveOnly, setShowActiveOnly] = useState(false);

  // Read type filter from URL query params when URL changes
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
    
    // Listen for popstate (back/forward) and custom events
    window.addEventListener('popstate', handleUrlChange);
    
    // Check on location change (wouter navigation)
    handleUrlChange();
    
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, [location]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [formPaymentTerms, setFormPaymentTerms] = useState("cash");
  const [formCreditLimitMode, setFormCreditLimitMode] = useState("unlimited");
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
      creditLimitAmountEgp: formData.get("creditLimitAmountEgp") 
        ? parseFloat(formData.get("creditLimitAmountEgp") as string) 
        : null,
      openingBalanceType: formData.get("openingBalanceType") as string || "debit",
      openingBalanceEgp: parseFloat((formData.get("openingBalanceEgp") as string) || "0"),
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

  const openEditDialog = (party: Party) => {
    setEditingParty(party);
    setFormPaymentTerms(party.paymentTerms);
    setFormCreditLimitMode(party.creditLimitMode);
    setIsDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingParty(null);
    setFormPaymentTerms("cash");
    setFormCreditLimitMode("unlimited");
    setIsDialogOpen(true);
  };

  const getTypeLabel = (type: string) => {
    return type === "merchant" ? "تاجر" : type === "customer" ? "عميل" : "مزدوج";
  };

  const getPaymentTermsLabel = (terms: string) => {
    return terms === "cash" ? "كاش" : "آجل";
  };

  const formatCurrency = (value: string | number | null | undefined) => {
    if (!value) return "0";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("ar-EG").format(num);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">الملفات (التجار والعملاء)</h1>
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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  <Input
                    id="name"
                    name="name"
                    defaultValue={editingParty?.name || ""}
                    required
                    data-testid="input-party-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shopName">اسم المحل</Label>
                  <Input
                    id="shopName"
                    name="shopName"
                    defaultValue={editingParty?.shopName || ""}
                    data-testid="input-party-shop"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">الهاتف</Label>
                  <Input
                    id="phone"
                    name="phone"
                    defaultValue={editingParty?.phone || ""}
                    data-testid="input-party-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">واتساب</Label>
                  <Input
                    id="whatsapp"
                    name="whatsapp"
                    defaultValue={editingParty?.whatsapp || ""}
                    data-testid="input-party-whatsapp"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="addressArea">المنطقة</Label>
                  <Input
                    id="addressArea"
                    name="addressArea"
                    defaultValue={editingParty?.addressArea || ""}
                    data-testid="input-party-area"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="addressGovernorate">المحافظة</Label>
                  <Input
                    id="addressGovernorate"
                    name="addressGovernorate"
                    defaultValue={editingParty?.addressGovernorate || ""}
                    data-testid="input-party-governorate"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label>نوع الدفع *</Label>
                <RadioGroup
                  name="paymentTerms"
                  value={formPaymentTerms}
                  onValueChange={setFormPaymentTerms}
                  className="flex gap-6"
                >
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
                    <RadioGroup
                      name="creditLimitMode"
                      value={formCreditLimitMode}
                      onValueChange={setFormCreditLimitMode}
                      className="flex gap-6"
                    >
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
                      <Input
                        id="creditLimitAmountEgp"
                        name="creditLimitAmountEgp"
                        type="number"
                        step="0.01"
                        defaultValue={editingParty?.creditLimitAmountEgp || ""}
                        data-testid="input-party-credit-limit"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4 p-4 border rounded-lg">
                <h4 className="font-medium">الرصيد الافتتاحي</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <Label>نوع الرصيد</Label>
                    <RadioGroup
                      name="openingBalanceType"
                      defaultValue={editingParty?.openingBalanceType || "debit"}
                      className="flex gap-6"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="debit" id="balance-debit" />
                        <Label htmlFor="balance-debit" className="cursor-pointer">مدين (له)</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="credit" id="balance-credit" />
                        <Label htmlFor="balance-credit" className="cursor-pointer">دائن (عليه)</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="openingBalanceEgp">قيمة الرصيد (ج.م)</Label>
                    <Input
                      id="openingBalanceEgp"
                      name="openingBalanceEgp"
                      type="number"
                      step="0.01"
                      defaultValue={editingParty?.openingBalanceEgp || "0"}
                      data-testid="input-party-opening-balance"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="isActive"
                  name="isActive"
                  defaultChecked={editingParty?.isActive ?? true}
                />
                <Label htmlFor="isActive">نشط</Label>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-party"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "جاري الحفظ..."
                    : "حفظ"}
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
              <Label htmlFor="activeOnly" className="cursor-pointer text-sm">
                النشطين فقط
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filteredParties && filteredParties.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">صورة</TableHead>
                  <TableHead>الاسم</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>المحل</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>نوع الدفع</TableHead>
                  <TableHead>حد الائتمان</TableHead>
                  <TableHead>الرصيد الحالي</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="w-[100px]">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredParties.map((party) => (
                  <TableRow key={party.id} data-testid={`row-party-${party.id}`}>
                    <TableCell>
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={party.imageUrl || undefined} />
                        <AvatarFallback className="bg-primary/10">
                          {party.type === "merchant" ? (
                            <Store className="w-5 h-5 text-primary" />
                          ) : (
                            <Building className="w-5 h-5 text-primary" />
                          )}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">{party.name}</TableCell>
                    <TableCell>
                      <Badge variant={party.type === "merchant" ? "default" : "secondary"}>
                        {getTypeLabel(party.type)}
                      </Badge>
                    </TableCell>
                    <TableCell>{party.shopName || "-"}</TableCell>
                    <TableCell>
                      {party.phone ? (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <span>{party.phone}</span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getPaymentTermsLabel(party.paymentTerms)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {party.paymentTerms === "credit" ? (
                        party.creditLimitMode === "unlimited" ? (
                          "غير محدود"
                        ) : (
                          `${formatCurrency(party.creditLimitAmountEgp)} ج.م`
                        )
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={
                        parseFloat(party.currentBalance || party.openingBalanceEgp) > 0
                          ? "text-green-600"
                          : parseFloat(party.currentBalance || party.openingBalanceEgp) < 0
                          ? "text-red-600"
                          : ""
                      }>
                        {formatCurrency(party.currentBalance || party.openingBalanceEgp)} ج.م
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={party.isActive ? "default" : "secondary"}
                        className={
                          party.isActive
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : ""
                        }
                      >
                        {party.isActive ? "نشط" : "غير نشط"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(party)}
                          data-testid={`button-edit-party-${party.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Link href={`/local-trade/parties/${party.id}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`button-view-party-${party.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
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
                ابدأ بإضافة تاجر أو عميل جديد
              </p>
              <Button onClick={openNewDialog}>
                <Plus className="w-4 h-4 ml-2" />
                إضافة ملف جديد
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
