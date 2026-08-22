import importlib.util
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).parents[1]
SCRIPT = ROOT / "scripts" / "local_svd_adapter.py"
SPEC = importlib.util.spec_from_file_location("open_niulai_local_svd", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def args(tmp_path, accepted=False, run=False):
    return MODULE.parser().parse_args([
        "--image", str(ROOT / "assets" / "demo" / "jiafang-footage.png"),
        "--out", str(tmp_path / "video.mp4"),
        "--cache-dir", str(tmp_path / "cache"),
        *( ["--accept-model-license"] if accepted else [] ),
        *( ["--run"] if run else [] ),
    ])


def test_license_acceptance_is_required_even_for_dry_run(tmp_path):
    try:
        MODULE.generate(args(tmp_path))
    except MODULE.LocalSVDError as exc:
        assert "accept-model-license" in str(exc)
    else:
        raise AssertionError("model license gate was skipped")


def test_dry_run_does_not_import_or_download_model(tmp_path):
    result = MODULE.generate(args(tmp_path, accepted=True))
    assert result["status"] == "dry-run"
    assert result["num_frames"] == 25
    assert result["memory_strategy"].startswith("fp16")


def test_input_is_center_fitted_to_svd_dimensions():
    image = MODULE.prepare_image(ROOT / "assets" / "demo" / "jiafang-footage.png")
    assert isinstance(image, Image.Image)
    assert image.size == (1024, 576)


def test_media_validator_accepts_bundled_h264_preview():
    result = MODULE.validate_video(ROOT / "examples" / "rendered" / "mao-runway" / "preview.mp4")
    assert result["duration"] == 5.0
    assert result["video_stream"]["codec_name"] == "h264"
