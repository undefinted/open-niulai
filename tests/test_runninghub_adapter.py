import pytest

from scripts import runninghub_adapter


def test_build_node_info_maps_prompt_and_image():
    nodes = runninghub_adapter.build_node_info(
        {"prompt": "An awkward cat walks.", "prompt_node_id": "6", "prompt_field": "text", "image_node_id": "12", "image_field": "image"},
        "api/input/cat.png",
    )
    assert nodes == [
        {"nodeId": "6", "fieldName": "text", "fieldValue": "An awkward cat walks."},
        {"nodeId": "12", "fieldName": "image", "fieldValue": "api/input/cat.png"},
    ]


def test_build_node_info_requires_image_node_when_file_is_present():
    with pytest.raises(runninghub_adapter.RunningHubError, match="图片节点"):
        runninghub_adapter.build_node_info({"prompt": "A cat.", "prompt_node_id": "6"}, "api/input/cat.png")


def test_query_outputs_prefers_video(monkeypatch):
    monkeypatch.setattr(
        runninghub_adapter,
        "_request",
        lambda *args, **kwargs: [
            {"fileUrl": "https://example.com/frame.png", "fileType": "png"},
            {"fileUrl": "https://example.com/result.mp4", "fileType": "mp4"},
        ],
    )
    result = runninghub_adapter.query_outputs("test-key-never-used", "task-1")
    assert result["status"] == "succeeded"
    assert result["video_url"] == "https://example.com/result.mp4"


def test_query_outputs_rejects_non_video_output(monkeypatch):
    monkeypatch.setattr(
        runninghub_adapter,
        "_request",
        lambda *args, **kwargs: [{"fileUrl": "https://example.com/frame.png", "fileType": "png"}],
    )
    result = runninghub_adapter.query_outputs("test-key-never-used", "task-1")
    assert result["status"] == "failed"
    assert result["video_url"] is None
    assert "没有返回" in result["error"]


def test_upload_rejects_corrupt_base64_before_network():
    with pytest.raises(runninghub_adapter.RunningHubError, match="损坏"):
        runninghub_adapter.upload_data_url("test-key-never-used", "data:image/png;base64,AAAAA")
