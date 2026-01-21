import type { Express, RequestHandler } from "express";
import type { Server } from "http";
import { storage, type IStorage } from "./storage";
import { setupAuth, isAuthenticated, requireRole } from "./auth";
import { normalizePaymentAmounts } from "./services/currency";
import { logAuditEvent } from "./audit";
import { getPaymentsWithShipments } from "./payments";
import { createShipmentWithItems, updateShipmentWithItems, updateMissingPieces } from "./shipmentService";
import { startBackup, startRestore, getBackupJobs, getBackupJob } from "./backupService";
import { ApiError, formatError, success } from "./errors";
import type { User } from "@shared/schema";
import {
  insertSupplierSchema,
  insertShippingCompanySchema,
  insertProductTypeSchema,
  insertExchangeRateSchema,
  insertPartySchema,
  insertLocalInvoiceSchema,
  insertLocalInvoiceLineSchema,
  insertLocalPaymentSchema,
  insertReturnCaseSchema,
} from "@shared/schema";
import { calculatePaymentSnapshot, parseAmountOrZero } from "./services/paymentCalculations";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import { ZodError } from "zod";
import { ObjectStorageService } from "./replit_integrations/object_storage";

// Configure multer for item image uploads
const itemImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = "uploads/items";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `item-${uniqueSuffix}${ext}`);
  },
});

const uploadItemImage = multer({
  storage: itemImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const MAX_PAYMENT_ATTACHMENT_SIZE = 2 * 1024 * 1024;

type PartyPaymentSummary = {
  currency: "RMB" | "EGP";
  totalAllowed: number;
  paidSoFar: number;
  remainingBefore: number;
};

type PartyPaymentSummaryInput = {
  shipmentId: number;
  partyType: "supplier" | "shipping_company";
  partyId: number;
  component: string;
};

async function buildPartyPaymentSummary(
  storage: Pick<
    IStorage,
    | "getShipment"
    | "getShipmentPayments"
    | "getShipmentItems"
    | "getPaymentAllocationsByShipmentId"
  >,
  input: PartyPaymentSummaryInput,
): Promise<PartyPaymentSummary> {
  const { shipmentId, partyType, partyId, component } = input;
  const shipment = await storage.getShipment(shipmentId);
  if (!shipment) {
    throw new ApiError("SHIPMENT_NOT_FOUND", undefined, 404, { shipmentId });
  }

  const payments = await storage.getShipmentPayments(shipmentId);
  const componentCurrency =
    component === "الجمرك" || component === "التخريج" ? "EGP" : "RMB";

  let totalAllowed = 0;
  let paidSoFar = 0;

  if (partyType === "supplier") {
    const [items, allocations] = await Promise.all([
      storage.getShipmentItems(shipmentId),
      storage.getPaymentAllocationsByShipmentId(shipmentId),
    ]);

    totalAllowed = items.reduce((sum, item) => {
      if (item.supplierId !== partyId) return sum;
      return sum + parseAmountOrZero(item.totalPurchaseCostRmb);
    }, 0);

    // Use shipment's exchange rate as fallback for EGP payments without their own rate
    const shipmentRate = parseAmountOrZero(shipment.purchaseRmbToEgpRate || "7");

    const supplierDirectPaidRmb = payments.reduce((sum, payment) => {
      if (
        payment.partyType !== "supplier" ||
        payment.partyId !== partyId ||
        payment.costComponent !== PURCHASE_COST_COMPONENT
      ) {
        return sum;
      }

      if (payment.paymentCurrency === "RMB") {
        return sum + parseAmountOrZero(payment.amountOriginal);
      }

      if (payment.paymentCurrency === "EGP") {
        // Use payment's own rate, or fallback to shipment's rate
        const rate = payment.exchangeRateToEgp 
          ? parseAmountOrZero(payment.exchangeRateToEgp) 
          : shipmentRate;
        if (rate > 0) {
          return sum + parseAmountOrZero(payment.amountEgp) / rate;
        }
      }

      return sum;
    }, 0);

    const supplierAllocatedPaidRmb = allocations.reduce((sum, allocation) => {
      if (
        allocation.supplierId !== partyId ||
        allocation.component !== PURCHASE_COST_COMPONENT ||
        allocation.currency !== "RMB"
      ) {
        return sum;
      }

      return sum + parseAmountOrZero(allocation.allocatedAmount);
    }, 0);

    paidSoFar = supplierDirectPaidRmb + supplierAllocatedPaidRmb;
  }

  if (partyType === "shipping_company") {
    const goodsTotalRmbGross = parseAmountOrZero(shipment.purchaseCostRmb || "0");
    const partialDiscountRmb = parseAmountOrZero(shipment.partialDiscountRmb || "0");
    const goodsTotalRmb = Math.max(0, goodsTotalRmbGross - partialDiscountRmb);

    const componentTotals: Record<string, number> = {
      "تكلفة البضاعة": goodsTotalRmb,
      "الشحن": parseAmountOrZero(shipment.shippingCostRmb || "0"),
      "العمولة": parseAmountOrZero(shipment.commissionCostRmb || "0"),
      "الجمرك": parseAmountOrZero(shipment.customsCostEgp || "0"),
      "التخريج": parseAmountOrZero(shipment.takhreegCostEgp || "0"),
    };

    totalAllowed = componentTotals[component] ?? 0;

    // Use shipment's exchange rate as fallback for EGP payments without their own rate
    const shippingShipmentRate = parseAmountOrZero(shipment.purchaseRmbToEgpRate || "7");

    paidSoFar = payments.reduce((sum, payment) => {
      if (
        payment.partyType !== "shipping_company" ||
        payment.partyId !== partyId ||
        payment.costComponent !== component
      ) {
        return sum;
      }

      if (componentCurrency === "RMB") {
        if (payment.paymentCurrency === "RMB") {
          return sum + parseAmountOrZero(payment.amountOriginal);
        }
        if (payment.paymentCurrency === "EGP") {
          // Use payment's own rate, or fallback to shipment's rate
          const rate = payment.exchangeRateToEgp 
            ? parseAmountOrZero(payment.exchangeRateToEgp) 
            : shippingShipmentRate;
          if (rate > 0) {
            return sum + parseAmountOrZero(payment.amountEgp) / rate;
          }
        }
        return sum;
      }

      return sum + parseAmountOrZero(payment.amountEgp);
    }, 0);
  }

  const remainingBefore = Math.max(0, totalAllowed - paidSoFar);

  return {
    currency: componentCurrency,
    totalAllowed,
    paidSoFar,
    remainingBefore,
  };
}

const paymentAttachmentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = "uploads/payments";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `payment-${uniqueSuffix}${ext}`);
  },
});

const uploadPaymentAttachment = multer({
  storage: paymentAttachmentStorage,
  limits: { fileSize: MAX_PAYMENT_ATTACHMENT_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const handlePaymentAttachmentUpload: RequestHandler = (req, res, next) => {
  uploadPaymentAttachment.single("attachment")(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: {
          code: "PAYMENT_ATTACHMENT_TOO_LARGE",
          message: "Image must be 2MB or less.",
        },
      });
    }

    if (err.message === "Only image files are allowed") {
      return res.status(400).json({
        error: {
          code: "PAYMENT_ATTACHMENT_INVALID_TYPE",
          message: "Only image files are allowed.",
        },
      });
    }

    return res.status(400).json({
      error: {
        code: "PAYMENT_ATTACHMENT_UPLOAD_FAILED",
        message: "تعذر رفع صورة الدفعة. حاول مرة أخرى.",
      },
    });
  });
};

const uploadBackupFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith(".zip")) {
      cb(null, true);
    } else {
      cb(new Error("يجب أن يكون الملف بصيغة ZIP"));
    }
  },
});

type RouteDependencies = {
  storage?: IStorage;
  auditLogger?: typeof logAuditEvent;
  shipments?: {
    createShipmentWithItems: typeof createShipmentWithItems;
    updateShipmentWithItems: typeof updateShipmentWithItems;
  };
  auth?: {
    setupAuth: (app: Express) => Promise<void>;
    isAuthenticated: RequestHandler;
    requireRole: (roles: string[]) => RequestHandler;
  };
};

type CreatePaymentHandlerDeps = {
  storage: Pick<
    IStorage,
    | "createPayment"
    | "getSupplier"
    | "getShippingCompany"
    | "getShipmentSupplierContext"
    | "getShipment"
    | "getShipmentPayments"
    | "getShipmentItems"
    | "getPaymentAllocationsByShipmentId"
  >;
  logAuditEvent: (event: Parameters<typeof logAuditEvent>[0]) => void;
};

const PURCHASE_COST_COMPONENT = "تكلفة البضاعة";
const SHIPPING_COST_COMPONENTS = new Set(["الشحن", "العمولة", "الجمرك", "التخريج"]);

