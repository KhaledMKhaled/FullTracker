import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  PageOrientation,
  convertInchesToTwip,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
} from "docx";
import { writeFileSync } from "fs";

const RTL = true;
const FONT = "Cairo";

// ── Colour palette ────────────────────────────────────────────────────────────
const COLOR = {
  PRIMARY:    "1E3A5F",   // navy
  ACCENT:     "2563EB",   // blue
  LIGHT_BG:   "EFF6FF",   // pale blue
  ALT_ROW:    "F8FAFC",   // near-white
  HEADER_ROW: "1E3A5F",   // same as primary
  WHITE:      "FFFFFF",
  GRAY:       "64748B",
  TEXT:       "1E293B",
  BORDER:     "CBD5E1",
  GREEN_BG:   "F0FDF4",
  GREEN_TXT:  "166534",
  RED_TXT:    "991B1B",
  RED_BG:     "FEF2F2",
};

// ── Helper: paragraph ─────────────────────────────────────────────────────────
function para(text, opts = {}) {
  return new Paragraph({
    bidirectional: RTL,
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.RIGHT,
    spacing: { before: opts.spaceBefore ?? 60, after: opts.spaceAfter ?? 60 },
    indent: opts.indent ? { start: convertInchesToTwip(opts.indent) } : undefined,
    shading: opts.shading
      ? { type: ShadingType.SOLID, color: opts.shading, fill: opts.shading }
      : undefined,
    border: opts.border
      ? {
          left: { style: BorderStyle.SINGLE, size: 12, color: opts.border },
        }
      : undefined,
    children: [
      new TextRun({
        text,
        font: FONT,
        size: opts.size ?? 22,
        bold: opts.bold ?? false,
        color: opts.color ?? COLOR.TEXT,
        rtl: RTL,
      }),
    ],
  });
}

// ── Helper: section heading ───────────────────────────────────────────────────
function sectionHeading(text, level = 1) {
  const sizes   = { 1: 36, 2: 28, 3: 24 };
  const colors  = { 1: COLOR.PRIMARY, 2: COLOR.ACCENT, 3: COLOR.TEXT };
  const padding = { 1: 240, 2: 180, 3: 120 };
  return new Paragraph({
    bidirectional: RTL,
    alignment: AlignmentType.RIGHT,
    spacing: { before: padding[level], after: 120 },
    shading: level === 1
      ? { type: ShadingType.SOLID, color: COLOR.LIGHT_BG, fill: COLOR.LIGHT_BG }
      : undefined,
    border: level === 2
      ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR.ACCENT } }
      : undefined,
    children: [
      new TextRun({
        text: `${level === 1 ? "◆ " : level === 2 ? "● " : "○ "}${text}`,
        font: FONT,
        size: sizes[level],
        bold: true,
        color: colors[level],
        rtl: RTL,
      }),
    ],
  });
}

// ── Helper: bullet point ──────────────────────────────────────────────────────
function bullet(text, sub = false) {
  return new Paragraph({
    bidirectional: RTL,
    alignment: AlignmentType.RIGHT,
    spacing: { before: 40, after: 40 },
    indent: { start: convertInchesToTwip(sub ? 0.6 : 0.3) },
    children: [
      new TextRun({ text: sub ? `      ◦ ${text}` : `   • ${text}`, font: FONT, size: 20, color: COLOR.TEXT, rtl: RTL }),
    ],
  });
}

// ── Helper: separator ─────────────────────────────────────────────────────────
function separator() {
  return new Paragraph({
    bidirectional: RTL,
    spacing: { before: 120, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.BORDER } },
    children: [new TextRun({ text: " ", size: 4 })],
  });
}

function emptyLine(n = 1) {
  return Array.from({ length: n }, () =>
    new Paragraph({ children: [new TextRun({ text: " ", size: 14 })] })
  );
}

// ── Helper: simple table ──────────────────────────────────────────────────────
function makeTable(headers, rows, colWidths) {
  const totalW = 9000;
  const widths = colWidths ?? headers.map(() => Math.floor(totalW / headers.length));

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      new TableCell({
        width: { size: widths[i], type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: COLOR.HEADER_ROW, fill: COLOR.HEADER_ROW },
        children: [
          new Paragraph({
            bidirectional: RTL,
            alignment: AlignmentType.CENTER,
            spacing: { before: 60, after: 60 },
            children: [
              new TextRun({ text: h, font: FONT, size: 20, bold: true, color: COLOR.WHITE, rtl: RTL }),
            ],
          }),
        ],
      })
    ),
  });

  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map((cell, ci) =>
        new TableCell({
          width: { size: widths[ci], type: WidthType.DXA },
          shading: ri % 2 === 0
            ? { type: ShadingType.SOLID, color: COLOR.WHITE, fill: COLOR.WHITE }
            : { type: ShadingType.SOLID, color: COLOR.ALT_ROW, fill: COLOR.ALT_ROW },
          children: [
            new Paragraph({
              bidirectional: RTL,
              alignment: AlignmentType.RIGHT,
              spacing: { before: 50, after: 50 },
              children: [
                new TextRun({ text: String(cell), font: FONT, size: 19, color: COLOR.TEXT, rtl: RTL }),
              ],
            }),
          ],
        })
      ),
    })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
    borders: {
      top:           { style: BorderStyle.SINGLE, size: 4, color: COLOR.BORDER },
      bottom:        { style: BorderStyle.SINGLE, size: 4, color: COLOR.BORDER },
      left:          { style: BorderStyle.SINGLE, size: 4, color: COLOR.BORDER },
      right:         { style: BorderStyle.SINGLE, size: 4, color: COLOR.BORDER },
      insideH:       { style: BorderStyle.SINGLE, size: 2, color: COLOR.BORDER },
      insideV:       { style: BorderStyle.SINGLE, size: 2, color: COLOR.BORDER },
    },
  });
}

