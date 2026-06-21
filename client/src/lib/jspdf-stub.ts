// jspdf is blocked by Replit security policy - this is a no-op stub
export class jsPDF {
  internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
  setFontSize(_size: number) { return this; }
  text(_text: string, _x: number, _y: number, _opts?: any) { return this; }
  addImage(_img: string, _format: string, _x: number, _y: number, _w: number, _h: number) { return this; }
  addPage() { return this; }
  save(_filename: string) {
    console.warn("PDF export not available in this environment");
    alert("تصدير PDF غير متاح في هذه البيئة");
  }
  autoTable(_opts: any) { return this; }
}
export default { jsPDF };
