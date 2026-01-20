import { useState, useEffect, Fragment, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  CreditCard,
  Plus,
  Search,
  Ship,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  FileText,
  User,
  Filter,
  ChevronDown,
  ChevronUp,
  Receipt,
  ChevronsUpDown,
  Check,
  Building2,
  CheckCircle2,
  Download,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Hash,
} from "lucide-react";
import { toPng } from "html-to-image";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaymentAttachmentIcon } from "@/components/payment-attachment-icon";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, getErrorMessage, queryClient } from "@/lib/queryClient";
import { createRelatedPartiesQuery, getPartyOptions, type RelatedPartiesResponse } from "@/lib/relatedParties";
import { shipmentStatusColors } from "@/lib/colorMaps";
import { Switch } from "@/components/ui/switch";
import type {
  Shipment,
  ShipmentItem,
  ShipmentPayment,
  ShippingCompany,
  Supplier,
} from "@shared/schema";
import { deriveAmountEgp, validateRemainingAllowance } from "./paymentValidation";
import { cn } from "@/lib/utils";
import {
  buildPaymentFormData,
  canAutoAllocatePayment,
  shouldShowAutoAllocationSection,
  uploadPaymentAttachment,
} from "./payments-utils";
import { PaymentWizard } from "@/components/payment-wizard";
import {
  PaymentSummaryReceipt,
  type PaymentSummaryReceiptData,
} from "@/components/payment-summary-receipt";

const PAYMENT_METHODS = [
  { value: "نقدي", label: "نقدي" },
  { value: "محفظة الكترونية", label: "محفظة الكترونية" },
  { value: "إنستاباي", label: "إنستاباي" },
  { value: "تحويل بنكي", label: "تحويل بنكي" },
  { value: "نواقص", label: "نواقص" },
  { value: "AliPay", label: "AliPay" },
  { value: "WeChat", label: "WeChat" },
  { value: "أخرى", label: "أخرى" },
];

const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024;

const COST_COMPONENTS = [
  { value: "تكلفة البضاعة", label: "تكلفة البضاعة" },
  { value: "الشحن", label: "الشحن" },
  { value: "العمولة", label: "العمولة" },
  { value: "الجمرك", label: "الجمرك" },
  { value: "التخريج", label: "التخريج" },
];

const SHIPPING_COST_COMPONENTS = new Set(["الشحن", "العمولة", "الجمرك", "التخريج"]);

const ITEMS_PER_PAGE = 25;

const paymentFormSchema = z
  .object({
    shipmentId: z.string().min(1, "يرجى اختيار الشحنة"),
    paymentDate: z.string().min(1, "يرجى تحديد تاريخ الدفع"),
    paymentCurrency: z.enum(["EGP", "RMB"]),
    costComponent: z.string().min(1, "يرجى اختيار بند التكلفة"),
    partyType: z.enum(["supplier", "shipping_company"]),
    partyId: z.string().optional().nullable(),
    amountOriginal: z
      .string()
      .min(1, "يرجى إدخال المبلغ")
      .refine((value) => Number.isFinite(parseFloat(value)), "يرجى إدخال مبلغ صحيح"),
    exchangeRateToEgp: z.string().optional().nullable(),
    paymentMethod: z.string().min(1, "يرجى اختيار طريقة الدفع"),
    cashReceiverName: z.string().optional().nullable(),
    referenceNumber: z.string().optional().nullable(),
    note: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.paymentCurrency === "RMB") {
      if (!data.exchangeRateToEgp || !data.exchangeRateToEgp.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["exchangeRateToEgp"],
          message: "يرجى إدخال سعر الصرف",
        });
      }
    }

    if (data.paymentMethod === "نقدي") {
      if (!data.cashReceiverName || !data.cashReceiverName.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cashReceiverName"],
          message: "يرجى إدخال اسم مستلم الكاش",
        });
      }
    }
  });

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

interface PaymentsStats {
  totalCostEgp: string;
  totalPaidEgp: string;
  totalBalanceEgp: string;
  // Purchase (تكلفة البضاعة) - RMB
  purchaseCostRmb: string;
  purchasePaidRmb: string;
  purchaseBalanceRmb: string;
  // Shipping (الشحن) - RMB
  shippingCostRmb: string;
  shippingPaidRmb: string;
  shippingBalanceRmb: string;
  // Commission (العمولة) - RMB
  commissionCostRmb: string;
  commissionPaidRmb: string;
  commissionBalanceRmb: string;
  // Customs (الجمرك) - EGP
  customsCostEgp: string;
  customsPaidEgp: string;
  customsBalanceEgp: string;
  // Takhreeg (التخريج) - EGP
  takhreegCostEgp: string;
  takhreegPaidEgp: string;
  takhreegBalanceEgp: string;
  lastPayment: ShipmentPayment | null;
}

interface InvoiceSummary {
  shipmentId: number;
  shipmentCode: string;
  shipmentName: string;
  knownTotalCost: string;
  totalPaidEgp: string;
  remainingAllowed: string;
  paidByCurrency: Record<string, { original: string; convertedToEgp: string }>;
  rmb: {
    goodsTotal: string;
    shippingTotal: string;
    commissionTotal: string;
    subtotal: string;
    paid: string;
    remaining: string;
  };
  egp: {
    customsTotal: string;
    takhreegTotal: string;
    subtotal: string;
    paid: string;
    remaining: string;
  };
  paymentAllowance?: {
    knownTotalEgp: string;
    alreadyPaidEgp: string;
    remainingAllowedEgp: string;
    source: "declared" | "recovered";
  };
  computedAt: string;
}

interface AllocationPreview {
  shipmentId: number;
  amountRmb: string;
  totalOutstandingRmb: string;
  suppliers: Array<{
    supplierId: number;
    goodsTotalRmb: string;
    outstandingRmb: string;
    allocatedRmb: string;
  }>;
}

interface PaymentRemaining {
  currency: "RMB" | "EGP";
  remainingBefore: string;
  totalAllowed?: string;
  paidSoFar?: string;
}

interface PaymentSummarySnapshot {
  receiptData: PaymentSummaryReceiptData;
  shipmentCode: string;
  attachmentName: string | null;
}

