import { useState, useMemo, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
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
  Trash2,
  Eye,
  Package,
  AlertTriangle,
  Camera,
  Printer,
  XCircle,
  CheckCheck,
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
  usePartyLedger,
  useUpdateParty,
  useDeleteParty,
  useLocalInvoices,
  useLocalPayments,
  useReturnCases,
  usePartySeasons,
  useCreateLocalPayment,
  useCreateLocalInvoice,
  useCreateSettlement,
  useCreateReturnCase,
  useResolveReturnCase,
  usePartyCollections,
  usePartyTimeline,
  useUpsertPartyCollections,
  useUpdateCollectionStatus,
  useMarkCollectionReminder,
  useNotifications,
  useCheckDueCollections,
  useMarkNotificationRead,
  useLocalInvoice,
  useReceiveInvoice,
  useUpdateInvoiceStatus,
} from "@/hooks/use-local-trade";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import type { ProductType } from "@shared/schema";

interface CreateInvoiceLineInput {
  productTypeId: number | null;
  quantity: number;
  unit: "piece" | "dozen";
  unitPriceEgp: number;
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
  entryType?: string | null;
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

function getStatusBadge(status: string, invoiceKind?: string) {
  switch (status) {
    case "draft":
    case "posted":
      if (invoiceKind === "purchase") {
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">في الطريق</Badge>;
      }
      return <Badge variant="secondary" className="bg-purple-100 text-purple-800">مرسلة</Badge>;
    case "pending":
      return <Badge variant="secondary">معلقة</Badge>;
    case "partially_received":
    case "partial":
      return <Badge variant="outline" className="border-amber-500 text-amber-600">مستلمة جزئياً</Badge>;
    case "received":
      return <Badge variant="default" className="bg-green-600">مستلمة</Badge>;
    case "cancelled":
      return <Badge variant="destructive">ملغاة</Badge>;
    case "archived":
      return <Badge variant="outline">مؤرشفة</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getReturnStatusBadge(status: string) {
  switch (status) {
    case "pending":
    case "under_inspection":
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">تحت الفحص</Badge>;
    case "resolved":
      return <Badge variant="default" className="bg-green-600 text-white">تم الحل</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getResolutionLabel(resolution: string | null) {
  switch (resolution) {
    case "accepted_return": return "إرجاع مقبول";
    case "exchange": return "استبدال";
    case "deduct_value": return "خصم قيمة";
    case "damaged": return "شطب تالف";
    case "rejected": return "مرفوض";
    default: return "-";
  }
}

export default function PartyProfilePage() {
  const params = useParams();
  const partyId = params.id ? parseInt(params.id) : 0;
  const [, navigate] = useLocation();
  
  const [activeTab, setActiveTab] = useState("overview");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isSettlementDialogOpen, setIsSettlementDialogOpen] = useState(false);
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCreateReturnDialogOpen, setIsCreateReturnDialogOpen] = useState(false);
  const [isResolveReturnDialogOpen, setIsResolveReturnDialogOpen] = useState(false);
  const [selectedReturnCase, setSelectedReturnCase] = useState<any | null>(null);
  
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
  const { data: ledgerData } = usePartyLedger(partyId);
  
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
  
  const { user } = useAuth();
  const isAdmin = user?.role === "مدير";
  
  const updateMutation = useUpdateParty();
  const deletePartyMutation = useDeleteParty();
  const createPaymentMutation = useCreateLocalPayment();
  const createSettlementMutation = useCreateSettlement();
  const createInvoiceMutation = useCreateLocalInvoice();
  const createReturnMutation = useCreateReturnCase();
  const resolveReturnMutation = useResolveReturnCase();
  
  const { data: productTypes } = useQuery<ProductType[]>({
    queryKey: ["/api/product-types"],
  });

  const { data: collections, isLoading: isLoadingCollections } = usePartyCollections(partyId);
  const { data: timeline, isLoading: isLoadingTimeline } = usePartyTimeline(partyId);
  const upsertCollectionsMutation = useUpsertPartyCollections();
  const updateCollectionStatusMutation = useUpdateCollectionStatus();
  const markReminderMutation = useMarkCollectionReminder();

  const partyData = party as Party | undefined;
  const ledgerEntries = (ledgerData as LedgerEntry[]) || [];

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

  const profileData = profile as { balance?: { balanceEgp: string; direction: string } } | undefined;
  const balanceInfo = profileData?.balance;
  const currentBalance = balanceInfo
    ? (balanceInfo.direction === "debit"
        ? parseFloat(balanceInfo.balanceEgp)
        : balanceInfo.direction === "credit"
        ? -parseFloat(balanceInfo.balanceEgp)
        : 0)
    : 0;
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

  const getLineError = (_line: CreateInvoiceLineInput): string | null => null;

  const handleInvoiceSubmit = () => {
    if (invoiceLines.some((l) => !l.productTypeId || l.quantity <= 0)) return;

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
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Link href="/local-trade/parties" className="hover:text-foreground">
            الملفات
          </Link>
          <span>/</span>
          <span>{partyData.name}</span>
        </div>

        {/* Main Header */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={partyData.imageUrl || undefined} />
              <AvatarFallback className="text-xl bg-primary/10 text-primary">
                {partyData.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="text-right">
              <div className="flex items-center gap-2">
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
              <div className="flex items-center gap-3 mt-1 text-sm">
                {partyData.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    <span dir="ltr">{partyData.phone}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
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
            <Button size="sm" variant="outline" onClick={() => navigate(`/local-trade/invoices/new?partyId=${partyId}`)}>
              <FileSpreadsheet className="w-4 h-4 ml-1" />
              فاتورة جديدة
            </Button>
            <Button size="icon" variant="outline" className="h-8 w-8" title="تعديل" onClick={() => setIsEditDialogOpen(true)}>
              <Edit className="w-4 h-4" />
            </Button>
            {isAdmin && (
              <Button size="icon" variant="outline" className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/40" title="حذف" onClick={() => setIsDeleteDialogOpen(true)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
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
          <div className="text-xs text-muted-foreground">هوامش تحت الفحص</div>
          <div className="text-lg font-bold text-amber-600">{formatCurrency(summary?.kpis?.underInspectionEgp || 0)} ج.م</div>
          {(summary?.kpis?.pendingReturnsCount || 0) > 0 && (
            <div className="text-xs text-amber-500 mt-0.5">{summary.kpis.pendingReturnsCount} حالة مفتوحة</div>
          )}
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
            partyType={partyData?.type}
            onNewInvoice={() => navigate(`/local-trade/invoices/new?partyId=${partyId}`)}
          />
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <PaymentsTab
            payments={(payments as any[]) || []}
            isLoading={isLoadingPayments}
            onNewPayment={() => setIsPaymentDialogOpen(true)}
            invoices={(invoices as any[]) || []}
            partyData={partyData}
            summary={summary}
            currentBalance={currentBalance}
          />
        </TabsContent>

        <TabsContent value="returns" className="mt-6">
          <ReturnsTab
            returnCases={(returnCases as any[]) || []}
            isLoading={isLoadingReturns}
            statusFilter={returnStatusFilter}
            setStatusFilter={setReturnStatusFilter}
            onAddReturn={() => setIsCreateReturnDialogOpen(true)}
            invoices={(invoices as any[]) || []}
            onResolve={(rc) => {
              setSelectedReturnCase(rc);
              setIsResolveReturnDialogOpen(true);
            }}
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

      <CreatePartyReturnDialog
        open={isCreateReturnDialogOpen}
        onOpenChange={setIsCreateReturnDialogOpen}
        partyId={partyId}
        partyName={partyData.name}
        invoices={(invoices as Invoice[]) || []}
        onSubmit={(data) => {
          createReturnMutation.mutate(data, {
            onSuccess: () => {
              toast({ title: "تم إنشاء حالة الهامش بنجاح" });
              setIsCreateReturnDialogOpen(false);
            },
            onError: (error) => {
              toast({ title: getErrorMessage(error), variant: "destructive" });
            },
          });
        }}
        isLoading={createReturnMutation.isPending}
      />

      <ResolveReturnCaseDialog
        open={isResolveReturnDialogOpen}
        onOpenChange={(v) => {
          setIsResolveReturnDialogOpen(v);
          if (!v) setSelectedReturnCase(null);
        }}
        returnCase={selectedReturnCase}
        isLoading={resolveReturnMutation.isPending}
        onSubmit={(id, data) => {
          resolveReturnMutation.mutate({ id, data }, {
            onSuccess: () => {
              toast({ title: "تم تسوية حالة الهامش بنجاح" });
              setIsResolveReturnDialogOpen(false);
              setSelectedReturnCase(null);
            },
            onError: (error) => {
              toast({ title: getErrorMessage(error), variant: "destructive" });
            },
          });
        }}
      />

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              حذف الملف
            </DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف ملف "{partyData.name}"؟ سيتم حذف جميع البيانات المرتبطة به (الفواتير، المدفوعات، الهوامش، إلخ). هذا الإجراء لا يمكن التراجع عنه.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deletePartyMutation.mutate(partyId, {
                  onSuccess: () => {
                    toast({ title: "تم حذف الملف بنجاح" });
                    navigate("/local-trade/parties");
                  },
                  onError: (error) => {
                    toast({ title: getErrorMessage(error), variant: "destructive" });
                  },
                });
              }}
              disabled={deletePartyMutation.isPending}
            >
              {deletePartyMutation.isPending ? "جاري الحذف..." : "تأكيد الحذف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                        {line.unit === "dozen" && line.quantity > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {(line.quantity / 12).toFixed(2)} دستة
                          </p>
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
                  invoiceLines.some((l) => !l.productTypeId || l.quantity <= 0)
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
          <CardTitle className="text-right">معلومات الملف</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" dir="rtl">
            {party.phone && (
              <div className="flex items-center gap-2" dir="ltr">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">الهاتف:</span>
                <span dir="ltr">{party.phone}</span>
              </div>
            )}
            {party.whatsapp && (
              <div className="flex items-center gap-2" dir="ltr">
                <Phone className="w-4 h-4 text-green-600" />
                <span className="text-muted-foreground">واتساب:</span>
                <span dir="ltr">{party.whatsapp}</span>
              </div>
            )}
            {(party.addressArea || party.addressGovernorate) && (
              <div className="flex items-center gap-2" dir="ltr">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">العنوان:</span>
                <span>{[party.addressArea, party.addressGovernorate].filter(Boolean).join("، ")}</span>
              </div>
            )}
            <div className="flex items-center gap-2" dir="ltr">
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

          <div className="flex flex-wrap items-center gap-4 pt-4 border-t" dir="rtl">
            <div className="flex items-center gap-2" dir="ltr">
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

function ViewInvoiceDialog({
  invoiceId,
  onClose,
}: {
  invoiceId: number | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useLocalInvoice(invoiceId || 0);
  const invoiceData = data as { invoice: any; lines: any[] } | undefined;
  const inv = invoiceData?.invoice;
  const lines = invoiceData?.lines || [];

  const totalCartons = lines.reduce((s: number, l: any) => s + (l.cartons || 0), 0);
  const totalPieces = lines.reduce((s: number, l: any) => s + (l.totalPieces || 0), 0);

  return (
    <Dialog open={!!invoiceId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            تفاصيل الفاتورة
            {inv && <span className="font-mono text-muted-foreground">- {inv.referenceNumber}</span>}
          </DialogTitle>
          <DialogDescription>عرض بيانات الفاتورة وبنودها</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : inv ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/30 p-4 rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground">رقم الفاتورة</p>
                <p className="font-mono font-semibold">{inv.referenceNumber}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">التاريخ</p>
                <p>{formatDate(inv.invoiceDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">النوع</p>
                <Badge variant={inv.invoiceKind === "purchase" ? "default" : "secondary"}>
                  {inv.invoiceKind === "purchase" ? "شراء" : inv.invoiceKind === "sale" ? "بيع" : "مرتجع"}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">الحالة</p>
                {getStatusBadge(inv.status, inv.invoiceKind)}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-3 text-center">
                <div className="text-xl font-bold">{lines.length}</div>
                <div className="text-xs text-muted-foreground">عدد البنود</div>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-xl font-bold">{totalCartons.toLocaleString("ar-EG")}</div>
                <div className="text-xs text-muted-foreground">الكراتين</div>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-xl font-bold">{totalPieces.toLocaleString("ar-EG")}</div>
                <div className="text-xs text-muted-foreground">القطع</div>
              </Card>
              <Card className="p-3 text-center bg-primary/5">
                <div className="text-xl font-bold text-primary">{formatCurrency(inv.totalEgp)}</div>
                <div className="text-xs text-muted-foreground">الإجمالي (ج.م)</div>
              </Card>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-center">
                <p className="text-xs text-muted-foreground mb-1">المدفوع</p>
                <p className="font-mono font-semibold text-green-700">{formatCurrency(inv.paidAmount || '0')} ج.م</p>
              </div>
              <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-center">
                <p className="text-xs text-muted-foreground mb-1">المتبقي</p>
                <p className="font-mono font-semibold text-orange-700">{formatCurrency(inv.remainingAmount || inv.totalEgp)} ج.م</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-xs text-muted-foreground mb-1">حالة السداد</p>
                {inv.paymentStatus === 'paid' ? (
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">مسدد بالكامل</Badge>
                ) : inv.paymentStatus === 'partial' ? (
                  <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">مسدد جزئياً</Badge>
                ) : (
                  <Badge variant="outline">غير مسدد</Badge>
                )}
              </div>
            </div>

            {lines.length > 0 && (
              <div>
                <p className="font-semibold mb-2 text-sm">بنود الفاتورة</p>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right text-xs">المنتج</TableHead>
                        <TableHead className="text-right text-xs">الكراتين</TableHead>
                        <TableHead className="text-right text-xs">المطلوب</TableHead>
                        {inv.status === 'received' && (
                          <>
                            <TableHead className="text-right text-xs">المستلم</TableHead>
                            <TableHead className="text-right text-xs">النواقص</TableHead>
                          </>
                        )}
                        <TableHead className="text-right text-xs">سعر الوحدة</TableHead>
                        <TableHead className="text-right text-xs">الإجمالي</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line: any, idx: number) => {
                        const received = line.receivedPieces ?? line.totalPieces;
                        const shortage = line.totalPieces - received;
                        return (
                          <TableRow key={line.id || idx} className={inv.status === 'received' && shortage > 0 ? "bg-destructive/5" : ""}>
                            <TableCell className="text-sm font-medium">{line.productName}</TableCell>
                            <TableCell className="font-mono text-sm">{line.cartons}</TableCell>
                            <TableCell className="font-mono text-sm">{line.totalPieces}</TableCell>
                            {inv.status === 'received' && (
                              <>
                                <TableCell className="font-mono text-sm text-green-700">{received}</TableCell>
                                <TableCell className="font-mono text-sm">
                                  {shortage > 0 ? (
                                    <Badge variant="destructive" className="text-xs">{shortage} ناقص</Badge>
                                  ) : (
                                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">
                                      <CheckCircle className="w-3 h-3 ml-1" />تمام
                                    </Badge>
                                  )}
                                </TableCell>
                              </>
                            )}
                            <TableCell className="font-mono text-sm">{formatCurrency(line.unitPriceEgp)} ج.م</TableCell>
                            <TableCell className="font-mono text-sm font-semibold">{formatCurrency(line.lineTotalEgp)} ج.م</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {inv.status === 'received' && lines.some((l: any) => (l.totalPieces - (l.receivedPieces ?? l.totalPieces)) > 0) && (
                  <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    يوجد نواقص في هذه الفاتورة — تم إنشاء حالات هامش تلقائية، راجع تبويب الهوامش
                  </div>
                )}
              </div>
            )}

            {inv.notes && (
              <div className="p-3 rounded-lg bg-muted/30 text-sm">
                <span className="font-semibold">ملاحظات: </span>{inv.notes}
              </div>
            )}
          </div>
        ) : (
          <p className="text-center py-8 text-muted-foreground">لا يمكن تحميل الفاتورة</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReceiveInvoiceDialogLocal({
  invoiceId,
  onClose,
}: {
  invoiceId: number | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useLocalInvoice(invoiceId || 0);
  const receiveInvoice = useReceiveInvoice();
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [lineReceipts, setLineReceipts] = useState<Record<number, number>>({});

  const invoiceData = data as { invoice: any; lines: any[] } | undefined;
  const inv = invoiceData?.invoice;
  const lines = invoiceData?.lines || [];

  useEffect(() => {
    if (lines.length > 0) {
      const initial: Record<number, number> = {};
      lines.forEach((l: any) => { if (l.id !== undefined) initial[l.id] = l.totalPieces; });
      setLineReceipts(initial);
    }
  }, [lines.length]);

  const totalShortage = lines.reduce((sum: number, line: any) => {
    const received = lineReceipts[line.id] ?? line.totalPieces;
    return sum + (line.totalPieces - received);
  }, 0);

  const handleSubmit = () => {
    if (!invoiceId) return;
    const receiptsArray = Object.entries(lineReceipts).map(([lineId, receivedPieces]) => ({
      lineId: parseInt(lineId),
      receivedPieces,
    }));
    receiveInvoice.mutate(
      { id: invoiceId, data: { notes: notes || null, lineReceipts: receiptsArray } },
      {
        onSuccess: () => {
          toast({ title: "تم الاستلام بنجاح" });
          setNotes("");
          setLineReceipts({});
          onClose();
        },
        onError: (err: any) => {
          toast({ title: "خطأ في الاستلام", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={!!invoiceId} onOpenChange={(open) => { if (!open) { setNotes(""); setLineReceipts({}); onClose(); } }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            استلام الفاتورة
            {inv && <span className="font-mono text-muted-foreground">- {inv.referenceNumber}</span>}
          </DialogTitle>
          <DialogDescription>أدخل الكميات المستلمة فعلياً لكل بند</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {totalShortage > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <AlertTriangle className="w-4 h-4" />
                سيتم إنشاء {totalShortage} قيد هامش تلقائياً للنواقص
              </div>
            )}

            {lines.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-12 gap-2 p-3 bg-muted/50 border-b text-xs font-medium text-muted-foreground">
                  <div className="col-span-4">المنتج</div>
                  <div className="col-span-2 text-center">المطلوب</div>
                  <div className="col-span-3 text-center">المستلم</div>
                  <div className="col-span-3 text-center">النواقص</div>
                </div>
                {lines.map((line: any, idx: number) => {
                  const lineId = line.id as number;
                  const received = lineReceipts[lineId] ?? line.totalPieces;
                  const shortage = line.totalPieces - received;
                  return (
                    <div key={line.id || idx} className={`grid grid-cols-12 gap-2 p-3 items-center border-b last:border-b-0 ${shortage > 0 ? "bg-destructive/5" : ""}`}>
                      <div className="col-span-4 flex items-center gap-2">
                        {line.imageUrl ? (
                          <img src={line.imageUrl} className="w-8 h-8 object-cover rounded border" alt="" />
                        ) : (
                          <div className="w-8 h-8 rounded border bg-muted flex items-center justify-center">
                            <Camera className="w-3 h-3 text-muted-foreground" />
                          </div>
                        )}
                        <span className="text-sm font-medium truncate">{line.productName}</span>
                      </div>
                      <div className="col-span-2 text-center font-mono text-sm">{line.totalPieces}</div>
                      <div className="col-span-3">
                        <Input
                          type="number"
                          min={0}
                          max={line.totalPieces}
                          value={received}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(parseInt(e.target.value) || 0, line.totalPieces));
                            setLineReceipts(prev => ({ ...prev, [lineId]: val }));
                          }}
                          className={`h-8 text-sm text-center font-mono ${shortage > 0 ? "border-destructive" : ""}`}
                        />
                      </div>
                      <div className="col-span-3 text-center">
                        {shortage > 0 ? (
                          <Badge variant="destructive" className="text-xs">{shortage} ناقص</Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">
                            <CheckCircle className="w-3 h-3 ml-1" />تمام
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center py-4 text-muted-foreground text-sm">لا توجد بنود في هذه الفاتورة</p>
            )}

            <div>
              <Label>ملاحظات (اختياري)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أي ملاحظات عن الاستلام..."
                className="mt-1"
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>إلغاء</Button>
              <Button onClick={handleSubmit} disabled={receiveInvoice.isPending || lines.length === 0}>
                {receiveInvoice.isPending ? "جارٍ الحفظ..." : "تأكيد الاستلام"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
  partyType,
  onNewInvoice,
}: {
  invoices: Invoice[];
  isLoading: boolean;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  kindFilter: string;
  setKindFilter: (value: string) => void;
  partyId: number;
  partyType?: string;
  onNewInvoice: () => void;
}) {
  const [viewInvoiceId, setViewInvoiceId] = useState<number | null>(null);
  const [receiveInvoiceId, setReceiveInvoiceId] = useState<number | null>(null);
  const updateStatus = useUpdateInvoiceStatus();
  const { toast } = useToast();

  const handleConfirmDelivery = (invoiceId: number) => {
    updateStatus.mutate({ id: invoiceId, status: "received" }, {
      onSuccess: () => toast({ title: "تم تأكيد التسليم" }),
      onError: () => toast({ title: "خطأ", variant: "destructive" }),
    });
  };

  const handleCancel = (invoiceId: number) => {
    if (!confirm("هل أنت متأكد من إلغاء هذه الفاتورة؟")) return;
    updateStatus.mutate({ id: invoiceId, status: "cancelled" }, {
      onSuccess: () => toast({ title: "تم إلغاء الفاتورة" }),
      onError: () => toast({ title: "خطأ", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label>الحالة:</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="posted">في الطريق / مرسلة</SelectItem>
              <SelectItem value="received">مستلمة</SelectItem>
              <SelectItem value="partially_received">مستلمة جزئياً</SelectItem>
              <SelectItem value="cancelled">ملغاة</SelectItem>
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
              <SelectItem value="sale">بيع</SelectItem>
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
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    لا توجد فواتير
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice: any) => (
                  <TableRow key={invoice.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-sm">{invoice.referenceNumber || invoice.invoiceNumber}</TableCell>
                    <TableCell className="text-sm">{formatDate(invoice.invoiceDate)}</TableCell>
                    <TableCell>
                      <Badge variant={invoice.invoiceKind === "purchase" ? "default" : invoice.invoiceKind === "sale" ? "secondary" : "outline"}>
                        {invoice.invoiceKind === "purchase" ? "شراء" : invoice.invoiceKind === "sale" ? "بيع" : "مرتجع"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatCurrency(invoice.totalEgp)} ج.م</TableCell>
                    <TableCell className="font-mono text-sm text-green-600">{formatCurrency(invoice.paidAmount || '0')} ج.م</TableCell>
                    <TableCell className="font-mono text-sm text-orange-600">{formatCurrency(invoice.remainingAmount || invoice.totalEgp)} ج.م</TableCell>
                    <TableCell>
                      {invoice.paymentStatus === 'paid' ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">مسدد</Badge>
                      ) : invoice.paymentStatus === 'partial' ? (
                        <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 text-xs">جزئي</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">غير مسدد</Badge>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(invoice.status, invoice.invoiceKind)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setViewInvoiceId(invoice.id)}
                          title="عرض تفاصيل الفاتورة"
                        >
                          <Eye className="w-3.5 h-3.5 ml-1" />
                          عرض
                        </Button>
                        {invoice.invoiceKind === "purchase" && (invoice.status === "posted" || invoice.status === "draft") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => setReceiveInvoiceId(invoice.id)}
                            title="استلام الفاتورة"
                          >
                            <Package className="w-3.5 h-3.5 ml-1" />
                            استلام
                          </Button>
                        )}
                        {(invoice.invoiceKind === "sale" || invoice.invoiceKind === "sale_no_stock") && (invoice.status === "posted" || invoice.status === "draft") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => handleConfirmDelivery(invoice.id)}
                            disabled={updateStatus.isPending}
                            title="تأكيد التسليم للعميل"
                          >
                            <CheckCheck className="w-3.5 h-3.5 ml-1" />
                            تسليم
                          </Button>
                        )}
                        {(invoice.status === "posted" || invoice.status === "draft") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleCancel(invoice.id)}
                            disabled={updateStatus.isPending}
                            title="إلغاء الفاتورة"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <ViewInvoiceDialog
        invoiceId={viewInvoiceId}
        onClose={() => setViewInvoiceId(null)}
      />
      <ReceiveInvoiceDialogLocal
        invoiceId={receiveInvoiceId}
        onClose={() => setReceiveInvoiceId(null)}
      />
    </div>
  );
}

function PaymentsTab({
  payments,
  isLoading,
  onNewPayment,
  invoices,
  partyData,
  summary,
  currentBalance,
}: {
  payments: any[];
  isLoading: boolean;
  onNewPayment: () => void;
  invoices?: any[];
  partyData?: any;
  summary?: any;
  currentBalance?: number;
}) {
  const [receiptPayment, setReceiptPayment] = useState<any>(null);
  const invoiceMap = new Map((invoices || []).map((inv: any) => [inv.id, inv]));

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
                <TableHead className="text-right">الفواتير المسددة (FIFO)</TableHead>
                <TableHead className="text-right">ملاحظات</TableHead>
                <TableHead className="text-right w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    لا توجد مدفوعات
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((payment: any) => {
                  const allocations: any[] = payment.allocations || [];
                  return (
                    <TableRow key={payment.id}>
                      <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                      <TableCell className="font-mono font-semibold">{formatCurrency(payment.amountEgp)} ج.م</TableCell>
                      <TableCell>{payment.paymentMethod || "نقدي"}</TableCell>
                      <TableCell>
                        {allocations.length === 0 ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {allocations.map((alloc: any) => {
                              const inv = invoiceMap.get(alloc.invoiceId);
                              const label = inv ? inv.referenceNumber : `#${alloc.invoiceId}`;
                              return (
                                <span
                                  key={alloc.id}
                                  className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700"
                                  title={`${formatCurrency(alloc.amountEgp)} ج.م`}
                                >
                                  {label}
                                  <span className="font-mono text-blue-500">
                                    {formatCurrency(alloc.amountEgp)}
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{payment.notes || "-"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title="طباعة إيصال"
                          onClick={() => setReceiptPayment(payment)}
                        >
                          <Printer className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <PaymentReceiptDialog
        open={!!receiptPayment}
        onOpenChange={(val) => { if (!val) setReceiptPayment(null); }}
        payment={receiptPayment}
        party={partyData}
        invoiceMap={invoiceMap}
        summary={summary}
        currentBalance={currentBalance ?? 0}
      />
    </div>
  );
}

function PaymentReceiptDialog({
  open,
  onOpenChange,
  payment,
  party,
  invoiceMap,
  summary,
  currentBalance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: any;
  party: any;
  invoiceMap: Map<number, any>;
  summary: any;
  currentBalance: number;
}) {
  if (!payment) return null;

  const allocations: any[] = payment.allocations || [];
  const balance = Math.abs(currentBalance);
  const balanceDir = currentBalance > 0 ? "عليه" : currentBalance < 0 ? "له" : "صفر";

  const handlePrint = () => {
    const printContent = document.getElementById("payment-receipt-content");
    if (!printContent) return;
    const win = window.open("", "_blank", "width=400,height=700");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8"/>
        <title>إيصال سداد #${payment.id}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Cairo', 'Tahoma', Arial, sans-serif;
            font-size: 13px;
            color: #111;
            background: #fff;
            width: 80mm;
            padding: 8px;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .large { font-size: 22px; }
          .xlarge { font-size: 28px; }
          .small { font-size: 11px; }
          .muted { color: #666; }
          .green { color: #16a34a; }
          .red { color: #dc2626; }
          .row { display: flex; justify-content: space-between; margin: 3px 0; }
          .divider { border-top: 1px dashed #aaa; margin: 8px 0; }
          .divider-solid { border-top: 1px solid #333; margin: 8px 0; }
          .receipt-box { border: 1px solid #ddd; border-radius: 4px; padding: 8px; margin-bottom: 8px; }
          .amount-box { background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 12px; margin-bottom: 8px; text-align: center; }
          .alloc-badge { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; border-radius: 3px; padding: 2px 5px; margin: 1px; display: inline-block; }
          .summary-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; margin-bottom: 8px; }
          .summary-total { border-top: 1px solid #d1d5db; margin-top: 6px; padding-top: 6px; font-weight: bold; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="center" style="margin-bottom:10px">
          <div class="xlarge bold" style="letter-spacing:2px">TRACKER</div>
          <div class="small muted">نظام إدارة التجارة المحلية</div>
        </div>

        <div class="divider-solid"></div>

        <div class="center" style="margin-bottom:10px">
          <span class="bold" style="background:#f3f4f6;padding:3px 10px;border-radius:4px;border:1px solid #e5e7eb;">
            إيصال سداد رقم #${payment.id}
          </span>
        </div>

        <div class="receipt-box">
          <div class="row"><span class="muted">العميل / التاجر:</span><span class="bold">${party?.name || ""}</span></div>
          ${party?.shopName ? `<div class="row"><span class="muted">اسم المحل:</span><span>${party.shopName}</span></div>` : ""}
          ${party?.phone ? `<div class="row"><span class="muted">الهاتف:</span><span dir="ltr">${party.phone}</span></div>` : ""}
          ${party?.addressArea ? `<div class="row"><span class="muted">المنطقة:</span><span>${party.addressArea}${party.addressGovernorate ? " - " + party.addressGovernorate : ""}</span></div>` : ""}
        </div>

        <div class="receipt-box">
          <div class="row"><span class="muted">تاريخ السداد:</span><span>${payment.paymentDate || ""}</span></div>
          <div class="row"><span class="muted">طريقة الدفع:</span><span class="bold">${payment.paymentMethod || "نقدي"}</span></div>
          ${payment.notes ? `<div class="row"><span class="muted">ملاحظات:</span><span>${payment.notes}</span></div>` : ""}
        </div>

        ${allocations.length > 0 ? `
        <div class="receipt-box">
          <div class="small muted bold" style="margin-bottom:5px">الفواتير المسددة:</div>
          ${allocations.map((alloc: any) => {
            const inv = invoiceMap.get(alloc.invoiceId);
            const label = inv?.referenceNumber || `فاتورة #${alloc.invoiceId}`;
            const amount = parseFloat(alloc.amountEgp || "0").toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return `<div class="row"><span class="alloc-badge">${label}</span><span style="font-family:monospace">${amount} ج.م</span></div>`;
          }).join("")}
        </div>` : ""}

        <div class="amount-box">
          <div class="small muted" style="margin-bottom:4px">المبلغ المدفوع</div>
          <div class="xlarge bold green" style="font-family:monospace">
            ${parseFloat(payment.amountEgp || "0").toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span style="font-size:14px"> ج.م</span>
          </div>
        </div>

        <div class="summary-box">
          <div class="small muted bold" style="margin-bottom:5px">ملخص الحساب:</div>
          <div class="row"><span>إجمالي الفواتير:</span><span style="font-family:monospace">${parseFloat(summary?.kpis?.totalInvoicesEgp || "0").toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</span></div>
          <div class="row green"><span>إجمالي المدفوع:</span><span style="font-family:monospace">${parseFloat(summary?.kpis?.totalPaidEgp || "0").toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</span></div>
          <div class="summary-total row ${currentBalance > 0 ? "red" : "green"}">
            <span>الرصيد المتبقي:</span>
            <span style="font-family:monospace">${balance.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م (${balanceDir})</span>
          </div>
        </div>

        <div class="divider"></div>
        <div class="center small muted">
          <div>شكراً لتعاملكم معنا</div>
          <div style="margin-top:4px">${new Date().toLocaleString("ar-EG")}</div>
        </div>
      </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  const getTypeLabel = (type: string) =>
    type === "merchant" ? "تاجر" : type === "customer" ? "عميل" : "مزدوج";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 overflow-hidden" dir="rtl">
        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          <DialogTitle className="text-center text-base">إيصال سداد رقم #{payment.id}</DialogTitle>
        </DialogHeader>

        <div id="payment-receipt-content" className="px-4 py-3 space-y-3 max-h-[75vh] overflow-y-auto">
          {/* Store Header */}
          <div className="text-center border-b pb-3">
            <div className="text-2xl font-black tracking-widest">TRACKER</div>
            <div className="text-xs text-muted-foreground">نظام إدارة التجارة المحلية</div>
          </div>

          {/* Party Info */}
          <div className="bg-muted/40 rounded-lg p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">العميل / التاجر:</span>
              <span className="font-bold">{party?.name}</span>
            </div>
            {party?.shopName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">اسم المحل:</span>
                <span>{party.shopName}</span>
              </div>
            )}
            {party?.phone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">الهاتف:</span>
                <span dir="ltr" className="font-mono text-xs">{party.phone}</span>
              </div>
            )}
            {party?.type && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">النوع:</span>
                <span>{getTypeLabel(party.type)}</span>
              </div>
            )}
          </div>

          {/* Payment Details */}
          <div className="bg-muted/40 rounded-lg p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">تاريخ السداد:</span>
              <span>{formatDate(payment.paymentDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">طريقة الدفع:</span>
              <span className="font-semibold">{payment.paymentMethod || "نقدي"}</span>
            </div>
            {payment.notes && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">ملاحظات:</span>
                <span className="text-right text-xs">{payment.notes}</span>
              </div>
            )}
          </div>

          {/* Allocations */}
          {allocations.length > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <div className="text-xs font-semibold text-blue-700 mb-2">الفواتير المسددة:</div>
              <div className="space-y-1.5">
                {allocations.map((alloc: any) => {
                  const inv = invoiceMap.get(alloc.invoiceId);
                  const label = inv?.referenceNumber || `فاتورة #${alloc.invoiceId}`;
                  return (
                    <div key={alloc.id} className="flex justify-between text-sm">
                      <span className="inline-flex items-center rounded border border-blue-200 bg-white px-2 py-0.5 text-xs text-blue-700 font-medium">
                        {label}
                      </span>
                      <span className="font-mono font-semibold text-blue-800">
                        {formatCurrency(alloc.amountEgp)} ج.م
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Big Amount */}
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 text-center">
            <div className="text-xs text-green-600 mb-1 font-medium">المبلغ المدفوع</div>
            <div className="text-4xl font-black text-green-700 font-mono leading-none">
              {formatCurrency(payment.amountEgp)}
            </div>
            <div className="text-base text-green-600 mt-1">جنيه مصري</div>
          </div>

          {/* Account Summary */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              ملخص الحساب
            </div>
            <div className="p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">إجمالي الفواتير:</span>
                <span className="font-mono">{formatCurrency(summary?.kpis?.totalInvoicesEgp || 0)} ج.م</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">إجمالي المدفوع:</span>
                <span className="font-mono text-green-600 font-semibold">
                  {formatCurrency(summary?.kpis?.totalPaidEgp || 0)} ج.م
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between font-bold text-base">
                <span>الرصيد المتبقي:</span>
                <span className={`font-mono ${currentBalance > 0 ? "text-red-600" : currentBalance < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                  {formatCurrency(balance)} ج.م
                  <span className="text-sm font-normal mr-1">({balanceDir})</span>
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-muted-foreground border-t pt-3 pb-1">
            <div className="font-medium">شكراً لتعاملكم معنا</div>
            <div className="mt-0.5">{new Date().toLocaleString("ar-EG")}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 pt-2 border-t flex gap-2">
          <Button onClick={handlePrint} className="flex-1 gap-1">
            <Printer className="w-4 h-4" />
            طباعة الإيصال
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReturnsTab({
  returnCases,
  isLoading,
  statusFilter,
  setStatusFilter,
  onAddReturn,
  invoices,
  onResolve,
}: {
  returnCases: any[];
  isLoading: boolean;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  onAddReturn: () => void;
  invoices?: any[];
  onResolve?: (rc: any) => void;
}) {
  const invoiceMap = new Map((invoices || []).map((inv: any) => [inv.id, inv.referenceNumber]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Label>الحالة:</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="under_inspection">تحت الفحص</SelectItem>
              <SelectItem value="resolved">تم الحل</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={onAddReturn}>
          <Plus className="w-4 h-4 ml-1" />
          هامش يدوي جديد
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
                <TableHead className="text-right">الفاتورة المصدر</TableHead>
                <TableHead className="text-right">الملاحظات</TableHead>
                <TableHead className="text-right">القطع</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">نوع الحل</TableHead>
                <TableHead className="text-right">مبلغ الهامش</TableHead>
                <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                <TableHead className="text-right">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returnCases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    لا توجد حالات هوامش
                  </TableCell>
                </TableRow>
              ) : (
                returnCases.map((rc: any) => (
                  <TableRow key={rc.id}>
                    <TableCell className="font-mono text-xs">
                      {rc.sourceInvoiceId
                        ? (invoiceMap.get(rc.sourceInvoiceId) || `#${rc.sourceInvoiceId}`)
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-32 truncate">{rc.notes || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{rc.pieces || 0}</TableCell>
                    <TableCell>{getReturnStatusBadge(rc.status)}</TableCell>
                    <TableCell>
                      {rc.status === 'resolved' ? (
                        <span className="text-xs">{getResolutionLabel(rc.resolution)}</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="font-mono">
                      {parseFloat(rc.amountEgp || '0') > 0 ? (
                        <span className={rc.status === 'resolved' ? "text-green-700" : "text-amber-700"}>
                          {formatCurrency(rc.amountEgp)} ج.م
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(rc.createdAt)}</TableCell>
                    <TableCell>
                      {rc.status === 'under_inspection' && onResolve ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 px-2"
                          onClick={() => onResolve(rc)}
                        >
                          تسوية
                        </Button>
                      ) : (
                        rc.resolvedAt ? (
                          <span className="text-xs text-muted-foreground">{formatDate(rc.resolvedAt)}</span>
                        ) : null
                      )}
                    </TableCell>
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

function ResolveReturnCaseDialog({
  open,
  onOpenChange,
  returnCase,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  returnCase: any | null;
  onSubmit: (id: number, data: Record<string, unknown>) => void;
  isLoading: boolean;
}) {
  const [resolution, setResolution] = useState("deduct_value");
  const [amountEgp, setAmountEgp] = useState("");
  const [pieces, setPieces] = useState("");
  const [cartons, setCartons] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (returnCase) {
      setPieces(String(returnCase.pieces || ""));
      setCartons(String(returnCase.cartons || ""));
      setAmountEgp("");
      setNote("");
      setResolution("deduct_value");
    }
  }, [returnCase]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnCase) return;
    onSubmit(returnCase.id, {
      resolution,
      amountEgp: parseFloat(amountEgp) || 0,
      pieces: parseInt(pieces) || 0,
      cartons: parseInt(cartons) || 0,
      resolutionNote: note || null,
    });
  };

  if (!returnCase) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>تسوية حالة هامش</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
            <p><span className="text-muted-foreground">الملاحظات:</span> {returnCase.notes || "—"}</p>
            <p><span className="text-muted-foreground">القطع:</span> {returnCase.pieces || 0}</p>
          </div>

          <div className="space-y-2">
            <Label>نوع التسوية *</Label>
            <Select value={resolution} onValueChange={setResolution}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deduct_value">خصم قيمة من الفاتورة</SelectItem>
                <SelectItem value="accepted_return">إرجاع مقبول</SelectItem>
                <SelectItem value="exchange">استبدال</SelectItem>
                <SelectItem value="damaged">شطب تالف</SelectItem>
                <SelectItem value="rejected">مرفوض</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(resolution === "deduct_value" || resolution === "accepted_return") && (
            <div className="space-y-2">
              <Label>المبلغ (ج.م) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amountEgp}
                onChange={(e) => setAmountEgp(e.target.value)}
                placeholder="0.00"
                required
              />
              {resolution === "deduct_value" && (
                <p className="text-xs text-blue-600">
                  {returnCase.sourceInvoiceId
                    ? "سيتم خصم هذا المبلغ من رصيد الفاتورة المصدر تلقائياً"
                    : "سيتم تسجيل المبلغ في كشف الحساب كخصم"}
                </p>
              )}
              {resolution === "accepted_return" && (
                <p className="text-xs text-green-700">
                  {returnCase.sourceInvoiceId
                    ? "سيتم خصم قيمة المرتجع من رصيد الفاتورة المصدر"
                    : "سيتم تسجيل المرتجع في كشف الحساب"}
                </p>
              )}
            </div>
          )}

          {resolution === "exchange" && (
            <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
              الاستبدال لا يؤثر على الرصيد — سيتم تسجيل الحالة فقط
            </p>
          )}
          {resolution === "damaged" && (
            <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
              الشطب التالف لا يؤثر على الرصيد — سيتم تسجيل الحالة فقط
            </p>
          )}
          {resolution === "rejected" && (
            <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
              الرفض لا يؤثر على الرصيد — سيتم إغلاق الحالة بدون تسوية مالية
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>القطع</Label>
              <Input type="number" min="0" value={pieces} onChange={(e) => setPieces(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>الكراتين</Label>
              <Input type="number" min="0" value={cartons} onChange={(e) => setCartons(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>ملاحظات التسوية</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "جاري التسوية..." : "تأكيد التسوية"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreatePartyReturnDialog({
  open,
  onOpenChange,
  partyId,
  partyName,
  invoices,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partyId: number;
  partyName: string;
  invoices: Invoice[];
  onSubmit: (data: Record<string, unknown>) => void;
  isLoading: boolean;
}) {
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [description, setDescription] = useState("");

  const handleSubmit = () => {
    if (!invoiceId || !description.trim()) return;
    onSubmit({ partyId, sourceInvoiceId: invoiceId, notes: description.trim() });
  };

  const resetForm = () => {
    setInvoiceId(null);
    setDescription("");
  };

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
          <DialogTitle>هامش يدوي جديد</DialogTitle>
          <DialogDescription>
            إنشاء حالة هامش يدوية للملف: <span className="font-semibold">{partyName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>الفاتورة المرتبطة *</Label>
            <Select
              value={invoiceId?.toString() || ""}
              onValueChange={(val) => setInvoiceId(Number(val))}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر الفاتورة..." />
              </SelectTrigger>
              <SelectContent>
                {invoices.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id.toString()}>
                    <span className="font-mono">{inv.invoiceNumber}</span>
                    <span className="text-muted-foreground mr-2 text-xs">
                      {inv.invoiceKind === "purchase" ? "شراء" : "بيع"} — {parseFloat(inv.totalEgp).toLocaleString("ar-EG")} ج.م
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {invoices.length === 0 && (
              <p className="text-xs text-muted-foreground">لا توجد فواتير لهذا الملف</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>وصف الهامش *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اكتب وصف المشكلة أو سبب الهامش..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !invoiceId || !description.trim()}
          >
            {isLoading ? "جاري الحفظ..." : "إنشاء الحالة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  const getEntryTypeBadge = (type: string | null | undefined) => {
    switch (type) {
      case "purchase":
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs whitespace-nowrap">📦 شراء</Badge>;
      case "sale":
        return <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs whitespace-nowrap">🛒 بيع</Badge>;
      case "payment":
        return <Badge variant="secondary" className="bg-purple-100 text-purple-800 text-xs whitespace-nowrap">💰 دفعة</Badge>;
      case "return":
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs whitespace-nowrap">↩️ هامش</Badge>;
      case "opening_balance":
        return <Badge variant="secondary" className="bg-gray-100 text-gray-700 text-xs whitespace-nowrap">📊 رصيد افتتاحي</Badge>;
      case "adjustment":
      case "credit":
      case "debit":
        return <Badge variant="secondary" className="bg-orange-100 text-orange-800 text-xs whitespace-nowrap">⚙️ تسوية</Badge>;
      case "settlement":
        return <Badge variant="secondary" className="bg-indigo-100 text-indigo-800 text-xs whitespace-nowrap">✅ تسوية نهائية</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{type || "-"}</Badge>;
    }
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

    const { jsPDF } = await import("@/lib/jspdf-stub");
    
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
    
    const typeLabels: Record<string, string> = {
      purchase: "شراء", sale: "بيع", payment: "دفعة", return: "هامش",
      opening_balance: "رصيد افتتاحي", adjustment: "تسوية", settlement: "تسوية نهائية",
    };
    const tableData = filteredEntries.map(entry => {
      const balance = parseFloat(entry.balanceEgp || "0");
      const balanceText = `${formatCurrency(Math.abs(balance))} ${balance > 0 ? "(مدين)" : balance < 0 ? "(دائن)" : ""}`;
      const eType = entry.entryType || entry.referenceType || "";
      return [
        balanceText,
        parseFloat(entry.creditEgp || "0") > 0 ? formatCurrency(entry.creditEgp) : "-",
        parseFloat(entry.debitEgp || "0") > 0 ? formatCurrency(entry.debitEgp) : "-",
        entry.description || "-",
        typeLabels[eType] || eType || "-",
        new Date(entry.entryDate).toLocaleDateString("ar-EG"),
      ];
    });
    
    (doc as any).autoTable({
      head: [["الرصيد", "دائن (علينا)", "مدين (لنا)", "البيان", "النوع", "التاريخ"]],
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

    const csvTypeLabels: Record<string, string> = {
      purchase: "شراء", sale: "بيع", payment: "دفعة", return: "هامش",
      opening_balance: "رصيد افتتاحي", adjustment: "تسوية", settlement: "تسوية نهائية",
    };
    const headers = ["التاريخ", "النوع", "البيان", "مدين (لنا)", "دائن (علينا)", "الرصيد"];
    const rows = filteredEntries.map(entry => {
      const balance = parseFloat(entry.balanceEgp || "0");
      const balanceText = `${Math.abs(balance)} ${balance > 0 ? "(مدين)" : balance < 0 ? "(دائن)" : ""}`;
      const eType = entry.entryType || entry.referenceType || "";
      return [
        new Date(entry.entryDate).toLocaleDateString("ar-EG"),
        csvTypeLabels[eType] || eType || "-",
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
            <TableRow className="bg-muted/50">
              <TableHead className="text-right w-24">التاريخ</TableHead>
              <TableHead className="text-right w-28">النوع</TableHead>
              <TableHead className="text-right">البيان</TableHead>
              <TableHead className="text-right w-32 text-green-700">مدين (لنا)</TableHead>
              <TableHead className="text-right w-32 text-red-700">دائن (علينا)</TableHead>
              <TableHead className="text-right w-36">الرصيد</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-3xl">📋</span>
                    <span>لا توجد حركات في هذه الفترة</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredEntries.map((entry) => {
                const balance = parseFloat(entry.balanceEgp || "0");
                const debit  = parseFloat(entry.debitEgp  || "0");
                const credit = parseFloat(entry.creditEgp || "0");
                const entryType = entry.entryType || entry.referenceType;
                return (
                  <TableRow
                    key={entry.id}
                    className={
                      entryType === "purchase" ? "bg-blue-50/40 hover:bg-blue-50/70" :
                      entryType === "sale"     ? "bg-green-50/40 hover:bg-green-50/70" :
                      entryType === "payment"  ? "bg-purple-50/30 hover:bg-purple-50/60" :
                      entryType === "return"   ? "bg-amber-50/40 hover:bg-amber-50/70" :
                      ""
                    }
                  >
                    <TableCell className="text-sm text-muted-foreground">{formatDate(entry.entryDate)}</TableCell>
                    <TableCell>{getEntryTypeBadge(entryType)}</TableCell>
                    <TableCell className="text-sm">{entry.description}</TableCell>
                    <TableCell className="font-mono font-medium text-green-700">
                      {debit > 0 ? formatCurrency(debit) : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="font-mono font-medium text-red-600">
                      {credit > 0 ? formatCurrency(credit) : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className={`font-mono font-bold ${balance > 0 ? "text-green-700" : balance < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {formatCurrency(Math.abs(balance))}
                      {balance > 0 && <span className="text-xs mr-1 font-normal">(مدين)</span>}
                      {balance < 0 && <span className="text-xs mr-1 font-normal">(دائن)</span>}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {filteredEntries.length > 0 && (
        <div className="flex justify-end pt-2">
          <div className={`rounded-lg px-5 py-3 flex items-center gap-3 ${
            currentBalance > 0 ? "bg-green-50 border border-green-200" :
            currentBalance < 0 ? "bg-red-50 border border-red-200" :
            "bg-muted border"
          }`}>
            <span className="text-sm text-muted-foreground">الرصيد الإجمالي:</span>
            <span className={`text-xl font-bold font-mono ${currentBalance > 0 ? "text-green-700" : currentBalance < 0 ? "text-red-600" : ""}`}>
              {formatCurrency(Math.abs(currentBalance))} ج.م
            </span>
            <Badge variant="outline" className={`${currentBalance > 0 ? "border-green-500 text-green-700" : currentBalance < 0 ? "border-red-500 text-red-600" : ""}`}>
              {currentBalance > 0 ? "مدين" : currentBalance < 0 ? "دائن" : "متوازن"}
            </Badge>
          </div>
        </div>
      )}
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
          amountEgp: paymentAmount.toString(),
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
  const [paymentMethod, setPaymentMethod] = useState("نقدي");
  const [notes, setNotes] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");

  // Fetch invoices for this party with payment info
  const { data: invoices } = useLocalInvoices({ partyId });
  
  // Show all active invoices (exclude cancelled/archived) — draft invoices can also receive payments
  const unpaidInvoices = (invoices || []).filter((inv: any) => {
    const status = inv.status;
    if (status === 'cancelled' || status === 'archived') return false;
    // Show invoices that have remaining balance OR have totalEgp > 0
    // Also show all invoices so user can always link a payment to any invoice
    return true;
  });

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
      amountEgp: amount.toString(),
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
                <SelectItem value="نقدي">نقداً</SelectItem>
                <SelectItem value="فودافون كاش">فودافون كاش</SelectItem>
                <SelectItem value="إنستاباي">إنستاباي</SelectItem>
                <SelectItem value="تحويل بنكي">تحويل بنكي</SelectItem>
                <SelectItem value="شيك">شيك</SelectItem>
                <SelectItem value="أخرى">أخرى</SelectItem>
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
