import { errorResponse, json } from '../../_lib/http.js';
import { credentials, minimaxRequest } from '../../_lib/minimax.js';

export async function onRequestGet(context) {
  try {
    const id = String(context.params.id || '').trim();
    if (!id || id.length > 200) throw new Error('视频任务 ID 无效。');
    const { apiKey, region } = credentials(context.request);
    const result = await minimaxRequest('GET', `/v2/query/video_generation/${encodeURIComponent(id)}`, apiKey, region);
    const task = result.task || {};
    const status = String(task.status || 'queued').toLowerCase();
    return json({ job: {
      id, provider: 'minimax', model: 'MiniMax-H3', status,
      video_url: task.content?.url || null,
      error: ['failed', 'cancelled', 'expired'].includes(status) ? (task.fail_reason || 'MiniMax 任务未完成。') : null,
    } });
  } catch (error) {
    return errorResponse(error);
  }
}
