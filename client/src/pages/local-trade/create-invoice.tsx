import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  FileSpreadsheet,
  Plus,
  Camera,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useToast } from "@/hooks/use-toast";
import { useParties, useCreateLocalInvoice } from "@/hooks/use-local-trade";
import { getErrorMessage } from "@/lib/queryClient";
import type { ProductType } from "@shared/schema";

interface Party {
  id: number;
  name: string;
  type: string;
  shopName?: string | null;
}

interface InvoiceLineItem {
  id: string;
  imageFile?: File;
  imagePreview?: string;
  imageUrl?: string;
  imageObjectPath?: string;
  isUploadingImage?: boolean;
  imageUploadError?: string;
  productTypeId: number | null;
  productName: string;
  cartons: number;
  piecesPerCarton: number;
  unitMode: "piece" | "dozen";
  unitPriceEgp: number;
  totalPieces: number;
  totalDozens: number;
  lineTotal: number;
}

let lineIdCounter = 0;
function generateLineId(): string {
  return `line-${Date.now()}-${++lineIdCounter}`;
}

function createEmptyLine(): InvoiceLineItem {
  return {
    id: generateLineId(),
    productTypeId: null,
    productName: "",
    cartons: 0,
    piecesPerCarton: 0,
    unitMode: "piece",
    unitPriceEgp: 0,
    totalPieces: 0,
    totalDozens: 0,
    lineTotal: 0,
  };
}

function calculateLineValues(line: InvoiceLineItem): InvoiceLineItem {
  const totalPieces = line.cartons * line.piecesPerCarton;
  let totalDozens = 0;
  let lineTotal = 0;

  if (line.unitMode === "piece") {
    lineTotal = totalPieces * line.unitPriceEgp;
  } else {
    totalDozens = totalPieces / 12;
    lineTotal = totalDozens * line.unitPriceEgp;
  }

  return {
    ...line,
    totalPieces,
    totalDozens,
    lineTotal,
  };
}

