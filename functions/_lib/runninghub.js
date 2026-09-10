const BASE_URL = 'https://www.runninghub.ai';
const CN_V2_BASE_URL = 'https://www.runninghub.cn';
const VIDEO_TYPES = new Set(['mp4', 'webm', 'mov', 'm4v']);

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function assertKey(apiKey) {
  if (!apiKey || apiKey.length < 12) throw new Error('请先连接有效的 RunningHub API Key。');
}

function assertNodeId(value, label) {
  const id = String(value || '').trim();
  if (!id || !/^[A-Za-z0-9_.:-]{1,100}$/.test(id)) throw new Error(`${label}无效。`);
  return id;
}

const DEFAULT_AI_APPS = [
  {
    id: 'minimax-h3-style', name: 'MiniMax H3 · 风格参考生成', badge: '风格优先',
    description: 'RunningHub 标准模型接口，仅企业共享 API Key 可调用。', supports_image: true,
    transport: 'standard_model', endpoint: '/openapi/v2/minimax/hailuo-h3/multimodal-to-video',
    reference_asset: '/style/original-lowpoly-office-reference-v1.png', estimated_cost: '需企业共享 API Key',
    availability_reason: '当前消费级 API Key 不可用；RunningHub 会返回 1014。',
  },
  {
    id: 'minimax-h3', name: 'MiniMax H3 成片实例', badge: '快速出片',
    description: '适合文本直出、首帧引导和带声音的短片。', supports_image: true,
  },
  {
    id: 'seedance', name: 'Seedance 成片实例', badge: '高质量',
    description: '适合强调镜头表现、角色一致性和参考素材的视频。', supports_image: true,
    availability_reason: '尚未绑定通过稳定性验收的 Seedance AI 应用。',
  },
];

function cleanInstance(raw, fallback = {}) {
  const id = String(raw?.id || fallback.id || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{1,49}$/.test(id)) return null;
  const webappId = String(raw?.webapp_id || raw?.webappId || '').trim();
  const promptNodeId = String(raw?.prompt_node_id || raw?.promptNodeId || '').trim();
  const requestedInstanceType = String(raw?.instance_type || raw?.instanceType || 'default').trim().toLowerCase();
  const transport = String(raw?.transport || fallback.transport || 'ai_app') === 'standard_model' ? 'standard_model' : 'ai_app';
  const endpoint = String(raw?.endpoint || fallback.endpoint || '').trim();
  const referenceAsset = String(raw?.reference_asset || raw?.referenceAsset || fallback.reference_asset || '').trim();
  const standardEnabled = raw?.enabled === true;
  const verified = raw?.verified === true;
  const aiAppMapped = /^\d{6,30}$/.test(webappId) && Boolean(promptNodeId);
  return {
    id,
    name: String(raw?.name || fallback.name || id).slice(0, 80),
    badge: String(raw?.badge || fallback.badge || 'AI 实例').slice(0, 30),
    description: String(raw?.description || fallback.description || '').slice(0, 240),
    preview_url: httpsUrl(raw?.preview_url || raw?.previewUrl),
    estimated_cost: String(raw?.estimated_cost || raw?.estimatedCost || '以 RunningHub 提交页为准').slice(0, 80),
    supports_image: raw?.supports_image ?? raw?.supportsImage ?? fallback.supports_image ?? false,
    configured: transport === 'standard_model'
      ? standardEnabled && endpoint === '/openapi/v2/minimax/hailuo-h3/multimodal-to-video' && /^\/[A-Za-z0-9/_.-]+$/.test(referenceAsset)
      : aiAppMapped && verified,
    transport, endpoint, reference_asset: referenceAsset, enabled: standardEnabled, verified,
    availability_reason: String(raw?.availability_reason || raw?.availabilityReason || (aiAppMapped && !verified ? '已绑定，但尚未通过真实成片验收。' : fallback.availability_reason) || '').slice(0, 180),
    api_version: String(raw?.api_version || raw?.apiVersion || 'legacy') === 'v2' ? 'v2' : 'legacy',
    instance_type: ['default', 'plus', 'ultra'].includes(requestedInstanceType) ? requestedInstanceType : 'default',
    webapp_id: webappId,
    prompt_node_id: promptNodeId,
    prompt_field: String(raw?.prompt_field || raw?.promptField || 'text').trim(),
    image_node_id: String(raw?.image_node_id || raw?.imageNodeId || '').trim(),
    image_field: String(raw?.image_field || raw?.imageField || 'image').trim(),
    duration_node_id: String(raw?.duration_node_id || raw?.durationNodeId || '').trim(),
    duration_field: String(raw?.duration_field || raw?.durationField || 'value').trim(),
    ratio_node_id: String(raw?.ratio_node_id || raw?.ratioNodeId || '').trim(),
    ratio_field: String(raw?.ratio_field || raw?.ratioField || 'value').trim(),
    fixed_fields: Array.isArray(raw?.fixed_fields || raw?.fixedFields) ? (raw.fixed_fields || raw.fixedFields).slice(0, 20) : [],
  };
}

