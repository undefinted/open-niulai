import importlib.util
import json
import sys
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "build_open_niulai_pack.py"
SPEC = importlib.util.spec_from_file_location("open_niulai_builder", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def test_short_timeline_is_contiguous():
    beats = MODULE.timeline(5)
    assert beats[0][0] == 0
    assert beats[-1][1] == 5
    assert all(left[1] == right[0] for left, right in zip(beats, beats[1:]))


def test_user_constraints_are_preserved():
    pack = MODULE.build_pack(MODULE.PackInput(subject="甲方来", prompt="第18版需求", required_line="最后改一次", duration=15))
    assert pack["title"] == "《甲方来》"
    assert pack["constraint_report"]["creative_prompt"] == "第18版需求"
    assert pack["constraint_report"]["required_line"] == "最后改一次"
    assert "最后改一次" in pack["video_shots"][0]["motion_prompt"]


def test_prompt_scene_and_subject_archetype_are_hard_constraints():
    pack = MODULE.build_pack(MODULE.PackInput(subject="外卖", prompt="骑手在纸箱城市寻找消失的门牌号", required_line="门牌号呢？", duration=5))
    assert "cardboard city" in pack["world"]
    assert "纸箱城市" in pack["world_zh"]
    assert "delivery-rider" in pack["character_bible"]
    assert "纸箱城市" in pack["video_shots"][0]["motion_prompt"]
    assert "门牌号呢？" in pack["video_shots"][0]["motion_prompt"]
    assert "a cardboard city" not in pack["script"][0]["action"]


def test_each_backend_prompt_exists():
    shot = MODULE.build_pack(MODULE.PackInput(subject="代码"))["video_shots"][0]
    assert all(shot[key] for key in ("runway_prompt", "kling_prompt", "seedance_prompt"))


def test_invalid_duration_is_rejected():
    try:
        MODULE.timeline(2)
    except ValueError as exc:
        assert "between 3 and 60" in str(exc)
    else:
        raise AssertionError("duration validation did not run")


def test_demo_manifest_has_complete_existing_asset_sets():
    root = Path(__file__).parents[1]
    manifest = json.loads((root / "examples" / "demo-manifest.json").read_text(encoding="utf-8"))
    assert len(manifest["demos"]) >= 3
    identity_fields = {"silhouette", "palette", "face", "wardrobe_or_surface", "anchor_prop", "damage_signature", "scale"}
    for demo in manifest["demos"]:
        assert identity_fields == set(demo["identity_lock"])
        assert {"poster", "character_reference", "first_frame"} <= set(demo["assets"])
        assert all((root / path).is_file() for path in demo["assets"].values())
