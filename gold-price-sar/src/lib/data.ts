/**
 * Orchestrates the data the command needs into a single load: the current spot
 * price (cached with a short TTL) plus the period averages derived from the
 * rolling history. Keeping the request-shaping here lets the UI stay declarative
 * and keeps every metals.dev call funnelled through the caching logic.
 *
 * The stored history is in USD (the API's native unit); this layer converts it
 * to SAR using the live USD->SAR rate returned by the latest endpoint.
 */

import { LocalStorage } from "@raycast/api";
import { fetchLatestGold, SAR_PER_USD_PEG } from "./api";
import { AVERAGE_WINDOWS_DAYS, computeAverages, loadStoredSeries, syncSeries } from "./history";
import { todayIso } from "./dates";

const LATEST_KEY = "gold-latest-sar";
/**
 * Serve a cached spot price for this long before hitting the API again (ms).
 * This is a daily tracker, so a few hours of staleness is fine and it keeps
 * casual re-opens from spending quota; "Refresh" always forces a live fetch.
 */
const LATEST_TTL_MS = 6 * 60 * 60 * 1000;

interface CachedLatest {
  pricePerTroyOunceSar: number;
  usdToSarRate: number;
  timestamp?: string;
  cachedAt: number;
}

/** A period average expressed in SAR, ready for the UI. */
export interface SarPeriodAverage {
  /** Window length in days (30/90/180/365). */
  days: number;
  /** Mean gold price per troy ounce in SAR over the window, or null if no data. */
  averagePerTroyOunceSar: number | null;
  /** Number of daily data points that fell inside the window. */
  sampleCount: number;
}

export interface GoldData {
  /** Current gold spot price per troy ounce, in SAR. */
  latestPerTroyOunceSar: number;
  /** Freshness of the spot price (from the API, or our cache time). */
  asOf: string;
  /** Previous close used for the day's change, in SAR, or null if unknown. */
  previousClosePerTroyOunceSar: number | null;
  /** Averages over 1M/3M/6M/1Y, per troy ounce in SAR. */
  averages: SarPeriodAverage[];
  /** Number of daily points backing the averages. */
  historyPoints: number;
  /** Set if the history sync failed; averages then come from cached data. */
  historyError?: string;
}

async function loadCachedLatest(): Promise<CachedLatest | null> {
  const raw = await LocalStorage.getItem<string>(LATEST_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedLatest;
  } catch {
    return null;
  }
}

async function getLatest(apiKey: string, force: boolean): Promise<CachedLatest> {
  const cached = await loadCachedLatest();
  if (!force && cached && typeof cached.usdToSarRate === "number" && Date.now() - cached.cachedAt < LATEST_TTL_MS) {
    return cached;
  }
  const { pricePerTroyOunceSar, usdToSarRate, timestamp } = await fetchLatestGold(apiKey);
  const fresh: CachedLatest = { pricePerTroyOunceSar, usdToSarRate, timestamp, cachedAt: Date.now() };
  await LocalStorage.setItem(LATEST_KEY, JSON.stringify(fresh));
  return fresh;
}

/** The most recent series close (USD/toz) strictly before today. */
function previousCloseUsd(series: Record<string, number>): number | null {
  const today = todayIso();
  const priorDates = Object.keys(series)
    .filter((date) => date < today)
    .sort();
  const last = priorDates[priorDates.length - 1];
  return last ? series[last] : null;
}

/**
 * Load everything the command renders. `force` bypasses the caches/TTLs.
 *
 * The current price and the history are loaded independently: the price is
 * required (its failure surfaces as an error), but a history failure — e.g. a
 * bad chunk or timeseries not being on the user's plan — must not hide the
 * price. In that case we fall back to whatever history is already cached.
 */
export async function loadGoldData(apiKey: string, force = false): Promise<GoldData> {
  // Kick off both together, but handle their failures separately.
  const latestPromise = getLatest(apiKey, force);
  const syncPromise = syncSeries(apiKey, { force }).then(
    (sync) => ({ series: sync.series as Record<string, number>, error: undefined as string | undefined }),
    async (err: Error) => ({ series: await loadStoredSeries(), error: err.message }),
  );

  const latest = await latestPromise; // if this rejects, the whole load fails (no price to show)
  const { series, error } = await syncPromise;

  const rate = latest.usdToSarRate || SAR_PER_USD_PEG;
  const prevCloseUsd = previousCloseUsd(series);
  const averages: SarPeriodAverage[] = computeAverages(series).map((avg) => ({
    days: avg.days,
    sampleCount: avg.sampleCount,
    averagePerTroyOunceSar: avg.averagePerTroyOunceUsd === null ? null : avg.averagePerTroyOunceUsd * rate,
  }));

  return {
    latestPerTroyOunceSar: latest.pricePerTroyOunceSar,
    asOf: latest.timestamp ?? new Date(latest.cachedAt).toISOString(),
    previousClosePerTroyOunceSar: prevCloseUsd === null ? null : prevCloseUsd * rate,
    averages,
    historyPoints: Object.keys(series).length,
    historyError: error,
  };
}

export { AVERAGE_WINDOWS_DAYS };
