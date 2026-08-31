# Open NiuLai 0.2.0 Release Candidate

Open NiuLai turns an arbitrary prompt into an original `X来` production project: concept, script, character identity lock, storyboard, image prompts/assets, provider-ready video jobs, subtitles, and launch copy.

## Included

- Installable Codex Skill and Python CLI.
- `open-niulai create`, asset attachment, project status, video archival, and `generate-video` commands.
- Seven original visual demo sets: 猫、狗、甲方、代码、老板、股、AI.
- Runway `gen4.5` image-to-video adapter with free dry-run by default and explicit paid submission.
- Optional license-gated local Stable Video Diffusion backend for CUDA systems with about 8 GB VRAM.
- Paid task ID persistence, bounded polling, resumable recovery, atomic download, and `ffprobe` validation.
- Portable Kling and Seedance job exports plus local H.264 production previews.
- GitHub and short-video growth measurement with production CSV files that reject synthetic observations.
- CI on Windows/Linux and Python 3.10/3.12.
- Explicit provenance, security, contribution, and original/IP boundaries.

## Important Media Distinction

The bundled `examples/rendered/*/preview*.mp4` files are deterministic FFmpeg production previews made from first-frame images. They are not outputs from Runway, Kling, or Seedance. The README teaser is also a local FFmpeg hard-cut loop.

## Draft Blocker

Do not publish this draft until a real model-generated video gate is complete. A public `v0.2.0` release must include one locally archived MP4, successful media probe evidence, model/provider provenance, input/output hashes, and the applicable execution safety evidence. Runway output must also prove timeout recovery did not create a duplicate paid task; local SVD output must record explicit model-license acceptance and a pinned model revision.

## Verification

- Local test suite: 38 tests passing at RC preparation time.
- GitHub Actions: Windows/Linux x Python 3.10/3.12.
- Release structure and README links validated.
- Public-release gate intentionally fails until a real model-generated MP4 and verified provenance are committed.
- Wheel tested in an isolated virtual environment.
- Skill frontmatter and structure validated with Codex `quick_validate.py`.

## CTA

下一个你想看谁来？
