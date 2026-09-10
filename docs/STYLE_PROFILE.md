# Original low-poly absurd style profile

Open NiuLai uses a product-owned style profile rather than copying a film frame or asking a model to imitate a named work. The runtime source of truth is `functions/_lib/style-profile.js`.

## Visual research

Public reporting and still-image search were used only to identify broad visual characteristics:

- [Hunan Today coverage](https://m.voc.com.cn/xhn/news/202608/33490130.html)
- [Sina coverage](https://cj.sina.cn/)
- [Beijing Time coverage](https://item.btime.com/f1p4uavcpbt908qjhd6m3n4oij3)

The recurring characteristics are sparse sets, anthropomorphic subjects, faceted geometry, repeated low-resolution textures, flat lighting, stiff poses, delayed reactions, simple dialogue, and an earnest tone applied to an absurdly small problem. Original stills are not downloaded, redistributed, bundled, or sent to downstream models.

## Runtime layers

1. `scriptSystemPrompt()` constrains Qwen and DeepSeek to return three original, executable story candidates in JSON.
2. `ORIGINAL_LOW_POLY_ABSURD` defines intensity levels, visual language, motion language, negative prompts, and the reference asset.
3. `createPack()` combines the selected story with the global profile and emits first-frame and video prompts.
4. `assets/style/original-lowpoly-office-reference-v1.png` is an original, generated reference image with no film character, logo, dialogue, or copied frame.

The bundled reference is a convenience preset, not a guarantee that every video provider will preserve the style. Image-to-video instances generally provide stronger visual control than text-only instances.
