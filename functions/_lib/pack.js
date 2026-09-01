const TONES = {
  meme: 'funny, sincere, awkward internet meme', tragic: 'tragic but absurd, emotionally overcommitted',
  shortdrama: 'fast short-drama conflict and cliffhanger', uncanny: 'light uncanny valley, comedic, no gore',
  workplace: 'deadpan workplace satire',
};

const TEMPLATES = {
  ad_hook: ['survive an immediate ridiculous crisis', '熬过眼前这场荒谬危机', '别划走，它真的来了。', 'the title freezes on the most broken frame', '片名定格在最崩坏的一帧'],
  mama_hook: ['find a missing mother-like figure', '找到失踪的母亲般角色', '妈——妈——', 'an impossible distant shape clips into view', '远处不可能存在的形状穿模进入画面'],
  rebirth_shortdrama: ['survive after waking up as the subject', '在重生成这个东西后活下去', '我一觉醒来，竟然变成了这个东西。', 'three absurd ability tags fill the screen', '三个荒谬词条占满屏幕'],
  poster_vs_footage: ['live up to an impossibly elegant poster', '配得上那张过分精致的海报', '我会回来的。', 'an elegant image hard-cuts to broken footage', '精致画面硬切到崩坏正片'],
  budget_remake: ['cross between low-budget and imaginary premium worlds', '穿越低预算与幻想大片两个世界', '预算，它会来的。', 'the polished world collapses back into flat geometry', '精致世界坍缩回扁平几何体'],
  meme_reaction: ['react to an impossible situation', '回应一个不可能发生的场面', '这也能来？', 'a blank stare becomes a freeze-frame meme', '空洞凝视变成定格表情包'],
};

function cleanSubject(value) {
  value = String(value || '').trim().replace(/^[《]+|[》]+$/g, '');
  return value.endsWith('来') ? value.slice(0, -1) : value;
}

function timeline(duration) {
  if (!Number.isInteger(duration) || duration < 3 || duration > 60) throw new Error('时长必须为 3-60 秒整数。');
  let a; let b;
  if (duration <= 6) [a, b] = [Math.max(1, Math.floor(duration / 5)), Math.max(2, Math.floor(duration * 3 / 5))];
  else if (duration <= 20) [a, b] = [Math.max(2, Math.floor(duration / 5)), Math.max(4, Math.floor(duration * 4 / 5))];
  else [a, b] = [Math.max(4, Math.floor(duration / 6)), Math.max(8, Math.floor(duration * 5 / 6))];
  return [[0, a, 'hook'], [a, b, 'conflict'], [b, duration, 'reveal']];
}

function worldFor(subject, prompt) {
  const direction = prompt.toLowerCase();
  if (prompt.includes('纸箱') || direction.includes('cardboard')) return ['a cardboard city of crooked box towers, blank signboards, and folded-paper alleys', '由歪斜纸箱高楼、空白路牌和折纸小巷组成的纸箱城市'];
  if (['办公室', '工位', '需求', '加班'].some(x => prompt.includes(x)) || ['甲方', '老板', '简历'].some(x => subject.includes(x))) return ['a flat fluorescent office wasteland with repeating desks and malformed documents', '荧光灯扁平照亮、工位重复、文档变形的办公室荒原'];
  if (['服务器', '机房', '报错', '代码', 'server', 'error'].some(x => direction.includes(x)) || ['代码', 'ai', '程序'].some(x => subject.toLowerCase().includes(x))) return ['a server-room desert with floating blank error boxes and a flat blue floor', '漂浮着空白报错框、地面纯蓝的服务器荒漠'];
  if (['股市', '基金', '牛市', '跌停'].some(x => prompt.includes(x)) || ['股', '币', '基金'].some(x => subject.includes(x))) return ['a red-green market altar made from crude blocks and broken charts', '由粗糙方块和破碎图表搭成的红绿市场祭坛'];
  return ['an empty flat grassland with identical blob trees and a solid blue sky', '树木完全复制、天空纯蓝的空旷扁平草原'];
}

function characterFor(subject, prompt, tone) {
  let archetype;
  if (subject.includes('外卖') || prompt.includes('骑手')) archetype = 'an original helmet-headed delivery-rider humanoid carrying a warped unbranded delivery box';
  else if (subject.includes('猫')) archetype = 'an original upright cat with a trapezoid head, uneven stick legs, and a kinked tail';
  else if (['代码', 'ai', '程序'].some(x => subject.toLowerCase().includes(x))) archetype = 'an original terminal-window humanoid with a crooked cuboid head and one missing body corner';
  else if (['甲方', '老板', '简历'].some(x => subject.includes(x))) archetype = 'an original office archetype with an asymmetric polygon head and a narrow suit body';
  else archetype = `an original ${subject}-inspired upright protagonist`;
  return `${archetype}, blocky toy-like geometry, awkward original facial design, stiff posture, blurry textures, visible mesh gaps, stable two-color silhouette; tone: ${tone}`;
}

