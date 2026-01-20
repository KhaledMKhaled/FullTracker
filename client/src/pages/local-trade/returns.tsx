import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  RotateCcw,
  Plus,
  Search,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/components/ui/dialog";
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
  useReturnCases,
  useCreateReturnCase,
  useResolveReturnCase,
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
  partyName?: string;
}

interface ReturnCase {
  id: number;
  reportedAt: string;
  partyId: number;
  partyName?: string;
  invoiceId: number;
  invoiceNumber?: string;
  description: string;
  status: string;
  marginEgp?: string | null;
  resolutionNote?: string | null;
  resolvedAt?: string | null;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary">معلقة</Badge>;
    case "resolved":
      return <Badge variant="default" className="bg-green-600">تمت التسوية</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function ReturnsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isResolveDialogOpen, setIsResolveDialogOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<ReturnCase | null>(null);
  const { toast } = useToast();

  const filters = {
    status: statusFilter === "all" ? undefined : statusFilter,
  };

  const { data: returnCases, isLoading } = useReturnCases(filters);
  const { data: parties } = useParties();

  const createMutation = useCreateReturnCase();
  const resolveMutation = useResolveReturnCase();

  const filteredCases = useMemo(() => {
    if (!returnCases) return [];
    if (!search) return returnCases as ReturnCase[];
    return (returnCases as ReturnCase[]).filter(
      (rc) =>
        rc.partyName?.toLowerCase().includes(search.toLowerCase()) ||
        rc.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
        rc.description?.toLowerCase().includes(search.toLowerCase())
    );
  }, [returnCases, search]);

  const openResolveDialog = (returnCase: ReturnCase) => {
    setSelectedCase(returnCase);
    setIsResolveDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">حالات المرتجعات والهوامش</h1>
            <p className="text-sm text-muted-foreground">
              تسجيل ومتابعة حالات الفحص والمرتجعات
            </p>
          </div>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 ml-2" />
          حالة جديدة
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all">الكل</TabsTrigger>
            <TabsTrigger value="pending">معلقة</TabsTrigger>
            <TabsTrigger value="resolved">تمت التسوية</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-72">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالطرف أو الفاتورة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10"
          />
        </div>
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
                <TableHead className="text-right">رقم الحالة</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">الطرف</TableHead>
                <TableHead className="text-right">رقم الفاتورة</TableHead>
                <TableHead className="text-right">الوصف</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">قيمة الخصم</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    لا توجد حالات مرتجعات
                  </TableCell>
                </TableRow>
              ) : (
                filteredCases.map((returnCase) => (
                  <TableRow key={returnCase.id}>
                    <TableCell className="font-mono">#{returnCase.id}</TableCell>
                    <TableCell>
                      {new Date(returnCase.reportedAt).toLocaleDateString("ar-EG")}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/local-trade/parties/${returnCase.partyId}`}
                        className="text-primary hover:underline"
                      >
                        {returnCase.partyName}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono">{returnCase.invoiceNumber}</TableCell>
                    <TableCell className="max-w-xs truncate">{returnCase.description}</TableCell>
                    <TableCell>{getStatusBadge(returnCase.status)}</TableCell>
                    <TableCell className="font-mono">
                      {returnCase.status === "resolved" && returnCase.marginEgp
                        ? `${parseFloat(returnCase.marginEgp).toLocaleString("ar-EG")} ج.م`
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {returnCase.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openResolveDialog(returnCase)}
                        >
                          <CheckCircle className="w-4 h-4 ml-1" />
                          تسوية
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateReturnCaseDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        parties={parties as Party[] | undefined}
        onSubmit={(data) => {
          createMutation.mutate(data, {
            onSuccess: () => {
              toast({ title: "تم إنشاء الحالة بنجاح" });
              setIsCreateDialogOpen(false);
            },
            onError: (error) => {
              toast({ title: getErrorMessage(error), variant: "destructive" });
            },
          });
        }}
        isLoading={createMutation.isPending}
      />

      <ResolveReturnCaseDialog
        open={isResolveDialogOpen}
        onOpenChange={setIsResolveDialogOpen}
        returnCase={selectedCase}
        onSubmit={(data) => {
          if (selectedCase) {
            resolveMutation.mutate(
              { id: selectedCase.id, data },
              {
                onSuccess: () => {
                  toast({ title: "تم تسوية الحالة بنجاح" });
                  setIsResolveDialogOpen(false);
                  setSelectedCase(null);
                },
                onError: (error) => {
                  toast({ title: getErrorMessage(error), variant: "destructive" });
                },
              }
            );
          }
        }}
        isLoading={resolveMutation.isPending}
      />
    </div>
  );
}

interface CreateReturnCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parties?: Party[];
  onSubmit: (data: Record<string, unknown>) => void;
  isLoading: boolean;
}

function CreateReturnCaseDialog({
  open,
  onOpenChange,
  parties,
  onSubmit,
  isLoading,
}: CreateReturnCaseDialogProps) {
  const [partyId, setPartyId] = useState<number | null>(null);
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
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
    if (!partyId || !invoiceId || !description.trim()) return;
    onSubmit({
      partyId,
      invoiceId,
      description: description.trim(),
    });
  };

  const resetForm = () => {
    setPartyId(null);
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
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>حالة مرتجع جديدة</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>الطرف</Label>
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
            <Label>الفاتورة</Label>
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
            <Label>الوصف</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="وصف المشكلة أو المرتجع..."
              rows={3}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isLoading || !partyId || !invoiceId || !description.trim()}
            className="w-full"
          >
            {isLoading ? "جاري الحفظ..." : "إنشاء الحالة"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ResolveReturnCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnCase: ReturnCase | null;
  onSubmit: (data: Record<string, unknown>) => void;
  isLoading: boolean;
}

function ResolveReturnCaseDialog({
  open,
  onOpenChange,
  returnCase,
  onSubmit,
  isLoading,
}: ResolveReturnCaseDialogProps) {
  const [marginEgp, setMarginEgp] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");

  const handleSubmit = () => {
    if (!marginEgp || parseFloat(marginEgp) < 0) return;
    onSubmit({
      marginEgp: parseFloat(marginEgp),
      resolutionNote: resolutionNote.trim() || null,
    });
  };

  const resetForm = () => {
    setMarginEgp("");
    setResolutionNote("");
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
          <DialogTitle>تسوية حالة المرتجع</DialogTitle>
        </DialogHeader>

        {returnCase && (
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">الطرف:</span>
                <span className="font-medium">{returnCase.partyName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">الفاتورة:</span>
                <span className="font-mono">{returnCase.invoiceNumber}</span>
              </div>
              <div>
                <span className="text-muted-foreground">الوصف:</span>
                <p className="mt-1">{returnCase.description}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>قيمة الخصم (ج.م)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={marginEgp}
                onChange={(e) => setMarginEgp(e.target.value)}
                placeholder="أدخل قيمة الخصم المتفق عليها..."
              />
            </div>

            <div className="space-y-2">
              <Label>ملاحظات التسوية</Label>
              <Textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="ملاحظات اختيارية..."
                rows={2}
              />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={isLoading || !marginEgp || parseFloat(marginEgp) < 0}
              className="w-full"
            >
              {isLoading ? "جاري الحفظ..." : "تأكيد التسوية"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
