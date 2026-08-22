import importlib.util
import json
import sys
from unittest.mock import patch
from pathlib import Path


ROOT = Path(__file__).parents[1]
SCRIPT = ROOT / "scripts" / "runway_adapter.py"
SPEC = importlib.util.spec_from_file_location("open_niulai_runway", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def load_job():
    return json.loads((ROOT / "examples" / "rendered" / "mao-runway" / "video-job.json").read_text(encoding="utf-8"))


def test_payload_matches_current_runway_contract_without_exposing_image():
    payload = MODULE.build_payload(load_job())
    assert payload["model"] == "gen4.5"
    assert payload["ratio"] == "960:960"
    assert payload["duration"] == 5
    assert payload["promptImage"].startswith("data:image/png;base64,")
    assert MODULE.utf16_units(payload["promptText"]) <= 1000


def test_oversized_prompt_is_rejected():
    job = load_job()
    job["prompt"] = "动" * 1001
    try:
        MODULE.build_payload(job)
    except MODULE.RunwayError as exc:
        assert "1000 UTF-16" in str(exc)
    else:
        raise AssertionError("oversized prompt was accepted")


def test_submit_persists_task_before_polling_and_can_resume(tmp_path):
    output = tmp_path / "video.mp4"
    state = tmp_path / "task.json"
    calls = []

    def fake_api(method, path, secret, body=None, timeout=60):
        calls.append((method, path))
        return {"id": "paid-task-1"}

    def fake_wait(task_id, secret):
        saved = json.loads(state.read_text(encoding="utf-8"))
        assert saved["task_id"] == "paid-task-1"
        return {"id": task_id, "status": "SUCCEEDED", "output": ["https://example.test/video.mp4"]}

    with patch.object(MODULE, "api_json", fake_api), patch.object(MODULE, "wait_for_task", fake_wait), \
         patch.object(MODULE, "download", lambda url, path: path.write_bytes(b"video")), \
         patch.object(MODULE, "validate_video", lambda path: {"duration": 5.0, "video_stream": {"codec_name": "h264"}}):
        result = MODULE.submit(load_job(), "secret", output, state_path=state)

    assert calls == [("POST", "/image_to_video")]
    assert result["task_id"] == "paid-task-1"
    assert json.loads(state.read_text(encoding="utf-8"))["status"] == "SUCCEEDED"

    calls.clear()
    with patch.object(MODULE, "api_json", fake_api), patch.object(MODULE, "wait_for_task", fake_wait), \
         patch.object(MODULE, "download", lambda url, path: path.write_bytes(b"video")), \
         patch.object(MODULE, "validate_video", lambda path: {"duration": 5.0, "video_stream": {"codec_name": "h264"}}):
        MODULE.submit(load_job(), "secret", output, state_path=state, resume_task_id="paid-task-1")
    assert calls == []


def test_wait_timeout_is_bounded(monkeypatch):
    clock = iter((0.0, 0.0, 2.0))
    monkeypatch.setattr(MODULE.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(MODULE.time, "sleep", lambda seconds: None)
    monkeypatch.setattr(MODULE, "api_json", lambda *args, **kwargs: {"status": "RUNNING"})
    try:
        MODULE.wait_for_task("task-1", "secret", timeout_seconds=1, poll_seconds=0)
    except MODULE.RunwayError as exc:
        assert "timed out" in str(exc)
    else:
        raise AssertionError("polling was not bounded")


def test_payload_resolves_first_frame_from_explicit_project_root(tmp_path):
    assets = tmp_path / "assets"
    assets.mkdir()
    source = ROOT / "assets" / "demo" / "mao-first-frame.png"
    (assets / "first-frame.png").write_bytes(source.read_bytes())
    job = load_job()
    job["input_image"] = "assets/first-frame.png"
    payload = MODULE.build_payload(job, asset_root=tmp_path)
    assert payload["promptImage"].startswith("data:image/png;base64,")
