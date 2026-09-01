#!/usr/bin/env python3
"""Serve the zero-dependency Open NiuLai creator web app."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from scripts.build_open_niulai_pack import PackInput, TEMPLATES, build_pack


ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
ASSET_ROOT = ROOT / "assets" / "demo"
MAX_BODY_BYTES = 64 * 1024


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
            self.send_json({"ok": True, "version": "0.3.0", "mode": "creator"})
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
        if urlparse(self.path).path != "/api/packs":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                raise ValueError("请求内容为空或过大。")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            self.send_json({"pack": create_pack(payload)})
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)


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
