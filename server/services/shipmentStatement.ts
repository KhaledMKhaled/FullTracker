import type { IStorage } from "../storage";
import type { ShipmentStatement } from "@shared/shipmentStatement";
import { ApiError } from "../errors";
import { calculatePaymentSnapshot, parseAmountOrZero, paymentInComponentCurrency } from "./paymentCalculations";
import { roundAmount } from "./currency";

type StatementStorage = Pick<IStorage, "getShipment" | "getShipmentItems" | "getShipmentPayments" |
  "getPaymentAllocationsByShipmentId" | "getSupplier" | "getShippingCompany">;

export async function buildShipmentStatement(storage: StatementStorage, id: number, now = new Date()): Promise<ShipmentStatement> {
  const shipment = await storage.getShipment(id);
  if (!shipment) throw new ApiError("SHIPMENT_NOT_FOUND", undefined, 404);
  const [items, payments, allocations] = await Promise.all([
    storage.getShipmentItems(id), storage.getShipmentPayments(id),
    storage.getPaymentAllocationsByShipmentId(id),
  ]);
  // Match the list's settlement calculation exactly, including legacy fallback.
  const snapshot = await calculatePaymentSnapshot({ shipment, payments });
  const names = new Map<string, Promise<string>>();
  const partyName = (type: string | null, partyId: number | null): Promise<string> => {
    if (!type || !partyId) return Promise.resolve("غير محدد");
    const key = `${type}:${partyId}`;
    if (!names.has(key)) names.set(key, (async () => {
      const party = type === "supplier" ? await storage.getSupplier(partyId)
        : type === "shipping_company" ? await storage.getShippingCompany(partyId) : undefined;
      return party?.name ?? `طرف غير متاح (${partyId})`;
    })());
    return names.get(key)!;
  };
  const shipmentRate = parseAmountOrZero(shipment.purchaseRmbToEgpRate);
  const sorted = [...payments].sort((a, b) =>
    new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime() || a.id - b.id);
  return {
    reference: `ST-${id}-${now.toISOString().replace(/[-:.]/g, "")}`,
    generatedAt: now.toISOString(), shipment,
    items: await Promise.all([...items].sort((a, b) => a.lineNo - b.lineNo || a.id - b.id).map(async item => ({
      ...item, supplierName: await partyName("supplier", item.supplierId),
    }))),
    components: snapshot.components,
    payments: await Promise.all(sorted.map(async payment => {
      const converted = paymentInComponentCurrency(payment, shipmentRate);
      const crossCurrency = converted.currency !== payment.paymentCurrency;
      return {
        ...payment,
        partyName: await partyName(payment.partyType, payment.partyId),
        componentCurrency: converted.currency,
        componentAmount: converted.amount,
        conversionBasis: !crossCurrency ? "بالعملة الأصلية للبند"
          : converted.currency === "EGP" ? "المقابل التاريخي المسجل بالجنيه"
          : parseAmountOrZero(payment.exchangeRateToEgp) > 0 ? "سعر الصرف المسجل للدفعة"
          : shipmentRate > 0 ? `سعر الشحنة المسجل (${shipmentRate}) لغياب سعر الدفعة`
          : "تعذر التحويل إلى عملة البند لغياب سعر الصرف؛ لا يمثل الصفر سدادًا",
        allocations: await Promise.all(allocations.filter(a => a.paymentId === payment.id).map(async a => ({
          ...a, supplierName: await partyName("supplier", a.supplierId),
        }))),
      };
    })),
    settlement: snapshot.settlement,
    basis: snapshot.componentSettlementIsReliable ? "native-components" : "legacy-egp",
    legacy: {
      cost: parseAmountOrZero(shipment.finalTotalCostEgp),
      paid: parseAmountOrZero(shipment.totalPaidEgp),
      remaining: roundAmount(Math.max(0, parseAmountOrZero(shipment.finalTotalCostEgp) - parseAmountOrZero(shipment.totalPaidEgp))),
    },
    notes: [
      "نطاق الكشف: محتويات وتكاليف الشحنة الحالية وجميع الدفعات المسجلة حاليًا، بما فيها الشحنات المؤرشفة. لا يشمل الدفعات المحذوفة.",
      "أساس افتتاحي بالتكاليف الحالية دون تاريخ قيد، تتبعه الدفعات حسب تاريخها؛ ليس سجلًا تاريخيًا مدققًا لتعديلات التكلفة.",
      "تكلفة البضاعة في ملخص البنود صافية من الخصم الجزئي. النواقص معروضة للمعلومية ولا تُخصم مرة أخرى من رصيد السداد.",
      "تخصيصات الدفعات تفاصيل تفسيرية وليست مدفوعات إضافية. المقابل التاريخي بالجنيه لا يحول فرق الصرف إلى دين.",
      "الرصيد الصافي لكل عملة قد يتضمن فائضًا؛ المتبقي المستحق وحالة السداد محسوبان لكل بند دون مقاصة عجز بند بفائض آخر.",
      ...(!snapshot.componentSettlementIsReliable ? ["بيانات العملات الأصلية غير مكتملة؛ حالة السداد والمتبقي يعتمدان على الإجمالي والمدفوع التاريخيين بالجنيه، وقد يختلف المدفوع المخزن عن مجموع الدفعات المتاحة."] : []),
    ],
  };
}
