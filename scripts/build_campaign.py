#!/usr/bin/env python3
"""Build content packs for every campaign without inventing performance data."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

try:
    from scripts.build_open_niulai_pack import PackInput, build_pack, to_markdown
except ModuleNotFoundError:
    from build_open_niulai_pack import PackInput, build_pack, to_markdown


ROOT = Path(__file__).parents[1]


def build_all(campaign_path: Path, out_dir: Path) -> dict:
    source = json.loads(campaign_path.read_text(encoding="utf-8"))
    out_dir.mkdir(parents=True, exist_ok=True)
    index = {"schema_version": source["schema_version"], "packs": []}
    for campaign in source["campaigns"]:
        pack = build_pack(PackInput(
            subject=campaign["subject"],
            prompt=campaign["prompt"],
            tone=campaign["tone"],
            template=campaign["template"],
            duration=5,
            required_line=campaign["required_line"],
            platform="通用短视频",
        ))
        target = out_dir / campaign["id"]
        target.mkdir(parents=True, exist_ok=True)
        (target / "pack.json").write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (target / "production.md").write_text(to_markdown(pack), encoding="utf-8")
        index["packs"].append({
            "campaign_id": campaign["id"],
            "title": pack["title"],
            "pack": (target / "pack.json").relative_to(out_dir).as_posix(),
            "production": (target / "production.md").relative_to(out_dir).as_posix(),
            "asset_status": campaign["asset_status"],
        })
    (out_dir / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return index


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--campaign", type=Path, default=ROOT / "experiments" / "campaign.json")
    parser.add_argument("--out", type=Path, default=ROOT / "examples" / "campaign-packs")
    args = parser.parse_args(argv)
    try:
        result = build_all(args.campaign, args.out)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
