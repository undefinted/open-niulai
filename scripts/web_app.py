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


ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
ASSET_ROOT = ROOT / "assets" / "demo"
MAX_BODY_BYTES = 64 * 1024
SESSION_TTL_SECONDS = 4 * 60 * 60
SESSIONS: dict[str, dict] = {}
SESSIONS_LOCK = threading.Lock()
PROVIDERS = [
    {"id": "minimax", "name": "MiniMax H3", "connection": "api_key", "status": "available", "account_url": "https://platform.minimaxi.com/"},
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
    server_version = "OpenNiuLai/0.3"

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

    def read_payload(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_BODY_BYTES:
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

    def do_GET(self) -> None:  # noqa: N802
        path = unquote(urlparse(self.path).path)
        if path == "/api/health":
            self.send_json({"ok": True, "version": "0.4.0", "mode": "creator"})
            return
        if path == "/api/providers":
            self.send_json({"providers": PROVIDERS, "secure_context": self.request_is_secure(), **self.connection_status(self.session_token())})
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
                    session["connections"][provider_id] = api_key
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
