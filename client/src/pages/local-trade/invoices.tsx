import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  FileSpreadsheet,
  Plus,
  Search,
  Eye,
  Package,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
  useLocalInvoices,
  useLocalInvoice,
  useCreateLocalInvoice,
  useReceiveInvoice,
  useParties,
} from "@/hooks/use-local-trade";
import { getErrorMessage } from "@/lib/queryClient";
import type { ProductType } from "@shared/schema";

interface Party {
  id: number;
  name: string;
  type: string;
  shopName?: string | null;
}

interface InvoiceLine {
  id?: number;
  productTypeId: number | null;
  productTypeName?: string;
  quantity: number;
  unit: string;
  unitPriceEgp: number;
  receivedQuantity?: number;
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
  lines?: InvoiceLine[];
  receipts?: Receipt[];
}

interface Receipt {
  id: number;
  receivedAt: string;
  notes?: string | null;
  lines: { lineId: number; receivedQuantity: number }[];
}

const UNITS = [
  { value: "piece", label: "قطعة" },
  { value: "dozen", label: "دستة" },
  { value: "carton", label: "كرتونة" },
  { value: "kilo", label: "كيلو" },
  { value: "ton", label: "طن" },
];

function getUnitLabel(unit: string) {
  return UNITS.find((u) => u.value === unit)?.label || unit;
}

function formatDozenQuantity(quantity: number, unit: string): string {
  if (unit === "dozen") {
    const dozens = quantity / 12;
    return `${dozens} دستة (${quantity} قطعة)`;
  }
  return `${quantity} ${getUnitLabel(unit)}`;
}

