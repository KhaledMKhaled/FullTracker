import { forwardRef } from "react";
import type { ShipmentItem } from "@shared/schema";

const PAGE_W = 794;
const PAGE_H = 1123;
const ITEMS_PER_PAGE = 14;

const fmt = (value: number) =>
  new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const fmtInt = (value: number) => new Intl.NumberFormat("ar-EG").format(value);

const fmtDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ar-EG");
};

export interface ShipmentReportData {
  shipmentCode: string;
  shipmentName: string;
  purchaseDate: string;
  status: string;
  shippingCompanyName: string;
  customsInvoiceDate?: string | null;
  purchaseRate: number;
  items: Partial<ShipmentItem>[];
  shippingDate?: string | null;
  usdToRmbRate: number;
  shippingCostPerSqmUsd: number;
  shippingAreaSqm: number;
  shippingRmbToEgp: number;
  commissionRatePercent: number;
  commissionRmb: number;
  commissionEgp: number;
  shippingCostRmb: number;
  shippingCostEgp: number;
  totalPurchaseCostRmb: number;
  purchaseCostEgp: number;
  partialDiscountRmb: number;
  partialDiscountEgp: number;
  discountedPurchaseCostEgp: number;
  totalCustomsCostEgp: number;
  totalTakhreegCostEgp: number;
  finalTotalCostEgp: number;
  paidEgp: number | null;
}

const S = {
  page: {
    width: PAGE_W,
    height: PAGE_H,
    background: "#f6f8fb",
    direction: "rtl" as const,
    fontFamily: "'Cairo', 'Tajawal', sans-serif",
    color: "#1f2937",
    position: "relative" as const,
    padding: "28px 28px 46px 28px",
    boxSizing: "border-box" as const,
    overflow: "hidden",
  },
  card: {
    background: "#ffffff",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    marginBottom: 16,
    overflow: "hidden",
  },
  sectionTitle: {
    color: "#b91c1c",
    fontWeight: 700,
    fontSize: 15,
    padding: "12px 16px 8px 16px",
  },
  kvRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 16px",
    borderTop: "1px dashed #eef1f5",
    fontSize: 13,
  },
  kvLabel: { color: "#6b7280" },
  kvValue: { fontWeight: 600 },
  footer: {
    position: "absolute" as const,
    bottom: 14,
    left: 0,
    right: 0,
    textAlign: "center" as const,
    fontSize: 11,
    color: "#9ca3af",
  },
  th: {
    background: "#1e3a8a",
    color: "#ffffff",
    fontSize: 11,
    fontWeight: 700,
    padding: "8px 4px",
    textAlign: "center" as const,
    border: "1px solid #27428f",
    whiteSpace: "nowrap" as const,
  },
  td: {
    fontSize: 11,
    padding: "4px 4px",
    textAlign: "center" as const,
    border: "1px solid #e5e7eb",
    background: "#ffffff",
  },
};

function Footer({ page, total }: { page: number; total: number }) {
  return <div style={S.footer}>{page} / {total}</div>;
}

function KV({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={S.kvRow}>
      <span style={S.kvLabel}>{label}</span>
      <span style={{ ...S.kvValue, color: valueColor }}>{value}</span>
    </div>
  );
}

