# CLAUDE.md — Gold Price (Raycast extension)

Raycast extension showing the daily gold price per gram (24K/22K/21K/18K) plus 1/3/6/12-month averages. The display currency is currently SAR (fixed in `lib/currency.ts`); a user-selectable currency is a planned feature. Goal: publish to the Raycast Store.

## Commands

Run from the repository root:

- `npm run dev` — run the extension live in Raycast (`ray develop`).
- `npm run build` — bundle + typecheck (`ray build`).
- `npm run lint` / `npm run fix-lint` — validate + auto-fix (Prettier/ESLint/package.json/icons).
- `npm run publish` — open a Store submission PR (`npx @raycast/api@latest publish`).

Lint/build/publish require the Raycast app installed and the user signed in.

## Data source: metals.dev

- Free tier: **100 requests/month**, per-user API key (required preference `apiKey`). Historical is included in the free tier — it costs quota, not money.
- `GET /v1/latest?currency=<DEFAULT_CURRENCY>&unit=toz` → `metals.gold` = spot per troy ounce, already in the display currency; `currencies.USD` = value of 1 USD in that currency (used to convert the USD-only history).
- `GET /v1/timeseries?start_date&end_date` → **USD/toz only**, max **30 days per request**. Stored in USD and converted to the display currency downstream (see below).

## Architecture (`src/`)

- `gold-price.tsx` — the single `view` command (List UI, karat dropdown).
- `lib/gold.ts` — karat/troy-ounce math (pure).
- `lib/dates.ts` — UTC ISO date helpers + 30-day chunking.
- `lib/currency.ts` — `DEFAULT_CURRENCY` (single source of the display currency, currently `"SAR"`) + `formatCurrency(value, currency)`.
- `lib/api.ts` — metals.dev client (`fetchLatestGold(apiKey, currency)`, `fetchTimeseriesGoldUsd`).
- `lib/history.ts` — rolling ~1-year daily series in LocalStorage; incremental sync + averages (`PeriodAverageUsd`, USD-canonical).
- `lib/data.ts` — orchestrates latest (12h TTL cache) + history sync into one load; converts to the display currency (`PeriodAverage`).

## Currency: history is USD-canonical

`/v1/timeseries` returns gold in **USD/toz only** and its `currencies` map does NOT include most fiat currencies (live-verified). So history is stored in USD (`lib/history.ts`) and converted to the display currency at the boundary (`lib/data.ts`) using the USD→currency rate from `/latest` (`currencies.USD`, e.g. ≈ 3.75 for SAR), falling back to `SAR_PER_USD_PEG = 3.75` in `lib/api.ts`. `/latest?currency=<DEFAULT_CURRENCY>` gives `metals.gold` directly in the display currency. Symbols are currency-neutral (`pricePerTroyOunce`, `usdToLocalRate`, `averagePerTroyOunce`); the SAR peg is the only SAR-specific value and only applies while the currency is SAR.

## Quota strategy (keep it inside 100 req/mo)

- Latest spot: cached **12h** (`LATEST_TTL_MS`).
- History: completed days are immutable and cached permanently; only days since the last sync are refetched, and the whole sync is skipped while younger than a **12h** TTL. First run pulls ~1 year in ~13 chunks; steady state ~1–2 requests/day.
- Averages are computed on the per-troy-ounce USD value, converted to the display currency, then to per-gram/karat at render (all linear, so order is irrelevant).

## Interaction model (`gold-price.tsx`)

- **Enter** on any row → copy a descriptive line (`Action.CopyToClipboard`), e.g. `Gold price today (24K): 483.54 SAR per gram` or `Gold price 1 Month average (22K): 451.20 SAR per gram` (currency label from `DEFAULT_CURRENCY`). Helpers `copyTextCurrent` / `copyTextAverage` in `gold-price.tsx`.
- **⌘R** and **⌘↵** → hard refresh (bypasses caches/TTLs via a `forceRef` read inside the usePromise loader, passed as `loadGoldData(apiKey, force)`).
- Karat dropdown (search-bar accessory) re-derives the averages client-side; no refetch.

## Publishing checklist

- Set `author` in `package.json` to the real Raycast handle (ESLint validates it against raycast.com — a placeholder fails lint).
- Add `metadata/` screenshots (2000×1250) before submitting; the CHANGELOG uses the `{PR_MERGE_DATE}` placeholder.
- `npm run build && npm run lint` must both pass, then `npm run publish`.
