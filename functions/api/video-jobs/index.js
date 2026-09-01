import { errorResponse, json, readJson } from '../../_lib/http.js';
import { buildPayload, credentials, minimaxRequest } from '../../_lib/minimax.js';

export async function onRequestPost(context) {
  try {
    const payload = await readJson(context.request, 16 * 1024 * 1024);
    if (payload.confirm_paid !== true) throw new Error('提交付费任务前必须明确确认费用。');
    if (payload.provider !== 'minimax') return json({ error: '当前站内真实生成支持 MiniMax H3。' }, 501);
    const { apiKey, region } = credentials(context.request);
    const duration = Math.max(4, Math.min(15, Number(payload.duration || 10)));
    const requestBody = buildPayload(payload.prompt, duration, String(payload.ratio || '16:9'), payload.first_frame_image || null);
    const result = await minimaxRequest('POST', '/v2/video_generation', apiKey, region, requestBody);
    if (!result.task_id) throw new Error('MiniMax 响应未返回任务 ID，未自动重试以避免重复扣费。');
    return json({ job: {
      id: String(result.task_id), provider: 'minimax', model: 'MiniMax-H3', status: 'queued', duration,
      ratio: requestBody.ratio, input_mode: payload.first_frame_image ? 'first_frame' : 'text', created_at: Math.floor(Date.now() / 1000),
    } }, 202);
  } catch (error) {
    return errorResponse(error);
  }
}
