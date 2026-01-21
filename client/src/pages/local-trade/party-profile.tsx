import { useState, useMemo } from "react";
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
  useUpdateParty,
  useLocalInvoices,
  useLocalPayments,
  useReturnCases,
  usePartySeasons,
  useCreateLocalPayment,
  useCreateSettlement,
  usePartyCollections,
  usePartyTimeline,
  useUpsertPartyCollections,
  useUpdateCollectionStatus,
  useMarkCollectionReminder,
} from "@/hooks/use-local-trade";
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
  collectionDate: string;
  amountEgp: string | null;
  notes: string | null;
  reminderSent: boolean;
  status: string;
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
  
  const [activeTab, setActiveTab] = useState("invoices");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isSettlementDialogOpen, setIsSettlementDialogOpen] = useState(false);
  
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<string>("all");
  const [invoiceKindFilter, setInvoiceKindFilter] = useState<string>("all");
  const [returnStatusFilter, setReturnStatusFilter] = useState<string>("all");
  
  const { toast } = useToast();
  
  const { data: party, isLoading: isLoadingParty } = useParty(partyId);
  const { data: profile } = usePartyProfile(partyId);
  
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
  
  const updateMutation = useUpdateParty();
  const createPaymentMutation = useCreateLocalPayment();
  const createSettlementMutation = useCreateSettlement();

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

  const getTypeLabel = (type: string) => type === "merchant" ? "تاجر" : "عميل";
  const getPaymentTermsLabel = (terms: string) => terms === "cash" ? "كاش" : "آجل";

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/local-trade/parties" className="hover:text-foreground">
          الملفات
        </Link>
        <span>/</span>
        <span>{partyData.name}</span>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6">
            <Avatar className="w-24 h-24">
              <AvatarImage src={partyData.imageUrl || undefined} />
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                {partyData.name.charAt(0)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold">{partyData.name}</h1>
                    <Badge variant={partyData.type === "merchant" ? "default" : "secondary"}>
                      {getTypeLabel(partyData.type)}
                    </Badge>
                    {!partyData.isActive && (
                      <Badge variant="outline" className="border-red-500 text-red-500">
                        غير نشط
                      </Badge>
                    )}
                  </div>
                  {partyData.shopName && (
                    <p className="text-muted-foreground flex items-center gap-1 mt-1">
                      <Store className="w-4 h-4" />
                      {partyData.shopName}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setIsEditDialogOpen(true)}>
                    <Edit className="w-4 h-4 ml-2" />
                    تعديل
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                {partyData.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span dir="ltr">{partyData.phone}</span>
                  </div>
                )}
                {partyData.whatsapp && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-green-600" />
                    <span dir="ltr">{partyData.whatsapp}</span>
                    <Badge variant="outline" className="text-xs">WhatsApp</Badge>
                  </div>
                )}
                {(partyData.addressArea || partyData.addressGovernorate) && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span>
                      {[partyData.addressArea, partyData.addressGovernorate].filter(Boolean).join("، ")}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                  <span>{getPaymentTermsLabel(partyData.paymentTerms)}</span>
                  {partyData.paymentTerms === "credit" && partyData.creditLimitMode === "limited" && (
                    <span className="text-muted-foreground">
                      (حد: {formatCurrency(partyData.creditLimitAmountEgp)} ج.م)
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
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setIsPaymentDialogOpen(true)}>
          <Plus className="w-4 h-4 ml-2" />
          سداد جديد
        </Button>
        <Link href={`/local-trade/invoices?partyId=${partyId}`}>
          <Button variant="outline">
            <FileSpreadsheet className="w-4 h-4 ml-2" />
            فاتورة جديدة
          </Button>
        </Link>
        <Button variant="outline" onClick={() => setIsSettlementDialogOpen(true)}>
          <Archive className="w-4 h-4 ml-2" />
          تسوية الموسم
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full flex-wrap h-auto gap-1">
          <TabsTrigger value="invoices" className="flex items-center gap-1">
            <FileSpreadsheet className="w-4 h-4" />
            الفواتير
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-1">
            <CreditCard className="w-4 h-4" />
            المدفوعات
          </TabsTrigger>
          <TabsTrigger value="returns" className="flex items-center gap-1">
            <RefreshCcw className="w-4 h-4" />
            المرتجعات
          </TabsTrigger>
          <TabsTrigger value="ledger" className="flex items-center gap-1">
            <BookOpen className="w-4 h-4" />
            كشف الحساب
          </TabsTrigger>
          <TabsTrigger value="archive" className="flex items-center gap-1">
            <Archive className="w-4 h-4" />
            الأرشيف
          </TabsTrigger>
          <TabsTrigger value="collections" className="flex items-center gap-1">
            <Bell className="w-4 h-4" />
            التحصيل
          </TabsTrigger>
          <TabsTrigger value="timeline" className="flex items-center gap-1">
            <History className="w-4 h-4" />
            الحركات
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-6">
          <InvoicesTab
            invoices={(invoices as Invoice[]) || []}
            isLoading={isLoadingInvoices}
            statusFilter={invoiceStatusFilter}
            setStatusFilter={setInvoiceStatusFilter}
            kindFilter={invoiceKindFilter}
            setKindFilter={setInvoiceKindFilter}
            partyId={partyId}
          />
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <PaymentsTab
            payments={(payments as Payment[]) || []}
            isLoading={isLoadingPayments}
            onNewPayment={() => setIsPaymentDialogOpen(true)}
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
          <LedgerTab entries={ledgerEntries} />
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
}: {
  invoices: Invoice[];
  isLoading: boolean;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  kindFilter: string;
  setKindFilter: (value: string) => void;
  partyId: number;
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
        <Link href={`/local-trade/invoices?partyId=${partyId}`}>
          <Button variant="outline" size="sm">
            <Plus className="w-4 h-4 ml-1" />
            فاتورة جديدة
          </Button>
        </Link>
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
                <TableHead className="text-right">عدد الأصناف</TableHead>
                <TableHead className="text-right">الإجمالي</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    لا توجد فواتير
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono">{invoice.invoiceNumber}</TableCell>
                    <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                    <TableCell>
                      <Badge variant={invoice.invoiceKind === "purchase" ? "default" : "secondary"}>
                        {invoice.invoiceKind === "purchase" ? "شراء" : "مرتجع"}
                      </Badge>
                    </TableCell>
                    <TableCell>{invoice.linesCount}</TableCell>
                    <TableCell className="font-mono">{formatCurrency(invoice.totalEgp)} ج.م</TableCell>
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
}: {
  payments: Payment[];
  isLoading: boolean;
  onNewPayment: () => void;
}) {
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
                <TableHead className="text-right">ملاحظات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    لا توجد مدفوعات
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                    <TableCell className="font-mono">{formatCurrency(payment.amountEgp)} ج.م</TableCell>
                    <TableCell>
                      {payment.paymentMethod === "cash" ? "نقداً" : 
                       payment.paymentMethod === "bank" ? "تحويل بنكي" : payment.paymentMethod}
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
                    لا توجد حالات مرتجعات
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

function LedgerTab({ entries }: { entries: LedgerEntry[] }) {
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

  return (
    <div className="space-y-4">
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
  onStatusChange: (id: number, status: string) => void;
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

  useMemo(() => {
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
  }, [collections]);

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
                          onClick={() => onStatusChange(existing.id, "collected")}
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;

    onSubmit({
      partyId,
      paymentDate,
      amountEgp: parseFloat(amount),
      paymentMethod,
      notes: notes || null,
    });
  };

  const resetForm = () => {
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setAmount("");
    setPaymentMethod("cash");
    setNotes("");
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
          <DialogTitle>سداد جديد - {partyName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
