#!/usr/bin/env python3
"""Serve the zero-dependency Open NiuLai creator web app."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import secrets
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from scripts.build_open_niulai_pack import PackInput, TEMPLATES, build_pack
from scripts import minimax_h3_adapter, runninghub_adapter


ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
ASSET_ROOT = ROOT / "assets" / "demo"
GENERATED_ROOT = ROOT / "generated"
MAX_BODY_BYTES = 64 * 1024
SESSION_TTL_SECONDS = 4 * 60 * 60
SESSIONS: dict[str, dict] = {}
SESSIONS_LOCK = threading.Lock()
VIDEO_JOBS: dict[str, dict] = {}
VIDEO_JOBS_LOCK = threading.Lock()
PROVIDERS = [
    {"id": "minimax", "name": "MiniMax H3", "connection": "api_key", "status": "available", "account_url": "https://platform.minimaxi.com/"},
    {"id": "runninghub", "name": "RunningHub 工作流", "connection": "api_key", "status": "available", "account_url": "https://www.runninghub.ai/"},
    {"id": "runway", "name": "Runway", "connection": "api_key", "status": "available", "account_url": "https://app.runwayml.com/"},
    {"id": "kling", "name": "可灵", "connection": "external", "status": "export", "account_url": "https://klingai.kuaishou.com/"},
    {"id": "seedance", "name": "Seedance", "connection": "external", "status": "export", "account_url": "https://jimeng.jianying.com/"},
    {"id": "local-svd", "name": "本地 SVD", "connection": "local", "status": "demo", "account_url": None},
]


def provider(provider_id: str) -> dict:
    for item in PROVIDERS:
        if item["id"] == provider_id:
            return item
    raise ValueError("未知的模型平台。")


def cleanup_sessions() -> None:
    cutoff = time.time() - SESSION_TTL_SECONDS
    with SESSIONS_LOCK:
        for token in [key for key, value in SESSIONS.items() if value["updated_at"] < cutoff]:
            del SESSIONS[token]


def public_job(job: dict) -> dict:
    return {key: value for key, value in job.items() if key not in {"session_token", "provider_task_id"}}


def monitor_minimax_job(job_id: str, api_key: str, region: str, task_id: str) -> None:
    try:
        for _ in range(180):
            time.sleep(10)
            result = minimax_h3_adapter.query_task(api_key, region, task_id)
            status = result["status"]
            with VIDEO_JOBS_LOCK:
                VIDEO_JOBS[job_id]["status"] = status
                VIDEO_JOBS[job_id]["updated_at"] = int(time.time())
            if status == "succeeded":
                if not result.get("video_url"):
                    raise minimax_h3_adapter.MiniMaxH3Error("任务成功但未返回视频地址。")
                destination = GENERATED_ROOT / f"{job_id}.mp4"
                minimax_h3_adapter.download_video(result["video_url"], destination)
                with VIDEO_JOBS_LOCK:
                    VIDEO_JOBS[job_id].update({"status": "succeeded", "video_url": f"/generated/{job_id}.mp4", "updated_at": int(time.time())})
                return
            if status in minimax_h3_adapter.TERMINAL:
                return
        with VIDEO_JOBS_LOCK:
            VIDEO_JOBS[job_id].update({"status": "timeout", "error": "查询已暂停，供应商任务可能仍在运行。", "updated_at": int(time.time())})
    except minimax_h3_adapter.MiniMaxH3Error as exc:
        with VIDEO_JOBS_LOCK:
            VIDEO_JOBS[job_id].update({"status": "failed", "error": str(exc), "updated_at": int(time.time())})


def create_pack(payload: dict) -> dict:
    prompt = str(payload.get("prompt", "")).strip()
    subject = str(payload.get("subject", "")).strip()
    if not prompt:
        raise ValueError("请先写下一句话创意。")
    if not subject:
        subject = prompt.split("来", 1)[0].strip("《》 ，。！？")[-12:]
    if not subject:
        raise ValueError("请填写主角，例如“猫”或“甲方”。")
    template = str(payload.get("template", "ad_hook"))
    if template not in TEMPLATES:
        raise ValueError("未知的故事结构。")
    duration = int(payload.get("duration", 15))
    return build_pack(
        PackInput(
            subject=subject,
            prompt=prompt,
            tone=str(payload.get("tone", "meme")),
            template=template,
            duration=duration,
            required_line=str(payload.get("required_line", "")).strip() or None,
            platform=str(payload.get("platform", "通用短视频")),
        )
    )


class AppHandler(BaseHTTPRequestHandler):
    server_version = "OpenNiuLai/0.5"

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")

    def send_json(self, value: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def request_is_secure(self) -> bool:
        host = self.headers.get("Host", "").split(":", 1)[0]
        return self.headers.get("X-Forwarded-Proto", "").lower() == "https" or host in {"127.0.0.1", "localhost", "::1"}

    def session_token(self, create: bool = False) -> str | None:
        cookies = self.headers.get("Cookie", "")
        token = next((item.split("=", 1)[1] for item in cookies.split("; ") if item.startswith("oni_session=")), None)
        if token or not create:
            return token
        return secrets.token_urlsafe(32)

    def read_payload(self, max_bytes: int = MAX_BODY_BYTES) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > max_bytes:
            raise ValueError("请求内容为空或过大。")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def connection_status(self, token: str | None) -> dict:
        cleanup_sessions()
        with SESSIONS_LOCK:
            connected = list(SESSIONS.get(token, {}).get("connections", {})) if token else []
        return {"connected": connected, "expires_in_seconds": SESSION_TTL_SECONDS}

    def send_file(self, path: Path, cache: bool = False) -> None:
        if not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        body = path.read_bytes()
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "public, max-age=86400" if cache else "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self) -> None:  # noqa: N802
        if urlparse(self.path).path != "/api/health":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = unquote(urlparse(self.path).path)
        if path == "/api/health":
            self.send_json({"ok": True, "version": "0.6.0", "mode": "creator"})
            return
        if path == "/api/providers":
            self.send_json({"providers": PROVIDERS, "secure_context": self.request_is_secure(), **self.connection_status(self.session_token())})
            return
        if path.startswith("/api/video-jobs/"):
            job_id = path.removeprefix("/api/video-jobs/").strip("/")
            token = self.session_token()
            with VIDEO_JOBS_LOCK:
                job = VIDEO_JOBS.get(job_id)
                if not job or job.get("session_token") != token:
                    self.send_json({"error": "找不到该视频任务。"}, HTTPStatus.NOT_FOUND)
                    return
                provider_id = job.get("provider")
                provider_task_id = job.get("provider_task_id")
            if provider_id == "runninghub":
                update = runninghub_adapter.query_outputs(self.headers.get("X-Provider-Key", ""), provider_task_id)
                with VIDEO_JOBS_LOCK:
                    job = VIDEO_JOBS.get(job_id)
                    if not job or job.get("session_token") != token:
                        self.send_json({"error": "找不到该视频任务。"}, HTTPStatus.NOT_FOUND)
                        return
                    job.update(update)
                    job["updated_at"] = int(time.time())
            with VIDEO_JOBS_LOCK:
                result = public_job(job)
            self.send_json({"job": result})
            return
        if path.startswith("/generated/"):
            name = path.removeprefix("/generated/")
            if not name.endswith(".mp4") or Path(name).name != name:
                self.send_error(HTTPStatus.FORBIDDEN)
                return
            job_id = name.removesuffix(".mp4")
            token = self.session_token()
            with VIDEO_JOBS_LOCK:
                job = VIDEO_JOBS.get(job_id)
                if not job or job.get("session_token") != token or job.get("status") != "succeeded":
                    self.send_error(HTTPStatus.NOT_FOUND)
                    return
            self.send_file(GENERATED_ROOT / name, cache=False)
            return
        if path.startswith("/demo/"):
            target = (ASSET_ROOT / path.removeprefix("/demo/")).resolve()
            if ASSET_ROOT.resolve() not in target.parents:
                self.send_error(HTTPStatus.FORBIDDEN)
                return
            self.send_file(target, cache=True)
            return
        relative = "index.html" if path in {"", "/"} else path.lstrip("/")
        target = (WEB_ROOT / relative).resolve()
        if WEB_ROOT.resolve() not in target.parents:
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        self.send_file(target)

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/runninghub/uploads":
            try:
                payload = self.read_payload(16 * 1024 * 1024)
                api_key = self.headers.get("X-Provider-Key", "")
                file_name = runninghub_adapter.upload_data_url(api_key, str(payload.get("data_url", "")), str(payload.get("filename", "first-frame.png")))
                self.send_json({"file_name": file_name})
            except (ValueError, TypeError, json.JSONDecodeError, runninghub_adapter.RunningHubError) as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        if path.startswith("/api/connections/"):
            try:
                if not self.request_is_secure():
                    self.send_json({"error": "连接模型账户需要 HTTPS；当前公网 HTTP 环境已禁止提交密钥。"}, HTTPStatus.UPGRADE_REQUIRED)
                    return
                provider_id = path.removeprefix("/api/connections/").strip("/")
                item = provider(provider_id)
                if item["connection"] != "api_key":
                    raise ValueError("该平台当前使用跳转或本地模式，不接收 API Key。")
                payload = self.read_payload()
                api_key = str(payload.get("api_key", "")).strip()
                if len(api_key) < 12:
                    raise ValueError("API Key 格式无效。")
                token = self.session_token(create=True)
                with SESSIONS_LOCK:
                    session = SESSIONS.setdefault(token, {"connections": {}, "updated_at": time.time()})
                    session["connections"][provider_id] = {"api_key": api_key, "region": str(payload.get("region", "cn")) if provider_id == "minimax" else "global"}
                    session["updated_at"] = time.time()
                body = json.dumps({"connected": True, "provider": provider_id, "expires_in_seconds": SESSION_TTL_SECONDS}, ensure_ascii=False).encode("utf-8")
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("Set-Cookie", f"oni_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={SESSION_TTL_SECONDS}")
                self.end_headers()
                self.wfile.write(body)
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        if path == "/api/video-jobs":
            try:
                if not self.request_is_secure():
                    self.send_json({"error": "视频生成需要 HTTPS。"}, HTTPStatus.UPGRADE_REQUIRED)
                    return
                payload = self.read_payload(16 * 1024 * 1024)
                if payload.get("confirm_paid") is not True:
                    raise ValueError("提交付费任务前必须明确确认费用。")
                provider_id = str(payload.get("provider", ""))
                if provider_id not in {"minimax", "runninghub"}:
                    self.send_json({"error": "当前站内真实生成支持 MiniMax H3 和 RunningHub 工作流。"}, HTTPStatus.NOT_IMPLEMENTED)
                    return
                token = self.session_token()
                with SESSIONS_LOCK:
                    connection = SESSIONS.get(token, {}).get("connections", {}).get(provider_id) if token else None
                header_key = self.headers.get("X-Provider-Key", "")
                if not connection and not header_key:
                    self.send_json({"error": f"请先连接 {provider(provider_id)['name']} 账户。"}, HTTPStatus.UNAUTHORIZED)
                    return
                api_key = header_key or connection["api_key"]
                if provider_id == "runninghub":
                    task_id, task_status = runninghub_adapter.create_task(api_key, payload)
                    job_id = secrets.token_urlsafe(16)
                    now = int(time.time())
                    job = {"id": job_id, "provider": "runninghub", "model": "RunningHub Workflow", "status": task_status, "workflow_id": str(payload.get("workflow_id")), "workflow_preset": str(payload.get("workflow_preset", "custom")), "input_mode": "first_frame" if payload.get("uploaded_file_name") else "text", "created_at": now, "updated_at": now, "session_token": token, "provider_task_id": task_id}
                    with VIDEO_JOBS_LOCK:
                        VIDEO_JOBS[job_id] = job
                    self.send_json({"job": public_job(job)}, HTTPStatus.ACCEPTED)
                    return
                prompt = str(payload.get("prompt", "")).strip()
                duration = int(payload.get("duration", 10))
                duration = max(4, min(15, duration))
                ratio = str(payload.get("ratio", "16:9"))
                first_frame = str(payload.get("first_frame_image", "")) or None
                region = self.headers.get("X-Provider-Region", "") or (connection or {}).get("region", "cn")
                task_id = minimax_h3_adapter.create_task(api_key, region, prompt, duration, ratio, first_frame)
                job_id = secrets.token_urlsafe(16)
                now = int(time.time())
                job = {"id": job_id, "provider": "minimax", "model": "MiniMax-H3", "status": "queued", "duration": duration, "ratio": "adaptive" if first_frame else ratio, "input_mode": "first_frame" if first_frame else "text", "created_at": now, "updated_at": now, "session_token": token, "provider_task_id": task_id}
                with VIDEO_JOBS_LOCK:
                    VIDEO_JOBS[job_id] = job
                threading.Thread(target=monitor_minimax_job, args=(job_id, api_key, region, task_id), daemon=True).start()
                self.send_json({"job": public_job(job)}, HTTPStatus.ACCEPTED)
            except (ValueError, TypeError, json.JSONDecodeError, minimax_h3_adapter.MiniMaxH3Error, runninghub_adapter.RunningHubError) as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        if path != "/api/packs":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            payload = self.read_payload()
            self.send_json({"pack": create_pack(payload)})
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def do_DELETE(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if not path.startswith("/api/connections/"):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        provider_id = path.removeprefix("/api/connections/").strip("/")
        token = self.session_token()
        with SESSIONS_LOCK:
            if token in SESSIONS:
                SESSIONS[token]["connections"].pop(provider_id, None)
                SESSIONS[token]["updated_at"] = time.time()
        self.send_json({"connected": False, "provider": provider_id})


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "7860")))
    args = parser.parse_args(argv)
    server = ThreadingHTTPServer((args.host, args.port), AppHandler)
    print(f"Open NiuLai creator: http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