function StatCard({ label, value, bg, border, color }: { label: string; value: string; bg: string; border: string; color: string }) {
  return (
    <div style={{ flex: 1, background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "12px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 12, color, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

export const ShipmentPdfReport = forwardRef<HTMLDivElement, { data: ShipmentReportData }>(
  function ShipmentPdfReport({ data }, ref) {
    const d = data;
    const items = d.items;
    const totalCartons = items.reduce((s, it) => s + (it.cartonsCtn || 0), 0);
    const totalPieces = items.reduce((s, it) => s + (it.totalPiecesCou || 0), 0);
    const totalMissingPieces = items.reduce((s, it) => s + (it.missingPieces || 0), 0);
    const totalMissingCostEgp = items.reduce((s, it) => s + parseFloat(it.missingCostEgp || "0"), 0);
    const missingItems = items.filter((it) => (it.missingPieces || 0) > 0);

    const itemPages: Partial<ShipmentItem>[][] = [];
    for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
      itemPages.push(items.slice(i, i + ITEMS_PER_PAGE));
    }
    const totalPages = 1 + itemPages.length + 1;

    const totalRmb = d.totalPurchaseCostRmb - d.partialDiscountRmb + d.commissionRmb + d.shippingCostRmb;
    const remaining = d.paidEgp === null ? null : d.finalTotalCostEgp - d.paidEgp;

    let pageNo = 0;

    return (
      <div ref={ref} dir="rtl">
        {/* ---------- Page 1 ---------- */}
        <div data-pdf-page style={S.page}>
          <div
            style={{
              background: "linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)",
              borderRadius: 12,
              color: "#ffffff",
              padding: "22px 24px",
              marginBottom: 18,
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 800 }}>تقرير الشحنة الكامل</div>
            <div style={{ fontSize: 13, marginTop: 8, opacity: 0.95 }}>
              {d.shipmentCode} • {d.shipmentName} • {d.status}
            </div>
            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
              تم الإنشاء: {new Date().toLocaleString("ar-EG")}
            </div>
          </div>

          <div style={S.card}>
            <div style={S.sectionTitle}>١. بيانات الاستيراد الأساسية</div>
            <div style={{ display: "flex" }}>
              <div style={{ flex: 1 }}>
                <KV label="رقم الشحنة" value={d.shipmentCode} />
                <KV label="تاريخ الشراء" value={fmtDate(d.purchaseDate)} />
                <KV label="شركة الشحن" value={d.shippingCompanyName || "—"} />
                <KV label="سعر الصرف عند الشراء" value={`${fmt(d.purchaseRate)} ج.م/¥`} />
              </div>
              <div style={{ flex: 1 }}>
                <KV label="اسم الشحنة" value={d.shipmentName} />
                <KV label="الحالة" value={d.status} valueColor="#1d4ed8" />
                <KV label="تاريخ فاتورة الجمارك" value={fmtDate(d.customsInvoiceDate)} />
              </div>
            </div>
          </div>

          <div style={S.card}>
            <div style={S.sectionTitle}>٢. ملخص البنود</div>
            <div style={{ display: "flex", gap: 12, padding: "8px 16px 16px 16px" }}>
              <StatCard label="عدد الأصناف" value={fmtInt(items.length)} bg="#eff6ff" border="#bfdbfe" color="#1e3a8a" />
              <StatCard label="إجمالي الكراتين" value={fmtInt(totalCartons)} bg="#eff6ff" border="#bfdbfe" color="#1e3a8a" />
              <StatCard label="إجمالي القطع" value={fmtInt(totalPieces)} bg="#eff6ff" border="#bfdbfe" color="#1e3a8a" />
              <StatCard label="إجمالي النواقص" value={fmtInt(totalMissingPieces)} bg="#fef2f2" border="#fecaca" color="#b91c1c" />
            </div>
          </div>

          <div style={S.card}>
            <div style={S.sectionTitle}>٣. بيانات الشحن</div>
            <div style={{ display: "flex" }}>
              <div style={{ flex: 1 }}>
                <KV label="تاريخ الشحن" value={fmtDate(d.shippingDate)} />
                <KV label="سعر الدولار" value={`$ ${fmt(d.shippingCostPerSqmUsd)}`} />
                <KV label="نسبة العمولة" value={`٪${fmt(d.commissionRatePercent)}`} />
                <KV
                  label="إجمالي تكلفة الشحن"
                  value={`¥ ${fmt(d.shippingCostRmb)} (${fmt(d.shippingCostEgp)} ج.م)`}
                />
              </div>
              <div style={{ flex: 1 }}>
                <KV label="شركة الشحن" value={d.shippingCompanyName || "—"} />
                <KV label="سعر USD→RMB" value={fmt(d.usdToRmbRate)} />
                <KV label="المساحة (م²)" value={fmt(d.shippingAreaSqm)} />
                <KV label="سعر RMB→EGP عند الشحن" value={fmt(d.shippingRmbToEgp)} />
                <KV label="قيمة العمولة" value={`¥ ${fmt(d.commissionRmb)} (${fmt(d.commissionEgp)} ج.م)`} />
              </div>
            </div>
          </div>

          <div style={S.card}>
            <div style={S.sectionTitle}>٤. الجمارك والتخريج</div>
            <div style={{ display: "flex", gap: 12, padding: "8px 16px 16px 16px" }}>
              <StatCard label="إجمالي الجمارك" value={`${fmt(d.totalCustomsCostEgp)} ج.م`} bg="#fffbeb" border="#fde68a" color="#92400e" />
              <StatCard label="إجمالي التخريج" value={`${fmt(d.totalTakhreegCostEgp)} ج.م`} bg="#fffbeb" border="#fde68a" color="#92400e" />
              <StatCard label="تاريخ فاتورة الجمارك" value={fmtDate(d.customsInvoiceDate)} bg="#fffbeb" border="#fde68a" color="#92400e" />
            </div>
          </div>

          <Footer page={++pageNo} total={totalPages} />
        </div>

        {/* ---------- Item pages ---------- */}
        {itemPages.map((pageItems, pi) => {
          const startIdx = pi * ITEMS_PER_PAGE;
          const endIdx = startIdx + pageItems.length;
          pageNo++;
          return (
            <div data-pdf-page key={pi} style={S.page}>
              <div style={{ ...S.card, padding: "0 0 8px 0" }}>
                <div style={S.sectionTitle}>
                  {pi === 0
                    ? `٥. بنود الشحنة الكاملة (${fmtInt(items.length)} بند)`
                    : `٥. بنود الشحنة — تابع (${fmtInt(startIdx + 1)} - ${fmtInt(endIdx)})`}
                </div>
                <div style={{ padding: "0 10px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={S.th}>#</th>
                        <th style={S.th}>صورة</th>
                        <th style={{ ...S.th, minWidth: 90 }}>اسم الصنف</th>
                        <th style={S.th}>المنشأ</th>
                        <th style={S.th}>كراتين</th>
                        <th style={S.th}>قطع/كرتون</th>
                        <th style={S.th}>إجمالي القطع</th>
                        <th style={S.th}>سعر القطعة ¥</th>
                        <th style={S.th}>إجمالي ¥</th>
                        <th style={S.th}>جمارك ج.م</th>
                        <th style={S.th}>تخريج ج.م</th>
                        <th style={S.th}>نواقص</th>
                        <th style={S.th}>قيمة النواقص (ج.م)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((it, idx) => {
                        const missing = it.missingPieces || 0;
                        const missingCost = parseFloat(it.missingCostEgp || "0");
                        const pieces = it.totalPiecesCou || 0;
                        const cartons = it.cartonsCtn || 0;
                        const customs = pieces * parseFloat(it.customsCostPerCartonEgp?.toString() || "0");
                        const takhreeg = cartons * parseFloat(it.takhreegCostPerCartonEgp?.toString() || "0");
                        return (
                          <tr key={it.id || startIdx + idx}>
                            <td style={{ ...S.td, fontWeight: 700, background: "#f3f6fc" }}>{fmtInt(it.lineNo || startIdx + idx + 1)}</td>
                            <td style={{ ...S.td, padding: 2 }}>
                              {it.imageUrl ? (
                                <img
                                  src={it.imageUrl}
                                  alt=""
                                  style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, display: "block", margin: "0 auto" }}
                                  crossOrigin="anonymous"
                                />
                              ) : (
                                <div style={{ width: 44, height: 44, background: "#f3f4f6", borderRadius: 6, margin: "0 auto" }} />
                              )}
                            </td>
                            <td style={{ ...S.td, fontWeight: 600 }}>{it.productName || "بدون اسم"}</td>
                            <td style={S.td}>{it.countryOfOrigin || "الصين"}</td>
                            <td style={S.td}>{fmtInt(cartons)}</td>
                            <td style={S.td}>{fmtInt(it.piecesPerCartonPcs || 0)}</td>
                            <td style={S.td}>{fmtInt(pieces)}</td>
                            <td style={S.td}>{fmt(parseFloat(it.purchasePricePerPiecePriRmb?.toString() || "0"))}</td>
                            <td style={S.td}>{fmt(parseFloat(it.totalPurchaseCostRmb?.toString() || "0"))}</td>
                            <td style={S.td}>{fmt(customs)}</td>
                            <td style={S.td}>{fmt(takhreeg)}</td>
                            <td style={{ ...S.td, color: missing > 0 ? "#b91c1c" : undefined, fontWeight: missing > 0 ? 700 : undefined }}>
                              {missing > 0 ? fmtInt(missing) : "-"}
                            </td>
                            <td style={{ ...S.td, color: missingCost > 0 ? "#b91c1c" : undefined, fontWeight: missingCost > 0 ? 700 : undefined }}>
                              {missingCost > 0 ? fmt(missingCost) : "٠,٠٠"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <Footer page={pageNo} total={totalPages} />
            </div>
          );
        })}

        {/* ---------- Final page ---------- */}
        <div data-pdf-page style={S.page}>
          <div style={S.card}>
            <div style={S.sectionTitle}>٦. تفاصيل النواقص</div>
            <div style={{ padding: "0 10px 10px 10px" }}>
              {missingItems.length === 0 ? (
                <div style={{ padding: 16, fontSize: 13, color: "#16a34a", fontWeight: 600 }}>
                  لا توجد نواقص في هذه الشحنة
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={S.th}>#</th>
                      <th style={{ ...S.th, minWidth: 200 }}>اسم الصنف</th>
                      <th style={S.th}>إجمالي القطع</th>
                      <th style={S.th}>القطع الناقصة</th>
                      <th style={S.th}>قيمة النواقص (ج.م)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingItems.map((it, idx) => (
                      <tr key={it.id || idx}>
                        <td style={{ ...S.td, fontWeight: 700, background: "#f3f6fc" }}>{fmtInt(idx + 1)}</td>
                        <td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{it.productName || "بدون اسم"}</td>
                        <td style={S.td}>{fmtInt(it.totalPiecesCou || 0)}</td>
                        <td style={{ ...S.td, color: "#b91c1c", fontWeight: 700 }}>{fmtInt(it.missingPieces || 0)}</td>
                        <td style={{ ...S.td, color: "#b91c1c", fontWeight: 700 }}>{fmt(parseFloat(it.missingCostEgp || "0"))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div style={S.card}>
            <div style={S.sectionTitle}>٧. تفصيل التكاليف</div>
            <div>
              <KV label="تكلفة الشراء" value={`¥ ${fmt(d.totalPurchaseCostRmb)}    |    ${fmt(d.purchaseCostEgp)} ج.م`} />
              {d.partialDiscountRmb > 0 && (
                <>
                  <KV label="الخصم" value={`- ¥ ${fmt(d.partialDiscountRmb)}    |    - ${fmt(d.partialDiscountEgp)} ج.م`} valueColor="#b91c1c" />
                  <KV label="بعد الخصم" value={`¥ ${fmt(d.totalPurchaseCostRmb - d.partialDiscountRmb)}    |    ${fmt(d.discountedPurchaseCostEgp)} ج.م`} />
                </>
              )}
              <KV label="العمولة" value={`¥ ${fmt(d.commissionRmb)}    |    ${fmt(d.commissionEgp)} ج.م`} />
              <KV label="الشحن" value={`¥ ${fmt(d.shippingCostRmb)}    |    ${fmt(d.shippingCostEgp)} ج.م`} />
              <KV label="الجمارك" value={`—    |    ${fmt(d.totalCustomsCostEgp)} ج.م`} />
              <KV label="التخريج" value={`—    |    ${fmt(d.totalTakhreegCostEgp)} ج.م`} />
              {totalMissingCostEgp > 0 && (
                <KV label="خصم النواقص" value={`- ${fmt(totalMissingCostEgp)} ج.م`} valueColor="#b91c1c" />
              )}
              <div style={{ margin: "10px 16px", padding: "12px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: "#1d4ed8" }}>
                <span>الإجمالي بالرمبي</span>
                <span>¥ {fmt(totalRmb)}</span>
              </div>
              <div style={{ margin: "0 16px 16px 16px", padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, color: "#15803d" }}>
                <span>الإجمالي النهائي بالجنيه</span>
                <span>{fmt(d.finalTotalCostEgp)} ج.م</span>
              </div>
            </div>
          </div>

          <div style={S.card}>
            <div style={S.sectionTitle}>٨. ملخص السداد</div>
            <div style={{ display: "flex", gap: 12, padding: "8px 16px 16px 16px" }}>
              <StatCard label="الإجمالي النهائي" value={`${fmt(d.finalTotalCostEgp)} ج.م`} bg="#eff6ff" border="#bfdbfe" color="#1d4ed8" />
              <StatCard label="المسدد" value={d.paidEgp === null ? "—" : `${fmt(d.paidEgp)} ج.م`} bg="#f0fdf4" border="#bbf7d0" color="#15803d" />
              <StatCard label="المتبقي" value={remaining === null ? "—" : `${fmt(remaining)} ج.م`} bg="#fef2f2" border="#fecaca" color="#b91c1c" />
            </div>
          </div>

          <Footer page={totalPages} total={totalPages} />
        </div>
      </div>
    );
  }
);

export async function exportShipmentReportPdf(container: HTMLElement, fileName: string): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");
  const { jsPDF } = await import("jspdf");

  const pages = Array.from(container.querySelectorAll<HTMLElement>("[data-pdf-page]"));
  if (pages.length === 0) throw new Error("لا توجد صفحات للتصدير");

  const pdf = new jsPDF("p", "mm", "a4");
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], {
      scale: 2,
      useCORS: true,
      backgroundColor: "#f6f8fb",
      logging: false,
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, 0, pdfW, pdfH);
  }

  pdf.save(fileName);
}
