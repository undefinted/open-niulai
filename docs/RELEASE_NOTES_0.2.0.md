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

The bundled `assets/demo/mao-lai-svd.ai-video.mp4` is a real Stable Video Diffusion output. Its pinned model revision, explicit license-acceptance evidence, generation parameters, media probe, and input/output hashes are recorded in the adjacent provenance JSON. The captioned file is a clearly identified FFmpeg derivative.

## Post-release Validation

The real model-generated video gate, repository checks, and cross-platform CI are complete. The remaining product objective is a real-user/platform experiment after package publication; repository traffic alone is not proof of short-video propagation.

## Verification

- Local test suite: 39 tests passed on Windows during the final media audit.
- GitHub Actions: Windows/Linux x Python 3.10/3.12.
- Release structure and README links validated.
- Public-release gate validates the real model-generated MP4, relative media paths, hashes, and `ffprobe` result.
- Wheel and source archive built in an isolated PEP 517 environment; the wheel was installed and smoke-tested in a fresh virtual environment.
- Skill frontmatter and structure validated with Codex `quick_validate.py`.

## CTA

下一个你想看谁来？
