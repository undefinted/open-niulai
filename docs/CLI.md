# Unified CLI

The CLI turns one prompt into a resumable production directory. It does not claim that prompt files are generated media; state advances only when real assets are attached.

## Create

```bash
open-niulai create "做《外卖来》，骑手在纸箱城市寻找消失的门牌号" \
  --required-line "门牌号呢？" \
  --duration 5 \
  --out projects/waimai-lai
```

Use `--subject` when the prompt does not contain an unambiguous `X来` title.

Created structure:

```text
project.json
STATUS.md
assets/
content/pack.json
content/production.md
prompts/*.txt
publish/copy.json
video/runway/video-job.json
video/kling/video-job.json
video/seedance/video-job.json
```

## Attach Generated Images

```bash
open-niulai attach-asset --project projects/waimai-lai --kind character_reference --image character.png
open-niulai attach-asset --project projects/waimai-lai --kind poster --image poster.png
open-niulai attach-asset --project projects/waimai-lai --kind first_frame --image first-frame.png
```

Attaching a first frame changes the project from `awaiting_images` to `video_ready` and rebuilds all provider jobs with portable asset paths.

The compatibility command `attach-first-frame` performs the same first-frame operation.

## Register A Generated Video

After a real backend returns a file:

```bash
open-niulai attach-video --project projects/waimai-lai --video runway-output.mp4 --provider runway --task-id TASK_ID
```

This copies the durable result into the project and changes state to `completed`. A local preview may be used to test the command, but does not satisfy the real-backend acceptance gate.

## Inspect State

```bash
open-niulai status --project projects/waimai-lai
```

State values are `awaiting_images`, `video_ready`, `submitted`, `completed`, and `failed`. Existing assets are never replaced unless the user passes `--replace` explicitly.

## Diagnose Video Backends

```bash
open-niulai doctor
```

The command checks FFmpeg/FFprobe, whether a Runway secret is configured, local SVD packages, CUDA, GPU detection, and pipeline import compatibility. It returns JSON with concrete next actions. It never prints secret values, downloads model weights, accepts a model license, or submits a paid task.
