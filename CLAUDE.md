# CLAUDE.md — Gold Price (Raycast extension)

Raycast extension showing the daily gold price per gram (24K/22K/21K/18K) plus 1/3/6/12-month averages. The display currency is user-selectable via the `currency` preference (SAR default; options SAR/AED/KWD/QAR/BHD/OMR/USD/EUR/GBP), threaded from `gold-price.tsx` through `loadGoldData`. Goal: publish to the Raycast Store.

## Commands

Run from the repository root:

- `npm run dev` — run the extension live in Raycast (`ray develop`).
- `npm run build` — bundle + typecheck (`ray build`).
- `npm run lint` / `npm run fix-lint` — validate + auto-fix (Prettier/ESLint/package.json/icons).
- `npm run publish` — open a Store submission PR (`npx @raycast/api@latest publish`).

Lint/build/publish require the Raycast app installed and the user signed in.

## Data source: metals.dev

- Free tier: **100 requests/month**, per-user API key (optional preference `apiKey`, resolved durably — see below). Historical is included in the free tier — it costs quota, not money.
- `GET /v1/latest?currency=<selected>&unit=toz` → `metals.gold` = spot per troy ounce, already in the display currency; `currencies.USD` = value of 1 USD in that currency (used to convert the USD-only history).
- `GET /v1/timeseries?start_date&end_date` → **USD/toz only**, max **30 days per request**. Stored in USD and converted to the display currency downstream (see below).

## Architecture (`src/`)

