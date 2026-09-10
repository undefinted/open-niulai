import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createPack } from '../functions/_lib/pack.js';
import { generateScriptCandidates } from '../functions/_lib/script-providers.js';
import { evaluatePack } from '../functions/_lib/quality.js';
import { buildPayload } from '../functions/_lib/minimax.js';
import { aiAppCatalog, buildAiAppNodeInfo, buildNodeInfo, normalizeOutputs, publicAiApp } from '../functions/_lib/runninghub.js';
import { assertPaidRuntime, consumeRateLimit, ensureSession, getSession, validateIdempotencyKey } from '../functions/_lib/session.js';
import { onRequestPost as createVideoJob } from '../functions/api/video-jobs/index.js';
import { onRequestPost as submitFeedback } from '../functions/api/feedback.js';

test('Pages pack builder preserves the web contract', () => {
  const pack = createPack({ subject: '猫', prompt: '一只加班的猫试图逃离办公室', duration: 10, template: 'ad_hook' });
  assert.equal(pack.title, '《猫来》');
  assert.equal(pack.schema_version, '0.2.0');
  assert.equal(pack.constraint_report.duration_seconds, 10);
  assert.equal(pack.script.length, 3);
  assert.match(pack.video_shots[0].motion_prompt, /10-second/);
  assert.match(pack.video_shots[0].motion_prompt, /STYLE LOCK/);
  assert.match(pack.video_shots[0].motion_prompt, /not a real cat/);
  assert.match(pack.video_shots[0].motion_prompt, /clean topology/);
});

test('Pages pack builder rejects an empty prompt', () => {
  assert.throws(() => createPack({ subject: '猫', prompt: '' }), /一句话创意/);
});

test('selected AI script is compiled into the production pack', () => {
  const pack = createPack({
    subject:'猫', prompt:'一只猫要准时下班', duration:15, script_provider:'qwen', style_strength:'extreme',
    script_draft:{ title:'《考勤猫》', premise:'猫与打卡机谈判', hook:'打卡机先开口', mission:'在六点前完成打卡', obstacle:'打卡机每次都后退一步', repeated_line:'我已经下班了', reveal:'办公室其实在猫的纸箱里', shots:[
      {action:'猫站在打卡机前举起爪子。', subtitle:'我已经下班了'},
      {action:'打卡机后退，猫僵硬地向前滑一步。', subtitle:'我已经下班了'},
      {action:'镜头定格，纸箱外出现更大的猫。', subtitle:'我已经下班了'},
    ]},
  });
  assert.equal(pack.title, '《考勤猫》');
  assert.equal(pack.story_design.mission, '在六点前完成打卡');
  assert.equal(pack.story_design.style_strength, 'extreme');
  assert.match(pack.video_shots[0].motion_prompt, /打卡机后退/);
  assert.match(pack.video_shots[0].motion_prompt, /stepped low frame rate/);
});

test('Qwen script provider returns three validated and distinct candidates', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = {url:String(url), ...JSON.parse(options.body)};
    const candidate = index => ({title:`《方案${index}》`, premise:`故事${index}`, hook:`开场${index}`, mission:`任务${index}`, obstacle:`阻碍${index}`, repeated_line:`台词${index}`, reveal:`揭示${index}`, shots:[
      {action:`动作${index}-1`, subtitle:`台词${index}`}, {action:`动作${index}-2`, subtitle:`台词${index}`}, {action:`动作${index}-3`, subtitle:`台词${index}`},
    ]});
    return Response.json({choices:[{message:{content:JSON.stringify({candidates:[candidate(1),candidate(2),candidate(3)]})}}]});
  };
  try {
    const result = await generateScriptCandidates({provider:'qwen', prompt:'一只加班的猫', duration:15}, {}, 'test-api-key-12345');
    assert.equal(result.candidates.length, 3);
    assert.equal(result.candidates[2].shots[2].beat, 'reveal');
    assert.equal(request.model, 'qwen-plus');
    assert.match(request.url, /dashscope/);
  } finally { globalThis.fetch = originalFetch; }
});