export function createPaymentHandler(deps: CreatePaymentHandlerDeps): RequestHandler {
  return async (req, res) => {
    try {
      const {
        shipmentId,
        partyType,
        partyId,
        paymentDate,
        paymentCurrency,
        amountOriginal,
        exchangeRateToEgp,
        costComponent,
        paymentMethod,
        cashReceiverName,
        referenceNumber,
        note,
        notes,
        autoAllocate,
        attachmentUrl: bodyAttachmentUrl,
        attachmentOriginalName: bodyAttachmentOriginalName,
        attachmentMimeType: bodyAttachmentMimeType,
        attachmentSize: bodyAttachmentSize,
      } = req.body;
      const actorId = (req.user as any)?.id;
      const attachment = req.file;
      const parsedShipmentId = Number(shipmentId);
      const parsedPartyId =
        partyId !== undefined && partyId !== null && partyId !== ""
          ? Number(partyId)
          : null;
      const normalizedPartyType =
        partyType === "supplier" || partyType === "shipping_company" ? partyType : null;

      if (Number.isNaN(parsedShipmentId)) {
        return res.status(400).json({
          error: {
            code: "PAYMENT_PAYLOAD_INVALID",
            message: "بيانات الدفعة غير مكتملة أو غير صحيحة. راجع الحقول المطلوبة.",
            details: { field: "shipmentId" },
          },
        });
      }
      const { itemSuppliers, shippingCompanyId, shipmentSuppliers } =
        await deps.storage.getShipmentSupplierContext(parsedShipmentId);
      const isShippingComponent = SHIPPING_COST_COMPONENTS.has(costComponent);
      const isPurchaseComponent = costComponent === PURCHASE_COST_COMPONENT;
      const allowedSuppliers = isPurchaseComponent ? itemSuppliers : shipmentSuppliers;
      const allowedShippingCompanies = shippingCompanyId ? [shippingCompanyId] : [];

      const allowedPartyTypes = new Map<
        "supplier" | "shipping_company",
        number[]
      >();

      if (!isShippingComponent) {
        allowedPartyTypes.set("supplier", allowedSuppliers);
      }

      const canUseShippingCompany =
        allowedShippingCompanies.length > 0 && (isShippingComponent || isPurchaseComponent);

      if (canUseShippingCompany) {
        allowedPartyTypes.set("shipping_company", allowedShippingCompanies);
      }

      const allowedPartyCandidates = Array.from(allowedPartyTypes.entries()).flatMap(
        ([type, ids]) => ids.map((id) => ({ type, id })),
      );

      const shouldRequireParty = allowedPartyCandidates.length > 0;
      const shouldDefaultParty =
        !normalizedPartyType &&
        parsedPartyId === null &&
        allowedPartyCandidates.length === 1;
      const resolvedParty =
        shouldDefaultParty ? allowedPartyCandidates[0] : null;

      const resolvedPartyType = resolvedParty?.type ?? normalizedPartyType;
      const resolvedPartyId = resolvedParty?.id ?? parsedPartyId;

      if (shouldRequireParty && (!resolvedPartyType || !resolvedPartyId)) {
        return res.status(400).json({
          error: {
            code: "PARTY_REQUIRED",
            message: "يجب تحديد الطرف المرتبط بهذه الشحنة.",
            details: { field: "partyId", shipmentSuppliers },
          },
        });
      }

      if (resolvedPartyType && resolvedPartyId) {
        const allowedIds = allowedPartyTypes.get(resolvedPartyType) ?? [];
        if (allowedIds.length === 0 || !allowedIds.includes(resolvedPartyId)) {
          return res.status(400).json({
            error: {
              code: "PARTY_MISMATCH",
              message: "الطرف المختار غير مرتبط بهذه الشحنة",
              details: {
                field: "partyId",
                partyId: resolvedPartyId,
                shipmentSuppliers,
                shippingCompanyId,
              },
            },
          });
        }
      }

      // Validate payment date
      const parsedDate = new Date(paymentDate);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          error: {
            code: "PAYMENT_DATE_INVALID",
            message: "تاريخ الدفع غير صالح. الرجاء اختيار تاريخ بصيغة YYYY-MM-DD.",
            details: { field: "paymentDate" },
          },
        });
      }

      // Validate amount is numeric
      const originalAmount = parseFloat(amountOriginal);
      if (isNaN(originalAmount)) {
        return res.status(400).json({
          error: {
            code: "PAYMENT_PAYLOAD_INVALID",
            message: "المبلغ الأصلي يجب أن يكون رقمًا صحيحًا",
            details: { field: "amountOriginal" },
          },
        });
      }

      // Validate exchange rate for RMB payments
      if (paymentCurrency === "RMB") {
        const rate = parseFloat(exchangeRateToEgp);
        if (isNaN(rate)) {
          return res.status(400).json({
            error: {
              code: "PAYMENT_RATE_MISSING",
              message: "سعر الصرف لليوان يجب أن يكون رقمًا صحيحًا",
              details: { field: "exchangeRateToEgp" },
            },
          });
        }
        if (rate <= 0) {
          return res.status(400).json({
            error: {
              code: "PAYMENT_RATE_MISSING",
              message: "سعر الصرف لليوان يجب أن يكون أكبر من صفر",
              details: { field: "exchangeRateToEgp" },
            },
          });
        }
      }

      // Validate party if provided
      if (resolvedPartyType && resolvedPartyId) {
        if (resolvedPartyType === "supplier") {
          const supplier = await deps.storage.getSupplier(resolvedPartyId);
          if (!supplier) {
            return res.status(400).json({
              error: {
                code: "SUPPLIER_NOT_FOUND",
                message: "المورد المحدد غير موجود",
                details: { field: "partyId", partyId: resolvedPartyId },
              },
            });
          }
        }
        if (resolvedPartyType === "shipping_company") {
          const company = await deps.storage.getShippingCompany(resolvedPartyId);
          if (!company) {
            return res.status(400).json({
              error: {
                code: "SHIPPING_COMPANY_NOT_FOUND",
                message: "شركة الشحن المحددة غير موجودة",
                details: { field: "partyId", partyId: resolvedPartyId },
              },
            });
          }
        }
      }

      // Normalize payment amounts
      const normalizedAmounts = normalizePaymentAmounts({
        paymentCurrency,
        amountOriginal: originalAmount,
        exchangeRateToEgp: paymentCurrency === "RMB" ? parseFloat(exchangeRateToEgp) : null,
      });

      if (resolvedPartyType && resolvedPartyId && costComponent) {
        const summary = await buildPartyPaymentSummary(deps.storage, {
          shipmentId: parsedShipmentId,
          partyType: resolvedPartyType,
          partyId: resolvedPartyId,
          component: costComponent,
        });

        if (summary.remainingBefore <= 0) {
          return res.status(400).json({
            message: "لا يوجد متبقي مسموح للدفع",
          });
        }

        // Get shipment for fallback rate when paying EGP for RMB component
        const shipmentForRate = await deps.storage.getShipment(parsedShipmentId);
        const fallbackRate = parseAmountOrZero(shipmentForRate?.purchaseRmbToEgpRate || "7");

        const amountInComponentCurrency =
          summary.currency === "RMB"
            ? paymentCurrency === "RMB"
              ? originalAmount
              : (() => {
                  // For EGP payment to RMB component, use payment's rate or shipment's rate
                  const rate = normalizedAmounts.exchangeRateToEgp || fallbackRate;
                  return rate > 0 ? normalizedAmounts.amountEgp / rate : 0;
                })()
            : normalizedAmounts.amountEgp;

        if (amountInComponentCurrency > summary.remainingBefore + 0.0001) {
          return res.status(400).json({
            message: "المبلغ أكبر من المتبقي المسموح",
          });
        }
      }

      const shouldAutoAllocate =
        autoAllocate === true || autoAllocate === "true" || autoAllocate === "1";

      // Determine attachment info: prefer Object Storage URL from body, fallback to multer file
      const finalAttachmentUrl = bodyAttachmentUrl || (attachment ? `/uploads/payments/${attachment.filename}` : null);
      const finalAttachmentOriginalName = bodyAttachmentOriginalName || attachment?.originalname || null;
      const finalAttachmentMimeType = bodyAttachmentMimeType || attachment?.mimetype || null;
      const finalAttachmentSize = bodyAttachmentSize ? Number(bodyAttachmentSize) : (attachment?.size || null);
      const hasAttachment = Boolean(finalAttachmentUrl);

      const payment = await deps.storage.createPayment(
        {
          shipmentId: parsedShipmentId,
          partyType: resolvedPartyType,
          partyId: resolvedPartyId || null,
          paymentDate: parsedDate,
          paymentCurrency,
          amountOriginal: amountOriginal.toString(),
          exchangeRateToEgp: normalizedAmounts.exchangeRateToEgp?.toString() || null,
          amountEgp: normalizedAmounts.amountEgp.toFixed(2),
          costComponent,
          paymentMethod,
          cashReceiverName: cashReceiverName || null,
          referenceNumber: referenceNumber || null,
          note: note || notes || null,
          attachmentUrl: finalAttachmentUrl,
          attachmentMimeType: finalAttachmentMimeType,
          attachmentSize: finalAttachmentSize,
          attachmentOriginalName: finalAttachmentOriginalName,
          attachmentUploadedAt: hasAttachment ? new Date() : null,
          createdByUserId: actorId,
        },
        { autoAllocate: shouldAutoAllocate },
      );

      deps.logAuditEvent({
        userId: actorId,
        entityType: "PAYMENT",
        entityId: payment.id,
        actionType: "CREATE",
        details: {
          shipmentId,
          partyType: resolvedPartyType,
          partyId: resolvedPartyId || null,
          partyRule: {
            shipmentSuppliers,
            required: shouldRequireParty,
            defaulted: shouldDefaultParty,
          },
          amount: normalizedAmounts.amountEgp.toString(),
          currency: paymentCurrency,
          method: paymentMethod,
          hasAttachment,
        },
      });

      res.json(success(payment));
    } catch (error) {
      const { status, body } = formatError(error, {
        code: "PAYMENT_FETCH_FAILED",
        status: 500,
      });
      res.status(status).json(body);
    }
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
  deps: RouteDependencies = {},
): Promise<void> {
  const routeStorage: IStorage = deps.storage ?? storage;
  const auth = deps.auth ?? { setupAuth, isAuthenticated, requireRole };
  const auditLogger = deps.auditLogger ?? ((event: Parameters<typeof logAuditEvent>[0]) => logAuditEvent(event, routeStorage));
  const shipmentService = deps.shipments ?? { createShipmentWithItems, updateShipmentWithItems };
  // Setup authentication
  await auth.setupAuth(app);

  // Auth routes
  app.get("/api/auth/user", async (req, res) => {
    if (req.isAuthenticated() && req.user) {
      const user = await routeStorage.getUser(req.user.id);
      if (user) {
        const { password: _, ...userWithoutPassword } = user;
        return res.json(userWithoutPassword);
      }
    }
    res.status(401).json({ message: "Unauthorized" });
  });

  // Object Storage service for persistent file storage
  const objectStorageService = new ObjectStorageService();

  // Request presigned URL for item image upload (Object Storage)
  app.post("/api/upload/item-image/request-url", isAuthenticated, async (req, res) => {
    try {
      const { name, size, contentType } = req.body;
      console.log("[Upload] Request URL - File:", name, "Size:", size, "Type:", contentType);
      
      if (!name) {
        return res.status(400).json({ message: "اسم الملف مطلوب" });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      console.log("[Upload] Generated - uploadURL:", uploadURL?.substring(0, 100) + "...", "objectPath:", objectPath);

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("[Upload] Error generating upload URL:", error);
      res.status(500).json({ message: "خطأ في إنشاء رابط الرفع" });
    }
  });

  // Finalize item image upload - set ACL and return final path
  app.post("/api/upload/item-image/finalize", isAuthenticated, async (req, res) => {
    try {
      const { objectPath } = req.body;
      console.log("[Upload] Finalize - objectPath:", objectPath);
      
      if (!objectPath) {
        return res.status(400).json({ message: "مسار الملف مطلوب" });
      }

      // Set public visibility for item images
      const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
        objectPath,
        { owner: "system", visibility: "public" }
      );
      console.log("[Upload] Finalized - normalizedPath:", normalizedPath);

      res.json({ imageUrl: normalizedPath });
    } catch (error) {
      console.error("[Upload] Error finalizing upload:", error);
      res.status(500).json({ message: "خطأ في حفظ الصورة" });
    }
  });

  // Serve objects from Object Storage
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      console.error("Error serving object:", error);
      if (error?.name === "ObjectNotFoundError") {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });

  // Legacy image upload for items (fallback - still works but uses local storage)
  app.post("/api/upload/item-image", isAuthenticated, uploadItemImage.single("image"), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "لم يتم رفع صورة" });
      }
      const imageUrl = `/uploads/items/${req.file.filename}`;
      res.json({ imageUrl });
    } catch (error) {
      console.error("Error uploading image:", error);
      res.status(500).json({ message: "خطأ في رفع الصورة" });
    }
  });

  // Request presigned URL for payment attachment upload (Object Storage)
  app.post("/api/upload/payment-attachment/request-url", isAuthenticated, async (req, res) => {
    try {
      const { name, size, contentType } = req.body;
      console.log("[Upload] Payment Attachment Request URL - File:", name, "Size:", size, "Type:", contentType);
      
      if (!name) {
        return res.status(400).json({ message: "اسم الملف مطلوب" });
      }

      // Validate file type
      if (!contentType?.startsWith("image/")) {
        return res.status(400).json({ message: "يسمح فقط بملفات الصور" });
      }

      // Validate file size (2MB limit)
      if (size && size > MAX_PAYMENT_ATTACHMENT_SIZE) {
        return res.status(400).json({ message: "يجب ألا يزيد حجم الصورة عن 2MB" });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      console.log("[Upload] Payment Attachment Generated - objectPath:", objectPath);

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("[Upload] Error generating payment attachment URL:", error);
      res.status(500).json({ message: "خطأ في إنشاء رابط الرفع" });
    }
  });

  // Finalize payment attachment upload - same approach as item images
  app.post("/api/upload/payment-attachment/finalize", isAuthenticated, async (req, res) => {
    try {
      const { objectPath, originalName } = req.body;
      console.log("[Upload] Payment Attachment Finalize - objectPath:", objectPath);
      
      if (!objectPath) {
        return res.status(400).json({ message: "مسار الملف مطلوب" });
      }

      // Set public visibility for payment attachments (same as item images)
      const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
        objectPath,
        { owner: "system", visibility: "public" }
      );
      console.log("[Upload] Payment Attachment Finalized - normalizedPath:", normalizedPath);

      res.json({ 
        attachmentUrl: normalizedPath,
        attachmentOriginalName: originalName || null
      });
    } catch (error: any) {
      console.error("[Upload] Error finalizing payment attachment:", error?.message || error);
      res.status(500).json({ message: "خطأ في حفظ المرفق" });
    }
  });

  // Request presigned URL for invoice line image upload (Object Storage)
  app.post("/api/upload/invoice-line-image/request-url", isAuthenticated, async (req, res) => {
    try {
      const { name, size, contentType } = req.body;
      console.log("[Upload] Invoice Line Image Request URL - File:", name, "Size:", size, "Type:", contentType);
      
      if (!name) {
        return res.status(400).json({ message: "اسم الملف مطلوب" });
      }

      // Validate file type
      if (!contentType?.startsWith("image/")) {
        return res.status(400).json({ message: "يسمح فقط بملفات الصور" });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      console.log("[Upload] Invoice Line Image Generated - objectPath:", objectPath);

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("[Upload] Error generating invoice line image URL:", error);
      res.status(500).json({ message: "خطأ في إنشاء رابط الرفع" });
    }
  });

  // Finalize invoice line image upload - set ACL and return final path
  app.post("/api/upload/invoice-line-image/finalize", isAuthenticated, async (req, res) => {
    try {
      const { objectPath } = req.body;
      console.log("[Upload] Invoice Line Image Finalize - objectPath:", objectPath);
      
      if (!objectPath) {
        return res.status(400).json({ message: "مسار الملف مطلوب" });
      }

      // Set public visibility for invoice line images
      const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
        objectPath,
        { owner: "system", visibility: "public" }
      );
      console.log("[Upload] Invoice Line Image Finalized - normalizedPath:", normalizedPath);

      res.json({ imageUrl: normalizedPath });
    } catch (error) {
      console.error("[Upload] Error finalizing invoice line image:", error);
      res.status(500).json({ message: "خطأ في حفظ الصورة" });
    }
  });

  // Dashboard
  app.get("/api/dashboard/stats", isAuthenticated, async (req, res) => {
    try {
      const stats = await routeStorage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Error fetching dashboard stats" });
    }
  });

  // Suppliers
  app.get("/api/suppliers", isAuthenticated, async (req, res) => {
    try {
      const suppliers = await routeStorage.getAllSuppliers();
      res.json(suppliers);
    } catch (error) {
      res.status(500).json({ message: "Error fetching suppliers" });
    }
  });

  app.get("/api/suppliers/:id", isAuthenticated, async (req, res) => {
    try {
      const supplier = await routeStorage.getSupplier(parseInt(req.params.id));
      if (!supplier) {
        return res.status(404).json({ message: "Supplier not found" });
      }
      res.json(supplier);
    } catch (error) {
      res.status(500).json({ message: "Error fetching supplier" });
    }
  });

  app.post("/api/suppliers", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const data = insertSupplierSchema.parse(req.body);
      const supplier = await routeStorage.createSupplier(data);
      res.json(supplier);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.patch("/api/suppliers/:id", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const supplier = await routeStorage.updateSupplier(parseInt(req.params.id), req.body);
      if (!supplier) {
        return res.status(404).json({ message: "Supplier not found" });
      }
      res.json(supplier);
    } catch (error) {
      res.status(500).json({ message: "Error updating supplier" });
    }
  });

  app.delete("/api/suppliers/:id", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      await routeStorage.deleteSupplier(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting supplier" });
    }
  });

  // Shipping Companies
  app.get("/api/shipping-companies", isAuthenticated, async (_req, res) => {
    try {
      const companies = await routeStorage.getAllShippingCompanies();
      res.json(companies);
    } catch (error) {
      res.status(500).json({ message: "Error fetching shipping companies" });
    }
  });

  app.get("/api/shipping-companies/:id", isAuthenticated, async (req, res) => {
    try {
      const company = await routeStorage.getShippingCompany(parseInt(req.params.id));
      if (!company) {
        return res.status(404).json({ message: "Shipping company not found" });
      }
      res.json(company);
    } catch (error) {
      res.status(500).json({ message: "Error fetching shipping company" });
    }
  });

  app.post(
    "/api/shipping-companies",
    requireRole(["مدير", "محاسب"]),
    async (req, res) => {
      try {
        const data = insertShippingCompanySchema.parse(req.body);
        const existing = await routeStorage.getShippingCompanyByName(data.name);
        if (existing) {
          throw new ApiError("SHIPPING_COMPANY_NAME_EXISTS", undefined, 409, {
            field: "name",
            value: data.name,
          });
        }
        const company = await routeStorage.createShippingCompany(data);

        auditLogger({
          userId: (req.user as any)?.id,
          entityType: "SHIPPING_COMPANY",
          entityId: String(company.id),
          actionType: "CREATE",
          details: { name: company.name },
        });

        res.json(company);
      } catch (error) {
        if (error instanceof ZodError) {
          console.error("Validation error creating shipping company:", error.flatten());
          const details = {
            fields: error.errors.map((issue) => ({
              field: issue.path.join(".") || "name",
              message: issue.message,
            })),
          };
          const { status, body } = formatError(
            new ApiError("VALIDATION_ERROR", undefined, 400, details),
          );
          return res.status(status).json(body);
        }
        if (error instanceof ApiError) {
          const { status, body } = formatError(error);
          return res.status(status).json(body);
        }
        console.error("Error creating shipping company:", error);
        const pgError = error as { code?: string; detail?: string; message?: string };
        const { status, body } = formatError(error, {
          code: "UNKNOWN_ERROR",
          status: 500,
          message: "Unexpected server error.",
          details: {
            code: pgError?.code,
            detail: pgError?.detail,
            message: pgError?.message,
          },
        });
        res.status(status).json(body);
      }
    },
  );

  app.patch(
    "/api/shipping-companies/:id",
    requireRole(["مدير", "محاسب"]),
    async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        const data = insertShippingCompanySchema.partial().parse(req.body);
        
        // Check if company exists
        const existingCompany = await routeStorage.getShippingCompany(id);
        if (!existingCompany) {
          return res.status(404).json({ message: "Shipping company not found" });
        }

        // If name is being changed, check for duplicates
        if (data.name && data.name !== existingCompany.name) {
          const duplicateCompany = await routeStorage.getShippingCompanyByName(data.name);
          if (duplicateCompany) {
            throw new ApiError("SHIPPING_COMPANY_NAME_EXISTS", undefined, 409, {
              field: "name",
              value: data.name,
            });
          }
        }

        const company = await routeStorage.updateShippingCompany(id, data);

        auditLogger({
          userId: (req.user as any)?.id,
          entityType: "SHIPPING_COMPANY",
          entityId: String(company?.id),
          actionType: "UPDATE",
          details: { name: company?.name },
        });

        res.json(company);
      } catch (error) {
        if (error instanceof ZodError) {
          console.error("Validation error updating shipping company:", error.flatten());
          const details = {
            fields: error.errors.map((issue) => ({
              field: issue.path.join(".") || "name",
              message: issue.message,
            })),
          };
          const { status, body } = formatError(
            new ApiError("VALIDATION_ERROR", undefined, 400, details),
          );
          return res.status(status).json(body);
        }
        if (error instanceof ApiError) {
          const { status, body } = formatError(error);
          return res.status(status).json(body);
        }
        console.error("Error updating shipping company:", error);
        const pgError = error as { code?: string; detail?: string; message?: string };
        const { status, body } = formatError(error, {
          code: "UNKNOWN_ERROR",
          status: 500,
          message: "Unexpected server error.",
          details: {
            code: pgError?.code,
            detail: pgError?.detail,
            message: pgError?.message,
          },
        });
        res.status(status).json(body);
      }
    },
  );

  app.delete(
    "/api/shipping-companies/:id",
    requireRole(["مدير", "محاسب"]),
    async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        await routeStorage.deleteShippingCompany(id);

        auditLogger({
          userId: (req.user as any)?.id,
          entityType: "SHIPPING_COMPANY",
          entityId: String(id),
          actionType: "DELETE",
        });

        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Error deleting shipping company" });
      }
    },
  );

  // Product Types
  app.get("/api/product-types", isAuthenticated, async (req, res) => {
    try {
      const types = await routeStorage.getAllProductTypes();
      res.json(types);
    } catch (error) {
      res.status(500).json({ message: "Error fetching product types" });
    }
  });

  app.post("/api/product-types", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const data = insertProductTypeSchema.parse(req.body);
      const type = await routeStorage.createProductType(data);
      res.json(type);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.patch("/api/product-types/:id", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const type = await routeStorage.updateProductType(parseInt(req.params.id), req.body);
      if (!type) {
        return res.status(404).json({ message: "Product type not found" });
      }
      res.json(type);
    } catch (error) {
      res.status(500).json({ message: "Error updating product type" });
    }
  });

  app.delete("/api/product-types/:id", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      await routeStorage.deleteProductType(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting product type" });
    }
  });

  // Shipments
  app.get("/api/shipments", isAuthenticated, async (req, res) => {
    try {
      const shipments = await routeStorage.getAllShipments();
      res.json(shipments);
    } catch (error) {
      res.status(500).json({ message: "Error fetching shipments" });
    }
  });

  app.get("/api/shipments/:id", isAuthenticated, async (req, res) => {
    try {
      const shipment = await routeStorage.getShipment(parseInt(req.params.id));
      if (!shipment) {
        return res.status(404).json({ message: "Shipment not found" });
      }
      res.json(shipment);
    } catch (error) {
      res.status(500).json({ message: "Error fetching shipment" });
    }
  });

  app.get(
    "/api/shipments/:id/related-parties",
    isAuthenticated,
    async (req, res) => {
      try {
        const shipmentId = parseInt(req.params.id);
        const shipment = await routeStorage.getShipment(shipmentId);

        if (!shipment) {
          return res.status(404).json({ message: "الشحنة غير موجودة" });
        }

        const context = await routeStorage.getShipmentSupplierContext(shipmentId);
        const [suppliers, shippingCompany] = await Promise.all([
          routeStorage.getSuppliersByIds(context.itemSuppliers),
          context.shippingCompanyId
            ? routeStorage.getShippingCompany(context.shippingCompanyId)
            : Promise.resolve(null),
        ]);

        const shippingCompanies = shippingCompany ? [shippingCompany] : [];

        res.json({
          suppliers: suppliers.map(({ id, name }) => ({ id, name })),
          shippingCompanies: shippingCompanies.map(({ id, name }) => ({ id, name })),
        });
      } catch (error) {
        res.status(500).json({ message: "Error fetching related parties" });
      }
    },
  );

  app.post("/api/shipments", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      const shipment = await shipmentService.createShipmentWithItems(req.body, userId);
      
      auditLogger({
        userId,
        entityType: "SHIPMENT",
        entityId: shipment.id,
        actionType: "CREATE",
        details: {
          status: shipment.status,
          shippingCompanyId: shipment.shippingCompanyId ?? null,
        },
      });
      
      res.json(shipment);
    } catch (error) {
      console.error("Error creating shipment:", error);
      res.status(400).json({ message: (error as Error)?.message || "تعذر إنشاء الشحنة" });
    }
  });

  app.patch("/api/shipments/:id", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const shipmentId = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      
      const existingShipment = await routeStorage.getShipment(shipmentId);
      const previousStatus = existingShipment?.status;
      const previousShippingCompanyId =
        existingShipment?.shippingCompanyId ?? null;
      
      const updatedShipment = await shipmentService.updateShipmentWithItems(shipmentId, req.body);
      const nextShippingCompanyId =
        updatedShipment?.shippingCompanyId ?? null;
      
      auditLogger({
        userId,
        entityType: "SHIPMENT",
        entityId: shipmentId,
        actionType: "UPDATE",
        details: {
          step: req.body.step,
          status: updatedShipment?.status,
          shippingCompanyId: nextShippingCompanyId,
          shippingCompanyChange:
            previousShippingCompanyId !== nextShippingCompanyId
              ? {
                  from: previousShippingCompanyId,
                  to: nextShippingCompanyId,
                }
              : undefined,
        },
      });
      
      if (updatedShipment && updatedShipment.status !== previousStatus) {
        auditLogger({
          userId,
          entityType: "SHIPMENT",
          entityId: shipmentId,
          actionType: "STATUS_CHANGE",
          details: { from: previousStatus, to: updatedShipment.status },
        });
      }
      
      res.json(updatedShipment);
    } catch (error) {
      console.error("Error updating shipment:", error);
      const message = (error as Error)?.message || "حدث خطأ أثناء حفظ بيانات الشحنة";
      const status = message === "الشحنة غير موجودة" ? 404 : 400;
      res.status(status).json({ message });
    }
  });

  app.patch("/api/shipments/:id/missing-pieces", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const shipmentId = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      const { updates } = req.body;

      if (!Array.isArray(updates)) {
        return res.status(400).json({ message: "يجب إرسال قائمة تحديثات النواقص" });
      }

      const updatedShipment = await updateMissingPieces(shipmentId, updates, userId);
      res.json(updatedShipment);
    } catch (error) {
      console.error("Error updating missing pieces:", error);
      const message = (error as Error)?.message || "حدث خطأ أثناء تحديث النواقص";
      const status = message.includes("غير موجود") ? 404 : 400;
      res.status(status).json({ message });
    }
  });

  app.delete("/api/shipments/:id", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const shipmentId = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      
      await routeStorage.deleteShipment(shipmentId);
      
      auditLogger({
        userId,
        entityType: "SHIPMENT",
        entityId: shipmentId,
        actionType: "DELETE",
      });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting shipment" });
    }
  });

  // Shipment Items
  app.get("/api/shipments/:id/items", isAuthenticated, async (req, res) => {
    try {
      const items = await routeStorage.getShipmentItems(parseInt(req.params.id));
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Error fetching items" });
    }
  });

  // Shipment Shipping Details
  app.get("/api/shipments/:id/shipping", isAuthenticated, async (req, res) => {
    try {
      const details = await routeStorage.getShippingDetails(parseInt(req.params.id));
      res.json(details || null);
    } catch (error) {
      res.status(500).json({ message: "Error fetching shipping details" });
    }
  });

  // Invoice Summary - breakdown by currency
  app.get("/api/shipments/:id/invoice-summary", isAuthenticated, async (req, res) => {
    try {
      const shipmentId = parseInt(req.params.id);
      const shipment = await routeStorage.getShipment(shipmentId);
      
      if (!shipment) {
        return res.status(404).json({ message: "الشحنة غير موجودة" });
      }
      
      const payments = await routeStorage.getShipmentPayments(shipmentId);
      const paymentAllowance = await routeStorage.getPaymentAllowance(shipmentId, { shipment });
      
      const paymentSnapshot = await calculatePaymentSnapshot({
        shipment,
        payments,
        loadRecoveryData: async () => {
          const items = await routeStorage.getShipmentItems(shipmentId);
          const rate = await routeStorage.getLatestRate("RMB", "EGP");

          return {
            items,
            rmbToEgpRate: rate ? parseAmountOrZero(rate.rateValue) : undefined,
          };
        },
      });

      const paidRmb = paymentSnapshot.paidByCurrency.RMB?.original ?? 0;
      const paidEgp = paymentSnapshot.paidByCurrency.EGP?.original ?? 0;

      // RMB costs breakdown
      const goodsTotalRmbGross = parseAmountOrZero(shipment.purchaseCostRmb || "0");
      const partialDiscountRmb = parseAmountOrZero(shipment.partialDiscountRmb || "0");
      const goodsTotalRmb = Math.max(0, goodsTotalRmbGross - partialDiscountRmb);
      const shippingTotalRmb = parseAmountOrZero(
        shipment.shippingCostRmb || "0",
      );
      const commissionTotalRmb = parseAmountOrZero(
        shipment.commissionCostRmb || "0",
      );
      const rmbSubtotal = goodsTotalRmb + shippingTotalRmb + commissionTotalRmb;
      const rmbRemaining = Math.max(0, rmbSubtotal - paidRmb);
      
      // EGP costs breakdown
      const customsTotalEgp = parseAmountOrZero(shipment.customsCostEgp || "0");
      const takhreegTotalEgp = parseAmountOrZero(
        shipment.takhreegCostEgp || "0",
      );
      const egpSubtotal = customsTotalEgp + takhreegTotalEgp;
      const egpRemaining = Math.max(0, egpSubtotal - paidEgp);

      // Calculate per-component paid and remaining amounts
      const paidByComponent: { [key: string]: number } = {};
      const paidByComponentRmb: { [key: string]: number } = {};
      const componentTotals: { [key: string]: number } = {
        "تكلفة البضاعة": goodsTotalRmb,
        "الشحن": shippingTotalRmb,
        "العمولة": commissionTotalRmb,
        "الجمرك": customsTotalEgp,
        "التخريج": takhreegTotalEgp,
      };

      // Calculate paid amounts per component
      // For RMB components: sum by amountOriginal (in RMB) when payment is RMB
      // For EGP components: sum by amountEgp when payment is in EGP
      // Use shipment's exchange rate as fallback for EGP payments without their own rate
      const summaryShipmentRate = parseAmountOrZero(shipment.purchaseRmbToEgpRate || "7");
      
      payments?.forEach(payment => {
        const costComp = payment.costComponent;
        if (!paidByComponent[costComp]) {
          paidByComponent[costComp] = 0;
          paidByComponentRmb[costComp] = 0;
        }
        
        // Add to EGP tracking
        paidByComponent[costComp] += parseAmountOrZero(payment.amountEgp);
        
        // For RMB components, track RMB payments
        if (costComp === "تكلفة البضاعة" || costComp === "الشحن" || costComp === "العمولة") {
          if (payment.paymentCurrency === "RMB") {
            paidByComponentRmb[costComp] += parseAmountOrZero(payment.amountOriginal);
          } else if (payment.paymentCurrency === "EGP") {
            // Convert EGP back to RMB using payment's rate or shipment's rate as fallback
            const rate = payment.exchangeRateToEgp 
              ? parseAmountOrZero(payment.exchangeRateToEgp) 
              : summaryShipmentRate;
            if (rate > 0) {
              const rmbAmount = parseAmountOrZero(payment.amountEgp) / rate;
              paidByComponentRmb[costComp] += rmbAmount;
            }
          }
        }
      });

      const remainingByComponent = {
        "تكلفة البضاعة": Math.max(0, goodsTotalRmb - (paidByComponentRmb["تكلفة البضاعة"] ?? 0)),
        "الشحن": Math.max(0, shippingTotalRmb - (paidByComponentRmb["الشحن"] ?? 0)),
        "العمولة": Math.max(0, commissionTotalRmb - (paidByComponentRmb["العمولة"] ?? 0)),
        "الجمرك": Math.max(0, customsTotalEgp - (paidByComponent["الجمرك"] ?? 0)),
        "التخريج": Math.max(0, takhreegTotalEgp - (paidByComponent["التخريج"] ?? 0)),
      };

      const paidByCurrency = Object.fromEntries(
        Object.entries(paymentSnapshot.paidByCurrency).map(([currency, values]) => [
          currency,
          {
            original: values.original.toFixed(2),
            convertedToEgp: values.convertedToEgp.toFixed(2),
          },
        ]),
      );

      res.json({
        shipmentId,
        shipmentCode: shipment.shipmentCode,
        shipmentName: shipment.shipmentName,
        knownTotalCost: paymentSnapshot.knownTotalCost.toFixed(2),
        totalPaidEgp: paymentSnapshot.totalPaidEgp.toFixed(2),
        remainingAllowed: paymentSnapshot.remainingAllowed.toFixed(2),
        paidByCurrency,
        rmb: {
          goodsTotal: goodsTotalRmb.toFixed(2),
          shippingTotal: shippingTotalRmb.toFixed(2),
          commissionTotal: commissionTotalRmb.toFixed(2),
          subtotal: rmbSubtotal.toFixed(2),
          paid: paidRmb.toFixed(2),
          remaining: rmbRemaining.toFixed(2),
        },
        egp: {
          customsTotal: customsTotalEgp.toFixed(2),
          takhreegTotal: takhreegTotalEgp.toFixed(2),
          subtotal: egpSubtotal.toFixed(2),
          paid: paidEgp.toFixed(2),
          remaining: egpRemaining.toFixed(2),
        },
        paidByComponent: {
          "تكلفة البضاعة": (paidByComponentRmb["تكلفة البضاعة"] ?? 0).toFixed(2),
          "الشحن": (paidByComponentRmb["الشحن"] ?? 0).toFixed(2),
          "العمولة": (paidByComponentRmb["العمولة"] ?? 0).toFixed(2),
          "الجمرك": (paidByComponent["الجمرك"] ?? 0).toFixed(2),
          "التخريج": (paidByComponent["التخريج"] ?? 0).toFixed(2),
        },
        remainingByComponent: {
          "تكلفة البضاعة": remainingByComponent["تكلفة البضاعة"].toFixed(2),
          "الشحن": remainingByComponent["الشحن"].toFixed(2),
          "العمولة": remainingByComponent["العمولة"].toFixed(2),
          "الجمرك": remainingByComponent["الجمرك"].toFixed(2),
          "التخريج": remainingByComponent["التخريج"].toFixed(2),
        },
        paymentAllowance: {
          knownTotalEgp: paymentAllowance.knownTotal.toFixed(2),
          alreadyPaidEgp: paymentAllowance.alreadyPaid.toFixed(2),
          remainingAllowedEgp: paymentAllowance.remainingAllowed.toFixed(2),
          source: paymentAllowance.recoveredFromItems ? "recovered" : "declared",
        },
        computedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching invoice summary:", error);
      res.status(500).json({ message: "خطأ في جلب ملخص الفاتورة" });
    }
  });

  app.get(
    "/api/shipments/:shipmentId/suppliers/:supplierId/goods-summary",
    isAuthenticated,
    async (req, res) => {
      try {
        const shipmentId = parseInt(req.params.shipmentId);
        const supplierId = parseInt(req.params.supplierId);

        if (Number.isNaN(shipmentId) || Number.isNaN(supplierId)) {
          return res.status(400).json({ message: "بيانات غير صالحة" });
        }

        const [shipment, supplier] = await Promise.all([
          routeStorage.getShipment(shipmentId),
          routeStorage.getSupplier(supplierId),
        ]);

        if (!shipment || !supplier) {
          return res.status(404).json({ message: "البيانات غير موجودة" });
        }

        const [items, payments, allocations] = await Promise.all([
          routeStorage.getShipmentItems(shipmentId),
          routeStorage.getShipmentPayments(shipmentId),
          routeStorage.getPaymentAllocationsByShipmentId(shipmentId),
        ]);

        const supplierGoodsTotalRmb = items.reduce((sum, item) => {
          if (item.supplierId !== supplierId) return sum;
          return sum + parseAmountOrZero(item.totalPurchaseCostRmb);
        }, 0);

        const supplierDirectPaidRmb = payments.reduce((sum, payment) => {
          if (
            payment.partyType !== "supplier" ||
            payment.partyId !== supplierId ||
            payment.costComponent !== PURCHASE_COST_COMPONENT
          ) {
            return sum;
          }

          if (payment.paymentCurrency === "RMB") {
            return sum + parseAmountOrZero(payment.amountOriginal);
          }

          if (payment.paymentCurrency === "EGP" && payment.exchangeRateToEgp) {
            const rate = parseAmountOrZero(payment.exchangeRateToEgp);
            if (rate > 0) {
              return sum + parseAmountOrZero(payment.amountEgp) / rate;
            }
          }

          return sum;
        }, 0);

        const supplierAllocatedPaidRmb = allocations.reduce((sum, allocation) => {
          if (
            allocation.supplierId !== supplierId ||
            allocation.component !== PURCHASE_COST_COMPONENT ||
            allocation.currency !== "RMB"
          ) {
            return sum;
          }

          return sum + parseAmountOrZero(allocation.allocatedAmount);
        }, 0);

        const supplierPaidRmb = supplierDirectPaidRmb + supplierAllocatedPaidRmb;
        const supplierRemainingRmb = Math.max(0, supplierGoodsTotalRmb - supplierPaidRmb);

        res.json({
          supplierGoodsTotalRmb: supplierGoodsTotalRmb.toFixed(2),
          supplierPaidRmb: supplierPaidRmb.toFixed(2),
          supplierRemainingRmb: supplierRemainingRmb.toFixed(2),
        });
      } catch (error) {
        console.error("Error fetching supplier goods summary:", error);
        res.status(500).json({ message: "خطأ في جلب ملخص المورد" });
      }
    },
  );

  app.get(
    "/api/shipments/:shipmentId/party-payment-summary",
    isAuthenticated,
    async (req, res) => {
      try {
        const shipmentId = parseInt(req.params.shipmentId);
        const partyType = req.query.partyType as string | undefined;
        const partyId = req.query.partyId ? Number(req.query.partyId) : null;
        const component = req.query.component as string | undefined;

        if (Number.isNaN(shipmentId) || !partyType || !component || !partyId) {
          return res.status(400).json({
            message: "بيانات غير صالحة",
          });
        }

        if (partyType !== "supplier" && partyType !== "shipping_company") {
          return res.status(400).json({ message: "نوع الطرف غير صالح" });
        }

        if (
          component !== PURCHASE_COST_COMPONENT &&
          !SHIPPING_COST_COMPONENTS.has(component)
        ) {
          return res.status(400).json({ message: "البند غير صالح" });
        }

        const { shipmentSuppliers, shippingCompanyId } =
          await routeStorage.getShipmentSupplierContext(shipmentId);

        if (partyType === "supplier") {
          if (component !== PURCHASE_COST_COMPONENT) {
            return res.status(400).json({ message: "المكون غير صالح للمورد" });
          }
          if (!shipmentSuppliers.includes(partyId)) {
            return res.status(400).json({ message: "المورد غير مرتبط بهذه الشحنة" });
          }
        }

        if (partyType === "shipping_company") {
          if (shippingCompanyId !== partyId) {
            return res.status(400).json({ message: "شركة الشحن غير مرتبطة بهذه الشحنة" });
          }
        }

        const { currency, totalAllowed, paidSoFar, remainingBefore } =
          await buildPartyPaymentSummary(routeStorage, {
            shipmentId,
            partyType: partyType as "supplier" | "shipping_company",
            partyId,
            component,
          });

        res.json({
          shipmentId,
          partyType,
          partyId,
          component,
          currency,
          totalAllowed: totalAllowed.toFixed(2),
          paidSoFar: paidSoFar.toFixed(2),
          remainingBefore: remainingBefore.toFixed(2),
        });
      } catch (error) {
        if (error instanceof ApiError) {
          return res.status(error.status).json({ message: error.message });
        }
        console.error("Error fetching party payment summary:", error);
        res.status(500).json({ message: "خطأ في جلب ملخص الدفعات" });
      }
    },
  );

  app.get(
    "/api/shipments/:shipmentId/payment-remaining",
    isAuthenticated,
    async (req, res) => {
      try {
        const shipmentId = parseInt(req.params.shipmentId);
        const partyType = req.query.partyType as string | undefined;
        const partyId = req.query.partyId ? Number(req.query.partyId) : null;
        const component = req.query.component as string | undefined;

        if (Number.isNaN(shipmentId) || !partyType || !component || !partyId) {
          return res.status(400).json({
            message: "بيانات غير صالحة",
          });
        }

        if (partyType !== "supplier" && partyType !== "shipping_company") {
          return res.status(400).json({ message: "نوع الطرف غير صالح" });
        }

        if (
          component !== PURCHASE_COST_COMPONENT &&
          !SHIPPING_COST_COMPONENTS.has(component)
        ) {
          return res.status(400).json({ message: "البند غير صالح" });
        }

        const { shipmentSuppliers, shippingCompanyId } =
          await routeStorage.getShipmentSupplierContext(shipmentId);

        if (partyType === "supplier") {
          if (component !== PURCHASE_COST_COMPONENT) {
            return res.status(400).json({ message: "المكون غير صالح للمورد" });
          }
          if (!shipmentSuppliers.includes(partyId)) {
            return res.status(400).json({ message: "المورد غير مرتبط بهذه الشحنة" });
          }
        }

        if (partyType === "shipping_company") {
          if (shippingCompanyId !== partyId) {
            return res.status(400).json({ message: "شركة الشحن غير مرتبطة بهذه الشحنة" });
          }
        }

        const { currency, remainingBefore, totalAllowed, paidSoFar } =
          await buildPartyPaymentSummary(routeStorage, {
            shipmentId,
            partyType: partyType as "supplier" | "shipping_company",
            partyId,
            component,
          });

        res.json({
          currency,
          remainingBefore: remainingBefore.toFixed(2),
          totalAllowed: totalAllowed.toFixed(2),
          paidSoFar: paidSoFar.toFixed(2),
        });
      } catch (error) {
        if (error instanceof ApiError) {
          return res.status(error.status).json({ message: error.message });
        }
        console.error("Error fetching payment remaining:", error);
        res.status(500).json({ message: "خطأ في جلب المتبقي للدفع" });
      }
    },
  );

  app.get(
    "/api/shipments/:id/payment-allocation-preview",
    isAuthenticated,
    async (req, res) => {
      try {
        const shipmentId = parseInt(req.params.id);
        const amountParam = req.query.amount as string | undefined;
        const amountRmb = amountParam ? parseFloat(amountParam) : NaN;

        if (Number.isNaN(amountRmb)) {
          return res.status(400).json({
            error: {
              code: "PAYMENT_PREVIEW_INVALID",
              message: "يرجى إدخال مبلغ صحيح لمعاينة التوزيع.",
              details: { field: "amount" },
            },
          });
        }

        const shipment = await routeStorage.getShipment(shipmentId);
        if (!shipment) {
          return res.status(404).json({ message: "الشحنة غير موجودة" });
        }

        const preview = await routeStorage.getPaymentAllocationPreview(
          shipmentId,
          amountRmb,
        );

        res.json({
          shipmentId: preview.shipmentId,
          amountRmb: preview.amountRmb.toFixed(2),
          totalOutstandingRmb: preview.totalOutstandingRmb.toFixed(2),
          suppliers: preview.suppliers.map((supplier) => ({
            supplierId: supplier.supplierId,
            goodsTotalRmb: supplier.goodsTotalRmb.toFixed(2),
            outstandingRmb: supplier.outstandingRmb.toFixed(2),
            allocatedRmb: supplier.allocatedRmb.toFixed(2),
          })),
        });
      } catch (error) {
        console.error("Error fetching allocation preview:", error);
        res.status(500).json({ message: "خطأ في تحميل معاينة التوزيع" });
      }
    },
  );

  // Exchange Rates
  app.get("/api/exchange-rates", isAuthenticated, async (req, res) => {
    try {
      const rates = await routeStorage.getAllExchangeRates();
      res.json(rates);
    } catch (error) {
      res.status(500).json({ message: "Error fetching exchange rates" });
    }
  });

  app.post("/api/exchange-rates", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const data = insertExchangeRateSchema.parse(req.body);
      const userId = (req.user as any)?.id;
      const rate = await routeStorage.createExchangeRate(data);
      
      auditLogger({
        userId,
        entityType: "EXCHANGE_RATE",
        entityId: rate.id,
        actionType: "CREATE",
        details: { from: rate.fromCurrency, to: rate.toCurrency },
      });
      
      res.json(rate);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  // Manual/automatic refresh - simulate external update
  app.post("/api/exchange-rates/refresh", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const latestRmb = await routeStorage.getLatestRate("RMB", "EGP");
      const latestUsd = await routeStorage.getLatestRate("USD", "RMB");
      const userId = (req.user as any)?.id;

      const refreshed = await Promise.all([
        routeStorage.createExchangeRate({
          rateDate: todayStr,
          fromCurrency: "RMB",
          toCurrency: "EGP",
          rateValue: latestRmb?.rateValue || "7.0000",
          source: "تحديث تلقائي",
        }),
        routeStorage.createExchangeRate({
          rateDate: todayStr,
          fromCurrency: "USD",
          toCurrency: "RMB",
          rateValue: latestUsd?.rateValue || "7.2000",
          source: "تحديث تلقائي",
        }),
      ]);

      refreshed.forEach((rate) => {
        auditLogger({
          userId,
          entityType: "EXCHANGE_RATE",
          entityId: rate.id,
          actionType: "CREATE",
          details: { from: rate.fromCurrency, to: rate.toCurrency },
        });
      });

      res.json({
        message: "تم تحديث الأسعار",
        lastUpdated: today,
        rates: refreshed,
      });
    } catch (error) {
      console.error("Error refreshing exchange rates", error);
      res.status(500).json({ message: "تعذر تحديث أسعار الصرف" });
    }
  });

  // Payments
  app.get("/api/payments", isAuthenticated, async (req, res) => {
    try {
      const includeAllocations = req.query.includeAllocations === "true";
      const paymentsWithShipments = await getPaymentsWithShipments(routeStorage, {
        includeAllocations,
      });
      res.json(paymentsWithShipments);
    } catch (error) {
      const { status, body } = formatError(error, {
        code: "PAYMENT_FETCH_FAILED",
        status: 500,
      });
      res.status(status).json(body);
    }
  });

  app.get("/api/payments/stats", isAuthenticated, async (req, res) => {
    try {
      const stats = await routeStorage.getPaymentStats();
      res.json(stats);
    } catch (error) {
      const { status, body } = formatError(error, {
        code: "PAYMENT_FETCH_FAILED",
        status: 500,
      });
      res.status(status).json(body);
    }
  });

  app.post(
    "/api/payments",
    requireRole(["مدير", "محاسب"]),
    handlePaymentAttachmentUpload,
    createPaymentHandler({ storage: routeStorage, logAuditEvent: auditLogger }),
  );

  app.delete(
    "/api/payments/:id",
    requireRole(["مدير"]),
    async (req, res) => {
      try {
        const paymentId = parseInt(req.params.id);
        if (Number.isNaN(paymentId)) {
          return res.status(400).json({
            error: {
              code: "PAYMENT_INVALID_ID",
              message: "معرّف الدفعة غير صالح.",
            },
          });
        }

        const payment = await routeStorage.getPaymentById(paymentId);
        if (!payment) {
          return res.status(404).json({
            error: {
              code: "PAYMENT_NOT_FOUND",
              message: "الدفعة غير موجودة.",
            },
          });
        }

        const result = await routeStorage.deletePayment(paymentId);

        if (result.deleted) {
          auditLogger({
            userId: (req.user as any)?.id,
            entityType: "PAYMENT",
            entityId: String(paymentId),
            actionType: "DELETE",
            details: {
              shipmentId: payment.shipmentId,
              amountEgp: payment.amountEgp,
              paymentMethod: payment.paymentMethod,
              allocationsDeleted: result.allocationsDeleted,
            },
          });

          res.json({
            success: true,
            message: "تم حذف الدفعة بنجاح.",
            allocationsDeleted: result.allocationsDeleted,
          });
        } else {
          res.status(404).json({
            error: {
              code: "PAYMENT_DELETE_FAILED",
              message: "تعذر حذف الدفعة.",
            },
          });
        }
      } catch (error) {
        console.error("Error deleting payment:", error);
        const { status, body } = formatError(error, {
          code: "PAYMENT_DELETE_FAILED",
          status: 500,
          message: "حدث خطأ أثناء حذف الدفعة.",
        });
        res.status(status).json(body);
      }
    },
  );

  const sendPaymentAttachment = async (
    req: Parameters<RequestHandler>[0],
    res: Parameters<RequestHandler>[1],
    options: { inline: boolean },
  ) => {
    const paymentId = Number(req.params.paymentId);
    if (Number.isNaN(paymentId)) {
      return res.status(400).json({
        error: {
          code: "PAYMENT_ATTACHMENT_INVALID_ID",
          message: "معرّف الدفعة غير صالح.",
        },
      });
    }

    const payment = await routeStorage.getPaymentById(paymentId);
    if (!payment || !payment.attachmentUrl) {
      return res.status(404).json({
        error: {
          code: "PAYMENT_ATTACHMENT_NOT_FOUND",
          message: "لا يوجد مرفق لهذه الدفعة.",
        },
      });
    }

    const attachmentUrl = payment.attachmentUrl;
    const disposition = options.inline ? "inline" : "attachment";
    const filename = payment.attachmentOriginalName || "attachment";
    console.log(`[Attachment] Serving payment ${paymentId}, path: ${attachmentUrl}, mimeType: ${payment.attachmentMimeType}`);

    // Check if attachment is in Object Storage (persistent)
    if (attachmentUrl.startsWith("/objects/")) {
      try {
        console.log(`[Attachment] Fetching from Object Storage: ${attachmentUrl}`);
        const objectFile = await objectStorageService.getObjectEntityFile(attachmentUrl);
        const [metadata] = await objectFile.getMetadata();
        console.log(`[Attachment] File found: ${objectFile.name}, size: ${metadata.size}, contentType: ${metadata.contentType}`);
        
        if (!metadata.size || Number(metadata.size) === 0) {
          console.error(`[Attachment] File has zero size: ${attachmentUrl}`);
          return res.status(404).json({
            error: {
              code: "PAYMENT_ATTACHMENT_EMPTY",
              message: "الملف المرفق فارغ.",
            },
          });
        }
        
        res.setHeader("Content-Type", payment.attachmentMimeType || metadata.contentType || "application/octet-stream");
        res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
        return await objectStorageService.downloadObject(objectFile, res);
      } catch (error: any) {
        console.error("Error serving payment attachment from Object Storage:", error?.message || error);
        if (error?.name === "ObjectNotFoundError") {
          return res.status(404).json({
            error: {
              code: "PAYMENT_ATTACHMENT_MISSING",
              message: "الملف غير موجود في التخزين.",
            },
          });
        }
        return res.status(500).json({
          error: {
            code: "PAYMENT_ATTACHMENT_ERROR",
            message: "خطأ في قراءة المرفق.",
          },
        });
      }
    }

    // Fallback to local file system (legacy uploads)
    const relativePath = attachmentUrl.replace(/^\/+/, "");
    const absolutePath = path.resolve(process.cwd(), relativePath);
    const uploadsRoot = path.resolve(process.cwd(), "uploads");
    if (!absolutePath.startsWith(uploadsRoot)) {
      return res.status(400).json({
        error: {
          code: "PAYMENT_ATTACHMENT_INVALID_PATH",
          message: "مسار المرفق غير صالح.",
        },
      });
    }

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        error: {
          code: "PAYMENT_ATTACHMENT_MISSING",
          message: "الملف غير موجود على الخادم.",
        },
      });
    }

    res.setHeader("Content-Type", payment.attachmentMimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
    return res.sendFile(absolutePath);
  };

  app.get(
    "/api/payments/:paymentId/attachment/preview",
    requireRole(["مدير", "محاسب"]),
    async (req, res) => {
      await sendPaymentAttachment(req, res, { inline: true });
    },
  );

  app.get(
    "/api/payments/:paymentId/attachment",
    requireRole(["مدير", "محاسب"]),
    async (req, res) => {
      await sendPaymentAttachment(req, res, { inline: false });
    },
  );

  // Inventory
  app.get("/api/inventory", isAuthenticated, async (req, res) => {
    try {
      const movements = await routeStorage.getAllInventoryMovements();
      // Include shipment, shipping details and item info for cost calculations
      const movementsWithDetails = await Promise.all(
        movements.map(async (movement) => {
          const shipment = movement.shipmentId
            ? await routeStorage.getShipment(movement.shipmentId)
            : null;
          const shippingDetails = movement.shipmentId
            ? await routeStorage.getShippingDetails(movement.shipmentId)
            : null;
          const shipmentItems = movement.shipmentId
            ? await routeStorage.getShipmentItems(movement.shipmentId)
            : [];
          const shipmentItem = shipmentItems.find(
            (item) => item.id === movement.shipmentItemId
          );
          // Calculate total pieces in shipment for cost distribution
          const totalShipmentPieces = shipmentItems.reduce((sum, item) => sum + (item.totalPiecesCou || 0), 0);
          return { ...movement, shipment, shipmentItem, shippingDetails, totalShipmentPieces };
        })
      );
      res.json(movementsWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Error fetching inventory" });
    }
  });

  app.get("/api/inventory/stats", isAuthenticated, async (req, res) => {
    try {
      const stats = await routeStorage.getInventoryStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Error fetching inventory stats" });
    }
  });

  // Users
  app.get("/api/users", isAuthenticated, async (req, res) => {
    try {
      const allUsers = await routeStorage.getAllUsers();
      const usersWithoutPasswords = allUsers.map(({ password, ...user }) => user);
      res.json(usersWithoutPasswords);
    } catch (error) {
      res.status(500).json({ message: "Error fetching users" });
    }
  });

  // Create new user (admin only)
  app.post("/api/users", requireRole(["مدير"]), async (req, res) => {
    try {
      const { username, password, firstName, lastName, role } = req.body;
      const actorId = (req.user as any)?.id;
      
      if (!username || !password) {
        return res.status(400).json({ message: "اسم المستخدم وكلمة المرور مطلوبان" });
      }

      const existingUser = await routeStorage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "اسم المستخدم موجود بالفعل" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await routeStorage.createUser({
        username,
        password: hashedPassword,
        firstName: firstName || null,
        lastName: lastName || null,
        role: role || "مشاهد",
      });

      const { password: _, ...userWithoutPassword } = user;
      
      auditLogger({
        userId: actorId,
        entityType: "USER",
        entityId: user.id,
        actionType: "CREATE",
        details: { role: user.role },
      });
      
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Error creating user" });
    }
  });

  // Update user (admin only, or self for password)
  app.patch("/api/users/:id", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const { id } = req.params;
      const { password, firstName, lastName, role } = req.body;
      const currentUser = req.user!;
      const actorId = (req.user as any)?.id;

      // Only admin can update other users or roles
      if (currentUser.id !== id && currentUser.role !== "مدير") {
        return res.status(403).json({ message: "لا تملك صلاحية لتعديل مستخدمين آخرين" });
      }

      // Non-admins can only update their own password
      if (currentUser.id === id && currentUser.role !== "مدير" && role) {
        return res.status(403).json({ message: "غير مصرح بتغيير الدور" });
      }

      const updateData: any = {};
      if (password) {
        updateData.password = await bcrypt.hash(password, 10);
      }
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (role !== undefined && currentUser.role === "مدير") updateData.role = role;

      const user = await routeStorage.updateUser(id, updateData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password: _, ...userWithoutPassword } = user;
      
      auditLogger({
        userId: actorId,
        entityType: "USER",
        entityId: user.id,
        actionType: "UPDATE",
        details: { updatedFields: Object.keys(updateData) },
      });
      
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: "Error updating user" });
    }
  });

  app.patch("/api/users/:id/role", requireRole(["مدير"]), async (req, res) => {
    try {
      const { role } = req.body;
      const user = await routeStorage.updateUserRole(req.params.id, role);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password: _, ...userWithoutPassword } = user;
      
      auditLogger({
        userId: (req.user as any)?.id,
        entityType: "USER",
        entityId: user.id,
        actionType: "UPDATE",
        details: { role: user.role },
      });
      
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: "Error updating user role" });
    }
  });

  // Delete user (admin only)
  app.delete("/api/users/:id", requireRole(["مدير"]), async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.user!;
      const actorId = (req.user as any)?.id;

      // Prevent deleting yourself
      if (currentUser.id === id) {
        return res.status(400).json({ message: "لا يمكن حذف حسابك الخاص" });
      }

      // Prevent deleting root user
      const targetUser = await routeStorage.getUser(id);
      if (targetUser?.username === "root") {
        return res.status(400).json({ message: "لا يمكن حذف حساب الجذر" });
      }

      await routeStorage.deleteUser(id);
      
      auditLogger({
        userId: actorId,
        entityType: "USER",
        entityId: id,
        actionType: "DELETE",
      });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting user" });
    }
  });

  // Accounting Routes
  app.get("/api/accounting/dashboard", isAuthenticated, async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        partyType: req.query.partyType as "supplier" | "shipping_company" | undefined,
        partyId: req.query.partyId ? parseInt(req.query.partyId as string) : undefined,
        shipmentCode: req.query.shipmentCode as string | undefined,
        shipmentStatus: req.query.shipmentStatus as string | undefined,
        paymentStatus: req.query.paymentStatus as string | undefined,
        includeArchived: req.query.includeArchived === "true",
      };
      const stats = await routeStorage.getAccountingDashboard(filters);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching accounting dashboard:", error);
      res.status(500).json({ message: "Error fetching accounting dashboard" });
    }
  });

  app.get("/api/accounting/supplier-balances", isAuthenticated, async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        supplierId: req.query.supplierId ? parseInt(req.query.supplierId as string) : undefined,
        balanceType: req.query.balanceType as 'owing' | 'credit' | 'all' | undefined,
      };
      const balances = await routeStorage.getSupplierBalances(filters);
      res.json(balances);
    } catch (error) {
      console.error("Error fetching supplier balances:", error);
      res.status(500).json({ message: "Error fetching supplier balances" });
    }
  });

  app.get("/api/accounting/supplier-statement/:supplierId", isAuthenticated, async (req, res) => {
    try {
      const supplierId = parseInt(req.params.supplierId);
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const statement = await routeStorage.getSupplierStatement(supplierId, filters);
      res.json(statement);
    } catch (error) {
      console.error("Error fetching supplier statement:", error);
      res.status(500).json({ message: "Error fetching supplier statement" });
    }
  });

  app.get("/api/accounting/shipping-company-balances", isAuthenticated, async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        shippingCompanyId: req.query.shippingCompanyId
          ? parseInt(req.query.shippingCompanyId as string)
          : undefined,
        balanceType: req.query.balanceType as 'owing' | 'credit' | 'all' | undefined,
      };
      const balances = await routeStorage.getShippingCompanyBalances(filters);
      res.json(balances);
    } catch (error) {
      console.error("Error fetching shipping company balances:", error);
      res.status(500).json({ message: "Error fetching shipping company balances" });
    }
  });

  app.get(
    "/api/accounting/shipping-company-statement/:shippingCompanyId",
    isAuthenticated,
    async (req, res) => {
      try {
        const shippingCompanyId = parseInt(req.params.shippingCompanyId);
        const filters = {
          dateFrom: req.query.dateFrom as string | undefined,
          dateTo: req.query.dateTo as string | undefined,
        };
        const statement = await routeStorage.getShippingCompanyStatement(
          shippingCompanyId,
          filters,
        );
        res.json(statement);
      } catch (error) {
        console.error("Error fetching shipping company statement:", error);
        res
          .status(500)
          .json({ message: "Error fetching shipping company statement" });
      }
    },
  );

  app.get("/api/accounting/movement-report", isAuthenticated, async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        shipmentId: req.query.shipmentId ? parseInt(req.query.shipmentId as string) : undefined,
        partyType: req.query.partyType as "supplier" | "shipping_company" | undefined,
        partyId: req.query.partyId ? parseInt(req.query.partyId as string) : undefined,
        movementType: req.query.movementType as string | undefined,
        costComponent: req.query.costComponent as string | undefined,
        paymentMethod: req.query.paymentMethod as string | undefined,
        shipmentStatus: req.query.shipmentStatus as string | undefined,
        paymentStatus: req.query.paymentStatus as string | undefined,
        includeArchived: req.query.includeArchived === "true",
      };
      const report = await routeStorage.getMovementReport(filters);
      res.json(report);
    } catch (error) {
      console.error("Error fetching movement report:", error);
      res.status(500).json({ message: "Error fetching movement report" });
    }
  });

  app.get("/api/accounting/payment-methods-report", isAuthenticated, async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const report = await routeStorage.getPaymentMethodsReport(filters);
      res.json(report);
    } catch (error) {
      console.error("Error fetching payment methods report:", error);
      res.status(500).json({ message: "Error fetching payment methods report" });
    }
  });

  // Change own password
  app.post("/api/auth/change-password", isAuthenticated, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user!.id;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "كلمة المرور الحالية والجديدة مطلوبتان" });
      }

      const user = await routeStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "كلمة المرور الحالية غير صحيحة" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await routeStorage.updateUser(userId, { password: hashedPassword });

      auditLogger({
        userId,
        entityType: "USER",
        entityId: userId,
        actionType: "UPDATE",
        details: { action: "CHANGE_PASSWORD" },
      });

      res.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
    } catch (error) {
      res.status(500).json({ message: "Error changing password" });
    }
  });

  // Backup/Restore Routes (Admin only)
  app.get("/api/backup/jobs", requireRole(["مدير"]), async (_req, res) => {
    try {
      const jobs = await getBackupJobs();
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching backup jobs:", error);
      res.status(500).json({ message: "فشل في جلب قائمة النسخ الاحتياطية" });
    }
  });

  app.get("/api/backup/jobs/:id", requireRole(["مدير"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "معرف غير صالح" });
      }
      const job = await getBackupJob(id);
      if (!job) {
        return res.status(404).json({ message: "لم يتم العثور على الوظيفة" });
      }
      res.json(job);
    } catch (error) {
      console.error("Error fetching backup job:", error);
      res.status(500).json({ message: "فشل في جلب تفاصيل الوظيفة" });
    }
  });

  app.post("/api/backup/start", requireRole(["مدير"]), async (req, res) => {
    try {
      const userId = req.user!.id;
      const job = await startBackup(userId);
      
      auditLogger({
        userId,
        entityType: "BACKUP",
        entityId: job.id.toString(),
        actionType: "CREATE",
        details: { action: "START_BACKUP" },
      });
      
      res.json(job);
    } catch (error) {
      console.error("Error starting backup:", error);
      res.status(500).json({ message: "فشل في بدء النسخ الاحتياطي" });
    }
  });

  app.post("/api/restore/start", requireRole(["مدير"]), async (req, res) => {
    try {
      const userId = req.user!.id;
      const { backupPath } = req.body;
      
      console.log("[restore/start] Received restore request:", { backupPath, userId });
      
      if (!backupPath) {
        return res.status(400).json({ message: "مسار النسخة الاحتياطية مطلوب" });
      }
      
      const job = await startRestore(userId, backupPath);
      console.log("[restore/start] Restore job created:", job.id);
      
      auditLogger({
        userId,
        entityType: "BACKUP",
        entityId: job.id.toString(),
        actionType: "CREATE",
        details: { action: "START_RESTORE", backupPath },
      });
      
      res.json(job);
    } catch (error) {
      console.error("Error starting restore:", error);
      res.status(500).json({ message: "فشل في بدء الاستعادة" });
    }
  });

  app.get("/api/backup/download/:id", requireRole(["مدير"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "معرف غير صالح" });
      }
      
      const job = await getBackupJob(id);
      if (!job || job.jobType !== "backup" || job.status !== "completed" || !job.outputPath) {
        return res.status(404).json({ message: "النسخة الاحتياطية غير متوفرة" });
      }
      
      const objectStorage = new ObjectStorageService();
      const objectPath = job.outputPath.replace("/objects/", "");
      const buffer = await objectStorage.downloadObjectToBuffer(objectPath);
      
      if (!buffer) {
        return res.status(404).json({ message: "ملف النسخة الاحتياطية غير موجود" });
      }
      
      const filename = `backup-${job.id}-${new Date(job.createdAt).toISOString().split("T")[0]}.zip`;
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (error) {
      console.error("Error downloading backup:", error);
      res.status(500).json({ message: "فشل في تحميل النسخة الاحتياطية" });
    }
  });

  app.post("/api/backup/upload", requireRole(["مدير"]), uploadBackupFile.single("file"), async (req, res) => {
    try {
      const userId = req.user!.id;
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: "الملف مطلوب" });
      }
      
      if (!file.originalname.endsWith(".zip")) {
        return res.status(400).json({ message: "يجب أن يكون الملف بصيغة ZIP" });
      }
      
      const objectStorage = new ObjectStorageService();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const { bucketName } = objectStorage.getBucketAndPrefix();
      const backupPath = `/${bucketName}/backups/uploaded-${timestamp}.zip`;
      
      await objectStorage.uploadObjectFromBuffer(backupPath, file.buffer, "application/zip");
      
      auditLogger({
        userId,
        entityType: "BACKUP",
        entityId: "upload",
        actionType: "CREATE",
        details: { action: "UPLOAD_BACKUP", filename: file.originalname, size: file.size },
      });
      
      console.log("[backup/upload] Upload successful:", { backupPath, fileName: file.originalname, fileSize: file.size });
      res.json({ 
        success: true, 
        backupPath,
        fileName: file.originalname,
        fileSize: file.size,
        message: "تم رفع النسخة الاحتياطية بنجاح" 
      });
    } catch (error) {
      console.error("Error uploading backup:", error);
      res.status(500).json({ message: "فشل في رفع النسخة الاحتياطية" });
    }
  });

  // ============================================================
  // Local Trade Routes
  // ============================================================

  // Parties Routes
  app.get("/api/local-trade/parties", isAuthenticated, async (req, res) => {
    try {
      const filters: { type?: string; isActive?: boolean } = {};
      if (req.query.type && typeof req.query.type === "string") {
        filters.type = req.query.type;
      }
      if (req.query.isActive !== undefined) {
        filters.isActive = req.query.isActive === "true";
      }
      const parties = await routeStorage.getAllParties(filters);
      res.json(parties);
    } catch (error) {
      console.error("Error fetching parties:", error);
      res.status(500).json({ message: "خطأ في جلب بيانات الملفات" });
    }
  });

  app.get("/api/local-trade/parties/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const party = await routeStorage.getParty(id);
      if (!party) {
        return res.status(404).json({ message: "الملف غير موجود" });
      }
      res.json(party);
    } catch (error) {
      console.error("Error fetching party:", error);
      res.status(500).json({ message: "خطأ في جلب بيانات الملف" });
    }
  });

  app.get("/api/local-trade/parties/:id/profile", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const profile = await routeStorage.getPartyProfile(id);
      if (!profile) {
        return res.status(404).json({ message: "الملف غير موجود" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching party profile:", error);
      res.status(500).json({ message: "خطأ في جلب بيانات الملف" });
    }
  });

  app.get("/api/local-trade/parties/:id/summary", isAuthenticated, async (req, res) => {
    const partyId = parseInt(req.params.id);
    const seasonId = req.query.seasonId ? parseInt(req.query.seasonId as string) : undefined;
    
    try {
      const summary = await routeStorage.getPartyProfileSummary(partyId, seasonId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching party summary:", error);
      res.status(500).json({ message: "حدث خطأ أثناء تحميل البيانات" });
    }
  });

  app.post("/api/local-trade/parties", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      const data = insertPartySchema.parse(req.body);
      
      // Create the party
      const party = await routeStorage.createParty(data);
      
      // Create initial season
      const season = await routeStorage.createSeason({
        partyId: party.id,
        seasonName: "الموسم الأول",
        isCurrent: true,
        openingBalanceEgp: data.openingBalanceEgp || "0",
      });
      
      // Create opening balance ledger entry if there's an opening balance
      const openingBalance = parseFloat(data.openingBalanceEgp || "0");
      if (openingBalance !== 0) {
        const amount = data.openingBalanceType === "credit" ? -openingBalance : openingBalance;
        await routeStorage.createLedgerEntry({
          partyId: party.id,
          seasonId: season.id,
          entryType: "opening_balance",
          sourceType: "party",
          sourceId: party.id,
          amountEgp: amount.toString(),
          note: "رصيد افتتاحي",
          createdByUserId: userId,
        });
      }
      
      auditLogger({
        userId,
        entityType: "PARTY",
        entityId: String(party.id),
        actionType: "CREATE",
        details: { type: party.type, name: party.name },
      });
      
      res.json(party);
    } catch (error) {
      console.error("Error creating party:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: error.errors });
      }
      res.status(500).json({ message: "خطأ في إنشاء الملف" });
    }
  });

  app.patch("/api/local-trade/parties/:id", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      
      const party = await routeStorage.updateParty(id, req.body);
      if (!party) {
        return res.status(404).json({ message: "الملف غير موجود" });
      }
      
      auditLogger({
        userId,
        entityType: "PARTY",
        entityId: String(id),
        actionType: "UPDATE",
        details: req.body,
      });
      
      res.json(party);
    } catch (error) {
      console.error("Error updating party:", error);
      res.status(500).json({ message: "خطأ في تحديث الملف" });
    }
  });

  // Party Seasons Routes
  app.get("/api/local-trade/parties/:id/seasons", isAuthenticated, async (req, res) => {
    try {
      const partyId = parseInt(req.params.id);
      const seasons = await routeStorage.getPartySeasons(partyId);
      res.json(seasons);
    } catch (error) {
      console.error("Error fetching party seasons:", error);
      res.status(500).json({ message: "خطأ في جلب مواسم الملف" });
    }
  });

  app.post("/api/local-trade/parties/:id/settlement", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const partyId = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      
      // Check party exists
      const party = await routeStorage.getParty(partyId);
      if (!party) {
        return res.status(404).json({ message: "الملف غير موجود" });
      }
      
      // Get current season
      const currentSeason = await routeStorage.getCurrentSeason(partyId);
      if (!currentSeason) {
        return res.status(400).json({ message: "لا يوجد موسم حالي لهذا الملف" });
      }
      
      // Check balance is zero
      const balance = await routeStorage.getPartyBalance(partyId, currentSeason.id);
      if (parseFloat(balance.balanceEgp) !== 0) {
        return res.status(400).json({ 
          message: "يجب أن يكون الرصيد صفراً قبل التسوية",
          currentBalance: balance.balanceEgp,
          direction: balance.direction,
        });
      }
      
      // Generate reference number
      const referenceNumber = await routeStorage.generateInvoiceReferenceNumber("settlement");
      
      // Create settlement invoice
      const invoice = await routeStorage.createLocalInvoice({
        partyId,
        seasonId: currentSeason.id,
        invoiceKind: "settlement",
        status: "posted",
        invoiceDate: new Date().toISOString().slice(0, 10),
        referenceNumber,
        totalCartons: 0,
        totalPieces: 0,
        subtotalEgp: "0",
        totalEgp: "0",
        notes: "فاتورة تسوية",
        createdByUserId: userId,
      }, []);
      
      // Create closing ledger entry
      await routeStorage.createLedgerEntry({
        partyId,
        seasonId: currentSeason.id,
        entryType: "settlement",
        sourceType: "local_invoice",
        sourceId: invoice.id,
        amountEgp: "0",
        note: "تسوية الموسم",
        createdByUserId: userId,
      });
      
      // Close current season
      await routeStorage.closeSeason(currentSeason.id);
      
      // Create new season
      await routeStorage.createSeason({
        partyId,
        seasonName: `موسم ${new Date().getFullYear()}`,
        isCurrent: true,
        openingBalanceEgp: "0",
      });
      
      auditLogger({
        userId,
        entityType: "LOCAL_INVOICE",
        entityId: String(invoice.id),
        actionType: "CREATE",
        details: { invoiceKind: "settlement", partyId },
      });
      
      res.json(invoice);
    } catch (error) {
      console.error("Error creating settlement:", error);
      res.status(500).json({ message: "خطأ في إنشاء فاتورة التسوية" });
    }
  });

  // Local Invoices Routes
  app.get("/api/local-trade/invoices/next-reference", isAuthenticated, async (req, res) => {
    try {
      const nextRef = await routeStorage.getNextInvoiceReference();
      res.json({ referenceNumber: nextRef });
    } catch (error) {
      console.error("Error generating reference:", error);
      res.status(500).json({ message: "فشل إنشاء رقم المرجع" });
    }
  });

  app.get("/api/local-trade/invoices", isAuthenticated, async (req, res) => {
    try {
      const filters: { partyId?: number; invoiceKind?: string; status?: string } = {};
      if (req.query.partyId) {
        filters.partyId = parseInt(req.query.partyId as string);
      }
      if (req.query.invoiceKind && typeof req.query.invoiceKind === "string") {
        filters.invoiceKind = req.query.invoiceKind;
      }
      if (req.query.status && typeof req.query.status === "string") {
        filters.status = req.query.status;
      }
      const invoices = await routeStorage.getAllLocalInvoices(filters);
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "خطأ في جلب الفواتير" });
    }
  });

  app.get("/api/local-trade/invoices/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const invoiceData = await routeStorage.getLocalInvoice(id);
      if (!invoiceData) {
        return res.status(404).json({ message: "الفاتورة غير موجودة" });
      }
      res.json(invoiceData);
    } catch (error) {
      console.error("Error fetching invoice:", error);
      res.status(500).json({ message: "خطأ في جلب الفاتورة" });
    }
  });

  app.post("/api/local-trade/invoices", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      const { lines, ...invoiceData } = req.body;
      
      // Validate invoice data
      const validatedInvoice = insertLocalInvoiceSchema.parse(invoiceData);
      
      // Validate lines if provided
      const validatedLines = (lines || []).map((line: any) => 
        insertLocalInvoiceLineSchema.omit({ invoiceId: true }).parse(line)
      );
      
      // Validate dozen (دستة) unit quantities
      for (const line of validatedLines) {
        if (line.unitMode === 'dozen' && (line.totalPieces || 0) % 12 !== 0) {
          return res.status(400).json({
            message: `الكمية ${line.totalPieces} لا يمكن تقسيمها على 12. يجب أن تكون الكمية بالدستة قابلة للقسمة على 12.`
          });
        }
      }
      
      // Check credit limit for credit parties
      const party = await routeStorage.getParty(validatedInvoice.partyId);
      if (!party) {
        return res.status(400).json({ message: "الملف غير موجود" });
      }
      
      if ((party.paymentTerms === "آجل" || party.paymentTerms === "credit") && party.creditLimitMode === "limited") {
        const currentSeason = await routeStorage.getCurrentSeason(party.id);
        const balance = await routeStorage.getPartyBalance(party.id, currentSeason?.id);
        const signedBalance = balance.direction === 'debit' ? parseFloat(balance.balanceEgp) : -parseFloat(balance.balanceEgp);
        const invoiceTotal = parseFloat(validatedInvoice.totalEgp || "0");
        const creditLimit = parseFloat(party.creditLimitAmountEgp || "0");
        
        // For PURCHASE invoices (party owes us more after purchase), check credit limit
        // Sign convention: positive = party owes us (debit), negative = we owe them (credit)
        if (validatedInvoice.invoiceKind === "purchase" && signedBalance + invoiceTotal > creditLimit) {
          return res.status(400).json({
            message: "تم تجاوز حد الائتمان",
            currentBalance: signedBalance.toFixed(2),
            invoiceTotal: invoiceTotal.toFixed(2),
            creditLimit: creditLimit.toFixed(2),
          });
        }
      }
      
      // Generate reference number if not provided
      if (!validatedInvoice.referenceNumber) {
        validatedInvoice.referenceNumber = await routeStorage.generateInvoiceReferenceNumber(
          validatedInvoice.invoiceKind
        );
      }
      
      // Get current season
      const currentSeason = await routeStorage.getCurrentSeason(validatedInvoice.partyId);
      if (currentSeason) {
        validatedInvoice.seasonId = currentSeason.id;
      }
      
      validatedInvoice.createdByUserId = userId;
      
      const invoice = await routeStorage.createLocalInvoice(validatedInvoice, validatedLines);
      
      auditLogger({
        userId,
        entityType: "LOCAL_INVOICE",
        entityId: String(invoice.id),
        actionType: "CREATE",
        details: { invoiceKind: invoice.invoiceKind, partyId: invoice.partyId, totalEgp: invoice.totalEgp },
      });
      
      res.json(invoice);
    } catch (error) {
      console.error("Error creating invoice:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: error.errors });
      }
      res.status(500).json({ message: "خطأ في إنشاء الفاتورة" });
    }
  });

  app.patch("/api/local-trade/invoices/:id", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      
      const invoice = await routeStorage.updateLocalInvoice(id, req.body);
      if (!invoice) {
        return res.status(404).json({ message: "الفاتورة غير موجودة" });
      }
      
      auditLogger({
        userId,
        entityType: "LOCAL_INVOICE",
        entityId: String(id),
        actionType: "UPDATE",
        details: req.body,
      });
      
      res.json(invoice);
    } catch (error) {
      console.error("Error updating invoice:", error);
      res.status(500).json({ message: "خطأ في تحديث الفاتورة" });
    }
  });

  app.post("/api/local-trade/invoices/:id/receive", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      const { lineReceipts } = req.body as { lineReceipts?: { lineId: number; receivedPieces: number }[] };
      
      const result = await routeStorage.receiveInvoice(id, userId, lineReceipts);
      
      auditLogger({
        userId,
        entityType: "LOCAL_INVOICE",
        entityId: String(id),
        actionType: "UPDATE",
        details: { action: "RECEIVE", movementsCreated: result.movementsCreated, marginsCreated: result.marginsCreated },
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error receiving invoice:", error);
      res.status(500).json({ message: "خطأ في استلام الفاتورة" });
    }
  });

  // Local Payments Routes
  app.get("/api/local-trade/payments", isAuthenticated, async (req, res) => {
    try {
      const filters: { partyId?: number } = {};
      if (req.query.partyId) {
        filters.partyId = parseInt(req.query.partyId as string);
      }
      const payments = await routeStorage.getLocalPayments(filters);
      res.json(payments);
    } catch (error) {
      console.error("Error fetching local payments:", error);
      res.status(500).json({ message: "خطأ في جلب الدفعات" });
    }
  });

  app.post("/api/local-trade/payments", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      const data = insertLocalPaymentSchema.parse(req.body);
      
      // Get current season
      const currentSeason = await routeStorage.getCurrentSeason(data.partyId);
      if (currentSeason) {
        data.seasonId = currentSeason.id;
      }
      
      data.createdByUserId = userId;
      
      const payment = await routeStorage.createLocalPayment(data);
      
      auditLogger({
        userId,
        entityType: "LOCAL_PAYMENT",
        entityId: String(payment.id),
        actionType: "CREATE",
        details: { partyId: payment.partyId, amountEgp: payment.amountEgp },
      });
      
      res.json(payment);
    } catch (error) {
      console.error("Error creating local payment:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: error.errors });
      }
      res.status(500).json({ message: "خطأ في إنشاء الدفعة" });
    }
  });

  // Return Cases Routes
  app.get("/api/local-trade/return-cases", isAuthenticated, async (req, res) => {
    try {
      const filters: { partyId?: number; status?: string } = {};
      if (req.query.partyId) {
        filters.partyId = parseInt(req.query.partyId as string);
      }
      if (req.query.status && typeof req.query.status === "string") {
        filters.status = req.query.status;
      }
      const returnCases = await routeStorage.getReturnCases(filters);
      res.json(returnCases);
    } catch (error) {
      console.error("Error fetching return cases:", error);
      res.status(500).json({ message: "خطأ في جلب حالات المرتجعات" });
    }
  });

  app.get("/api/local-trade/return-cases/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const returnCase = await routeStorage.getReturnCase(id);
      if (!returnCase) {
        return res.status(404).json({ message: "حالة المرتجع غير موجودة" });
      }
      res.json(returnCase);
    } catch (error) {
      console.error("Error fetching return case:", error);
      res.status(500).json({ message: "خطأ في جلب حالة المرتجع" });
    }
  });

  app.post("/api/local-trade/return-cases", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      const data = insertReturnCaseSchema.parse(req.body);
      
      // Get party to snapshot type
      const party = await routeStorage.getParty(data.partyId);
      if (!party) {
        return res.status(400).json({ message: "الملف غير موجود" });
      }
      
      data.partyTypeSnapshot = party.type;
      data.status = "under_inspection";
      data.createdByUserId = userId;
      
      // Get current season
      const currentSeason = await routeStorage.getCurrentSeason(data.partyId);
      if (currentSeason) {
        data.seasonId = currentSeason.id;
      }
      
      const returnCase = await routeStorage.createReturnCase(data);
      
      auditLogger({
        userId,
        entityType: "RETURN_CASE",
        entityId: String(returnCase.id),
        actionType: "CREATE",
        details: { partyId: returnCase.partyId, pieces: returnCase.pieces },
      });
      
      res.json(returnCase);
    } catch (error) {
      console.error("Error creating return case:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: error.errors });
      }
      res.status(500).json({ message: "خطأ في إنشاء حالة المرتجع" });
    }
  });

  app.post("/api/local-trade/return-cases/:id/resolve", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      const { resolution, amountEgp, pieces, cartons, resolutionNote } = req.body;
      
      if (!resolution) {
        return res.status(400).json({ message: "يجب تحديد نوع الحل" });
      }
      
      const validResolutions = ['accepted_return', 'exchange', 'deduct_value', 'damaged'];
      if (!validResolutions.includes(resolution)) {
        return res.status(400).json({ message: "نوع الحل غير صحيح" });
      }
      
      if ((resolution === 'accepted_return' || resolution === 'deduct_value') && 
          (amountEgp === undefined || amountEgp === null || amountEgp <= 0)) {
        return res.status(400).json({ message: "يجب تحديد قيمة المبلغ (أكبر من صفر)" });
      }
      
      const finalAmountEgp = (resolution === 'exchange' || resolution === 'damaged') ? 0 : (amountEgp ?? 0);
      
      const resolveData = {
        resolution,
        amountEgp: finalAmountEgp,
        pieces: pieces ?? 0,
        cartons: cartons ?? 0,
        resolutionNote: resolutionNote || null,
      };
      
      const returnCase = await routeStorage.resolveReturnCase(id, resolveData, userId);
      if (!returnCase) {
        return res.status(404).json({ message: "حالة المرتجع غير موجودة" });
      }
      
      auditLogger({
        userId,
        entityType: "RETURN_CASE",
        entityId: String(id),
        actionType: "UPDATE",
        details: { action: "RESOLVE", ...resolveData },
      });
      
      res.json(returnCase);
    } catch (error) {
      console.error("Error resolving return case:", error);
      res.status(500).json({ message: "خطأ في حل حالة المرتجع" });
    }
  });

  // ============ Party Collections (التحصيل) ============

  // GET /api/local-trade/collections?partyId=X
  // List all collections for a party, ordered by collectionOrder
  app.get("/api/local-trade/collections", isAuthenticated, async (req, res) => {
    try {
      const partyId = req.query.partyId ? parseInt(req.query.partyId as string) : undefined;
      if (!partyId) {
        return res.status(400).json({ message: "partyId is required" });
      }
      const collections = await routeStorage.getPartyCollections(partyId);
      res.json(collections);
    } catch (error) {
      console.error("Error fetching party collections:", error);
      res.status(500).json({ message: "خطأ في جلب بيانات التحصيل" });
    }
  });

  // POST /api/local-trade/collections
  // Create or update collection dates (upsert based on partyId + collectionOrder)
  app.post("/api/local-trade/collections", isAuthenticated, async (req, res) => {
    try {
      const { partyId, collections } = req.body;
      // collections is an array of { collectionOrder, collectionDate, amountEgp, notes }
      if (!partyId || !Array.isArray(collections)) {
        return res.status(400).json({ message: "partyId and collections array required" });
      }
      const result = await routeStorage.upsertPartyCollections(partyId, collections);
      res.json(result);
    } catch (error) {
      console.error("Error upserting party collections:", error);
      res.status(500).json({ message: "خطأ في حفظ بيانات التحصيل" });
    }
  });

  // PATCH /api/local-trade/collections/:id/status
  // Mark as collected or postponed
  app.patch("/api/local-trade/collections/:id/status", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, linkedPaymentId } = req.body; // 'collected' | 'postponed' | 'pending'
      const result = await routeStorage.updateCollectionStatus(id, status, linkedPaymentId);
      res.json(result);
    } catch (error) {
      console.error("Error updating collection status:", error);
      res.status(500).json({ message: "خطأ في تحديث حالة التحصيل" });
    }
  });

  // PATCH /api/local-trade/collections/:id/reminder
  // Mark reminder as sent
  app.patch("/api/local-trade/collections/:id/reminder", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await routeStorage.markCollectionReminderSent(id);
      res.json(result);
    } catch (error) {
      console.error("Error marking collection reminder sent:", error);
      res.status(500).json({ message: "خطأ في تحديث حالة التذكير" });
    }
  });

  // DELETE /api/local-trade/collections/:id
  app.delete("/api/local-trade/collections/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await routeStorage.deletePartyCollection(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting party collection:", error);
      res.status(500).json({ message: "خطأ في حذف التحصيل" });
    }
  });

  // GET /api/local-trade/parties/:id/timeline
  // Get all activities for a party (invoices, payments, returns, collections) sorted by date
  app.get("/api/local-trade/parties/:id/timeline", isAuthenticated, async (req, res) => {
    try {
      const partyId = parseInt(req.params.id);
      const timeline = await routeStorage.getPartyTimeline(partyId);
      res.json(timeline);
    } catch (error) {
      console.error("Error fetching party timeline:", error);
      res.status(500).json({ message: "خطأ في جلب سجل العميل" });
    }
  });

  // ============ Notifications (التنبيهات) ============

  // GET /api/notifications
  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    try {
      const notifications = await routeStorage.getNotifications(req.user!.id);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "خطأ في جلب التنبيهات" });
    }
  });

  // POST /api/notifications/check-due-collections
  app.post("/api/notifications/check-due-collections", isAuthenticated, async (req, res) => {
    try {
      await routeStorage.checkAndCreateCollectionReminders(req.user!.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error checking due collections:", error);
      res.status(500).json({ message: "خطأ في التحقق من التحصيلات" });
    }
  });

  // PUT /api/notifications/:id/read
  app.put("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await routeStorage.markNotificationRead(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification read:", error);
      res.status(500).json({ message: "خطأ في تحديث التنبيه" });
    }
  });
}
