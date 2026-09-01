import json
import threading
import urllib.error
import urllib.request
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


def test_api_rejects_empty_prompt(web_server):
    body = json.dumps({"subject": "猫", "prompt": ""}).encode()
    request = urllib.request.Request(f"{web_server}/api/packs", data=body, headers={"Content-Type": "application/json"})
    with pytest.raises(urllib.error.HTTPError) as exc:
        urllib.request.urlopen(request)
    assert exc.value.code == 400