export function aiAppCatalog(env = {}) {
  let configured = [];
  if (env.RUNNINGHUB_AI_APPS) {
    try {
      const parsed = JSON.parse(env.RUNNINGHUB_AI_APPS);
      if (!Array.isArray(parsed)) throw new Error('必须是数组');
      configured = parsed.map(item => cleanInstance(item)).filter(Boolean);
    } catch (error) {
      throw new Error(`RUNNINGHUB_AI_APPS 配置无效：${error.message}`);
    }
  }
  const byId = new Map(configured.map(item => [item.id, item]));
  const defaults = DEFAULT_AI_APPS.map(item => cleanInstance(byId.get(item.id) || {}, item));
  const extras = configured.filter(item => !DEFAULT_AI_APPS.some(defaultItem => defaultItem.id === item.id));
  return [...defaults, ...extras];
}

export function publicAiApp(instance) {
  const { webapp_id: _webappId, prompt_node_id: _promptNodeId, prompt_field: _promptField,
    image_node_id: _imageNodeId, image_field: _imageField, duration_node_id: _durationNodeId,
    duration_field: _durationField, ratio_node_id: _ratioNodeId, ratio_field: _ratioField,
    fixed_fields: _fixedFields, api_version: _apiVersion, instance_type: _instanceType,
    endpoint: _endpoint, transport: _transport, reference_asset: _referenceAsset, enabled: _enabled,
    verified: _verified, ...safe } = instance;
  return { ...safe, mode: _transport, uses_builtin_style_reference: _transport === 'standard_model' };
}

export function getAiApp(env, id) {
  const instance = aiAppCatalog(env).find(item => item.id === String(id || '').trim());
  if (!instance || !instance.configured) throw new Error('所选 AI 实例尚未配置或已停用。');
  return instance;
}

export function buildAiAppNodeInfo(instance, payload, uploadedFileName = null) {
  const prompt = String(payload.prompt || '').trim();
  if (!prompt || prompt.length > 7000) throw new Error('视频提示词长度必须为 1-7000 个字符。');
  const nodes = [{
    nodeId: assertNodeId(instance.prompt_node_id, '实例提示词参数'),
    fieldName: assertNodeId(instance.prompt_field || 'text', '实例提示词字段'),
    fieldValue: prompt,
  }];
  if (uploadedFileName) {
    if (!instance.supports_image || !instance.image_node_id) throw new Error('所选 AI 实例不支持首帧输入。');
    nodes.push({
      nodeId: assertNodeId(instance.image_node_id, '实例图片参数'),
      fieldName: assertNodeId(instance.image_field || 'image', '实例图片字段'),
      fieldValue: uploadedFileName,
    });
  }
  if (instance.duration_node_id && payload.duration) nodes.push({
    nodeId: assertNodeId(instance.duration_node_id, '实例时长参数'),
    fieldName: assertNodeId(instance.duration_field || 'value', '实例时长字段'),
    fieldValue: String(payload.duration),
  });
  if (instance.ratio_node_id && payload.ratio) nodes.push({
    nodeId: assertNodeId(instance.ratio_node_id, '实例比例参数'),
    fieldName: assertNodeId(instance.ratio_field || 'value', '实例比例字段'),
    fieldValue: String(payload.ratio),
  });
  for (const field of instance.fixed_fields || []) nodes.push({
    nodeId: assertNodeId(field.node_id || field.nodeId, '实例固定参数'),
    fieldName: assertNodeId(field.field_name || field.fieldName, '实例固定字段'),
    fieldValue: String(field.field_value ?? field.fieldValue ?? ''),
  });
  return nodes;
}

export function buildNodeInfo(payload, uploadedFileName = null) {
  const prompt = String(payload.prompt || '').trim();
  if (!prompt || prompt.length > 7000) throw new Error('工作流提示词长度必须为 1-7000 个字符。');
  const promptNodeId = assertNodeId(payload.prompt_node_id, '提示词节点 ID');
  const promptField = assertNodeId(payload.prompt_field || 'text', '提示词字段名');
  const nodes = [{ nodeId: promptNodeId, fieldName: promptField, fieldValue: prompt }];
  if (uploadedFileName) {
    nodes.push({
      nodeId: assertNodeId(payload.image_node_id, '图片节点 ID'),
      fieldName: assertNodeId(payload.image_field || 'image', '图片字段名'),
      fieldValue: uploadedFileName,
    });
  }
  return nodes;
}

