# Alpha mine local historical replay

This adapter evaluates three fixed public price-only FactorSpecs with Alpha Agent's existing pure Python kernel. It does not call a market API, LLM, BRAIN, database, the full Alpha service, or a live trading system. In the browser the operation is **replaying a previously computed historical backtest**, not running a new simulation or fetching current prices.

## Files and integration

- `generate.py` reads the existing sibling `alpha-agent/alpha_agent/data/factor_universe_sp500_v3.parquet`, selecting **only `date`, `ticker`, `close`**. It imports pure types, AST validation, vectorized operators and `factor_engine/kernel.py`; it never imports the `factor_backtest.py` I/O wrapper or app configuration.
- Output is exclusively `local/alpha-pilot/results.json`, atomically replaced, with mode `historical-backtest-replay` and license status `local-only-unconfirmed`. The result is bounded to 1 MB and written with owner-only file permissions. This directory must be Git-ignored.
- `local-replay-plugin.mjs` is a Vite plugin with `apply: 'serve'`. Add `alphaReplayPlugin()` to the Astro Vite plugins. The middleware reads the local file in place at `/__alpha-pilot/results.json`; it does not copy it into `public/`, a build, or `dist/`, and has no preview/build hook. Bind the dev server to loopback. Requests require a loopback peer, loopback Host on the actual listening port, and a matching local Origin when supplied. Successful and failed responses are `no-store`. Missing data is a JSON 404 with `status: 'missing'`; invalid access is 403 and read failure is 503.
- `src/components/world/alpha-mine-data.ts` owns the browser whitelist, labels, type contract and strict structural/value validation. `fetchAlphaReplay(signal?)` returns `{status:'ready', pack}`, `{status:'missing', message}`, or `{status:'error', message}`. Cancellation propagates as an exception. Malformed results are never silently replaced by example returns.

## Run and verify

Use the **existing** Alpha Agent Python environment; install nothing. First run `/usr/bin/python3 /Users/a22309/.local/bin/codex-resource-preflight.py`. If less than 1 GiB is free, stop. With memory pressure or less than 20 GiB free, serialize heavy work. Atomically acquire `/tmp/bobby-world-phase2-heavy.lock` with `mkdir`; if it exists, wait for its owner rather than starting Python/Blender/a build concurrently. Release only the lock you acquired, immediately after the bounded job, including on failure.

From this project root, while holding that lock:

```sh
../alpha-agent/.venv/bin/python tools/world/alpha-mine-data/test_generate.py
../alpha-agent/.venv/bin/python tools/world/alpha-mine-data/generate.py
```

The optional `--alpha-root /absolute/path/to/alpha-agent` selects another existing checkout. There is deliberately no arbitrary output path, remote-data option or public export command. For the Python fixture test with another checkout, set `ALPHA_PILOT_ROOT`.

The browser/middleware tests are lightweight and need no server or real dataset:

```sh
node --experimental-strip-types --test src/components/world/alpha-mine-data.test.mjs
```

After generation, validate the actual local manifest using the browser validator before connecting it to the installation:

```sh
node --experimental-strip-types --input-type=module -e 'import fs from "node:fs"; import {validateAlphaReplay} from "./src/components/world/alpha-mine-data.ts"; const p=validateAlphaReplay(JSON.parse(fs.readFileSync("local/alpha-pilot/results.json","utf8"))); console.log({mode:p.mode,range:p.dataset.dateRange,assets:p.dataset.assetCount});'
```

## Fixed experiment and numerical definitions

All three candidates use the identical cached calendar/universe, daily rebalancing, `long_short`, top/bottom 30% selection, long weight sum +1 and short weight sum -1 when at least ten valid scores exist. The resulting gross exposure is approximately 2 and net exposure 0. This does not establish market neutrality. SPY and RSP are held out of selection; SPY is the price-only buy-and-hold benchmark. No historical constituent membership mask is applied, and the manifest says so.

The train ratio is 0.8, with one purged row before the boundary and one embargoed row after it. No parameter fitting or factor selection is performed on either split. Let `S=floor(T*0.8)`. By **realized return date**, train metrics use row indices `[1,S-1)` and test metrics use `[S+1,T)`. The curve includes all panel dates, including warm-up, purge and embargo dates; it is not reset at the test boundary. `metrics` always means the test split; `trainMetrics` means the train split. `trainRange` and `testRange` store the inclusive actual return-date endpoints.

