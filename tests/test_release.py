import importlib.util
import json
import sys
import tomllib
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).parents[1] / "scripts" / "check_release.py"
SPEC = importlib.util.spec_from_file_location("open_niulai_release", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def test_release_structure_and_links_are_valid():
    assert MODULE.check() == []


def test_local_video_extra_pins_numpy_before_two():
    project = tomllib.loads((MODULE.ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    dependencies = project["project"]["optional-dependencies"]["local-video"]
    assert "numpy>=1.24,<2" in dependencies


def test_public_release_gate_requires_real_ai_video():
    with patch.object(MODULE, "AI_VIDEO_PROVENANCE_GLOB", "assets/demo/does-not-exist/*.json"):
        assert MODULE.check(require_ai_video=True) == [
            "no real AI-video provenance found (assets/demo/does-not-exist/*.json)"
        ]


def test_ai_video_gate_rejects_hash_mismatch(tmp_path):
    source = tmp_path / "source.png"
    output = tmp_path / "output.mp4"
    provenance = tmp_path / "sample.ai-video.provenance.json"
    source.write_bytes(b"image")
    output.write_bytes(b"video")
    provenance.write_text(json.dumps({
        "backend": "test-backend",
        "model": "test-model",
        "model_revision": "abc123",
        "generated_at": "2026-08-31T00:00:00+00:00",
        "source_image": "source.png",
        "source_image_sha256": "wrong",
        "output_file": "output.mp4",
        "output_sha256": "wrong",
    }), encoding="utf-8")
    with patch.object(MODULE, "ROOT", tmp_path), patch.object(MODULE, "AI_VIDEO_PROVENANCE_GLOB", "*.ai-video.provenance.json"):
        assert MODULE.check_ai_video() == ["AI-video provenance hash mismatch: sample.ai-video.provenance.json"]
