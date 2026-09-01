#!/usr/bin/env python3
"""Minimal MiniMax H3 Video Generation V2 client."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BASE_URLS = {"cn": "https://api.minimaxi.com", "global": "https://api.minimax.io"}
TERMINAL = {"succeeded", "failed", "cancelled", "expired"}


class MiniMaxH3Error(RuntimeError):
    pass


def build_payload(prompt: str, duration: int = 10, ratio: str = "16:9", first_frame_image: str | None = None) -> dict:
    prompt = prompt.strip()
    if not prompt or len(prompt) > 7000:
        raise MiniMaxH3Error("H3 视频提示词长度必须为 1-7000 个字符。")
    if not isinstance(duration, int) or not 4 <= duration <= 15:
        raise MiniMaxH3Error("H3 视频时长必须为 4-15 秒整数。")
    if ratio not in {"adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"}:
        raise MiniMaxH3Error("H3 视频比例无效。")
    content = [{"type": "text", "text": prompt}]
    if first_frame_image:
        if not first_frame_image.startswith(("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,")):
            raise MiniMaxH3Error("首帧必须是 JPG、PNG 或 WebP 图片。")
        content.append({"type": "image_url", "image_url": {"url": first_frame_image}, "role": "first_frame"})
        ratio = "adaptive"
    return {
        "model": "MiniMax-H3",
        "content": content,
        "resolution": "2K",
        "duration": duration,
        "ratio": ratio,
    }


def api_json(method: str, path: str, api_key: str, region: str, body: dict | None = None, timeout: int = 60) -> dict:
    if region not in BASE_URLS:
        raise MiniMaxH3Error("MiniMax 服务区域无效。")
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(
        BASE_URLS[region] + path,
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise MiniMaxH3Error(f"MiniMax HTTP {exc.code}: {detail[:400]}") from exc
    except (URLError, TimeoutError) as exc:
        raise MiniMaxH3Error(f"MiniMax 网络错误：{exc}") from exc
    base = result.get("base_resp") or {}
    if base.get("status_code") not in {None, 0}:
        raise MiniMaxH3Error(f"MiniMax {base.get('status_code')}：{base.get('status_msg', '请求失败')}")
    return result


def create_task(api_key: str, region: str, prompt: str, duration: int, ratio: str, first_frame_image: str | None = None) -> str:
    result = api_json("POST", "/v2/video_generation", api_key, region, build_payload(prompt, duration, ratio, first_frame_image))
    task_id = result.get("task_id")
    if not task_id:
        raise MiniMaxH3Error("MiniMax 响应未返回任务 ID，未自动重试以避免重复扣费。")
    return str(task_id)


def query_task(api_key: str, region: str, task_id: str) -> dict:
    result = api_json("GET", f"/v2/query/video_generation/{task_id}", api_key, region)
    task = result.get("task") or {}
    status = str(task.get("status", "queued")).lower()
    return {"status": status, "video_url": (task.get("content") or {}).get("url"), "raw": task}


def download_video(url: str, destination: Path, timeout: int = 180) -> None:
    if not url.startswith("https://"):
        raise MiniMaxH3Error("MiniMax 返回了不安全的视频地址。")
    temporary = destination.with_suffix(".part")
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urlopen(Request(url, method="GET"), timeout=timeout) as response, temporary.open("wb") as target:
            while chunk := response.read(1024 * 1024):
                target.write(chunk)
        if temporary.stat().st_size < 1024:
            raise MiniMaxH3Error("下载的视频文件异常。")
        temporary.replace(destination)
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        temporary.unlink(missing_ok=True)
        if isinstance(exc, MiniMaxH3Error):
            raise
        raise MiniMaxH3Error(f"MiniMax 视频下载失败：{exc}") from exc
