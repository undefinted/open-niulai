#!/usr/bin/env python3
"""Collect auditable GitHub repository growth snapshots through gh CLI."""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


ROOT = Path(__file__).parents[1]
DEFAULT_SNAPSHOTS = ROOT / "experiments" / "github-snapshots.csv"
FIELDS = (
    "recorded_at", "repository", "stars", "forks", "open_items", "watchers",
    "views_14d", "unique_views_14d", "clones_14d", "unique_clones_14d",
)
COUNT_FIELDS = FIELDS[2:]


def gh_json(path: str) -> dict:
    completed = subprocess.run(
        ["gh", "api", path], capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    if completed.returncode:
        raise RuntimeError(completed.stderr.strip() or f"gh api failed for {path}")
    return json.loads(completed.stdout)


def collect(repository: str) -> dict:
    repo = gh_json(f"repos/{repository}")
    views = gh_json(f"repos/{repository}/traffic/views")
    clones = gh_json(f"repos/{repository}/traffic/clones")
    return {
        "recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "repository": repository,
        "stars": repo["stargazers_count"],
        "forks": repo["forks_count"],
        "open_items": repo["open_issues_count"],
        "watchers": repo["subscribers_count"],
        "views_14d": views["count"],
        "unique_views_14d": views["uniques"],
        "clones_14d": clones["count"],
        "unique_clones_14d": clones["uniques"],
    }


def append_snapshot(path: Path, row: dict) -> None:
    for field in COUNT_FIELDS:
        if int(row[field]) < 0:
            raise ValueError(f"{field} cannot be negative")
    path.parent.mkdir(parents=True, exist_ok=True)
    needs_header = not path.exists() or path.stat().st_size == 0
    with path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        if needs_header:
            writer.writeheader()
        writer.writerow({field: row[field] for field in FIELDS})


def load_snapshots(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def report(path: Path) -> dict:
    rows = load_snapshots(path)
    if not rows:
        return {"schema_version": "0.1.0", "snapshot_count": 0, "baseline": None, "latest": None, "delta": None}
    baseline, latest = rows[0], rows[-1]
    return {
        "schema_version": "0.1.0",
        "snapshot_count": len(rows),
        "baseline": baseline,
        "latest": latest,
        "delta": {field: int(latest[field]) - int(baseline[field]) for field in COUNT_FIELDS},
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    capture = commands.add_parser("collect")
    capture.add_argument("--repo", required=True, help="OWNER/REPO")
    capture.add_argument("--snapshots", type=Path, default=DEFAULT_SNAPSHOTS)
    summary = commands.add_parser("report")
    summary.add_argument("--snapshots", type=Path, default=DEFAULT_SNAPSHOTS)
    args = parser.parse_args(argv)
    try:
        if args.command == "collect":
            result = collect(args.repo)
            append_snapshot(args.snapshots, result)
        else:
            result = report(args.snapshots)
    except (OSError, RuntimeError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
