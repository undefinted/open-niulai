#!/usr/bin/env python3
"""Submit an Open NiuLai video job to Runway with explicit cost consent."""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


ROOT = Path(__file__).parents[1]
BASE_URL = "https://api.dev.runwayml.com/v1"
API_VERSION = "2024-11-06"
TERMINAL = {"SUCCEEDED", "FAILED", "CANCELED"}


class RunwayError(RuntimeError):
    pass


def utf16_units(value: str) -> int:
    return len(value.encode("utf-16-le")) // 2


def image_data_uri(path: Path) -> str:
    size = path.stat().st_size
    if size > 5 * 1024 * 1024:
        raise RunwayError("Runway data-URI images must be 5MB or smaller")
    mime = mimetypes.guess_type(path.name)[0]
    if mime not in {"image/png", "image/jpeg", "image/webp"}:
        raise RunwayError(f"unsupported image type: {mime or 'unknown'}")
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def build_payload(job: dict, model: str = "gen4.5", ratio: str = "960:960", asset_root: Path = ROOT) -> dict:
    prompt = job["prompt"].strip()
    if not prompt or utf16_units(prompt) > 1000:
        raise RunwayError("Runway prompt must contain 1-1000 UTF-16 code units")
    if job["duration_seconds"] < 2 or job["duration_seconds"] > 10:
        raise RunwayError("Runway duration must be between 2 and 10 seconds")
    image_path = (asset_root / job["input_image"]).resolve()
    if not image_path.is_file():
        raise RunwayError(f"input image not found: {image_path}")
    return {
        "model": model,
        "promptImage": image_data_uri(image_path),
        "promptText": prompt,
        "ratio": ratio,
        "duration": job["duration_seconds"],
    }


def api_json(method: str, path: str, secret: str, body: dict | None = None, timeout: int = 60) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(
        BASE_URL + path,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {secret}",
            "X-Runway-Version": API_VERSION,
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RunwayError(f"Runway HTTP {exc.code}: {detail[:500]}") from exc
    except (URLError, TimeoutError) as exc:
        raise RunwayError(f"Runway network error: {exc}") from exc


def wait_for_task(task_id: str, secret: str, timeout_seconds: int = 600, poll_seconds: int = 5) -> dict:
    deadline = time.monotonic() + timeout_seconds
    while True:
        task = api_json("GET", f"/tasks/{task_id}", secret)
        status = task.get("status")
        if status in TERMINAL:
            return task
        if time.monotonic() >= deadline:
            raise RunwayError(f"task {task_id} timed out; it may still be running remotely")
        time.sleep(poll_seconds)


def download(url: str, destination: Path, timeout: int = 120) -> None:
    request = Request(url, method="GET")
    try:
        with urlopen(request, timeout=timeout) as response:
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = destination.with_suffix(destination.suffix + ".part")
            with temporary.open("wb") as target:
                while chunk := response.read(1024 * 1024):
                    target.write(chunk)
            temporary.replace(destination)
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RunwayError(f"could not download Runway output: {exc}") from exc


def write_state(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def validate_video(path: Path) -> dict:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise RunwayError("ffprobe is required to validate downloaded video")
    command = [
        ffprobe, "-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height",
        "-of", "json", str(path),
    ]
    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if completed.returncode:
        raise RunwayError(f"downloaded output is not valid media: {completed.stderr.strip()[:300]}")
    probe = json.loads(completed.stdout)
    videos = [stream for stream in probe.get("streams", []) if stream.get("codec_type") == "video"]
    if not videos or float(probe.get("format", {}).get("duration", 0)) <= 0:
        raise RunwayError("downloaded output has no playable video stream")
    return {"duration": float(probe["format"]["duration"]), "video_stream": videos[0]}


def submit(
    job: dict,
    secret: str,
    output_path: Path,
    model: str = "gen4.5",
    ratio: str = "960:960",
    state_path: Path | None = None,
    resume_task_id: str | None = None,
    asset_root: Path = ROOT,
) -> dict:
    state_path = state_path or output_path.with_suffix(".runway-task.json")
    task_id = resume_task_id
    if not task_id:
        created = api_json("POST", "/image_to_video", secret, build_payload(job, model, ratio, asset_root))
        task_id = created.get("id")
        if not task_id:
            raise RunwayError("Runway response did not include a task id")
        write_state(state_path, {"task_id": task_id, "status": "SUBMITTED", "output_file": str(output_path.as_posix())})
    task = wait_for_task(task_id, secret)
    write_state(state_path, {"task_id": task_id, "status": task.get("status"), "task": task, "output_file": str(output_path.as_posix())})
    if task.get("status") != "SUCCEEDED":
        raise RunwayError(f"Runway task ended with {task.get('status')}: {json.dumps(task, ensure_ascii=False)[:500]}")
    outputs = task.get("output") or []
    if not outputs:
        raise RunwayError("successful Runway task did not include an output URL")
    download(outputs[0], output_path)
    media = validate_video(output_path)
    result = {"task_id": task_id, "status": "SUCCEEDED", "output_file": str(output_path.as_posix()), "media": media}
    write_state(state_path, result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--job", type=Path, required=True, help="video-job.json from build_video_job.py")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--model", default="gen4.5")
    parser.add_argument("--ratio", default="960:960")
    parser.add_argument("--asset-root", type=Path, default=ROOT, help="Directory used to resolve input_image")
    parser.add_argument("--state", type=Path, help="Persistent task state (defaults beside --out)")
    parser.add_argument("--resume-task", help="Resume an existing paid task without creating another")
    parser.add_argument("--submit", action="store_true", help="Explicitly authorize a paid external generation")
    args = parser.parse_args(argv)
    try:
        job = json.loads(args.job.read_text(encoding="utf-8"))
        payload = build_payload(job, args.model, args.ratio, args.asset_root)
        summary = {**payload, "promptImage": f"<data-uri:{len(payload['promptImage'])} chars>"}
        if not args.submit:
            print(json.dumps({"mode": "dry-run", "request": summary}, ensure_ascii=False, indent=2))
            return 0
        secret = os.environ.get("RUNWAYML_API_SECRET")
        if not secret:
            raise RunwayError("RUNWAYML_API_SECRET is not set; configure it locally and rerun with --submit")
        state_path = args.state or args.out.with_suffix(".runway-task.json")
        resume_task_id = args.resume_task
        if not resume_task_id and state_path.is_file():
            saved = json.loads(state_path.read_text(encoding="utf-8"))
            if saved.get("status") == "SUCCEEDED" and args.out.is_file():
                print(json.dumps(saved, ensure_ascii=False, indent=2))
                return 0
            resume_task_id = saved.get("task_id")
        print(json.dumps(submit(job, secret, args.out, args.model, args.ratio, state_path, resume_task_id, args.asset_root), ensure_ascii=False, indent=2))
        return 0
    except (OSError, json.JSONDecodeError, RunwayError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