export default function CreateInvoicePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [invoiceType, setInvoiceType] = useState<"purchase" | "sale">("purchase");
  const [partyId, setPartyId] = useState<number | null>(null);
  const [invoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [referenceName, setReferenceName] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [lines, setLines] = useState<InvoiceLineItem[]>([createEmptyLine()]);

  // For purchase: show merchants + both; For sale: show customers + both
  const primaryPartyType = invoiceType === "purchase" ? "merchant" : "customer";
  const { data: primaryParties } = useParties({ type: primaryPartyType });
  const { data: bothParties } = useParties({ type: "both" });
  const parties = [...(primaryParties || []), ...(bothParties || [])];

  // Reset partyId when invoice type changes
  const handleInvoiceTypeChange = (type: "purchase" | "sale") => {
    setInvoiceType(type);
    setPartyId(null);
  };
  const { data: productTypes } = useQuery<ProductType[]>({
    queryKey: ["/api/product-types"],
  });
  const { data: nextRef } = useQuery({
    queryKey: ["/api/local-trade/invoices/next-reference"],
    queryFn: async () => {
      const res = await fetch("/api/local-trade/invoices/next-reference", { 
        credentials: "include" 
      });
      if (!res.ok) throw new Error("Failed to get reference");
      return res.json();
    },
  });

  useEffect(() => {
    if (nextRef?.referenceNumber) {
      setReferenceNumber(nextRef.referenceNumber);
    }
  }, [nextRef]);

  const createMutation = useCreateLocalInvoice();

  const updateLine = useCallback(
    (id: string, updates: Partial<InvoiceLineItem>) => {
      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== id) return line;
          const updated = { ...line, ...updates };
          return calculateLineValues(updated);
        })
      );
    },
    []
  );

  const removeLine = useCallback((id: string) => {
    setLines((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((line) => line.id !== id);
    });
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, createEmptyLine()]);
  }, []);

  const handleImageUpload = useCallback(
    async (id: string, file: File | undefined) => {
      if (!file) return;

      // Show preview immediately
      const preview = URL.createObjectURL(file);
      updateLine(id, {
        imageFile: file,
        imagePreview: preview,
        isUploadingImage: true,
        imageUploadError: undefined,
      });

      try {
        // Step 1: Request presigned URL
        const requestRes = await fetch(
          "/api/upload/invoice-line-image/request-url",
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: file.name,
              size: file.size,
              contentType: file.type,
            }),
          }
        );

        if (!requestRes.ok) {
          throw new Error("Failed to get upload URL");
        }

        const { uploadURL, objectPath } = await requestRes.json();

        // Step 2: Upload directly to Object Storage using the presigned URL
        const uploadRes = await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });

        if (!uploadRes.ok) {
          throw new Error("Failed to upload image to storage");
        }

        // Step 3: Finalize the upload (set ACL policy)
        const finalizeRes = await fetch(
          "/api/upload/invoice-line-image/finalize",
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ objectPath }),
          }
        );

        if (!finalizeRes.ok) {
          throw new Error("Failed to finalize upload");
        }

        const { imageUrl } = await finalizeRes.json();
        updateLine(id, {
          imageUrl,
          imageObjectPath: objectPath,
          isUploadingImage: false,
        });
      } catch (error) {
        console.error("Image upload error:", error);
        updateLine(id, {
          isUploadingImage: false,
          imageUploadError:
            error instanceof Error ? error.message : "فشل رفع الصورة",
        });
        toast({
          title: "فشل رفع الصورة",
          description:
            error instanceof Error ? error.message : "حدث خطأ في رفع الصورة",
          variant: "destructive",
        });
      }
    },
    [updateLine, toast]
  );

  const linesCount = lines.length;
  const totalCartons = useMemo(
    () => lines.reduce((sum, l) => sum + l.cartons, 0),
    [lines]
  );
  const totalPieces = useMemo(
    () => lines.reduce((sum, l) => sum + l.totalPieces, 0),
    [lines]
  );
  const invoiceTotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.lineTotal, 0),
    [lines]
  );

  const isValid = useMemo(() => {
    if (!partyId) return false;
    if (lines.length === 0) return false;
    return lines.every(
      (line) =>
        line.productName.trim() !== "" &&
        line.cartons > 0 &&
        line.piecesPerCarton > 0 &&
        line.unitPriceEgp > 0
    );
  }, [partyId, lines]);

  const handleSubmit = async () => {
    if (!isValid || !partyId) return;

    const invoiceData = {
      invoiceKind: invoiceType,
      partyId,
      invoiceDate,
      referenceName: referenceName || null,
      referenceNumber: referenceNumber,
      lines: lines.map((l) => ({
        productTypeId: l.productTypeId,
        productName: l.productName,
        totalPieces: l.totalPieces,
        unitMode: l.unitMode,
        unitPriceEgp: l.unitPriceEgp.toString(),
        lineTotalEgp: l.lineTotal.toString(),
        cartons: l.cartons,
        piecesPerCarton: l.piecesPerCarton,
        imageUrl: l.imageUrl || null,
      })),
    };

    createMutation.mutate(invoiceData, {
      onSuccess: () => {
        toast({ title: "تم إنشاء الفاتورة بنجاح" });
        navigate("/local-trade/invoices");
      },
      onError: (error) => {
        toast({ title: getErrorMessage(error), variant: "destructive" });
      },
    });
  };

  return (
    <div className="p-6 space-y-6 min-h-screen pb-24" dir="rtl">
      <div className="flex items-center gap-3 mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/local-trade/invoices")}
        >
          <ArrowRight className="w-5 h-5" />
        </Button>
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">إنشاء فاتورة جديدة</h1>
          <p className="text-sm text-muted-foreground">
            أدخل بيانات الفاتورة والبنود
          </p>
        </div>
      </div>

      <div className="sticky top-0 z-10 bg-background border-b pb-4 pt-4 -mx-6 px-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <Label>نوع الفاتورة *</Label>
            <Select
              value={invoiceType}
              onValueChange={(val: "purchase" | "sale") => handleInvoiceTypeChange(val)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="purchase">شراء (إضافة للمخزن)</SelectItem>
                <SelectItem value="sale">بيع (خصم من المخزن)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{invoiceType === "purchase" ? "اسم التاجر" : "اسم العميل"} *</Label>
            <Select
              value={partyId?.toString() || ""}
              onValueChange={(val) => setPartyId(Number(val))}
            >
              <SelectTrigger>
                <SelectValue placeholder={invoiceType === "purchase" ? "اختر التاجر" : "اختر العميل"} />
              </SelectTrigger>
              <SelectContent>
                {(parties as Party[] | undefined)?.map((party) => (
                  <SelectItem key={party.id} value={party.id.toString()}>
                    {party.name}
                    {party.shopName && ` - ${party.shopName}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>تاريخ الفاتورة</Label>
            <Input type="date" value={invoiceDate} readOnly className="bg-muted" />
          </div>

          <div>
            <Label>اسم مرجعي</Label>
            <Input
              placeholder="مثال: بضاعة موسم الصيف"
              value={referenceName}
              onChange={(e) => setReferenceName(e.target.value)}
            />
          </div>

          <div>
            <Label>رقم الفاتورة</Label>
            <Input
              value={nextRef?.referenceNumber || ""}
              disabled
              className="font-mono bg-muted"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4">
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold">{linesCount}</div>
          <div className="text-sm text-muted-foreground">عدد البنود</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold">
            {totalCartons.toLocaleString("ar-EG")}
          </div>
          <div className="text-sm text-muted-foreground">إجمالي الكراتين</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold">
            {totalPieces.toLocaleString("ar-EG")}
          </div>
          <div className="text-sm text-muted-foreground">إجمالي القطع</div>
        </Card>
      </div>

      <div className="space-y-3 mt-6">
        <h2 className="font-semibold text-lg">بنود الفاتورة</h2>

        {lines.map((line) => (
          <LineItemRow
            key={line.id}
            line={line}
            productTypes={productTypes}
            onUpdate={updateLine}
            onRemove={removeLine}
            onImageChange={handleImageUpload}
            canDelete={lines.length > 1}
          />
        ))}
      </div>

      <div className="sticky bottom-0 bg-background border-t py-4 -mx-6 px-6 flex items-center justify-between">
        <div>
          <Button variant="outline" onClick={addLine}>
            <Plus className="w-4 h-4 ml-2" />
            إضافة بند
          </Button>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-xl font-bold">
            الإجمالي: {invoiceTotal.toLocaleString("ar-EG")} ج.م
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || createMutation.isPending}
          >
            {createMutation.isPending ? "جاري الحفظ..." : "حفظ الفاتورة"}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface LineItemRowProps {
  line: InvoiceLineItem;
  productTypes?: ProductType[];
  onUpdate: (id: string, updates: Partial<InvoiceLineItem>) => void;
  onRemove: (id: string) => void;
  onImageChange: (id: string, file: File | undefined) => void;
  canDelete: boolean;
}

function LineItemRow({
  line,
  productTypes,
  onUpdate,
  onRemove,
  onImageChange,
  canDelete,
}: LineItemRowProps) {
  return (
    <div className="grid grid-cols-12 gap-3 p-4 border rounded-lg items-start">
      <div className="col-span-1">
        <HoverCard>
          <HoverCardTrigger asChild>
            <div className="relative w-16 h-16 border-2 border-dashed rounded-lg overflow-hidden cursor-pointer hover:border-primary group">
              {line.isUploadingImage && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                </div>
              )}
              {line.imagePreview ? (
                <img
                  src={line.imagePreview}
                  className="w-full h-full object-cover"
                  alt="Product"
                />
              ) : (
                <div className="flex items-center justify-center h-full bg-muted/50">
                  <Camera className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(e) => onImageChange(line.id, e.target.files?.[0])}
                disabled={line.isUploadingImage}
              />
              {line.imageUrl && !line.isUploadingImage && (
                <div className="absolute top-1 right-1 w-3 h-3 bg-green-500 rounded-full border border-white"></div>
              )}
            </div>
          </HoverCardTrigger>
          {line.imagePreview && (
            <HoverCardContent className="w-72 p-2">
              <div className="space-y-2">
                <img
                  src={line.imagePreview}
                  className="w-full h-64 object-contain rounded"
                  alt="Product Preview"
                />
                {line.imageUrl && (
                  <div className="text-xs text-green-600">✓ تم رفع الصورة بنجاح</div>
                )}
                {line.imageUploadError && (
                  <div className="text-xs text-red-600">{line.imageUploadError}</div>
                )}
              </div>
            </HoverCardContent>
          )}
        </HoverCard>
      </div>

      <div className="col-span-2">
        <Label className="text-xs">نوع المنتج</Label>
        <Select
          value={line.productTypeId?.toString() || ""}
          onValueChange={(val) =>
            onUpdate(line.id, { productTypeId: val ? Number(val) : null })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="اختر النوع" />
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

      <div className="col-span-2">
        <Label className="text-xs">اسم المنتج *</Label>
        <Input
          placeholder="اسم المنتج"
          value={line.productName}
          onChange={(e) => onUpdate(line.id, { productName: e.target.value })}
        />
      </div>

      <div className="col-span-1">
        <Label className="text-xs">عدد الكراتين</Label>
        <Input
          type="number"
          min="0"
          value={line.cartons || ""}
          onChange={(e) =>
            onUpdate(line.id, { cartons: Number(e.target.value) || 0 })
          }
        />
      </div>

      <div className="col-span-1">
        <Label className="text-xs">قطع/كرتونة</Label>
        <Input
          type="number"
          min="0"
          value={line.piecesPerCarton || ""}
          onChange={(e) =>
            onUpdate(line.id, { piecesPerCarton: Number(e.target.value) || 0 })
          }
        />
      </div>

      <div className="col-span-1">
        <Label className="text-xs">وحدة البيع</Label>
        <Select
          value={line.unitMode}
          onValueChange={(val: "piece" | "dozen") =>
            onUpdate(line.id, { unitMode: val })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="piece">القطعة</SelectItem>
            <SelectItem value="dozen">الدستة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {line.unitMode === "dozen" ? (
        <div className="col-span-1">
          <Label className="text-xs">إجمالي الدست</Label>
          <Input
            value={line.totalDozens.toFixed(2)}
            disabled
            className="bg-muted"
          />
        </div>
      ) : (
        <div className="col-span-1">
          <Label className="text-xs">إجمالي القطع</Label>
          <Input
            value={line.totalPieces.toLocaleString("ar-EG")}
            disabled
            className="bg-muted"
          />
        </div>
      )}

      <div className="col-span-1">
        <Label className="text-xs">سعر الوحدة</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={line.unitPriceEgp || ""}
          onChange={(e) =>
            onUpdate(line.id, { unitPriceEgp: Number(e.target.value) || 0 })
          }
        />
      </div>

      <div className="col-span-1">
        <Label className="text-xs">إجمالي البند</Label>
        <Input
          value={line.lineTotal.toFixed(2)}
          disabled
          className="bg-muted font-bold"
        />
      </div>

      <div className="col-span-1 flex items-end pb-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRemove(line.id)}
          disabled={!canDelete}
        >
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