// ── Helper: info box ──────────────────────────────────────────────────────────
function infoBox(title, lines, color = COLOR.LIGHT_BG, borderColor = COLOR.ACCENT) {
  return [
    new Paragraph({
      bidirectional: RTL,
      alignment: AlignmentType.RIGHT,
      spacing: { before: 100, after: 0 },
      shading: { type: ShadingType.SOLID, color: borderColor, fill: borderColor },
      children: [
        new TextRun({ text: `  ${title}  `, font: FONT, size: 21, bold: true, color: COLOR.WHITE, rtl: RTL }),
      ],
    }),
    ...lines.map((line) =>
      new Paragraph({
        bidirectional: RTL,
        alignment: AlignmentType.RIGHT,
        spacing: { before: 30, after: 30 },
        shading: { type: ShadingType.SOLID, color: color, fill: color },
        indent: { start: convertInchesToTwip(0.2) },
        children: [
          new TextRun({ text: `• ${line}`, font: FONT, size: 20, color: COLOR.TEXT, rtl: RTL }),
        ],
      })
    ),
    new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: " ", size: 4 })] }),
  ];
}

// ══════════════════════════════════════════════════════════════════════════════
// DOCUMENT CONTENT
// ══════════════════════════════════════════════════════════════════════════════
const children = [

  // ── Cover ──────────────────────────────────────────────────────────────────
  new Paragraph({
    bidirectional: RTL, alignment: AlignmentType.CENTER,
    spacing: { before: 600, after: 60 },
    shading: { type: ShadingType.SOLID, color: COLOR.PRIMARY, fill: COLOR.PRIMARY },
    children: [
      new TextRun({ text: "وثيقة متطلبات المنتج (PRD)", font: FONT, size: 52, bold: true, color: COLOR.WHITE, rtl: RTL }),
    ],
  }),
  new Paragraph({
    bidirectional: RTL, alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    shading: { type: ShadingType.SOLID, color: COLOR.PRIMARY, fill: COLOR.PRIMARY },
    children: [
      new TextRun({ text: "وحدة: ملفات التجارة المحلية", font: FONT, size: 36, bold: true, color: "93C5FD", rtl: RTL }),
    ],
  }),
  new Paragraph({
    bidirectional: RTL, alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 60 },
    shading: { type: ShadingType.SOLID, color: COLOR.PRIMARY, fill: COLOR.PRIMARY },
    children: [
      new TextRun({ text: "Parties Module", font: FONT, size: 28, color: "93C5FD", rtl: RTL }),
    ],
  }),
  new Paragraph({
    bidirectional: RTL, alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 600 },
    shading: { type: ShadingType.SOLID, color: COLOR.PRIMARY, fill: COLOR.PRIMARY },
    children: [
      new TextRun({ text: "نظام Tracker — مايو 2026  |  الإصدار 1.0", font: FONT, size: 22, color: "BFDBFE", rtl: RTL }),
    ],
  }),

  // ── 1. نظرة عامة ──────────────────────────────────────────────────────────
  sectionHeading("١. نظرة عامة على الوحدة"),
  makeTable(
    ["القيمة", "العنصر"],
    [
      ["ملفات (التجار والعملاء)", "الاسم الرسمي"],
      ["التجارة المحلية ← الملفات", "المسار في القائمة"],
      ["/local-trade/parties", "مسار URL"],
      ["الإصدار 1.0 — مايو 2026", "الإصدار / التاريخ"],
    ],
    [5500, 3500]
  ),
  ...emptyLine(),
  para("وحدة الملفات هي العمود الفقري لنظام التجارة المحلية. تتيح إنشاء سجل مركزي لكل تاجر أو عميل تتعامل معه الشركة، وتجميع جميع تعاملاته من فواتير ومدفوعات وهوامش وتحصيلات وكشف حساب في ملف واحد متكامل.", { size: 21 }),

  ...emptyLine(),
  sectionHeading("الأهداف الرئيسية", 2),
  bullet("تتبع كل طرف تجاري (تاجر / عميل / مزدوج) بسجل كامل ومستقل"),
  bullet("معرفة الرصيد المستحق بدقة في أي وقت عبر دفتر قيود حي"),
  bullet("إدارة دورة الحياة الكاملة: من الفاتورة حتى التحصيل والتسوية"),
  bullet("توفير تنبيهات تلقائية لمواعيد التحصيل المتأخرة أو القادمة"),
  separator(),

  // ── 2. قائمة الملفات ──────────────────────────────────────────────────────
  sectionHeading("٢. صفحة قائمة الملفات"),
  para("المسار: /local-trade/parties", { size: 19, color: COLOR.GRAY }),
  ...emptyLine(),

  sectionHeading("٢.١ أعمدة الجدول", 2),
  makeTable(
    ["الوصف", "العمود"],
    [
      ["صورة الملف (Avatar) أو أيقونة افتراضية حسب النوع", "صورة"],
      ["الاسم الكامل للطرف التجاري", "الاسم"],
      ["تاجر / عميل / مزدوج — مع Badge ملون", "النوع"],
      ["اسم المحل أو الشركة إن وُجد", "المحل"],
      ["رقم الهاتف مع أيقونة", "الهاتف"],
      ["كاش / آجل — Badge", "نوع الدفع"],
      ["قيمة الحد أو 'غير محدود' (للآجل فقط)", "حد الائتمان"],
      ["الرصيد من دفتر القيود (أخضر = دائن، أحمر = مدين)", "الرصيد الحالي"],
      ["نشط / غير نشط — Badge", "الحالة"],
      ["زر تعديل (قلم) + زر عرض الملف (عين)", "إجراءات"],
    ],
    [6000, 3000]
  ),

  ...emptyLine(),
  sectionHeading("٢.٢ أدوات البحث والفلترة", 2),
  bullet("شريط بحث نصي: يعمل على الاسم، اسم المحل، ورقم الهاتف — فوري بدون ضغط زر"),
  bullet("تبويبات الفلترة: الكل | تاجر | عميل | مزدوج — مع دعم تمرير الفلتر عبر URL"),
  bullet("خيار 'النشطين فقط': Checkbox لإخفاء الملفات غير النشطة"),

  ...emptyLine(),
  sectionHeading("٢.٣ نموذج إضافة / تعديل ملف", 2),
  makeTable(
    ["ملاحظة", "إلزامي؟", "الحقل"],
    [
      ["تاجر / عميل / مزدوج", "نعم", "نوع الملف"],
      ["الاسم الكامل للطرف", "نعم", "الاسم"],
      ["اسم المتجر أو الشركة", "لا", "اسم المحل"],
      ["رقم الهاتف الأساسي", "لا", "الهاتف"],
      ["يمكن أن يختلف عن الهاتف", "لا", "واتساب"],
      ["المنطقة الجغرافية", "لا", "المنطقة"],
      ["اسم المحافظة", "لا", "المحافظة"],
      ["كاش / آجل", "نعم", "نوع الدفع"],
      ["يظهر فقط عند اختيار 'آجل'", "مشروط", "حد الائتمان"],
      ["مدين (عليه) / دائن (له)", "نعم", "نوع الرصيد الافتتاحي"],
      ["بالجنيه المصري", "نعم", "قيمة الرصيد الافتتاحي"],
      ["Switch تفعيل/تعطيل", "نعم", "نشط"],
    ],
    [4000, 2000, 3000]
  ),
  ...emptyLine(),
  ...infoBox(
    "ملاحظة: آلية الرصيد الافتتاحي",
    [
      "عند حفظ الملف يُنشئ النظام تلقائياً قيداً في دفتر القيود من نوع 'opening_balance'",
      "الرصيد الافتتاحي ليس حقلاً ثابتاً — بل قيد حي يدخل في حسابات الرصيد الإجمالي",
      "لا يمكن تعديله لاحقاً إلا بقيد تصحيح (adjustment)",
    ],
    COLOR.LIGHT_BG
  ),
  separator(),

  // ── 3. أنواع الملفات ──────────────────────────────────────────────────────
  sectionHeading("٣. أنواع الملفات (Party Types)"),
  makeTable(
    ["الوصف والتأثير", "الاسم العربي", "القيمة"],
    [
      ["يتم الشراء منه — فواتير شراء فقط", "تاجر", "merchant"],
      ["يتم البيع له — فواتير بيع فقط", "عميل", "customer"],
      ["يظهر في قائمة الشراء والبيع معاً", "مزدوج", "both"],
    ],
    [5000, 2000, 2000]
  ),
  separator(),

  // ── 4. صفحة الملف التفصيلية ──────────────────────────────────────────────
  sectionHeading("٤. صفحة الملف التفصيلية (Party Profile)"),
  para("المسار: /local-trade/parties/:id", { size: 19, color: COLOR.GRAY }),
  ...emptyLine(),
  para("هذه الصفحة هي المحور الرئيسي للعمل مع أي ملف. تحتوي على رأس صفحة لاصق (Sticky Header)، وبطاقات مؤشرات الأداء (KPI Cards)، وثماني تبويبات تغطي كل جوانب الملف.", { size: 21 }),

  ...emptyLine(),
  sectionHeading("٤.١ رأس الصفحة الثابت (Sticky Header)", 2),
  bullet("Breadcrumb: الملفات ← اسم الملف"),
  bullet("صورة الملف (Avatar) مع حرف الاسم الأول كـ Fallback"),
  bullet("اسم الملف + Badge النوع + Badge حالة التفعيل"),
  bullet("اسم المحل ورقم الهاتف"),

  ...emptyLine(),
  sectionHeading("٤.٢ أزرار الإجراءات السريعة (Quick Actions)", 2),
  makeTable(
    ["الوصف", "الزرار"],
    [
      ["يظهر فقط عند وجود تنبيهات — مع عداد أحمر", "🔔 الإشعارات"],
      ["يفتح نموذج تسجيل دفعة جديدة مباشرةً", "تسجيل دفعة"],
      ["ينتقل لصفحة إنشاء فاتورة مع تحديد الملف مسبقاً", "فاتورة جديدة"],
      ["يفتح نموذج تعديل بيانات الملف في نافذة منبثقة", "تعديل"],
      ["يظهر للمديرين فقط — يفتح نافذة تأكيد الحذف", "🗑 حذف (أحمر)"],
    ],
    [6000, 3000]
  ),

  ...emptyLine(),
  sectionHeading("٤.٣ بطاقات مؤشرات الأداء (KPI Cards)", 2),
  makeTable(
    ["ما تعرضه", "البطاقة"],
    [
      ["مجموع قيم جميع الفواتير بالجنيه", "إجمالي الفواتير"],
      ["مجموع المدفوعات المسجلة (أخضر)", "إجمالي المدفوع"],
      ["الرصيد الحالي مع توصيف (عليه/له) بالألوان", "المتبقي"],
      ["مبلغ الهوامش قيد الفحص (برتقالي)", "تحت الفحص"],
      ["تاريخ آخر فاتورة صدرت للملف", "آخر فاتورة"],
      ["تاريخ آخر عملية تحصيل مسجلة", "آخر تحصيل"],
    ],
    [6000, 3000]
  ),
  ...emptyLine(),
  ...infoBox(
    "آلية حساب الرصيد",
    [
      "الرصيد لا يُؤخذ من حقل ثابت — بل يُحسب ديناميكياً من دفتر القيود (partyLedgerEntries)",
      "القيد الموجب (+) = مدين (الطرف مدين لنا)",
      "القيد السالب (−) = دائن (نحن مدينون للطرف)",
      "الحساب يشمل الموسم الحالي فقط، والمواسم السابقة محفوظة في الأرشيف",
    ],
    COLOR.GREEN_BG,
    COLOR.ACCENT
  ),
  separator(),

  // ── 5. التبويبات الثمانية ─────────────────────────────────────────────────
  sectionHeading("٥. التبويبات الثمانية"),
  makeTable(
    ["المحتوى الرئيسي", "اسم التبويب", "#"],
    [
      ["معلومات الملف + تنبيهات التحصيل + تسوية الموسم", "نظرة عامة", "١"],
      ["قائمة جميع الفواتير مع فلاتر الحالة والنوع", "الفواتير", "٢"],
      ["جميع الدفعات المسجلة مع التفاصيل الكاملة", "المدفوعات", "٣"],
      ["حالات الهامش والنواقص الناتجة عن الاستلام", "الهوامش", "٤"],
      ["دفتر القيود الكامل بترتيب زمني + تصدير", "كشف الحساب", "٥"],
      ["المواسم التجارية السابقة والحالية", "الأرشيف", "٦"],
      ["مواعيد التحصيل (٤ خانات) مع التنبيهات", "التحصيل", "٧"],
      ["Timeline زمني لجميع الأنشطة", "الحركات", "٨"],
    ],
    [5500, 2500, 1000]
  ),

  ...emptyLine(),
  // ── 5.1 نظرة عامة
  sectionHeading("٥.١ تبويب: نظرة عامة", 2),
  bullet("لوحة التنبيهات: بطاقة صفراء للتحصيل القادم، حمراء للمتأخر، مع زر إغلاق لكل تنبيه"),
  bullet("بيانات الملف التفصيلية كاملة: النوع، الاسم، المحل، الهاتف، الواتساب، العنوان، نوع الدفع"),
  bullet("ملخص مالي للموسم الحالي: إجمالي الفواتير / المدفوعات / الرصيد المتبقي"),
  bullet("زر 'تسوية الموسم': يغلق الموسم الحالي ويرحّل الرصيد للموسم الجديد"),
  bullet("شرط التسوية: لا يسمح بها إلا إذا كان الرصيد صفراً", true),

  ...emptyLine(),
  // ── 5.2 الفواتير
  sectionHeading("٥.٢ تبويب: الفواتير", 2),
  makeTable(
    ["الوصف", "العمود"],
    [
      ["رقم الفاتورة التلقائي (مثال: 10001-02052026)", "الرقم المرجعي"],
      ["تاريخ إصدار الفاتورة", "التاريخ"],
      ["شراء / بيع / تسوية / مرتجع", "النوع"],
      ["مسودة / منشورة / مستلمة / مؤرشفة", "الحالة"],
      ["إجمالي قيمة الفاتورة بالجنيه المصري", "الإجمالي"],
      ["المبلغ المدفوع من هذه الفاتورة", "المدفوع"],
      ["الفرق = الإجمالي − المدفوع", "المتبقي"],
      ["مسدد / جزئي / غير مسدد", "حالة السداد"],
    ],
    [5500, 3500]
  ),

  ...emptyLine(),
  sectionHeading("دورة حياة الفاتورة:", 3),
  bullet("مسودة (draft) ← منشورة (posted) ← مستلمة (received) ← مؤرشفة (archived)"),
  bullet("'مستلمة': إدخال الكميات الفعلية لكل سطر — الكميات الفعلية فقط تؤثر على المخزون"),
  bullet("أي نقص بين المطلوب والمستلم يُنشئ حالة هامش تلقائياً"),

  ...emptyLine(),
  makeTable(
    ["التأثير على الرصيد والمخزون", "النوع العربي", "النوع"],
    [
      ["يُضيف للمخزون، يرفع رصيد الملف (مدين للتاجر)", "شراء", "purchase"],
      ["يُنقص من المخزون، يرفع رصيد العميل (مدين لنا)", "بيع", "sale"],
      ["يصفّر الرصيد ويؤرشف الموسم الحالي", "تسوية", "settlement"],
      ["يعكس تأثير الفاتورة الأصلية على الرصيد والمخزون", "مرتجع", "return"],
    ],
    [5000, 2000, 2000]
  ),

  ...emptyLine(),
  // ── 5.3 المدفوعات
  sectionHeading("٥.٣ تبويب: المدفوعات", 2),
  bullet("يعرض جميع المدفوعات المسجلة مع: التاريخ، المبلغ، طريقة الدفع، المستلم، الرقم المرجعي"),
  bullet("طرق الدفع المتاحة: نقدي، فودافون كاش، إنستاباي، تحويل بنكي، أخرى"),
  bullet("ربط الدفعة بفاتورة: يُعبئ المبلغ تلقائياً بالمتبقي من الفاتورة المختارة"),
  bullet("بعد الحفظ تتحدث حالة الفاتورة: مسدد / جزئي — حسب المبلغ"),
  bullet("دعم إرفاق مستند (صورة أو ملف) كإثبات للدفعة"),

  ...emptyLine(),
  // ── 5.4 الهوامش
  sectionHeading("٥.٤ تبويب: الهوامش", 2),
  bullet("يعرض حالات الهامش الناتجة عن نواقص عند استلام الفواتير"),
  bullet("كل حالة تحتوي: الفاتورة المصدر، الصنف، الكميات الناقصة، المبلغ، الحالة"),
  bullet("حالات الحل: قبول مرتجع / استبدال / خصم من القيمة / تالف / رفض"),
  bullet("فلتر الحالة: تحت الفحص / تم الحل"),

  ...emptyLine(),
  // ── 5.5 كشف الحساب
  sectionHeading("٥.٥ تبويب: كشف الحساب", 2),
  bullet("دفتر القيود الكامل بترتيب زمني — يعرض كل معاملة مالية مع رصيدها التراكمي"),
  bullet("أنواع القيود: رصيد افتتاحي / فاتورة / دفعة / إشعار / تسوية"),
  bullet("تصدير PDF: بدعم كامل للعربية RTL للطباعة أو المشاركة"),
  bullet("تصدير CSV: لاستيراده في Excel أو Google Sheets"),

  ...emptyLine(),
  // ── 5.6 الأرشيف
  sectionHeading("٥.٦ تبويب: الأرشيف", 2),
  bullet("يعرض قائمة المواسم التجارية (الحالي والسابقة) مع: الاسم، تاريخ البداية/الإغلاق، الرصيد الافتتاحي"),
  bullet("الموسم = دورة تجارية (سنة مالية أو موسم موضة)"),
  bullet("عند تسوية موسم: يُغلق ويبدأ موسم جديد بالرصيد المرحَّل"),

  ...emptyLine(),
  // ── 5.7 التحصيل
  sectionHeading("٥.٧ تبويب: التحصيل", 2),
  bullet("يتيح تسجيل حتى ٤ مواعيد تحصيل لكل ملف"),
  bullet("حقول كل موعد: تاريخ التحصيل، المبلغ المتوقع، ملاحظات، حالة (معلق/تم/مؤجل)"),
  bullet("تنبيه أصفر: إذا كان الموعد اليوم أو خلال ٣ أيام"),
  bullet("تنبيه أحمر: إذا مضى الموعد ولم يُجمع (overdue)"),
  bullet("زر 'تم التحصيل': يفتح نموذج دفعة مُعبأ مسبقاً بمبلغ وتاريخ التحصيل"),
  bullet("زر إرسال تذكير: يُسجل وقت الإرسال ويمنع التكرار"),

  ...emptyLine(),
  // ── 5.8 الحركات
  sectionHeading("٥.٨ تبويب: الحركات (Timeline)", 2),
  bullet("عرض زمني كرونولوجي لجميع الأنشطة: فواتير، مدفوعات، هوامش، تحصيلات، تسويات"),
  bullet("كل عنصر يعرض: التاريخ والوقت، نوع النشاط، التفاصيل، اسم المستخدم المنفِّذ"),
  separator(),

  // ── 6. حذف الملف ──────────────────────────────────────────────────────────
  sectionHeading("٦. خاصية حذف الملف (للمديرين فقط)"),
  ...infoBox(
    "تحذير: هذه العملية نهائية ولا يمكن التراجع عنها",
    [
      "الحذف يشمل جميع البيانات المرتبطة بالملف",
      "يُسجل الحذف في سجل التدقيق قبل التنفيذ",
      "متاح للمديرين فقط — لا يظهر الزرار لأي دور آخر",
    ],
    COLOR.RED_BG,
    "DC2626"
  ),
  ...emptyLine(),
  sectionHeading("ترتيب الحذف التسلسلي من قاعدة البيانات:", 2),
  makeTable(
    ["السبب", "الجدول", "الترتيب"],
    [
      ["تفادي FK violation — الجدول الأبعد عن الجذر أولاً", "party_ledger_entries — دفتر القيود", "١"],
      ["لا تعتمد على جداول أخرى غير الملف", "local_payments — المدفوعات", "٢"],
      ["تعتمد على الفواتير — تُحذف قبلها", "local_invoice_lines — بنود الفواتير", "٣"],
      ["تعتمد على الملف مباشرةً", "local_invoices — الفواتير", "٤"],
      ["تعتمد على الملف مباشرةً", "return_cases — حالات الهامش", "٥"],
      ["تعتمد على الملف مباشرةً", "party_collections — التحصيلات", "٦"],
      ["تعتمد على الملف مباشرةً", "party_seasons — المواسم", "٧"],
      ["الجذر — يُحذف أخيراً", "parties — الملف نفسه", "٨"],
    ],
    [4500, 3000, 1500]
  ),
  separator(),

  // ── 7. الصلاحيات ──────────────────────────────────────────────────────────
  sectionHeading("٧. جدول الصلاحيات (RBAC)"),
  makeTable(
    ["مشاهد", "مسؤول مخزون", "محاسب", "مدير", "العملية"],
    [
      ["✓", "✓", "✓", "✓", "عرض قائمة الملفات"],
      ["✓", "✓", "✓", "✓", "عرض صفحة الملف التفصيلية"],
      ["✗", "✓", "✓", "✓", "إضافة ملف جديد"],
      ["✗", "✓", "✓", "✓", "تعديل بيانات ملف"],
      ["✗", "✗", "✗", "✓", "حذف ملف (نهائي)"],
      ["✗", "✗", "✓", "✓", "تسجيل دفعة"],
      ["✗", "✓", "✓", "✓", "إنشاء فاتورة"],
      ["✗", "✓", "✓", "✓", "استلام فاتورة"],
      ["✗", "✗", "✓", "✓", "تسوية موسم"],
      ["✗", "✗", "✓", "✓", "إدارة التحصيل"],
      ["✓", "✓", "✓", "✓", "تصدير كشف الحساب"],
    ],
    [1800, 2000, 1800, 1800, 2600]
  ),
  separator(),

  // ── 8. قاعدة البيانات ─────────────────────────────────────────────────────
  sectionHeading("٨. بنية قاعدة البيانات"),

  sectionHeading("٨.١ جدول parties — الملفات الرئيسي", 2),
  makeTable(
    ["الوصف", "النوع", "الحقل"],
    [
      ["معرف تلقائي متسلسل", "integer (PK)", "id"],
      ["merchant | customer | both", "varchar(20)", "type"],
      ["الاسم الكامل (مطلوب)", "varchar(255)", "name"],
      ["رابط صورة الملف", "varchar", "image_url"],
      ["رقم الهاتف الأساسي", "varchar(50)", "phone"],
      ["رقم واتساب", "varchar(50)", "whatsapp"],
      ["اسم المحل أو الشركة", "varchar(255)", "shop_name"],
      ["المنطقة الجغرافية", "varchar(255)", "address_area"],
      ["اسم المحافظة", "varchar(255)", "address_governorate"],
      ["cash | credit", "varchar(20)", "payment_terms"],
      ["unlimited | limited", "varchar(20)", "credit_limit_mode"],
      ["قيمة حد الائتمان", "decimal(15,2)", "credit_limit_amount_egp"],
      ["debit | credit", "varchar(20)", "opening_balance_type"],
      ["قيمة الرصيد الافتتاحي", "decimal(15,2)", "opening_balance_egp"],
      ["نشط / غير نشط", "boolean", "is_active"],
    ],
    [4500, 2500, 2000]
  ),

  ...emptyLine(),
  sectionHeading("٨.٢ الجداول المرتبطة", 2),
  makeTable(
    ["الغرض", "الجدول"],
    [
      ["المواسم التجارية للملف", "party_seasons"],
      ["مواعيد التحصيل — ٤ خانات لكل ملف", "party_collections"],
      ["دفتر القيود المحاسبي الكامل", "party_ledger_entries"],
      ["الفواتير (شراء/بيع/تسوية/مرتجع)", "local_invoices"],
      ["بنود الفواتير (الأصناف والكميات)", "local_invoice_lines"],
      ["المدفوعات المسجلة مع طرق الدفع", "local_payments"],
      ["حالات الهامش والنواقص", "return_cases"],
      ["التنبيهات المرتبطة بمواعيد التحصيل", "notifications"],
    ],
    [5000, 4000]
  ),
  separator(),

  // ── 9. API Endpoints ──────────────────────────────────────────────────────
  sectionHeading("٩. نقاط الـ API المرتبطة بالملفات"),
  makeTable(
    ["الوظيفة", "الـ Endpoint", "الطريقة"],
    [
      ["جلب كل الملفات مع الفلاتر", "/api/local-trade/parties", "GET"],
      ["جلب ملف واحد بالـ ID", "/api/local-trade/parties/:id", "GET"],
      ["جلب الملف مع ملخص الـ KPIs", "/api/local-trade/parties/:id/profile", "GET"],
      ["جلب مؤشرات الأداء السريعة", "/api/local-trade/parties/:id/summary", "GET"],
      ["إنشاء ملف جديد", "/api/local-trade/parties", "POST"],
      ["تعديل بيانات ملف موجود", "/api/local-trade/parties/:id", "PUT"],
      ["حذف ملف (مدير فقط)", "/api/local-trade/parties/:id", "DELETE"],
      ["جلب الرصيد الحالي", "/api/local-trade/parties/:id/balance", "GET"],
      ["جلب مواعيد التحصيل", "/api/local-trade/parties/:id/collections", "GET"],
      ["تحديث مواعيد التحصيل", "/api/local-trade/parties/:id/collections", "PUT"],
      ["تغيير حالة موعد تحصيل", "/api/local-trade/collections/:id/status", "PATCH"],
      ["جلب الحركات الزمنية", "/api/local-trade/parties/:id/timeline", "GET"],
      ["تسوية موسم", "/api/local-trade/settlements", "POST"],
    ],
    [4000, 3500, 1500]
  ),
  separator(),

  // ── 10. القواعد التجارية ──────────────────────────────────────────────────
  sectionHeading("١٠. القواعد والقيود التجارية (Business Rules)"),

  sectionHeading("١٠.١ قواعد الرصيد", 2),
  bullet("الرصيد يُحسب دائماً من القيود — وليس من حقول ثابتة في جدول الملفات"),
  bullet("رصيد موجب = مدين (الطرف مدين لنا)  |  رصيد سالب = دائن (نحن مدينون)"),
  bullet("الرصيد الافتتاحي قيد حي يدخل في الحسابات كأي قيد آخر"),

  sectionHeading("١٠.٢ قواعد التسوية", 2),
  bullet("لا تسوية إلا إذا كان الرصيد صفراً بالضبط"),
  bullet("عند التسوية: الموسم يُغلق وينشأ موسم جديد بالرصيد المرحَّل"),

  sectionHeading("١٠.٣ قواعد حد الائتمان", 2),
  bullet("ينطبق فقط على الملفات ذات نوع الدفع 'آجل'"),
  bullet("إذا كان الحد 'محدود': لا يُسمح بفواتير تتجاوز القيمة المحددة"),

  sectionHeading("١٠.٤ قواعد الفواتير", 2),
  bullet("كل فاتورة منشورة تُنشئ قيداً تلقائياً في دفتر القيود"),
  bullet("الكميات الفعلية المستلمة فقط هي التي تؤثر على المخزون"),
  bullet("أي نقص عند الاستلام يُنشئ حالة هامش تلقائياً بالفرق"),
  separator(),

  // ── 11. معايير الواجهة ────────────────────────────────────────────────────
  sectionHeading("١١. تجربة المستخدم (UX) ومعايير الواجهة"),
  makeTable(
    ["القيمة / التطبيق", "المعيار"],
    [
      ["عربية كاملة في كل الشاشات والنوافذ", "اللغة والاتجاه"],
      ["Cairo و Tajawal", "الخطوط"],
      ["يظل ظاهراً عند التمرير (Sticky)", "رأس الصفحة"],
      ["Skeleton loaders أثناء جلب البيانات", "حالة التحميل"],
      ["Toast notifications للنجاح والفشل", "الإشعارات"],
      ["أخضر = دائن/مسدد | أحمر = مدين/متأخر | أصفر = قيد الفحص", "دلالة الألوان"],
      ["جنيه مصري (ج.م) مع تنسيق أرقام عربي", "العملة"],
      ["DD/MM/YYYY بالتقويم الميلادي", "تنسيق التاريخ"],
    ],
    [6000, 3000]
  ),
  separator(),

  // ── 12. الملفات البرمجية ──────────────────────────────────────────────────
  sectionHeading("١٢. الملفات البرمجية المرتبطة"),
  sectionHeading("الواجهة الأمامية (Frontend)", 2),
  makeTable(
    ["الوظيفة", "المسار"],
    [
      ["صفحة قائمة الملفات", "client/src/pages/local-trade/parties.tsx"],
      ["صفحة الملف التفصيلية (٨ تبويبات)", "client/src/pages/local-trade/party-profile.tsx"],
      ["صفحة إنشاء فاتورة جديدة", "client/src/pages/local-trade/create-invoice.tsx"],
      ["جميع الـ Hooks (API calls)", "client/src/hooks/use-local-trade.ts"],
    ],
    [4000, 5000]
  ),
  ...emptyLine(),
  sectionHeading("الواجهة الخلفية (Backend)", 2),
  makeTable(
    ["الوظيفة", "المسار"],
    [
      ["تعريف جميع الـ API Endpoints", "server/routes.ts"],
      ["جميع عمليات قاعدة البيانات (CRUD)", "server/storage.ts"],
      ["تعريف الجداول والعلاقات (Drizzle ORM)", "shared/schema.ts"],
    ],
    [4000, 5000]
  ),
  separator(),

  // ── ملخص تنفيذي ───────────────────────────────────────────────────────────
  sectionHeading("١٣. الملخص التنفيذي"),
  ...emptyLine(),
  para("وحدة الملفات توفر نظاماً متكاملاً لإدارة الأطراف التجارية يشمل:", { size: 22, bold: true }),
  ...emptyLine(),
  bullet("إدارة البيانات الأساسية (إنشاء / تعديل / حذف) مع صلاحيات محكمة"),
  bullet("٣ أنواع من الملفات (تاجر / عميل / مزدوج) لمرونة كاملة في إدارة العلاقات"),
  bullet("نظام محاسبي بقيود مزدوجة لضمان دقة الأرصدة في كل وقت"),
  bullet("دورة فاتورة كاملة من الإصدار حتى الاستلام مع تتبع النقص التلقائي"),
  bullet("نظام تحصيل ذكي مع تنبيهات تلقائية للمواعيد القادمة والمتأخرة"),
  bullet("مواسم تجارية لتنظيم دورات العمل السنوية وأرشفتها بشكل منظم"),
  bullet("كشف حساب قابل للتصدير PDF/CSV بدعم كامل للعربية RTL"),
  bullet("حذف آمن بتسلسل مضبوط وسجل تدقيق للمساءلة الكاملة"),

  ...emptyLine(2),
  new Paragraph({
    bidirectional: RTL,
    alignment: AlignmentType.CENTER,
    shading: { type: ShadingType.SOLID, color: COLOR.PRIMARY, fill: COLOR.PRIMARY },
    spacing: { before: 240, after: 0 },
    children: [
      new TextRun({ text: "نهاية الوثيقة  —  PRD ملفات التجارة المحلية  —  الإصدار 1.0  —  مايو 2026", font: FONT, size: 20, color: COLOR.WHITE, rtl: RTL }),
    ],
  }),
];

// ── Build document ────────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Tracker System",
  title:   "PRD — وحدة ملفات التجارة المحلية",
  description: "وثيقة متطلبات المنتج لوحدة ملفات التجارة المحلية في نظام Tracker",
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 22, color: COLOR.TEXT },
        paragraph: { spacing: { after: 60 }, bidirectional: true },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: convertInchesToTwip(8.5), height: convertInchesToTwip(11) },
          margin: {
            top:    convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left:   convertInchesToTwip(1.2),
            right:  convertInchesToTwip(1.2),
          },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              bidirectional: RTL,
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "صفحة ", font: FONT, size: 18, color: COLOR.GRAY, rtl: RTL }),
                new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: COLOR.GRAY }),
                new TextRun({ text: "  |  PRD — ملفات التجارة المحلية  |  نظام Tracker", font: FONT, size: 18, color: COLOR.GRAY, rtl: RTL }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync("PRD_ملفات_التجارة_المحلية.docx", buffer);
console.log("✅  تم إنشاء الملف: PRD_ملفات_التجارة_المحلية.docx");
