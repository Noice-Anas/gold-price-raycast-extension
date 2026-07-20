/**
 * Display-currency helpers. The currency is currently fixed to SAR; a future
 * preference will let the user pick it, at which point this constant is the
 * single place that value flows from into the API client and the UI.
 */

/** The currency prices are fetched in and displayed as. */
export const DEFAULT_CURRENCY = "SAR";

const formatters = new Map<string, Intl.NumberFormat>();

/** Format a number as a 2-decimal currency amount, e.g. "SAR 1,234.56". */
export function formatCurrency(value: number, currency: string = DEFAULT_CURRENCY): string {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(currency, formatter);
  }
  return formatter.format(value);
}