function validateDozenQuantity(quantity: number, unit: string): string | null {
  if (unit === "dozen" && quantity % 12 !== 0) {
    return `الكمية ${quantity} لا يمكن تقسيمها على 12. يجب أن تكون الكمية بالدستة قابلة للقسمة على 12.`;
  }
  return null;
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

function getKindLabel(kind: string) {
  return kind === "purchase" ? "شراء" : "مرتجع";
}

export default function InvoicesPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isReceiveDialogOpen, setIsReceiveDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const { toast } = useToast();

  const filters = {
    status: statusFilter === "all" ? undefined : statusFilter,
  };

  const { data: invoices, isLoading } = useLocalInvoices(filters);
  const { data: parties } = useParties();
  const { data: productTypes } = useQuery<ProductType[]>({
    queryKey: ["/api/product-types"],
  });

  const createMutation = useCreateLocalInvoice();
  const receiveMutation = useReceiveInvoice();

  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    if (!search) return invoices as Invoice[];
    return (invoices as Invoice[]).filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        inv.partyName?.toLowerCase().includes(search.toLowerCase())
    );
  }, [invoices, search]);

  const openViewDialog = (id: number) => {
    setSelectedInvoiceId(id);
    setIsViewDialogOpen(true);
  };

  const openReceiveDialog = (id: number) => {
    setSelectedInvoiceId(id);
    setIsReceiveDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">فواتير التجارة المحلية</h1>
            <p className="text-sm text-muted-foreground">
              إدارة فواتير الشراء والمرتجعات
            </p>
          </div>
        </div>
        <Link href="/local-trade/invoices/new">
          <Button>
            <Plus className="w-4 h-4 ml-2" />
            فاتورة جديدة
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all">الكل</TabsTrigger>
            <TabsTrigger value="pending">معلقة</TabsTrigger>
            <TabsTrigger value="partial">مستلمة جزئياً</TabsTrigger>
            <TabsTrigger value="received">مستلمة</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-72">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث برقم الفاتورة أو اسم الطرف..."
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
                <TableHead className="text-right">رقم الفاتورة</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">نوع الفاتورة</TableHead>
                <TableHead className="text-right">الطرف</TableHead>
                <TableHead className="text-right">عدد الأصناف</TableHead>
                <TableHead className="text-right">الإجمالي (ج.م)</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    لا توجد فواتير
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono">{invoice.invoiceNumber}</TableCell>
                    <TableCell>
                      {new Date(invoice.invoiceDate).toLocaleDateString("ar-EG")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={invoice.invoiceKind === "purchase" ? "default" : "secondary"}>
                        {getKindLabel(invoice.invoiceKind)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/local-trade/parties/${invoice.partyId}`}
                        className="text-primary hover:underline"
                      >
                        {invoice.partyName}
                      </Link>
                    </TableCell>
                    <TableCell>{invoice.linesCount}</TableCell>
                    <TableCell className="font-mono">
                      {parseFloat(invoice.totalEgp).toLocaleString("ar-EG")}
                    </TableCell>
                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openViewDialog(invoice.id)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {invoice.status !== "received" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openReceiveDialog(invoice.id)}
                          >
                            <Package className="w-4 h-4" />
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

      <CreateInvoiceDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        parties={parties as Party[] | undefined}
        productTypes={productTypes}
        onSubmit={(data) => {
          createMutation.mutate(data, {
            onSuccess: () => {
              toast({ title: "تم إنشاء الفاتورة بنجاح" });
              setIsCreateDialogOpen(false);
            },
            onError: (error) => {
              toast({ title: getErrorMessage(error), variant: "destructive" });
            },
          });
        }}
        isLoading={createMutation.isPending}
      />

      <ReceiveInvoiceDialog
        open={isReceiveDialogOpen}
        onOpenChange={setIsReceiveDialogOpen}
        invoiceId={selectedInvoiceId}
        onSubmit={(data) => {
          if (selectedInvoiceId) {
            receiveMutation.mutate(
              { id: selectedInvoiceId, data },
              {
                onSuccess: () => {
                  toast({ title: "تم استلام الأصناف بنجاح" });
                  setIsReceiveDialogOpen(false);
                  setSelectedInvoiceId(null);
                },
                onError: (error) => {
                  toast({ title: getErrorMessage(error), variant: "destructive" });
                },
              }
            );
          }
        }}
        isLoading={receiveMutation.isPending}
      />

      <ViewInvoiceDialog
        open={isViewDialogOpen}
        onOpenChange={setIsViewDialogOpen}
        invoiceId={selectedInvoiceId}
      />
    </div>
  );
}

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parties?: Party[];
  productTypes?: ProductType[];
  onSubmit: (data: Record<string, unknown>) => void;
  isLoading: boolean;
}

function CreateInvoiceDialog({
  open,
  onOpenChange,
  parties,
  productTypes,
  onSubmit,
  isLoading,
}: CreateInvoiceDialogProps) {
  const [invoiceKind, setInvoiceKind] = useState("purchase");
  const [partyId, setPartyId] = useState<number | null>(null);
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([
    { productTypeId: null, quantity: 1, unit: "piece", unitPriceEgp: 0 },
  ]);
  const [partyOpen, setPartyOpen] = useState(false);
  const [partySearch, setPartySearch] = useState("");

  const filteredParties = useMemo(() => {
    if (!parties) return [];
    if (!partySearch) return parties;
    return parties.filter(
      (p) =>
        p.name.toLowerCase().includes(partySearch.toLowerCase()) ||
        p.shopName?.toLowerCase().includes(partySearch.toLowerCase())
    );
  }, [parties, partySearch]);

  const selectedParty = parties?.find((p) => p.id === partyId);

  const addLine = () => {
    setLines([
      ...lines,
      { productTypeId: null, quantity: 1, unit: "piece", unitPriceEgp: 0 },
    ]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 1) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const updateLine = (index: number, updates: Partial<InvoiceLine>) => {
    setLines(lines.map((line, i) => (i === index ? { ...line, ...updates } : line)));
  };

  const lineTotal = (line: InvoiceLine) => line.quantity * line.unitPriceEgp;
  const invoiceTotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  const getLineError = (line: InvoiceLine): string | null => {
    return validateDozenQuantity(line.quantity, line.unit);
  };

  const hasDozenValidationErrors = lines.some((l) => getLineError(l) !== null);

  const handleSubmit = () => {
    if (!partyId) return;
    if (lines.some((l) => !l.productTypeId || l.quantity <= 0)) return;
    if (hasDozenValidationErrors) return;

    onSubmit({
      invoiceKind,
      partyId,
      invoiceDate,
      notes: notes || null,
      lines: lines.map((l) => {
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
    });
  };

  const resetForm = () => {
    setInvoiceKind("purchase");
    setPartyId(null);
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setLines([{ productTypeId: null, quantity: 1, unit: "piece", unitPriceEgp: 0 }]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) resetForm();
        onOpenChange(val);
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>فاتورة جديدة</DialogTitle>
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
                  <Label htmlFor="purchase" className="cursor-pointer">
                    شراء
                  </Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="return" id="return" />
                  <Label htmlFor="return" className="cursor-pointer">
                    مرتجع
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>تاريخ الفاتورة</Label>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>
          </div>

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
            <Label>ملاحظات</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات اختيارية..."
              rows={2}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>بنود الفاتورة</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="w-4 h-4 ml-1" />
                إضافة بند
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">نوع الصنف</TableHead>
                    <TableHead className="text-right">الكمية</TableHead>
                    <TableHead className="text-right">الوحدة</TableHead>
                    <TableHead className="text-right">سعر الوحدة (ج.م)</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Select
                          value={line.productTypeId?.toString() || ""}
                          onValueChange={(val) =>
                            updateLine(index, { productTypeId: parseInt(val) })
                          }
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="اختر..." />
                          </SelectTrigger>
                          <SelectContent>
                            {productTypes?.map((pt) => (
                              <SelectItem key={pt.id} value={pt.id.toString()}>
                                {pt.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(index, {
                                quantity: parseInt(e.target.value) || 1,
                              })
                            }
                            className={`w-20 ${getLineError(line) ? 'border-destructive' : ''}`}
                          />
                          {line.unit === "dozen" && line.quantity % 12 === 0 && line.quantity > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {line.quantity / 12} دستة ({line.quantity} قطعة)
                            </p>
                          )}
                          {getLineError(line) && (
                            <p className="text-xs text-destructive">
                              {getLineError(line)}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={line.unit}
                          onValueChange={(val) => updateLine(index, { unit: val })}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {UNITS.map((u) => (
                              <SelectItem key={u.value} value={u.value}>
                                {u.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPriceEgp}
                          onChange={(e) =>
                            updateLine(index, {
                              unitPriceEgp: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-28"
                        />
                      </TableCell>
                      <TableCell className="font-mono">
                        {lineTotal(line).toLocaleString("ar-EG")}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(index)}
                          disabled={lines.length === 1}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end">
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">إجمالي الفاتورة:</span>
                  <span className="text-xl font-bold">
                    {invoiceTotal.toLocaleString("ar-EG")} ج.م
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                isLoading ||
                !partyId ||
                lines.some((l) => !l.productTypeId || l.quantity <= 0) ||
                hasDozenValidationErrors
              }
            >
              {isLoading ? "جاري الحفظ..." : "حفظ الفاتورة"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ReceiveInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: number | null;
  onSubmit: (data: Record<string, unknown>) => void;
  isLoading: boolean;
}

function ReceiveInvoiceDialog({
  open,
  onOpenChange,
  invoiceId,
  onSubmit,
  isLoading,
}: ReceiveInvoiceDialogProps) {
  const { data: invoice } = useLocalInvoice(invoiceId || 0);
  const [receivedQuantities, setReceivedQuantities] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState("");

  const invoiceData = invoice as Invoice | undefined;

  const handleSubmit = () => {
    if (!invoiceData?.lines) return;

    const lines = invoiceData.lines
      .filter((line) => line.id && receivedQuantities[line.id] > 0)
      .map((line) => ({
        lineId: line.id,
        receivedQuantity: receivedQuantities[line.id!] || 0,
      }));

    if (lines.length === 0) return;

    onSubmit({
      notes: notes || null,
      lines,
    });
  };

  const resetForm = () => {
    setReceivedQuantities({});
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>استلام أصناف - {invoiceData?.invoiceNumber}</DialogTitle>
        </DialogHeader>

        {invoiceData ? (
          <div className="space-y-6">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الصنف</TableHead>
                    <TableHead className="text-right">الوحدة</TableHead>
                    <TableHead className="text-right">المطلوب</TableHead>
                    <TableHead className="text-right">تم استلامه</TableHead>
                    <TableHead className="text-right">المتبقي</TableHead>
                    <TableHead className="text-right">الكمية المستلمة الآن</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoiceData.lines?.map((line) => {
                    const remaining = line.quantity - (line.receivedQuantity || 0);
                    return (
                      <TableRow key={line.id}>
                        <TableCell>{line.productTypeName}</TableCell>
                        <TableCell>{getUnitLabel(line.unit)}</TableCell>
                        <TableCell>{line.quantity}</TableCell>
                        <TableCell>{line.receivedQuantity || 0}</TableCell>
                        <TableCell>
                          <Badge variant={remaining > 0 ? "secondary" : "default"}>
                            {remaining}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            max={remaining}
                            value={receivedQuantities[line.id!] || ""}
                            onChange={(e) =>
                              setReceivedQuantities({
                                ...receivedQuantities,
                                [line.id!]: Math.min(
                                  parseInt(e.target.value) || 0,
                                  remaining
                                ),
                              })
                            }
                            className="w-24"
                            disabled={remaining === 0}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-2">
              <Label>ملاحظات الاستلام</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات اختيارية..."
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                إلغاء
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  isLoading ||
                  Object.values(receivedQuantities).every((q) => !q || q <= 0)
                }
              >
                {isLoading ? "جاري الحفظ..." : "تأكيد الاستلام"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ViewInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: number | null;
}

function ViewInvoiceDialog({ open, onOpenChange, invoiceId }: ViewInvoiceDialogProps) {
  const { data: invoice } = useLocalInvoice(invoiceId || 0);
  const invoiceData = invoice as Invoice | undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>تفاصيل الفاتورة - {invoiceData?.invoiceNumber}</DialogTitle>
        </DialogHeader>

        {invoiceData ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-muted-foreground">رقم الفاتورة</Label>
                <p className="font-mono">{invoiceData.invoiceNumber}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">التاريخ</Label>
                <p>{new Date(invoiceData.invoiceDate).toLocaleDateString("ar-EG")}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">النوع</Label>
                <p>
                  <Badge variant={invoiceData.invoiceKind === "purchase" ? "default" : "secondary"}>
                    {getKindLabel(invoiceData.invoiceKind)}
                  </Badge>
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">الحالة</Label>
                <p>{getStatusBadge(invoiceData.status)}</p>
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">الطرف</Label>
              <p>{invoiceData.partyName}</p>
            </div>

            {invoiceData.notes && (
              <div>
                <Label className="text-muted-foreground">ملاحظات</Label>
                <p>{invoiceData.notes}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>بنود الفاتورة</Label>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الصنف</TableHead>
                      <TableHead className="text-right">الوحدة</TableHead>
                      <TableHead className="text-right">الكمية</TableHead>
                      <TableHead className="text-right">سعر الوحدة</TableHead>
                      <TableHead className="text-right">الإجمالي</TableHead>
                      <TableHead className="text-right">تم استلامه</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoiceData.lines?.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.productTypeName}</TableCell>
                        <TableCell>{getUnitLabel(line.unit)}</TableCell>
                        <TableCell>{line.quantity}</TableCell>
                        <TableCell className="font-mono">
                          {line.unitPriceEgp.toLocaleString("ar-EG")}
                        </TableCell>
                        <TableCell className="font-mono">
                          {(line.quantity * line.unitPriceEgp).toLocaleString("ar-EG")}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              (line.receivedQuantity || 0) >= line.quantity
                                ? "default"
                                : "secondary"
                            }
                          >
                            {line.receivedQuantity || 0} / {line.quantity}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">إجمالي الفاتورة:</span>
                  <span className="text-xl font-bold">
                    {parseFloat(invoiceData.totalEgp).toLocaleString("ar-EG")} ج.م
                  </span>
                </div>
              </div>
            </div>

            {invoiceData.receipts && invoiceData.receipts.length > 0 && (
              <div className="space-y-2">
                <Label>سجل الاستلام</Label>
                <div className="space-y-2">
                  {invoiceData.receipts.map((receipt, index) => (
                    <div
                      key={receipt.id}
                      className="border rounded-lg p-3 bg-muted/50"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">استلام #{index + 1}</span>
                        <span className="text-sm text-muted-foreground">
                          {new Date(receipt.receivedAt).toLocaleDateString("ar-EG")}
                        </span>
                      </div>
                      {receipt.notes && (
                        <p className="text-sm text-muted-foreground">{receipt.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                إغلاق
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
