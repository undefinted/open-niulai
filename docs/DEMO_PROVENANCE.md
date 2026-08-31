# Demo Provenance

All bundled visual demo assets were created for Open NiuLai on 2026-08-21 or 2026-08-22 with the built-in OpenAI image generation tool.

No original-film screenshot, footage, character reference, logo, or copied dialogue was supplied to image generation. Prompts described original archetypes and the generalized `sincere broken low-budget 3D` grammar.

## 甲方来

- Files: `assets/demo/jiafang-*.png`
- Concept: an original asymmetric office-client archetype carrying malformed revision papers.
- Inputs: text prompt only for poster/first frame; the generated first frame was later used as identity reference for the character sheet.
- Human text is added separately; generated images contain no intended title.

## 猫来

- Files: `assets/demo/mao-*.png`
- Concept: an original trapezoid-headed cat searching a cardboard valley for the last treat.
- Inputs: text prompt for character sheet, then that generated sheet as identity reference for poster and first frame.
- Real AI video: `assets/demo/mao-lai-svd.ai-video.mp4`, generated locally on 2026-08-31 with `stabilityai/stable-video-diffusion-img2vid-xt` revision `9e43909513c6714f1bc78bcb44d96e733cd242aa` after explicit operator license acceptance.
- Video input: `assets/demo/mao-first-frame.png`; no original-film footage, frame, logo, or character reference was used.
- Verification: `assets/demo/mao-lai-svd.ai-video.provenance.json` records generation parameters, hardware/runtime, media probe, and SHA-256 hashes. `assets/demo/mao-lai-svd-captioned.mp4` is an FFmpeg subtitle-only derivative.

## 代码来

- Files: `assets/demo/code-*.png`
- Concept: an original terminal-bodied humanoid carrying a bent semicolon through a server desert.
- Inputs: text prompt for character sheet, then that generated sheet as identity reference for poster and first frame.

## 狗来

- Files: `assets/demo/gou-*.png`
- Concept: an original brick-headed dog with a blue collar, spiral tail, strapped bone, and deliberately disconnected ankle.
- Inputs: text prompt for character sheet, then that generated sheet as identity reference for poster and first frame.

## 老板来

- Files: `assets/demo/laoban-*.png`
- Concept: an original wide inverted-triangle boss archetype with a cylindrical head, magenta tie, detached shoulder, and one blank strategy page.
- Inputs: text prompt for character sheet, then that generated sheet as identity reference for poster and first frame.
- The design intentionally differs from the thin asymmetric `甲方来` office archetype.

## 股来

- Files: `assets/demo/gu-*.png`
- Concept: an original split red-green candlestick climbing a market altar with a bent gold arrow.
- Inputs: text prompt for character sheet, then that generated sheet as identity reference for poster and first frame.
- No ticker, number, financial logo, bull, or bear reference was supplied.

## AI来

- Files: `assets/demo/ai-*.png`
- Concept: an original checker-textured polyhedral model with a missing torso face, an erroneous third arm, and a tethered cube.
- Inputs: text prompt for character sheet, then that generated sheet as identity reference for poster and first frame.
- The design intentionally avoids terminal-bodied characters, polished robots, AI logos, and neural-network diagrams.

## Preview Videos

- Files: `examples/rendered/*/preview*.mp4`
- Method: deterministic FFmpeg zoom preview from bundled first frames, H.264 at 24 fps, with optional `mov_text` subtitle track.
- These files are explicitly local production previews, not outputs from Runway, Kling, or Seedance.

## README Teaser

- File: `assets/demo/open-niulai-teaser.gif`
- Method: deterministic FFmpeg hard-cut loop from the bundled original `jiafang-poster.png` and `jiafang-footage.png` images; 480 x 480, 8 fps.
- It is a lightweight repository preview, not a provider-generated video.

For every real provider or local-model output, record provider/backend, model revision, task date, duration, source first frame, hashes, and whether any manual editing occurred. Do not record an expiring output URL or API credential.
