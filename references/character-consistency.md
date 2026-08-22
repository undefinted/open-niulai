# Character Consistency Protocol

Read this before generating multiple assets or video shots for the same `X来` project.

## Identity Lock

Define these fields once and repeat them verbatim in every image and video prompt:

- `silhouette`: head shape, torso shape, limb proportions, and one intentional asymmetry.
- `palette`: exactly two dominant colors plus one small accent.
- `face`: eye count/shape/spacing, mouth shape, and nose or equivalent landmark.
- `wardrobe_or_surface`: one stable garment or material pattern.
- `anchor_prop`: one story-relevant object that remains visually unchanged.
- `damage_signature`: one stable low-budget defect such as a mesh gap, clipped foot, or stretched texture.
- `scale`: subject height relative to one environment object.

Do not use vague locks such as “same character” alone. Copy the concrete identity fields into every prompt.

## Asset Order

1. Generate a neutral character reference sheet first: one subject, front and three-quarter views, plain background, no text.
2. Inspect the sheet and record the visible identity lock. If the output drifted, use what is actually visible rather than the intended trait.
3. Generate the broken-footage first frame using the reference sheet when the tool supports image references.
4. Generate the elegant poster last. Preserve silhouette, palette, and anchor prop while translating the rendering medium.
5. Use the broken-footage frame as the primary image-to-video reference. The poster is mood/reference material, not the motion source.

## Acceptance Checklist

An asset set passes only when:

- exactly one principal subject appears;
- silhouette, palette, facial landmarks, anchor prop, and damage signature agree;
- the first frame has clear negative space for subtitles;
- hands do not need precise interaction to animate the shot;
- no readable generated Chinese text, logo, watermark, or protected character appears;
- the subject remains legible at mobile-feed size;
- the intended defect looks deliberate enough to repeat.

If two or more identity-lock fields drift, regenerate or edit the asset before using it for video.