test('quality gate records traceable evidence for a valid production pack', () => {
  const pack = createPack({ subject: '猫', prompt: '一只加班的猫试图逃离办公室', required_line: '今天必须下班', duration: 10 });
  const report = evaluatePack(pack);
  assert.equal(report.status, 'passed');
  assert.equal(report.score, 100);
  assert.equal(report.summary.passed, 10);
  assert.equal(report.metrics.constraint_coverage_percent, 100);
  assert.match(report.score_note, /不代表成片审美质量/);
});

test('quality gate blocks a broken or incomplete storyboard timeline', () => {
  const pack = createPack({ subject: '猫', prompt: '一只加班的猫试图逃离办公室', duration: 10 });
  pack.script[1].time = '5-8s';
  const report = evaluatePack(pack);
  assert.equal(report.status, 'blocked');
  assert.equal(report.checks.find(item => item.id === 'timeline_integrity').status, 'fail');
  assert.match(report.checks.find(item => item.id === 'timeline_integrity').remediation, /连续覆盖/);
});

test('quality gate blocks drift from the user required line', () => {
  const pack = createPack({ subject: '猫', prompt: '一只加班的猫试图逃离办公室', required_line: '今天必须下班', duration: 10 });
  pack.script.forEach(item => { item.subtitle = '另一句台词'; });
  const report = evaluatePack(pack);
  assert.equal(report.status, 'blocked');
  assert.equal(report.checks.find(item => item.id === 'required_line').status, 'fail');
});

test('MiniMax payload switches to adaptive for a first frame', () => {
  const payload = buildPayload('An awkward cat walks.', 5, '16:9', 'data:image/png;base64,AAAA');
  assert.equal(payload.model, 'MiniMax-H3');
  assert.equal(payload.ratio, 'adaptive');
  assert.equal(payload.content[1].role, 'first_frame');
});

test('MiniMax payload rejects invalid duration', () => {
  assert.throws(() => buildPayload('A cat.', 20), /4-15/);
});

test('RunningHub maps prompt and uploaded first frame to workflow nodes', () => {
  assert.deepEqual(buildNodeInfo({
    prompt: 'An awkward cat walks.', prompt_node_id: '6', prompt_field: 'text',
    image_node_id: '12', image_field: 'image',
  }, 'api/input/cat.png'), [
    { nodeId: '6', fieldName: 'text', fieldValue: 'An awkward cat walks.' },
    { nodeId: '12', fieldName: 'image', fieldValue: 'api/input/cat.png' },
  ]);
});

test('RunningHub output normalization prefers video results', () => {
  const result = normalizeOutputs([
    { fileUrl: 'https://example.com/frame.png', fileType: 'png', nodeId: '8' },
    { fileUrl: 'https://example.com/result.mp4', fileType: 'mp4', nodeId: '9' },
  ]);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.video_url, 'https://example.com/result.mp4');
});

test('RunningHub rejects a completed workflow without a video output', () => {
  const result = normalizeOutputs([{ fileUrl: 'https://example.com/frame.png', fileType: 'png' }]);
  assert.equal(result.status, 'failed');
  assert.equal(result.video_url, null);
  assert.match(result.error, /没有返回/);
});

test('RunningHub output normalization rejects non-HTTPS result links', () => {
  const result = normalizeOutputs([{ fileUrl: 'javascript:alert(1)', fileType: 'mp4' }]);
  assert.equal(result.status, 'running');
  assert.equal(result.video_url, null);
});

