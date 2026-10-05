import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { ShipmentStatement, StatementPayment } from "@shared/shipmentStatement";
import { registerArabicFont } from "@/lib/pdf-arabic";

const INK: [number, number, number] = [35, 49, 62];
const RULE: [number, number, number] = [191, 199, 205];
const TINT: [number, number, number] = [239, 242, 244];
const money = (value: unknown, decimals = 2) => {
  if (value === null || value === undefined || value === "") return "غير مسجل";
  const n = Number(value);
  return Number.isFinite(n)
    ? n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : "غير مسجل";
};
const text = (value: unknown) => value === null || value === undefined || value === "" ? "غير مسجل" : String(value);
const date = (value: unknown, time = false) => {
  if (!value) return "غير مسجل";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? "غير مسجل" : d.toLocaleString("ar-EG", {
    year: "numeric", month: "2-digit", day: "2-digit",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
};

/** Stable chronology, including multiple payments recorded on the same day. */
export function orderedStatementPayments(payments: StatementPayment[]) {
  return [...payments].sort((a, b) =>
    new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime() ||
    a.id - b.id);
}

export function buildStatementLedger(statement: ShipmentStatement, currency: "RMB" | "EGP") {
  if (statement.basis === "legacy-egp" && currency !== "EGP") {
    throw new Error("الأساس القديم لا يدعم رصيداً أصلياً بالرممبي.");
  }
  let balance = 0;
  const entries: {
    label: string; payment?: StatementPayment; debit: number; credit: number; balance: number;
  }[] = [];
  const costs = statement.basis === "legacy-egp"
    ? [{ name: "التكلفة وفق الملخص القديم", cost: statement.legacy.cost }]
    : statement.components.filter(c => c.currency === currency);
  for (const cost of costs) {
    balance += cost.cost;
    entries.push({ label: cost.name, debit: cost.cost, credit: 0, balance });
  }
  for (const payment of orderedStatementPayments(statement.payments)) {
    if (statement.basis !== "legacy-egp" && payment.componentCurrency !== currency) continue;
    const credit = statement.basis === "legacy-egp" ? Number(payment.amountEgp) : payment.componentAmount;
    balance -= credit;
    entries.push({ label: payment.costComponent, payment, debit: 0, credit, balance });
  }
  return { entries, closingBalance: balance };
}

/**
 * Text-only A4 statement. Components and settlement are authoritative server values.
 * Allocations and adjustments are explanation, never additional ledger credits.
 * The optional font registrar allows synthetic fixtures without a browser fetch.
 */
export async function createShipmentAccountStatement(
  statement: ShipmentStatement,
  fontRegistrar: (doc: jsPDF) => Promise<void> = registerArabicFont,
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  await fontRegistrar(doc);
  // jsPDF defaults to visual input. Our strings are logical Unicode; declaring
  // that explicitly prevents mixed Arabic rows from turning "42" into "24".
  doc.internal.events.subscribe("preProcessText", (args: {
    text: unknown;
    options: Record<string, unknown>;
  }) => {
    args.options.isInputVisual = false;
    args.options.isOutputVisual = true;
    args.options.isInputRtl = /[\u0600-\u06ff\ufb50-\ufeff]/.test(String(args.text));
    args.options.isOutputRtl = false;
    args.options.isSymmetricSwapping = true;
  });
  doc.setProperties({
    title: `كشف حساب الشحنة ${statement.shipment.shipmentCode}`,
    subject: statement.reference, author: "Tracker", creator: "Tracker",
  });
  const s = statement.shipment;
  const payments = orderedStatementPayments(statement.payments);
  let y = 33;
  const write = (value: string, x: number, at: number, size: number, rtl = true) => {
    doc.setFont("Amiri", "normal");
    doc.setFontSize(size);
    doc.setTextColor(...INK);
    // jsPDF's Arabic preprocessor and bidi engine already reorder Arabic.
    // R2L=true reverses it a second time (and corrupts Latin references).
    doc.setR2L(false);
    doc.text(value, x, at, { align: rtl ? "right" : "left" });
  };
  const table = (headers: string[], rows: string[][], widths?: number[]) => {
    // Physical column order is reversed: the first accounting column is on the right.
    const head = [...headers].reverse();
    const body = rows.map(row => [...row].reverse());
    autoTable(doc, {
      startY: y, head: [head], body,
      margin: { top: 33, bottom: 20, left: 14, right: 14 },
      tableWidth: 182, theme: "grid", showHead: "everyPage",
      styles: {
        font: "Amiri", fontStyle: "normal", fontSize: 10, cellPadding: 2.2,
        textColor: INK, lineColor: RULE, lineWidth: 0.15,
        halign: "right", valign: "top", overflow: "linebreak",
      },
      headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "normal" },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: widths
        ? Object.fromEntries([...widths].reverse().map((w, i) => [i, { cellWidth: w }]))
        : {},
      willDrawCell: () => {
        // Right alignment + native Arabic shaping, without reversing numeric text.
        doc.setR2L(false);
      },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
    doc.setR2L(false);
  };
  const section = (title: string) => {
    if (y > 249) { doc.addPage(); y = 33; }
    doc.setFillColor(...TINT);
    doc.rect(14, y, 182, 9, "F");
    write(title, 193, y + 6, 12);
    y += 12;
  };
  const paragraphs = (rows: string[]) => {
    if (rows.length) table(["إيضاحات الكشف"], rows.map(row => [row]), [182]);
  };

  section("بيانات الشحنة ونطاق الكشف");
  table(["البيان", "القيمة"], [
    ["رقم الشحنة / اسم الشحنة", `${s.shipmentCode} / ${s.shipmentName}`],
    ["حالة الشحنة / حالة السداد", `${s.status} / ${statement.settlement.status}`],
    ["مرجع الكشف", statement.reference],
    ["تاريخ الإصدار", date(statement.generatedAt, true)],
    ["تاريخ الشراء / تاريخ فاتورة الجمرك", `${date(s.purchaseDate)} / ${date(s.invoiceCustomsDate)}`],
    ["تاريخ الإنشاء / آخر تحديث", `${date(s.createdAt, true)} / ${date(s.updatedAt, true)}`],
    ["شركة الشحن (رقم السجل)", text(s.shippingCompanyId)],
    ["آخر سداد مسجل", date(s.lastPaymentDate, true)],
    ["نطاق البيانات", payments.length
      ? `جميع المدفوعات الحالية للشحنة: ${payments.length} حركة؛ من ${date(payments[0].paymentDate)} إلى ${date(payments[payments.length - 1].paymentDate)}. لا يتأثر بفلاتر لوحة المحاسبة.`
      : "جميع البيانات الحالية للشحنة؛ لا توجد دفعات مسجلة. لا يتأثر بفلاتر لوحة المحاسبة."],
  ], [51, 131]);

  section("ملخص الحساب وحالة السداد");
  if (statement.basis === "legacy-egp") {
    paragraphs(["أساس قديم: ملخص تاريخي بالجنيه فقط. لا تتوفر أرصدة مكونات موثوقة بالعملات الأصلية؛ لا تُستنتج أرصدة RMB من القيم المحولة."]);
    table(["العملة", "التكلفة", "المدفوع", "المتبقي"], [
      ["EGP", money(statement.legacy.cost), money(statement.legacy.paid), money(statement.legacy.remaining)],
    ]);
  } else {
    table(["بند التكلفة", "العملة", "التكلفة الصافية", "المدفوع", "المتبقي", "فائض السداد"],
      statement.components.map(c => [c.name, c.currency, money(c.cost), money(c.paid), money(c.remaining), money(c.surplus)]),
      [42, 16, 31, 31, 31, 31]);
    table(["العملة", "التكلفة", "المدفوع", "المتبقي المستحق", "الفائض"], (["RMB", "EGP"] as const).map(currency => {
      const components = statement.components.filter(c => c.currency === currency);
      return [currency, money(components.reduce((v, c) => v + c.cost, 0)),
        money(components.reduce((v, c) => v + c.paid, 0)),
        money(currency === "RMB" ? statement.settlement.remainingRmb : statement.settlement.remainingEgp),
        money(components.reduce((v, c) => v + c.surplus, 0))];
    }));
    paragraphs(["المتبقي والفائض معروضان لكل بند على حدة؛ فائض بند لا يسدد عجز بند آخر. الرصيد الصافي في جدول الحركات لا يحل محل المتبقي المستحق أعلاه."]);
    table(["ملخص الجنيه القديم (مرجعي فقط)", "القيمة EGP"], [
      ["التكلفة القديمة", money(statement.legacy.cost)],
      ["المدفوع التاريخي", money(statement.legacy.paid)],
      ["الرصيد القديم؛ ليس ديناً إضافياً", money(statement.legacy.remaining)],
    ], [131, 51]);
  }
  paragraphs([
    `حالة السداد المعتمدة: ${statement.settlement.status}؛ مسددة: ${statement.settlement.settled ? "نعم" : "لا"}.`,
    `المتبقي المعروض تقديرياً بالجنيه: ${money(statement.settlement.displayRemainingEgp)} EGP. قيمة عرض فقط، ليست ديناً إضافياً أو رصيداً جامعاً للعملتين.`,
    ...statement.notes,
  ]);

  section("ملخص محتويات الشحنة");
  table(["الأصناف", "الكراتين", "القطع", "القطع الناقصة"], [[
    String(statement.items.length),
    String(statement.items.reduce((v, i) => v + i.cartonsCtn, 0)),
    String(statement.items.reduce((v, i) => v + i.totalPiecesCou, 0)),
    String(statement.items.reduce((v, i) => v + i.missingPieces, 0)),
  ]]);
  table(["البند / الصنف / المورد", "الكمية", "البضاعة RMB", "الجمرك EGP", "التخريج EGP", "النواقص"],
    statement.items.length ? statement.items.map(i => [
      `${i.lineNo} / ${i.productName}\nالمورد: ${text(i.supplierName)}\nالوصف: ${text(i.description)}\nالمنشأ: ${text(i.countryOfOrigin)}`,
      `كراتين: ${i.cartonsCtn}\nقطع/كرتون: ${i.piecesPerCartonPcs}\nقطع: ${i.totalPiecesCou}`,
      `سعر القطعة: ${money(i.purchasePricePerPiecePriRmb, 4)}\nالإجمالي: ${money(i.totalPurchaseCostRmb)}`,
      `للكرتون: ${money(i.customsCostPerCartonEgp)}\nالإجمالي: ${money(i.totalCustomsCostEgp)}`,
      `للكرتون: ${money(i.takhreegCostPerCartonEgp)}\nالإجمالي: ${money(i.totalTakhreegCostEgp)}`,
      `قطع: ${i.missingPieces}\nالقيمة EGP: ${money(i.missingCostEgp)}`,
    ]) : [["لا توجد أصناف مسجلة", "—", "—", "—", "—", "—"]],
    [46, 25, 30, 28, 28, 25]);

  section("تفاصيل التكاليف المسجلة والتعديلات");
  paragraphs(["القيم التالية وصفية من سجل الشحنة؛ المصدر المعتمد للرصيد هو ملخص الحساب. الخصم مضمن بالفعل في تكلفة المكونات الصافية ولا يُطرح مجدداً. النواقص ليست دفعة نقدية ولا تخفيضاً إضافياً في هذا الكشف."]);
  table(["البند", "القيمة RMB المسجلة", "القيمة EGP المسجلة"], [
    ["البضاعة", money(s.purchaseCostRmb), money(s.purchaseCostEgp)],
    ["الشحن", money(s.shippingCostRmb), money(s.shippingCostEgp)],
    ["العمولة", money(s.commissionCostRmb), money(s.commissionCostEgp)],
    ["الجمرك", "—", money(s.customsCostEgp)],
    ["التخريج", "—", money(s.takhreegCostEgp)],
    ["الخصم الجزئي (تعديل، وليس سداداً)", money(s.partialDiscountRmb), "—"],
    ["النواقص المسجلة (للتوضيح فقط)", "—", money(s.totalMissingCostEgp)],
    ["الإجمالي التاريخي المسجل بالجنيه", "—", money(s.finalTotalCostEgp)],
    ["المدفوع التاريخي المسجل بالجنيه", "—", money(s.totalPaidEgp)],
    ["الرصيد التاريخي المسجل بالجنيه", "—", money(s.balanceEgp)],
  ], [84, 49, 49]);
  paragraphs([`ملاحظات الخصم: ${text(s.discountNotes)}`,
    `سعر تحويل تكلفة الشراء المسجل إلى الجنيه: ${money(s.purchaseRmbToEgpRate, 4)}. القيم التاريخية المحولة لا تنشئ دين فروق صرف.`]);

  const currencies = statement.basis === "legacy-egp" ? ["EGP"] as const : ["RMB", "EGP"] as const;
  for (const currency of currencies) {
    section(`جدول الحساب — ${currency}${statement.basis === "legacy-egp" ? " (الأساس القديم)" : ""}`);
    paragraphs(["أساس الرصيد: التكلفة الحالية، وليست قيود تكلفة مؤرخة. يبدأ من صفر ثم يثبت المستحق الحالي غير المؤرخ، ثم الدفعات بتسلسل تاريخي ثابت. هذا ليس تاريخاً محاسبياً مدققاً لتعديلات التكلفة. المدين تكلفة، والدائن سداد؛ الرصيد الموجب مستحق والسالب فائض صافٍ."]);
    const ledger = buildStatementLedger(statement, currency);
    const rows: string[][] = [];
    for (const entry of ledger.entries) {
      const p = entry.payment;
      rows.push(p ? [date(p.paymentDate), p.referenceNumber || `PAY-${p.id}`,
        `${entry.label}\nالطرف: ${text(p.partyName)}\nالطريقة: ${p.paymentMethod}\nالأصل: ${money(p.amountOriginal)} ${p.paymentCurrency}\nأساس التحويل: ${p.conversionBasis}${p.note ? `\nملاحظات: ${p.note}` : ""}`,
        "—", money(entry.credit), money(entry.balance)]
        : ["غير مؤرخ", "أساس حالي", entry.label, money(entry.debit), "—", money(entry.balance)]);
    }
    if (!ledger.entries.some(e => e.payment)) rows.push(["—", "—", "لا توجد دفعات لهذه العملة", "—", "—", money(ledger.closingBalance)]);
    rows.push(["—", "ختامي", statement.basis === "legacy-egp"
      ? "رصيد الدفعات المتاحة فقط؛ يُراجع مع الملخص القديم المعتمد"
      : "الرصيد الصافي على أساس التكلفة الحالية", "—", "—", money(ledger.closingBalance)]);
    table(["التاريخ", "المرجع", "البيان", "مدين", "دائن", "الرصيد"], rows, [25, 24, 61, 24, 24, 24]);
  }

  section("تفاصيل جميع المدفوعات والتخصيصات");
  paragraphs(["المبالغ الأصلية والمقابل التاريخي بالجنيه للشرح فقط؛ يُحتسب السداد مرة واحدة بعملة المكوّن. التخصيصات تفصيل لتوزيع الدفعة وليست حركات نقدية جديدة."]);
  table(["الدفعة", "تفاصيل السداد والتحويل والتخصيصات"], payments.length ? payments.map(p => [
    `PAY-${p.id}\n${date(p.paymentDate, true)}\nالمرجع: ${text(p.referenceNumber)}`,
    [
      `الطرف: ${text(p.partyName)}؛ النوع: ${text(p.partyType)}؛ رقم الطرف: ${text(p.partyId)}`,
      `البند: ${p.costComponent}؛ الطريقة: ${p.paymentMethod}؛ مستلم النقد: ${text(p.cashReceiverName)}`,
      `المبلغ الأصلي: ${money(p.amountOriginal)} ${p.paymentCurrency}`,
      `المعتمد بعملة المكون: ${money(p.componentAmount)} ${p.componentCurrency}؛ أساس التحويل: ${p.conversionBasis}`,
      `سعر الصرف المسجل إلى الجنيه: ${money(p.exchangeRateToEgp, 4)}؛ المقابل التاريخي: ${money(p.amountEgp)} EGP`,
      `الملاحظات: ${text(p.note)}`,
      `التخصيصات (تفسيرية فقط): ${p.allocations.length ? p.allocations.map(a =>
        `${a.supplierName} / ${a.component}: ${money(a.allocatedAmount)} ${a.currency} (رقم ${a.id})`).join("\n") : "لا توجد تخصيصات"}`,
      `المرفق: ${text(p.attachmentOriginalName)}؛ النوع: ${text(p.attachmentMimeType)}؛ الحجم: ${text(p.attachmentSize)}؛ تاريخ رفعه: ${date(p.attachmentUploadedAt, true)}`,
      ...(p.attachmentUrl ? [`مسار المرفق: ${p.attachmentUrl}`] : []),
      `تاريخ التسجيل: ${date(p.createdAt, true)}؛ آخر تحديث: ${date(p.updatedAt, true)}`,
      `معرف مسجل الدفعة: ${text(p.createdByUserId)}`,
    ].join("\n"),
  ]) : [["—", "لا توجد مدفوعات حالية مرتبطة بالشحنة."]], [43, 139]);

  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    doc.setPage(page);
    write("Tracker | إدارة الشحنات", 14, 12, 11, false);
    write("كشف حساب الشحنة", 196, 12, 17);
    write(`الشحنة: ${s.shipmentCode} | ${statement.reference}`, 196, 21, 10);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    doc.line(14, 26, 196, 26);
    doc.line(14, 279, 196, 279);
    write(`الشحنة: ${s.shipmentCode}`, 196, 286, 9);
    write(`Page ${page} / ${count}`, 14, 286, 9, false);
  }
  doc.setR2L(false);
  return doc;
}

export async function downloadShipmentAccountStatement(statement: ShipmentStatement) {
  const doc = await createShipmentAccountStatement(statement);
  const code = statement.shipment.shipmentCode.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  doc.save(`shipment-account-statement-${code}.pdf`);
}
