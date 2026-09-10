import { ORIGINAL_LOW_POLY_ABSURD } from './style-profile.js';

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
  else if (subject.includes('猫')) archetype = 'an original bipedal cat-headed humanoid, not a real cat and not quadrupedal, with a trapezoid head, a rectangular torso, uneven stick legs, a kinked tail, crudely pasted human-like eyes and mouth, and no individual fur strands';
  else if (['代码', 'ai', '程序'].some(x => subject.toLowerCase().includes(x))) archetype = 'an original terminal-window humanoid with a crooked cuboid head and one missing body corner';
  else if (['甲方', '老板', '简历'].some(x => subject.includes(x))) archetype = 'an original office archetype with an asymmetric polygon head and a narrow suit body';
  else archetype = `an original ${subject}-inspired upright protagonist`;
  return `${archetype}, ugly blocky toy geometry, awkward original facial design, stiff upright posture, blurry textures, visible mesh gaps and deliberately incorrect anatomy, stable two-color silhouette; tone: ${tone}`;
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
  const [defaultMission, defaultMissionZh, defaultLine, defaultReveal, defaultRevealZh] = TEMPLATES[template];
  const draft = payload.script_draft && typeof payload.script_draft === 'object' ? payload.script_draft : null;
  const missionZh = String(draft?.mission || defaultMissionZh).trim().slice(0, 160);
  const mission = draft ? `complete this precise mission: ${missionZh}` : defaultMission;
  const revealZh = String(draft?.reveal || defaultRevealZh).trim().slice(0, 220);
  const reveal = draft ? `the final reveal lands: ${revealZh}` : defaultReveal;
  const line = String(payload.required_line || draft?.repeated_line || '').trim().slice(0, 80) || defaultLine;
  const title = String(draft?.title || `《${subject}来》`).trim().slice(0, 50);
  const tone = TONES[payload.tone] || String(payload.tone || '').trim() || TONES.meme;
  const styleStrength = ['restrained', 'standard', 'extreme'].includes(payload.style_strength) ? payload.style_strength : 'standard';
  const styleDirection = {
    restrained: 'restrained deadpan absurdity, readable staging, one awkward pause',
    standard: 'strong deadpan absurdity, deliberately broken low-budget staging, repeated line and delayed reveal',
    extreme: 'escalating absurdity and visibly broken staging, while preserving one subject and one action per beat',
  }[styleStrength];
  const [world, worldZh] = worldFor(subject, prompt);
  const character = characterFor(subject, prompt, tone);
  const still = `${ORIGINAL_LOW_POLY_ABSURD.visual_prompt}. SUBJECT LOCK: ${character}. ENVIRONMENT: ${world}. ORIGINAL STORY: ${prompt}. This must look technically inept and sincerely handmade, not stylish retro art. AVOID AND DO NOT BEAUTIFY: ${ORIGINAL_LOW_POLY_ABSURD.negative_prompt}.`;
  const slots = timeline(duration);
  const fallbackActions = { hook: `在${worldZh}中亮出${subject}和一个微不足道却被认真对待的危机。`, conflict: `主角试图${missionZh}，失败后僵硬停顿，再重复同一句话。`, reveal: `${revealZh}，让前面的台词突然变了意思。` };
  const fallbackSubtitles = { hook: title, conflict: line, reveal: line };
  const draftShots = Array.isArray(draft?.shots) && draft.shots.length === 3 ? draft.shots : null;
  const script = slots.map(([start, end, beat], index) => ({
    time: `${start}-${end}s`, beat,
    action: String(draftShots?.[index]?.action || fallbackActions[beat]).trim().slice(0, 300),
    subtitle: String(draftShots?.[index]?.subtitle || fallbackSubtitles[beat]).trim().slice(0, 100),
  }));
  const beatPlan = script.map(item => `${item.time}: ${item.action} Spoken line, not rendered text: "${item.subtitle}"`).join(' THEN ');
  const motion = `${ORIGINAL_LOW_POLY_ABSURD.visual_prompt}. ${duration}-second LOCKED SHOT. SUBJECT: ${character}. SET: ${world}. ACTION TIMELINE: ${beatPlan}. PERFORMANCE: ${styleDirection}; ${ORIGINAL_LOW_POLY_ABSURD.motion_prompt}. STORY GOAL: ${mission}. FINAL REVEAL: ${reveal}. Keep exactly one protagonist, one fixed set and the same visibly broken model throughout. Do not invent text, signs, extra characters or a cinematic subplot. AVOID AND DO NOT BEAUTIFY: ${ORIGINAL_LOW_POLY_ABSURD.negative_prompt}.`;
  const shot = {
    shot_id: 'shot_001', duration: `${duration}s`, purpose: template,
    first_frame_prompt: `${still} The subject faces camera with clean subtitle space.`, motion_prompt: motion,
    camera: 'locked static medium-wide shot; no pan, orbit, handheld motion or cinematic push-in', subtitle: line, voiceover: line,
    negative_prompt: ORIGINAL_LOW_POLY_ABSURD.negative_prompt,
    runway_prompt: `Use the supplied first frame. ${motion}`,
    kling_prompt: `Lock the supplied image as subject reference; preserve face, silhouette, colors, and environment. ${motion}`,
    seedance_prompt: `Use character, first-frame, and poster references when supplied; keep continuity across the short. ${motion}`,
    editing_notes: 'Add exact Chinese titles and subtitles in editing; cut on the broken reveal frame.',
  };
  return {
    schema_version: '0.1.0', title,
    source: { subject, prompt, tone: String(payload.tone || 'meme'), template, style_strength: styleStrength, script_provider: String(payload.script_provider || (draft ? 'ai' : 'local')), duration, required_line: payload.required_line || null, platform: payload.platform || '通用短视频', language: 'zh-CN' },
    constraint_report: { subject, creative_prompt: prompt, required_line: line, duration_seconds: duration, platform: payload.platform || '通用短视频', language: 'zh-CN' },
    hook: String(draft?.hook || `${subject}以最真诚、最不协调的方式，试图${missionZh}。`).trim().slice(0, 220), character_bible: character, world, world_zh: worldZh, script,
    style_profile: { id: ORIGINAL_LOW_POLY_ABSURD.id, name: ORIGINAL_LOW_POLY_ABSURD.name, reference_asset: ORIGINAL_LOW_POLY_ABSURD.reference_asset },
    story_design: { premise: String(draft?.premise || prompt).trim().slice(0, 300), mission: missionZh, obstacle: String(draft?.obstacle || '动作和环境以最笨拙的方式阻止主角').trim().slice(0, 200), repeated_line: line, reveal: revealZh, style_strength: styleStrength },
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
