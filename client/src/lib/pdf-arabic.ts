import type { jsPDF } from "jspdf";
import amiriFontUrl from "@/assets/fonts/Amiri-Regular.ttf?url";

let cachedFontBase64: string | null = null;

async function loadAmiriBase64(): Promise<string> {
  if (cachedFontBase64) return cachedFontBase64;
  const res = await fetch(amiriFontUrl);
  if (!res.ok) throw new Error("تعذر تحميل الخط العربي");
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  cachedFontBase64 = btoa(binary);
  return cachedFontBase64;
}

export async function registerArabicFont(doc: jsPDF): Promise<void> {
  const base64 = await loadAmiriBase64();
  doc.addFileToVFS("Amiri-Regular.ttf", base64);
  doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
  doc.setFont("Amiri", "normal");
}
