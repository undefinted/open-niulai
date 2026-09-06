import { errorResponse, HttpError, json } from '../../_lib/http.js';
import { credentials, minimaxRequest } from '../../_lib/minimax.js';
import { normalizeOutputs, runningHubJson } from '../../_lib/runninghub.js';
import { assertPaidRuntime, ensureSession, publicJob } from '../../_lib/session.js';

const JOB_TTL = 7 * 24 * 60 * 60;

export async function onRequestGet(context) {
  try {
    assertPaidRuntime(context.request, context.env);
    const id = String(context.params.id || '').trim();
    if (!id || id.length > 200) throw new Error('视频任务 ID 无效。');
    const session = await ensureSession(context.request, context.env);
    const { apiKey, region } = credentials(context.request);
    let provider = new URL(context.request.url).searchParams.get('provider') || 'minimax';
    const stored = context.env.JOBS ? await context.env.JOBS.get(`job:${provider}:${id}`, 'json') : null;
    if (stored && stored.owner !== session.id) throw new HttpError('未找到该视频任务。', 404, 'job_not_found');
    if (stored) provider = stored.provider;
    let job;
    if (provider === 'runninghub') {
      const result = normalizeOutputs(await runningHubJson('/task/openapi/outputs', apiKey, { taskId: id }));
      job = { ...(stored || {}), id, provider, model: 'RunningHub Workflow', ...result, updated_at: Math.floor(Date.now() / 1000) };
    } else {
      const result = await minimaxRequest('GET', `/v2/query/video_generation/${encodeURIComponent(id)}`, apiKey, region);
      const task = result.task || {};
      const status = String(task.status || 'queued').toLowerCase();
      job = {
        ...(stored || {}), id, provider: 'minimax', model: 'MiniMax-H3', status,
        video_url: task.content?.url || null,
        error: ['failed', 'cancelled', 'expired'].includes(status) ? (task.fail_reason || 'MiniMax 任务未完成。') : null,
        updated_at: Math.floor(Date.now() / 1000),
      };
    }
    if (context.env.JOBS && stored) {
      await context.env.JOBS.put(`job:${provider}:${id}`, JSON.stringify(job), { expirationTtl: JOB_TTL });
      await context.env.JOBS.put(`request:${job.owner}:${job.idempotency_key}`, JSON.stringify(job), { expirationTtl: JOB_TTL });
    }
    return json({ job: publicJob(job) }, 200, session.cookie ? { 'Set-Cookie': session.cookie } : {});
  } catch (error) {
    return errorResponse(error);
  }
}
