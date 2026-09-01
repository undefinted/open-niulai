import pytest

from scripts import minimax_h3_adapter as adapter


def test_h3_payload_matches_official_v2_shape():
    payload = adapter.build_payload("A cat raises its head.", 10, "16:9")
    assert payload == {
        "model": "MiniMax-H3",
        "content": [{"type": "text", "text": "A cat raises its head."}],
        "resolution": "2K",
        "duration": 10,
        "ratio": "16:9",
    }


def test_h3_first_frame_uses_official_content_role_and_adaptive_ratio():
    image = "data:image/png;base64,aGVsbG8="
    payload = adapter.build_payload("Keep this character stable.", 5, "16:9", image)
    assert payload["content"][1] == {"type": "image_url", "image_url": {"url": image}, "role": "first_frame"}
    assert payload["ratio"] == "adaptive"


@pytest.mark.parametrize("duration", [3, 16])
def test_h3_rejects_invalid_duration(duration):
    with pytest.raises(adapter.MiniMaxH3Error, match="4-15"):
        adapter.build_payload("A cat.", duration)


def test_h3_does_not_retry_missing_task_id(monkeypatch):
    calls = []

    def fake_api(*args, **kwargs):
        calls.append((args, kwargs))
        return {"base_resp": {"status_code": 0}}

    monkeypatch.setattr(adapter, "api_json", fake_api)
    with pytest.raises(adapter.MiniMaxH3Error, match="未自动重试"):
        adapter.create_task("secret", "cn", "A cat.", 5, "16:9")
    assert len(calls) == 1