export function createPack(payload) {
  const prompt = String(payload.prompt || '').trim();
  if (!prompt) throw new Error('请先写下一句话创意。');
  let subject = cleanSubject(payload.subject);
  if (!subject) subject = cleanSubject(prompt.split('来', 1)[0].trim().replace(/[《》 ，。！？]/g, '').slice(-12));
  if (!subject) throw new Error('请填写主角，例如“猫”或“甲方”。');
  const template = String(payload.template || 'ad_hook');
  if (!TEMPLATES[template]) throw new Error('未知的故事结构。');
  const duration = Number(payload.duration || 15);
  const [mission, missionZh, defaultLine, reveal, revealZh] = TEMPLATES[template];
  const line = String(payload.required_line || '').trim() || defaultLine;
  const title = `《${subject}来》`;
  const tone = TONES[payload.tone] || String(payload.tone || '').trim() || TONES.meme;
  const [world, worldZh] = worldFor(subject, prompt);
  const character = characterFor(subject, prompt, tone);
  const still = `Original scene for ${title}. ${character} Environment: ${world}. Extremely crude amateur low-poly 3D, wrong proportions, flat default viewport lighting, little shadow, clipping, awkward sincere pose, low-resolution texture. No copyrighted character, logo, exact film frame, polished studio animation, photorealism, cinematic lighting, or clean topology. Hard creative direction to honor: ${prompt}`;
  const motion = `${duration}-second original short. Keep the first-frame subject and colors stable. Hard creative direction: ${prompt}. The protagonist tries to ${mission} in ${world}; jerky low-frame-rate movement, stiff head turn, sliding feet, delayed mouth motion for '${line}', then ${reveal}. One main action per shot, static camera or awkward slow push-in, hard cut at reveal. Avoid smooth cinematic animation, realistic physics, new characters, and camera shake.`;
  const actions = { hook: `在${worldZh}中亮出${subject}主角与核心困境。`, conflict: `主角试图${missionZh}，动作真诚而机械地崩坏。`, reveal: `${revealZh}。` };
  const subtitles = { hook: title, conflict: line, reveal: '下一个，谁来？' };
  const script = timeline(duration).map(([start, end, beat]) => ({ time: `${start}-${end}s`, beat, action: actions[beat], subtitle: subtitles[beat] }));
  const shot = {
    shot_id: 'shot_001', duration: `${duration}s`, purpose: template,
    first_frame_prompt: `${still} The subject faces camera with clean subtitle space.`, motion_prompt: motion,
    camera: 'static medium-wide shot; optional awkward 5% push-in', subtitle: line, voiceover: line,
    negative_prompt: 'polished 3D, cinematic light, smooth motion, realistic physics, extra limbs, new subjects, text artifacts',
    runway_prompt: `Use the supplied first frame. ${motion}`,
    kling_prompt: `Lock the supplied image as subject reference; preserve face, silhouette, colors, and environment. ${motion}`,
    seedance_prompt: `Use character, first-frame, and poster references when supplied; keep continuity across the short. ${motion}`,
    editing_notes: 'Add exact Chinese titles and subtitles in editing; cut on the broken reveal frame.',
  };
  return {
    schema_version: '0.1.0', title,
    source: { subject, prompt, tone: String(payload.tone || 'meme'), template, duration, required_line: payload.required_line || null, platform: payload.platform || '通用短视频', language: 'zh-CN' },
    constraint_report: { subject, creative_prompt: prompt, required_line: line, duration_seconds: duration, platform: payload.platform || '通用短视频', language: 'zh-CN' },
    hook: `${subject}以最真诚、最不协调的方式，试图${missionZh}。`, character_bible: character, world, world_zh: worldZh, script,
    image_prompts: {
      poster_scam: `Elegant original animated-film poster for ${title}; painterly ink-wash mood, mist, negative space, tiny symbolic ${subject} subject, no logos or embedded text, no crude 3D. Context: ${prompt}`,
      broken_footage_still: still,
      character_reference: `Full-body reference of one subject. ${character} Plain light-gray background, front and three-quarter views, no text.`,
      meme_reaction: `Close-up of the same original ${subject} protagonist, blank delayed reaction, crude low-poly face, simple background, large empty caption area; line supplied separately: ${line}`,
    },
    video_shots: [shot],
    publishing_copy: { post_title: `我做了一个${title}，看完沉默了`, cover_text: `${subject}真的来了`, first_comment: '下一个你想看谁来？', hashtags: ['#万物皆可来', '#openniulai', '#AI动画', `#${subject}来`] },
    rights_note: 'Original transformative concept only; do not use protected film frames, characters, logos, or copied dialogue.',
  };
}
