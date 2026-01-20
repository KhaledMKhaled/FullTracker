import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  CreditCard,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import {
  useLocalPayments,
  useCreateLocalPayment,
  useParties,
  useLocalInvoices,
} from "@/hooks/use-local-trade";
import { getErrorMessage } from "@/lib/queryClient";

interface Party {
  id: number;
  name: string;
  shopName?: string | null;
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  partyId: number;
}

interface LocalPayment {
  id: number;
  paidAt: string;
  partyId: number;
  partyName?: string;
  invoiceId?: number | null;
  invoiceNumber?: string | null;
  amountEgp: string;
  paymentMethod: string;
  referenceNumber?: string | null;
  notes?: string | null;
}

const PAYMENT_METHODS = [
  { value: "نقدي", label: "نقدي" },
  { value: "تحويل بنكي", label: "تحويل بنكي" },
  { value: "فودافون كاش", label: "فودافون كاش" },
  { value: "شيك", label: "شيك" },
];

function getPaymentMethodBadge(method: string) {
  const colorMap: Record<string, string> = {
    "نقدي": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    "تحويل بنكي": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    "فودافون كاش": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    "شيك": "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  };
  return (
    <Badge variant="outline" className={colorMap[method] || ""}>
      {method}
    </Badge>
  );
}

export default function LocalPaymentsPage() {
  const [partyFilter, setPartyFilter] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [partyFilterOpen, setPartyFilterOpen] = useState(false);
  const { toast } = useToast();

  const filters = {
    partyId: partyFilter || undefined,
  };

  const { data: payments, isLoading } = useLocalPayments(filters);
  const { data: parties } = useParties();

  const createMutation = useCreateLocalPayment();

  const filteredPayments = useMemo(() => {
    if (!payments) return [];
    let result = payments as LocalPayment[];

    if (search) {
      result = result.filter(
        (p) =>
          p.partyName?.toLowerCase().includes(search.toLowerCase()) ||
          p.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
          p.referenceNumber?.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (dateFrom) {
      result = result.filter((p) => new Date(p.paidAt) >= new Date(dateFrom));
    }
    if (dateTo) {
      result = result.filter((p) => new Date(p.paidAt) <= new Date(dateTo + "T23:59:59"));
    }

    return result;
  }, [payments, search, dateFrom, dateTo]);

  const selectedPartyFilter = parties?.find((p: Party) => p.id === partyFilter);

  const totalAmount = filteredPayments.reduce(
    (sum, p) => sum + parseFloat(p.amountEgp || "0"),
    0
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">مدفوعات التجارة المحلية</h1>
            <p className="text-sm text-muted-foreground">
              تسجيل المدفوعات والتحصيلات
            </p>
          </div>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 ml-2" />
          تسجيل دفعة
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        <div className="flex-1 flex flex-wrap gap-3">
          <Popover open={partyFilterOpen} onOpenChange={setPartyFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-48 justify-between">
                {selectedPartyFilter ? selectedPartyFilter.name : "كل الأطراف"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-0" align="start">
              <Command>
                <CommandInput placeholder="بحث..." />
                <CommandList>
                  <CommandEmpty>لا توجد نتائج</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => {
                        setPartyFilter(null);
                        setPartyFilterOpen(false);
                      }}
                    >
                      كل الأطراف
                    </CommandItem>
                    {(parties as Party[] | undefined)?.map((party) => (
                      <CommandItem
                        key={party.id}
                        onSelect={() => {
                          setPartyFilter(party.id);
                          setPartyFilterOpen(false);
                        }}
                      >
                        {party.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-36"
              placeholder="من"
            />
            <span className="text-muted-foreground">إلى</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-36"
            />
          </div>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالطرف أو المرجع..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10"
          />
        </div>
      </div>

      <div className="bg-muted/50 p-4 rounded-lg flex items-center justify-between">
        <span className="text-muted-foreground">إجمالي المدفوعات:</span>
        <span className="font-bold text-lg">
          {totalAmount.toLocaleString("ar-EG")} ج.م
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم العملية</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">الطرف</TableHead>
                <TableHead className="text-right">رقم الفاتورة</TableHead>
                <TableHead className="text-right">المبلغ (ج.م)</TableHead>
                <TableHead className="text-right">طريقة الدفع</TableHead>
                <TableHead className="text-right">المرجع</TableHead>
                <TableHead className="text-right">ملاحظات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    لا توجد مدفوعات
                  </TableCell>
                </TableRow>
              ) : (
                filteredPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono">#{payment.id}</TableCell>
                    <TableCell>
                      {new Date(payment.paidAt).toLocaleDateString("ar-EG")}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/local-trade/parties/${payment.partyId}`}
                        className="text-primary hover:underline"
                      >
                        {payment.partyName}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono">
                      {payment.invoiceNumber || "-"}
                    </TableCell>
                    <TableCell className="font-mono font-medium">
                      {parseFloat(payment.amountEgp).toLocaleString("ar-EG")}
                    </TableCell>
                    <TableCell>{getPaymentMethodBadge(payment.paymentMethod)}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {payment.referenceNumber || "-"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {payment.notes || "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <CreatePaymentDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        parties={parties as Party[] | undefined}
        onSubmit={(data) => {
          createMutation.mutate(data, {
            onSuccess: () => {
              toast({ title: "تم تسجيل الدفعة بنجاح" });
              setIsCreateDialogOpen(false);
            },
            onError: (error) => {
              toast({ title: getErrorMessage(error), variant: "destructive" });
            },
          });
        }}
        isLoading={createMutation.isPending}
      />
    </div>
  );
}

interface CreatePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parties?: Party[];
  onSubmit: (data: Record<string, unknown>) => void;
  isLoading: boolean;
}

function CreatePaymentDialog({
  open,
  onOpenChange,
  parties,
  onSubmit,
  isLoading,
}: CreatePaymentDialogProps) {
  const [partyId, setPartyId] = useState<number | null>(null);
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [amountEgp, setAmountEgp] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [partyOpen, setPartyOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [partySearch, setPartySearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");

  const { data: invoices } = useLocalInvoices(partyId ? { partyId } : undefined);

  const filteredParties = useMemo(() => {
    if (!parties) return [];
    if (!partySearch) return parties;
    return parties.filter(
      (p) =>
        p.name.toLowerCase().includes(partySearch.toLowerCase()) ||
        p.shopName?.toLowerCase().includes(partySearch.toLowerCase())
    );
  }, [parties, partySearch]);

  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    if (!invoiceSearch) return invoices as Invoice[];
    return (invoices as Invoice[]).filter((inv) =>
      inv.invoiceNumber.toLowerCase().includes(invoiceSearch.toLowerCase())
    );
  }, [invoices, invoiceSearch]);

  const selectedParty = parties?.find((p) => p.id === partyId);
  const selectedInvoice = (invoices as Invoice[] | undefined)?.find((inv) => inv.id === invoiceId);

  const handleSubmit = () => {
    if (!partyId || !amountEgp || parseFloat(amountEgp) <= 0 || !paymentMethod) return;
    onSubmit({
      partyId,
      invoiceId: invoiceId || null,
      amountEgp: parseFloat(amountEgp),
      paymentMethod,
      referenceNumber: referenceNumber.trim() || null,
      notes: notes.trim() || null,
    });
  };

  const resetForm = () => {
    setPartyId(null);
    setInvoiceId(null);
    setAmountEgp("");
    setPaymentMethod("");
    setReferenceNumber("");
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
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>تسجيل دفعة جديدة</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>الطرف *</Label>
            <Popover open={partyOpen} onOpenChange={setPartyOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={partyOpen}
                  className="w-full justify-between"
                >
                  {selectedParty ? selectedParty.name : "اختر الطرف..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="بحث..."
                    value={partySearch}
                    onValueChange={setPartySearch}
                  />
                  <CommandList>
                    <CommandEmpty>لا توجد نتائج</CommandEmpty>
                    <CommandGroup>
                      {filteredParties.map((party) => (
                        <CommandItem
                          key={party.id}
                          value={party.name}
                          onSelect={() => {
                            setPartyId(party.id);
                            setInvoiceId(null);
                            setPartyOpen(false);
                          }}
                        >
                          <span>{party.name}</span>
                          {party.shopName && (
                            <span className="text-muted-foreground mr-2">
                              ({party.shopName})
                            </span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>الفاتورة (اختياري)</Label>
            <Popover open={invoiceOpen} onOpenChange={setInvoiceOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={invoiceOpen}
                  className="w-full justify-between"
                  disabled={!partyId}
                >
                  {selectedInvoice ? selectedInvoice.invoiceNumber : "اختر الفاتورة..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="بحث برقم الفاتورة..."
                    value={invoiceSearch}
                    onValueChange={setInvoiceSearch}
                  />
                  <CommandList>
                    <CommandEmpty>لا توجد فواتير</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          setInvoiceId(null);
                          setInvoiceOpen(false);
                        }}
                      >
                        بدون فاتورة
                      </CommandItem>
                      {filteredInvoices.map((invoice) => (
                        <CommandItem
                          key={invoice.id}
                          value={invoice.invoiceNumber}
                          onSelect={() => {
                            setInvoiceId(invoice.id);
                            setInvoiceOpen(false);
                          }}
                        >
                          {invoice.invoiceNumber}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>المبلغ (ج.م) *</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amountEgp}
              onChange={(e) => setAmountEgp(e.target.value)}
              placeholder="أدخل المبلغ..."
            />
          </div>

          <div className="space-y-2">
            <Label>طريقة الدفع *</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue placeholder="اختر طريقة الدفع..." />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    {method.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>رقم المرجع</Label>
            <Input
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="رقم الشيك أو التحويل..."
            />
          </div>

          <div className="space-y-2">
            <Label>ملاحظات</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات اختيارية..."
              rows={2}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isLoading || !partyId || !amountEgp || parseFloat(amountEgp) <= 0 || !paymentMethod}
            className="w-full"
          >
            {isLoading ? "جاري الحفظ..." : "تسجيل الدفعة"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