export default function Payments() {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [partyPopoverOpen, setPartyPopoverOpen] = useState(false);
  const [expandedShipments, setExpandedShipments] = useState<Set<number>>(new Set());
  const [showInvoiceSummary, setShowInvoiceSummary] = useState(false);
  const [clientValidationError, setClientValidationError] = useState<string | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentInputKey, setAttachmentInputKey] = useState(0);
  const [uploadedAttachment, setUploadedAttachment] = useState<{ attachmentUrl: string; attachmentOriginalName: string; attachmentMimeType: string; attachmentSize: number } | null>(null);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [currentPageShipments, setCurrentPageShipments] = useState(1);
  const [currentPagePayments, setCurrentPagePayments] = useState(1);
  const [autoAllocate, setAutoAllocate] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedPaymentRef, setCompletedPaymentRef] = useState<string | null>(null);
  const [completedPaymentSnapshot, setCompletedPaymentSnapshot] =
    useState<PaymentSummarySnapshot | null>(null);
  const [isDownloadingSummary, setIsDownloadingSummary] = useState(false);
  const summaryExportRef = useRef<HTMLDivElement | null>(null);
  const pendingSummaryRef = useRef<PaymentSummarySnapshot | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "مدير";
  const [paymentToDelete, setPaymentToDelete] = useState<number | null>(null);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      shipmentId: "",
      paymentDate: new Date().toISOString().split("T")[0],
      paymentCurrency: "EGP",
      costComponent: "",
      partyType: "supplier",
      partyId: "",
      amountOriginal: "",
      exchangeRateToEgp: "",
      paymentMethod: "",
      cashReceiverName: "",
      referenceNumber: "",
      note: "",
    },
    mode: "onBlur",
  });

  const paymentCurrency = useWatch({ control: form.control, name: "paymentCurrency" });
  const costComponent = useWatch({ control: form.control, name: "costComponent" });
  const partyType = useWatch({ control: form.control, name: "partyType" });
  const partyIdValue = useWatch({ control: form.control, name: "partyId" });
  const shipmentIdValue = useWatch({ control: form.control, name: "shipmentId" });
  const paymentMethod = useWatch({ control: form.control, name: "paymentMethod" });
  const amountOriginalValue = useWatch({ control: form.control, name: "amountOriginal" });
  const paymentDateValue = useWatch({ control: form.control, name: "paymentDate" });
  const cashReceiverValue = useWatch({ control: form.control, name: "cashReceiverName" });
  const referenceNumberValue = useWatch({ control: form.control, name: "referenceNumber" });
  const noteValue = useWatch({ control: form.control, name: "note" });
  const exchangeRateValue = useWatch({ control: form.control, name: "exchangeRateToEgp" });
  const selectedShipmentId = shipmentIdValue ? Number(shipmentIdValue) : null;
  const partyId = partyIdValue ? Number(partyIdValue) : null;

  const { data: stats, isLoading: loadingStats } = useQuery<PaymentsStats>({
    queryKey: ["/api/payments/stats"],
  });

  const { data: suppliers, isLoading: loadingSuppliers } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const { data: shippingCompanies, isLoading: loadingShippingCompanies } = useQuery<
    ShippingCompany[]
  >({
    queryKey: ["/api/shipping-companies"],
  });

  const relatedPartiesQuery = createRelatedPartiesQuery(selectedShipmentId);
  const { data: relatedParties, isLoading: loadingRelatedParties, isFetching: fetchingRelatedParties } =
    useQuery<RelatedPartiesResponse>({
      queryKey: relatedPartiesQuery.queryKey,
      queryFn: relatedPartiesQuery.queryFn ?? (async () => ({ suppliers: [], shippingCompanies: [] })),
      enabled: relatedPartiesQuery.enabled,
    });

  const { data: shipments, isLoading: loadingShipments } = useQuery<Shipment[]>({
    queryKey: ["/api/shipments"],
  });

  const activeShipments = shipments?.filter((s) => s.status !== "مؤرشفة");

  const { data: payments, isLoading: loadingPayments } = useQuery<
    (ShipmentPayment & { shipment?: Shipment })[]
  >({
    queryKey: ["/api/payments"],
  });

  const {
    data: invoiceSummary,
    isLoading: loadingInvoiceSummary,
    isFetching: fetchingInvoiceSummary,
    error: invoiceSummaryError,
  } = useQuery<InvoiceSummary>({
    queryKey: ["/api/shipments", selectedShipmentId, "invoice-summary"],
    enabled: !!selectedShipmentId,
  });

  const { data: shipmentItems } = useQuery<ShipmentItem[]>({
    queryKey: ["/api/shipments", selectedShipmentId, "items"],
    enabled: !!selectedShipmentId && isDialogOpen,
  });

  const supplierIds = new Set(
    shipmentItems?.map((item) => item.supplierId).filter((id): id is number => !!id) ?? [],
  );
  const shippingCompanyId =
    shipments?.find((shipment) => shipment.id === selectedShipmentId)?.shippingCompanyId ?? null;

  const hasSupplierAttribution = supplierIds.size > 0;
  const autoSupplierId = supplierIds.size === 1 ? Array.from(supplierIds)[0] : null;
  const isShippingComponent = SHIPPING_COST_COMPONENTS.has(costComponent);
  const isPurchaseComponent = costComponent === "تكلفة البضاعة";
  const autoShippingCompanyId = typeof shippingCompanyId === "number" ? shippingCompanyId : null;
  const canUseShippingCompany =
    typeof autoShippingCompanyId === "number" && (isShippingComponent || isPurchaseComponent);
  const showAutoAllocationSection = shouldShowAutoAllocationSection({
    costComponent,
    partyType,
    selectedShipmentId,
    shippingCompanyId,
  });
  const canAutoAllocate = canAutoAllocatePayment({
    costComponent,
    partyType,
    selectedShipmentId,
    paymentCurrency,
    shippingCompanyId,
  });
  const amountOriginalNumber = parseFloat(amountOriginalValue);
  const amountEntered = useMemo(
    () => Number(String(amountOriginalValue ?? "").replace(/,/g, "")) || 0,
    [amountOriginalValue],
  );
  const hasPreviewAmount = Number.isFinite(amountOriginalNumber) && amountOriginalNumber > 0;
  const selectedShipment = useMemo(
    () => shipments?.find((shipment) => shipment.id === selectedShipmentId),
    [shipments, selectedShipmentId],
  );
  const relatedSuppliers = relatedParties?.suppliers ?? [];
  const relatedShippingCompanies = relatedParties?.shippingCompanies ?? [];
  const partyOptions = useMemo(
    () => getPartyOptions(relatedParties, partyType, selectedShipmentId),
    [partyType, relatedParties, selectedShipmentId],
  );
  const hasPartyOptions = partyOptions.length > 0;
  const selectedPartyName = partyId
    ? partyType === "supplier"
      ? relatedSuppliers.find((supplier) => supplier.id === partyId)?.name ||
        suppliers?.find((supplier) => supplier.id === partyId)?.name
      : relatedShippingCompanies.find((company) => company.id === partyId)?.name ||
        shippingCompanies?.find((company) => company.id === partyId)?.name
    : "";
  const partyButtonLabel = selectedPartyName
    ? selectedPartyName
    : !selectedShipmentId
      ? "اختر الشحنة أولاً"
      : partyType === "supplier"
        ? "اختر المورد..."
        : "اختر شركة الشحن...";
  const isPartyLoading = loadingRelatedParties || fetchingRelatedParties;
  const partyEmptyMessage = !selectedShipmentId
    ? "اختر الشحنة أولاً"
    : isPartyLoading
      ? "جاري التحميل..."
      : partyType === "supplier"
        ? hasPartyOptions
          ? "لا يوجد مورد مطابق"
          : "لا يوجد موردين مرتبطين بهذه الشحنة"
        : hasPartyOptions
          ? "لا توجد شركة شحن مطابقة"
          : "لا توجد شركة شحن مرتبطة بهذه الشحنة";

  const wizardSteps = [
    { id: "entry", title: "إدخال البيانات" },
    { id: "review", title: "مراجعة وتأكيد" },
  ];

  const shouldFetchPaymentRemaining =
    !!selectedShipmentId &&
    !!partyId &&
    !!costComponent &&
    (partyType === "shipping_company" || costComponent === "تكلفة البضاعة");

  const paymentRemainingQueryKey = shouldFetchPaymentRemaining
    ? [
        "/api/shipments",
        selectedShipmentId,
        `payment-remaining?partyType=${partyType}&partyId=${partyId}&component=${encodeURIComponent(
          costComponent,
        )}`,
      ]
    : null;

  const {
    data: paymentRemaining,
    isFetching: loadingPartyPaymentSummary,
    error: partyPaymentSummaryError,
  } = useQuery<PaymentRemaining>({
    queryKey: paymentRemainingQueryKey ?? ["/api/shipments", "payment-remaining", "disabled"],
    enabled: Boolean(paymentRemainingQueryKey),
  });

  useEffect(() => {
    if (!isDialogOpen) return;
    if (
      canUseShippingCompany &&
      (isShippingComponent ||
        (!hasSupplierAttribution && isPurchaseComponent) ||
        partyType === "shipping_company")
    ) {
      if (partyType !== "shipping_company") {
        form.setValue("partyType", "shipping_company", { shouldValidate: true });
      }
      if (partyId !== autoShippingCompanyId) {
        form.setValue("partyId", String(autoShippingCompanyId), { shouldValidate: true });
      }
      return;
    }
    if (!isShippingComponent && autoSupplierId) {
      if (partyType !== "supplier") {
        form.setValue("partyType", "supplier", { shouldValidate: true });
      }
      form.setValue("partyId", String(autoSupplierId), { shouldValidate: true });
      return;
    }
    if (hasSupplierAttribution && partyType === "supplier" && partyId) {
      return;
    }
    if (partyType === "shipping_company" && partyId) {
      return;
    }
    form.setValue("partyId", "", { shouldValidate: true });
  }, [
    autoSupplierId,
    autoShippingCompanyId,
    canUseShippingCompany,
    hasSupplierAttribution,
    isDialogOpen,
    isPurchaseComponent,
    isShippingComponent,
    partyId,
    partyType,
    selectedShipmentId,
    form,
  ]);

  useEffect(() => {
    if (!isDialogOpen) return;
    form.setValue("partyId", "", { shouldValidate: true });
  }, [partyType, isDialogOpen, form]);

  useEffect(() => {
    if (!isDialogOpen) return;
    if (!selectedShipmentId) {
      form.setValue("partyId", "", { shouldValidate: true });
      return;
    }

    if (!partyId || isPartyLoading) return;

    if (!partyOptions.some((party) => party.id === partyId)) {
      form.setValue("partyId", "", { shouldValidate: true });
    }
  }, [
    form,
    isDialogOpen,
    isPartyLoading,
    partyId,
    partyOptions,
    selectedShipmentId,
  ]);

  useEffect(() => {
    if (!showAutoAllocationSection || paymentCurrency !== "RMB") {
      setAutoAllocate(false);
    }
  }, [paymentCurrency, showAutoAllocationSection]);

  useEffect(() => {
    if (paymentCurrency !== "RMB") {
      form.setValue("exchangeRateToEgp", "");
    }
  }, [paymentCurrency, form]);

  useEffect(() => {
    if (paymentMethod !== "نقدي") {
      form.setValue("cashReceiverName", "");
    }
  }, [paymentMethod, form]);

  useEffect(() => {
    setClientValidationError(null);
  }, [
    selectedShipmentId,
    paymentCurrency,
    partyId,
    invoiceSummary?.paymentAllowance?.remainingAllowedEgp,
  ]);

  useEffect(() => {
    if (shipmentIdValue) {
      form.clearErrors("shipmentId");
    }
  }, [shipmentIdValue, form]);

  useEffect(() => {
    if (!isDialogOpen || !selectedShipmentId) return;
    const storageKey = `payment-draft-${selectedShipmentId}`;
    const stored = localStorage.getItem(storageKey);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Partial<PaymentFormValues> & {
        autoAllocate?: boolean;
      };
      form.reset({
        ...form.getValues(),
        ...parsed,
        shipmentId: selectedShipmentId.toString(),
      });
      if (typeof parsed.autoAllocate === "boolean") {
        setAutoAllocate(parsed.autoAllocate);
      }
    } catch (error) {
      console.error("Failed to restore payment draft", error);
    }
  }, [form, isDialogOpen, selectedShipmentId]);

  useEffect(() => {
    if (!isDialogOpen || !selectedShipmentId) return;
    const subscription = form.watch((values) => {
      const storageKey = `payment-draft-${selectedShipmentId}`;
      const payload = { ...values, autoAllocate };
      localStorage.setItem(storageKey, JSON.stringify(payload));
    });
    return () => subscription.unsubscribe();
  }, [autoAllocate, form, isDialogOpen, selectedShipmentId]);

  const createMutation = useMutation({
    mutationFn: async (data: { payload: FormData; shipmentId: number }) => {
      const response = await apiRequest("POST", "/api/payments", data.payload);
      return response.json();
    },
    onSuccess: (_response, variables) => {
      toast({ title: "تم تسجيل الدفعة بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shipments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/stats"] });
      if (variables?.shipmentId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/shipments", variables.shipmentId, "invoice-summary"],
        });
      }
      if (variables?.shipmentId) {
        localStorage.removeItem(`payment-draft-${variables.shipmentId}`);
      }
      const paymentId = _response?.data?.id ?? _response?.payment?.id ?? _response?.id ?? null;
      const apiReference =
        _response?.data?.paymentReference ?? _response?.data?.referenceNumber ?? null;
      const formattedReference = paymentId
        ? `PAY-${String(paymentId).padStart(6, "0")}`
        : null;
      const resolvedReference =
        apiReference ?? formattedReference ?? completedPaymentRef ?? "غير متاح";
      setCompletedPaymentRef(resolvedReference);
      const pendingSnapshot = pendingSummaryRef.current;
      const updatedReceiptData = {
        ...(pendingSnapshot?.receiptData ?? reviewReceiptData),
        referenceNumber: resolvedReference,
        createdAt: formatDateTime(new Date()),
      };
      setCompletedPaymentSnapshot({
        receiptData: updatedReceiptData,
        shipmentCode: pendingSnapshot?.shipmentCode ?? selectedShipment?.shipmentCode ?? "-",
        attachmentName: pendingSnapshot?.attachmentName ?? attachmentFile?.name ?? null,
      });
      setCurrentStep(2);
    },
    onError: (error: Error) => {
      console.error("Payment creation failed", error);
      toast({
        title: getErrorMessage(error, paymentErrorOverrides),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (paymentId: number) => {
      const response = await apiRequest("DELETE", `/api/payments/${paymentId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "تم حذف الدفعة بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shipments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/stats"] });
      setPaymentToDelete(null);
    },
    onError: (error: Error) => {
      console.error("Payment deletion failed", error);
      toast({
        title: getErrorMessage(error, paymentErrorOverrides),
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    form.reset({
      shipmentId: "",
      paymentDate: new Date().toISOString().split("T")[0],
      paymentCurrency: "EGP",
      costComponent: "",
      partyType: "supplier",
      partyId: "",
      amountOriginal: "",
      exchangeRateToEgp: "",
      paymentMethod: "",
      cashReceiverName: "",
      referenceNumber: "",
      note: "",
    });
    setShowInvoiceSummary(false);
    setClientValidationError(null);
    setAttachmentFile(null);
    setAttachmentError(null);
    setUploadedAttachment(null);
    setAttachmentInputKey((prev) => prev + 1);
    setAutoAllocate(false);
    setCurrentStep(0);
    setCompletedPaymentRef(null);
    setCompletedPaymentSnapshot(null);
    pendingSummaryRef.current = null;
  };

  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setAttachmentFile(null);
      setAttachmentError(null);
      setUploadedAttachment(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setAttachmentFile(null);
      setAttachmentError("يرجى اختيار ملف صورة فقط.");
      setUploadedAttachment(null);
      event.target.value = "";
      return;
    }

    if (file.size > MAX_ATTACHMENT_SIZE) {
      setAttachmentFile(null);
      setAttachmentError("يجب ألا يزيد حجم الصورة عن 2MB.");
      setUploadedAttachment(null);
      event.target.value = "";
      return;
    }

    setAttachmentFile(file);
    setAttachmentError(null);
    setUploadedAttachment(null); // Reset uploaded URL when new file is selected
  };

  const paymentErrorOverrides = {
    401: "انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى.",
    403: "ليست لديك صلاحية لإضافة دفعة.",
    defaultMessage: "تعذر حفظ الدفعة. تحقق من البيانات أو أعد المحاولة.",
  } as const;

  const summaryErrorOverrides = {
    401: "انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى.",
    403: "ليست لديك صلاحية لعرض الملخص.",
    defaultMessage: "تعذر تحميل الملخص. تحقق من الاتصال أو الصلاحيات.",
  } as const;

  const validatePartySelection = async (shouldToast = true) => {
    if (!selectedShipmentId) {
      return { ok: false, message: "يرجى اختيار الشحنة" };
    }

    let latestShipmentItems = shipmentItems;
    if (!latestShipmentItems && selectedShipmentId) {
      try {
        latestShipmentItems = await queryClient.ensureQueryData<ShipmentItem[]>({
          queryKey: ["/api/shipments", selectedShipmentId, "items"],
        });
      } catch (error) {
        console.error("Failed to fetch shipment items for validation", error);
        const message = "تعذر التحقق من المورد. تحقق من الاتصال أو الصلاحيات.";
        if (shouldToast) {
          toast({ title: message, variant: "destructive" });
        }
        return { ok: false, message };
      }
    }

    const latestItemSupplierIds = new Set(
      latestShipmentItems
        ?.map((item) => item.supplierId)
        .filter((id): id is number => !!id) ?? [],
    );
    const selectedShipment = shipments?.find((shipment) => shipment.id === selectedShipmentId);
    const latestShippingCompanyId = selectedShipment?.shippingCompanyId ?? null;

    const isShippingPayment = SHIPPING_COST_COMPONENTS.has(costComponent);
    const isPurchasePayment = costComponent === "تكلفة البضاعة";
    const canUseShippingCompanyForPayment =
      typeof latestShippingCompanyId === "number" && (isShippingPayment || isPurchasePayment);
    const allowedSuppliers = isShippingPayment ? new Set<number>() : latestItemSupplierIds;
    const allowedShippingCompanies = canUseShippingCompanyForPayment
      ? new Set([latestShippingCompanyId])
      : new Set<number>();

    const shouldRequireParty = isShippingPayment
      ? allowedShippingCompanies.size > 0
      : allowedSuppliers.size + allowedShippingCompanies.size > 0;

    if (shouldRequireParty && (!partyType || !partyId)) {
      const message = "يرجى اختيار الطرف لهذه الشحنة";
      setClientValidationError(message);
      form.setError("partyId", { message });
      if (shouldToast) {
        toast({ title: message, variant: "destructive" });
      }
      return { ok: false, message };
    }

    if (partyType === "supplier" && partyId && !allowedSuppliers.has(partyId)) {
      const message = "المورد المحدد غير مرتبط بهذه الشحنة";
      setClientValidationError(message);
      form.setError("partyId", { message });
      if (shouldToast) {
        toast({ title: message, variant: "destructive" });
      }
      return { ok: false, message };
    }

    if (partyType === "shipping_company" && partyId && !allowedShippingCompanies.has(partyId)) {
      const message = "شركة الشحن المحددة غير مرتبطة بهذه الشحنة";
      setClientValidationError(message);
      form.setError("partyId", { message });
      if (shouldToast) {
        toast({ title: message, variant: "destructive" });
      }
      return { ok: false, message };
    }

    form.clearErrors("partyId");
    return { ok: true, message: "" };
  };

  const handleSubmit = form.handleSubmit(async (data) => {
    setClientValidationError(null);

    if (!selectedShipmentId) {
      toast({ title: "يرجى اختيار الشحنة", variant: "destructive" });
      return;
    }

    const partyValidation = await validatePartySelection();
    if (!partyValidation.ok) {
      return;
    }

    if (isOverpayment) {
      const message = overpaymentError || "المبلغ أكبر من المتبقي المسموح";
      form.setError("amountOriginal", { message });
      toast({ title: message, variant: "destructive" });
      return;
    }

    const amountOriginal = data.amountOriginal;
    const exchangeRate = data.exchangeRateToEgp ?? "";
    const amountEgpNumber = deriveAmountEgp({
      paymentCurrency,
      amountOriginal,
      exchangeRate,
    });

    let latestInvoiceSummary = invoiceSummary;
    if (!latestInvoiceSummary && selectedShipmentId) {
      try {
        latestInvoiceSummary = await queryClient.ensureQueryData<InvoiceSummary>({
          queryKey: ["/api/shipments", selectedShipmentId, "invoice-summary"],
        });
      } catch (error) {
        toast({
          title: "تعذر التحقق من الحد المسموح للدفع",
          variant: "destructive",
        });
        return;
      }
    }

    const remainingAllowedValue =
      latestInvoiceSummary?.paymentAllowance?.remainingAllowedEgp !== undefined
        ? parseFloat(latestInvoiceSummary.paymentAllowance.remainingAllowedEgp)
        : undefined;

    const validation = validateRemainingAllowance({
      remainingAllowedEgp: Number.isFinite(remainingAllowedValue) ? remainingAllowedValue : undefined,
      attemptedAmountEgp: amountEgpNumber,
      formatter: (value) => formatCurrency(value),
    });

    if (!validation.allowed) {
      const message = validation.message || "لا يمكن دفع هذا المبلغ في الوقت الحالي";
      setClientValidationError(message);
      toast({ title: message, variant: "destructive" });
      return;
    }

    const safeAmountEgp = Number.isFinite(amountEgpNumber) ? amountEgpNumber : 0;

    if (attachmentError) {
      toast({ title: attachmentError, variant: "destructive" });
      return;
    }

    // Upload attachment to Object Storage if present
    let attachmentInfo: { attachmentUrl: string; attachmentOriginalName: string; attachmentMimeType: string; attachmentSize: number } | null = uploadedAttachment;
    if (attachmentFile && !uploadedAttachment) {
      try {
        setIsUploadingAttachment(true);
        attachmentInfo = await uploadPaymentAttachment(attachmentFile);
        setUploadedAttachment(attachmentInfo);
      } catch (error) {
        console.error("Attachment upload error:", error);
        toast({ title: "خطأ في رفع المرفق", variant: "destructive" });
        setIsUploadingAttachment(false);
        return;
      } finally {
        setIsUploadingAttachment(false);
      }
    }

    // Only send autoAllocate if it's enabled AND eligible
    const shouldAutoAllocate = autoAllocate && canAutoAllocate;

    const payload = buildPaymentFormData({
      selectedShipmentId,
      partyType,
      partyId,
      paymentDate: data.paymentDate,
      paymentCurrency,
      amountOriginal,
      exchangeRateToEgp: exchangeRate,
      amountEgp: paymentCurrency === "EGP" ? amountOriginal : safeAmountEgp.toFixed(2),
      costComponent,
      paymentMethod,
      cashReceiverName: data.cashReceiverName || "",
      referenceNumber: data.referenceNumber || "",
      note: data.note || "",
      autoAllocate: shouldAutoAllocate,
      attachmentUrl: attachmentInfo?.attachmentUrl || null,
      attachmentOriginalName: attachmentInfo?.attachmentOriginalName || null,
      attachmentMimeType: attachmentInfo?.attachmentMimeType || null,
      attachmentSize: attachmentInfo?.attachmentSize || null,
    });

    const pendingShipmentLabel = selectedShipment
      ? `${selectedShipment.shipmentCode} - ${selectedShipment.shipmentName}`
      : "لم يتم اختيار شحنة";
    const pendingPartyLabel = `${partyType === "supplier" ? "مورد" : "شركة شحن"}${
      selectedPartyName ? ` - ${selectedPartyName}` : ""
    }`;
    const allowanceValue = remainingDisplay;
    const allowanceCurrencyLabel = partyCurrencyLabel || (paymentCurrency === "RMB" ? rmbLabel : egpLabel);

    pendingSummaryRef.current = {
      receiptData: {
        shipmentLabel: pendingShipmentLabel,
        paymentDate: formatDate(data.paymentDate),
        currencyLabel: paymentCurrency === "RMB" ? rmbLabel : egpLabel,
        componentLabel: costComponent || "-",
        partyLabel: pendingPartyLabel || "-",
        amountLabel: `${formatCurrency(data.amountOriginal)} ${currencyDisplayLabel}`,
        paymentMethodLabel: paymentMethod || "-",
        receiverLabel: data.cashReceiverName?.trim() ? data.cashReceiverName : "-",
        referenceNumber: data.referenceNumber?.trim() ? data.referenceNumber : "-",
        note: data.note?.trim() ? data.note : "-",
        attachmentLabel: attachmentFile ? "مرفق صورة" : "لا يوجد مرفق",
        allowanceLabel:
          partySummaryValues && partyCurrencyLabel
            ? `${formatCurrency(allowanceValue)} ${allowanceCurrencyLabel}`
            : undefined,
      },
      shipmentCode: selectedShipment?.shipmentCode ?? "-",
      attachmentName: attachmentFile?.name ?? null,
    };

    createMutation.mutate({ payload, shipmentId: selectedShipmentId });
  });

  const formatCurrency = (value: string | number | null) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("ar-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num || 0);
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("ar-EG");
  };

  const formatDateTime = (date: string | Date | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleString("ar-EG");
  };

  const rmbLabel = "رممبي / RMB";
  const egpLabel = "جنيه / EGP";
  const currencyDisplayLabel = paymentCurrency === "RMB" ? "رممبي" : "جنيه";

  const partySummaryValues = useMemo(() => {
    if (!paymentRemaining) return null;
    const remainingBefore = parseFloat(paymentRemaining.remainingBefore);

    return {
      currency: paymentRemaining.currency,
      remainingBefore: Number.isFinite(remainingBefore) ? remainingBefore : 0,
    };
  }, [paymentRemaining]);

  const remainingBeforeValue = partySummaryValues?.remainingBefore ?? 0;
  const totalDisplay = remainingBeforeValue;
  const paidDisplay = amountEntered;
  const remainingDisplay = Math.max(0, remainingBeforeValue - amountEntered);

  const partyCurrencyLabel =
    partySummaryValues?.currency === "RMB" ? rmbLabel : egpLabel;

  const overpaymentError = useMemo(() => {
    if (!partySummaryValues) return null;
    if (remainingBeforeValue <= 0) {
      return "لا يوجد متبقي مسموح للدفع";
    }
    if (amountEntered > remainingBeforeValue + 0.0001) {
      return "المبلغ أكبر من المتبقي المسموح";
    }
    return null;
  }, [amountEntered, partySummaryValues, remainingBeforeValue]);

  const isOverpayment = Boolean(overpaymentError);

  const attachmentPreviewUrl = useMemo(() => {
    if (!attachmentFile) return null;
    return URL.createObjectURL(attachmentFile);
  }, [attachmentFile]);

  useEffect(() => {
    if (!attachmentPreviewUrl) return;
    return () => {
      URL.revokeObjectURL(attachmentPreviewUrl);
    };
  }, [attachmentPreviewUrl]);

  const reviewReceiptData = useMemo<PaymentSummaryReceiptData>(() => {
    const shipmentLabel = selectedShipment
      ? `${selectedShipment.shipmentCode} - ${selectedShipment.shipmentName}`
      : "لم يتم اختيار شحنة";
    const partyLabel = `${partyType === "supplier" ? "مورد" : "شركة شحن"}${
      selectedPartyName ? ` - ${selectedPartyName}` : ""
    }`;

    const allowanceValue = remainingDisplay;
    const allowanceCurrencyLabel =
      partyCurrencyLabel || (paymentCurrency === "RMB" ? rmbLabel : egpLabel);

    return {
      shipmentLabel,
      paymentDate: paymentDateValue ? formatDate(paymentDateValue) : "-",
      currencyLabel: paymentCurrency === "RMB" ? rmbLabel : egpLabel,
      componentLabel: costComponent || "-",
      partyLabel: partyLabel || "-",
      amountLabel: `${amountOriginalValue ? formatCurrency(amountOriginalValue) : "0.00"} ${currencyDisplayLabel}`,
      paymentMethodLabel: paymentMethod || "-",
      receiverLabel: cashReceiverValue?.trim() ? cashReceiverValue : "-",
      referenceNumber: referenceNumberValue?.trim() ? referenceNumberValue : "-",
      note: noteValue?.trim() ? noteValue : "-",
      attachmentLabel: attachmentFile ? "مرفق صورة" : "لا يوجد مرفق",
      allowanceLabel:
        partySummaryValues && partyCurrencyLabel
          ? `${formatCurrency(allowanceValue)} ${allowanceCurrencyLabel}`
          : undefined,
    };
  }, [
    selectedShipment,
    partyType,
    selectedPartyName,
    paymentDateValue,
    paymentCurrency,
    costComponent,
    amountOriginalValue,
    currencyDisplayLabel,
    paymentMethod,
    cashReceiverValue,
    referenceNumberValue,
    noteValue,
    attachmentFile,
    partyCurrencyLabel,
    partySummaryValues,
    remainingDisplay,
    rmbLabel,
    egpLabel,
  ]);

  const isSuccessState = currentStep === 2;

  const summaryRows = useMemo(
    () => [
      {
        label: "الشحنة",
        value: selectedShipment
          ? `${selectedShipment.shipmentCode} - ${selectedShipment.shipmentName}`
          : "—",
      },
      { label: "البند", value: costComponent || "—" },
      {
        label: "الطرف",
        value: `${partyType === "supplier" ? "مورد" : "شركة شحن"}${
          selectedPartyName ? ` - ${selectedPartyName}` : ""
        }` || "—",
      },
      {
        label: "المبلغ",
        value: `${amountOriginalValue ? formatCurrency(amountOriginalValue) : "0.00"} ${
          paymentCurrency === "RMB" ? rmbLabel : egpLabel
        }`,
      },
      { label: "طريقة الدفع", value: paymentMethod || "—" },
    ],
    [
      amountOriginalValue,
      costComponent,
      egpLabel,
      partyType,
      paymentCurrency,
      paymentMethod,
      rmbLabel,
      selectedPartyName,
      selectedShipment,
    ],
  );

  const summaryError = partyPaymentSummaryError || invoiceSummaryError;

  const renderSummaryCard = (title: string) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-2">
          {summaryRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium text-left">{row.value}</span>
            </div>
          ))}
        </div>

        {summaryError && (
          <p className="text-xs text-destructive">
            {getErrorMessage(summaryError, summaryErrorOverrides)}
          </p>
        )}
      </CardContent>
    </Card>
  );

  const paymentPreviewBlock =
    costComponent && shouldFetchPaymentRemaining && (
      <div className="mt-2 space-y-2 rounded-md bg-muted/50 p-3 text-sm">
        {loadingPartyPaymentSummary && (
          <p className="text-xs text-muted-foreground">جاري تحميل ملخص الطرف...</p>
        )}
        {partyPaymentSummaryError && (
          <p className="text-xs text-destructive">
            {getErrorMessage(partyPaymentSummaryError, summaryErrorOverrides)}
          </p>
        )}
        {partySummaryValues && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">الإجمالي</span>
              <span className="font-semibold">
                {formatCurrency(totalDisplay)} {partyCurrencyLabel}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">المدفوع</span>
              <span className="font-semibold text-green-600">
                {formatCurrency(paidDisplay)} {partyCurrencyLabel}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">المتبقي</span>
              <span className="font-semibold text-amber-600">
                {formatCurrency(remainingDisplay)} {partyCurrencyLabel}
              </span>
            </div>
          </>
        )}
      </div>
    );

  const allocationPreviewQueryKey = showAutoAllocationSection && hasPreviewAmount && canAutoAllocate
    ? [
        "/api/shipments",
        selectedShipmentId,
        `payment-allocation-preview?amount=${encodeURIComponent(
          amountOriginalNumber.toFixed(2),
        )}`,
      ]
    : null;

  const {
    data: allocationPreview,
    isLoading: allocationPreviewLoading,
    isError: allocationPreviewError,
  } = useQuery<AllocationPreview>({
    queryKey: allocationPreviewQueryKey ?? ["/api/shipments", "allocation-preview", "disabled"],
    enabled: Boolean(allocationPreviewQueryKey && autoAllocate),
  });

  const stepFieldGroups: Array<Array<keyof PaymentFormValues>> = [
    [
      "shipmentId",
      "paymentDate",
      "paymentCurrency",
      "costComponent",
      "partyType",
      "partyId",
      "amountOriginal",
      "exchangeRateToEgp",
      "paymentMethod",
      "cashReceiverName",
      "referenceNumber",
      "note",
    ],
    [],
  ];

  const handleNextStep = async () => {
    if (isOverpayment) {
      const message = overpaymentError || "المبلغ أكبر من المتبقي المسموح";
      form.setError("amountOriginal", { message });
      return;
    }
    const shipmentValue = form.getValues("shipmentId");
    if (!shipmentValue || !shipmentValue.trim()) {
      form.setError("shipmentId", { message: "يرجى اختيار الشحنة" });
      return;
    }
    form.clearErrors("shipmentId");

    const fields = stepFieldGroups[currentStep] ?? [];
    const filteredFields = fields.filter((field) => {
      if (field === "exchangeRateToEgp" && paymentCurrency !== "RMB") return false;
      if (field === "cashReceiverName" && paymentMethod !== "نقدي") return false;
      return true;
    });

    const isValid = await form.trigger(filteredFields, { shouldFocus: true });
    if (!isValid) return;

    const partyValidation = await validatePartySelection();
    if (!partyValidation.ok) return;

    setCurrentStep(1);
  };

  const handlePreviousStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleDownloadSummary = async () => {
    if (!summaryExportRef.current) return;
    setIsDownloadingSummary(true);
    try {
      const dataUrl = await toPng(summaryExportRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `payment-summary-${completedPaymentRef ?? "receipt"}.png`;
      link.click();
    } catch (error) {
      console.error("Failed to export summary image", error);
      toast({
        title: "تعذر تحميل صورة الملخص.",
        variant: "destructive",
      });
    } finally {
      setIsDownloadingSummary(false);
    }
  };

  const toggleShipmentExpand = (shipmentId: number) => {
    setExpandedShipments(prev => {
      const next = new Set(prev);
      if (next.has(shipmentId)) {
        next.delete(shipmentId);
      } else {
        next.add(shipmentId);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setStatusFilter("all");
    setCurrentPageShipments(1);
    setCurrentPagePayments(1);
  };

  const filteredShipments = activeShipments?.filter((s) => {
    if (search && !s.shipmentName.toLowerCase().includes(search.toLowerCase()) && 
        !s.shipmentCode.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (statusFilter && statusFilter !== "all" && s.status !== statusFilter) {
      return false;
    }
    if (dateFrom) {
      const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
      if (!purchaseDate || purchaseDate < new Date(dateFrom)) return false;
    }
    if (dateTo) {
      const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
      if (!purchaseDate || purchaseDate > new Date(dateTo)) return false;
    }
    return true;
  });

  // Pagination for shipments
  const totalPagesShipments = Math.ceil((filteredShipments?.length || 0) / ITEMS_PER_PAGE);
  const startIndexShipments = (currentPageShipments - 1) * ITEMS_PER_PAGE;
  const endIndexShipments = startIndexShipments + ITEMS_PER_PAGE;
  const paginatedShipments = filteredShipments?.slice(startIndexShipments, endIndexShipments);

  const filteredPayments = payments?.filter((p) => {
    const shipment = shipments?.find(s => s.id === p.shipmentId);
    if (search && shipment && 
        !shipment.shipmentName.toLowerCase().includes(search.toLowerCase()) && 
        !shipment.shipmentCode.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (statusFilter && statusFilter !== "all" && shipment && shipment.status !== statusFilter) {
      return false;
    }
    if (dateFrom) {
      const paymentDate = p.paymentDate ? new Date(p.paymentDate) : null;
      if (!paymentDate || paymentDate < new Date(dateFrom)) return false;
    }
    if (dateTo) {
      const paymentDate = p.paymentDate ? new Date(p.paymentDate) : null;
      if (!paymentDate || paymentDate > new Date(dateTo)) return false;
    }
    return true;
  });

  // Pagination for payments ledger
  const totalPagesPayments = Math.ceil((filteredPayments?.length || 0) / ITEMS_PER_PAGE);
  const startIndexPayments = (currentPagePayments - 1) * ITEMS_PER_PAGE;
  const endIndexPayments = startIndexPayments + ITEMS_PER_PAGE;
  const paginatedPayments = filteredPayments?.slice(startIndexPayments, endIndexPayments);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">سداد الشحنات</h1>
          <p className="text-muted-foreground mt-1">
            متابعة إجمالي ما تم دفعه وما هو متبقي على جميع الشحنات
          </p>
        </div>
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              resetForm();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button data-testid="button-add-payment">
              <Plus className="w-4 h-4 ml-2" />
              إضافة دفعة جديدة
            </Button>
          </DialogTrigger>
          <DialogContent className="w-full max-h-[90vh] overflow-y-auto max-w-4xl">
            <DialogHeader>
              <DialogTitle>تسجيل دفعة جديدة</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="mx-auto w-full max-w-4xl px-4">
                <PaymentWizard
                  mode="wizard"
                  steps={isSuccessState ? [] : wizardSteps}
                  currentStep={Math.min(currentStep, wizardSteps.length - 1)}
                  onStepChange={(index) => {
                    if (!isSuccessState) {
                      setCurrentStep(index);
                    }
                  }}
                  footer={
                    !isSuccessState && (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setIsDialogOpen(false);
                            resetForm();
                          }}
                        >
                          إلغاء
                        </Button>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handlePreviousStep}
                            disabled={currentStep === 0 || createMutation.isPending}
                          >
                            <ChevronRight className="h-4 w-4 ml-2" />
                            رجوع
                          </Button>
                          {currentStep === 0 && (
                            <Button
                              type="button"
                              onClick={handleNextStep}
                              disabled={isOverpayment || createMutation.isPending}
                            >
                              التالي
                              <ChevronLeft className="h-4 w-4 mr-2" />
                            </Button>
                          )}
                          {currentStep === 1 && (
                            <Button
                              type="submit"
                              disabled={createMutation.isPending || isUploadingAttachment || isOverpayment}
                              data-testid="button-save-payment"
                            >
                              {isUploadingAttachment ? "جاري رفع المرفق..." : createMutation.isPending ? "جاري الحفظ..." : "حفظ الدفعة"}
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  }
                >
                  {currentStep === 0 && !isSuccessState && (
                    <div className="space-y-4">
                      <div className="xl:hidden">{renderSummaryCard("ملخص مباشر")}</div>
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">الأساسيات</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <Label>اختر الشحنة *</Label>
                            <div className="flex gap-2">
                              <Controller
                                control={form.control}
                                name="shipmentId"
                                render={({ field }) => (
                                  <Select
                                    value={field.value ? String(field.value) : ""}
                                    onValueChange={(value) => {
                                      field.onChange(value);
                                      if (value) {
                                        form.clearErrors("shipmentId");
                                      }
                                    }}
                                  >
                                    <SelectTrigger data-testid="select-shipment" className="flex-1">
                                      <SelectValue placeholder="اختر الشحنة" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {activeShipments?.map((s) => (
                                        <SelectItem key={s.id} value={s.id.toString()}>
                                          {s.shipmentCode} - {s.shipmentName}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                disabled={!selectedShipmentId}
                                onClick={() => setShowInvoiceSummary(true)}
                                data-testid="button-invoice-summary"
                                title="ملخص الفاتورة"
                              >
                                <Receipt className="w-4 h-4" />
                              </Button>
                            </div>
                            {form.formState.errors.shipmentId && (
                              <p className="text-xs text-destructive">
                                {form.formState.errors.shipmentId.message}
                              </p>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="paymentDate">تاريخ الدفع *</Label>
                              <Input
                                id="paymentDate"
                                type="date"
                                data-testid="input-payment-date"
                                {...form.register("paymentDate")}
                              />
                              {form.formState.errors.paymentDate && (
                                <p className="text-xs text-destructive">
                                  {form.formState.errors.paymentDate.message}
                                </p>
                              )}
                            </div>
                            <div className="space-y-2">
                              <Label>عملة الدفع *</Label>
                              <Controller
                                control={form.control}
                                name="paymentCurrency"
                                render={({ field }) => (
                                  <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger data-testid="select-currency">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="EGP">جنيه مصري (ج.م)</SelectItem>
                                      <SelectItem value="RMB">رممبي صيني (¥)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">تفاصيل الدفع</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <Label>تحت حساب أي جزء؟ *</Label>
                            <Controller
                              control={form.control}
                              name="costComponent"
                              render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <SelectTrigger data-testid="select-cost-component">
                                    <SelectValue placeholder="اختر البند" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {COST_COMPONENTS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                            {form.formState.errors.costComponent && (
                              <p className="text-xs text-destructive">
                                {form.formState.errors.costComponent.message}
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>نوع الطرف</Label>
                              <Controller
                                control={form.control}
                                name="partyType"
                                render={({ field }) => (
                                  <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger data-testid="select-party-type">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="supplier">مورد</SelectItem>
                                      <SelectItem value="shipping_company">شركة شحن</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>الطرف</Label>
                              <Popover open={partyPopoverOpen} onOpenChange={setPartyPopoverOpen}>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={partyPopoverOpen}
                                    className="w-full justify-between"
                                    data-testid="select-party"
                                    disabled={!selectedShipmentId}
                                  >
                                    {partyButtonLabel}
                                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-full p-0" align="start">
                                  <Command>
                                    <CommandInput
                                      placeholder={
                                        selectedShipmentId
                                          ? partyType === "supplier"
                                            ? "ابحث عن المورد..."
                                            : "ابحث عن شركة الشحن..."
                                          : "اختر الشحنة أولاً"
                                      }
                                    />
                                    <CommandList>
                                      <CommandEmpty>{partyEmptyMessage}</CommandEmpty>
                                      <CommandGroup>
                                        {partyOptions.map((party) => (
                                          <CommandItem
                                            key={party.id}
                                            value={party.name}
                                            onSelect={() => {
                                              form.setValue("partyId", String(party.id), {
                                                shouldValidate: true,
                                              });
                                              setPartyPopoverOpen(false);
                                            }}
                                          >
                                            <Check
                                              className={cn(
                                                "ml-2 h-4 w-4",
                                                partyId === party.id
                                                  ? "opacity-100"
                                                  : "opacity-0",
                                              )}
                                            />
                                            {party.name}
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                              {form.formState.errors.partyId && (
                                <p className="text-xs text-destructive">
                                  {form.formState.errors.partyId.message}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="amountOriginal">المبلغ *</Label>
                              <Input
                                id="amountOriginal"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                data-testid="input-amount"
                                {...form.register("amountOriginal")}
                              />
                              {form.formState.errors.amountOriginal && (
                                <p className="text-xs text-destructive">
                                  {form.formState.errors.amountOriginal.message}
                                </p>
                              )}
                              {overpaymentError && (
                                <p className="text-xs text-destructive">{overpaymentError}</p>
                              )}
                            </div>
                            {paymentCurrency === "RMB" && (
                              <div className="space-y-2">
                                <Label htmlFor="exchangeRateToEgp">سعر الصرف (RMB→EGP) *</Label>
                                <Input
                                  id="exchangeRateToEgp"
                                  type="number"
                                  step="0.0001"
                                  placeholder="7.00"
                                  data-testid="input-exchange-rate"
                                  {...form.register("exchangeRateToEgp")}
                                />
                                {form.formState.errors.exchangeRateToEgp && (
                                  <p className="text-xs text-destructive">
                                    {form.formState.errors.exchangeRateToEgp.message}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>

                          {paymentPreviewBlock}

                          {showAutoAllocationSection && (
                            <div className="space-y-3 rounded-md border border-border p-3">
                              <div className="flex items-start justify-between gap-4">
                                <div className="space-y-1">
                                  <Label htmlFor="autoAllocate" className="text-sm">
                                    توزيع التكلفة
                                  </Label>
                                  <p className="text-xs text-muted-foreground">
                                    توزيع مبلغ دفعة شركة الشحن على الموردين تلقائيًا بحسب إجمالي البضاعة والمتبقي.
                                  </p>
                                  {!canAutoAllocate && (
                                    <p className="text-xs text-amber-600">
                                      يتطلب تفعيل التوزيع الدفع بالرنمبي (RMB).
                                    </p>
                                  )}
                                </div>
                                <Switch
                                  id="autoAllocate"
                                  checked={autoAllocate}
                                  onCheckedChange={setAutoAllocate}
                                  disabled={!canAutoAllocate}
                                />
                              </div>
                              {autoAllocate && canAutoAllocate && (
                                <div className="space-y-2">
                                  {!hasPreviewAmount && (
                                    <p className="text-xs text-muted-foreground">
                                      أدخل مبلغًا لعرض توزيع التكلفة المقترح.
                                    </p>
                                  )}
                                  {hasPreviewAmount && allocationPreviewLoading && (
                                    <p className="text-xs text-muted-foreground">
                                      جاري تحميل معاينة التوزيع...
                                    </p>
                                  )}
                                  {hasPreviewAmount && allocationPreviewError && (
                                    <p className="text-xs text-destructive">
                                      تعذر تحميل معاينة التوزيع.
                                    </p>
                                  )}
                                  {hasPreviewAmount &&
                                    allocationPreview &&
                                    allocationPreview.suppliers.length > 0 && (
                                      <div className="overflow-x-auto rounded-md border border-border">
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead className="text-right">المورد</TableHead>
                                              <TableHead className="text-right">إجمالي البضاعة (¥)</TableHead>
                                              <TableHead className="text-right">المتبقي (¥)</TableHead>
                                              <TableHead className="text-right">التوزيع المقترح (¥)</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {allocationPreview.suppliers.map((supplier) => {
                                              const supplierName =
                                                suppliers?.find((entry) => entry.id === supplier.supplierId)
                                                  ?.name || `مورد #${supplier.supplierId}`;
                                              return (
                                                <TableRow key={supplier.supplierId}>
                                                  <TableCell className="font-medium">{supplierName}</TableCell>
                                                  <TableCell>{formatCurrency(supplier.goodsTotalRmb)}</TableCell>
                                                  <TableCell>{formatCurrency(supplier.outstandingRmb)}</TableCell>
                                                  <TableCell className="font-semibold text-primary">
                                                    {formatCurrency(supplier.allocatedRmb)}
                                                  </TableCell>
                                                </TableRow>
                                              );
                                            })}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    )}
                                  {hasPreviewAmount &&
                                    allocationPreview &&
                                    allocationPreview.suppliers.length === 0 && (
                                      <p className="text-xs text-muted-foreground">
                                        لا توجد بيانات كافية لعرض التوزيع.
                                      </p>
                                    )}
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">تفاصيل إضافية</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <Label>طريقة الدفع *</Label>
                            <Controller
                              control={form.control}
                              name="paymentMethod"
                              render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <SelectTrigger data-testid="select-payment-method">
                                    <SelectValue placeholder="اختر طريقة الدفع" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PAYMENT_METHODS.map((m) => (
                                      <SelectItem key={m.value} value={m.value}>
                                        {m.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                            {form.formState.errors.paymentMethod && (
                              <p className="text-xs text-destructive">
                                {form.formState.errors.paymentMethod.message}
                              </p>
                            )}
                          </div>

                          {paymentMethod === "نقدي" && (
                            <div className="space-y-2">
                              <Label htmlFor="cashReceiverName">اسم مستلم الكاش *</Label>
                              <Input
                                id="cashReceiverName"
                                data-testid="input-cash-receiver"
                                {...form.register("cashReceiverName")}
                              />
                              {form.formState.errors.cashReceiverName && (
                                <p className="text-xs text-destructive">
                                  {form.formState.errors.cashReceiverName.message}
                                </p>
                              )}
                            </div>
                          )}

                          {paymentMethod && paymentMethod !== "نقدي" && (
                            <div className="space-y-2">
                              <Label htmlFor="referenceNumber">الرقم المرجعي</Label>
                              <Input
                                id="referenceNumber"
                                data-testid="input-reference"
                                {...form.register("referenceNumber")}
                              />
                            </div>
                          )}

                          <div className="space-y-2">
                            <Label htmlFor="note">ملاحظات</Label>
                            <Textarea
                              id="note"
                              rows={2}
                              data-testid="input-note"
                              {...form.register("note")}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="attachment">إرفاق صورة (اختياري)</Label>
                            <Input
                              key={attachmentInputKey}
                              id="attachment"
                              type="file"
                              accept="image/*"
                              onChange={handleAttachmentChange}
                              data-testid="input-attachment"
                            />
                            <p className="text-xs text-muted-foreground">
                              يُسمح بالصور فقط بحد أقصى 2MB.
                            </p>
                            {attachmentError && (
                              <p className="text-xs text-destructive">{attachmentError}</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                        </div>
                        <div className="hidden xl:block">{renderSummaryCard("ملخص مباشر")}</div>
                      </div>
                    </div>
                  )}

                  {currentStep === 1 && !isSuccessState && (
                    <Card>
                      <CardHeader className="space-y-2">
                        <CardTitle className="text-base">مراجعة وتأكيد</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          راجع تفاصيل الدفعة قبل الحفظ النهائي.
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {paymentPreviewBlock}
                        <PaymentSummaryReceipt data={reviewReceiptData} />
                        {renderSummaryCard("ملخص المراجعة")}

                        {invoiceSummary?.paymentAllowance && (
                          <p className="text-xs text-muted-foreground">
                            المصدر: {invoiceSummary.paymentAllowance.source === "declared" ? "معلن" : "مسترجع"}
                            {invoiceSummary.computedAt
                              ? ` • تم التحديث ${formatDate(invoiceSummary.computedAt)}`
                              : ""}
                          </p>
                        )}

                        {(loadingInvoiceSummary || fetchingInvoiceSummary) && (
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                          </div>
                        )}

                        {invoiceSummaryError && (
                          <div className="text-xs text-destructive">
                            {getErrorMessage(invoiceSummaryError, summaryErrorOverrides)}
                          </div>
                        )}

                        {attachmentPreviewUrl && (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">معاينة المرفق</p>
                            <img
                              src={attachmentPreviewUrl}
                              alt="معاينة المرفق"
                              className="h-32 w-auto rounded-md border object-contain"
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {isSuccessState && completedPaymentSnapshot && (
                    <Card>
                      <CardHeader className="space-y-2">
                        <div className="flex items-center gap-2 text-emerald-600">
                          <CheckCircle2 className="h-6 w-6" />
                          <CardTitle className="text-base">تم حفظ الدفعة بنجاح</CardTitle>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          رقم المرجع:{" "}
                          <span className="font-mono text-foreground">
                            {completedPaymentSnapshot.receiptData.referenceNumber}
                          </span>
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div
                          ref={summaryExportRef}
                          className="w-full max-w-[720px] mx-auto"
                        >
                          <PaymentSummaryReceipt data={completedPaymentSnapshot.receiptData} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleDownloadSummary}
                            disabled={isDownloadingSummary}
                          >
                            <Download className="h-4 w-4 ml-2" />
                            {isDownloadingSummary ? "جاري التحميل..." : "تحميل صورة الملخص"}
                          </Button>
                          <Button
                            type="button"
                            onClick={() => {
                              setIsDialogOpen(false);
                              resetForm();
                            }}
                          >
                            العودة للمدفوعات
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </PaymentWizard>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      {loadingStats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            title="إجمالي تكلفة الشحنات"
            value={`${formatCurrency(stats?.totalCostEgp || 0)} ج.م`}
            icon={Ship}
          />
          <StatCard
            title="إجمالي المدفوع"
            value={`${formatCurrency(stats?.totalPaidEgp || 0)} ج.م`}
            icon={CreditCard}
            trend="up"
          />
          <StatCard
            title="إجمالي المتبقي"
            value={`${formatCurrency(stats?.totalBalanceEgp || 0)} ج.م`}
            icon={TrendingDown}
            trend={parseFloat(stats?.totalBalanceEgp || "0") > 0 ? "down" : undefined}
          />
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="shipments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="shipments" data-testid="tab-shipments">
            الشحنات والأرصدة
          </TabsTrigger>
          <TabsTrigger value="ledger" data-testid="tab-ledger">
            كشف حركة السداد
          </TabsTrigger>
        </TabsList>

        <TabsContent value="shipments" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">الفلاتر</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث بالشحنة..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pr-10"
                    data-testid="input-search-payments"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger data-testid="select-status-filter">
                    <SelectValue placeholder="حالة الشحنة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الحالات</SelectItem>
                    <SelectItem value="في انتظار الشحن">في انتظار الشحن</SelectItem>
                    <SelectItem value="جاهزة للاستلام">جاهزة للاستلام</SelectItem>
                    <SelectItem value="مستلمة بنجاح">مستلمة بنجاح</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder="من تاريخ"
                  data-testid="input-date-from"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  placeholder="إلى تاريخ"
                  data-testid="input-date-to"
                />
              </div>
              {(search || statusFilter !== "all" || dateFrom || dateTo) && (
                <div className="mt-4 flex items-center justify-end">
                  <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                    مسح الفلاتر
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shipments Payment Table */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Ship className="w-5 h-5" />
                أرصدة الشحنات
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingShipments ? (
                <TableSkeleton />
              ) : filteredShipments && filteredShipments.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">رقم الشحنة</TableHead>
                          <TableHead className="text-right">اسم الشحنة</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right">التكلفة (ج.م)</TableHead>
                          <TableHead className="text-right">المدفوع (ج.م)</TableHead>
                          <TableHead className="text-right">الرصيد</TableHead>
                          <TableHead className="text-right">آخر سداد</TableHead>
                          <TableHead className="text-right">إجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedShipments?.map((shipment) => {
                          const isExpanded = expandedShipments.has(shipment.id);
                          const shipmentPayments = payments?.filter((p) => p.shipmentId === shipment.id) || [];
                          return (
                            <Fragment key={shipment.id}>
                              <TableRow
                                data-testid={`row-payment-${shipment.id}`}
                                className="cursor-pointer"
                                onClick={() => toggleShipmentExpand(shipment.id)}
                              >
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    {isExpanded ? (
                                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                    )}
                                    {shipment.shipmentCode}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {shipment.shipmentName}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={shipmentStatusColors[shipment.status] || ""}>{shipment.status}</Badge>
                                </TableCell>
                                <TableCell>
                                  {formatCurrency(shipment.finalTotalCostEgp)}
                                </TableCell>
                                <TableCell>
                                  {formatCurrency(shipment.totalPaidEgp)}
                                </TableCell>
                                <TableCell>
                                  <BalanceBadge
                                    cost={shipment.finalTotalCostEgp}
                                    paid={shipment.totalPaidEgp}
                                  />
                                </TableCell>
                                <TableCell>
                                  {formatDate(shipment.lastPaymentDate)}
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        form.setValue("shipmentId", shipment.id.toString(), {
                                          shouldValidate: true,
                                        });
                                        setShowInvoiceSummary(true);
                                      }}
                                      data-testid={`button-invoice-summary-${shipment.id}`}
                                    >
                                      <Receipt className="w-4 h-4 ml-1" />
                                      ملخص
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        form.setValue("shipmentId", shipment.id.toString(), {
                                          shouldValidate: true,
                                        });
                                        setIsDialogOpen(true);
                                      }}
                                      data-testid={`button-add-payment-${shipment.id}`}
                                    >
                                      <Plus className="w-4 h-4 ml-1" />
                                      دفعة
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                              {isExpanded && (
                                <TableRow key={`${shipment.id}-details`}>
                                  <TableCell colSpan={8} className="bg-muted/30 p-4">
                                    {shipmentPayments.length > 0 ? (
                                      <div className="grid gap-2">
                                        {shipmentPayments.map((payment) => {
                                          const supplierName = payment.partyType === "supplier" && payment.partyId 
                                            ? suppliers?.find(s => s.id === payment.partyId)?.name 
                                            : null;
                                          const shippingCompanyName = payment.partyType === "shipping_company" && payment.partyId 
                                            ? shippingCompanies?.find(c => c.id === payment.partyId)?.name 
                                            : null;
                                          
                                          return (
                                          <div
                                            key={payment.id}
                                            className="border rounded-md bg-background text-sm"
                                            data-testid={`payment-card-${payment.id}`}
                                          >
                                            {/* Main row - distributed across full width */}
                                            <div className="flex items-center justify-between gap-4 p-3">
                                              {/* Right side - Amount & Method */}
                                              <div className="flex items-center gap-4 flex-shrink-0">
                                                <div className="text-right">
                                                  <div className="font-bold font-mono text-lg whitespace-nowrap">
                                                    {payment.paymentCurrency === "RMB" ? "¥" : "ج.م"}
                                                    {payment.paymentCurrency === "RMB" 
                                                      ? formatCurrency(payment.amountOriginal)
                                                      : formatCurrency(payment.amountEgp)
                                                    }
                                                  </div>
                                                  {payment.paymentCurrency === "RMB" && (
                                                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                                                      ≈ ج.م {formatCurrency(payment.amountEgp)}
                                                    </div>
                                                  )}
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                  <Badge variant="secondary" className="text-xs">
                                                    {payment.paymentMethod}
                                                  </Badge>
                                                  <Badge variant="outline" className="text-xs">
                                                    {payment.costComponent}
                                                  </Badge>
                                                </div>
                                              </div>

                                              {/* Middle - Party info */}
                                              <div className="flex-1 flex items-center justify-center gap-6 text-sm">
                                                {supplierName && (
                                                  <div className="flex items-center gap-1.5">
                                                    <Building2 className="w-4 h-4 text-muted-foreground" />
                                                    <span className="font-medium">{supplierName}</span>
                                                  </div>
                                                )}
                                                {shippingCompanyName && (
                                                  <div className="flex items-center gap-1.5">
                                                    <Ship className="w-4 h-4 text-muted-foreground" />
                                                    <span className="font-medium">{shippingCompanyName}</span>
                                                  </div>
                                                )}
                                                {payment.cashReceiverName && (
                                                  <div className="flex items-center gap-1.5">
                                                    <User className="w-4 h-4 text-muted-foreground" />
                                                    <span className="font-medium">{payment.cashReceiverName}</span>
                                                  </div>
                                                )}
                                                {payment.referenceNumber && (
                                                  <div className="flex items-center gap-1.5">
                                                    <Hash className="w-4 h-4 text-muted-foreground" />
                                                    <span className="font-mono">{payment.referenceNumber}</span>
                                                  </div>
                                                )}
                                              </div>

                                              {/* Left side - Date & Actions */}
                                              <div className="flex items-center gap-3 flex-shrink-0">
                                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                                  <Calendar className="w-3.5 h-3.5" />
                                                  {new Date(payment.paymentDate).toLocaleDateString("ar-EG", {
                                                    day: "numeric",
                                                    month: "short"
                                                  })}
                                                </div>
                                                {payment.attachmentUrl && (
                                                  <PaymentAttachmentIcon
                                                    paymentId={payment.id}
                                                    attachmentUrl={payment.attachmentUrl}
                                                    attachmentOriginalName={payment.attachmentOriginalName}
                                                    className="text-primary hover:text-primary/80 transition-colors"
                                                  />
                                                )}
                                                {isAdmin && (
                                                  <AlertDialog open={paymentToDelete === payment.id} onOpenChange={(open) => !open && setPaymentToDelete(null)}>
                                                    <AlertDialogTrigger asChild>
                                                      <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => setPaymentToDelete(payment.id)}
                                                        disabled={deleteMutation.isPending}
                                                        data-testid={`button-delete-expanded-payment-${payment.id}`}
                                                      >
                                                        <Trash2 className="w-4 h-4 text-destructive" />
                                                      </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                      <AlertDialogHeader>
                                                        <AlertDialogTitle>حذف الدفعة</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                          هل أنت متأكد من حذف هذه الدفعة؟ سيتم إلغاء جميع التخصيصات المرتبطة بها وتحديث أرصدة الشحنة. هذا الإجراء لا يمكن التراجع عنه.
                                                        </AlertDialogDescription>
                                                      </AlertDialogHeader>
                                                      <AlertDialogFooter className="gap-2">
                                                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                        <AlertDialogAction
                                                          onClick={() => deleteMutation.mutate(payment.id)}
                                                          className="bg-destructive text-destructive-foreground"
                                                        >
                                                          {deleteMutation.isPending ? "جاري الحذف..." : "حذف"}
                                                        </AlertDialogAction>
                                                      </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                  </AlertDialog>
                                                )}
                                              </div>
                                            </div>

                                            {/* Notes row - only if exists */}
                                            {payment.note && (
                                              <div className="px-3 pb-2">
                                                <div className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1.5 flex items-start gap-1.5">
                                                  <FileText className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                                  <span>{payment.note}</span>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )})}
                                      </div>
                                    ) : (
                                      <div className="text-sm text-muted-foreground text-center py-2">
                                        لا توجد مدفوعات بعد لهذه الشحنة
                                      </div>
                                    )}
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination Controls */}
                  {totalPagesShipments > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPageShipments(Math.max(1, currentPageShipments - 1))}
                        disabled={currentPageShipments === 1}
                        data-testid="button-prev-page-shipments"
                      >
                        <ChevronUp className="w-4 h-4" />
                        السابق
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(totalPagesShipments, 5) }, (_, i) => {
                          let pageNum: number;
                          if (totalPagesShipments <= 5) {
                            pageNum = i + 1;
                          } else if (currentPageShipments <= 3) {
                            pageNum = i + 1;
                          } else if (currentPageShipments >= totalPagesShipments - 2) {
                            pageNum = totalPagesShipments - 4 + i;
                          } else {
                            pageNum = currentPageShipments - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPageShipments === pageNum ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPageShipments(pageNum)}
                              data-testid={`button-page-shipments-${pageNum}`}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPageShipments(Math.min(totalPagesShipments, currentPageShipments + 1))}
                        disabled={currentPageShipments === totalPagesShipments}
                        data-testid="button-next-page-shipments"
                      >
                        التالي
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground mr-4">
                        صفحة {currentPageShipments} من {totalPagesShipments}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState
                  icon={Ship}
                  title="لا توجد شحنات"
                  description="أضف شحنات لبدء تتبع المدفوعات"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger" className="space-y-4">
          {/* Filters for Ledger */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">الفلاتر</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث بالشحنة..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pr-10"
                    data-testid="input-search-ledger"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger data-testid="select-ledger-status-filter">
                    <SelectValue placeholder="حالة الشحنة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الحالات</SelectItem>
                    <SelectItem value="في انتظار الشحن">في انتظار الشحن</SelectItem>
                    <SelectItem value="جاهزة للاستلام">جاهزة للاستلام</SelectItem>
                    <SelectItem value="مستلمة بنجاح">مستلمة بنجاح</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder="من تاريخ"
                  data-testid="input-ledger-date-from"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  placeholder="إلى تاريخ"
                  data-testid="input-ledger-date-to"
                />
              </div>
              {(search || statusFilter !== "all" || dateFrom || dateTo) && (
                <div className="mt-4 flex items-center justify-end">
                  <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-ledger-filters">
                    مسح الفلاتر
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                كشف حركة السداد
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingPayments ? (
                <TableSkeleton />
              ) : filteredPayments && filteredPayments.length > 0 ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">التاريخ</TableHead>
                          <TableHead className="text-right">الشحنة</TableHead>
                          <TableHead className="text-right">تحت حساب</TableHead>
                          <TableHead className="text-right">المبلغ الأصلي</TableHead>
                          <TableHead className="text-right">المبلغ (ج.م)</TableHead>
                          <TableHead className="text-right">طريقة الدفع</TableHead>
                          <TableHead className="text-right">المستلم/المرجع</TableHead>
                          <TableHead className="text-right">ملاحظات</TableHead>
                          <TableHead className="text-right">مرفق</TableHead>
                          {isAdmin && <TableHead className="text-right">إجراءات</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedPayments?.map((payment) => (
                        <TableRow
                          key={payment.id}
                          data-testid={`row-ledger-${payment.id}`}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-muted-foreground" />
                              {formatDate(payment.paymentDate)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {payment.shipment?.shipmentCode || "-"}
                          </TableCell>
                          <TableCell>{payment.costComponent}</TableCell>
                          <TableCell>
                            <span className="font-mono">
                              {payment.paymentCurrency === "RMB" ? "¥" : "ج.م"}{" "}
                              {payment.paymentCurrency === "RMB" 
                                ? formatCurrency(payment.amountOriginal)
                                : formatCurrency(payment.amountEgp)
                              }
                            </span>
                          </TableCell>
                          <TableCell className="font-bold text-muted-foreground text-xs">
                            {payment.paymentCurrency === "EGP" ? "-" : `${formatCurrency(payment.amountEgp)} ج.م`}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{payment.paymentMethod}</Badge>
                          </TableCell>
                          <TableCell>
                            {payment.partyType === "supplier" && payment.partyId ? (
                              <div className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {suppliers?.find(s => s.id === payment.partyId)?.name || "مورد"}
                              </div>
                            ) : payment.partyType === "shipping_company" && payment.partyId ? (
                              <div className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {shippingCompanies?.find(c => c.id === payment.partyId)?.name || "شحن"}
                              </div>
                            ) : payment.paymentMethod === "نقدي" ? (
                              <div className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {payment.cashReceiverName}
                              </div>
                            ) : (
                              payment.referenceNumber || "-"
                            )}
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div className="line-clamp-2 break-words">
                              {payment.note || "-"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <PaymentAttachmentIcon
                              paymentId={payment.id}
                              attachmentUrl={payment.attachmentUrl}
                              attachmentOriginalName={payment.attachmentOriginalName}
                            />
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <AlertDialog open={paymentToDelete === payment.id} onOpenChange={(open) => !open && setPaymentToDelete(null)}>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setPaymentToDelete(payment.id)}
                                    disabled={deleteMutation.isPending}
                                    data-testid={`button-delete-payment-${payment.id}`}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>حذف الدفعة</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      هل أنت متأكد من حذف هذه الدفعة؟ سيتم إلغاء جميع التخصيصات المرتبطة بها وتحديث أرصدة الشحنة. هذا الإجراء لا يمكن التراجع عنه.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter className="gap-2">
                                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteMutation.mutate(payment.id)}
                                      className="bg-destructive text-destructive-foreground"
                                    >
                                      {deleteMutation.isPending ? "جاري الحذف..." : "حذف"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination Controls */}
                  {totalPagesPayments > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPagePayments(Math.max(1, currentPagePayments - 1))}
                        disabled={currentPagePayments === 1}
                        data-testid="button-prev-page-payments-ledger"
                      >
                        <ChevronUp className="w-4 h-4" />
                        السابق
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(totalPagesPayments, 5) }, (_, i) => {
                          let pageNum: number;
                          if (totalPagesPayments <= 5) {
                            pageNum = i + 1;
                          } else if (currentPagePayments <= 3) {
                            pageNum = i + 1;
                          } else if (currentPagePayments >= totalPagesPayments - 2) {
                            pageNum = totalPagesPayments - 4 + i;
                          } else {
                            pageNum = currentPagePayments - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPagePayments === pageNum ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPagePayments(pageNum)}
                              data-testid={`button-page-payments-ledger-${pageNum}`}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPagePayments(Math.min(totalPagesPayments, currentPagePayments + 1))}
                        disabled={currentPagePayments === totalPagesPayments}
                        data-testid="button-next-page-payments-ledger"
                      >
                        التالي
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground mr-4">
                        صفحة {currentPagePayments} من {totalPagesPayments}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={CreditCard}
                  title="لا توجد مدفوعات"
                  description="سجل أول دفعة لبدء التتبع"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Invoice Summary Modal - at root level for proper focus management */}
      <Dialog open={showInvoiceSummary} onOpenChange={setShowInvoiceSummary}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              ملخص فاتورة الشحنة
            </DialogTitle>
          </DialogHeader>
          {loadingInvoiceSummary ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : invoiceSummaryError ? (
            <div className="text-center py-4">
              <div className="text-destructive mb-2">
                {getErrorMessage(invoiceSummaryError, summaryErrorOverrides)}
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowInvoiceSummary(false)}>
                إغلاق
              </Button>
            </div>
          ) : invoiceSummary ? (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {invoiceSummary.shipmentCode} - {invoiceSummary.shipmentName}
              </div>

              <div className="border rounded-md p-3 space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <span className="text-lg">ج.م</span>
                  الملخص المالي
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">التكلفة المعروفة:</span>
                  <span className="text-left font-mono">{formatCurrency(invoiceSummary.knownTotalCost)} ج.م</span>

                  <span className="text-muted-foreground">المدفوع (محول):</span>
                  <span className="text-left font-mono text-green-600 dark:text-green-400">{formatCurrency(invoiceSummary.totalPaidEgp)} ج.م</span>

                  <span className="text-muted-foreground">المتبقي المسموح:</span>
                  <span className="text-left font-mono text-red-600 dark:text-red-400">{formatCurrency(invoiceSummary.remainingAllowed)} ج.م</span>
                </div>

                {invoiceSummary.paidByCurrency && Object.keys(invoiceSummary.paidByCurrency).length > 0 && (
                  <div className="pt-2 border-t space-y-1">
                    <div className="text-xs text-muted-foreground">تفاصيل المدفوعات حسب العملة:</div>
                    {Object.entries(invoiceSummary.paidByCurrency).map(([currency, values]) => (
                      <div key={currency} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">مدفوع {currency}:</span>
                        <span className="text-left font-mono">
                          {formatCurrency(values.original)} {currency}
                          <span className="text-muted-foreground text-xs ml-2">
                            ({formatCurrency(values.convertedToEgp)} ج.م)
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* RMB Section */}
              <div className="border rounded-md p-3 space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <span className="text-lg">¥</span>
                  تكاليف اليوان الصيني (RMB)
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">تكلفة البضاعة:</span>
                  <span className="text-left font-mono">{formatCurrency(invoiceSummary.rmb.goodsTotal)} ¥</span>
                  
                  <span className="text-muted-foreground">تكلفة الشحن:</span>
                  <span className="text-left font-mono">{formatCurrency(invoiceSummary.rmb.shippingTotal)} ¥</span>
                  
                  <span className="text-muted-foreground">العمولة:</span>
                  <span className="text-left font-mono">{formatCurrency(invoiceSummary.rmb.commissionTotal)} ¥</span>
                  
                  <span className="font-medium border-t pt-1">الإجمالي:</span>
                  <span className="text-left font-mono font-medium border-t pt-1">{formatCurrency(invoiceSummary.rmb.subtotal)} ¥</span>
                  
                  <span className="text-green-600 dark:text-green-400">المدفوع:</span>
                  <span className="text-left font-mono text-green-600 dark:text-green-400">{formatCurrency(invoiceSummary.rmb.paid)} ¥</span>
                  
                  <span className="text-red-600 dark:text-red-400">المتبقي:</span>
                  <span className="text-left font-mono text-red-600 dark:text-red-400">{formatCurrency(invoiceSummary.rmb.remaining)} ¥</span>
                </div>
              </div>
              
              {/* EGP Section */}
              <div className="border rounded-md p-3 space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <span className="text-lg">ج.م</span>
                  تكاليف الجنيه المصري (EGP)
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">الجمارك:</span>
                  <span className="text-left font-mono">{formatCurrency(invoiceSummary.egp.customsTotal)} ج.م</span>
                  
                  <span className="text-muted-foreground">التخريج:</span>
                  <span className="text-left font-mono">{formatCurrency(invoiceSummary.egp.takhreegTotal)} ج.م</span>
                  
                  <span className="font-medium border-t pt-1">الإجمالي:</span>
                  <span className="text-left font-mono font-medium border-t pt-1">{formatCurrency(invoiceSummary.egp.subtotal)} ج.م</span>
                  
                  <span className="text-green-600 dark:text-green-400">المدفوع:</span>
                  <span className="text-left font-mono text-green-600 dark:text-green-400">{formatCurrency(invoiceSummary.egp.paid)} ج.م</span>
                  
                  <span className="text-red-600 dark:text-red-400">المتبقي:</span>
                  <span className="text-left font-mono text-red-600 dark:text-red-400">{formatCurrency(invoiceSummary.egp.remaining)} ج.م</span>
                </div>
              </div>

              {invoiceSummary.paymentAllowance && (
                <div className="border rounded-md p-3 bg-muted/40 space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">إجمالي التكاليف المعروفة (ج.م)</span>
                    <span className="font-mono font-medium">
                      {formatCurrency(invoiceSummary.paymentAllowance.knownTotalEgp)} ج.م
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">المدفوع حتى الآن (ج.م)</span>
                    <span className="font-mono">
                      {formatCurrency(invoiceSummary.paymentAllowance.alreadyPaidEgp)} ج.م
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    <span>المتبقي المسموح سداده الآن</span>
                    <span>
                      {formatCurrency(invoiceSummary.paymentAllowance.remainingAllowedEgp)} ج.م
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-4">
              لا توجد بيانات
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string;
  icon: typeof Ship;
  trend?: "up" | "down";
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div
            className={`w-12 h-12 rounded-md flex items-center justify-center ${
              trend === "up"
                ? "bg-green-100 dark:bg-green-900/30"
                : trend === "down"
                ? "bg-red-100 dark:bg-red-900/30"
                : "bg-primary/10"
            }`}
          >
            <Icon
              className={`w-6 h-6 ${
                trend === "up"
                  ? "text-green-600 dark:text-green-400"
                  : trend === "down"
                  ? "text-red-600 dark:text-red-400"
                  : "text-primary"
              }`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BalanceBadge({
  cost,
  paid,
}: {
  cost: string | number | null;
  paid: string | number | null;
}) {
  const costValue = typeof cost === "string" ? parseFloat(cost) : cost || 0;
  const paidValue = typeof paid === "string" ? parseFloat(paid) : paid || 0;
  const remaining = Math.max(0, costValue - paidValue);

  const formatCurrency = (num: number) =>
    new Intl.NumberFormat("ar-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);

  if (remaining === 0) {
    return (
      <Badge
        variant="outline"
        className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      >
        مسددة
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
    >
      متبقي: {formatCurrency(remaining)} ج.م
    </Badge>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Ship;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
        <Icon className="w-10 h-10 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-medium mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
