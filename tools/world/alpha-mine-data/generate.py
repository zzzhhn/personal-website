#!/usr/bin/env python3
"""Bounded offline historical replay exporter. Reads only date/ticker/close, never .env or the API wrapper."""
from __future__ import annotations

import argparse
from dataclasses import asdict, replace
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace


def specs():
    # These definitions must match ALPHA_FACTORS. The browser validates the complete spec.
    return [
        dict(name="REVERSAL_5", hypothesis="Recent five-day losers may rebound relative to recent winners.",
             expression="subtract(0.0, subtract(divide(close, ts_delay(close, 5)), 1.0))",
             operators_used=["subtract", "divide", "ts_delay"], lookback=5, universe="SP500",
             justification="A fixed public price-only seed; short-horizon reversal is a hypothesis, not a promise."),
        dict(name="ROC20_RANK", hypothesis="Stocks with stronger trailing twenty-day returns may continue to lead.",
             expression="rank(subtract(divide(close, ts_delay(close, 20)), 1.0))",
             operators_used=["rank", "subtract", "divide", "ts_delay"], lookback=20, universe="SP500",
             justification="A fixed public price-only seed testing cross-sectional momentum without fitting parameters."),
        dict(name="LOW_STD_20", hypothesis="Stocks with lower trailing twenty-day return volatility may outperform.",
             expression="subtract(0.0, ts_std(returns, 20))",
             operators_used=["subtract", "ts_std"], lookback=20, universe="SP500",
             justification="A fixed public price-only seed testing low volatility; strong markets may favor riskier stocks."),
    ]


def load_engine(alpha_root):
    sys.path.insert(0, str(alpha_root))
    # All imports below are pure types/AST/numpy; do not import factor_backtest or app configuration.
    from alpha_agent.core.types import FactorSpec
    from alpha_agent.core.factor_ast import validate_expression
    from alpha_agent.factor_engine import kernel
    return FactorSpec, validate_expression, kernel


def panel_from_close(close, dates, tickers, benchmark):
    import numpy as np
    # kernel's generic dictionary accepts these placeholders, but the whitelist uses only close/returns.
    # No metadata, WRDS fundamentals, insider data, member list or alternate price series is loaded.
    return SimpleNamespace(close=close, dates=dates, tickers=tickers, benchmark_close=benchmark,
                           open_=close, high=close, low=close, volume=np.zeros_like(close),
                           cap=None, sector=None, industry=None, exchange=None, currency=None,
                           fundamentals={}, is_member=None, insider_form4=None)


def load_panel(filename):
    import numpy as np
    import pandas as pd
    frame = pd.read_parquet(filename, columns=["date", "ticker", "close"])
    frame["date"] = pd.to_datetime(frame["date"]).dt.strftime("%Y-%m-%d")
    if frame.duplicated(["date", "ticker"]).any():
        raise ValueError("Duplicate date/ticker rows; no implicit aggregation is allowed")
    wide = frame.pivot(index="date", columns="ticker", values="close").sort_index()
    if "SPY" not in wide:
        raise ValueError("SPY benchmark is missing")
    # Actual SPY dates define the calendar; do not forward-fill asset prices or missing returns.
    wide = wide.loc[wide["SPY"].notna()]
    tickers = tuple(sorted(t for t in wide.columns if t not in {"SPY", "RSP"}))
    dates = tuple(wide.index)
    close = wide.loc[:, list(tickers)].to_numpy(dtype=np.float64)
    benchmark = wide["SPY"].to_numpy(dtype=np.float64)
    if len(dates) < 100 or len(tickers) < 10:
        raise ValueError("Insufficient local historical panel")
    if np.isinf(close).any() or np.any(close[np.isfinite(close)] <= 0) or not np.all(benchmark > 0):
        raise ValueError("Prices must be positive finite values or explicitly missing")
    # Canonical selected-input digest: schema, dates, ordered tickers, little-endian close/benchmark.
    digest = hashlib.sha256()
    digest.update(json.dumps({"schema": "alpha-pilot-close-v1", "dates": dates, "tickers": tickers},
                             separators=(",", ":")).encode())
    canonical_close = np.array(close, dtype="<f8", order="C")
    canonical_close[np.isnan(canonical_close)] = np.nan  # canonical numpy NaN bit pattern
    digest.update(canonical_close.tobytes(order="C"))
    digest.update(np.asarray(benchmark, dtype="<f8").tobytes(order="C"))
    return panel_from_close(close, dates, tickers, benchmark), "sha256:" + digest.hexdigest()


