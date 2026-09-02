const BASE_URL = 'https://www.runninghub.ai';
const VIDEO_TYPES = new Set(['mp4', 'webm', 'mov', 'm4v']);

function assertKey(apiKey) {
  if (!apiKey || apiKey.length < 12) throw new Error('请先连接有效的 RunningHub API Key。');
}

function assertNodeId(value, label) {
  const id = String(value || '').trim();
  if (!id || !/^[A-Za-z0-9_.:-]{1,100}$/.test(id)) throw new Error(`${label}无效。`);
  return id;
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
  if (Array.isArray(data)) {
    const outputs = data.map(item => ({
      url: item.fileUrl || item.url || null,
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
    const raw = String(data.taskStatus || data.status || 'running').toLowerCase();
    const status = raw === 'success' ? 'succeeded' : raw === 'failed' ? 'failed' : raw === 'queued' ? 'queued' : 'running';
    return { status, outputs: [], video_url: null, output_type: null };
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
