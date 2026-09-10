import { errorResponse, HttpError, json, readJson } from '../_lib/http.js';
import { assertPaidRuntime, ensureSession } from '../_lib/session.js';
import { requireUser } from '../_lib/auth.js';

const FEEDBACK_TTL = 30 * 24 * 60 * 60;
const REASONS = new Set(['satisfied', 'prompt_fit', 'quality', 'consistency', 'speed', 'other']);

export async function onRequestPost(context) {
  try {
    assertPaidRuntime(context.request, context.env);
    if (!context.env.JOBS) throw new HttpError('评价服务尚未就绪。', 503, 'service_not_ready');
    const session = await ensureSession(context.request, context.env);
    const { user } = await requireUser(context.request, context.env);
    const payload = await readJson(context.request, 4 * 1024);
    const provider = String(payload.provider || '').trim();
    const jobId = String(payload.job_id || '').trim();
    const rating = Number(payload.rating);
    const reason = String(payload.reason || '').trim();
    const comment = String(payload.comment || '').trim();
    if (!['runninghub', 'minimax', 'seedance'].includes(provider) || !jobId || jobId.length > 200) throw new HttpError('视频任务无效。', 400, 'invalid_job');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError('请选择1到5分。', 400, 'invalid_rating');
    if (!REASONS.has(reason)) throw new HttpError('请选择有效的问题类型。', 400, 'invalid_reason');
    if (comment.length > 300) throw new HttpError('补充说明不能超过300字。', 400, 'comment_too_long');
    const job = await context.env.JOBS.get(`job:${provider}:${jobId}`, 'json');
    if (!job || job.owner !== user.id) throw new HttpError('未找到该视频任务。', 404, 'job_not_found');
    if (job.status !== 'succeeded' || !job.video_url) throw new HttpError('视频生成完成后才能评价。', 409, 'job_not_finished');
    const feedback = {
      job_id:jobId,
      provider,
      workflow_preset:String(job.workflow_preset || 'custom'),
      rating,
      reason,
      comment,
      submitted_at:Math.floor(Date.now() / 1000),
    };
    await context.env.JOBS.put(`feedback:${user.id}:${provider}:${jobId}`, JSON.stringify(feedback), { expirationTtl: FEEDBACK_TTL });
    return json({ ok:true }, 201, session.cookie ? { 'Set-Cookie': session.cookie } : {});
  } catch (error) {
    return errorResponse(error);
  }
}