def metrics_for_returns(result, start, end, kernel):
    """[start,end) is indexed by realized RETURN date. IC uses the preceding decision row."""
    import numpy as np
    rows = np.arange(start, end)
    rows = rows[np.isfinite(result.daily_ret[rows])]
    if not rows.size:
        raise ValueError("No realized return observations in split")
    returns = result.daily_ret[rows]
    nav = np.concatenate(([1.0], np.cumprod(1.0 + returns)))
    peak = np.maximum.accumulate(nav)
    ic, turnover = [], []
    for row in rows:
        decision = row - 1
        valid = np.isfinite(result.factor[decision]) & np.isfinite(result.fwd_returns[decision])
        # Skip warm-up/undefined rows instead of diluting the average with artificial zero ICs.
        if valid.sum() >= 3:
            ic.append(kernel.spearman_ic(result.factor[decision], result.fwd_returns[decision]))
        prior = result.weights[decision - 1] if decision else np.zeros(result.weights.shape[1])
        turnover.append(float(np.abs(result.weights[decision] - prior).sum()))
    if not ic:
        raise ValueError("No eligible cross-sectional IC observations")
    return dict(ic=float(np.mean(ic)), maxDrawdown=float(np.min(nav / peak - 1.0)),
                turnover=float(np.mean(turnover)), totalReturn=float(nav[-1] - 1.0))


def verify_alignment(result, panel, cost_bps):
    """Independently recompute every realized period; catches an accidental contemporaneous return shift."""
    import numpy as np
    for row in range(1, len(panel.dates)):
        decision = row - 1
        forward = panel.close[row] / panel.close[decision] - 1.0
        valid = ~np.isnan(forward)
        if not valid.any():
            continue
        prior = result.weights[decision - 1] if decision else np.zeros(len(panel.tickers))
        expected = float((result.weights[decision, valid] * forward[valid]).sum())
        expected -= float(np.abs(result.weights[decision] - prior).sum()) * cost_bps / 10000
        np.testing.assert_allclose(result.daily_ret[row], expected, atol=1e-14, rtol=1e-12)


