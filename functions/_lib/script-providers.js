import { HttpError } from './http.js';
import { ORIGINAL_LOW_POLY_ABSURD, scriptSystemPrompt } from './style-profile.js';

const PROVIDERS = {
  qwen: {
    name: '通义千问',
    model: 'qwen-plus',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    envKey: 'QWEN_API_KEY',
  },
  deepseek: {
    name: 'DeepSeek',
    model: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/chat/completions',
    envKey: 'DEEPSEEK_API_KEY',
  },
};

function text(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function normalizeCandidate(raw, index) {
  const shots = Array.isArray(raw?.shots) ? raw.shots.slice(0, 3).map((shot, shotIndex) => ({
    beat: ['hook', 'conflict', 'reveal'][shotIndex],
    action: text(shot?.action, 300),
    subtitle: text(shot?.subtitle, 80),
  })) : [];
  if (shots.length !== 3 || shots.some(shot => !shot.action)) throw new HttpError(`第 ${index + 1} 个候选缺少可执行分镜。`, 502, 'invalid_model_output');
  const candidate = {
    id: `draft_${index + 1}`,
    title: text(raw?.title, 40), premise: text(raw?.premise, 240), hook: text(raw?.hook, 160),
    mission: text(raw?.mission, 120), obstacle: text(raw?.obstacle, 160),
    repeated_line: text(raw?.repeated_line, 60), reveal: text(raw?.reveal, 180), shots,
  };
  if (!candidate.title || !candidate.premise || !candidate.mission || !candidate.repeated_line || !candidate.reveal) {
    throw new HttpError(`第 ${index + 1} 个候选字段不完整。`, 502, 'invalid_model_output');
  }
  return candidate;
}

function parseCandidates(content) {
  let parsed;
  try { parsed = JSON.parse(String(content || '').trim()); }
  catch { throw new HttpError('脚本模型没有返回有效 JSON，请重试。', 502, 'invalid_model_output'); }
  if (!Array.isArray(parsed?.candidates) || parsed.candidates.length < 3) {
    throw new HttpError('脚本模型没有返回三个完整候选，请重试。', 502, 'invalid_model_output');
  }
  return parsed.candidates.slice(0, 3).map(normalizeCandidate);
}

export async function generateScriptCandidates(payload, env, suppliedKey = '') {
  const providerId = text(payload.provider, 30);
  const provider = PROVIDERS[providerId];
  if (!provider) throw new HttpError('不支持的脚本模型。', 400, 'invalid_script_provider');
  const apiKey = text(suppliedKey, 500) || text(env?.[provider.envKey], 500);
  if (!apiKey) throw new HttpError(`请先连接${provider.name}，或由管理员配置云端密钥。`, 401, 'script_key_required');
  const prompt = text(payload.prompt, 500);
  if (!prompt) throw new HttpError('请先写下一句话创意。');
  const duration = Math.min(60, Math.max(6, Number(payload.duration || 15)));
  const style = ORIGINAL_LOW_POLY_ABSURD.intensities[payload.style_strength] || ORIGINAL_LOW_POLY_ABSURD.intensities.standard;
  const userPrompt = `请生成三个差异明显的原创短片候选。\n创意：${prompt}\n主角：${text(payload.subject, 30) || '由你从创意中提取'}\n目标时长：${duration} 秒\n气质：${text(payload.tone, 30) || '荒谬真诚'}\n风格强度：${style}\n用户指定台词：${text(payload.required_line, 60) || '无，由你设计'}\n确保 JSON 中所有字符串使用简体中文。`;
  const response = await fetch(provider.endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: 'system', content: scriptSystemPrompt() }, { role: 'user', content: userPrompt }],
      response_format: { type: 'json_object' }, temperature: 0.9, max_tokens: 2400,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = text(result?.error?.message || result?.message, 180);
    throw new HttpError(`${provider.name}脚本生成失败${detail ? `：${detail}` : '，请检查密钥或额度。'}`, response.status === 401 ? 401 : 502, 'script_provider_error');
  }
  const content = result?.choices?.[0]?.message?.content;
  return { provider: providerId, model: provider.model, candidates: parseCandidates(content) };
}

export const SCRIPT_PROVIDERS = Object.entries(PROVIDERS).map(([id, item]) => ({ id, name: item.name, model: item.model }));
