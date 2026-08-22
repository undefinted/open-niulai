import csv
import importlib.util
import json
import sys
from pathlib import Path


ROOT = Path(__file__).parents[1]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.path.insert(0, str(ROOT))
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


TRACKER = load("open_niulai_growth", "growth_tracker.py")
CAMPAIGN = load("open_niulai_campaign", "build_campaign.py")


def event(**updates):
    row = {field: 0 for field in TRACKER.COUNT_FIELDS}
    row.update({"recorded_at": "2026-08-22T00:00:00+00:00", "campaign_id": "mao-lai", "platform": "test", "variant": "a", "post_url": "https://example.test/post"})
    row.update(updates)
    return row


def test_campaign_builds_seven_real_content_packs(tmp_path):
    index = CAMPAIGN.build_all(ROOT / "experiments" / "campaign.json", tmp_path)
    assert len(index["packs"]) == 7
    assert all((tmp_path / item["pack"]).is_file() for item in index["packs"])


def test_growth_report_uses_latest_real_snapshot(tmp_path):
    events = tmp_path / "events.csv"
    first = event(impressions=100, three_second_views=50, comments=2, shares=3)
    TRACKER.append_event(events, ROOT / "experiments" / "campaign.json", first)
    second = event(recorded_at="2026-08-22T01:00:00+00:00", impressions=200, three_second_views=120, comments=8, shares=10)
    TRACKER.append_event(events, ROOT / "experiments" / "campaign.json", second)
    result = TRACKER.report(events)
    assert result["real_snapshot_count"] == 1
    assert result["snapshots"][0]["three_second_rate"] == 0.6
    assert result["snapshots"][0]["comment_rate"] == 0.04


def test_experiment_waits_for_minimum_then_uses_weighted_lift(tmp_path):
    events = tmp_path / "events.csv"
    a = event(variant="poster_hard_cut", post_url="https://example.test/a", impressions=1000, three_second_views=650)
    b = event(variant="broken_frame_first", post_url="https://example.test/b", impressions=1000, three_second_views=500)
    TRACKER.append_event(events, ROOT / "experiments" / "campaign.json", a)
    TRACKER.append_event(events, ROOT / "experiments" / "campaign.json", b)
    result = TRACKER.report(events)
    opening = next(item for item in result["experiment_evaluations"] if item["experiment_id"] == "opening-contrast")
    assert opening["relative_lift_a_over_b"] == 0.3
    assert opening["decision"] == "keep_variant_a"
    comments = next(item for item in result["experiment_evaluations"] if item["experiment_id"] == "comment-cta")
    assert comments["decision"] == "insufficient_data"


def test_impossible_funnel_is_rejected():
    try:
        TRACKER.validate_counts(event(impressions=10, shares=11))
    except ValueError as exc:
        assert "cannot exceed impressions" in str(exc)
    else:
        raise AssertionError("impossible metrics were accepted")


def test_production_events_file_contains_no_fake_observations():
    with (ROOT / "experiments" / "events.csv").open(newline="", encoding="utf-8") as handle:
        assert list(csv.DictReader(handle)) == []


def test_visual_ready_campaigns_have_complete_manifest_assets():
    campaigns = json.loads((ROOT / "experiments" / "campaign.json").read_text(encoding="utf-8"))["campaigns"]
    demos = {item["id"]: item for item in json.loads((ROOT / "examples" / "demo-manifest.json").read_text(encoding="utf-8"))["demos"]}
    visual = [item for item in campaigns if item["asset_status"] == "visual_ready"]
    assert len(visual) == 7
    for campaign in visual:
        assert campaign["id"] in demos
        assert {"poster", "character_reference", "first_frame"} == set(demos[campaign["id"]]["assets"])
        assert all((ROOT / path).is_file() for path in demos[campaign["id"]]["assets"].values())
