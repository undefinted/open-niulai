# Local SVD Backend

Open NiuLai can animate a generated first frame locally with Stability AI's Stable Video Diffusion (`stabilityai/stable-video-diffusion-img2vid-xt`). This backend uses open weights through Hugging Face Diffusers and does not need a provider API key.

Official references: [Diffusers SVD documentation](https://huggingface.co/docs/diffusers/api/pipelines/stable_diffusion/svd), [model card](https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt), and [model license](https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/blob/main/LICENSE.md).

## Hardware

The memory profile uses FP16, model CPU offload, UNet forward chunking, and `decode_chunk_size=2`. Hugging Face documents this combination as requiring less than 8 GB VRAM. Expect substantial model download, system RAM use, and slower inference on laptop GPUs.

## License Gate

Review the Stability AI Community License before use. The adapter will not download weights or run inference unless `--accept-model-license` is supplied. This flag records an explicit local operator decision; the Open NiuLai repository does not redistribute model weights or grant rights under the model license.

## Dry Run

Install the optional backend dependencies in an environment with a CUDA-enabled PyTorch build:

```bash
pip install "open-niulai[local-video]"
```

```bash
python scripts/local_svd_adapter.py \
  --image assets/demo/jiafang-footage.png \
  --out examples/rendered/jiafang-local-svd/generated.mp4 \
  --cache-dir /path/to/large/model/cache \
  --accept-model-license
```

## Generate

Add `--run` after reviewing the plan. A successful run writes the MP4 atomically, validates it with `ffprobe`, and saves a provenance JSON containing the pinned model revision, input/output hashes, parameters, media probe, and GPU/runtime versions.

Stable Video Diffusion does not accept a text motion prompt. It animates the first frame produced by the prompt-driven Open NiuLai image workflow. Runway remains the text-controlled production backend.