- `gold-price.tsx` — the single `view` command. Resolves the API key first (`resolveApiKey`); shows an in-app `ApiKeyForm` when none exists, else the List UI (karat dropdown). A "Set API Key" action (⌘⇧K) re-opens the form.
- `lib/apiKey.ts` — durable API-key resolution (see below). `resolveApiKey()` / `saveApiKey(key)`, backed by LocalStorage key `metals-dev-api-key`.
- `lib/gold.ts` — karat/troy-ounce math (pure).
- `lib/dates.ts` — UTC ISO date helpers + 30-day chunking.
- `lib/currency.ts` — `DEFAULT_CURRENCY` (fallback + preference default, `"SAR"`), `SUPPORTED_CURRENCIES` (dropdown list; mirror into `package.json`'s `currency` preference `data`), `formatCurrency(value, currency)`.
- `lib/api.ts` — metals.dev client (`fetchLatestGold(apiKey, currency)` → `usdToLocalRate: number | null`, `fetchTimeseriesGoldUsd`).
- `lib/history.ts` — rolling ~1-year daily series in LocalStorage; incremental sync + averages (`PeriodAverageUsd`, USD-canonical).
- `lib/data.ts` — orchestrates latest (12h TTL cache, keyed per currency `gold-latest-<currency>`) + history sync into one load; converts to the display currency (`PeriodAverage`). `loadGoldData(apiKey, currency, force)`.

## API key: durable, not just a preference

The `apiKey` preference is a **`password` type**, which Raycast stores in the macOS Keychain. For a development/local extension that value is **not persisted reliably across sessions** — it silently disappears and re-prompts (observed after a dev-server session ended overnight). Store-installed extensions are expected to persist it fine, but we don't rely on that.

So the preference is `required: false` and the key is resolved through `lib/apiKey.ts`:

- **Preference wins _only when it changed_**: a non-empty `apiKey` preference becomes the active key **only if it differs from the last value we reconciled**, tracked in LocalStorage under `metals-dev-api-key-pref-seen`. On a change it's written to the active key (`metals-dev-api-key`) and to the seen-marker. This keeps preference edits authoritative **without** letting an _unchanged_ (possibly stale) preference clobber a newer key the user entered via the in-app form.
- **LocalStorage is the fallback / durable store**: if the preference is empty (first run, or lost), or unchanged since last seen, the stored active key is used. There is **no API to write back into a preference**, so once the preference is lost, LocalStorage is the source of truth. Returns `null` only when no key exists anywhere.
- **In-app form**: with `required: false`, Raycast won't force the prompt, so `gold-price.tsx` shows `ApiKeyForm` when `resolveApiKey()` returns `null`; submitting persists via `saveApiKey` to LocalStorage, and because the preference is unchanged that form key now survives future launches. LocalStorage is a local **encrypted** DB scoped to the extension.

## Currency: history is USD-canonical

`/v1/timeseries` returns gold in **USD/toz only** and its `currencies` map does NOT include most fiat currencies (live-verified). So history is stored in USD (`lib/history.ts`) and converted to the display currency at the boundary (`lib/data.ts`) using the USD→currency rate from `/latest` (`currencies.USD`, e.g. ≈ 3.75 for SAR). `/latest?currency=<selected>` gives `metals.gold` directly in the display currency. Symbols are currency-neutral (`pricePerTroyOunce`, `usdToLocalRate`, `averagePerTroyOunce`).

**Rate fallback covers USD and SAR.** `fetchLatestGold` returns `usdToLocalRate: number | null`; when `currencies.USD` is missing it falls back to **`1` for USD** (history is already USD-canonical, so no conversion) and to **`SAR_PER_USD_PEG = 3.75` for SAR** (`lib/api.ts`). For any other currency a missing live rate yields `null`, and `data.ts` then degrades gracefully — the live spot price still shows (it's already in the display currency), but averages and the day's change become `null` ("—") rather than being converted at a wrong rate. In practice `/latest` always returns `currencies.USD`, so this is defensive.

**Latest cache is keyed per currency** (`gold-latest-<currency>`) because price + rate are currency-specific; switching currency is a deliberate cache miss (one `/latest` request, then 12h TTL). History is USD-canonical and **shared across currencies** — switching currency never refetches history.

## Quota strategy (keep it inside 100 req/mo)

- Latest spot: cached **12h** (`LATEST_TTL_MS`).
- History: completed days are immutable and cached permanently; only days since the last sync are refetched, and the whole sync is skipped while younger than a **12h** TTL. First run pulls ~1 year in ~13 chunks; steady state ~1–2 requests/day.
- Averages are computed on the per-troy-ounce USD value, converted to the display currency, then to per-gram/karat at render (all linear, so order is irrelevant).

## Interaction model (`gold-price.tsx`)

- **Enter** on any row → copy a descriptive line (`Action.CopyToClipboard`), e.g. `Gold price today (24K): 483.54 SAR per gram` or `Gold price 1 Month average (22K): 451.20 SAR per gram` (currency label = the selected `currency`). Helpers `copyTextCurrent` / `copyTextAverage` in `gold-price.tsx` take the currency.
- **⌘R** and **⌘↵** → hard refresh (bypasses caches/TTLs via a `forceRef` read inside the usePromise loader, passed as `loadGoldData(apiKey, currency, force)`).
- Karat dropdown (search-bar accessory) re-derives the averages client-side; no refetch. Currency is an extension **preference**, not an in-view dropdown (Raycast allows only one `searchBarAccessory`, already used by the karat dropdown); changing it re-runs the loader via the `[currency]` dep in `usePromise`.

## Publishing checklist

- Set `author` in `package.json` to the real Raycast handle (ESLint validates it against raycast.com — a placeholder fails lint). Ours: `noice_anas` (GitHub `Noice-Anas`).
- Add `metadata/` screenshots (**exactly 2000×1250, PNG, <2 MB, 1–6 shots**) before submitting; the CHANGELOG uses the `{PR_MERGE_DATE}` placeholder. The PR's Greptile check also enforces **padding**: the Raycast window must sit **centered with ~12% margin all sides (8–17% range), top/bottom symmetric within 4%** — and it measures the *content* bounding box, so **views whose content is top-heavy (e.g. the API-key form) fail** and shouldn't be used. Best: Raycast's ⌘K "Take Screenshot" action (produces compliant shots natively). Fallback for a macOS window capture: recompose with Pillow — crop the window panel, re-center on a 2000×1250 purple gradient at 12% padding, rounded corners + soft shadow (see `scratchpad/compose.py` from the July 2026 session). `sips` alone can't do this (no compositing); a full-bleed crop leaves ~6% padding and fails.
- `npm run build && npm run lint` must both pass first.

### Publishing route: manual fork + PR (NOT `npm run publish`)

`npm run publish` (`ray publish`) authorizes the **Raycast CLI** via GitHub OAuth requesting the classic **`repo`** scope — all-or-nothing read/write to **all** public *and private* repos. We avoid granting that. Instead we publish manually with our own `gh` credentials, so the Raycast CLI gets zero account access:

1. `gh repo fork raycast/extensions --clone=false` (upstream default branch is `main`).
2. Sparse, blobless, shallow clone of the fork (the monorepo is huge): `git clone --depth 1 --filter=blob:none --sparse https://github.com/Noice-Anas/extensions.git`, then `git sparse-checkout set extensions/gold-price`. Use `gh auth setup-git` + HTTPS if SSH keys aren't loaded in the shell.
3. New branch; copy the extension into `extensions/gold-price/` — the file set = `git ls-files` from this repo **minus `CLAUDE.md`** (internal dev doc, don't ship). `git archive HEAD | tar -x -C .../extensions/gold-price/` is the clean way. `package-lock.json` **is** included (matches how existing monorepo extensions are laid out).
4. Commit, push to the fork, `gh pr create --repo raycast/extensions --base main --head Noice-Anas:gold-price`.

First submission: **PR [#29634](https://github.com/raycast/extensions/pull/29634)** (opened 2026-07-21). CI checks to watch: `metadata-images` (validates screenshot dims), build/lint, `PR Bot`, Socket Security, Greptile Review. To fix review feedback, push more commits to the `gold-price` branch — the PR updates automatically.