test('RunningHub V2 result normalization returns the generated video and usage', () => {
  const result = normalizeOutputs({
    status:'SUCCESS', usage:{consumeCoins:'10'},
    results:[{url:'https://example.com/result.mp4', nodeId:'4', outputType:'mp4'}],
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.video_url, 'https://example.com/result.mp4');
  assert.equal(result.usage.consumeCoins, '10');
});

test('RunningHub V2 result normalization exposes the provider failure reason', () => {
  const result = normalizeOutputs({
    status:'FAILED', results:[], failedReason:{exception_message:'上游模型服务暂时不可用'},
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.error, '上游模型服务暂时不可用');
});

test('RunningHub V2 query errors do not remain stuck in the running state', () => {
  const result = normalizeOutputs({errorCode:'TASK_NOT_FOUND', errorMessage:'任务不存在'});
  assert.equal(result.status, 'failed');
  assert.equal(result.error, '任务不存在');
});

test('Creator UI defaults to RunningHub AI instances and keeps workflows advanced', () => {
  const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  assert.match(source, /MiniMax H3 成片实例/);
  assert.match(source, /Seedance 成片实例/);
  assert.match(source, /确认或修改最终视频脚本/);
  assert.match(source, /generation_mode:customMode \? 'workflow' : 'ai_app'/);
  assert.match(source, /高级：使用自定义工作流/);
  assert.doesNotMatch(source, /id="video-provider"/);
  assert.doesNotMatch(source, /data-submit-video/);
  assert.match(source, /class="history-error"/);
  assert.match(source, /重新查询状态/);
});

test('RunningHub AI app catalog hides WebApp and node mappings from browsers', () => {
  const env = { RUNNINGHUB_AI_APPS: JSON.stringify([{
    id:'minimax-h3', name:'H3 instance', webappId:'123456789', promptNodeId:'6', promptField:'text',
    imageNodeId:'12', imageField:'image', supportsImage:true,
  }]) };
  const instance = aiAppCatalog(env).find(item => item.id === 'minimax-h3');
  assert.equal(instance.configured, true);
  assert.deepEqual(buildAiAppNodeInfo(instance, { prompt:'A cat walks.', duration:10, ratio:'16:9' }, 'api/cat.png'), [
    { nodeId:'6', fieldName:'text', fieldValue:'A cat walks.' },
    { nodeId:'12', fieldName:'image', fieldValue:'api/cat.png' },
  ]);
  const publicInstance = publicAiApp(instance);
  assert.equal(publicInstance.webapp_id, undefined);
  assert.equal(publicInstance.prompt_node_id, undefined);
  assert.equal(publicInstance.configured, true);
});

test('signed anonymous sessions survive valid cookies and reject tampering', async () => {
  const env = { SESSION_SECRET: 'a-test-secret-that-is-long-enough' };
  const created = await ensureSession(new Request('https://example.com/api/session'), env);
  assert.equal(created.durable, true);
  assert.match(created.cookie, /HttpOnly; SameSite=Lax/);
  const cookie = created.cookie.split(';')[0];
  const restored = await getSession(new Request('https://example.com/api/session', { headers: { Cookie: cookie } }), env);
  assert.equal(restored.id, created.id);
  const tampered = await getSession(new Request('https://example.com/api/session', { headers: { Cookie: `${cookie}x` } }), env);
  assert.equal(tampered, null);
});

test('paid requests require a stable idempotency key', () => {
  assert.equal(validateIdempotencyKey(new Request('https://example.com', { headers: { 'Idempotency-Key': 'task_12345678' } })), 'task_12345678');
  assert.throws(() => validateIdempotencyKey(new Request('https://example.com')), /防重复/);
});

test('rate limiter rejects paid jobs after the configured hourly allowance', async () => {
  const data = new Map();
  const env = {
    PAID_JOB_LIMIT_PER_HOUR: '2',
    RATE_LIMITS: {
      get: async key => data.get(key),
      put: async (key, value) => data.set(key, value),
    },
  };
  await consumeRateLimit(env, 'session', 0);
  await consumeRateLimit(env, 'session', 0);
  await assert.rejects(() => consumeRateLimit(env, 'session', 0), error => error.status === 429 && error.code === 'rate_limited');
});

test('public paid endpoints fail closed without production bindings', () => {
  assert.throws(() => assertPaidRuntime(new Request('https://example.com/api/video-jobs'), {}), error => error.status === 503 && error.code === 'service_not_ready');
  assert.doesNotThrow(() => assertPaidRuntime(new Request('http://127.0.0.1/api/video-jobs'), {}));
});

test('public UI includes recovery history and legal disclosures', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  assert.match(html, /最近生成任务/);
  assert.match(html, /privacy\.html/);
  assert.match(html, /terms\.html/);
  assert.match(html, /AI 智能生成 3 版/);
  assert.match(html, /name="script_provider" value="qwen"/);
  assert.match(html, /name="script_provider" value="deepseek"/);
  assert.match(source, /Idempotency-Key/);
  assert.match(source, /open-niulai:video-jobs/);
  assert.match(source, /open-niulai:creator-draft/);
  assert.match(source, /generation-readiness/);
  assert.match(source, /data-use-style-reference/);
  assert.match(source, /内置原创低模参考图/);
  assert.match(source, /feedback-form/);
  assert.match(source, /AI 输出质量门禁/);
  assert.match(source, /质量门禁未通过/);
});

test('feedback is accepted only for a completed job owned by the signed session', async () => {
  const values = new Map();
  const kv = {
    get: async (key, type) => {
      const value = values.get(key);
      return type === 'json' && value ? JSON.parse(value) : value;
    },
    put: async (key, value) => values.set(key, value),
  };
  const env = { SESSION_SECRET: 'a-test-secret-that-is-long-enough', JOBS: kv, RATE_LIMITS: kv };
  const sessionResponse = await ensureSession(new Request('http://127.0.0.1/api/session'), env);
  await kv.put('job:runninghub:job-1', JSON.stringify({
    id:'job-1', provider:'runninghub', owner:sessionResponse.id, status:'succeeded', video_url:'https://example.com/result.mp4', workflow_preset:'seedance',
  }));
  const response = await submitFeedback({
    request:new Request('http://127.0.0.1/api/feedback', {
      method:'POST',
      headers:{'Content-Type':'application/json', Cookie:sessionResponse.cookie.split(';')[0]},
      body:JSON.stringify({job_id:'job-1', provider:'runninghub', rating:4, reason:'quality', comment:'动作略显僵硬'}),
    }),
    env,
  });
  assert.equal(response.status, 201);
  const stored = [...values.entries()].find(([key]) => key.startsWith(`feedback:${sessionResponse.id}:`));
  assert.ok(stored);
  assert.doesNotMatch(stored[1], /API Key|test-secret/);
});

test('a repeated paid request replays the stored RunningHub job without a second provider call', async () => {
  const values = new Map();
  const kv = {
    get: async (key, type) => {
      const value = values.get(key);
      return type === 'json' && value ? JSON.parse(value) : value;
    },
    put: async (key, value) => values.set(key, value),
  };
  const env = { SESSION_SECRET: 'a-test-secret-that-is-long-enough', JOBS: kv, RATE_LIMITS: kv };
  const body = JSON.stringify({
    provider: 'runninghub', confirm_paid: true, workflow_id: '123456789', workflow_preset: 'minimax-h3',
    prompt: 'An awkward cat walks.', prompt_node_id: '6', prompt_field: 'text',
  });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ code: 0, data: { taskId: 'rh-task-1', taskStatus: 'queued' } });
  };
  try {
    const first = await createVideoJob({ request: new Request('http://127.0.0.1/api/video-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Provider-Key': 'runninghub-test-key', 'Idempotency-Key': 'request_12345678' }, body }), env });
    const cookie = first.headers.get('set-cookie').split(';')[0];
    const second = await createVideoJob({ request: new Request('http://127.0.0.1/api/video-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Provider-Key': 'runninghub-test-key', 'Idempotency-Key': 'request_12345678', Cookie: cookie }, body }), env });
    assert.equal(first.status, 202);
    assert.equal(second.status, 200);
    assert.equal((await second.json()).replayed, true);
    assert.equal(calls, 1);
    assert.doesNotMatch([...values.values()].join(''), /runninghub-test-key/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('RunningHub AI instance submits its hidden WebApp mapping', async () => {
  const values = new Map();
  const kv = {
    get: async (key, type) => {
      const value = values.get(key);
      return type === 'json' && value ? JSON.parse(value) : value;
    },
    put: async (key, value) => values.set(key, value),
  };
  const env = {
    SESSION_SECRET:'a-test-secret-that-is-long-enough', JOBS:kv, RATE_LIMITS:kv,
    RUNNINGHUB_AI_APPS:JSON.stringify([{
      id:'minimax-h3', name:'MiniMax H3 成片实例', webappId:'123456789', promptNodeId:'6', promptField:'text',
    }]),
  };
  const originalFetch = globalThis.fetch;
  let providerRequest;
  globalThis.fetch = async (url, options) => {
    providerRequest = { url:String(url), body:JSON.parse(options.body) };
    return Response.json({ code:0, data:{ taskId:'ai-app-task-1', taskStatus:'queued' } });
  };
  try {
    const response = await createVideoJob({
      request:new Request('http://127.0.0.1/api/video-jobs', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'X-Provider-Key':'runninghub-test-key', 'Idempotency-Key':'aiapp_12345678' },
        body:JSON.stringify({ provider:'runninghub', generation_mode:'ai_app', instance_id:'minimax-h3', confirm_paid:true, prompt:'A cat walks.' }),
      }),
      env,
    });
    const result = await response.json();
    assert.equal(response.status, 202);
    assert.equal(result.job.generation_mode, 'ai_app');
    assert.equal(result.job.instance_id, 'minimax-h3');
    assert.match(providerRequest.url, /\/task\/openapi\/ai-app\/run$/);
    assert.equal(providerRequest.body.webappId, '123456789');
    assert.deepEqual(providerRequest.body.nodeInfoList, [{ nodeId:'6', fieldName:'text', fieldValue:'A cat walks.' }]);
    assert.doesNotMatch(JSON.stringify(result), /123456789/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('RunningHub V2 AI instance uses the instance path and direct response contract', async () => {
  const values = new Map();
  const kv = {
    get: async (key, type) => {
      const value = values.get(key);
      return type === 'json' && value ? JSON.parse(value) : value;
    },
    put: async (key, value) => values.set(key, value),
  };
  const env = {
    SESSION_SECRET:'a-test-secret-that-is-long-enough', JOBS:kv, RATE_LIMITS:kv,
    RUNNINGHUB_AI_APPS:JSON.stringify([{
      id:'seedance', name:'Seedance 2.5 文生视频', apiVersion:'v2', webappId:'2085880920086765569',
      instanceType:'plus',
      promptNodeId:'1', promptField:'prompt', durationNodeId:'1', durationField:'duration',
      ratioNodeId:'1', ratioField:'ratio', fixedFields:[
        {nodeId:'1', fieldName:'resolution', fieldValue:'720p'},
        {nodeId:'1', fieldName:'outputFormat', fieldValue:'mp4'},
      ],
    }]),
  };
  const originalFetch = globalThis.fetch;
  let providerRequest;
  globalThis.fetch = async (url, options) => {
    providerRequest = {url:String(url), body:JSON.parse(options.body)};
    return Response.json({taskId:'v2-task-1', status:'RUNNING', results:null});
  };
  try {
    const response = await createVideoJob({
      request:new Request('http://127.0.0.1/api/video-jobs', {
        method:'POST',
        headers:{'Content-Type':'application/json', 'X-Provider-Key':'runninghub-test-key', 'Idempotency-Key':'v2app_12345678'},
        body:JSON.stringify({provider:'runninghub', generation_mode:'ai_app', instance_id:'seedance', confirm_paid:true, prompt:'A cat walks.', duration:15, ratio:'16:9'}),
      }), env,
    });
    const result = await response.json();
    assert.equal(response.status, 202);
    assert.equal(result.job.api_version, 'v2');
    assert.match(providerRequest.url, /runninghub\.cn\/openapi\/v2\/run\/ai-app\/2085880920086765569$/);
    assert.equal(providerRequest.body.instanceType, 'plus');
    assert.deepEqual(providerRequest.body.nodeInfoList, [
      {nodeId:'1', fieldName:'prompt', fieldValue:'A cat walks.'},
      {nodeId:'1', fieldName:'duration', fieldValue:'15'},
      {nodeId:'1', fieldName:'ratio', fieldValue:'16:9'},
      {nodeId:'1', fieldName:'resolution', fieldValue:'720p'},
      {nodeId:'1', fieldName:'outputFormat', fieldValue:'mp4'},
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
