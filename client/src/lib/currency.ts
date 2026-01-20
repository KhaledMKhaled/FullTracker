export const CURRENCY_LABELS = {
  EGP: "جنيه",
  RMB: "رممبي",
} as const;

const RMB_ALIASES = ["rmb", "cny", "yuan", "رممبي"];
const EGP_ALIASES = ["egp", "جنيه"];

export type CurrencyLabel = (typeof CURRENCY_LABELS)[keyof typeof CURRENCY_LABELS];

export function getCurrencyLabel(currency?: string): CurrencyLabel {
  if (!currency) return CURRENCY_LABELS.EGP;
  const normalized = currency.trim().toLowerCase();

  if (RMB_ALIASES.some((alias) => normalized.includes(alias))) {
    return CURRENCY_LABELS.RMB;
  }

  if (EGP_ALIASES.some((alias) => normalized.includes(alias))) {
    return CURRENCY_LABELS.EGP;
  }

  return CURRENCY_LABELS.EGP;
}

export function formatCurrencyValue(value: string | number | null | undefined) {
  const num = typeof value === "string" ? parseFloat(value) : value ?? 0;
  const safeValue = Number.isFinite(num) ? num : 0;

  return new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeValue);
}

export function formatCurrency(value: string | number | null | undefined, currency: string = "EGP") {
  const formatted = formatCurrencyValue(value);

  const label = getCurrencyLabel(currency);
  if (formatted.includes(label)) return formatted;

  return `${formatted} ${label}`;
}
