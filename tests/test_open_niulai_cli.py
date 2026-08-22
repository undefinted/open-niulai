import importlib.util
import json
import sys
from argparse import Namespace
from pathlib import Path


ROOT = Path(__file__).parents[1]
SCRIPT = ROOT / "scripts" / "open_niulai.py"
SPEC = importlib.util.spec_from_file_location("open_niulai_cli", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.path.insert(0, str(ROOT))
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def create_args(out):
    return Namespace(
        prompt="做《外卖来》，骑手寻找消失的门牌号",
        subject=None,
        tone="meme",
        template="ad_hook",
        duration=5,
        required_line="门牌号呢？",
        platform="通用短视频",
        language="zh-CN",
        out=out,
        force=False,
    )


def test_prompt_to_video_ready_project(tmp_path):
    project = tmp_path / "waimai"
    created = MODULE.create_project(create_args(project))
    assert created["title"] == "《外卖来》"
    assert created["state"] == "awaiting_images"
    assert (project / "content" / "pack.json").is_file()
    assert (project / "prompts" / "character_reference.txt").is_file()
    assert all((project / "video" / provider / "video-job.json").is_file() for provider in MODULE.PROVIDERS)

    source = ROOT / "assets" / "demo" / "mao-first-frame.png"
    attached = MODULE.attach_first_frame(Namespace(project=project, image=source, replace=False))
    assert attached["state"] == "video_ready"
    for provider in MODULE.PROVIDERS:
        job = json.loads((project / "video" / provider / "video-job.json").read_text(encoding="utf-8"))
        assert job["status"] == "prepared"
        assert job["input_image"].startswith("assets/first-frame")

    poster = ROOT / "assets" / "demo" / "mao-poster.png"
    updated = MODULE.attach_asset(Namespace(project=project, image=poster, kind="poster", replace=False))
    assert updated["assets"]["poster"].startswith("assets/poster")


def test_real_video_registration_completes_project(tmp_path):
    project = tmp_path / "complete"
    MODULE.create_project(create_args(project))
    video = ROOT / "examples" / "rendered" / "mao-runway" / "preview.mp4"
    completed = MODULE.attach_video(Namespace(project=project, video=video, provider="runway", task_id="task-test", replace=False))
    assert completed["state"] == "completed"
    assert completed["completed_provider"] == "runway"
    assert (project / completed["assets"]["generated_video"]).is_file()


def test_nonempty_directory_is_not_overwritten(tmp_path):
    project = tmp_path / "existing"
    project.mkdir()
    (project / "keep.txt").write_text("user data", encoding="utf-8")
    try:
        MODULE.create_project(create_args(project))
    except ValueError as exc:
        assert "not empty" in str(exc)
    else:
        raise AssertionError("nonempty project was overwritten")
    assert (project / "keep.txt").read_text(encoding="utf-8") == "user data"


def test_subject_must_be_inferable():
    try:
        MODULE.infer_subject("做一个荒诞短片")
    except ValueError as exc:
        assert "--subject" in str(exc)
    else:
        raise AssertionError("ambiguous subject was silently invented")