The pure kernel picks weights from information at close `t`, computes `close[t+1]/close[t]-1`, and books the return on date `t+1`. The adapter independently recomputes every period as an alignment assertion. IC likewise uses score row `t` and its **next-period** return row `t`; its date label is the realized return date `t+1`. The kernel's native `split_metrics` uses separate decision-row slicing, so displayed adapter statistics are explicitly recalculated from kernel output arrays using this one return-date convention.

- `ic`: mean daily kernel Spearman rank correlation between scores at `t` and returns from `t` to `t+1`. At least three finite pairs are required; undefined warm-up samples are omitted. The kernel's ordinal `argsort` treatment of ties is retained and disclosed.
- `turnover`: average `sum(abs(w[t]-w[t-1]))` for decisions earning the split's returns, including entry from cash. This is two-sided L1 turnover, not half of turnover; it ranges from 0 to 4 for this portfolio.
- Cost: two-sided L1 turnover times 10 bps (`10/10000`), deducted on the associated next realized period. This is an assumed fee, not a measured execution cost. Slippage, stock borrowing and financing are set to zero.
- `totalReturn`: product of `1 + net daily return` over the stated split, minus 1. It is a decimal fraction; negative results remain negative.
- `maxDrawdown`: minimum of split NAV divided by its running peak, minus 1, with starting cash NAV 1 included. It is a nonpositive decimal fraction.
- `curve`: full-panel compounded net strategy NAV starts at 1. Benchmark is SPY close divided by its first close, without costs or dividends. Long-only SPY is not an exposure-matched benchmark for the long/short strategy.

The adapter does not fill missing closes. As in the kernel, unavailable forward returns are excluded from a period's PnL without renormalizing weights. Membership/provider coverage, survival, price adjustment, partial native rolling windows, unmodelled dividends/financing and missing-price exposure can affect the result. These limitations are included in the local manifest. A hypothesis can lose money or have a negative IC; no seed has a preassigned success label.

## Reproducibility and privacy

`dataset.hash` is a SHA-256 digest of the **selected inputs**, not the entire Parquet (which also contains unused metadata). Its canonical sequence is compact JSON for `{schema:'alpha-pilot-close-v1', dates, tickers}` with sorted ticker columns and sorted SPY dates, then C-order little-endian float64 asset closes with canonical NumPy NaNs, then little-endian float64 SPY closes. `asOf` is the last historical row, not the generation date. `assetCount` excludes SPY/RSP.

The manifest records engine Git commit, SHA-256 hashes for the actually used kernel/vectorized/AST/type/significance files, adapter file hash, fixed params and complete specs. `resultHash` hashes sorted compact JSON of all manifest fields **except `generatedAt` and `resultHash`**, so unchanged selected inputs, code and configuration produce the same digest. Generated time is an actual UTC timestamp. Every generation verifies repeated kernel outputs are identical and re-runs at 20 bps, checking the exact aligned period costs and lower terminal NAV for each candidate. The fixture tests also alter only future prices and assert earlier scores, weights and realized returns do not change.

Neither raw prices nor the aggregate derived result is approved for public display. Do not commit, upload, publish or copy the local result into documentation, public assets, static JSON imports or a production build. Source code and test fixtures contain no real return history. Public result availability requires a separate data/derived-output permission decision.

## Local verification receipt

On 2026-10-25, the existing Alpha Agent Python environment executed all five temporal/AST/cost fixture tests successfully, then generated the local replay at `2026-10-25T10:22:03.406026+00:00`. The selected cached input contains 752 SPY calendar dates from 2023-05-02 through 2026-04-30 and 555 selected assets, excluding SPY/RSP. Train return dates are 2023-05-03 through 2025-09-22; test return dates are 2025-09-25 through 2026-04-30. The actual file is 181,073 bytes. These dates describe the cached historical input, not present market data.

Each of the three real candidates passed independent next-period PnL alignment, repeated exact daily-return/weight determinism, and an actual 20 bps cost rerun with lower terminal NAV. The browser validator accepted the generated file. All five Node manifest/fetch/middleware tests passed, including rejected malformed/nonfinite payloads, chronological errors, missing/network/HTTP/abort states, blocked network/foreign-Origin requests and successful candidate-port IPv4/IPv6 loopback requests. A strict single-file TypeScript check also passed. The heavy calculation used the shared atomic-directory lock under warning memory pressure, with approximately 2.05 GiB free disk, and released the lock on completion. No service, browser, external request or dependency installation was needed. Public permission remains unconfirmed.
