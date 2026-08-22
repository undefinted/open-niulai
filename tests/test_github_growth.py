import importlib.util
import json
import sys
from pathlib import Path


ROOT = Path(__file__).parents[1]
SCRIPT = ROOT / "scripts" / "github_growth.py"
SPEC = importlib.util.spec_from_file_location("open_niulai_github_growth", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def test_collect_maps_real_api_shapes(monkeypatch):
    responses = {
        "repos/o/r": {"stargazers_count": 2, "forks_count": 1, "open_issues_count": 3, "subscribers_count": 4},
        "repos/o/r/traffic/views": {"count": 20, "uniques": 10},
        "repos/o/r/traffic/clones": {"count": 8, "uniques": 5},
    }
    monkeypatch.setattr(MODULE, "gh_json", responses.__getitem__)
    row = MODULE.collect("o/r")
    assert row["stars"] == 2
    assert row["unique_views_14d"] == 10
    assert row["unique_clones_14d"] == 5


def test_snapshot_report_uses_observed_baseline_and_latest(tmp_path):
    path = tmp_path / "snapshots.csv"
    base = {"recorded_at": "2026-01-01T00:00:00+00:00", "repository": "o/r", **{field: 0 for field in MODULE.COUNT_FIELDS}}
    latest = {**base, "recorded_at": "2026-01-02T00:00:00+00:00", "stars": 3, "views_14d": 12}
    MODULE.append_snapshot(path, base)
    MODULE.append_snapshot(path, latest)
    result = MODULE.report(path)
    assert result["snapshot_count"] == 2
    assert result["delta"]["stars"] == 3
    assert result["delta"]["views_14d"] == 12


def test_production_github_file_contains_only_valid_observed_rows():
    rows = MODULE.load_snapshots(ROOT / "experiments" / "github-snapshots.csv")
    for row in rows:
        assert row["repository"] == "undefinted/open-niulai"
        assert row["recorded_at"].endswith("+00:00")
        assert all(int(row[field]) >= 0 for field in MODULE.COUNT_FIELDS)
