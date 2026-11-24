import { afterEach, describe, expect, it } from "vitest";
import { currencyLocale, DEFAULT_APPLICATION_CURRENCY, isApplicationCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/money";

describe("application currency", () => {
  afterEach(() => {
    delete process.env.APP_CURRENCY;
  });

  it("accepts supported ISO currencies and rejects unsupported values", () => {
    expect(isApplicationCurrency("INR")).toBe(true);
    expect(isApplicationCurrency("EUR")).toBe(true);
    expect(isApplicationCurrency("JPY")).toBe(false);
    expect(isApplicationCurrency("usd")).toBe(false);
  });

  it("formats minor units with the currency locale", () => {
    expect(DEFAULT_APPLICATION_CURRENCY).toBe("INR");
    expect(formatMoney(123450)).toContain("₹");
    expect(currencyLocale("INR")).toBe("en-IN");
    expect(formatMoney(123450, "INR")).toContain("₹");
    expect(formatMoney(123450, "EUR")).toContain("€");
  });
});
