import { currencyLocale, DEFAULT_APPLICATION_CURRENCY } from "@/lib/currency";

export function formatMoney(cents: number, currency: string = DEFAULT_APPLICATION_CURRENCY) {
  return new Intl.NumberFormat(currencyLocale(currency), {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(cents / 100);
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}
