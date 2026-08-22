# Video Workflow

Read this for clips, storyboards, direct video generation, or backend prompts.

## Backend Choice

- Runway: concise image-to-video motion from a strong first frame.
- Kling: emphasize subject reference, appearance consistency, and controlled movement.
- Seedance: use multiple references and Chinese short-video sequencing when available.

When no video backend is callable, produce copy-ready prompts and say that rendering remains external. For paid or externally mutating calls, obtain the authorization required by the environment.

For this project repository, use `scripts/build_video_job.py` to prepare portable jobs and local previews. For a real Runway submission, use `scripts/runway_adapter.py`; it is dry-run by default and requires both a locally configured `RUNWAYML_API_SECRET` and explicit `--submit` before incurring cost. Download successful output immediately because provider URLs expire.

When no provider credential is available and a CUDA GPU has about 8 GB VRAM, `scripts/local_svd_adapter.py` can animate the generated first frame with Stable Video Diffusion. It requires explicit model-license acceptance and `--run`; otherwise it only reports the plan. Read `docs/LOCAL_VIDEO.md` before using this backend. SVD has no text-motion control, so preserve prompt intent through the first frame and use simple motion settings.

## Shot Contract

Each shot contains `shot_id`, `duration`, `purpose`, `first_frame_prompt`, `motion_prompt`, `camera`, `subtitle`, `voiceover`, `negative_prompt`, `runway_prompt`, `kling_prompt`, `seedance_prompt`, and `editing_notes`.

Use jerky low-framerate movement, stiff turns, sliding feet, delayed mouth movement, hard cuts, occasional clipping, and static or awkward push-in cameras. Avoid complex choreography and smooth cinematic action.

Generate subtitles in the edit. A first test should be one 5-second shot; extend to 15/30 seconds after the character and motion work.

## Templates

- `ad_hook`: conflict by 2 seconds, strange promise, cliffhanger.
- `mama_hook`: slow head raise and repeated cry; only with user acceptance.
- `rebirth_shortdrama`: rebirth line, 2-3 absurd ability tags, crisis, cliffhanger.
- `poster_vs_footage`: elegant setup, hard cut, one sincere line.
- `budget_remake`: low/high budget versions of the same original setup.
- `meme_reaction`: one close-up, one expression, one caption.
