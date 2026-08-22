#!/usr/bin/env python3
"""Generate a local image-to-video clip with Stable Video Diffusion."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


DEFAULT_MODEL = "stabilityai/stable-video-diffusion-img2vid-xt"
MODEL_LICENSE = f"https://huggingface.co/{DEFAULT_MODEL}/blob/main/LICENSE.md"


class LocalSVDError(RuntimeError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def prepare_image(path: Path, size: tuple[int, int] = (1024, 576)):
    try:
        from PIL import Image, ImageOps
    except ImportError as exc:
        raise LocalSVDError("Pillow is required for the local SVD backend") from exc
    if not path.is_file():
        raise LocalSVDError(f"input image not found: {path}")
    with Image.open(path) as source:
        image = ImageOps.fit(source.convert("RGB"), size, method=Image.Resampling.LANCZOS)
    return image


def validate_video(path: Path) -> dict:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise LocalSVDError("ffprobe is required to validate generated video")
    completed = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,nb_frames", "-of", "json", str(path)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if completed.returncode:
        raise LocalSVDError(f"generated output is not valid media: {completed.stderr.strip()[:300]}")
    probe = json.loads(completed.stdout)
    videos = [stream for stream in probe.get("streams", []) if stream.get("codec_type") == "video"]
    duration = float(probe.get("format", {}).get("duration", 0))
    if not videos or duration <= 0:
        raise LocalSVDError("generated output has no playable video stream")
    return {"duration": duration, "video_stream": videos[0]}


def plan(args: argparse.Namespace) -> dict:
    return {
        "mode": "local-svd",
        "model": args.model,
        "model_license": MODEL_LICENSE,
        "input_image": str(args.image.resolve()),
        "output_file": str(args.out.resolve()),
        "cache_dir": str(args.cache_dir.resolve()),
        "width": 1024,
        "height": 576,
        "num_frames": args.num_frames,
        "fps": args.fps,
        "seed": args.seed,
        "motion_bucket_id": args.motion_bucket_id,
        "noise_aug_strength": args.noise_aug_strength,
        "decode_chunk_size": args.decode_chunk_size,
        "inference_steps": args.inference_steps,
        "memory_strategy": "fp16 + model CPU offload + UNet forward chunking",
    }


def generate(args: argparse.Namespace) -> dict:
    if not args.accept_model_license:
        raise LocalSVDError(f"model use requires explicit --accept-model-license after reviewing {MODEL_LICENSE}")
    if not args.run:
        return {"status": "dry-run", **plan(args)}
    try:
        import torch
        from diffusers import StableVideoDiffusionPipeline
        from diffusers.utils import export_to_video
        from huggingface_hub import model_info
    except ImportError as exc:
        raise LocalSVDError("install torch, diffusers, transformers, accelerate, huggingface_hub, and imageio-ffmpeg") from exc
    if not torch.cuda.is_available():
        raise LocalSVDError("CUDA GPU is required for the local SVD backend")

    image = prepare_image(args.image)
    revision = model_info(args.model).sha
    pipeline = StableVideoDiffusionPipeline.from_pretrained(
        args.model,
        revision=revision,
        cache_dir=args.cache_dir,
        torch_dtype=torch.float16,
        variant="fp16",
    )
    pipeline.enable_model_cpu_offload()
    pipeline.unet.enable_forward_chunking()
    generator = torch.manual_seed(args.seed)
    frames = pipeline(
        image,
        num_frames=args.num_frames,
        num_inference_steps=args.inference_steps,
        decode_chunk_size=args.decode_chunk_size,
        generator=generator,
        motion_bucket_id=args.motion_bucket_id,
        noise_aug_strength=args.noise_aug_strength,
    ).frames[0]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.out.with_name(args.out.stem + ".part.mp4")
    export_to_video(frames, temporary, fps=args.fps)
    media = validate_video(temporary)
    temporary.replace(args.out)
    provenance = {
        "schema_version": "0.1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "backend": "local-svd",
        "model": args.model,
        "model_revision": revision,
        "model_license": MODEL_LICENSE,
        "source_image": str(args.image.resolve()),
        "source_image_sha256": sha256(args.image),
        "output_file": str(args.out.resolve()),
        "output_sha256": sha256(args.out),
        "parameters": {key: value for key, value in plan(args).items() if key not in {"mode", "model", "model_license", "input_image", "output_file", "cache_dir"}},
        "media": media,
        "hardware": {"gpu": torch.cuda.get_device_name(0), "torch": torch.__version__, "cuda": torch.version.cuda},
    }
    provenance_path = args.provenance or args.out.with_suffix(".provenance.json")
    temporary_json = provenance_path.with_suffix(provenance_path.suffix + ".tmp")
    temporary_json.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary_json.replace(provenance_path)
    return {"status": "SUCCEEDED", **provenance, "provenance_file": str(provenance_path.resolve())}


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--image", type=Path, required=True)
    result.add_argument("--out", type=Path, required=True)
    result.add_argument("--cache-dir", type=Path, required=True)
    result.add_argument("--provenance", type=Path)
    result.add_argument("--model", default=DEFAULT_MODEL)
    result.add_argument("--num-frames", type=int, default=25)
    result.add_argument("--fps", type=int, default=7)
    result.add_argument("--seed", type=int, default=42)
    result.add_argument("--motion-bucket-id", type=int, default=90)
    result.add_argument("--noise-aug-strength", type=float, default=0.03)
    result.add_argument("--decode-chunk-size", type=int, default=2)
    result.add_argument("--inference-steps", type=int, default=20)
    result.add_argument("--accept-model-license", action="store_true")
    result.add_argument("--run", action="store_true", help="Download weights if needed and perform GPU inference")
    return result


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        result = generate(args)
    except (OSError, ValueError, json.JSONDecodeError, LocalSVDError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
