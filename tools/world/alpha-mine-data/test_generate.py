"""Offline temporal/cost tests. Run with the existing Alpha Agent Python interpreter."""
import importlib.util
import os
from pathlib import Path
import unittest
from dataclasses import replace
from types import SimpleNamespace

module_spec = importlib.util.spec_from_file_location("pilot_generate", Path(__file__).with_name("generate.py"))
adapter = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(adapter)


class TemporalContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import numpy as np
        cls.np = np
        alpha_root = Path(os.environ.get("ALPHA_PILOT_ROOT", Path(__file__).resolve().parents[4] / "alpha-agent"))
        cls.FactorSpec, validate, cls.kernel = adapter.load_engine(alpha_root)
        cls.validate = staticmethod(validate)
        increments = np.array([[.002 * (asset - 5) + .01 * np.sin(asset * day * .31) for asset in range(12)] for day in range(40)])
        close = 100 * np.cumprod(1 + increments, axis=0)
        cls.panel = adapter.panel_from_close(close, tuple(f"fixture-{i:02}" for i in range(40)), tuple(f"A{i}" for i in range(12)), close[:, 0])
        cls.spec = cls.FactorSpec(**adapter.specs()[0])
        cls.params = cls.kernel.KernelParams(transaction_cost_bps=10, purge_days=1, embargo_days=1)
        cls.result = cls.kernel.run_kernel(cls.panel, cls.spec, cls.params)

    def test_whitelist_specs_pass_ast_and_unsafe_expression_fails(self):
        for raw in adapter.specs():
            spec = self.FactorSpec(**raw)
            self.validate(spec.expression, spec.operators_used)
        with self.assertRaises(ValueError):
            self.validate("close.__class__", [])

    def test_return_is_realized_after_decision_not_contemporaneously(self):
        adapter.verify_alignment(self.result, self.panel, 10)
        differences = []
        for row in range(6, 39):
            future = self.panel.close[row + 1] / self.panel.close[row] - 1
            wrong_gross = float((self.result.weights[row + 1] * future).sum())
            correct_gross = float((self.result.weights[row] * future).sum())
            differences.append(abs(wrong_gross - correct_gross))
        self.assertGreater(max(differences), 1e-8)

    def test_changing_future_cannot_change_earlier_signals_weights_or_returns(self):
        np = self.np
        changed = self.panel.close.copy()
        changed[25:] *= np.linspace(.6, 1.5, 12)
        future_panel = adapter.panel_from_close(changed, self.panel.dates, self.panel.tickers, changed[:, 0])
        future = self.kernel.run_kernel(future_panel, self.spec, self.params)
        for field in ("factor", "weights", "daily_ret"):
            np.testing.assert_array_equal(getattr(self.result, field)[:25], getattr(future, field)[:25])

    def test_flat_cost_has_exact_next_period_effect_and_repeat_is_deterministic(self):
        np = self.np
        free = self.kernel.run_kernel(self.panel, self.spec, replace(self.params, transaction_cost_bps=0))
        repeat = self.kernel.run_kernel(self.panel, self.spec, self.params)
        np.testing.assert_array_equal(self.result.daily_ret, repeat.daily_ret)
        adapter.verify_alignment(free, self.panel, 0)
        previous = np.vstack([np.zeros((1, 12)), self.result.weights[:-1]])
        expected_cost = np.abs(self.result.weights - previous).sum(axis=1) * .001
        np.testing.assert_allclose(free.daily_ret[1:] - self.result.daily_ret[1:], expected_cost[:-1], atol=1e-14)
        self.assertLess(self.result.equity[-1], free.equity[-1])

    def test_metric_ic_uses_previous_decision_and_drawdown_includes_initial_cash(self):
        np = self.np
        result = SimpleNamespace(daily_ret=np.array([np.nan, -.2, .1]),
                                 factor=np.array([[1, 2, 3], [3, 2, 1], [1, 1, 1.]]),
                                 fwd_returns=np.array([[.1, .2, .3], [.3, .2, .1], [np.nan] * 3]),
                                 weights=np.array([[1., 0, -1], [0, 1., -1], [0, 0, 0]]))
        metrics = adapter.metrics_for_returns(result, 1, 3, self.kernel)
        self.assertAlmostEqual(metrics["ic"], 1)
        self.assertAlmostEqual(metrics["maxDrawdown"], -.2)
        self.assertAlmostEqual(metrics["totalReturn"], -.12)
        self.assertAlmostEqual(metrics["turnover"], 2)


if __name__ == "__main__":
    unittest.main()
