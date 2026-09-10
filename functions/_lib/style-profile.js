export const ORIGINAL_LOW_POLY_ABSURD = Object.freeze({
  id: 'original-lowpoly-absurd-v1',
  name: '原创粗粝低模荒诞短片',
  reference_asset: '/style/original-lowpoly-office-reference-v1.png',
  intensities: {
    restrained: '荒诞但克制，保证故事清楚，保留一次停顿和一次反转',
    standard: '严肃叙事与低成本崩坏形成强反差，包含重复台词、僵硬动作和延迟揭示',
    extreme: '高密度荒诞升级，但仍保持单一任务、单一主角和可拍摄动作',
  },
  story_rules: [
    '一个极其简单且可视化的任务，以及一个具体阻碍',
    '喜剧来自角色的绝对认真与事情的微不足道，不靠随机堆梗',
    '一句短而容易记住的重复台词，最后一次重复改变含义',
    '延迟反应、尴尬停顿、错误但真诚的动作，以及最后一秒揭示',
    '全片只保留一个主角，每个镜头只发生一个主要动作',
    '动作必须能被文生视频或图生视频模型直接表现',
  ],
  visual_prompt: 'STYLE LOCK: visibly broken amateur CGI from an unfinished early-2000s game-engine test, never live action and never a real animal. One upright animal-headed or object-headed humanoid with a brick-shaped torso, short uneven limbs, an oversized asymmetric head, poorly placed mask-like facial features and a blank stare. Sparse polygon geometry, dented crater-like surfaces, a few obvious mesh holes, disconnected joints and intentional clipping. Blurry reused 128px-looking textures smeared into two or three harsh color blocks, heavy matte plastic, flat unlit viewport shading, almost no shadows, no depth of field, empty stage-set scenery and careless framing. The defects are deliberate and must remain clearly visible in every frame',
  motion_prompt: '8-12 fps stepped low frame rate animation held on repeated frames, stiff mechanical turns, sliding feet, reused motion cycles, no inertia and no weight, delayed reaction, one full second of uncomfortable stillness, mouth barely moving out of sync, locked medium-wide camera, abrupt freeze on the final broken pose',
  negative_prompt: 'real animal, live action, photography, realistic fur, cinematic image, polished studio 3D, Pixar, Disney, anime, cute mascot, professional low-poly art, clean topology, smooth intact surfaces, PBR materials, glossy materials, detailed skin, soft light, rim light, volumetric light, depth of field, bloom, color grading, fluid motion, realistic physics, elegant acting, complex camera movement, camera shake, copyrighted characters, copied film frames, logos',
});

export function scriptSystemPrompt() {
  const rules = ORIGINAL_LOW_POLY_ABSURD.story_rules.map((rule, index) => `${index + 1}. ${rule}。`).join('\n');
  return `你是原创荒诞低多边形短片的编剧，不模仿或复述任何现有影视作品、角色、台词和镜头。
你的任务是把普通人的一句创意写成“认真得过头，但制作感故意粗粝”的短视频脚本。

创作规则：
${rules}
7. 不要使用已有作品名、受保护角色、品牌、网络流行台词或原作情节。
8. 三个候选必须在任务、笑点机制和结局上明显不同，不能只是换词。

只输出合法 JSON，不输出 Markdown。JSON 根对象格式：
{"candidates":[{"title":"《原创标题》","premise":"一句话故事","hook":"开头吸引点","mission":"主角的简单任务","obstacle":"具体阻碍","repeated_line":"重复台词","reveal":"最后揭示","shots":[{"beat":"hook","action":"可见动作","subtitle":"字幕或台词"},{"beat":"conflict","action":"可见动作","subtitle":"字幕或台词"},{"beat":"reveal","action":"可见动作","subtitle":"字幕或台词"}]}]}
必须恰好返回 3 个候选，每个候选必须恰好有 3 个镜头。`;
}