export function normalizeOutputs(data) {
  if (data && typeof data === 'object' && Array.isArray(data.results)) {
    const failedReason = data.failedReason && typeof data.failedReason === 'object' ? data.failedReason : {};
    const outputs = data.results.map(item => ({
      url: httpsUrl(item.url),
      type: String(item.outputType || '').toLowerCase(),
      node_id: item.nodeId == null ? null : String(item.nodeId),
    })).filter(item => item.url);
    const raw = String(data.status || 'RUNNING').toLowerCase();
    const video = outputs.find(item => VIDEO_TYPES.has(item.type)) || null;
    const status = raw === 'success' ? (video ? 'succeeded' : 'failed') : raw === 'failed' ? 'failed' : raw === 'queued' ? 'queued' : 'running';
    return {
      status, outputs, video_url: video?.url || null, output_type: video?.type || null,
      error: raw === 'failed'
        ? (data.errorMessage || failedReason.exception_message || failedReason.message || 'RunningHub AI 实例生成失败。')
        : raw === 'success' && !video ? 'AI 实例已完成，但没有返回视频文件。' : null,
      usage: data.usage || null,
    };
  }
  if (Array.isArray(data)) {
    const outputs = data.map(item => ({
      url: httpsUrl(item.fileUrl || item.url),
      type: String(item.fileType || item.outputType || '').toLowerCase(),
      node_id: item.nodeId == null ? null : String(item.nodeId),
    })).filter(item => item.url);
    const video = outputs.find(item => VIDEO_TYPES.has(item.type)) || null;
    return {
      status: video ? 'succeeded' : outputs.length ? 'failed' : 'running',
      outputs,
      video_url: video?.url || null,
      output_type: video?.type || null,
      error: outputs.length && !video ? '工作流已完成，但输出节点没有返回 MP4、WebM、MOV 或 M4V 视频。' : null,
    };
  }
  if (data && typeof data === 'object') {
    const raw = String(data.taskStatus || data.status || (data.errorCode ? 'failed' : 'running')).toLowerCase();
    const status = raw === 'success' ? 'succeeded' : raw === 'failed' ? 'failed' : raw === 'queued' ? 'queued' : 'running';
    const failedReason = data.failedReason && typeof data.failedReason === 'object' ? data.failedReason : {};
    return {
      status, outputs: [], video_url: null, output_type: null,
      error: status === 'failed'
        ? (data.errorMessage || failedReason.exception_message || failedReason.message || `RunningHub ${data.errorCode || '错误'}：AI 实例生成失败。`)
        : null,
      usage: data.usage || null,
    };
  }
  return { status: 'running', outputs: [], video_url: null, output_type: null };
}

export async function runningHubJson(path, apiKey, body) {
  assertKey(apiKey);
  const response = await fetch(BASE_URL + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, ...body }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`RunningHub HTTP ${response.status}：${result.msg || '请求失败'}`);
  if (result.code !== 0) throw new Error(`RunningHub ${result.code ?? '错误'}：${result.msg || '请求失败'}`);
  return result.data;
}

export async function runningHubV2Json(path, apiKey, body, { allowTaskFailure = false } = {}) {
  assertKey(apiKey);
  const response = await fetch(CN_V2_BASE_URL + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`RunningHub HTTP ${response.status}：${result.errorMessage || result.message || '请求失败'}`);
  if (result.errorCode && !allowTaskFailure) throw new Error(`RunningHub ${result.errorCode}：${result.errorMessage || '请求失败'}`);
  return result;
}

export async function uploadDataUrl(apiKey, dataUrl, filename = 'first-frame.png') {
  assertKey(apiKey);
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('首帧必须是 JPG、PNG 或 WebP 图片。');
  const bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0));
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('首帧图片不能超过 10 MB。');
  const form = new FormData();
  form.append('apiKey', apiKey);
  form.append('fileType', 'input');
  form.append('file', new Blob([bytes], { type: match[1] }), filename.replace(/[^A-Za-z0-9._-]/g, '_'));
  const response = await fetch(`${BASE_URL}/task/openapi/upload`, {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.code !== 0 || !result.data?.fileName) {
    throw new Error(`RunningHub 上传失败：${result.msg || `HTTP ${response.status}`}`);
  }
  return result.data.fileName;
}
