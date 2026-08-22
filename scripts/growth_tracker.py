#!/usr/bin/env python3
"""Record real campaign snapshots and calculate Open NiuLai growth metrics."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


ROOT = Path(__file__).parents[1]
DEFAULT_EVENTS = ROOT / "experiments" / "events.csv"
FIELDS = (
    "recorded_at", "campaign_id", "platform", "variant", "post_url", "impressions",
    "three_second_views", "completions", "likes", "comments", "shares", "saves",
    "profile_visits", "repo_clicks", "project_exports", "external_creations",
)
COUNT_FIELDS = FIELDS[5:]


def load_campaign_ids(path: Path) -> set[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return {item["id"] for item in data["campaigns"]}


def validate_counts(row: dict) -> None:
    for field in COUNT_FIELDS:
        if int(row[field]) < 0:
            raise ValueError(f"{field} cannot be negative")
    impressions = int(row["impressions"])
    for field in ("three_second_views", "completions", "likes", "comments", "shares", "saves", "profile_visits", "repo_clicks"):
        if int(row[field]) > impressions:
            raise ValueError(f"{field} cannot exceed impressions")


def append_event(events_path: Path, campaign_path: Path, row: dict) -> None:
    if row["campaign_id"] not in load_campaign_ids(campaign_path):
        raise ValueError(f"unknown campaign: {row['campaign_id']}")
    validate_counts(row)
    events_path.parent.mkdir(parents=True, exist_ok=True)
    needs_header = not events_path.exists() or events_path.stat().st_size == 0
    with events_path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        if needs_header:
            writer.writeheader()
        writer.writerow({field: row[field] for field in FIELDS})


def latest_rows(events_path: Path) -> list[dict]:
    if not events_path.is_file():
        return []
    with events_path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    latest: dict[tuple[str, str, str, str], dict] = {}
    for row in rows:
        key = (row["campaign_id"], row["platform"], row["variant"], row["post_url"])
        if key not in latest or row["recorded_at"] > latest[key]["recorded_at"]:
            latest[key] = row
    return list(latest.values())


def safe_rate(numerator: int, denominator: int) -> float | None:
    return None if denominator == 0 else round(numerator / denominator, 6)


def metrics(row: dict) -> dict:
    values = {field: int(row[field]) for field in COUNT_FIELDS}
    impressions = values["impressions"]
    engagements = values["likes"] + values["comments"] + values["shares"] + values["saves"]
    return {
        **{field: row[field] for field in FIELDS[:5]},
        **values,
        "three_second_rate": safe_rate(values["three_second_views"], impressions),
        "completion_rate": safe_rate(values["completions"], impressions),
        "engagement_rate": safe_rate(engagements, impressions),
        "comment_rate": safe_rate(values["comments"], impressions),
        "share_rate": safe_rate(values["shares"], impressions),
        "repo_click_rate": safe_rate(values["repo_clicks"], impressions),
        "production_continuation_rate": safe_rate(values["project_exports"] + values["external_creations"], impressions),
    }


def evaluate_experiments(snapshots: list[dict], campaign_path: Path) -> list[dict]:
    campaign = json.loads(campaign_path.read_text(encoding="utf-8"))
    metric_counts = {
        "three_second_rate": "three_second_views",
        "comment_rate": "comments",
        "share_rate": "shares",
    }
    evaluations = []
    for experiment in campaign["experiments"]:
        count_field = metric_counts[experiment["primary_metric"]]
        variants = {}
        for variant in (experiment["variant_a"], experiment["variant_b"]):
            matching = [row for row in snapshots if row["variant"] == variant]
            impressions = sum(row["impressions"] for row in matching)
            numerator = sum(row[count_field] for row in matching)
            variants[variant] = {
                "impressions": impressions,
                "rate": safe_rate(numerator, impressions),
            }
        a = variants[experiment["variant_a"]]
        b = variants[experiment["variant_b"]]
        minimum = experiment["minimum_impressions_per_variant"]
        if a["impressions"] < minimum or b["impressions"] < minimum:
            decision, lift = "insufficient_data", None
        elif b["rate"] == 0:
            lift = None
            decision = "keep_variant_a" if (a["rate"] or 0) > 0 else "no_difference"
        else:
            lift = round((a["rate"] - b["rate"]) / b["rate"], 6)
            decision = "keep_variant_a" if lift >= experiment["keep_if_relative_lift"] else "reject_variant_a"
        evaluations.append({
            "experiment_id": experiment["id"],
            "primary_metric": experiment["primary_metric"],
            "variants": variants,
            "relative_lift_a_over_b": lift,
            "required_lift": experiment["keep_if_relative_lift"],
            "decision": decision,
        })
    return evaluations


def report(events_path: Path, campaign_path: Path = ROOT / "experiments" / "campaign.json") -> dict:
    snapshots = [metrics(row) for row in latest_rows(events_path)]
    return {
        "schema_version": "0.1.0",
        "real_snapshot_count": len(snapshots),
        "snapshots": snapshots,
        "experiment_evaluations": evaluate_experiments(snapshots, campaign_path),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    record = commands.add_parser("record")
    record.add_argument("--events", type=Path, default=DEFAULT_EVENTS)
    record.add_argument("--campaign-file", type=Path, default=ROOT / "experiments" / "campaign.json")
    record.add_argument("--campaign-id", required=True)
    record.add_argument("--platform", required=True)
    record.add_argument("--variant", required=True)
    record.add_argument("--post-url", required=True)
    for field in COUNT_FIELDS:
        record.add_argument(f"--{field.replace('_', '-')}", type=int, default=0)
    summary = commands.add_parser("report")
    summary.add_argument("--events", type=Path, default=DEFAULT_EVENTS)
    summary.add_argument("--campaign-file", type=Path, default=ROOT / "experiments" / "campaign.json")
    args = parser.parse_args(argv)
    try:
        if args.command == "record":
            row = {field: getattr(args, field) for field in COUNT_FIELDS}
            row.update({
                "recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "campaign_id": args.campaign_id,
                "platform": args.platform,
                "variant": args.variant,
                "post_url": args.post_url,
            })
            append_event(args.events, args.campaign_file, row)
            result = {"recorded": True, "campaign_id": args.campaign_id}
        else:
            result = report(args.events, args.campaign_file)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
