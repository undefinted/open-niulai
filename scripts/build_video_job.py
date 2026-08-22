#!/usr/bin/env python3
"""Build a provider-ready video job and optional local MP4 preview."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


ROOT = Path(__file__).parents[1]
DEFAULT_MANIFEST = ROOT / "examples" / "demo-manifest.json"
PROVIDERS = ("runway", "kling", "seedance")


@dataclass(frozen=True)
class VideoJobInput:
    demo_id: str
    provider: str
    duration: int = 5
    subtitle: str | None = None


def load_demo(demo_id: str, manifest_path: Path = DEFAULT_MANIFEST) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for demo in manifest["demos"]:
        if demo["id"] == demo_id:
            return demo
    raise ValueError(f"unknown demo id: {demo_id}")


def identity_prompt(lock: dict) -> str:
    palette = ", ".join(lock["palette"])
    return (
        f"Preserve identity exactly: silhouette={lock['silhouette']}; palette={palette}; "
        f"face={lock['face']}; surface={lock['wardrobe_or_surface']}; "
        f"anchor prop={lock['anchor_prop']}; repeatable defect={lock['damage_signature']}."
    )


def motion_for(demo_id: str) -> str:
    motions = {
        "jiafang-lai": "The subject raises its head stiffly; mouth movement starts late; the top paper slides off the stack. Feet stay planted and slightly clip into the floor.",
        "mao-lai": "The cat slides forward one body length without a natural walk cycle; the kinked tail twitches once; the hanging wrapper swings late.",
        "code-lai": "The subject wakes with one jerky head tilt; the semicolon prop lifts a few centimeters; blank error windows blink once while the red button remains distant.",
        "gou-lai": "The dog raises its brick head in one stiff movement; the spiral tail turns a quarter rotation; the strapped bone lags behind while the disconnected ankle stays visibly broken.",
        "laoban-lai": "The boss slides one table-width toward camera without moving its tiny legs; the blank strategy sheet tilts once; the detached shoulder bobs late while the smile never changes.",
        "gu-lai": "The candlestick climbs and slides up one altar step; the bent gold arrow wobbles, briefly points down, then points up again; the red-green body clipping remains visible.",
        "ai-lai": "The wrongly attached third arm unfolds late; the tethered cube jitters out of sync; the open torso mesh hole flickers once while the character stays planted.",
    }
    return motions.get(demo_id, "One stiff head raise and one small prop movement; keep the camera static.")


def build_job(data: VideoJobInput, manifest_path: Path = DEFAULT_MANIFEST) -> dict:
    if data.provider not in PROVIDERS:
        raise ValueError(f"provider must be one of: {', '.join(PROVIDERS)}")
    if data.duration not in (5, 10):
        raise ValueError("duration must be 5 or 10 seconds for the first-shot workflow")
    demo = load_demo(data.demo_id, manifest_path)
    image_relative = demo["assets"]["first_frame"]
    image_path = (ROOT / image_relative).resolve()
    if not image_path.is_file():
        raise ValueError(f"first frame does not exist: {image_path}")

    shared = (
        f"Original {demo['title']} shot. {identity_prompt(demo['identity_lock'])} "
        f"{motion_for(data.demo_id)} Deliberately crude low-frame-rate amateur 3D motion, "
        "flat lighting, awkward sincerity, one subject and one main action. Keep framing stable. "
        "Do not add text, logos, characters, limbs, cinematic light, smooth motion, or camera shake."
    )
    provider_instructions = {
        "runway": "Use the supplied image as the first frame. Keep the prompt concise and motion-led. ",
        "kling": "Use the supplied image as the subject reference and first frame; lock face, silhouette, palette, and prop. ",
        "seedance": "Use the supplied first frame plus character reference when the interface supports multiple references; preserve continuity. ",
    }
    subtitle = data.subtitle or {
        "jiafang-lai": "最后改一次。",
        "mao-lai": "会有的。",
        "code-lai": "它在我电脑上能跑。",
        "gou-lai": "这一世，我只找那根骨头。",
        "laoban-lai": "大家再坚持一下。",
        "gu-lai": "它会回来的。",
        "ai-lai": "这次一定一致。",
    }.get(data.demo_id, "它真的来了。")
    return {
        "schema_version": "0.1.0",
        "status": "prepared",
        "demo_id": data.demo_id,
        "title": demo["title"],
        "provider": data.provider,
        "duration_seconds": data.duration,
        "input_image": image_relative,
        "prompt": provider_instructions[data.provider] + shared,
        "subtitle": subtitle,
        "negative_prompt": "new subject, identity drift, extra limbs, readable generated text, logo, watermark, smooth cinematic animation",
        "submission": {
            "mode": "external_adapter_required",
            "note": "Upload input_image through the selected provider adapter, submit prompt, then poll to a terminal state.",
        },
    }


def srt_text(subtitle: str, duration: int) -> str:
    start_ms = 900 if duration == 5 else 1800
    end_ms = duration * 1000 - 500
    def stamp(ms: int) -> str:
        hours, rem = divmod(ms, 3_600_000)
        minutes, rem = divmod(rem, 60_000)
        seconds, millis = divmod(rem, 1000)
        return f"{hours:02}:{minutes:02}:{seconds:02},{millis:03}"
    return f"1\n{stamp(start_ms)} --> {stamp(end_ms)}\n{subtitle}\n"


def render_preview(job: dict, output_path: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required for --render-preview")
    frames = job["duration_seconds"] * 24
    output_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg, "-y", "-loop", "1", "-i", str((ROOT / job["input_image"]).resolve()),
        "-vf", f"scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,zoompan=z='min(zoom+0.00035,1.04)':d={frames}:s=1080x1080:fps=24,format=yuv420p",
        "-t", str(job["duration_seconds"]), "-an", "-c:v", "libx264", "-movflags", "+faststart", str(output_path),
    ]
    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if completed.returncode:
        raise RuntimeError(completed.stderr.strip() or "ffmpeg preview render failed")


def mux_subtitles(video_path: Path, srt_path: Path, output_path: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required for subtitle muxing")
    command = [
        ffmpeg, "-y", "-i", str(video_path), "-i", str(srt_path),
        "-map", "0:v:0", "-map", "1:0", "-c:v", "copy", "-c:s", "mov_text",
        "-metadata:s:s:0", "language=zho", "-movflags", "+faststart", str(output_path),
    ]
    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if completed.returncode:
        raise RuntimeError(completed.stderr.strip() or "ffmpeg subtitle mux failed")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo", required=True)
    parser.add_argument("--provider", choices=PROVIDERS, default="runway")
    parser.add_argument("--duration", type=int, choices=(5, 10), default=5)
    parser.add_argument("--subtitle")
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--render-preview", action="store_true")
    args = parser.parse_args(argv)

    try:
        job = build_job(VideoJobInput(args.demo, args.provider, args.duration, args.subtitle))
        args.out_dir.mkdir(parents=True, exist_ok=True)
        (args.out_dir / "video-job.json").write_text(json.dumps(job, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        subtitle_path = args.out_dir / "subtitles.srt"
        subtitle_path.write_text(srt_text(job["subtitle"], job["duration_seconds"]), encoding="utf-8-sig")
        if args.render_preview:
            preview = args.out_dir / "preview.mp4"
            captioned = args.out_dir / "preview-captioned.mp4"
            render_preview(job, preview)
            mux_subtitles(preview, subtitle_path, captioned)
            job["preview"] = str(preview.as_posix())
            job["captioned_preview"] = str(captioned.as_posix())
            (args.out_dir / "video-job.json").write_text(json.dumps(job, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (ValueError, RuntimeError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(job, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
