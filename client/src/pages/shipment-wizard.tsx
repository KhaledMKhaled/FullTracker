import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import {
  Ship,
  Package,
  Truck,
  FileCheck,
  ClipboardCheck,
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  ArrowRight,
  Upload,
  Image as ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Copy,
  AlertTriangle,
  FileDown,
} from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type {
  Shipment,
  ShipmentItem,
  ShipmentShippingDetails,
  Supplier,
  ShippingCompany,
  ProductType,
  ExchangeRate,
} from "@shared/schema";
import { ItemImage } from "@/components/item-image";

const STEPS = [
  { id: 1, title: "الاستيراد", icon: Package, description: "بيانات الأصناف" },
  { id: 2, title: "بيانات الشحن", icon: Truck, description: "العمولة والشحن" },
  { id: 3, title: "الجمارك والتخريج", icon: FileCheck, description: "تكاليف التخليص" },
  { id: 4, title: "النواقص", icon: AlertTriangle, description: "القطع الناقصة" },
  { id: 5, title: "ملخص الشحنة", icon: ClipboardCheck, description: "مراجعة نهائية" },
];

const ITEMS_PER_PAGE = 10;

export default function ShipmentWizard() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const isNew = !id || id === "new";

  // Form state
  const [shipmentData, setShipmentData] = useState({
    shipmentCode: "",
    shipmentName: "",
    purchaseDate: new Date().toISOString().split("T")[0],
    status: "جديدة",
    purchaseRmbToEgpRate: "",
    partialDiscountRmb: "0",
    discountNotes: "",
    shippingCompanyId: null as number | null,
  });

  const [items, setItems] = useState<Partial<ShipmentItem>[]>([
    createEmptyItem(),
  ]);

  const [shippingData, setShippingData] = useState({
    commissionRatePercent: "0",
    shippingAreaSqm: "0",
    shippingCostPerSqmUsdOriginal: "0",
    shippingDate: new Date().toISOString().split("T")[0],
    rmbToEgpRate: "7.0",
    usdToRmbRate: "7.2",
    ratesUpdatedAt: "",
  });

  const [purchaseRateInitialized, setPurchaseRateInitialized] = useState(false);
  const [currentItemsPage, setCurrentItemsPage] = useState(1);
  const newItemRef = useRef<HTMLDivElement>(null);

  // Fetch existing shipment data
  const { data: existingShipment, isLoading: loadingShipment } = useQuery<Shipment>({
    queryKey: ["/api/shipments", id],
    enabled: !isNew,
  });

  const { data: existingItems } = useQuery<ShipmentItem[]>({
    queryKey: ["/api/shipments", id, "items"],
    enabled: !isNew,
  });

  const { data: existingShipping } = useQuery<ShipmentShippingDetails>({
    queryKey: ["/api/shipments", id, "shipping"],
    enabled: !isNew,
  });

  const { data: exchangeRates } = useQuery<ExchangeRate[]>({
    queryKey: ["/api/exchange-rates"],
  });

  const { data: suppliers } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const { data: shippingCompanies } = useQuery<ShippingCompany[]>({
    queryKey: ["/api/shipping-companies"],
  });

  const { data: productTypes } = useQuery<ProductType[]>({
    queryKey: ["/api/product-types"],
  });

  // Load existing data
  useEffect(() => {
    if (existingShipment) {
      setShipmentData({
        shipmentCode: existingShipment.shipmentCode,
        shipmentName: existingShipment.shipmentName,
        purchaseDate: existingShipment.purchaseDate?.toString() || "",
        status: existingShipment.status,
        purchaseRmbToEgpRate:
          existingShipment.purchaseRmbToEgpRate?.toString() || shipmentData.purchaseRmbToEgpRate,
        partialDiscountRmb: existingShipment.partialDiscountRmb?.toString() || "0",
        discountNotes: existingShipment.discountNotes || "",
        shippingCompanyId: existingShipment.shippingCompanyId ?? null,
      });
    }
  }, [existingShipment]);

  useEffect(() => {
    if (existingItems && existingItems.length > 0) {
      setItems(existingItems);
    }
  }, [existingItems]);

  useEffect(() => {
    if (existingShipping) {
      setShippingData({
        commissionRatePercent: existingShipping.commissionRatePercent?.toString() || "0",
        shippingAreaSqm: existingShipping.shippingAreaSqm?.toString() || "0",
        shippingCostPerSqmUsdOriginal:
          existingShipping.shippingCostPerSqmUsdOriginal?.toString() || "0",
        shippingDate: existingShipping.shippingDate?.toString() || "",
        rmbToEgpRate: existingShipping.rmbToEgpRateAtShipping?.toString() || "7.0",
        usdToRmbRate: existingShipping.usdToRmbRateAtShipping?.toString() || "7.2",
        ratesUpdatedAt: existingShipping.ratesUpdatedAt?.toString() || "",
      });
    }
  }, [existingShipping]);

  const latestRmbRate = exchangeRates?.find(
    (rate) => rate.fromCurrency === "RMB" && rate.toCurrency === "EGP",
  );
  const latestUsdToRmbRate = exchangeRates?.find(
    (rate) => rate.fromCurrency === "USD" && rate.toCurrency === "RMB",
  );

  useEffect(() => {
    if (isNew && latestRmbRate && !purchaseRateInitialized) {
      setShipmentData((prev) => ({
        ...prev,
        purchaseRmbToEgpRate: latestRmbRate.rateValue?.toString() || prev.purchaseRmbToEgpRate,
      }));
      setPurchaseRateInitialized(true);
    }
  }, [isNew, latestRmbRate, purchaseRateInitialized]);

  useEffect(() => {
    if (
      currentStep === 2 &&
      !existingShipping &&
      !shippingData.ratesUpdatedAt &&
      (latestRmbRate || latestUsdToRmbRate)
    ) {
      setShippingData((prev) => ({
        ...prev,
        rmbToEgpRate: latestRmbRate?.rateValue?.toString() || prev.rmbToEgpRate,
        usdToRmbRate: latestUsdToRmbRate?.rateValue?.toString() || prev.usdToRmbRate,
        ratesUpdatedAt: new Date().toISOString(),
      }));
    }
  }, [currentStep, existingShipping, latestRmbRate, latestUsdToRmbRate, shippingData.ratesUpdatedAt]);

  const refreshRatesMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/exchange-rates/refresh", {});
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/exchange-rates"] });
      const updatedRates = await fetch("/api/exchange-rates", { credentials: "include" }).then(r => r.json());
      const rmbRate = updatedRates?.find((r: ExchangeRate) => r.fromCurrency === "RMB" && r.toCurrency === "EGP");
      const usdRate = updatedRates?.find((r: ExchangeRate) => r.fromCurrency === "USD" && r.toCurrency === "RMB");
      setShippingData((prev) => ({
        ...prev,
        rmbToEgpRate: rmbRate?.rateValue?.toString() || prev.rmbToEgpRate,
        usdToRmbRate: usdRate?.rateValue?.toString() || prev.usdToRmbRate,
        ratesUpdatedAt: new Date().toISOString(),
      }));
      toast({ title: "تم تحديث أسعار الصرف بنجاح" });
    },
    onError: () => {
      toast({ title: "تعذر تحديث أسعار الصرف", variant: "destructive" });
    },
  });

  const refreshShippingRates = () => {
    refreshRatesMutation.mutate();
  };

  // Save mutation
  const validateStep = () => {
    if (!shipmentData.shipmentCode.trim()) {
      return "رقم الشحنة مطلوب";
    }
    if (!shipmentData.shipmentName.trim()) {
      return "اسم الشحنة مطلوب";
    }
    if (!shipmentData.purchaseDate) {
      return "تاريخ الشراء مطلوب";
    }
    if (!items || items.length === 0) {
      return "أضف صنفًا واحدًا على الأقل قبل الحفظ";
    }

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const displayNo = item.lineNo || (index + 1);
      if (!item.productName || !item.productName.trim()) {
        return `اسم الصنف مطلوب (بند #${displayNo})`;
      }
      if (!item.cartonsCtn || item.cartonsCtn <= 0) {
        return `عدد الكراتين مطلوب (بند #${displayNo})`;
      }
      if (!item.piecesPerCartonPcs || item.piecesPerCartonPcs <= 0) {
        return `عدد القطع في الكرتونة مطلوب (بند #${displayNo})`;
      }
      if (!item.purchasePricePerPiecePriRmb || Number(item.purchasePricePerPiecePriRmb) <= 0) {
        return `سعر القطعة بالرممبي مطلوب (بند #${displayNo})`;
      }
    }
    return null;
  };

  const saveMissingPiecesMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      if (!id || isNew) return;
      
      const updates = items
        .filter(item => item.id !== undefined)
        .map(item => ({
          itemId: item.id as number,
          missingPieces: item.missingPieces || 0,
        }));
      
      if (updates.length > 0) {
        await apiRequest("PATCH", `/api/shipments/${id}/missing-pieces`, { updates });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shipments", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/shipments", id, "items"] });
    },
    onError: (error) => {
      let message = "حدث خطأ أثناء حفظ النواقص";
      if (error instanceof Error && error.message) {
        const [, serverMessage] = error.message.split(":");
        message = (serverMessage || error.message).trim();
      }
      toast({ title: message || "حدث خطأ", variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: { step: number }): Promise<{ id?: number } | undefined> => {
      const validationError = validateStep();
      if (validationError) {
        throw new Error(validationError);
      }

      if (isNew && data.step === 1) {
        // Create new shipment
        const response = await apiRequest("POST", "/api/shipments", {
          ...shipmentData,
          items,
        });
        return response.json();
      } else if (data.step === 4 && id) {
        // For step 4 (missing pieces), ONLY save missing pieces
        // Don't call the generic update which would overwrite missing pieces data
        const updates = items
          .filter(item => item.id !== undefined)
          .map(item => ({
            itemId: item.id as number,
            missingPieces: item.missingPieces || 0,
          }));
        
        if (updates.length > 0) {
          await apiRequest("PATCH", `/api/shipments/${id}/missing-pieces`, { updates });
        }
        return undefined;
      } else {
        // Update existing for steps 1, 2, 3, and 5
        await apiRequest("PATCH", `/api/shipments/${id}`, {
          step: data.step,
          shipmentData,
          items,
          shippingData,
        });
        return undefined;
      }
    },
    onSuccess: (result, variables) => {
      toast({ title: "تم الحفظ بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/shipments"] });
      const shipmentIdStr = isNew ? result?.id?.toString() : id;
      if (shipmentIdStr) {
        queryClient.invalidateQueries({ queryKey: ["/api/shipments", shipmentIdStr] });
        queryClient.invalidateQueries({ queryKey: ["/api/shipments", shipmentIdStr, "items"] });
        queryClient.invalidateQueries({ queryKey: ["/api/shipments", shipmentIdStr, "shipping"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      if (isNew && result?.id) {
        navigate(`/shipments/${result.id}/edit`);
      } else if (variables.step === 5) {
        navigate("/shipments");
      }
    },
    onError: (error) => {
      let message = "حدث خطأ أثناء حفظ بيانات الشحنة";
      if (error instanceof Error && error.message) {
        const [, serverMessage] = error.message.split(":");
        message = (serverMessage || error.message).trim();
      }
      toast({ title: message || "حدث خطأ", variant: "destructive" });
    },
  });

  function createEmptyItem(): Partial<ShipmentItem> {
    return {
      productName: "",
      productTypeId: undefined,
      countryOfOrigin: "الصين",
      cartonsCtn: 0,
      piecesPerCartonPcs: 0,
      totalPiecesCou: 0,
      purchasePricePerPiecePriRmb: "0",
      totalPurchaseCostRmb: "0",
      imageUrl: "",
    };
  }

  const [uploadingImage, setUploadingImage] = useState<number | null>(null);

  const handleImageUpload = async (index: number, file: File) => {
    setUploadingImage(index);
    try {
      // Step 1: Request presigned URL from backend
      const urlResponse = await fetch("/api/upload/item-image/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "image/jpeg",
        }),
      });
      
      if (!urlResponse.ok) {
        throw new Error("فشل الحصول على رابط الرفع");
      }
      
      const { uploadURL, objectPath } = await urlResponse.json();
      
      // Step 2: Upload file directly to Google Cloud Storage
      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/jpeg" },
      });
      
      if (!uploadResponse.ok) {
        throw new Error("فشل رفع الصورة");
      }
      
      // Step 3: Finalize upload (set ACL and get final path)
      const finalizeResponse = await fetch("/api/upload/item-image/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ objectPath }),
      });
      
      if (!finalizeResponse.ok) {
        throw new Error("فشل حفظ الصورة");
      }
      
      const { imageUrl } = await finalizeResponse.json();
      updateItem(index, "imageUrl", imageUrl);
      toast({ title: "تم رفع الصورة بنجاح" });
    } catch (error) {
      console.error("Image upload error:", error);
      toast({ title: "خطأ في رفع الصورة", variant: "destructive" });
    } finally {
      setUploadingImage(null);
    }
  };

  const removeItemImage = (index: number) => {
    updateItem(index, "imageUrl", "");
  };

  const addItem = () => {
    const newItems = [...items, createEmptyItem()];
    setItems(newItems);
    const newTotalPages = Math.ceil(newItems.length / ITEMS_PER_PAGE);
    setCurrentItemsPage(newTotalPages);
    setTimeout(() => {
      newItemRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
      const newTotalPages = Math.ceil((items.length - 1) / ITEMS_PER_PAGE);
      if (currentItemsPage > newTotalPages) {
        setCurrentItemsPage(Math.max(1, newTotalPages));
      }
    }
  };

  const duplicateItem = (index: number) => {
    const originalItem = items[index];
    const duplicatedItem: Partial<ShipmentItem> = {
      ...originalItem,
      id: undefined,
      lineNo: undefined,
      imageUrl: undefined,
    };
    const newItems = [
      ...items.slice(0, index + 1),
      duplicatedItem,
      ...items.slice(index + 1),
    ];
    setItems(newItems);
    const newTotalPages = Math.ceil(newItems.length / ITEMS_PER_PAGE);
    const targetPage = Math.floor((index + 1) / ITEMS_PER_PAGE) + 1;
    setCurrentItemsPage(targetPage);
    setTimeout(() => {
      const newItemElement = document.querySelector(`[data-testid="item-row-${index + 1}"]`);
      if (newItemElement) {
        newItemElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    const newItems = [...items];
    (newItems[index] as Record<string, unknown>)[field] = value;

    const item = newItems[index];
    const ctn = item.cartonsCtn || 0;
    const pcs = item.piecesPerCartonPcs || 0;
    const pri = parseFloat(item.purchasePricePerPiecePriRmb?.toString() || "0");
    const cou = ctn * pcs;
    item.totalPiecesCou = cou;
    item.totalPurchaseCostRmb = (cou * pri).toFixed(2);

    setItems(newItems);
  };

  // Calculate totals
  const totalCartons = items.reduce((sum, item) => sum + (item.cartonsCtn || 0), 0);
  const totalPieces = items.reduce((sum, item) => sum + (item.totalPiecesCou || 0), 0);
  
  const totalPurchaseCostRmb = items.reduce(
    (sum, item) => sum + parseFloat(item.totalPurchaseCostRmb?.toString() || "0"),
    0
  );

  const commissionRmb =
    (totalPurchaseCostRmb * parseFloat(shippingData.commissionRatePercent)) / 100;

  const shippingCostUsd =
    parseFloat(shippingData.shippingAreaSqm) *
    parseFloat(shippingData.shippingCostPerSqmUsdOriginal);

  const shippingCostRmb = shippingCostUsd * parseFloat(shippingData.usdToRmbRate);
  const purchaseRate = parseFloat(shipmentData.purchaseRmbToEgpRate || "0");
  const shippingRmbToEgp = parseFloat(shippingData.rmbToEgpRate);
  const purchaseCostEgp = totalPurchaseCostRmb * purchaseRate;
  const partialDiscountRmb = parseFloat(shipmentData.partialDiscountRmb || "0");
  const partialDiscountEgp = partialDiscountRmb * purchaseRate;
  const discountedPurchaseCostEgp = purchaseCostEgp - partialDiscountEgp;
  const commissionEgp = commissionRmb * shippingRmbToEgp;
  const shippingCostEgp = shippingCostRmb * shippingRmbToEgp;

  // Calculate customs totals - now per piece instead of per carton
  const totalCustomsCostEgp = items.reduce((sum, item) => {
    const cou = item.totalPiecesCou || 0;
    const customsPerPiece = parseFloat(item.customsCostPerCartonEgp?.toString() || "0");
    return sum + cou * customsPerPiece;
  }, 0);

  const totalTakhreegCostEgp = items.reduce((sum, item) => {
    const ctn = item.cartonsCtn || 0;
    const takhreegPerCarton = parseFloat(item.takhreegCostPerCartonEgp?.toString() || "0");
    return sum + ctn * takhreegPerCarton;
  }, 0);

  const totalMissingCostEgp = items.reduce((sum, item) => {
    return sum + parseFloat(item.missingCostEgp || "0");
  }, 0);

  const finalTotalCostEgp =
    discountedPurchaseCostEgp + commissionEgp + shippingCostEgp + totalCustomsCostEgp + totalTakhreegCostEgp - totalMissingCostEgp;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("ar-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  if (!isNew && loadingShipment) {
    return <WizardSkeleton />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            {isNew ? "إضافة شحنة جديدة" : `تعديل الشحنة: ${shipmentData.shipmentName}`}
          </h1>
          <p className="text-muted-foreground mt-1">
            {STEPS[currentStep - 1].description}
          </p>
        </div>
      </div>

      {/* Progress Stepper */}
      <div className="flex items-center justify-center gap-2 overflow-x-auto pb-2">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = currentStep === step.id;
          const isCompleted = currentStep > step.id;

          return (
            <div key={step.id} className="flex items-center">
              <button
                onClick={() => setCurrentStep(step.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isCompleted
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
                data-testid={`step-${step.id}`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium whitespace-nowrap">{step.title}</span>
              </button>
              {index < STEPS.length - 1 && (
                <ArrowLeft className="w-5 h-5 mx-2 text-muted-foreground" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {currentStep === 1 && (
            <Step1Import
              shipmentData={shipmentData}
              setShipmentData={setShipmentData}
              items={items}
              updateItem={updateItem}
              addItem={addItem}
              removeItem={removeItem}
              duplicateItem={duplicateItem}
              suppliers={suppliers || []}
              productTypes={productTypes}
              isNew={isNew}
              handleImageUpload={handleImageUpload}
              removeItemImage={removeItemImage}
              uploadingImage={uploadingImage}
              currentItemsPage={currentItemsPage}
              setCurrentItemsPage={setCurrentItemsPage}
              totalCartons={totalCartons}
              totalPieces={totalPieces}
              newItemRef={newItemRef}
              refreshRates={refreshShippingRates}
              isRefreshing={refreshRatesMutation.isPending}
            />
          )}

          {currentStep === 2 && (
            <Step2Shipping
              shipmentData={shipmentData}
              setShipmentData={setShipmentData}
              shippingData={shippingData}
              setShippingData={setShippingData}
              shippingCompanies={shippingCompanies || []}
              totalPurchaseCostRmb={totalPurchaseCostRmb}
              commissionRmb={commissionRmb}
              commissionEgp={commissionEgp}
              shippingCostUsd={shippingCostUsd}
              shippingCostRmb={shippingCostRmb}
              shippingCostEgp={shippingCostEgp}
              refreshRates={refreshShippingRates}
              isRefreshing={refreshRatesMutation.isPending}
            />
          )}

          {currentStep === 3 && (
            <Step3Customs
              items={items}
              updateItem={updateItem}
              totalCustomsCostEgp={totalCustomsCostEgp}
              totalTakhreegCostEgp={totalTakhreegCostEgp}
            />
          )}

          {currentStep === 4 && (
            <Step4MissingPieces
              shipmentId={id}
              items={items}
              setItems={setItems}
              purchaseRate={purchaseRate}
              totalShipmentPieces={totalPieces}
              commissionEgp={commissionEgp}
              shippingCostEgp={shippingCostEgp}
              totalCustomsCostEgp={totalCustomsCostEgp}
              totalTakhreegCostEgp={totalTakhreegCostEgp}
            />
          )}

          {currentStep === 5 && (
            <Step5Summary
              shipmentData={shipmentData}
              shippingCompanyName={
                shippingCompanies?.find(
                  (company) => company.id === shipmentData.shippingCompanyId,
                )?.name || ""
              }
              items={items}
              totalPurchaseCostRmb={totalPurchaseCostRmb}
              purchaseCostEgp={purchaseCostEgp}
              discountedPurchaseCostEgp={discountedPurchaseCostEgp}
              partialDiscountRmb={partialDiscountRmb}
              partialDiscountEgp={partialDiscountEgp}
              commissionRmb={commissionRmb}
              commissionEgp={commissionEgp}
              shippingCostRmb={shippingCostRmb}
              shippingCostEgp={shippingCostEgp}
              totalCustomsCostEgp={totalCustomsCostEgp}
              totalTakhreegCostEgp={totalTakhreegCostEgp}
              finalTotalCostEgp={finalTotalCostEgp}
              purchaseRate={purchaseRate}
            />
          )}
        </div>

        {/* Cost Summary Sidebar */}
        <Card className="h-fit lg:sticky lg:top-6 z-40">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">ملخص التكاليف</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SummaryRow
              label="تكلفة الشراء (RMB)"
              value={`¥ ${formatCurrency(totalPurchaseCostRmb)}`}
            />
            {partialDiscountRmb > 0 && (
              <SummaryRow
                label="الخصم (RMB)"
                value={`- ¥ ${formatCurrency(partialDiscountRmb)}`}
              />
            )}
            <SummaryRow
              label="صافي التكلفة (RMB)"
              value={`¥ ${formatCurrency(totalPurchaseCostRmb - partialDiscountRmb)}`}
            />
            <SummaryRow
              label="صافي التكلفة (ج.م)"
              value={`${formatCurrency(discountedPurchaseCostEgp)} ج.م`}
            />
            <hr className="border-border" />
            <SummaryRow
              label="العمولة (RMB)"
              value={`¥ ${formatCurrency(commissionRmb)}`}
            />
            <SummaryRow
              label="العمولة (ج.م)"
              value={`${formatCurrency(commissionEgp)} ج.م`}
            />
            <hr className="border-border" />
            <SummaryRow
              label="الشحن (RMB)"
              value={`¥ ${formatCurrency(shippingCostRmb)}`}
            />
            <SummaryRow
              label="الشحن (ج.م)"
              value={`${formatCurrency(shippingCostEgp)} ج.م`}
            />
            <hr className="border-border" />
            <SummaryRow
              label="الجمارك (ج.م)"
              value={`${formatCurrency(totalCustomsCostEgp)} ج.م`}
            />
            <SummaryRow
              label="التخريج (ج.م)"
              value={`${formatCurrency(totalTakhreegCostEgp)} ج.م`}
            />
            {totalMissingCostEgp > 0 && (
              <>
                <hr className="border-border" />
                <SummaryRow
                  label="النواقص (ج.م)"
                  value={`- ${formatCurrency(totalMissingCostEgp)} ج.م`}
                  className="text-destructive"
                />
              </>
            )}
            <hr className="border-border" />
            <div className="flex justify-between items-center font-bold text-lg">
              <span>الإجمالي النهائي</span>
              <span className="text-primary">{formatCurrency(finalTotalCostEgp)} ج.م</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between gap-4 pt-4 border-t">
        <Button
          variant="outline"
          onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
          disabled={currentStep === 1}
          data-testid="button-prev"
        >
          <ArrowRight className="w-4 h-4 ml-2" />
          السابق
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => saveMutation.mutate({ step: currentStep })}
            disabled={saveMutation.isPending}
            data-testid="button-save"
          >
            <Save className="w-4 h-4 ml-2" />
            {saveMutation.isPending ? "جاري الحفظ..." : "حفظ"}
          </Button>
          {currentStep < 5 ? (
            <Button
              onClick={async () => {
                if (currentStep === 4 && id && !isNew) {
                  await saveMissingPiecesMutation.mutateAsync();
                }
                setCurrentStep(currentStep + 1);
              }}
              disabled={saveMissingPiecesMutation.isPending}
              data-testid="button-next"
            >
              {saveMissingPiecesMutation.isPending ? "جاري الحفظ..." : "التالي"}
              <ArrowLeft className="w-4 h-4 mr-2" />
            </Button>
          ) : (
            <Button
              onClick={() => {
                saveMutation.mutate({ step: 5 });
              }}
              data-testid="button-finish"
            >
              إنهاء واستلام
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Step 1: Import Items
function Step1Import({
  shipmentData,
  setShipmentData,
  items,
  updateItem,
  addItem,
  removeItem,
  duplicateItem,
  suppliers,
  productTypes,
  isNew,
  handleImageUpload,
  removeItemImage,
  uploadingImage,
  currentItemsPage,
  setCurrentItemsPage,
  totalCartons,
  totalPieces,
  newItemRef,
  refreshRates,
  isRefreshing,
}: {
  shipmentData: {
    shipmentCode: string;
    shipmentName: string;
    purchaseDate: string;
    status: string;
    purchaseRmbToEgpRate: string;
    partialDiscountRmb: string;
    discountNotes: string;
    shippingCompanyId: number | null;
  };
  setShipmentData: (data: {
    shipmentCode: string;
    shipmentName: string;
    purchaseDate: string;
    status: string;
    purchaseRmbToEgpRate: string;
    partialDiscountRmb: string;
    discountNotes: string;
    shippingCompanyId: number | null;
  }) => void;
  items: Partial<ShipmentItem>[];
  updateItem: (index: number, field: string, value: string | number) => void;
  addItem: () => void;
  removeItem: (index: number) => void;
  duplicateItem: (index: number) => void;
  suppliers: Supplier[];
  productTypes: ProductType[] | undefined;
  isNew: boolean;
  handleImageUpload: (index: number, file: File) => Promise<void>;
  removeItemImage: (index: number) => void;
  uploadingImage: number | null;
  currentItemsPage: number;
  setCurrentItemsPage: (page: number) => void;
  totalCartons: number;
  totalPieces: number;
  newItemRef: React.RefObject<HTMLDivElement>;
  refreshRates: () => void;
  isRefreshing: boolean;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
  const startIndex = (currentItemsPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedItems = items.slice(startIndex, endIndex);

  const filteredItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => 
      item.productName && 
      item.productName.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .slice(0, 5);

  const navigateToItem = (itemIndex: number) => {
    const targetPage = Math.floor(itemIndex / ITEMS_PER_PAGE) + 1;
    setCurrentItemsPage(targetPage);
    setSearchOpen(false);
    setSearchQuery("");
    setTimeout(() => {
      const itemElement = document.querySelector(`[data-testid="item-row-${itemIndex}"]`);
      if (itemElement) {
        itemElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  };

  return (
    <div className="space-y-6">
      {/* Sticky Shipment Info */}
      <Card className="sticky top-0 z-50 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Ship className="w-5 h-5" />
              بيانات الشحنة
            </CardTitle>
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <Badge variant="secondary" className="text-sm">
                عدد البنود: {items.length}
              </Badge>
              <Badge variant="secondary" className="text-sm">
                إجمالي الكراتين: {totalCartons}
              </Badge>
              <Badge variant="secondary" className="text-sm">
                إجمالي القطع: {totalPieces}
              </Badge>
              <div className="flex-1 lg:flex-none" />
              
              {/* Item Search Autocomplete */}
              <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    data-testid="button-search-items"
                  >
                    <Search className="w-4 h-4" />
                    بحث في البنود
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="end">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="ابحث باسم المنتج..."
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                      data-testid="input-search-items"
                    />
                    <CommandList>
                      {searchQuery.length > 0 && filteredItems.length === 0 && (
                        <CommandEmpty>لا توجد نتائج</CommandEmpty>
                      )}
                      {searchQuery.length > 0 && filteredItems.length > 0 && (
                        <CommandGroup heading="النتائج (أقصى 5)">
                          {filteredItems.map(({ item, index }) => (
                            <CommandItem
                              key={index}
                              value={`item-${index}`}
                              onSelect={() => navigateToItem(index)}
                              className="flex items-center gap-2 cursor-pointer"
                              data-testid={`search-result-${index}`}
                            >
                              <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="truncate text-sm">
                                  {item.productName}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  البند {index + 1}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                      {searchQuery.length === 0 && (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          اكتب للبحث في أسماء المنتجات
                        </div>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              
              <Button
                variant="outline"
                size="sm"
                onClick={refreshRates}
                disabled={isRefreshing}
                data-testid="button-refresh-exchange-rate"
              >
                <RefreshCw className={`w-4 h-4 ml-2 ${isRefreshing ? "animate-spin" : ""}`} />
                {isRefreshing ? "جاري التحديث..." : "تحديث سعر الصرف"}
              </Button>
              <Button size="sm" onClick={addItem} data-testid="button-add-item">
                <Plus className="w-4 h-4 ml-2" />
                إضافة بند
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shipmentCode">رقم الشحنة *</Label>
              <Input
                id="shipmentCode"
                value={shipmentData.shipmentCode}
                onChange={(e) =>
                  setShipmentData({ ...shipmentData, shipmentCode: e.target.value })
                }
                placeholder="SHP-001"
                data-testid="input-shipment-code"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shipmentName">اسم الشحنة *</Label>
              <Input
                id="shipmentName"
                value={shipmentData.shipmentName}
                onChange={(e) =>
                  setShipmentData({ ...shipmentData, shipmentName: e.target.value })
                }
                placeholder="شحنة ملابس شتوية"
                data-testid="input-shipment-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchaseDate">تاريخ الشراء *</Label>
              <Input
                id="purchaseDate"
                type="date"
                value={shipmentData.purchaseDate}
                onChange={(e) =>
                  setShipmentData({ ...shipmentData, purchaseDate: e.target.value })
                }
                data-testid="input-purchase-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchaseRate">سعر صرف الرممبي</Label>
              <Input
                id="purchaseRate"
                type="number"
                step="0.0001"
                value={shipmentData.purchaseRmbToEgpRate || ""}
                onChange={(e) =>
                  setShipmentData({
                    ...shipmentData,
                    purchaseRmbToEgpRate: e.target.value,
                  })
                }
                placeholder="7.0000"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
            <div className="space-y-2">
              <Label htmlFor="partialDiscountRmb">خصم جزئي (رممبي)</Label>
              <Input
                id="partialDiscountRmb"
                type="number"
                step="0.01"
                value={shipmentData.partialDiscountRmb || "0"}
                onChange={(e) =>
                  setShipmentData({
                    ...shipmentData,
                    partialDiscountRmb: e.target.value,
                  })
                }
                placeholder="0.00"
                data-testid="input-partial-discount-rmb"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="discountNotes">ملاحظات الخصم</Label>
              <Input
                id="discountNotes"
                value={shipmentData.discountNotes || ""}
                onChange={(e) =>
                  setShipmentData({
                    ...shipmentData,
                    discountNotes: e.target.value,
                  })
                }
                placeholder="ملاحظات اختيارية..."
                data-testid="input-discount-notes"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="pb-4 flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="w-5 h-5" />
            بنود الشحنة ({items.length})
          </CardTitle>
          {totalPages > 1 && (
            <div className="text-sm text-muted-foreground">
              صفحة {currentItemsPage} من {totalPages}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {paginatedItems.map((item, pageIndex) => {
            const actualIndex = startIndex + pageIndex;
            const isLastItem = actualIndex === items.length - 1;
            
            return (
              <div
                key={actualIndex}
                ref={isLastItem ? newItemRef : null}
                className="p-4 border rounded-md space-y-4 bg-card"
                data-testid={`item-row-${actualIndex}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">البند {actualIndex + 1}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => duplicateItem(actualIndex)}
                      title="نسخ البند"
                      data-testid={`button-duplicate-item-${actualIndex}`}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    {items.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(actualIndex)}
                        className="text-destructive"
                        data-testid={`button-remove-item-${actualIndex}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>المورد</Label>
                    <Select
                      value={item.supplierId?.toString() || ""}
                      onValueChange={(value) =>
                        updateItem(actualIndex, "supplierId", parseInt(value))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر المورد" />
                      </SelectTrigger>
                      <SelectContent>
                        {(suppliers || []).map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id.toString()}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>نوع الصنف (TYP)</Label>
                    <Select
                      value={item.productTypeId?.toString() || ""}
                      onValueChange={(value) =>
                        updateItem(actualIndex, "productTypeId", parseInt(value))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر نوع الصنف" />
                      </SelectTrigger>
                      <SelectContent>
                        {(productTypes || []).map((type) => (
                          <SelectItem key={type.id} value={type.id.toString()}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>اسم المنتج *</Label>
                  <Input
                    value={item.productName || ""}
                    onChange={(e) => updateItem(actualIndex, "productName", e.target.value)}
                    placeholder="قميص رجالي قطن"
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <Label>بلد المنشأ</Label>
                    <Input
                      value={item.countryOfOrigin || "الصين"}
                      onChange={(e) => updateItem(actualIndex, "countryOfOrigin", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>عدد الكراتين (CTN)</Label>
                    <Input
                      type="number"
                      value={item.cartonsCtn || 0}
                      onChange={(e) =>
                        updateItem(actualIndex, "cartonsCtn", parseInt(e.target.value) || 0)
                      }
                      min="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>قطع/كرتونة (PCS)</Label>
                    <Input
                      type="number"
                      value={item.piecesPerCartonPcs || 0}
                      onChange={(e) =>
                        updateItem(actualIndex, "piecesPerCartonPcs", parseInt(e.target.value) || 0)
                      }
                      min="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>إجمالي القطع (COU)</Label>
                    <Input
                      value={item.totalPiecesCou || 0}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>سعر القطعة (RMB)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.purchasePricePerPiecePriRmb || "0"}
                      onChange={(e) =>
                        updateItem(actualIndex, "purchasePricePerPiecePriRmb", e.target.value)
                      }
                      min="0"
                    />
                  </div>
                </div>
                {/* Image Upload & Total Section */}
                <div className="flex flex-col md:flex-row items-start md:items-center gap-4 pt-4 border-t">
                  <div className="flex items-center gap-3">
                    <Label className="whitespace-nowrap">صورة البند:</Label>
                    {item.imageUrl ? (
                      <div className="relative group">
                        <ItemImage src={item.imageUrl} alt={item.productName || "صورة البند"} size="lg" />
                        <button
                          type="button"
                          onClick={() => removeItemImage(actualIndex)}
                          className="absolute -top-2 -left-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer">
                        <div className="flex items-center gap-2 px-3 py-2 border border-dashed rounded-md hover:bg-muted/50 transition-colors">
                          {uploadingImage === actualIndex ? (
                            <span className="text-sm text-muted-foreground">جاري الرفع...</span>
                          ) : (
                            <>
                              <Upload className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">اختر صورة</span>
                            </>
                          )}
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleImageUpload(actualIndex, file);
                            }
                            e.target.value = "";
                          }}
                          disabled={uploadingImage !== null}
                        />
                      </label>
                    )}
                  </div>
                  <div className="flex-1" />
                  <div className="bg-primary/10 px-4 py-3 rounded-md w-full md:w-auto">
                    <span className="text-sm text-muted-foreground ml-2">
                      إجمالي البند:
                    </span>
                    <span className="font-bold text-primary">
                      ¥ {new Intl.NumberFormat("ar-EG").format(parseFloat(item.totalPurchaseCostRmb?.toString() || "0"))}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentItemsPage(Math.max(1, currentItemsPage - 1))}
                disabled={currentItemsPage === 1}
                data-testid="button-prev-page"
              >
                <ChevronRight className="w-4 h-4" />
                السابق
              </Button>
              
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <Button
                    key={page}
                    variant={currentItemsPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentItemsPage(page)}
                    data-testid={`button-page-${page}`}
                  >
                    {page}
                  </Button>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentItemsPage(Math.min(totalPages, currentItemsPage + 1))}
                disabled={currentItemsPage === totalPages}
                data-testid="button-next-page"
              >
                التالي
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Step 2: Shipping
export function Step2Shipping({
  shipmentData,
  setShipmentData,
  shippingData,
  setShippingData,
  shippingCompanies,
  totalPurchaseCostRmb,
  commissionRmb,
  commissionEgp,
  shippingCostUsd,
  shippingCostRmb,
  shippingCostEgp,
  refreshRates,
  isRefreshing,
}: {
  shipmentData: {
    shipmentCode: string;
    shipmentName: string;
    purchaseDate: string;
    status: string;
    purchaseRmbToEgpRate: string;
    partialDiscountRmb: string;
    discountNotes: string;
    shippingCompanyId: number | null;
  };
  setShipmentData: (data: {
    shipmentCode: string;
    shipmentName: string;
    purchaseDate: string;
    status: string;
    purchaseRmbToEgpRate: string;
    partialDiscountRmb: string;
    discountNotes: string;
    shippingCompanyId: number | null;
  }) => void;
  shippingData: {
    commissionRatePercent: string;
    shippingAreaSqm: string;
    shippingCostPerSqmUsdOriginal: string;
    shippingDate: string;
    rmbToEgpRate: string;
    usdToRmbRate: string;
    ratesUpdatedAt: string;
  };
  setShippingData: (data: {
    commissionRatePercent: string;
    shippingAreaSqm: string;
    shippingCostPerSqmUsdOriginal: string;
    shippingDate: string;
    rmbToEgpRate: string;
    usdToRmbRate: string;
    ratesUpdatedAt: string;
  }) => void;
  shippingCompanies: ShippingCompany[];
  totalPurchaseCostRmb: number;
  commissionRmb: number;
  commissionEgp: number;
  shippingCostUsd: number;
  shippingCostRmb: number;
  shippingCostEgp: number;
  refreshRates: () => void;
  isRefreshing: boolean;
}) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("ar-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          آخر تحديث لسعر الصرف:
          {shippingData.ratesUpdatedAt
            ? ` ${new Date(shippingData.ratesUpdatedAt).toLocaleString("ar-EG")}`
            : " لم يتم التحديث بعد"}
        </div>
        <Button variant="outline" size="sm" onClick={refreshRates} disabled={isRefreshing} data-testid="button-refresh-rates">
          <RefreshCw className={`w-4 h-4 ml-2 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "جاري التحديث..." : "تحديث الأسعار"}
        </Button>
      </div>

      {/* Read-only Total */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">إجمالي تكلفة الشراء (RMB)</span>
            <span className="text-2xl font-bold text-primary">
              ¥ {formatCurrency(totalPurchaseCostRmb)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Commission */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">العمولة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>نسبة العمولة %</Label>
              <Input
                type="number"
                step="0.1"
                value={shippingData.commissionRatePercent}
                onChange={(e) =>
                  setShippingData({
                    ...shippingData,
                    commissionRatePercent: e.target.value,
                  })
                }
                min="0"
                data-testid="input-commission-rate"
              />
            </div>
            <div className="space-y-2">
              <Label>قيمة العمولة (RMB)</Label>
              <Input
                value={`¥ ${formatCurrency(commissionRmb)}`}
                readOnly
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>قيمة العمولة (ج.م)</Label>
              <Input
                value={`${formatCurrency(commissionEgp)} ج.م`}
                readOnly
                className="bg-muted font-bold text-primary"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shipping Cost */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">تكلفة الشحن</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>اسم شركة الشحن</Label>
              <Select
                value={shipmentData.shippingCompanyId?.toString() || ""}
                onValueChange={(value) =>
                  setShipmentData({
                    ...shipmentData,
                    shippingCompanyId: value ? parseInt(value, 10) : null,
                  })
                }
              >
                <SelectTrigger data-testid="select-shipping-company">
                  <SelectValue placeholder="اختر شركة الشحن…" />
                </SelectTrigger>
              <SelectContent>
                  {shippingCompanies.map((company) => (
                    <SelectItem key={company.id} value={company.id.toString()}>
                      {company.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
            <div className="space-y-2">
              <Label>مساحة الشحن (م²)</Label>
              <Input
                type="number"
                step="0.01"
                value={shippingData.shippingAreaSqm}
                onChange={(e) =>
                  setShippingData({ ...shippingData, shippingAreaSqm: e.target.value })
                }
                min="0"
                data-testid="input-shipping-area"
              />
            </div>
            <div className="space-y-2">
              <Label>سعر الشحن/م² (USD)</Label>
              <Input
                type="number"
                step="0.01"
                value={shippingData.shippingCostPerSqmUsdOriginal}
                onChange={(e) =>
                  setShippingData({
                    ...shippingData,
                    shippingCostPerSqmUsdOriginal: e.target.value,
                  })
                }
                min="0"
                data-testid="input-shipping-cost-usd"
              />
            </div>
            <div className="space-y-2">
              <Label>تاريخ الشحن</Label>
              <Input
                type="date"
                value={shippingData.shippingDate}
                onChange={(e) =>
                  setShippingData({ ...shippingData, shippingDate: e.target.value })
                }
                data-testid="input-shipping-date"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>سعر صرف USD → RMB</Label>
              <Input
                type="number"
                step="0.0001"
                value={shippingData.usdToRmbRate}
                onChange={(e) =>
                  setShippingData({ ...shippingData, usdToRmbRate: e.target.value })
                }
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label>سعر صرف RMB → EGP</Label>
              <Input
                type="number"
                step="0.0001"
                value={shippingData.rmbToEgpRate}
                onChange={(e) =>
                  setShippingData({ ...shippingData, rmbToEgpRate: e.target.value })
                }
                min="0"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
            <div className="bg-muted/50 p-4 rounded-md">
              <p className="text-sm text-muted-foreground mb-2">إجمالي الشحن (USD)</p>
              <p className="text-lg font-bold">$ {formatCurrency(shippingCostUsd)}</p>
            </div>
            <div className="bg-muted/50 p-4 rounded-md">
              <p className="text-sm text-muted-foreground mb-2">إجمالي الشحن (RMB)</p>
              <p className="text-lg font-bold">¥ {formatCurrency(shippingCostRmb)}</p>
            </div>
            <div className="bg-primary/10 p-4 rounded-md">
              <p className="text-sm text-muted-foreground mb-2">إجمالي الشحن (ج.م)</p>
              <p className="text-lg font-bold text-primary">
                {formatCurrency(shippingCostEgp)} ج.م
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Step 3: Customs
function Step3Customs({
  items,
  updateItem,
  totalCustomsCostEgp,
  totalTakhreegCostEgp,
}: {
  items: Partial<ShipmentItem>[];
  updateItem: (index: number, field: string, value: string | number) => void;
  totalCustomsCostEgp: number;
  totalTakhreegCostEgp: number;
}) {
  const [applyCustomsToAll, setApplyCustomsToAll] = useState(false);
  const [applyTakhreegToAll, setApplyTakhreegToAll] = useState(false);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("ar-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const handleApplyCustomsToAll = (checked: boolean | "indeterminate") => {
    const isChecked = checked === true;
    setApplyCustomsToAll(isChecked);
    if (isChecked && items.length > 1) {
      const firstItemCustoms = items[0]?.customsCostPerCartonEgp || "";
      for (let i = 1; i < items.length; i++) {
        updateItem(i, "customsCostPerCartonEgp", firstItemCustoms);
      }
    }
  };

  const handleApplyTakhreegToAll = (checked: boolean | "indeterminate") => {
    const isChecked = checked === true;
    setApplyTakhreegToAll(isChecked);
    if (isChecked && items.length > 1) {
      const firstItemTakhreeg = items[0]?.takhreegCostPerCartonEgp || "";
      for (let i = 1; i < items.length; i++) {
        updateItem(i, "takhreegCostPerCartonEgp", firstItemTakhreeg);
      }
    }
  };

  const handleFirstItemCustomsChange = (value: string) => {
    updateItem(0, "customsCostPerCartonEgp", value);
    if (applyCustomsToAll && items.length > 1) {
      for (let i = 1; i < items.length; i++) {
        updateItem(i, "customsCostPerCartonEgp", value);
      }
    }
  };

  const handleFirstItemTakhreegChange = (value: string) => {
    updateItem(0, "takhreegCostPerCartonEgp", value);
    if (applyTakhreegToAll && items.length > 1) {
      for (let i = 1; i < items.length; i++) {
        updateItem(i, "takhreegCostPerCartonEgp", value);
      }
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileCheck className="w-5 h-5" />
            الجمارك والتخريج
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, index) => {
            const ctn = item.cartonsCtn || 0;
            const cou = item.totalPiecesCou || 0;
            const customsPerPiece = parseFloat(
              item.customsCostPerCartonEgp?.toString() || "0"
            );
            const takhreegPerCarton = parseFloat(
              item.takhreegCostPerCartonEgp?.toString() || "0"
            );
            const totalCustoms = cou * customsPerPiece;
            const totalTakhreeg = ctn * takhreegPerCarton;

            const isFirstItem = index === 0;

            return (
              <div key={index}>
                <div
                  className="p-4 border rounded-md bg-card"
                  data-testid={`customs-item-${index}`}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <ItemImage src={item.imageUrl} alt={item.productName || "صورة البند"} size="lg" />
                    <div className="flex-1">
                      <span className="font-medium">{item.productName || `البند ${item.lineNo || (index + 1)}`}</span>
                      <span className="text-sm text-muted-foreground mr-2">
                        ({ctn} كرتونة - {cou} قطعة)
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>جمرك/قطعة (ج.م)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.customsCostPerCartonEgp || ""}
                        onChange={(e) =>
                          isFirstItem
                            ? handleFirstItemCustomsChange(e.target.value)
                            : updateItem(index, "customsCostPerCartonEgp", e.target.value)
                        }
                        min="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>إجمالي الجمرك (ج.م)</Label>
                      <Input
                        value={formatCurrency(totalCustoms)}
                        readOnly
                        className="bg-muted"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>تخريج/كرتونة (ج.م)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.takhreegCostPerCartonEgp || ""}
                        onChange={(e) =>
                          isFirstItem
                            ? handleFirstItemTakhreegChange(e.target.value)
                            : updateItem(index, "takhreegCostPerCartonEgp", e.target.value)
                        }
                        min="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>إجمالي التخريج (ج.م)</Label>
                      <Input
                        value={formatCurrency(totalTakhreeg)}
                        readOnly
                        className="bg-muted"
                      />
                    </div>
                  </div>
                </div>
                
                {isFirstItem && items.length > 1 && (
                  <div className="flex flex-wrap gap-6 mt-3 p-3 bg-muted/50 rounded-md border border-dashed">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="apply-customs-all"
                        checked={applyCustomsToAll}
                        onCheckedChange={handleApplyCustomsToAll}
                        data-testid="checkbox-apply-customs-all"
                      />
                      <Label htmlFor="apply-customs-all" className="text-sm cursor-pointer">
                        تطبيق الجمرك على الكل
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="apply-takhreeg-all"
                        checked={applyTakhreegToAll}
                        onCheckedChange={handleApplyTakhreegToAll}
                        data-testid="checkbox-apply-takhreeg-all"
                      />
                      <Label htmlFor="apply-takhreeg-all" className="text-sm cursor-pointer">
                        تطبيق التخريج على الكل
                      </Label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
            <div className="bg-amber-100 dark:bg-amber-900/30 p-4 rounded-md">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                إجمالي الجمارك للشحنة
              </p>
              <p className="text-2xl font-bold text-amber-900 dark:text-amber-200">
                {formatCurrency(totalCustomsCostEgp)} ج.م
              </p>
            </div>
            <div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-md">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                إجمالي التخريج للشحنة
              </p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-200">
                {formatCurrency(totalTakhreegCostEgp)} ج.م
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Step 4: Missing Pieces
function Step4MissingPieces({
  shipmentId,
  items,
  setItems,
  purchaseRate,
  totalShipmentPieces,
  commissionEgp,
  shippingCostEgp,
  totalCustomsCostEgp,
  totalTakhreegCostEgp,
}: {
  shipmentId?: string;
  items: Partial<ShipmentItem>[];
  setItems: (items: Partial<ShipmentItem>[]) => void;
  purchaseRate: number;
  totalShipmentPieces: number;
  commissionEgp: number;
  shippingCostEgp: number;
  totalCustomsCostEgp: number;
  totalTakhreegCostEgp: number;
}) {
  const ITEMS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("ar-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const calculateUnitCost = (item: Partial<ShipmentItem>) => {
    const itemPurchaseCostEgp = parseFloat(item.totalPurchaseCostRmb || "0") * purchaseRate;
    const pieceRatio = totalShipmentPieces > 0 ? (item.totalPiecesCou || 0) / totalShipmentPieces : 0;
    const itemShareOfExtras = pieceRatio * (totalCustomsCostEgp + totalTakhreegCostEgp + shippingCostEgp + commissionEgp);
    const itemTotalCostEgp = itemPurchaseCostEgp + itemShareOfExtras;
    const unitCostEgp = (item.totalPiecesCou || 0) > 0 ? itemTotalCostEgp / (item.totalPiecesCou || 1) : 0;
    return unitCostEgp;
  };

  const updateMissingPieces = (globalIndex: number, value: number) => {
    const item = items[globalIndex];
    const maxPieces = item.totalPiecesCou || 0;
    const safeValue = Math.max(0, Math.min(value, maxPieces));
    const unitCost = calculateUnitCost(item);
    const missingCost = safeValue * unitCost;
    
    const newItems = [...items];
    newItems[globalIndex] = {
      ...newItems[globalIndex],
      missingPieces: safeValue,
      missingCostEgp: missingCost.toFixed(2),
    };
    setItems(newItems);
  };

  const totalMissingPieces = items.reduce((sum, item) => sum + (item.missingPieces || 0), 0);
  const totalMissingCostEgp = items.reduce((sum, item) => sum + parseFloat(item.missingCostEgp || "0"), 0);

  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentItems = items.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            القطع الناقصة
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            حدد عدد القطع الناقصة أو التالفة لكل صنف. سيتم خصم قيمتها من إجمالي تكلفة الشحنة.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-right py-3 px-2 font-medium">#</th>
                  <th className="text-right py-3 px-2 font-medium">الصورة</th>
                  <th className="text-right py-3 px-2 font-medium">اسم الصنف</th>
                  <th className="text-right py-3 px-2 font-medium">إجمالي القطع</th>
                  <th className="text-right py-3 px-2 font-medium">تكلفة القطعة</th>
                  <th className="text-right py-3 px-2 font-medium min-w-[120px]">النواقص</th>
                  <th className="text-right py-3 px-2 font-medium">تكلفة النواقص</th>
                </tr>
              </thead>
              <tbody>
                {currentItems.map((item, pageIndex) => {
                  const globalIndex = startIndex + pageIndex;
                  const unitCost = calculateUnitCost(item);
                  const missingPieces = item.missingPieces || 0;
                  const missingCost = parseFloat(item.missingCostEgp || "0");

                  return (
                    <tr key={item.id || globalIndex} className="border-b hover-elevate" data-testid={`missing-row-${globalIndex}`}>
                      <td className="py-3 px-2 text-muted-foreground">{item.lineNo || globalIndex + 1}</td>
                      <td className="py-3 px-2">
                        <ItemImage src={item.imageUrl} alt={item.productName || "صورة الصنف"} size="md" />
                      </td>
                      <td className="py-3 px-2 font-medium">{item.productName || "بدون اسم"}</td>
                      <td className="py-3 px-2">{item.totalPiecesCou || 0}</td>
                      <td className="py-3 px-2">{formatCurrency(unitCost)} ج.م</td>
                      <td className="py-3 px-2">
                        <Input
                          type="number"
                          min={0}
                          max={item.totalPiecesCou || 0}
                          value={missingPieces}
                          onChange={(e) => updateMissingPieces(globalIndex, parseInt(e.target.value) || 0)}
                          className="w-24"
                          data-testid={`input-missing-${globalIndex}`}
                        />
                      </td>
                      <td className="py-3 px-2">
                        {missingPieces > 0 ? (
                          <span className="text-destructive font-medium">
                            - {formatCurrency(missingCost)} ج.م
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                data-testid="button-missing-prev"
              >
                <ChevronRight className="w-4 h-4" />
                السابق
              </Button>
              <span className="text-sm text-muted-foreground px-4">
                صفحة {currentPage} من {totalPages} ({items.length} صنف)
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                data-testid="button-missing-next"
              >
                التالي
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 mt-4 border-t">
            <div className="bg-amber-100 dark:bg-amber-900/30 p-4 rounded-md">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                إجمالي القطع الناقصة
              </p>
              <p className="text-2xl font-bold text-amber-900 dark:text-amber-200">
                {totalMissingPieces} قطعة
              </p>
            </div>
            <div className="bg-destructive/10 p-4 rounded-md">
              <p className="text-sm text-destructive">
                إجمالي تكلفة النواقص
              </p>
              <p className="text-2xl font-bold text-destructive">
                - {formatCurrency(totalMissingCostEgp)} ج.م
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Step 5: Summary
function Step5Summary({
  shipmentData,
  shippingCompanyName,
  items,
  totalPurchaseCostRmb,
  purchaseCostEgp,
  discountedPurchaseCostEgp,
  partialDiscountRmb,
  partialDiscountEgp,
  commissionRmb,
  commissionEgp,
  shippingCostRmb,
  shippingCostEgp,
  totalCustomsCostEgp,
  totalTakhreegCostEgp,
  finalTotalCostEgp,
  purchaseRate,
}: {
  shipmentData: { shipmentCode: string; shipmentName: string; purchaseDate: string; status: string };
  shippingCompanyName?: string;
  items: Partial<ShipmentItem>[];
  totalPurchaseCostRmb: number;
  purchaseCostEgp: number;
  discountedPurchaseCostEgp: number;
  partialDiscountRmb: number;
  partialDiscountEgp: number;
  commissionRmb: number;
  commissionEgp: number;
  shippingCostRmb: number;
  shippingCostEgp: number;
  totalCustomsCostEgp: number;
  totalTakhreegCostEgp: number;
  finalTotalCostEgp: number;
  purchaseRate: number;
}) {
  const [isExporting, setIsExporting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("ar-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const totalCartons = items.reduce((sum, item) => sum + (item.cartonsCtn || 0), 0);
  const totalPieces = items.reduce((sum, item) => sum + (item.totalPiecesCou || 0), 0);

  const exportToPDF = useCallback(async () => {
    if (!contentRef.current) return;
    
    setIsExporting(true);
    try {
      const element = contentRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      // Add image to first page
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      
      // Add additional pages if content is too long
      let heightLeft = pdfHeight - pageHeight;
      let yOffset = -pageHeight;

      while (heightLeft > 0) {
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, yOffset, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
        yOffset -= pageHeight;
      }

      const fileName = `shipment-${shipmentData.shipmentCode}-${new Date().toISOString().split("T")[0]}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error("Error exporting PDF:", error);
    } finally {
      setIsExporting(false);
    }
  }, [shipmentData.shipmentCode]);

  return (
    <div className="space-y-6">
      {/* Export Button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={exportToPDF}
          disabled={isExporting}
          data-testid="button-export-pdf"
        >
          <FileDown className="w-4 h-4 ml-2" />
          {isExporting ? "جاري التصدير..." : "تصدير PDF"}
        </Button>
      </div>
      
      {/* Content to export */}
      <div ref={contentRef} className="space-y-6 bg-background p-4">
      {/* Shipment Info */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5" />
            ملخص الشحنة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">رقم الشحنة</p>
              <p className="font-medium">{shipmentData.shipmentCode}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">اسم الشحنة</p>
              <p className="font-medium">{shipmentData.shipmentName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">تاريخ الشراء</p>
              <p className="font-medium">
                {new Date(shipmentData.purchaseDate).toLocaleDateString("ar-EG")}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">الحالة</p>
              <p className="font-medium">{shipmentData.status}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">شركة الشحن</p>
              <p className="font-medium">{shippingCompanyName || "غير محدد"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items Summary */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">ملخص البنود</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-muted/50 p-4 rounded-md">
              <p className="text-2xl font-bold">{items.length}</p>
              <p className="text-sm text-muted-foreground">عدد الأصناف</p>
            </div>
            <div className="bg-muted/50 p-4 rounded-md">
              <p className="text-2xl font-bold">{totalCartons}</p>
              <p className="text-sm text-muted-foreground">إجمالي الكراتين</p>
            </div>
            <div className="bg-muted/50 p-4 rounded-md">
              <p className="text-2xl font-bold">{totalPieces}</p>
              <p className="text-sm text-muted-foreground">إجمالي القطع</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost Breakdown */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">تفصيل التكاليف</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CostRow
            label="تكلفة الشراء"
            rmbValue={`¥ ${formatCurrency(totalPurchaseCostRmb)}`}
            egpValue={`${formatCurrency(purchaseCostEgp)} ج.م`}
          />
          {partialDiscountRmb > 0 && (
            <>
              <CostRow
                label="الخصم"
                rmbValue={`- ¥ ${formatCurrency(partialDiscountRmb)}`}
                egpValue={`- ${formatCurrency(partialDiscountEgp)} ج.م`}
              />
              <CostRow
                label="بعد الخصم"
                rmbValue={`¥ ${formatCurrency(totalPurchaseCostRmb - partialDiscountRmb)}`}
                egpValue={`${formatCurrency(discountedPurchaseCostEgp)} ج.م`}
              />
            </>
          )}
          <CostRow
            label="العمولة"
            rmbValue={`¥ ${formatCurrency(commissionRmb)}`}
            egpValue={`${formatCurrency(commissionEgp)} ج.م`}
          />
          <CostRow
            label="الشحن"
            rmbValue={`¥ ${formatCurrency(shippingCostRmb)}`}
            egpValue={`${formatCurrency(shippingCostEgp)} ج.م`}
          />
          <CostRow
            label="الجمارك"
            rmbValue="-"
            egpValue={`${formatCurrency(totalCustomsCostEgp)} ج.م`}
          />
          <CostRow
            label="التخريج"
            rmbValue="-"
            egpValue={`${formatCurrency(totalTakhreegCostEgp)} ج.م`}
          />
          {/* Missing pieces deduction - calculated from items */}
          {items.some(item => (item.missingPieces || 0) > 0) && (
            <>
              <CostRow
                label="النواقص"
                rmbValue="-"
                egpValue={`- ${formatCurrency(items.reduce((sum, item) => sum + parseFloat(item.missingCostEgp || "0"), 0))} ج.م`}
              />
            </>
          )}
          <hr className="border-border my-4" />
          
          {/* RMB Total */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-md">
            <div className="flex items-start justify-between">
              <span className="text-lg font-bold">الإجمالي بالرممبي</span>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  ¥ {formatCurrency(discountedPurchaseCostEgp / purchaseRate + commissionRmb + shippingCostRmb)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  ≈ {formatCurrency((discountedPurchaseCostEgp / purchaseRate + commissionRmb + shippingCostRmb) * purchaseRate)} ج.م
                </p>
              </div>
            </div>
          </div>
          
          {/* EGP Total */}
          <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-md">
            <div className="flex items-start justify-between">
              <span className="text-lg font-bold">الإجمالي بالمصري</span>
              <div className="text-right">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(totalCustomsCostEgp + totalTakhreegCostEgp)} ج.م
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function CostRow({
  label,
  rmbValue,
  egpValue,
}: {
  label: string;
  rmbValue: string;
  egpValue: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="font-medium">{label}</span>
      <div className="flex gap-8">
        <span className="text-muted-foreground w-32 text-left">{rmbValue}</span>
        <span className="font-medium w-32 text-left">{egpValue}</span>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex justify-between items-center ${className || ""}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function WizardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="flex gap-2 justify-center">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-32" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}
