const BASE_URLS = { cn: 'https://api.minimaxi.com', global: 'https://api.minimax.io' };

export function buildPayload(prompt, duration = 10, ratio = '16:9', firstFrameImage = null) {
  prompt = String(prompt || '').trim();
  if (!prompt || prompt.length > 7000) throw new Error('H3 视频提示词长度必须为 1-7000 个字符。');
  if (!Number.isInteger(duration) || duration < 4 || duration > 15) throw new Error('H3 视频时长必须为 4-15 秒整数。');
  if (!['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].includes(ratio)) throw new Error('H3 视频比例无效。');
  const content = [{ type: 'text', text: prompt }];
  if (firstFrameImage) {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(firstFrameImage)) throw new Error('首帧必须是 JPG、PNG 或 WebP 图片。');
    content.push({ type: 'image_url', image_url: { url: firstFrameImage }, role: 'first_frame' });
    ratio = 'adaptive';
  }
  return { model: 'MiniMax-H3', content, resolution: '2K', duration, ratio };
}

export async function minimaxRequest(method, path, apiKey, region, body = undefined) {
  const baseUrl = BASE_URLS[region];
  if (!baseUrl) throw new Error('MiniMax 服务区域无效。');
  if (!apiKey || apiKey.length < 12) throw new Error('请先连接有效的 MiniMax API Key。');
  const response = await fetch(baseUrl + path, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`MiniMax HTTP ${response.status}：${result.base_resp?.status_msg || result.error?.message || '请求失败'}`);
  const base = result.base_resp || {};
  if (base.status_code != null && base.status_code !== 0) throw new Error(`MiniMax ${base.status_code}：${base.status_msg || '请求失败'}`);
  return result;
}

export function credentials(request) {
  return {
    apiKey: request.headers.get('X-Provider-Key') || '',
    region: request.headers.get('X-Provider-Region') || 'cn',
  };
}
