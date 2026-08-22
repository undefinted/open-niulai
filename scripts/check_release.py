#!/usr/bin/env python3
"""Check repository artifacts required for an Open NiuLai release."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).parents[1]
REQUIRED = (
    "README.md", "LICENSE", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md",
    "SKILL.md", "agents/openai.yaml", "docs/CLI.md", "docs/PLAN.md", "docs/RUNWAY.md",
    "docs/IP_POLICY.md", "docs/RELEASE.md", "docs/DEMO_PROVENANCE.md", "docs/LAUNCH.md", "docs/LOCAL_VIDEO.md",
    "docs/GROWTH_EXPERIMENTS.md", "experiments/campaign.json", "experiments/events.csv",
    "examples/campaign-packs/index.json",
    ".github/workflows/ci.yml", ".gitattributes",
)


def markdown_links(text: str) -> list[str]:
    return re.findall(r"(?<!!)\[[^\]]+\]\(([^)]+)\)|!\[[^\]]*\]\(([^)]+)\)", text)


def check() -> list[str]:
    errors: list[str] = []
    for relative in REQUIRED:
        if not (ROOT / relative).is_file():
            errors.append(f"missing required file: {relative}")

    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    for pair in markdown_links(readme):
        target = next((part for part in pair if part), "")
        if not target or "://" in target or target.startswith("#"):
            continue
        clean = target.split("#", 1)[0]
        if not (ROOT / clean).exists():
            errors.append(f"README link target does not exist: {target}")

    manifest = json.loads((ROOT / "examples" / "demo-manifest.json").read_text(encoding="utf-8"))
    for demo in manifest.get("demos", []):
        for role, relative in demo.get("assets", {}).items():
            if not (ROOT / relative).is_file():
                errors.append(f"demo {demo.get('id')} missing {role}: {relative}")

    forbidden_patterns = {
        "embedded Runway secret": re.compile(r"RUNWAYML_API_SECRET\s*=\s*[^\s<]", re.I),
        "ephemeral Runway output URL": re.compile(r"https://[^\s]+(?:cloudfront|runway)[^\s]*[?&](?:_jwt|token)=", re.I),
    }
    scan_suffixes = {".md", ".json", ".yml", ".yaml", ".py", ".toml"}
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in scan_suffixes or any(part in {"work", "build", ".pytest_cache", "__pycache__"} for part in path.parts):
            continue
        content = path.read_text(encoding="utf-8", errors="replace")
        for label, pattern in forbidden_patterns.items():
            if pattern.search(content):
                errors.append(f"{label} in {path.relative_to(ROOT)}")
    return errors


def main() -> int:
    errors = check()
    if errors:
        print("Release check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("Release structure is valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
