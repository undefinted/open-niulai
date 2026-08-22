---
name: open-niulai
description: "Turn any prompt into an original X-lai meme animation package with concept, script, images, video prompts, captions, and launch copy. Use for XX来, 万物皆可来, or sincere broken low-budget 3D meme production; do not use for exact reproduction of protected film assets."
---

# Open NiuLai

Create an original, production-ready `X来` package from the user's prompt. Preserve explicit details, complete missing creative decisions, generate images when requested and available, and prepare video prompts that can be used in real generation products.

## Route The Request

1. Extract subject, must-keep plot beats or dialogue, tone, duration, platform, output mode, and negative constraints.
2. Treat explicit user details as hard constraints. Infer compact defaults for missing details instead of blocking on questions.
3. For concepts, dialogue, scripts, or full packages, read [references/script-workflow.md](references/script-workflow.md).
4. For images or image prompts, read [references/visual-workflow.md](references/visual-workflow.md). If the user requests actual images and image generation is available, generate them rather than returning prompts only.
   When producing multiple assets or shots for one project, also read [references/character-consistency.md](references/character-consistency.md) and establish an identity lock before generation.
5. For clips, storyboards, or video prompts, read [references/video-workflow.md](references/video-workflow.md). Never claim a video was rendered when no callable video backend exists.
6. For product strategy, public launch, or virality, read [references/growth-playbook.md](references/growth-playbook.md).
7. For a deterministic starting pack, run `scripts/build_open_niulai_pack.py`, then creatively adapt its output to the full user prompt.

## Output Modes

- `concept`: title, hook, character, world, conflict, reversal.
- `script`: practical 5s, 15s, or 30s script with dialogue and subtitles.
- `image`: generated image when available, plus reusable prompt and caption.
- `video_pack`: shot list, first-frame prompts, backend-specific motion prompts, edit notes.
- `package` (default): all useful elements above plus publishing copy and a constraint report.

For a vague request such as `猫来`, produce a useful package immediately. For an iterative request such as `更像短剧开头` or `把妈妈改成老板`, revise the existing package while preserving everything not contradicted.

## Product Signature

- Position the result as `万物皆可来`, not as visual imitation of one film.
- Pair a deceptively polished poster with sincerely broken footage when contrast helps.
- Give the protagonist one legible mission, one repeated line, and one strong reveal.
- Favor one subject and one action per shot so video models can execute it.
- Include a short title, cover text, first-comment question, and platform-appropriate tags.

## Originality Boundary

Do not reproduce the original film's characters, names, logos, frames, dialogue, or shot sequence. Do not imitate another active IP so closely that the result looks official. Translate references into original archetypes and generalized language such as `sincere broken low-budget 3D meme animation`.