def generate(alpha_root, output):
    import numpy as np
    FactorSpec, validate_expression, kernel = load_engine(alpha_root)
    panel, data_hash = load_panel(alpha_root / "alpha_agent/data/factor_universe_sp500_v3.parquet")
    params = kernel.KernelParams(direction="long_short", top_pct=.3, bottom_pct=.3, train_ratio=.8,
                                 transaction_cost_bps=10, purge_days=1, embargo_days=1, n_trials=3)
    split = int(len(panel.dates) * params.train_ratio)
    train_start, train_end = 1, split - params.purge_days
    test_start, test_end = split + params.embargo_days, len(panel.dates)
    factors, verification = {}, {}
    for raw_spec in specs():
        spec = FactorSpec(**raw_spec)
        validate_expression(spec.expression, spec.operators_used)
        result = kernel.run_kernel(panel, spec, params)
        verify_alignment(result, panel, params.transaction_cost_bps)
        repeat = kernel.run_kernel(panel, spec, params)
        np.testing.assert_array_equal(result.daily_ret, repeat.daily_ret)
        np.testing.assert_array_equal(result.weights, repeat.weights)
        # Higher flat costs must reduce each affected period by exactly Δcost * L1 turnover.
        high_cost = kernel.run_kernel(panel, spec, replace(params, transaction_cost_bps=20))
        verify_alignment(high_cost, panel, 20)
        valid = np.isfinite(result.daily_ret) & np.isfinite(high_cost.daily_ret)
        if np.any(high_cost.daily_ret[valid] > result.daily_ret[valid] + 1e-14):
            raise AssertionError("Increasing flat cost unexpectedly increased daily return")
        if not high_cost.equity[-1] < result.equity[-1]:
            raise AssertionError("Cost check found no actual trading impact")
        nav = result.equity / 100000.0
        bench = panel.benchmark_close / panel.benchmark_close[0]
        if not np.all(np.isfinite(nav)) or np.any(nav <= 0):
            raise ValueError("Non-finite or insolvent NAV")
        factors[spec.name] = dict(
            spec=raw_spec,
            curve=[dict(date=date, nav=float(nav[i]), benchmark=float(bench[i])) for i, date in enumerate(panel.dates)],
            metrics=metrics_for_returns(result, test_start, test_end, kernel),
            trainMetrics=metrics_for_returns(result, train_start, train_end, kernel),
            trainRange=dict(start=panel.dates[train_start], end=panel.dates[train_end - 1]),
            testRange=dict(start=panel.dates[test_start], end=panel.dates[test_end - 1]),
        )
        verification[spec.name] = dict(deterministic=True, nextPeriodAlignment=True,
                                      higherCostLowersFinalNav=True, finalNav20bps=float(high_cost.equity[-1] / 100000.0))
        del repeat, high_cost, result
    engine_commit = subprocess.check_output(["git", "-C", str(alpha_root), "rev-parse", "HEAD"], text=True).strip()
    code_files = ["alpha_agent/factor_engine/kernel.py", "alpha_agent/scan/vectorized.py",
                  "alpha_agent/scan/significance.py", "alpha_agent/core/factor_ast.py", "alpha_agent/core/types.py"]
    pack = dict(
        schemaVersion=1, mode="historical-backtest-replay", generatedAt=datetime.now(timezone.utc).isoformat(),
        dataset=dict(id="local-sp500-v3-close-only", hash=data_hash,
                     source="Existing factor_universe_sp500_v3.parquet OHLCV cache; Alpaca price history via fetch_sp500_alpaca.py. Only date, ticker and close are read.",
                     asOf=panel.dates[-1], dateRange=dict(start=panel.dates[0], end=panel.dates[-1]),
                     assetCount=len(panel.tickers), licenseStatus="local-only-unconfirmed"),
        engineCommit=engine_commit,
        engineFileHashes={name: "sha256:" + hashlib.sha256((alpha_root / name).read_bytes()).hexdigest() for name in code_files},
        params=dict(direction="long_short", topPct=.3, bottomPct=.3, trainRatio=.8, transactionCostBps=10,
                    slippageBps=0, shortBorrowBps=0, purgeDays=1, embargoDays=1, neutralize="none",
                    benchmark="SPY", survivorshipMask=False, metricsScope="test", warmup="engine-native available trailing observations",
                    grossExposure="+1 long / -1 short when at least ten valid scores; daily rebalance"),
        metricDefinitions=dict(
            ic="Test mean of kernel Spearman cross-sectional rank correlation: score at close t versus close[t+1]/close[t]-1; reported by realized return date t+1. Requires >=3 finite pairs; undefined warm-up rows are omitted. Kernel uses ordinal argsort ranks for ties.",
            maxDrawdown="Minimum of split net NAV / running peak - 1, including initial NAV=1; negative decimal fraction.",
            turnover="Mean daily L1 weight change sum(abs(w[t]-w[t-1])) for decisions earning returns in the stated split, including entry from cash. This is two-sided turnover, not half turnover.",
            totalReturn="Product of (1 + net daily strategy return) over the stated split minus 1. Costs are L1 turnover * 10/10000, charged to the next realized period.",
            curve="Full-panel compounded net strategy NAV starts at 1. SPY close / first SPY close starts at 1; SPY is an uncosted long-only price benchmark, not a matched exposure strategy. Metrics cover testRange only; trainMetrics cover trainRange."),
        limitations=[
            "Local-only historical replay. Public display rights for source data and derived results remain unconfirmed; do not publish this file.",
            "Universe is the assets present in the cached v3 panel; no historical membership mask is applied. Survivorship and provider coverage biases remain; SPY and RSP are excluded from selection.",
            "No fundamentals or WRDS metadata are read. Price adjustment/feed completeness and delisted asset coverage are not independently certified.",
            "Ten bps per unit of two-sided traded weight is an assumed cost, not measured execution. Slippage, borrowing fees, financing, dividends and capacity are not modelled.",
            "Fixed hypotheses and parameters are not fitted. The 80/20 chronological split has one purged train row and one embargoed test row; history is visible during signal warm-up.",
            "Missing asset prices are not filled. Kernel excludes unavailable forward returns from PnL without renormalizing weights; missing-price exposures may bias results.",
            "Native rolling operators can use available observations during initial partial windows; all three candidates share the same calendar and parameter settings.",
        ], factors=factors, verification=verification,
        adapterFileHash="sha256:" + hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    )
    # Excludes generatedAt, so unchanged selected inputs/code/config have a reproducible result hash.
    reproducible = {k: v for k, v in pack.items() if k != "generatedAt"}
    pack["resultHash"] = "sha256:" + hashlib.sha256(json.dumps(reproducible, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()
    payload = json.dumps(pack, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"
    if len(payload.encode()) > 1_000_000:
        raise ValueError("Replay exceeds 1 MB pilot limit")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp")
    temporary.write_text(payload)
    temporary.chmod(0o600)
    temporary.replace(output)
    print(json.dumps(dict(status="generated", bytes=len(payload.encode()), mode=pack["mode"],
                          dateRange=pack["dataset"]["dateRange"], assetCount=len(panel.tickers),
                          resultHash=pack["resultHash"], verification=verification), ensure_ascii=False))


if __name__ == "__main__":
    project = Path(__file__).resolve().parents[3]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--alpha-root", type=Path, default=project.parent / "alpha-agent")
    args = parser.parse_args()
    # Deliberately no arbitrary public output path or live data fetch option.
    generate(args.alpha_root.resolve(), project / "local/alpha-pilot/results.json")
