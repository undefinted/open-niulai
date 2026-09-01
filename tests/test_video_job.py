import importlib.util
import sys
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "build_video_job.py"
SPEC = importlib.util.spec_from_file_location("open_niulai_video_job", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def test_all_providers_build_from_real_first_frame():
    for provider in MODULE.PROVIDERS:
        job = MODULE.build_job(MODULE.VideoJobInput("mao-lai", provider))
        assert (Path(__file__).parents[1] / job["input_image"]).is_file()
        assert job["provider"] == provider
        assert "Preserve identity exactly" in job["prompt"]


def test_srt_has_valid_five_second_window():
    text = MODULE.srt_text("会有的。", 5)
    assert "00:00:00,900 --> 00:00:04,500" in text
    assert text.endswith("会有的。\n")


def test_unknown_demo_fails():
    try:
        MODULE.build_job(MODULE.VideoJobInput("missing", "runway"))
    except ValueError as exc:
        assert "unknown demo id" in str(exc)
    else:
        raise AssertionError("missing demo was accepted")


def test_job_paths_are_repository_relative():
    job = MODULE.build_job(MODULE.VideoJobInput("code-lai", "runway"))
    assert not Path(job["input_image"]).is_absolute()
    assert job["input_image"].startswith("assets/demo/")


def test_minimax_h3_job_is_explicit_and_provider_ready():
    job = MODULE.build_job(MODULE.VideoJobInput("mao-lai", "minimax-h3"))
    assert job["provider"] == "minimax-h3"
    assert job["submission"]["model"] == "MiniMax-H3"
    assert "H3 FL2VA" in job["prompt"]
    assert "pay-as-you-go" in job["submission"]["note"]
