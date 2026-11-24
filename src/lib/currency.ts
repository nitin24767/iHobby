export const SUPPORTED_CURRENCIES = [
  { code: "USD", name: "US Dollar", locale: "en-US" },
  { code: "EUR", name: "Euro", locale: "en-IE" },
  { code: "GBP", name: "British Pound", locale: "en-GB" },
  { code: "INR", name: "Indian Rupee", locale: "en-IN" },
  { code: "AUD", name: "Australian Dollar", locale: "en-AU" },
  { code: "CAD", name: "Canadian Dollar", locale: "en-CA" },
  { code: "SGD", name: "Singapore Dollar", locale: "en-SG" },
  { code: "NZD", name: "New Zealand Dollar", locale: "en-NZ" },
  { code: "AED", name: "UAE Dirham", locale: "en-AE" },
  { code: "CHF", name: "Swiss Franc", locale: "de-CH" }
] as const;

export type ApplicationCurrency = (typeof SUPPORTED_CURRENCIES)[number]["code"];

export const DEFAULT_APPLICATION_CURRENCY: ApplicationCurrency = "INR";

export function isApplicationCurrency(value: unknown): value is ApplicationCurrency {
  return typeof value === "string" && SUPPORTED_CURRENCIES.some((currency) => currency.code === value);
}

export function currencyLocale(currency: string) {
  return SUPPORTED_CURRENCIES.find((item) => item.code === currency)?.locale ?? "en-US";
}
