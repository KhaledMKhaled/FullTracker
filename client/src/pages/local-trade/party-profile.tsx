import { useState, useMemo, useEffect } from "react";
import { useParams, Link } from "wouter";
import {
  User,
  Phone,
  Store,
  MapPin,
  Edit,
  Plus,
  ArrowRight,
  CreditCard,
  FileSpreadsheet,
  RefreshCcw,
  BookOpen,
  Archive,
  Calendar,
  Search,
  Bell,
  Clock,
  CheckCircle,
  AlertCircle,
  History,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  useParty,
  usePartyProfile,
  usePartyProfileSummary,
  useUpdateParty,
  useLocalInvoices,
  useLocalPayments,
  useReturnCases,
  usePartySeasons,
  useCreateLocalPayment,
  useCreateLocalInvoice,
  useCreateSettlement,
  usePartyCollections,
  usePartyTimeline,
  useUpsertPartyCollections,
  useUpdateCollectionStatus,
  useMarkCollectionReminder,
  useNotifications,
  useCheckDueCollections,
  useMarkNotificationRead,
} from "@/hooks/use-local-trade";
import { getErrorMessage, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import type { ProductType } from "@shared/schema";

interface CreateInvoiceLineInput {
  productTypeId: number | null;
  quantity: number;
  unit: "piece" | "dozen";
  unitPriceEgp: number;
}

function validateDozenQuantity(quantity: number, unit: string): string | null {
  if (unit === "dozen" && quantity % 12 !== 0) {
    return "الكمية يجب أن تكون من مضاعفات 12 عند البيع بالدستة";
  }
  return null;
}

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

interface Invoice {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceKind: string;
  partyId: number;
  partyName?: string;
  notes?: string | null;
  status: string;
  totalEgp: string;
  linesCount: number;
}

interface Payment {
  id: number;
  paymentDate: string;
  amountEgp: string;
  paymentMethod: string;
  notes?: string | null;
  createdAt: string;
}

interface ReturnCase {
  id: number;
  invoiceId: number;
  invoiceNumber?: string;
  reason: string;
  status: string;
  resolutionType?: string | null;
  resolutionAmountEgp?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

interface LedgerEntry {
  id: number;
  entryDate: string;
  description: string;
  debitEgp: string;
  creditEgp: string;
  balanceEgp: string;
  referenceType?: string | null;
  referenceId?: number | null;
}

interface Season {
  id: number;
  seasonName: string;
  startedAt: string;
  endedAt?: string | null;
  openingBalanceType: string;
  openingBalanceEgp: string;
  closingBalanceType?: string | null;
  closingBalanceEgp?: string | null;
  settlementInvoiceId?: number | null;
}

interface Collection {
  id: number;
  partyId: number;
  collectionOrder: number;
  collectionDate: string | null;
  amountEgp: string | null;
  notes: string | null;
  reminderSent: boolean;
  status: string;
  linkedPaymentId?: number | null;
  createdAt: string;
  updatedAt: string;
}

interface TimelineItem {
  type: 'invoice' | 'payment' | 'return' | 'collection';
  date: string;
  id: number;
  title: string;
  description: string | null;
  amount: string | null;
  status: string | null;
  referenceNumber?: string | null;
}

interface Notification {
  id: number;
  userId: string;
  type: string;
  title: string;
  message: string | null;
  referenceType: string | null;
  referenceId: number | null;
  isRead: boolean;
  createdAt: string;
}

function formatCurrency(value: string | number | null | undefined): string {
  if (!value) return "0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("ar-EG").format(num);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("ar-EG");
}

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary">معلقة</Badge>;
    case "partial":
      return <Badge variant="outline" className="border-amber-500 text-amber-600">مستلمة جزئياً</Badge>;
    case "received":
      return <Badge variant="default" className="bg-green-600">مستلمة</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getReturnStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary">معلقة</Badge>;
    case "resolved":
      return <Badge variant="default" className="bg-green-600">تم الحل</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function PartyProfilePage() {
  const params = useParams();
  const partyId = params.id ? parseInt(params.id) : 0;
  
  const [activeTab, setActiveTab] = useState("overview");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isSettlementDialogOpen, setIsSettlementDialogOpen] = useState(false);
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
  
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<string>("all");
  const [invoiceKindFilter, setInvoiceKindFilter] = useState<string>("all");
  const [returnStatusFilter, setReturnStatusFilter] = useState<string>("all");
  
  const [invoiceKind, setInvoiceKind] = useState("purchase");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [invoiceLines, setInvoiceLines] = useState<CreateInvoiceLineInput[]>([
    { productTypeId: null, quantity: 1, unit: "piece", unitPriceEgp: 0 },
  ]);
  
  const { toast } = useToast();
  
  const { data: party, isLoading: isLoadingParty } = useParty(partyId);
  const { data: profile } = usePartyProfile(partyId);
  const { data: summary } = usePartyProfileSummary(partyId);
  
  const invoiceFilters = {
    partyId,
    status: invoiceStatusFilter === "all" ? undefined : invoiceStatusFilter,
    invoiceKind: invoiceKindFilter === "all" ? undefined : invoiceKindFilter,
  };
  const { data: invoices, isLoading: isLoadingInvoices } = useLocalInvoices(invoiceFilters);
  
  const { data: payments, isLoading: isLoadingPayments } = useLocalPayments({ partyId });
  const { data: returnCases, isLoading: isLoadingReturns } = useReturnCases({ 
    partyId,
    status: returnStatusFilter === "all" ? undefined : returnStatusFilter,
  });
  const { data: seasons, isLoading: isLoadingSeasons } = usePartySeasons(partyId);
  
  const { data: notifications = [] } = useNotifications();
  const checkDueCollectionsMutation = useCheckDueCollections();
  const markNotificationReadMutation = useMarkNotificationRead();
  
  useEffect(() => {
    if (partyId) {
      checkDueCollectionsMutation.mutate();
    }
  }, [partyId]);
  
  const updateMutation = useUpdateParty();
  const createPaymentMutation = useCreateLocalPayment();
  const createSettlementMutation = useCreateSettlement();
  const createInvoiceMutation = useCreateLocalInvoice();
  
  const { data: productTypes } = useQuery<ProductType[]>({
    queryKey: ["/api/product-types"],
  });

  const { data: collections, isLoading: isLoadingCollections } = usePartyCollections(partyId);
  const { data: timeline, isLoading: isLoadingTimeline } = usePartyTimeline(partyId);
  const upsertCollectionsMutation = useUpsertPartyCollections();
  const updateCollectionStatusMutation = useUpdateCollectionStatus();
  const markReminderMutation = useMarkCollectionReminder();

  const partyData = party as Party | undefined;
  const ledgerEntries = (profile as { ledger?: LedgerEntry[] })?.ledger || [];

  if (isLoadingParty) {
    return (
      <div className="p-6 space-y-6" dir="rtl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!partyData) {
    return (
      <div className="p-6" dir="rtl">
        <div className="text-center py-12">
          <p className="text-muted-foreground">لم يتم العثور على الملف</p>
          <Link href="/local-trade/parties">
            <Button variant="ghost" className="mt-4">
              <ArrowRight className="w-4 h-4 ml-2" />
              العودة للملفات
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const currentBalance = parseFloat(partyData.currentBalance || "0");
  const isDebit = currentBalance > 0;
  const isCredit = currentBalance < 0;

  const getTypeLabel = (type: string) => type === "merchant" ? "تاجر" : type === "customer" ? "عميل" : "مزدوج";
  const getPaymentTermsLabel = (terms: string) => terms === "cash" ? "كاش" : "آجل";

  const addInvoiceLine = () => {
    setInvoiceLines([
      ...invoiceLines,
      { productTypeId: null, quantity: 1, unit: "piece", unitPriceEgp: 0 },
    ]);
  };

  const removeInvoiceLine = (index: number) => {
    if (invoiceLines.length > 1) {
      setInvoiceLines(invoiceLines.filter((_, i) => i !== index));
    }
  };

  const updateInvoiceLine = (index: number, updates: Partial<CreateInvoiceLineInput>) => {
    setInvoiceLines(invoiceLines.map((line, i) => (i === index ? { ...line, ...updates } : line)));
  };

  const lineTotal = (line: CreateInvoiceLineInput) => line.quantity * line.unitPriceEgp;
  const invoiceTotal = invoiceLines.reduce((sum, line) => sum + lineTotal(line), 0);

  const getLineError = (line: CreateInvoiceLineInput): string | null => {
    return validateDozenQuantity(line.quantity, line.unit);
  };

  const hasDozenValidationErrors = invoiceLines.some((l) => getLineError(l) !== null);

  const handleInvoiceSubmit = () => {
    if (invoiceLines.some((l) => !l.productTypeId || l.quantity <= 0)) return;
    if (hasDozenValidationErrors) return;

    createInvoiceMutation.mutate(
      {
        invoiceKind,
        partyId,
        invoiceDate,
        notes: invoiceNotes || null,
        lines: invoiceLines.map((l) => {
          const productType = productTypes?.find((pt) => pt.id === l.productTypeId);
          return {
            productTypeId: l.productTypeId,
            productName: productType?.name || "منتج",
            totalPieces: l.quantity,
            unitMode: l.unit,
            unitPriceEgp: l.unitPriceEgp.toString(),
            lineTotalEgp: (l.quantity * l.unitPriceEgp).toString(),
          };
        }),
      },
      {
        onSuccess: () => {
          toast({ title: "تم إنشاء الفاتورة بنجاح" });
          setIsInvoiceDialogOpen(false);
          resetInvoiceForm();
          queryClient.invalidateQueries({ queryKey: ["/api/local-trade/invoices"] });
          queryClient.invalidateQueries({ queryKey: ["/api/local-trade/parties", partyId, "profile"] });
          queryClient.invalidateQueries({ queryKey: ["/api/local-trade/parties", partyId, "summary"] });
        },
        onError: (error) => {
          toast({ title: getErrorMessage(error), variant: "destructive" });
        },
      }
    );
  };

  const resetInvoiceForm = () => {
    setInvoiceKind("purchase");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setInvoiceNotes("");
    setInvoiceLines([{ productTypeId: null, quantity: 1, unit: "piece", unitPriceEgp: 0 }]);
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background border-b pb-4 -mx-6 px-6 pt-4 -mt-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 flex-row-reverse justify-end">
          <Link href="/local-trade/parties" className="hover:text-foreground">
            الملفات
          </Link>
          <span>/</span>
          <span>{partyData.name}</span>
        </div>

        {/* Main Header */}
        <div className="flex flex-col md:flex-row-reverse gap-4 items-start md:items-center justify-between">
          <div className="flex items-center gap-4 flex-row-reverse">
            <Avatar className="w-16 h-16">
              <AvatarImage src={partyData.imageUrl || undefined} />
              <AvatarFallback className="text-xl bg-primary/10 text-primary">
                {partyData.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="text-right">
              <div className="flex items-center gap-2 flex-row-reverse justify-end">
                <h1 className="text-2xl font-bold">{partyData.name}</h1>
                <Badge variant={partyData.type === "merchant" ? "default" : "secondary"}>
                  {partyData.type === "merchant" ? "تاجر" : "عميل"}
                </Badge>
                {!partyData.isActive && (
                  <Badge variant="outline" className="border-red-500 text-red-500">موقوف</Badge>
                )}
              </div>
              {partyData.shopName && (
                <p className="text-muted-foreground">{partyData.shopName}</p>
              )}
              <div className="flex items-center gap-3 mt-1 text-sm flex-row-reverse justify-end">
                {partyData.phone && (
                  <span className="flex items-center gap-1 flex-row-reverse">
                    <Phone className="w-3 h-3" />
                    <span dir="ltr">{partyData.phone}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 flex-row-reverse">
            {notifications.length > 0 && (
              <div className="relative">
                <Button size="sm" variant="outline" className="relative">
                  <Bell className="w-4 h-4" />
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {notifications.length}
                  </span>
                </Button>
              </div>
            )}
            <Button size="sm" onClick={() => setIsPaymentDialogOpen(true)}>
              <Plus className="w-4 h-4 ml-1" />
              تسجيل دفعة
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsInvoiceDialogOpen(true)}>
              <FileSpreadsheet className="w-4 h-4 ml-1" />
              فاتورة جديدة
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsEditDialogOpen(true)}>
              <Edit className="w-4 h-4 ml-1" />
              تعديل
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-4">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">إجمالي الفواتير</div>
          <div className="text-lg font-bold">{formatCurrency(summary?.kpis?.totalInvoicesEgp || 0)} ج.م</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">إجمالي المدفوع</div>
          <div className="text-lg font-bold text-green-600">{formatCurrency(summary?.kpis?.totalPaidEgp || 0)} ج.م</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">المتبقي</div>
          <div className={`text-lg font-bold ${currentBalance > 0 ? "text-red-600" : "text-green-600"}`}>
            {formatCurrency(Math.abs(currentBalance))} ج.م
            <span className="text-xs mr-1">({currentBalance > 0 ? "عليه" : "له"})</span>
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">تحت الفحص</div>
          <div className="text-lg font-bold text-amber-600">{formatCurrency(summary?.kpis?.underInspectionEgp || 0)} ج.م</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">آخر فاتورة</div>
          <div className="text-sm">{summary?.lastActivity?.lastInvoiceDate ? formatDate(summary.lastActivity.lastInvoiceDate) : "-"}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">آخر تحصيل</div>
          <div className="text-sm">{summary?.lastActivity?.lastCollectionDate ? formatDate(summary.lastActivity.lastCollectionDate) : "-"}</div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full flex-wrap h-auto gap-1 justify-start" dir="rtl">
          <TabsTrigger value="overview" className="flex items-center gap-1 flex-row-reverse">
            <User className="w-4 h-4" />
            نظرة عامة
          </TabsTrigger>
          <TabsTrigger value="invoices" className="flex items-center gap-1 flex-row-reverse">
            <FileSpreadsheet className="w-4 h-4" />
            الفواتير
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-1 flex-row-reverse">
            <CreditCard className="w-4 h-4" />
            المدفوعات
          </TabsTrigger>
          <TabsTrigger value="returns" className="flex items-center gap-1 flex-row-reverse">
            <RefreshCcw className="w-4 h-4" />
            الهوامش
          </TabsTrigger>
          <TabsTrigger value="ledger" className="flex items-center gap-1 flex-row-reverse">
            <BookOpen className="w-4 h-4" />
            كشف الحساب
          </TabsTrigger>
          <TabsTrigger value="archive" className="flex items-center gap-1 flex-row-reverse">
            <Archive className="w-4 h-4" />
            الأرشيف
          </TabsTrigger>
          <TabsTrigger value="collections" className="flex items-center gap-1 flex-row-reverse">
            <Bell className="w-4 h-4" />
            التحصيل
          </TabsTrigger>
          <TabsTrigger value="timeline" className="flex items-center gap-1 flex-row-reverse">
            <History className="w-4 h-4" />
            الحركات
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab
            party={partyData}
            summary={summary}
            currentBalance={currentBalance}
            onSettlement={() => setIsSettlementDialogOpen(true)}
            notifications={notifications as Notification[]}
            onDismissNotification={(id: number) => markNotificationReadMutation.mutate(id)}
          />
        </TabsContent>

        <TabsContent value="invoices" className="mt-6">
          <InvoicesTab
            invoices={(invoices as Invoice[]) || []}
            isLoading={isLoadingInvoices}
            statusFilter={invoiceStatusFilter}
            setStatusFilter={setInvoiceStatusFilter}
            kindFilter={invoiceKindFilter}
            setKindFilter={setInvoiceKindFilter}
            partyId={partyId}
            onNewInvoice={() => setIsInvoiceDialogOpen(true)}
          />
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <PaymentsTab
            payments={(payments as Payment[]) || []}
            isLoading={isLoadingPayments}
            onNewPayment={() => setIsPaymentDialogOpen(true)}
            invoices={invoices as any[]}
          />
        </TabsContent>

        <TabsContent value="returns" className="mt-6">
          <ReturnsTab
            returnCases={(returnCases as ReturnCase[]) || []}
            isLoading={isLoadingReturns}
            statusFilter={returnStatusFilter}
            setStatusFilter={setReturnStatusFilter}
          />
        </TabsContent>

        <TabsContent value="ledger" className="mt-6">
          <LedgerTab entries={ledgerEntries} partyData={partyData} currentBalance={currentBalance} />
        </TabsContent>

        <TabsContent value="archive" className="mt-6">
          <ArchiveTab
            seasons={(seasons as Season[]) || []}
            isLoading={isLoadingSeasons}
          />
        </TabsContent>

        <TabsContent value="collections" className="mt-6">
          <CollectionsTab
            collections={(collections as Collection[]) || []}
            isLoading={isLoadingCollections}
            partyId={partyId}
            onSave={(data) => {
              upsertCollectionsMutation.mutate(
                { partyId, collections: data },
                {
                  onSuccess: () => toast({ title: "تم حفظ مواعيد التحصيل" }),
                  onError: (error) => toast({ title: getErrorMessage(error), variant: "destructive" }),
                }
              );
            }}
            onStatusChange={(id, status) => {
              updateCollectionStatusMutation.mutate({ id, status, partyId });
            }}
            onReminder={(id) => {
              markReminderMutation.mutate(
                { id, partyId },
                {
                  onSuccess: () => toast({ title: "تم إرسال التذكير" }),
                }
              );
            }}
            isSaving={upsertCollectionsMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <TimelineTab
            items={(timeline as TimelineItem[]) || []}
            isLoading={isLoadingTimeline}
          />
        </TabsContent>
      </Tabs>

      <EditPartyDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        party={partyData}
        onSubmit={(data) => {
          updateMutation.mutate(
            { id: partyId, data },
            {
              onSuccess: () => {
                toast({ title: "تم تحديث البيانات بنجاح" });
                setIsEditDialogOpen(false);
              },
              onError: (error) => {
                toast({ title: getErrorMessage(error), variant: "destructive" });
              },
            }
          );
        }}
        isLoading={updateMutation.isPending}
      />

      <PaymentDialog
        open={isPaymentDialogOpen}
        onOpenChange={setIsPaymentDialogOpen}
        partyId={partyId}
        partyName={partyData.name}
        onSubmit={(data) => {
          createPaymentMutation.mutate(data, {
            onSuccess: () => {
              toast({ title: "تم تسجيل السداد بنجاح" });
              setIsPaymentDialogOpen(false);
            },
            onError: (error) => {
              toast({ title: getErrorMessage(error), variant: "destructive" });
            },
          });
        }}
        isLoading={createPaymentMutation.isPending}
      />

      <SettlementDialog
        open={isSettlementDialogOpen}
        onOpenChange={setIsSettlementDialogOpen}
        partyId={partyId}
        partyName={partyData.name}
        currentBalance={currentBalance}
        onSubmit={(data) => {
          createSettlementMutation.mutate(
            { partyId, data },
            {
              onSuccess: () => {
                toast({ title: "تمت التسوية بنجاح" });
                setIsSettlementDialogOpen(false);
              },
              onError: (error) => {
                toast({ title: getErrorMessage(error), variant: "destructive" });
              },
            }
          );
        }}
        isLoading={createSettlementMutation.isPending}
      />

      {/* Invoice Creation Dialog */}
      <Dialog
        open={isInvoiceDialogOpen}
        onOpenChange={(val) => {
          if (!val) resetInvoiceForm();
          setIsInvoiceDialogOpen(val);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>فاتورة جديدة - {partyData.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>نوع الفاتورة</Label>
                <RadioGroup
                  value={invoiceKind}
                  onValueChange={setInvoiceKind}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <RadioGroupItem value="purchase" id="purchase" />
                    <Label htmlFor="purchase">شراء</Label>
                  </div>
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <RadioGroupItem value="return" id="return" />
                    <Label htmlFor="return">مرتجع</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>التاريخ</Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-lg font-bold">الأصناف</Label>
                <Button type="button" size="sm" onClick={addInvoiceLine}>
                  <Plus className="w-4 h-4 ml-1" />
                  إضافة صنف
                </Button>
              </div>

              {invoiceLines.map((line, idx) => {
                const error = getLineError(line);
                return (
                  <div key={idx} className="border rounded-lg p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>نوع المنتج</Label>
                        <Select
                          value={line.productTypeId?.toString() || ""}
                          onValueChange={(val) =>
                            updateInvoiceLine(idx, { productTypeId: parseInt(val) })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="اختر المنتج" />
                          </SelectTrigger>
                          <SelectContent>
                            {productTypes?.map((pt) => (
                              <SelectItem key={pt.id} value={pt.id.toString()}>
                                {pt.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>الكمية</Label>
                        <Input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) =>
                            updateInvoiceLine(idx, {
                              quantity: parseInt(e.target.value) || 0,
                            })
                          }
                        />
                        {error && (
                          <p className="text-xs text-red-500">{error}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>الوحدة</Label>
                        <Select
                          value={line.unit}
                          onValueChange={(val) =>
                            updateInvoiceLine(idx, {
                              unit: val as "piece" | "dozen",
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="piece">قطعة</SelectItem>
                            <SelectItem value="dozen">دستة</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>السعر</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPriceEgp}
                          onChange={(e) =>
                            updateInvoiceLine(idx, {
                              unitPriceEgp: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        إجمالي السطر: {lineTotal(line).toFixed(2)} ج.م
                      </span>
                      {invoiceLines.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => removeInvoiceLine(idx)}
                        >
                          حذف
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t pt-4">
              <div className="text-xl font-bold text-left">
                الإجمالي: {invoiceTotal.toFixed(2)} ج.م
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsInvoiceDialogOpen(false)}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleInvoiceSubmit}
                disabled={
                  createInvoiceMutation.isPending ||
                  invoiceLines.some((l) => !l.productTypeId || l.quantity <= 0) ||
                  hasDozenValidationErrors
                }
              >
                {createInvoiceMutation.isPending ? "جاري الحفظ..." : "حفظ الفاتورة"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OverviewTab({
  party,
  summary,
  currentBalance,
  onSettlement,
  notifications,
  onDismissNotification,
}: {
  party: Party;
  summary: any;
  currentBalance: number;
  onSettlement: () => void;
  notifications: Notification[];
  onDismissNotification: (id: number) => void;
}) {
  const isDebit = currentBalance > 0;
  const isCredit = currentBalance < 0;

  return (
    <div className="space-y-6">
      {notifications && notifications.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-amber-800 flex items-center gap-2">
              <Bell className="w-5 h-5" />
              تنبيهات التحصيل
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  notification.type === "collection_overdue"
                    ? "bg-red-100 border border-red-200"
                    : "bg-amber-100 border border-amber-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  {notification.type === "collection_overdue" ? (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  ) : (
                    <Clock className="w-5 h-5 text-amber-600" />
                  )}
                  <div>
                    <p className={`font-medium ${
                      notification.type === "collection_overdue" ? "text-red-800" : "text-amber-800"
                    }`}>
                      {notification.title}
                    </p>
                    {notification.message && (
                      <p className={`text-sm ${
                        notification.type === "collection_overdue" ? "text-red-600" : "text-amber-600"
                      }`}>
                        {notification.message}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDismissNotification(notification.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <CheckCircle className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>معلومات الملف</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {party.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">الهاتف:</span>
                <span dir="ltr">{party.phone}</span>
              </div>
            )}
            {party.whatsapp && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-green-600" />
                <span className="text-muted-foreground">واتساب:</span>
                <span dir="ltr">{party.whatsapp}</span>
              </div>
            )}
            {(party.addressArea || party.addressGovernorate) && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">العنوان:</span>
                <span>{[party.addressArea, party.addressGovernorate].filter(Boolean).join("، ")}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">شروط الدفع:</span>
              <span>{party.paymentTerms === "cash" ? "كاش" : "آجل"}</span>
              {party.paymentTerms === "credit" && party.creditLimitMode === "limited" && (
                <span className="text-muted-foreground">
                  (حد: {formatCurrency(party.creditLimitAmountEgp)} ج.م)
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">الرصيد الحالي:</span>
              <span className={`text-xl font-bold ${isDebit ? "text-red-600" : isCredit ? "text-green-600" : ""}`}>
                {formatCurrency(Math.abs(currentBalance))} ج.م
                {isDebit && " (عليه)"}
                {isCredit && " (له)"}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={onSettlement}>
              <Archive className="w-4 h-4 ml-1" />
              تسوية الموسم
            </Button>
          </div>
        </CardContent>
      </Card>

      {summary?.recentActivity && summary.recentActivity.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>آخر الحركات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {summary.recentActivity.slice(0, 5).map((activity: any, index: number) => (
                <div key={index} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      {activity.type === 'invoice' && <FileSpreadsheet className="w-4 h-4" />}
                      {activity.type === 'payment' && <CreditCard className="w-4 h-4" />}
                      {activity.type === 'return' && <RefreshCcw className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="font-medium">{activity.title}</p>
                      <p className="text-sm text-muted-foreground">{formatDate(activity.date)}</p>
                    </div>
                  </div>
                  {activity.amount && (
                    <span className="font-mono">{formatCurrency(activity.amount)} ج.م</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InvoicesTab({
  invoices,
  isLoading,
  statusFilter,
  setStatusFilter,
  kindFilter,
  setKindFilter,
  partyId,
  onNewInvoice,
}: {
  invoices: Invoice[];
  isLoading: boolean;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  kindFilter: string;
  setKindFilter: (value: string) => void;
  partyId: number;
  onNewInvoice: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label>الحالة:</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="pending">معلقة</SelectItem>
              <SelectItem value="partial">مستلمة جزئياً</SelectItem>
              <SelectItem value="received">مستلمة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label>النوع:</Label>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="purchase">شراء</SelectItem>
              <SelectItem value="return">مرتجع</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={onNewInvoice}>
          <Plus className="w-4 h-4 ml-1" />
          فاتورة جديدة
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم الفاتورة</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">الإجمالي</TableHead>
                <TableHead className="text-right">المدفوع</TableHead>
                <TableHead className="text-right">المتبقي</TableHead>
                <TableHead className="text-right">حالة السداد</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    لا توجد فواتير
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice: any) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono">{invoice.invoiceNumber || invoice.referenceNumber}</TableCell>
                    <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                    <TableCell>
                      <Badge variant={invoice.invoiceKind === "purchase" ? "default" : "secondary"}>
                        {invoice.invoiceKind === "purchase" ? "شراء" : invoice.invoiceKind === "sale" ? "بيع" : "مرتجع"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{formatCurrency(invoice.totalEgp)} ج.م</TableCell>
                    <TableCell className="font-mono text-green-600">{formatCurrency(invoice.paidAmount || '0')} ج.م</TableCell>
                    <TableCell className="font-mono text-orange-600">{formatCurrency(invoice.remainingAmount || invoice.totalEgp)} ج.م</TableCell>
                    <TableCell>
                      {invoice.paymentStatus === 'paid' ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">مسدد</Badge>
                      ) : invoice.paymentStatus === 'partial' ? (
                        <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">جزئي</Badge>
                      ) : (
                        <Badge variant="outline">غير مسدد</Badge>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function PaymentsTab({
  payments,
  isLoading,
  onNewPayment,
  invoices,
}: {
  payments: Payment[];
  isLoading: boolean;
  onNewPayment: () => void;
  invoices?: any[];
}) {
  // Create a map of invoice ID to reference number for quick lookup
  const invoiceMap = new Map((invoices || []).map((inv: any) => [inv.id, inv.referenceNumber]));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={onNewPayment}>
          <Plus className="w-4 h-4 ml-1" />
          سداد جديد
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">المبلغ</TableHead>
                <TableHead className="text-right">طريقة الدفع</TableHead>
                <TableHead className="text-right">الفاتورة المرتبطة</TableHead>
                <TableHead className="text-right">ملاحظات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    لا توجد مدفوعات
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((payment: any) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                    <TableCell className="font-mono">{formatCurrency(payment.amountEgp)} ج.م</TableCell>
                    <TableCell>
                      {payment.paymentMethod === "cash" ? "نقداً" : 
                       payment.paymentMethod === "bank" ? "تحويل بنكي" : payment.paymentMethod}
                    </TableCell>
                    <TableCell className="font-mono">
                      {payment.invoiceId ? (
                        <Badge variant="outline" className="text-xs">
                          {invoiceMap.get(payment.invoiceId) || `#${payment.invoiceId}`}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{payment.notes || "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ReturnsTab({
  returnCases,
  isLoading,
  statusFilter,
  setStatusFilter,
}: {
  returnCases: ReturnCase[];
  isLoading: boolean;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label>الحالة:</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="pending">معلقة</SelectItem>
              <SelectItem value="resolved">تم الحل</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم الفاتورة</TableHead>
                <TableHead className="text-right">السبب</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">نوع الحل</TableHead>
                <TableHead className="text-right">مبلغ التسوية</TableHead>
                <TableHead className="text-right">تاريخ الإنشاء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returnCases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    لا توجد حالات هوامش
                  </TableCell>
                </TableRow>
              ) : (
                returnCases.map((rc) => (
                  <TableRow key={rc.id}>
                    <TableCell className="font-mono">{rc.invoiceNumber || rc.invoiceId}</TableCell>
                    <TableCell>{rc.reason}</TableCell>
                    <TableCell>{getReturnStatusBadge(rc.status)}</TableCell>
                    <TableCell>
                      {rc.resolutionType === "refund" ? "استرداد" :
                       rc.resolutionType === "replacement" ? "استبدال" :
                       rc.resolutionType === "credit" ? "رصيد" : "-"}
                    </TableCell>
                    <TableCell className="font-mono">
                      {rc.resolutionAmountEgp ? `${formatCurrency(rc.resolutionAmountEgp)} ج.م` : "-"}
                    </TableCell>
                    <TableCell>{formatDate(rc.createdAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function LedgerTab({ 
  entries, 
  partyData, 
  currentBalance 
}: { 
  entries: LedgerEntry[]; 
  partyData: Party; 
  currentBalance: number; 
}) {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    return entries.filter((entry) => {
      if (dateFrom && entry.entryDate < dateFrom) return false;
      if (dateTo && entry.entryDate > dateTo) return false;
      return true;
    });
  }, [entries, dateFrom, dateTo]);

  const getReferenceTypeArabic = (type: string | null | undefined) => {
    if (!type) return "-";
    const types: Record<string, string> = {
      invoice: "فاتورة",
      payment: "دفعة",
      return: "مرتجع",
      adjustment: "تسوية",
      opening_balance: "رصيد افتتاحي",
    };
    return types[type] || type;
  };

  const handleExportPDF = async () => {
    if (!filteredEntries || filteredEntries.length === 0) {
      toast({
        title: "لا توجد بيانات",
        description: "لا توجد حركات لتصديرها",
        variant: "destructive",
      });
      return;
    }

    const { jsPDF } = await import("jspdf");
    await import("jspdf-autotable");
    
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    doc.setFontSize(20);
    doc.text(`كشف حساب - ${partyData.name}`, doc.internal.pageSize.getWidth() - 15, 20, { align: "right" });
    
    doc.setFontSize(12);
    let yPos = 30;
    if (partyData.shopName) {
      doc.text(partyData.shopName, doc.internal.pageSize.getWidth() - 15, yPos, { align: "right" });
      yPos += 8;
    }
    doc.text(`الهاتف: ${partyData.phone || "-"}`, doc.internal.pageSize.getWidth() - 15, yPos, { align: "right" });
    yPos += 8;
    if (partyData.addressArea || partyData.addressGovernorate) {
      doc.text(`العنوان: ${[partyData.addressArea, partyData.addressGovernorate].filter(Boolean).join("، ")}`, doc.internal.pageSize.getWidth() - 15, yPos, { align: "right" });
      yPos += 8;
    }
    if (dateFrom || dateTo) {
      const dateRangeText = `الفترة: ${dateFrom ? new Date(dateFrom).toLocaleDateString("ar-EG") : "البداية"} - ${dateTo ? new Date(dateTo).toLocaleDateString("ar-EG") : "الآن"}`;
      doc.text(dateRangeText, doc.internal.pageSize.getWidth() - 15, yPos, { align: "right" });
      yPos += 8;
    }
    doc.text(`تاريخ التصدير: ${new Date().toLocaleDateString("ar-EG")}`, doc.internal.pageSize.getWidth() - 15, yPos, { align: "right" });
    
    const tableData = filteredEntries.map(entry => {
      const balance = parseFloat(entry.balanceEgp || "0");
      const balanceText = `${formatCurrency(Math.abs(balance))} ${balance > 0 ? "(مدين)" : balance < 0 ? "(دائن)" : ""}`;
      return [
        balanceText,
        parseFloat(entry.creditEgp || "0") > 0 ? formatCurrency(entry.creditEgp) : "-",
        parseFloat(entry.debitEgp || "0") > 0 ? formatCurrency(entry.debitEgp) : "-",
        entry.description || "-",
        new Date(entry.entryDate).toLocaleDateString("ar-EG"),
      ];
    });
    
    (doc as any).autoTable({
      head: [["الرصيد", "دائن", "مدين", "البيان", "التاريخ"]],
      body: tableData,
      startY: yPos + 10,
      theme: "grid",
      headStyles: {
        fillColor: [66, 66, 66],
        halign: "right",
      },
      bodyStyles: {
        halign: "right",
      },
      columnStyles: {
        0: { halign: "center" },
        1: { halign: "center" },
        2: { halign: "center" },
      },
    });
    
    const finalY = (doc as any).lastAutoTable.finalY || yPos + 10;
    doc.setFontSize(14);
    doc.text(
      `الرصيد النهائي: ${formatCurrency(Math.abs(currentBalance))} ج.م ${currentBalance > 0 ? "(عليه)" : currentBalance < 0 ? "(له)" : ""}`,
      doc.internal.pageSize.getWidth() - 15,
      finalY + 15,
      { align: "right" }
    );
    
    doc.save(`كشف-حساب-${partyData.name}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleExportCSV = () => {
    if (!filteredEntries || filteredEntries.length === 0) {
      toast({
        title: "لا توجد بيانات",
        description: "لا توجد حركات لتصديرها",
        variant: "destructive",
      });
      return;
    }

    const headers = ["التاريخ", "البيان", "مدين", "دائن", "الرصيد"];
    const rows = filteredEntries.map(entry => {
      const balance = parseFloat(entry.balanceEgp || "0");
      const balanceText = `${Math.abs(balance)} ${balance > 0 ? "(مدين)" : balance < 0 ? "(دائن)" : ""}`;
      return [
        new Date(entry.entryDate).toLocaleDateString("ar-EG"),
        (entry.description || "").replace(/,/g, "،"),
        parseFloat(entry.debitEgp || "0") > 0 ? entry.debitEgp : "",
        parseFloat(entry.creditEgp || "0") > 0 ? entry.creditEgp : "",
        balanceText,
      ];
    });
    
    const csvContent = [headers, ...rows]
      .map(row => row.join(","))
      .join("\n");
    
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `كشف-حساب-${partyData.name}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label>من:</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label>إلى:</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileDown className="w-4 h-4 ml-1" />
            تصدير PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <FileDown className="w-4 h-4 ml-1" />
            تصدير CSV
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">البيان</TableHead>
              <TableHead className="text-right">مدين</TableHead>
              <TableHead className="text-right">دائن</TableHead>
              <TableHead className="text-right">الرصيد</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  لا توجد حركات
                </TableCell>
              </TableRow>
            ) : (
              filteredEntries.map((entry) => {
                const balance = parseFloat(entry.balanceEgp || "0");
                return (
                  <TableRow key={entry.id}>
                    <TableCell>{formatDate(entry.entryDate)}</TableCell>
                    <TableCell>{entry.description}</TableCell>
                    <TableCell className="font-mono text-red-600">
                      {parseFloat(entry.debitEgp || "0") > 0 ? formatCurrency(entry.debitEgp) : "-"}
                    </TableCell>
                    <TableCell className="font-mono text-green-600">
                      {parseFloat(entry.creditEgp || "0") > 0 ? formatCurrency(entry.creditEgp) : "-"}
                    </TableCell>
                    <TableCell className={`font-mono ${balance > 0 ? "text-red-600" : balance < 0 ? "text-green-600" : ""}`}>
                      {formatCurrency(Math.abs(balance))} {balance > 0 ? "(مدين)" : balance < 0 ? "(دائن)" : ""}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ArchiveTab({
  seasons,
  isLoading,
}: {
  seasons: Season[];
  isLoading: boolean;
}) {
  const pastSeasons = useMemo(() => {
    if (!seasons) return [];
    return seasons.filter((s) => s.endedAt);
  }, [seasons]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        المواسم السابقة التي تمت تسويتها
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : pastSeasons.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-lg">
          لا توجد مواسم سابقة
        </div>
      ) : (
        <div className="space-y-4">
          {pastSeasons.map((season) => (
            <Card key={season.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{season.seasonName}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">تاريخ البداية:</span>
                    <p className="font-medium">{formatDate(season.startedAt)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">تاريخ النهاية:</span>
                    <p className="font-medium">{formatDate(season.endedAt)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">رصيد البداية:</span>
                    <p className={`font-medium ${season.openingBalanceType === "debit" ? "text-red-600" : "text-green-600"}`}>
                      {formatCurrency(season.openingBalanceEgp)} ج.م
                      {season.openingBalanceType === "debit" ? " (مدين)" : " (دائن)"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">رصيد النهاية:</span>
                    <p className={`font-medium ${season.closingBalanceType === "debit" ? "text-red-600" : "text-green-600"}`}>
                      {formatCurrency(season.closingBalanceEgp)} ج.م
                      {season.closingBalanceType === "debit" ? " (مدين)" : " (دائن)"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CollectionsTab({
  collections,
  isLoading,
  partyId,
  onSave,
  onStatusChange,
  onReminder,
  isSaving,
}: {
  collections: Collection[];
  isLoading: boolean;
  partyId: number;
  onSave: (data: Array<{ collectionOrder: number; collectionDate: string; amountEgp?: string; notes?: string }>) => void;
  onStatusChange: (id: number, status: string, linkedPaymentId?: number) => void;
  onReminder: (id: number) => void;
  isSaving: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Array<{
    collectionOrder: number;
    collectionDate: string;
    amountEgp: string;
    notes: string;
  }>>([
    { collectionOrder: 1, collectionDate: "", amountEgp: "", notes: "" },
    { collectionOrder: 2, collectionDate: "", amountEgp: "", notes: "" },
    { collectionOrder: 3, collectionDate: "", amountEgp: "", notes: "" },
    { collectionOrder: 4, collectionDate: "", amountEgp: "", notes: "" },
  ]);

  const [collectionForPayment, setCollectionForPayment] = useState<Collection | null>(null);
  const [isCollectionPaymentOpen, setIsCollectionPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("نقدي");
  const [paymentNote, setPaymentNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (collections.length > 0 && !isEditing) {
      const newData = [1, 2, 3, 4].map(order => {
        const existing = collections.find(c => c.collectionOrder === order);
        return {
          collectionOrder: order,
          collectionDate: existing?.collectionDate || "",
          amountEgp: existing?.amountEgp || "",
          notes: existing?.notes || "",
        };
      });
      setFormData(newData);
    }
  }, [collections, isEditing]);

  useEffect(() => {
    if (collectionForPayment) {
      setPaymentAmount(collectionForPayment.amountEgp || "0");
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setPaymentMethod("نقدي");
      setPaymentNote("");
    }
  }, [collectionForPayment]);

  const handleOpenPaymentDialog = (collection: Collection) => {
    setCollectionForPayment(collection);
    setIsCollectionPaymentOpen(true);
  };

  const handleCollectionPayment = async () => {
    if (!collectionForPayment) return;
    setIsSubmitting(true);
    
    try {
      // Create payment with linked collection ID
      const paymentRes = await fetch("/api/local-trade/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          partyId: partyId,
          paymentDate: paymentDate,
          amountEgp: parseFloat(paymentAmount),
          paymentMethod: paymentMethod,
          notes: paymentNote || `تحصيل مجدول`,
          linkedCollectionId: collectionForPayment.id,
        }),
      });
      
      if (!paymentRes.ok) {
        const errorText = await paymentRes.text();
        throw new Error(errorText);
      }
      
      const payment = await paymentRes.json();
      const paymentId = payment.id;
      
      if (!paymentId) {
        throw new Error("لم يتم إرجاع معرف الدفعة");
      }
      
      // Mark collection as collected with linked payment ID
      const updateRes = await fetch(`/api/local-trade/collections/${collectionForPayment.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          status: "collected",
          linkedPaymentId: paymentId,
        }),
      });
      
      if (!updateRes.ok) {
        const errorText = await updateRes.text();
        throw new Error(errorText);
      }
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/parties", partyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/collections"] });
      
      toast({
        title: "تم التحصيل",
        description: "تم تسجيل الدفعة وتحديث موعد التحصيل",
      });
      
      setIsCollectionPaymentOpen(false);
      setCollectionForPayment(null);
    } catch (error: any) {
      console.error("Error creating collection payment:", error);
      toast({
        title: "خطأ",
        description: error.message || "حدث خطأ أثناء تسجيل الدفعة",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSave = () => {
    const validData = formData.filter(d => d.collectionDate);
    onSave(validData);
    setIsEditing(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "collected":
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case "postponed":
        return <AlertCircle className="w-5 h-5 text-amber-500" />;
      default:
        return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "collected": return "تم التحصيل";
      case "postponed": return "مؤجل";
      default: return "في الانتظار";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">مواعيد التحصيل (4 مواعيد متتالية)</h3>
        {!isEditing ? (
          <Button variant="outline" onClick={() => setIsEditing(true)}>
            <Edit className="w-4 h-4 ml-2" />
            تعديل المواعيد
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "جاري الحفظ..." : "حفظ"}
            </Button>
            <Button variant="outline" onClick={() => setIsEditing(false)}>إلغاء</Button>
          </div>
        )}
      </div>

      <div className="grid gap-4">
        {[1, 2, 3, 4].map(order => {
          const existing = collections.find(c => c.collectionOrder === order);
          const formItem = formData.find(f => f.collectionOrder === order);

          if (isEditing) {
            return (
              <Card key={order}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">الموعد {order}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label>التاريخ</Label>
                      <Input
                        type="date"
                        value={formItem?.collectionDate || ""}
                        onChange={(e) => setFormData(prev => 
                          prev.map(p => p.collectionOrder === order 
                            ? { ...p, collectionDate: e.target.value } 
                            : p
                          )
                        )}
                      />
                    </div>
                    <div>
                      <Label>المبلغ المتوقع (ج.م)</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={formItem?.amountEgp || ""}
                        onChange={(e) => setFormData(prev => 
                          prev.map(p => p.collectionOrder === order 
                            ? { ...p, amountEgp: e.target.value } 
                            : p
                          )
                        )}
                      />
                    </div>
                    <div>
                      <Label>ملاحظات</Label>
                      <Input
                        placeholder="ملاحظات..."
                        value={formItem?.notes || ""}
                        onChange={(e) => setFormData(prev => 
                          prev.map(p => p.collectionOrder === order 
                            ? { ...p, notes: e.target.value } 
                            : p
                          )
                        )}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          }

          if (!existing) {
            return (
              <Card key={order} className="opacity-50">
                <CardContent className="py-4 text-center text-muted-foreground">
                  الموعد {order} - غير محدد
                </CardContent>
              </Card>
            );
          }

          return (
            <Card key={order} className={existing.status === "collected" ? "border-green-200 bg-green-50" : ""}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(existing.status)}
                    <div>
                      <div className="font-medium">الموعد {order}: {formatDate(existing.collectionDate)}</div>
                      {existing.amountEgp && (
                        <div className="text-sm text-muted-foreground">
                          المبلغ المتوقع: {formatCurrency(existing.amountEgp)} ج.م
                        </div>
                      )}
                      {existing.notes && (
                        <div className="text-sm text-muted-foreground">{existing.notes}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={existing.status === "collected" ? "default" : "secondary"}>
                      {getStatusLabel(existing.status)}
                    </Badge>
                    {existing.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onReminder(existing.id)}
                          disabled={existing.reminderSent}
                          title={existing.reminderSent ? "تم إرسال التذكير" : "إرسال تذكير"}
                        >
                          <Bell className={`w-4 h-4 ${existing.reminderSent ? "text-green-600" : ""}`} />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenPaymentDialog(existing)}
                          title="تسجيل دفعة وتحصيل"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={isCollectionPaymentOpen} onOpenChange={setIsCollectionPaymentOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تسجيل دفعة التحصيل</DialogTitle>
            <DialogDescription>
              سيتم تسجيل دفعة وربطها بموعد التحصيل
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>المبلغ (ج.م)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>التاريخ</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>طريقة الدفع</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="نقدي">نقدي</SelectItem>
                  <SelectItem value="تحويل بنكي">تحويل بنكي</SelectItem>
                  <SelectItem value="إنستاباي">إنستاباي</SelectItem>
                  <SelectItem value="فودافون كاش">فودافون كاش</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder={`تحصيل مجدول بتاريخ ${collectionForPayment?.collectionDate || ""}`}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsCollectionPaymentOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleCollectionPayment} disabled={isSubmitting || !paymentAmount || parseFloat(paymentAmount) <= 0}>
              {isSubmitting ? "جاري الحفظ..." : "تسجيل الدفعة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TimelineTab({
  items,
  isLoading,
}: {
  items: TimelineItem[];
  isLoading: boolean;
}) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case "invoice":
        return <FileSpreadsheet className="w-5 h-5 text-blue-600" />;
      case "payment":
        return <CreditCard className="w-5 h-5 text-green-600" />;
      case "return":
        return <RefreshCcw className="w-5 h-5 text-amber-600" />;
      case "collection":
        return <Bell className="w-5 h-5 text-purple-600" />;
      default:
        return <Clock className="w-5 h-5" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "invoice": return "فاتورة";
      case "payment": return "سداد";
      case "return": return "مرتجع";
      case "collection": return "تحصيل";
      default: return type;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>لا توجد حركات مسجلة</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">سجل الحركات</h3>
      <div className="relative">
        <div className="absolute right-4 top-0 bottom-0 w-0.5 bg-border" />
        <div className="space-y-4">
          {items.map((item, index) => (
            <div key={`${item.type}-${item.id}`} className="relative flex gap-4 pr-8">
              <div className="absolute right-2 w-4 h-4 rounded-full bg-background border-2 border-primary" />
              <Card className="flex-1">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getTypeIcon(item.type)}
                      <div>
                        <div className="font-medium">{item.title}</div>
                        {item.description && (
                          <div className="text-sm text-muted-foreground">{item.description}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-sm text-muted-foreground">{formatDate(item.date)}</div>
                      {item.amount && parseFloat(item.amount) > 0 && (
                        <div className="font-mono font-medium">{formatCurrency(item.amount)} ج.م</div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditPartyDialog({
  open,
  onOpenChange,
  party,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  party: Party;
  onSubmit: (data: Record<string, unknown>) => void;
  isLoading: boolean;
}) {
  const [formPaymentTerms, setFormPaymentTerms] = useState(party.paymentTerms);
  const [formCreditLimitMode, setFormCreditLimitMode] = useState(party.creditLimitMode);

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
      nextCollectionDate: (formData.get("nextCollectionDate") as string) || null,
      nextCollectionAmountEgp: formData.get("nextCollectionAmountEgp")
        ? parseFloat(formData.get("nextCollectionAmountEgp") as string)
        : null,
      nextCollectionNote: (formData.get("nextCollectionNote") as string) || null,
      isActive: formData.get("isActive") === "on",
    };

    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل بيانات الملف</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <Label>نوع الملف *</Label>
            <RadioGroup name="type" defaultValue={party.type} className="flex gap-6">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="merchant" id="edit-merchant" />
                <Label htmlFor="edit-merchant" className="cursor-pointer">تاجر</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="customer" id="edit-customer" />
                <Label htmlFor="edit-customer" className="cursor-pointer">عميل</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="both" id="edit-both" />
                <Label htmlFor="edit-both" className="cursor-pointer">مزدوج</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">الاسم *</Label>
              <Input id="edit-name" name="name" defaultValue={party.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-shopName">اسم المحل</Label>
              <Input id="edit-shopName" name="shopName" defaultValue={party.shopName || ""} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-phone">الهاتف</Label>
              <Input id="edit-phone" name="phone" defaultValue={party.phone || ""} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-whatsapp">واتساب</Label>
              <Input id="edit-whatsapp" name="whatsapp" defaultValue={party.whatsapp || ""} dir="ltr" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-addressArea">المنطقة</Label>
              <Input id="edit-addressArea" name="addressArea" defaultValue={party.addressArea || ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-addressGovernorate">المحافظة</Label>
              <Input id="edit-addressGovernorate" name="addressGovernorate" defaultValue={party.addressGovernorate || ""} />
            </div>
          </div>

          <div className="space-y-3">
            <Label>شروط الدفع</Label>
            <RadioGroup
              name="paymentTerms"
              defaultValue={party.paymentTerms}
              onValueChange={setFormPaymentTerms}
              className="flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="cash" id="edit-cash" />
                <Label htmlFor="edit-cash" className="cursor-pointer">كاش</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="credit" id="edit-credit" />
                <Label htmlFor="edit-credit" className="cursor-pointer">آجل</Label>
              </div>
            </RadioGroup>
          </div>

          {formPaymentTerms === "credit" && (
            <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
              <Label>حد الائتمان</Label>
              <RadioGroup
                name="creditLimitMode"
                defaultValue={party.creditLimitMode}
                onValueChange={setFormCreditLimitMode}
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="unlimited" id="edit-unlimited" />
                  <Label htmlFor="edit-unlimited" className="cursor-pointer">غير محدود</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="limited" id="edit-limited" />
                  <Label htmlFor="edit-limited" className="cursor-pointer">محدود</Label>
                </div>
              </RadioGroup>
              {formCreditLimitMode === "limited" && (
                <div className="space-y-2">
                  <Label htmlFor="edit-creditLimitAmountEgp">حد الائتمان (ج.م)</Label>
                  <Input
                    id="edit-creditLimitAmountEgp"
                    name="creditLimitAmountEgp"
                    type="number"
                    step="0.01"
                    defaultValue={party.creditLimitAmountEgp || ""}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch id="edit-isActive" name="isActive" defaultChecked={party.isActive} />
            <Label htmlFor="edit-isActive">نشط</Label>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "جاري الحفظ..." : "حفظ التغييرات"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({
  open,
  onOpenChange,
  partyId,
  partyName,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partyId: number;
  partyName: string;
  onSubmit: (data: Record<string, unknown>) => void;
  isLoading: boolean;
}) {
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");

  // Fetch invoices for this party with payment info
  const { data: invoices } = useLocalInvoices({ partyId });
  
  // Filter to show only invoices with remaining balance
  const unpaidInvoices = (invoices || []).filter((inv: any) => 
    parseFloat(inv.remainingAmount || inv.totalEgp) > 0 && inv.status !== 'draft'
  );

  const handleInvoiceChange = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    if (invoiceId) {
      const invoice = unpaidInvoices.find((inv: any) => inv.id.toString() === invoiceId);
      if (invoice) {
        // Auto-fill with remaining amount
        const remaining = parseFloat((invoice as any).remainingAmount || invoice.totalEgp);
        setAmount(remaining.toFixed(2));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;

    onSubmit({
      partyId,
      paymentDate,
      amountEgp: parseFloat(amount),
      paymentMethod,
      notes: notes || null,
      invoiceId: selectedInvoiceId ? parseInt(selectedInvoiceId) : null,
    });
  };

  const resetForm = () => {
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setAmount("");
    setPaymentMethod("cash");
    setNotes("");
    setSelectedInvoiceId("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) resetForm();
        onOpenChange(val);
      }}
    >
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>سداد جديد - {partyName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Invoice Selection */}
          <div className="space-y-2">
            <Label>ربط بفاتورة (اختياري)</Label>
            <Select value={selectedInvoiceId || "none"} onValueChange={(val) => handleInvoiceChange(val === "none" ? "" : val)}>
              <SelectTrigger>
                <SelectValue placeholder="اختر فاتورة للربط" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون ربط بفاتورة</SelectItem>
                {unpaidInvoices.map((invoice: any) => (
                  <SelectItem key={invoice.id} value={invoice.id.toString()}>
                    {invoice.referenceNumber} - {invoice.invoiceKind === 'purchase' ? 'شراء' : 'بيع'} | المتبقي: {formatCurrency((invoice as any).remainingAmount || invoice.totalEgp)} ج.م
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {unpaidInvoices.length === 0 && (
              <p className="text-xs text-muted-foreground">لا توجد فواتير مستحقة</p>
            )}
          </div>

          {/* Selected invoice summary */}
          {selectedInvoiceId && (
            <div className="bg-muted/50 p-3 rounded-lg text-sm space-y-1">
              {(() => {
                const invoice = unpaidInvoices.find((inv: any) => inv.id.toString() === selectedInvoiceId);
                if (!invoice) return null;
                return (
                  <>
                    <div className="flex justify-between">
                      <span>إجمالي الفاتورة:</span>
                      <span className="font-mono">{formatCurrency(invoice.totalEgp)} ج.م</span>
                    </div>
                    <div className="flex justify-between">
                      <span>المدفوع:</span>
                      <span className="font-mono text-green-600">{formatCurrency((invoice as any).paidAmount || '0')} ج.م</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>المتبقي:</span>
                      <span className="font-mono text-orange-600">{formatCurrency((invoice as any).remainingAmount || invoice.totalEgp)} ج.م</span>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="paymentDate">التاريخ</Label>
            <Input
              id="paymentDate"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">المبلغ (ج.م)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>طريقة الدفع</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">نقداً</SelectItem>
                <SelectItem value="bank">تحويل بنكي</SelectItem>
                <SelectItem value="check">شيك</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">ملاحظات</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={isLoading || !amount}>
              {isLoading ? "جاري الحفظ..." : "تسجيل السداد"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SettlementDialog({
  open,
  onOpenChange,
  partyId,
  partyName,
  currentBalance,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partyId: number;
  partyName: string;
  currentBalance: number;
  onSubmit: (data: Record<string, unknown>) => void;
  isLoading: boolean;
}) {
  const [seasonName, setSeasonName] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!seasonName.trim()) return;

    onSubmit({
      seasonName,
      notes: notes || null,
    });
  };

  const resetForm = () => {
    setSeasonName("");
    setNotes("");
  };

  const isDebit = currentBalance > 0;
  const isCredit = currentBalance < 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) resetForm();
        onOpenChange(val);
      }}
    >
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>تسوية الموسم - {partyName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-4 border rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground">الرصيد الحالي:</p>
            <p className={`text-2xl font-bold ${isDebit ? "text-red-600" : isCredit ? "text-green-600" : ""}`}>
              {formatCurrency(Math.abs(currentBalance))} ج.م
              {isDebit && " (مدين)"}
              {isCredit && " (دائن)"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="seasonName">اسم الموسم *</Label>
              <Input
                id="seasonName"
                value={seasonName}
                onChange={(e) => setSeasonName(e.target.value)}
                placeholder="مثال: موسم 2024"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settlementNotes">ملاحظات</Label>
              <Textarea
                id="settlementNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={isLoading || !seasonName.trim()}>
                {isLoading ? "جاري التسوية..." : "تسوية الموسم"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
