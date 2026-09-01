import json
import threading
import urllib.error
import urllib.request
import http.cookiejar
from http.server import ThreadingHTTPServer

import pytest

from scripts.web_app import AppHandler, create_pack


def test_create_pack_from_web_payload():
    pack = create_pack({"subject": "猫", "prompt": "一只加班的猫试图逃离办公室", "duration": 10})
    assert pack["title"] == "《猫来》"
    assert pack["constraint_report"]["duration_seconds"] == 10
    assert len(pack["script"]) == 3


def test_create_pack_requires_prompt():
    with pytest.raises(ValueError, match="一句话创意"):
        create_pack({"subject": "猫", "prompt": ""})


@pytest.fixture()
def web_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), AppHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    thread.join()


def test_health_and_pack_api(web_server):
    with urllib.request.urlopen(f"{web_server}/api/health") as response:
        assert json.load(response)["ok"] is True
    body = json.dumps({"subject": "代码", "prompt": "代码修复后制造两个新报错"}).encode()
    request = urllib.request.Request(f"{web_server}/api/packs", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request) as response:
        assert json.load(response)["pack"]["title"] == "《代码来》"


def test_head_health_for_load_balancer(web_server):
    request = urllib.request.Request(f"{web_server}/api/health", method="HEAD")
    with urllib.request.urlopen(request) as response:
        assert response.status == 200


def test_api_rejects_empty_prompt(web_server):
    body = json.dumps({"subject": "猫", "prompt": ""}).encode()
    request = urllib.request.Request(f"{web_server}/api/packs", data=body, headers={"Content-Type": "application/json"})
    with pytest.raises(urllib.error.HTTPError) as exc:
        urllib.request.urlopen(request)
    assert exc.value.code == 400


def test_provider_catalog_and_temporary_connection(web_server):
    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
    with opener.open(f"{web_server}/api/providers") as response:
        catalog = json.load(response)
    assert catalog["secure_context"] is True
    assert {item["id"] for item in catalog["providers"]} >= {"minimax", "runway", "kling", "seedance"}

    secret = "test-key-never-returned"
    request = urllib.request.Request(
        f"{web_server}/api/connections/minimax",
        data=json.dumps({"api_key": secret}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with opener.open(request) as response:
        connected = json.load(response)
    assert connected["connected"] is True
    assert secret not in json.dumps(connected)

    with opener.open(f"{web_server}/api/providers") as response:
        assert "minimax" in json.load(response)["connected"]
    request = urllib.request.Request(f"{web_server}/api/connections/minimax", method="DELETE")
    with opener.open(request) as response:
        assert json.load(response)["connected"] is False


def test_public_http_rejects_api_keys(web_server):
    request = urllib.request.Request(
        f"{web_server}/api/connections/minimax",
        data=json.dumps({"api_key": "test-key-never-stored"}).encode(),
        headers={"Content-Type": "application/json", "Host": "43.138.0.110"},
    )
    with pytest.raises(urllib.error.HTTPError) as exc:
        urllib.request.urlopen(request)
    assert exc.value.code == 426


def test_paid_video_job_requires_confirmation(web_server):
    body = json.dumps({"provider": "minimax", "prompt": "A cat.", "confirm_paid": False}).encode()
    request = urllib.request.Request(f"{web_server}/api/video-jobs", data=body, headers={"Content-Type": "application/json"})
    with pytest.raises(urllib.error.HTTPError) as exc:
        urllib.request.urlopen(request)
    assert exc.value.code == 400


def test_minimax_job_is_created_once_and_owned_by_session(web_server, monkeypatch):
    monkeypatch.setattr("scripts.web_app.minimax_h3_adapter.create_task", lambda *args: "provider-task-1")
    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
    connection = urllib.request.Request(
        f"{web_server}/api/connections/minimax",
        data=json.dumps({"api_key": "test-key-never-returned", "region": "cn"}).encode(),
        headers={"Content-Type": "application/json"},
    )
    opener.open(connection).close()
    request = urllib.request.Request(
        f"{web_server}/api/video-jobs",
        data=json.dumps({"provider": "minimax", "prompt": "A cat.", "duration": 5, "ratio": "16:9", "confirm_paid": True}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with opener.open(request) as response:
        result = json.load(response)
    assert result["job"]["status"] == "queued"
    assert "provider_task_id" not in result["job"]
    with opener.open(f"{web_server}/api/video-jobs/{result['job']['id']}") as response:
        assert json.load(response)["job"]["model"] == "MiniMax-H3"
