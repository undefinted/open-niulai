const BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

export function seedanceCredentials(request) {
  const apiKey = String(request.headers.get('X-Provider-Key') || '').trim();
  const model = String(request.headers.get('X-Provider-Model') || '').trim();
  if (apiKey.length < 12) throw new Error('请先连接有效的火山方舟 API Key。');
  if (!/^[A-Za-z0-9_.:-]{6,120}$/.test(model)) throw new Error('请填写已开通的 Seedance 模型 ID 或推理接入点 ID。');
  return {apiKey, model};
}

export function buildSeedancePayload(prompt, model, duration = 10, ratio = '16:9', firstFrameImage = null) {
  const text = String(prompt || '').trim();
  if (!text || text.length > 7000) throw new Error('Seedance 视频提示词长度必须为 1-7000 个字符。');
  if (!['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'].includes(ratio)) throw new Error('Seedance 视频比例无效。');
  const seconds = Number(duration) <= 5 ? 5 : 10;
  const content = [{type:'text', text:`${text} --ratio ${ratio} --duration ${seconds} --resolution 720p --watermark false`}];
  if (firstFrameImage) {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(firstFrameImage)) throw new Error('首帧必须是 JPG、PNG 或 WebP 图片。');
    content.push({type:'image_url', image_url:{url:firstFrameImage}, role:'first_frame'});
  }
  return {model, content};
}

export async function seedanceRequest(method, path, apiKey, body = undefined) {
  const response = await fetch(BASE_URL + path, {
    method,
    headers:{Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json'},
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result.error?.message || result.message || result.error || '请求失败';
    throw new Error(`火山方舟 HTTP ${response.status}：${message}`);
  }
  return result;
}
