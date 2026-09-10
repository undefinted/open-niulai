import { errorResponse, json, readJson } from '../../_lib/http.js';
import { buildPayload, credentials, minimaxRequest } from '../../_lib/minimax.js';
import { adaptDiscoveredNodeInfo, buildAiAppNodeInfo, buildNodeInfo, getAiApp, runningHubAiAppDemo, runningHubJson, runningHubV2Json } from '../../_lib/runninghub.js';
import { buildSeedancePayload, seedanceCredentials, seedanceRequest } from '../../_lib/seedance.js';
import { assertPaidRuntime, consumeRateLimit, ensureSession, publicJob, validateIdempotencyKey } from '../../_lib/session.js';
import { requireUser } from '../../_lib/auth.js';

const JOB_TTL = 7 * 24 * 60 * 60;

async function saveJob(env, job) {
  if (!env.JOBS) return;
  await Promise.all([
    env.JOBS.put(`job:${job.provider}:${job.id}`, JSON.stringify(job), { expirationTtl: JOB_TTL }),
    env.JOBS.put(`request:${job.owner}:${job.idempotency_key}`, JSON.stringify(job), { expirationTtl: JOB_TTL }),
  ]);
}

export async function onRequestPost(context) {
  try {
    assertPaidRuntime(context.request, context.env);
    const session = await ensureSession(context.request, context.env);
    const { user } = await requireUser(context.request, context.env);
    const idempotencyKey = validateIdempotencyKey(context.request);
    const responseHeaders = session.cookie ? { 'Set-Cookie': session.cookie } : {};
    if (context.env.JOBS) {
      const existing = await context.env.JOBS.get(`request:${user.id}:${idempotencyKey}`, 'json');
      if (existing) return json({ job: publicJob(existing), replayed: true }, 200, responseHeaders);
    }
    const payload = await readJson(context.request, 16 * 1024 * 1024);
    if (payload.confirm_paid !== true) throw new Error('提交付费任务前必须明确确认费用。');
    await consumeRateLimit(context.env, user.id);
    const { apiKey, region } = credentials(context.request);
    if (payload.provider === 'runninghub') {
      if (payload.generation_mode === 'ai_app') {
        const instance = getAiApp(context.env, payload.instance_id);
        if (instance.transport === 'standard_model') {
          const duration = Math.max(5, Math.min(15, Number(payload.duration || 10)));
          const referenceUrl = new URL(instance.reference_asset, context.request.url).toString();
          const data = await runningHubV2Json(instance.endpoint, apiKey, {
            prompt: `REFERENCE ROLE: use the attached image only as a rendering-style reference for crude geometry, damaged topology, flat lighting and blurry textures. Do not copy its character, identity, pose, props or room layout. Replace all semantic content with the requested subject and story. ${String(payload.prompt || '').trim()}`,
            imageUrls: [referenceUrl], resolution: '2K',
            duration: String(duration), ratio: 'adaptive', aigc_watermark: false,
          });
          if (!data?.taskId) throw new Error('RunningHub 标准模型未返回任务 ID，未自动重试以避免重复扣费。');
          const job = {
            id: String(data.taskId), provider: 'runninghub', model: instance.name,
            status: String(data.status || 'queued').toLowerCase(), generation_mode: 'standard_model', api_version: 'v2',
            instance_id: instance.id, input_mode: 'style_reference', created_at: Math.floor(Date.now() / 1000),
            owner: user.id, idempotency_key: idempotencyKey,
          };
          await saveJob(context.env, job);
          return json({ job: publicJob(job), replayed: false }, 202, responseHeaders);
        }
        let nodeInfoList;
        if (instance.transport === 'dynamic_ai_app') {
          if (instance.requires_image && !payload.uploaded_file_name) throw new Error('该候选实例要求首帧和尾帧，请先上传低模首帧。');
          const demo = await runningHubAiAppDemo(apiKey, instance.webapp_id);
          const adapted = adaptDiscoveredNodeInfo(demo, payload, payload.uploaded_file_name || null);
          if (instance.requires_image && adapted.imageFields < 2) throw new Error('未能识别该实例的首帧和尾帧输入项，已停止提交以避免误扣费。');
          nodeInfoList = adapted.nodeInfoList;
        } else {
          nodeInfoList = buildAiAppNodeInfo(instance, payload, payload.uploaded_file_name || null);
        }
        const data = instance.api_version === 'v2'
          ? await runningHubV2Json(`/openapi/v2/run/ai-app/${instance.webapp_id}`, apiKey, {
            nodeInfoList, instanceType: instance.instance_type, usePersonalQueue: false,
          })
          : await runningHubJson('/task/openapi/ai-app/run', apiKey, { webappId: instance.webapp_id, nodeInfoList });
        if (!data?.taskId) throw new Error('RunningHub AI 实例未返回任务 ID，未自动重试以避免重复扣费。');
        const job = {
          id: String(data.taskId), provider: 'runninghub', model: instance.name,
          status: String(data.status || data.taskStatus || 'queued').toLowerCase(), generation_mode: instance.transport === 'dynamic_ai_app' ? 'dynamic_ai_app' : 'ai_app',
          api_version: instance.api_version,
          instance_id: instance.id, input_mode: payload.uploaded_file_name ? 'first_frame' : 'text',
          created_at: Math.floor(Date.now() / 1000), owner: user.id, idempotency_key: idempotencyKey,
        };
        await saveJob(context.env, job);
        return json({ job: publicJob(job), replayed: false }, 202, responseHeaders);
      }
      const workflowId = String(payload.workflow_id || '').trim();
      if (!/^\d{6,30}$/.test(workflowId)) throw new Error('RunningHub 工作流 ID 无效。');
      const data = await runningHubJson('/task/openapi/create', apiKey, {
        workflowId,
        nodeInfoList: buildNodeInfo(payload, payload.uploaded_file_name || null),
        accessPassword: String(payload.access_password || '').trim() || undefined,
        addMetadata: true,
      });
      if (!data?.taskId) throw new Error('RunningHub 响应未返回任务 ID，未自动重试以避免重复扣费。');
      const job = {
        id: String(data.taskId), provider: 'runninghub', model: 'RunningHub 自定义工作流', generation_mode: 'workflow',
        status: String(data.taskStatus || 'queued').toLowerCase(), workflow_id: workflowId,
        workflow_preset: String(payload.workflow_preset || 'custom'),
        input_mode: payload.uploaded_file_name ? 'first_frame' : 'text', created_at: Math.floor(Date.now() / 1000),
        owner: user.id, idempotency_key: idempotencyKey,
      };
      await saveJob(context.env, job);
      return json({ job: publicJob(job), replayed: false }, 202, responseHeaders);
    }
    if (payload.provider === 'seedance') {
      const {apiKey:seedanceKey, model} = seedanceCredentials(context.request);
      const duration = Number(payload.duration) <= 5 ? 5 : 10;
      const requestBody = buildSeedancePayload(payload.prompt, model, duration, String(payload.ratio || '16:9'), payload.style_reference_image || null);
      const result = await seedanceRequest('POST', '/contents/generations/tasks', seedanceKey, requestBody);
      if (!result.id) throw new Error('火山方舟响应未返回任务 ID，未自动重试以避免重复扣费。');
      const job = {
        id:String(result.id), provider:'seedance', model, status:String(result.status || 'queued').toLowerCase(), duration,
        ratio:String(payload.ratio || '16:9'), input_mode:payload.style_reference_image ? 'style_reference' : 'text', created_at:Math.floor(Date.now() / 1000),
        owner:user.id, idempotency_key:idempotencyKey,
      };
      await saveJob(context.env, job);
      return json({job:publicJob(job), replayed:false}, 202, responseHeaders);
    }
    if (payload.provider !== 'minimax') return json({ error: '当前站内真实生成支持 RunningHub、MiniMax H3 官方 API 和 Seedance 火山方舟 API。' }, 501);
    const duration = Math.max(4, Math.min(15, Number(payload.duration || 10)));
    if (payload.style_reference_image) throw new Error('MiniMax 官方视频接口会把图片当作首帧，不能用于本项目的整片风格参考。请移除参考图后使用纯文生视频。');
    const requestBody = buildPayload(payload.prompt, duration, String(payload.ratio || '16:9'), null);
    const result = await minimaxRequest('POST', '/v2/video_generation', apiKey, region, requestBody);
    if (!result.task_id) throw new Error('MiniMax 响应未返回任务 ID，未自动重试以避免重复扣费。');
    const job = {
      id: String(result.task_id), provider: 'minimax', model: 'MiniMax-H3', status: 'queued', duration,
      ratio: requestBody.ratio, input_mode: 'text', created_at: Math.floor(Date.now() / 1000),
      owner: user.id, idempotency_key: idempotencyKey,
    };
    await saveJob(context.env, job);
    return json({ job: publicJob(job), replayed: false }, 202, responseHeaders);
  } catch (error) {
    return errorResponse(error);
  }
}
