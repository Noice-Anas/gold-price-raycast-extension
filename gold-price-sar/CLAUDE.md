# CLAUDE.md — Gold Price SAR (Raycast extension)

Raycast extension showing the daily gold price in SAR per gram (24K/22K/21K/18K) plus 1/3/6/12-month averages. Goal: publish to the Raycast Store.

## Commands

Run from the `gold-price-sar/` directory:

- `npm run dev` — run the extension live in Raycast (`ray develop`).
- `npm run build` — bundle + typecheck (`ray build`).
- `npm run lint` / `npm run fix-lint` — validate + auto-fix (Prettier/ESLint/package.json/icons).
- `npm run publish` — open a Store submission PR (`npx @raycast/api@latest publish`).

Lint/build/publish require the Raycast app installed and the user signed in.

## Data source: metals.dev

- Free tier: **100 requests/month**, per-user API key (required preference `apiKey`). Historical is included in the free tier — it costs quota, not money.
- `GET /v1/latest?currency=SAR&unit=toz` → `metals.gold` = spot per troy ounce, already in SAR.
- `GET /v1/timeseries?start_date&end_date` → USD only, max **30 days per request**. Convert per day: `gold_sar = rates[date].metals.gold / rates[date].currencies.SAR`.

## Architecture (`src/`)

- `gold-price.tsx` — the single `view` command (List UI, karat dropdown).
- `lib/gold.ts` — karat/troy-ounce math (pure).
- `lib/dates.ts` — UTC ISO date helpers + 30-day chunking.
- `lib/api.ts` — metals.dev client (`fetchLatestGoldSar`, `fetchTimeseriesGoldSar`).
- `lib/history.ts` — rolling ~1-year daily series in LocalStorage; incremental sync + averages.
- `lib/data.ts` — orchestrates latest (30-min TTL cache) + history sync into one load.

## Quota strategy (keep it inside 100 req/mo)

- Latest spot: cached 30 min.
- History: completed days are immutable and cached permanently; only days since the last sync are refetched, and the whole sync is skipped while younger than a 12h TTL. First run pulls ~1 year in ~13 chunks; steady state ~1–2 requests/day.
- Averages are computed on the per-troy-ounce SAR value, then converted to per-gram/karat at render time (linear, so average-then-convert == convert-then-average).

## Publishing checklist

- Set `author` in `package.json` to the real Raycast handle (ESLint validates it against raycast.com — a placeholder fails lint).
- Add `metadata/` screenshots (2000×1250) before submitting; the CHANGELOG uses the `{PR_MERGE_DATE}` placeholder.
- `npm run build && npm run lint` must both pass, then `npm run publish`.
