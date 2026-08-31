#!/usr/bin/env python3
"""Check repository artifacts required for an Open NiuLai release."""

from __future__ import annotations

import json
import hashlib
import re
import shutil
import subprocess
import sys
import argparse
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

AI_VIDEO_PROVENANCE_GLOB = "assets/demo/*.ai-video.provenance.json"


def markdown_links(text: str) -> list[str]:
    return re.findall(r"(?<!!)\[[^\]]+\]\(([^)]+)\)|!\[[^\]]*\]\(([^)]+)\)", text)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def probe_video(path: Path) -> str | None:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return "ffprobe is required for the AI-video release gate"
    completed = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", str(path)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if completed.returncode:
        return f"AI video is not valid media: {path.relative_to(ROOT)}"
    payload = json.loads(completed.stdout)
    duration = float(payload.get("format", {}).get("duration", 0))
    has_video = any(stream.get("codec_type") == "video" for stream in payload.get("streams", []))
    if not has_video or duration <= 0:
        return f"AI video has no playable video stream: {path.relative_to(ROOT)}"
    return None


def check_ai_video() -> list[str]:
    errors: list[str] = []
    provenance_files = sorted(ROOT.glob(AI_VIDEO_PROVENANCE_GLOB))
    if not provenance_files:
        return [f"no real AI-video provenance found ({AI_VIDEO_PROVENANCE_GLOB})"]
    valid = 0
    for provenance_path in provenance_files:
        try:
            data = json.loads(provenance_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"invalid AI-video provenance {provenance_path.relative_to(ROOT)}: {exc}")
            continue
        required = ("backend", "model", "model_revision", "generated_at", "source_image", "source_image_sha256", "output_file", "output_sha256")
        missing = [field for field in required if not data.get(field)]
        if missing:
            errors.append(f"AI-video provenance {provenance_path.relative_to(ROOT)} missing: {', '.join(missing)}")
            continue
        output = Path(data["output_file"])
        source = Path(data["source_image"])
        if output.is_absolute() or source.is_absolute():
            errors.append(f"AI-video provenance must use repository-relative media paths: {provenance_path.relative_to(ROOT)}")
            continue
        output = ROOT / output
        source = ROOT / source
        if not output.is_file() or not source.is_file():
            errors.append(f"AI-video provenance references missing media: {provenance_path.relative_to(ROOT)}")
            continue
        if sha256(output) != data["output_sha256"] or sha256(source) != data["source_image_sha256"]:
            errors.append(f"AI-video provenance hash mismatch: {provenance_path.relative_to(ROOT)}")
            continue
        media_error = probe_video(output)
        if media_error:
            errors.append(media_error)
            continue
        valid += 1
    if valid == 0 and not errors:
        errors.append("no AI video passed the release gate")
    return errors


def check(require_ai_video: bool = False) -> list[str]:
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
    if require_ai_video:
        errors.extend(check_ai_video())
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-ai-video", action="store_true", help="Require and validate at least one real model-generated MP4")
    args = parser.parse_args(argv)
    errors = check(require_ai_video=args.require_ai_video)
    if errors:
        print("Release check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    if args.require_ai_video:
        print("Release structure and real AI-video gate are valid.")
    else:
        print("Release structure is valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
