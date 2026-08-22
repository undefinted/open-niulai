#!/usr/bin/env python3
"""Create and advance an Open NiuLai production project."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import os
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

try:
    from scripts.build_open_niulai_pack import PackInput, TEMPLATES, build_pack, to_markdown
    from scripts import local_svd_adapter, runway_adapter
except ModuleNotFoundError:
    from build_open_niulai_pack import PackInput, TEMPLATES, build_pack, to_markdown
    import local_svd_adapter
    import runway_adapter


REMOTE_PROVIDERS = ("runway", "kling", "seedance")
PROVIDERS = (*REMOTE_PROVIDERS, "local-svd")
STATES = ("awaiting_images", "video_ready", "submitted", "completed", "failed")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def infer_subject(prompt: str) -> str:
    titled = re.search(r"《\s*([^《》]{1,20}?)来\s*》", prompt)
    if titled:
        return titled.group(1).strip()
    token = re.search(r"([\w\u3400-\u9fff]{1,16})来(?:\b|[，。！？：:、\s])", prompt)
    if token:
        return token.group(1).strip()
    raise ValueError("could not infer the X in X来; pass --subject explicitly")


def project_id(subject: str, prompt: str) -> str:
    digest = hashlib.sha256(f"{subject}\0{prompt}".encode("utf-8")).hexdigest()[:8]
    return f"x-lai-{digest}"


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def make_video_job(pack: dict, provider: str, first_frame: str | None) -> dict:
    shot = pack["video_shots"][0]
    provider_prompt = shot[f"{provider}_prompt"]
    return {
        "schema_version": "0.1.0",
        "status": "prepared" if first_frame else "awaiting_first_frame",
        "provider": provider,
        "duration_seconds": pack["constraint_report"]["duration_seconds"],
        "input_image": first_frame,
        "prompt": provider_prompt,
        "subtitle": shot["subtitle"],
        "voiceover": shot["voiceover"],
        "negative_prompt": shot["negative_prompt"],
        "camera": shot["camera"],
        "submission": {"mode": "external_adapter_required"},
    }


def status_markdown(meta: dict) -> str:
    checks = {
        "Content pack": True,
        "Image prompts": True,
        "Character reference": bool(meta["assets"].get("character_reference")),
        "Poster": bool(meta["assets"].get("poster")),
        "First frame": bool(meta["assets"].get("first_frame")),
        "Video ready": meta["state"] in {"video_ready", "submitted", "completed"},
        "Generated video": bool(meta["assets"].get("generated_video")),
    }
    rows = [f"# {meta['title']} Status", "", f"State: `{meta['state']}`", ""]
    rows.extend(f"- [{'x' if done else ' '}] {label}" for label, done in checks.items())
    rows += ["", f"Updated: `{meta['updated_at']}`", ""]
    return "\n".join(rows)


def refresh_status(root: Path, meta: dict) -> None:
    meta["updated_at"] = utc_now()
    write_json(root / "project.json", meta)
    (root / "STATUS.md").write_text(status_markdown(meta), encoding="utf-8")


def create_project(args: argparse.Namespace) -> dict:
    subject = args.subject or infer_subject(args.prompt)
    root = args.out.resolve()
    if root.exists() and any(root.iterdir()) and not args.force:
        raise ValueError(f"output directory is not empty: {root}; use --force only for a disposable draft")
    root.mkdir(parents=True, exist_ok=True)
    pack = build_pack(PackInput(subject, args.prompt, args.tone, args.template, args.duration, args.required_line, args.platform, args.language))
    now = utc_now()
    meta = {
        "schema_version": "0.1.0",
        "project_id": project_id(subject, args.prompt),
        "title": pack["title"],
        "state": "awaiting_images",
        "created_at": now,
        "updated_at": now,
        "assets": {"poster": None, "character_reference": None, "first_frame": None, "generated_video": None},
        "providers": list(PROVIDERS),
        "rights_note": pack["rights_note"],
    }
    write_json(root / "content" / "pack.json", pack)
    (root / "content" / "production.md").write_text(to_markdown(pack), encoding="utf-8")
    for name, prompt in pack["image_prompts"].items():
        prompt_dir = root / "prompts"
        prompt_dir.mkdir(parents=True, exist_ok=True)
        (prompt_dir / f"{name}.txt").write_text(prompt + "\n", encoding="utf-8")
    for provider in REMOTE_PROVIDERS:
        write_json(root / "video" / provider / "video-job.json", make_video_job(pack, provider, None))
    write_json(root / "publish" / "copy.json", pack["publishing_copy"])
    assets_readme = "# Assets\n\nPlace generated files here through `attach-first-frame` or record poster/reference paths in `project.json`. Do not use protected film assets.\n"
    (root / "assets").mkdir(parents=True, exist_ok=True)
    (root / "assets" / "README.md").write_text(assets_readme, encoding="utf-8")
    refresh_status(root, meta)
    return meta


def load_project(root: Path) -> dict:
    project_file = root / "project.json"
    if not project_file.is_file():
        raise ValueError(f"not an Open NiuLai project: {root}")
    return json.loads(project_file.read_text(encoding="utf-8"))


def attach_first_frame(args: argparse.Namespace) -> dict:
    args.kind = "first_frame"
    return attach_asset(args)


def attach_asset(args: argparse.Namespace) -> dict:
    root = args.project.resolve()
    meta = load_project(root)
    source = args.image.resolve()
    if not source.is_file():
        raise ValueError(f"asset image not found: {source}")
    suffix = source.suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise ValueError("first frame must be PNG, JPEG, or WebP")
    names = {"poster": "poster", "character_reference": "character-reference", "first_frame": "first-frame"}
    kind = args.kind
    target = root / "assets" / f"{names[kind]}{suffix}"
    if target.exists() and not args.replace:
        raise ValueError(f"{kind} already exists; pass --replace to update it")
    shutil.copy2(source, target)
    relative = target.relative_to(root).as_posix()
    meta["assets"][kind] = relative
    if kind == "first_frame":
        meta["state"] = "video_ready"
        pack = json.loads((root / "content" / "pack.json").read_text(encoding="utf-8"))
        for provider in REMOTE_PROVIDERS:
            write_json(root / "video" / provider / "video-job.json", make_video_job(pack, provider, relative))
    refresh_status(root, meta)
    return meta


def attach_video(args: argparse.Namespace) -> dict:
    root = args.project.resolve()
    meta = load_project(root)
    source = args.video.resolve()
    if not source.is_file() or source.suffix.lower() not in {".mp4", ".mov", ".webm"}:
        raise ValueError(f"generated video not found or unsupported: {source}")
    target = root / "assets" / f"generated-video{source.suffix.lower()}"
    if target.exists() and not args.replace:
        raise ValueError("generated video already exists; pass --replace to update it")
    shutil.copy2(source, target)
    meta["assets"]["generated_video"] = target.relative_to(root).as_posix()
    meta["state"] = "completed"
    meta["completed_provider"] = args.provider
    if args.task_id:
        meta["provider_task_id"] = args.task_id
    refresh_status(root, meta)
    return meta


def show_status(args: argparse.Namespace) -> dict:
    return load_project(args.project.resolve())


def generate_video(args: argparse.Namespace) -> dict:
    root = args.project.resolve()
    meta = load_project(root)
    job_path = root / "video" / "runway" / "video-job.json"
    job = json.loads(job_path.read_text(encoding="utf-8"))
    if job.get("status") != "prepared" or not job.get("input_image"):
        raise ValueError("project needs an attached first frame before video generation")
    output = root / "assets" / "generated-video.mp4"
    state_path = root / "video" / "runway" / "runway-task.json"
    payload = runway_adapter.build_payload(job, args.model, args.ratio, root)
    if not args.submit:
        return {
            "mode": "dry-run",
            "project_id": meta["project_id"],
            "provider": "runway",
            "request": {**payload, "promptImage": f"<data-uri:{len(payload['promptImage'])} chars>"},
        }
    secret = os.environ.get("RUNWAYML_API_SECRET")
    if not secret:
        raise ValueError("RUNWAYML_API_SECRET is not set; configure it locally and rerun with --submit")
    resume_task_id = args.resume_task
    if not resume_task_id and state_path.is_file():
        saved = json.loads(state_path.read_text(encoding="utf-8"))
        if saved.get("status") == "SUCCEEDED" and output.is_file():
            result = saved
        else:
            resume_task_id = saved.get("task_id")
            result = runway_adapter.submit(job, secret, output, args.model, args.ratio, state_path, resume_task_id, root)
    else:
        result = runway_adapter.submit(job, secret, output, args.model, args.ratio, state_path, resume_task_id, root)
    meta["assets"]["generated_video"] = output.relative_to(root).as_posix()
    meta["state"] = "completed"
    meta["completed_provider"] = "runway"
    meta["provider_task_id"] = result["task_id"]
    refresh_status(root, meta)
    return {"project": meta, "generation": result}


def generate_local_video(args: argparse.Namespace) -> dict:
    root = args.project.resolve()
    meta = load_project(root)
    first_frame = meta["assets"].get("first_frame")
    if not first_frame:
        raise ValueError("project needs an attached first frame before local video generation")
    image = root / first_frame
    output = root / "assets" / "generated-video-local-svd.mp4"
    provenance = root / "video" / "local-svd" / "provenance.json"
    local_args = argparse.Namespace(
        image=image,
        out=output,
        cache_dir=args.cache_dir,
        provenance=provenance,
        model=args.model,
        num_frames=args.num_frames,
        fps=args.fps,
        seed=args.seed,
        motion_bucket_id=args.motion_bucket_id,
        noise_aug_strength=args.noise_aug_strength,
        decode_chunk_size=args.decode_chunk_size,
        inference_steps=args.inference_steps,
        accept_model_license=args.accept_model_license,
        run=args.run,
    )
    result = local_svd_adapter.generate(local_args)
    if result.get("status") != "SUCCEEDED":
        return {"project_id": meta["project_id"], "provider": "local-svd", "generation": result}
    if not output.is_file() or not provenance.is_file():
        raise ValueError("local SVD reported success without durable video and provenance files")
    meta["assets"]["generated_video"] = output.relative_to(root).as_posix()
    meta["state"] = "completed"
    meta["completed_provider"] = "local-svd"
    meta["model_revision"] = result["model_revision"]
    meta["video_provenance"] = provenance.relative_to(root).as_posix()
    refresh_status(root, meta)
    return {"project": meta, "generation": result}


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create", help="Turn one prompt into a production project")
    create.add_argument("prompt")
    create.add_argument("--subject")
    create.add_argument("--tone", default="meme")
    create.add_argument("--template", choices=sorted(TEMPLATES), default="ad_hook")
    create.add_argument("--duration", type=int, default=5)
    create.add_argument("--required-line")
    create.add_argument("--platform", default="通用短视频")
    create.add_argument("--language", default="zh-CN")
    create.add_argument("--out", type=Path, required=True)
    create.add_argument("--force", action="store_true")
    create.set_defaults(handler=create_project)

    attach = commands.add_parser("attach-first-frame", help="Attach an image and prepare provider jobs")
    attach.add_argument("--project", type=Path, required=True)
    attach.add_argument("--image", type=Path, required=True)
    attach.add_argument("--replace", action="store_true")
    attach.set_defaults(handler=attach_first_frame)

    asset = commands.add_parser("attach-asset", help="Register a generated poster, character reference, or first frame")
    asset.add_argument("--project", type=Path, required=True)
    asset.add_argument("--kind", choices=("poster", "character_reference", "first_frame"), required=True)
    asset.add_argument("--image", type=Path, required=True)
    asset.add_argument("--replace", action="store_true")
    asset.set_defaults(handler=attach_asset)

    video = commands.add_parser("attach-video", help="Register a real generated video and complete the project")
    video.add_argument("--project", type=Path, required=True)
    video.add_argument("--video", type=Path, required=True)
    video.add_argument("--provider", choices=PROVIDERS, required=True)
    video.add_argument("--task-id")
    video.add_argument("--replace", action="store_true")
    video.set_defaults(handler=attach_video)

    generate = commands.add_parser("generate-video", help="Dry-run or submit the project's Runway video job")
    generate.add_argument("--project", type=Path, required=True)
    generate.add_argument("--model", default="gen4.5")
    generate.add_argument("--ratio", default="960:960")
    generate.add_argument("--resume-task")
    generate.add_argument("--submit", action="store_true", help="Explicitly authorize a paid Runway generation")
    generate.set_defaults(handler=generate_video)

    local = commands.add_parser("generate-local-video", help="Dry-run or generate locally with Stable Video Diffusion")
    local.add_argument("--project", type=Path, required=True)
    local.add_argument("--cache-dir", type=Path, required=True)
    local.add_argument("--model", default=local_svd_adapter.DEFAULT_MODEL)
    local.add_argument("--num-frames", type=int, default=25)
    local.add_argument("--fps", type=int, default=7)
    local.add_argument("--seed", type=int, default=42)
    local.add_argument("--motion-bucket-id", type=int, default=90)
    local.add_argument("--noise-aug-strength", type=float, default=0.03)
    local.add_argument("--decode-chunk-size", type=int, default=2)
    local.add_argument("--inference-steps", type=int, default=20)
    local.add_argument("--accept-model-license", action="store_true")
    local.add_argument("--run", action="store_true", help="Download weights if needed and perform GPU inference")
    local.set_defaults(handler=generate_local_video)

    status = commands.add_parser("status", help="Print machine-readable project status")
    status.add_argument("--project", type=Path, required=True)
    status.set_defaults(handler=show_status)
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        result = args.handler(args)
    except (OSError, json.JSONDecodeError, ValueError, runway_adapter.RunwayError, local_svd_adapter.LocalSVDError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
