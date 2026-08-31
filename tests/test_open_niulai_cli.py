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
    assert "local-svd" in created["providers"]
    assert all((project / "video" / provider / "video-job.json").is_file() for provider in MODULE.REMOTE_PROVIDERS)

    source = ROOT / "assets" / "demo" / "mao-first-frame.png"
    attached = MODULE.attach_first_frame(Namespace(project=project, image=source, replace=False))
    assert attached["state"] == "video_ready"
    for provider in MODULE.REMOTE_PROVIDERS:
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


def test_local_video_project_command_is_license_gated_and_dry_by_default(tmp_path):
    project = tmp_path / "local"
    MODULE.create_project(create_args(project))
    source = ROOT / "assets" / "demo" / "mao-first-frame.png"
    MODULE.attach_first_frame(Namespace(project=project, image=source, replace=False))
    parsed = MODULE.parser().parse_args([
        "generate-local-video",
        "--project", str(project),
        "--cache-dir", str(tmp_path / "model-cache"),
        "--accept-model-license",
    ])
    result = parsed.handler(parsed)
    assert result["generation"]["status"] == "dry-run"
    assert MODULE.load_project(project)["state"] == "video_ready"


def test_local_video_success_updates_project_only_with_durable_evidence(tmp_path, monkeypatch):
    project = tmp_path / "local-complete"
    MODULE.create_project(create_args(project))
    source = ROOT / "assets" / "demo" / "mao-first-frame.png"
    MODULE.attach_first_frame(Namespace(project=project, image=source, replace=False))

    def fake_generate(args):
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.provenance.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_bytes(b"video")
        args.provenance.write_text("{}", encoding="utf-8")
        return {"status": "SUCCEEDED", "model_revision": "model-commit"}

    monkeypatch.setattr(MODULE.local_svd_adapter, "generate", fake_generate)
    parsed = MODULE.parser().parse_args([
        "generate-local-video",
        "--project", str(project),
        "--cache-dir", str(tmp_path / "model-cache"),
        "--accept-model-license",
        "--run",
    ])
    result = parsed.handler(parsed)
    assert result["project"]["state"] == "completed"
    assert result["project"]["completed_provider"] == "local-svd"
    assert (project / result["project"]["assets"]["generated_video"]).is_file()


def test_doctor_reports_backend_readiness_without_exposing_secret(monkeypatch):
    monkeypatch.setenv("RUNWAYML_API_SECRET", "do-not-print-this")
    monkeypatch.setattr(MODULE.shutil, "which", lambda name: f"/tools/{name}")
    monkeypatch.setattr(MODULE, "local_video_runtime", lambda: {
        "packages": {"torch": True},
        "cuda_available": True,
        "gpu": "Test GPU",
        "pipeline_import": True,
        "error": None,
    })
    result = MODULE.doctor(Namespace())
    assert result["runway"] == {"secret_configured": True, "ready": True}
    assert result["local_svd"]["ready"] is True
    assert result["any_video_backend_ready"] is True
    assert "do-not-print-this" not in json.dumps(result)
