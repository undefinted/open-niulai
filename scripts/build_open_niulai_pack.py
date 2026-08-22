#!/usr/bin/env python3
"""Build a deterministic Open NiuLai production pack."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


TONES = {
    "meme": "funny, sincere, awkward internet meme",
    "tragic": "tragic but absurd, emotionally overcommitted",
    "shortdrama": "fast short-drama conflict and cliffhanger",
    "uncanny": "light uncanny valley, comedic, no gore",
    "workplace": "deadpan workplace satire",
}

TEMPLATES = {
    "ad_hook": ("survive an immediate ridiculous crisis", "熬过眼前这场荒谬危机", "别划走，它真的来了。", "the title freezes on the most broken frame", "片名定格在最崩坏的一帧"),
    "mama_hook": ("find a missing mother-like figure", "找到失踪的母亲般角色", "妈——妈——", "an impossible distant shape clips into view", "远处不可能存在的形状穿模进入画面"),
    "rebirth_shortdrama": ("survive after waking up as the subject", "在重生成这个东西后活下去", "我一觉醒来，竟然变成了这个东西。", "three absurd ability tags fill the screen", "三个荒谬词条占满屏幕"),
    "poster_vs_footage": ("live up to an impossibly elegant poster", "配得上那张过分精致的海报", "我会回来的。", "an elegant image hard-cuts to broken footage", "精致画面硬切到崩坏正片"),
    "budget_remake": ("cross between low-budget and imaginary premium worlds", "穿越低预算与幻想大片两个世界", "预算，它会来的。", "the polished world collapses back into flat geometry", "精致世界坍缩回扁平几何体"),
    "meme_reaction": ("react to an impossible situation", "回应一个不可能发生的场面", "这也能来？", "a blank stare becomes a freeze-frame meme", "空洞凝视变成定格表情包"),
}


@dataclass(frozen=True)
class PackInput:
    subject: str
    prompt: str = ""
    tone: str = "meme"
    template: str = "ad_hook"
    duration: int = 15
    required_line: str | None = None
    platform: str = "通用短视频"
    language: str = "zh-CN"


def clean_subject(value: str) -> str:
    value = value.strip().strip("《》")
    return value[:-1] if value.endswith("来") else value


def title_for(subject: str) -> str:
    return f"《{clean_subject(subject)}来》"


def timeline(duration: int) -> list[tuple[int, int, str]]:
    if duration < 3 or duration > 60:
        raise ValueError("duration must be between 3 and 60 seconds")
    if duration <= 6:
        a, b = max(1, duration // 5), max(2, duration * 3 // 5)
    elif duration <= 20:
        a, b = max(2, duration // 5), max(4, duration * 4 // 5)
    else:
        a, b = max(4, duration // 6), max(8, duration * 5 // 6)
    return [(0, a, "hook"), (a, b, "conflict"), (b, duration, "reveal")]


def world_for(subject: str, prompt: str = "") -> str:
    direction = prompt.lower()
    if "纸箱" in prompt or "cardboard" in direction:
        return "a cardboard city of crooked box towers, blank signboards, and folded-paper alleys"
    if any(token in prompt for token in ("办公室", "工位", "需求", "加班")):
        return "a flat fluorescent office wasteland with repeating desks and malformed documents"
    if any(token in direction for token in ("服务器", "机房", "报错", "代码", "server", "error")):
        return "a server-room desert with floating blank error boxes and a flat blue floor"
    if any(token in prompt for token in ("股市", "基金", "牛市", "跌停")):
        return "a red-green market altar made from crude blocks and broken charts"
    if any(token in subject for token in ("甲方", "老板", "简历")):
        return "a flat fluorescent office wasteland with repeating desks and malformed documents"
    if any(token in subject.lower() for token in ("代码", "ai", "程序")):
        return "a server-room desert with floating error boxes and a flat blue floor"
    if any(token in subject for token in ("股", "币", "基金")):
        return "a red-green market altar made from crude blocks and broken charts"
    return "an empty flat grassland with identical blob trees and a solid blue sky"


def world_zh_for(subject: str, prompt: str = "") -> str:
    direction = prompt.lower()
    if "纸箱" in prompt or "cardboard" in direction:
        return "由歪斜纸箱高楼、空白路牌和折纸小巷组成的纸箱城市"
    if any(token in prompt for token in ("办公室", "工位", "需求", "加班")) or any(token in subject for token in ("甲方", "老板", "简历")):
        return "荧光灯扁平照亮、工位重复、文档变形的办公室荒原"
    if any(token in direction for token in ("服务器", "机房", "报错", "代码", "server", "error")) or any(token in subject.lower() for token in ("代码", "ai", "程序")):
        return "漂浮着空白报错框、地面纯蓝的服务器荒漠"
    if any(token in prompt for token in ("股市", "基金", "牛市", "跌停")) or any(token in subject for token in ("股", "币", "基金")):
        return "由粗糙方块和破碎图表搭成的红绿市场祭坛"
    return "树木完全复制、天空纯蓝的空旷扁平草原"


def character_for(subject: str, prompt: str, tone: str) -> str:
    if "外卖" in subject or "骑手" in prompt:
        archetype = "an original helmet-headed delivery-rider humanoid carrying a warped unbranded delivery box"
    elif "猫" in subject:
        archetype = "an original upright cat with a trapezoid head, uneven stick legs, and a kinked tail"
    elif any(token in subject.lower() for token in ("代码", "ai", "程序")):
        archetype = "an original terminal-window humanoid with a crooked cuboid head and one missing body corner"
    elif any(token in subject for token in ("甲方", "老板", "简历")):
        archetype = "an original office archetype with an asymmetric polygon head and a narrow suit body"
    else:
        archetype = f"an original {subject}-inspired upright protagonist"
    return (
        f"{archetype}, blocky toy-like geometry, awkward original facial design, stiff posture, "
        f"blurry textures, visible mesh gaps, stable two-color silhouette; tone: {tone}"
    )


def build_pack(data: PackInput) -> dict:
    subject = clean_subject(data.subject)
    if not subject:
        raise ValueError("subject cannot be empty")
    if data.template not in TEMPLATES:
        raise ValueError(f"unknown template: {data.template}")

    mission, mission_zh, default_line, reveal, reveal_zh = TEMPLATES[data.template]
    line = data.required_line or default_line
    title = title_for(subject)
    tone = TONES.get(data.tone, data.tone.strip() or TONES["meme"])
    world = world_for(subject, data.prompt)
    world_zh = world_zh_for(subject, data.prompt)
    prompt_context = data.prompt.strip() or "No additional user constraints."
    character = character_for(subject, data.prompt, tone)
    still = (
        f"Original scene for {title}. {character} Environment: {world}. Extremely crude amateur "
        "low-poly 3D, wrong proportions, flat default viewport lighting, little shadow, clipping, "
        "awkward sincere pose, low-resolution texture. No copyrighted character, logo, exact film "
        "frame, polished studio animation, photorealism, cinematic lighting, or clean topology. "
        f"Hard creative direction to honor: {prompt_context}"
    )
    motion = (
        f"{data.duration}-second original short. Keep the first-frame subject and colors stable. "
        f"Hard creative direction: {prompt_context}. The protagonist tries to {mission} in {world}; jerky low-frame-rate movement, "
        f"stiff head turn, sliding feet, delayed mouth motion for '{line}', then {reveal}. "
        "One main action per shot, static camera or awkward slow push-in, hard cut at reveal. "
        "Avoid smooth cinematic animation, realistic physics, new characters, and camera shake."
    )

    actions = {
        "hook": f"在{world_zh}中亮出{subject}主角与核心困境。",
        "conflict": f"主角试图{mission_zh}，动作真诚而机械地崩坏。",
        "reveal": reveal_zh + "。",
    }
    subtitles = {"hook": title, "conflict": line, "reveal": "下一个，谁来？"}
    script = [
        {"time": f"{start}-{end}s", "beat": beat, "action": actions[beat], "subtitle": subtitles[beat]}
        for start, end, beat in timeline(data.duration)
    ]
    shot = {
        "shot_id": "shot_001",
        "duration": f"{data.duration}s",
        "purpose": data.template,
        "first_frame_prompt": still + " The subject faces camera with clean subtitle space.",
        "motion_prompt": motion,
        "camera": "static medium-wide shot; optional awkward 5% push-in",
        "subtitle": line,
        "voiceover": line,
        "negative_prompt": "polished 3D, cinematic light, smooth motion, realistic physics, extra limbs, new subjects, text artifacts",
        "runway_prompt": "Use the supplied first frame. " + motion,
        "kling_prompt": "Lock the supplied image as subject reference; preserve face, silhouette, colors, and environment. " + motion,
        "seedance_prompt": "Use character, first-frame, and poster references when supplied; keep continuity across the short. " + motion,
        "editing_notes": "Add exact Chinese titles and subtitles in editing; cut on the broken reveal frame.",
    }
    return {
        "schema_version": "0.1.0",
        "title": title,
        "source": asdict(data),
        "constraint_report": {
            "subject": subject,
            "creative_prompt": prompt_context,
            "required_line": line,
            "duration_seconds": data.duration,
            "platform": data.platform,
            "language": data.language,
        },
        "hook": f"{subject}以最真诚、最不协调的方式，试图{mission_zh}。",
        "character_bible": character,
        "world": world,
        "world_zh": world_zh,
        "script": script,
        "image_prompts": {
            "poster_scam": f"Elegant original animated-film poster for {title}; painterly ink-wash mood, mist, negative space, tiny symbolic {subject} subject, no logos or embedded text, no crude 3D. Context: {prompt_context}",
            "broken_footage_still": still,
            "character_reference": f"Full-body reference of one subject. {character} Plain light-gray background, front and three-quarter views, no text.",
            "meme_reaction": f"Close-up of the same original {subject} protagonist, blank delayed reaction, crude low-poly face, simple background, large empty caption area; line supplied separately: {line}",
        },
        "video_shots": [shot],
        "publishing_copy": {
            "post_title": f"我做了一个{title}，看完沉默了",
            "cover_text": f"{subject}真的来了",
            "first_comment": "下一个你想看谁来？",
            "hashtags": ["#万物皆可来", "#openniulai", "#AI动画", f"#{subject}来"],
        },
        "rights_note": "Original transformative concept only; do not use protected film frames, characters, logos, or copied dialogue.",
    }


def to_markdown(pack: dict) -> str:
    lines = [f"# {pack['title']}", "", pack["hook"], "", "## 剧本", ""]
    for beat in pack["script"]:
        lines.append(f"- `{beat['time']}` {beat['action']} 字幕：{beat['subtitle']}")
    lines += ["", "## 首帧提示词", "", pack["video_shots"][0]["first_frame_prompt"], "", "## 视频提示词", "", pack["video_shots"][0]["motion_prompt"], "", "## 发布", "", f"- 标题：{pack['publishing_copy']['post_title']}", f"- 首评：{pack['publishing_copy']['first_comment']}"]
    return "\n".join(lines) + "\n"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--subject", required=True, help="The X in X-lai, e.g. 猫, 甲方, 代码")
    parser.add_argument("--prompt", default="", help="Creative prompt and constraints")
    parser.add_argument("--tone", default="meme", help="Preset or custom tone")
    parser.add_argument("--template", choices=sorted(TEMPLATES), default="ad_hook")
    parser.add_argument("--duration", type=int, default=15)
    parser.add_argument("--required-line")
    parser.add_argument("--platform", default="通用短视频")
    parser.add_argument("--language", default="zh-CN")
    parser.add_argument("--format", choices=("json", "markdown"), default="json")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        pack = build_pack(PackInput(args.subject, args.prompt, args.tone, args.template, args.duration, args.required_line, args.platform, args.language))
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(to_markdown(pack) if args.format == "markdown" else json.dumps(pack, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
