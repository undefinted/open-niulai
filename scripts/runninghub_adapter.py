#!/usr/bin/env python3
"""RunningHub workflow API adapter."""

from __future__ import annotations

import base64
import json
import re
import secrets
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BASE_URL = "https://www.runninghub.ai"
VIDEO_TYPES = {"mp4", "webm", "mov", "m4v"}


class RunningHubError(RuntimeError):
    pass


def _request(path: str, api_key: str, body: dict, timeout: int = 90) -> object:
    if len(api_key) < 12:
        raise RunningHubError("请先连接有效的 RunningHub API Key。")
    data = json.dumps({"apiKey": api_key, **body}).encode("utf-8")
    request = Request(
        BASE_URL + path,
        data=data,
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RunningHubError(f"RunningHub HTTP {exc.code}：{detail[:300]}") from exc
    except (URLError, TimeoutError) as exc:
        raise RunningHubError(f"RunningHub 网络错误：{exc}") from exc
    if result.get("code") != 0:
        raise RunningHubError(f"RunningHub {result.get('code', '错误')}：{result.get('msg', '请求失败')}")
    return result.get("data")


def build_node_info(payload: dict, uploaded_file_name: str | None = None) -> list[dict]:
    prompt = str(payload.get("prompt", "")).strip()
    if not prompt or len(prompt) > 7000:
        raise RunningHubError("工作流提示词长度必须为 1-7000 个字符。")

    def valid(value: object, label: str) -> str:
        text = str(value or "").strip()
        if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,100}", text):
            raise RunningHubError(f"{label}无效。")
        return text

    nodes = [{"nodeId": valid(payload.get("prompt_node_id"), "提示词节点 ID"), "fieldName": valid(payload.get("prompt_field", "text"), "提示词字段名"), "fieldValue": prompt}]
    if uploaded_file_name:
        nodes.append({"nodeId": valid(payload.get("image_node_id"), "图片节点 ID"), "fieldName": valid(payload.get("image_field", "image"), "图片字段名"), "fieldValue": uploaded_file_name})
    return nodes


def create_task(api_key: str, payload: dict) -> tuple[str, str]:
    workflow_id = str(payload.get("workflow_id", "")).strip()
    if not re.fullmatch(r"\d{6,30}", workflow_id):
        raise RunningHubError("RunningHub 工作流 ID 无效。")
    body = {
        "workflowId": workflow_id,
        "nodeInfoList": build_node_info(payload, str(payload.get("uploaded_file_name", "")).strip() or None),
        "addMetadata": True,
    }
    if str(payload.get("access_password", "")).strip():
        body["accessPassword"] = str(payload["access_password"]).strip()
    data = _request("/task/openapi/create", api_key, body)
    if not isinstance(data, dict) or not data.get("taskId"):
        raise RunningHubError("RunningHub 响应未返回任务 ID，未自动重试以避免重复扣费。")
    return str(data["taskId"]), str(data.get("taskStatus", "queued")).lower()


def query_outputs(api_key: str, task_id: str) -> dict:
    data = _request("/task/openapi/outputs", api_key, {"taskId": task_id})
    if isinstance(data, list):
        outputs = [
            {"url": item.get("fileUrl") or item.get("url"), "type": str(item.get("fileType") or item.get("outputType") or "").lower()}
            for item in data if item.get("fileUrl") or item.get("url")
        ]
        video = next((item for item in outputs if item["type"] in VIDEO_TYPES), None)
        return {
            "status": "succeeded" if video else "failed" if outputs else "running",
            "outputs": outputs,
            "video_url": video["url"] if video else None,
            "error": "工作流已完成，但输出节点没有返回 MP4、WebM、MOV 或 M4V 视频。" if outputs and not video else None,
        }
    if isinstance(data, dict):
        status = str(data.get("taskStatus") or data.get("status") or "running").lower()
        return {"status": {"success": "succeeded"}.get(status, status), "outputs": [], "video_url": None}
    return {"status": "running", "outputs": [], "video_url": None}


def upload_data_url(api_key: str, data_url: str, filename: str = "first-frame.png", timeout: int = 120) -> str:
    match = re.fullmatch(r"data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)", data_url)
    if not match:
        raise RunningHubError("首帧必须是 JPG、PNG 或 WebP 图片。")
    try:
        content = base64.b64decode(match.group(2), validate=True)
    except ValueError as exc:
        raise RunningHubError("首帧图片数据已损坏，请重新选择图片。") from exc
    if len(content) > 10 * 1024 * 1024:
        raise RunningHubError("首帧图片不能超过 10 MB。")
    boundary = "----OpenNiuLai" + secrets.token_hex(12)
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", filename)
    parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"apiKey\"\r\n\r\n{api_key}\r\n".encode(),
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"fileType\"\r\n\r\ninput\r\n".encode(),
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{safe_name}\"\r\nContent-Type: {match.group(1)}\r\n\r\n".encode() + content + b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    request = Request(
        BASE_URL + "/task/openapi/upload", data=b"".join(parts), method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RunningHubError(f"RunningHub 上传失败：{exc}") from exc
    if result.get("code") != 0 or not result.get("data", {}).get("fileName"):
        raise RunningHubError(f"RunningHub 上传失败：{result.get('msg', '未返回文件名')}")
    return str(result["data"]["fileName"])
