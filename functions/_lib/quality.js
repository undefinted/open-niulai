function includes(value, expected) {
  return String(value || '').includes(String(expected || ''));
}

function check(id, label, passed, evidence, remediation, weight = 10) {
  return {
    id, label, weight,
    status: passed ? 'pass' : 'fail',
    evidence: String(evidence || ''),
    remediation: passed ? null : remediation,
  };
}

function parseTimeline(script) {
  const segments = [];
  for (const beat of Array.isArray(script) ? script : []) {
    const match = String(beat?.time || '').match(/^(\d+)-(\d+)s$/);
    if (!match) return { valid: false, evidence: `无法解析时间段：${beat?.time || '空值'}` };
    segments.push({ start: Number(match[1]), end: Number(match[2]) });
  }
  if (!segments.length) return { valid: false, evidence: '没有分镜时间段' };
  const contiguous = segments[0].start === 0 && segments.every((item, index) => (
    item.end > item.start && (index === 0 || item.start === segments[index - 1].end)
  ));
  return {
    valid: contiguous,
    end: segments.at(-1).end,
    evidence: contiguous
      ? `${segments.length} 个时间段连续覆盖 0-${segments.at(-1).end}s`
      : '时间段存在空档、重叠或倒序',
  };
}

function percentage(items) {
  if (!items.length) return 0;
  return Math.round(items.filter(item => item.status === 'pass').length / items.length * 100);
}

export function evaluatePack(pack) {
  const source = pack?.source || {};
  const constraints = pack?.constraint_report || {};
  const shot = Array.isArray(pack?.video_shots) ? pack.video_shots[0] || {} : {};
  const timeline = parseTimeline(pack?.script);
  const requiredFields = ['title', 'hook', 'character_bible', 'script', 'image_prompts', 'video_shots', 'publishing_copy', 'constraint_report'];
  const missingFields = requiredFields.filter(field => {
    const value = pack?.[field];
    return value == null || value === '' || (Array.isArray(value) && value.length === 0) || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
  });
  const scriptText = (pack?.script || []).map(item => `${item.subtitle || ''} ${item.action || ''}`).join(' ');
  const promptText = `${shot.first_frame_prompt || ''} ${shot.motion_prompt || ''}`;
  const subject = constraints.subject || source.subject || '';
  const creativePrompt = constraints.creative_prompt || source.prompt || '';
  const requiredLine = constraints.required_line || source.required_line || '';
  const duration = Number(constraints.duration_seconds || source.duration || 0);

  const checks = [
    check('required_fields', '制作包字段完整', missingFields.length === 0,
      missingFields.length ? `缺少：${missingFields.join('、')}` : `8/8 个核心字段存在`, '补齐缺失字段后重新生成。'),
    check('subject_coverage', '主角约束已覆盖', Boolean(subject) && includes(`${pack?.title} ${pack?.hook}`, subject),
      subject ? `主角“${subject}”已写入标题与钩子` : '主角为空', '在标题和故事钩子中明确主角。'),
    check('prompt_traceability', '原始创意可追溯', Boolean(creativePrompt) && includes(promptText, creativePrompt),
      creativePrompt ? '原始创意已原样进入首帧或运动提示词' : '原始创意为空', '将用户原始创意保留在模型提示词中。'),
    check('required_line', '指定台词已落实', Boolean(requiredLine) && includes(scriptText, requiredLine) && includes(`${shot.voiceover} ${shot.motion_prompt}`, requiredLine),
      requiredLine ? `台词“${requiredLine}”已进入脚本和视频指令` : '指定台词为空', '让指定台词同时出现在脚本字幕和视频指令中。'),
    check('timeline_integrity', '分镜时间线连续', timeline.valid, timeline.evidence, '修正分镜时间段，使其从 0 秒连续覆盖至结尾。'),
    check('duration_match', '目标时长一致', timeline.valid && timeline.end === duration && String(shot.duration) === `${duration}s`,
      `需求 ${duration}s；脚本 ${timeline.end ?? '未知'}s；镜头 ${shot.duration || '未知'}`, '统一需求、脚本终点和视频镜头时长。'),
    check('visual_prompts', '视觉资产提示词齐备', Object.keys(pack?.image_prompts || {}).length >= 4 && Boolean(shot.first_frame_prompt),
      `${Object.keys(pack?.image_prompts || {}).length} 个图像提示词；${shot.first_frame_prompt ? '含首帧提示词' : '缺首帧提示词'}`, '至少提供海报、首帧、角色参考和反应特写。'),
    check('generation_controls', '生成控制项齐备', Boolean(shot.motion_prompt && shot.camera && shot.negative_prompt),
      `运动提示词、镜头和负面提示词：${[shot.motion_prompt, shot.camera, shot.negative_prompt].filter(Boolean).length}/3`, '补齐运动、镜头和负面提示词。'),
    check('publishing_ready', '发布素材齐备', Boolean(pack?.publishing_copy?.post_title && pack?.publishing_copy?.cover_text && pack?.publishing_copy?.first_comment && pack?.publishing_copy?.hashtags?.length),
      `标题、封面、首评和标签：${[pack?.publishing_copy?.post_title, pack?.publishing_copy?.cover_text, pack?.publishing_copy?.first_comment, pack?.publishing_copy?.hashtags?.length].filter(Boolean).length}/4`, '补齐发布标题、封面文案、首评和标签。'),
    check('rights_guardrail', '原创与版权边界已声明', /protected|copyright|版权|原创/i.test(String(pack?.rights_note || '')),
      pack?.rights_note ? '制作包包含原创与版权边界说明' : '缺少版权边界说明', '补充原创性、商标和受保护素材的使用边界。'),
  ];

  const score = Math.round(checks.reduce((sum, item) => sum + (item.status === 'pass' ? item.weight : 0), 0));
  const groups = {
    constraint_coverage_percent: percentage(checks.slice(1, 4)),
    required_field_completeness_percent: percentage([checks[0], checks[6], checks[8]]),
    timeline_integrity_percent: percentage(checks.slice(4, 6)),
    production_readiness_percent: percentage(checks.slice(6, 10)),
  };
  const failed = checks.filter(item => item.status === 'fail').length;
  return {
    schema_version: 'quality-report/1.0',
    status: failed ? 'blocked' : 'passed',
    score,
    score_note: '规则验证分，不代表成片审美质量。',
    summary: { passed: checks.length - failed, total: checks.length, failed },
    metrics: groups,
    checks,
  };
}
