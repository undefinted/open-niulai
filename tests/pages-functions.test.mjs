import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createPack } from '../functions/_lib/pack.js';
import { generateScriptCandidates } from '../functions/_lib/script-providers.js';
import { evaluatePack } from '../functions/_lib/quality.js';
import { buildPayload } from '../functions/_lib/minimax.js';
import { buildSeedancePayload, verifySeedanceConnection } from '../functions/_lib/seedance.js';
import { aiAppCatalog, buildAiAppNodeInfo, buildNodeInfo, normalizeOutputs, publicAiApp } from '../functions/_lib/runninghub.js';
import { assertPaidRuntime, consumeRateLimit, ensureSession, getSession, validateIdempotencyKey } from '../functions/_lib/session.js';
import { authenticatedUser, loginUser, registerUser } from '../functions/_lib/auth.js';
import { onRequestPost as createVideoJob } from '../functions/api/video-jobs/index.js';
import { onRequestPost as submitFeedback } from '../functions/api/feedback.js';

async function signInTestUser(env, url = 'http://127.0.0.1/api/session') {
  const session = await ensureSession(new Request(url), env);
  const userId = crypto.randomUUID();
  await env.USERS.put(`session:${session.id}`, userId);
  await env.USERS.put(`user:${userId}`, JSON.stringify({id:userId, email:'test@example.com', created_at:0}));
  return { userId, cookie:session.cookie.split(';')[0] };
}

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

test('Seedance payload includes model controls and an optional first frame', () => {
  const payload = buildSeedancePayload('Broken low-poly cat walks.', 'seedance-test-model', 10, '16:9', 'data:image/png;base64,AAAA');
  assert.equal(payload.model, 'seedance-test-model');
  assert.match(payload.content[0].text, /--ratio 16:9 --duration 10 --resolution 720p/);
  assert.equal(payload.content[1].role, 'first_frame');
});

test('Seedance connection verification checks the key and selected model without creating a task', async () => {
  const originalFetch = globalThis.fetch;
  let providerRequest;
  globalThis.fetch = async (url, options) => {
    providerRequest = {url:String(url), authorization:options.headers.Authorization};
    return Response.json({data:[{id:'doubao-seedance-1-5-pro-251215'}]});
  };
  try {
    const result = await verifySeedanceConnection(new Request('https://example.com', {headers:{
      'X-Provider-Key':'ark-test-key-12345', 'X-Provider-Model':'doubao-seedance-1-5-pro-251215',
    }}));
    assert.equal(result.authenticated, true);
    assert.equal(result.model_available, true);
    assert.match(providerRequest.url, /\/api\/v3\/models$/);
    assert.equal(providerRequest.authorization, 'Bearer ark-test-key-12345');
  } finally { globalThis.fetch = originalFetch; }
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
  assert.match(source, /确认或修改最终视频提示词/);
  assert.match(source, /generation_mode:customMode \? 'workflow' : 'ai_app'/);
  assert.match(source, /高级：使用自定义工作流/);
  assert.doesNotMatch(source, /id="video-provider"/);
  assert.doesNotMatch(source, /data-submit-video/);
  assert.match(source, /class="history-error"/);
  assert.match(source, /重新查询状态/);
});

test('RunningHub AI app catalog hides WebApp and node mappings from browsers', () => {
  const env = { RUNNINGHUB_AI_APPS: JSON.stringify([{
    id:'minimax-h3', name:'H3 instance', webappId:'123456789', promptNodeId:'6', promptField:'text', verified:true,
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

test('registered accounts store only a salted password hash and can log in', async () => {
  const values = new Map();
  const users = {
    get:async (key, type) => {
      const value = values.get(key);
      return type === 'json' && value ? JSON.parse(value) : value;
    },
    put:async (key, value) => values.set(key, value),
    delete:async key => values.delete(key),
  };
  const env = {SESSION_SECRET:'a-test-secret-that-is-long-enough', USERS:users};
  const registered = await registerUser(new Request('https://example.com/api/auth/register'), env, {email:'USER@example.com', password:'correct-horse'});
  assert.equal(registered.user.email, 'user@example.com');
  assert.doesNotMatch([...values.values()].join(''), /correct-horse/);
  const cookie = registered.session.cookie.split(';')[0];
  assert.equal((await authenticatedUser(new Request('https://example.com/api/session', {headers:{Cookie:cookie}}), env)).user.id, registered.user.id);
  const loggedIn = await loginUser(new Request('https://example.com/api/auth/login'), env, {email:'user@example.com', password:'correct-horse'});
  assert.equal(loggedIn.user.id, registered.user.id);
  await assert.rejects(() => loginUser(new Request('https://example.com/api/auth/login'), env, {email:'user@example.com', password:'wrong-pass'}), error => error.status === 401);
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
  assert.match(html, /id="account-dialog"/);
  assert.match(source, /MiniMax H3 · 官方 API/);
  assert.match(source, /Seedance · 火山方舟官方 API/);
  assert.match(source, /doubao-seedance-1-5-pro-251215/);
  assert.doesNotMatch(source, /doubao-seedance-1-0-lite-t2v-250428/);
  assert.match(html, /data-subject="猫" data-template="ad_hook" data-tone="workplace"/);
  assert.match(html, /data-line="最后改一次" data-duration="10"/);
  assert.match(source, /Idempotency-Key/);
  assert.match(source, /open-niulai:\$\{accountScope\(\)\}:video-jobs/);
  assert.match(source, /open-niulai:\$\{accountScope\(\)\}:creator-draft/);
  assert.match(source, /generation-readiness/);
  assert.match(source, /data-use-style-reference/);
  assert.match(source, /作为实际首帧使用，会继承人物与构图/);
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
  const env = { SESSION_SECRET: 'a-test-secret-that-is-long-enough', JOBS: kv, RATE_LIMITS: kv, USERS:kv };
  const auth = await signInTestUser(env);
  await kv.put('job:runninghub:job-1', JSON.stringify({
    id:'job-1', provider:'runninghub', owner:auth.userId, status:'succeeded', video_url:'https://example.com/result.mp4', workflow_preset:'seedance',
  }));
  const response = await submitFeedback({
    request:new Request('http://127.0.0.1/api/feedback', {
      method:'POST',
      headers:{'Content-Type':'application/json', Cookie:auth.cookie},
      body:JSON.stringify({job_id:'job-1', provider:'runninghub', rating:4, reason:'quality', comment:'动作略显僵硬'}),
    }),
    env,
  });
  assert.equal(response.status, 201);
  const stored = [...values.entries()].find(([key]) => key.startsWith(`feedback:${auth.userId}:`));
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
  const env = { SESSION_SECRET: 'a-test-secret-that-is-long-enough', JOBS: kv, RATE_LIMITS: kv, USERS:kv };
  const auth = await signInTestUser(env);
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
    const first = await createVideoJob({ request: new Request('http://127.0.0.1/api/video-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Provider-Key': 'runninghub-test-key', 'Idempotency-Key': 'request_12345678', Cookie:auth.cookie }, body }), env });
    const second = await createVideoJob({ request: new Request('http://127.0.0.1/api/video-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Provider-Key': 'runninghub-test-key', 'Idempotency-Key': 'request_12345678', Cookie:auth.cookie }, body }), env });
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
    SESSION_SECRET:'a-test-secret-that-is-long-enough', JOBS:kv, RATE_LIMITS:kv, USERS:kv,
    RUNNINGHUB_AI_APPS:JSON.stringify([{
      id:'minimax-h3', name:'MiniMax H3 成片实例', webappId:'123456789', promptNodeId:'6', promptField:'text', verified:true,
    }]),
  };
  const auth = await signInTestUser(env);
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
        headers:{ 'Content-Type':'application/json', 'X-Provider-Key':'runninghub-test-key', 'Idempotency-Key':'aiapp_12345678', Cookie:auth.cookie },
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

test('RunningHub H3 style mode submits the built-in reference through the standard API', async () => {
  const values = new Map();
  const kv = {
    get: async (key, type) => {
      const value = values.get(key);
      return type === 'json' && value ? JSON.parse(value) : value;
    },
    put: async (key, value) => values.set(key, value),
  };
  const env = {
    SESSION_SECRET:'a-test-secret-that-is-long-enough', JOBS:kv, RATE_LIMITS:kv, USERS:kv,
    RUNNINGHUB_AI_APPS:JSON.stringify([{
      id:'minimax-h3-style', enabled:true, transport:'standard_model',
      endpoint:'/openapi/v2/minimax/hailuo-h3/multimodal-to-video',
      referenceAsset:'/style/original-lowpoly-office-reference-v1.png',
    }]),
  };
  const auth = await signInTestUser(env, 'https://myyuanlai.xyz/api/session');
  const originalFetch = globalThis.fetch;
  let providerRequest;
  globalThis.fetch = async (url, options) => {
    providerRequest = {url:String(url), body:JSON.parse(options.body)};
    return Response.json({taskId:'h3-style-task-1', status:'RUNNING', results:null});
  };
  try {
    const response = await createVideoJob({
      request:new Request('https://myyuanlai.xyz/api/video-jobs', {
        method:'POST',
        headers:{'Content-Type':'application/json', 'X-Provider-Key':'runninghub-test-key', 'Idempotency-Key':'h3style_12345678', Cookie:auth.cookie},
        body:JSON.stringify({provider:'runninghub', generation_mode:'ai_app', instance_id:'minimax-h3-style', confirm_paid:true, prompt:'STYLE LOCK: broken CGI cat.', duration:10}),
      }), env,
    });
    const result = await response.json();
    assert.equal(response.status, 202);
    assert.equal(result.job.generation_mode, 'standard_model');
    assert.equal(result.job.input_mode, 'style_reference');
    assert.match(providerRequest.url, /runninghub\.cn\/openapi\/v2\/minimax\/hailuo-h3\/multimodal-to-video$/);
    assert.deepEqual(providerRequest.body.imageUrls, ['https://myyuanlai.xyz/style/original-lowpoly-office-reference-v1.png']);
    assert.equal(providerRequest.body.duration, '10');
    assert.equal(providerRequest.body.ratio, 'adaptive');
    assert.match(providerRequest.body.prompt, /use the attached image only as a rendering-style reference/);
    assert.match(providerRequest.body.prompt, /Do not copy its character/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('official MiniMax H3 submits directly without RunningHub', async () => {
  const values = new Map();
  const kv = {
    get:async (key, type) => type === 'json' && values.get(key) ? JSON.parse(values.get(key)) : values.get(key),
    put:async (key, value) => values.set(key, value),
  };
  const env = {SESSION_SECRET:'a-test-secret-that-is-long-enough', JOBS:kv, RATE_LIMITS:kv, USERS:kv};
  const auth = await signInTestUser(env);
  const originalFetch = globalThis.fetch;
  let providerRequest;
  globalThis.fetch = async (url, options) => {
    providerRequest = {url:String(url), body:JSON.parse(options.body)};
    return Response.json({task_id:'minimax-task-1', base_resp:{status_code:0, status_msg:'success'}});
  };
  try {
    const response = await createVideoJob({
      request:new Request('http://127.0.0.1/api/video-jobs', {
        method:'POST',
        headers:{'Content-Type':'application/json', 'X-Provider-Key':'minimax-test-key', 'X-Provider-Region':'global', 'Idempotency-Key':'minimax_12345678', Cookie:auth.cookie},
        body:JSON.stringify({provider:'minimax', confirm_paid:true, prompt:'STYLE LOCK: broken CGI cat.', duration:10, ratio:'16:9'}),
      }), env,
    });
    const result = await response.json();
    assert.equal(response.status, 202);
    assert.equal(result.job.provider, 'minimax');
    assert.match(providerRequest.url, /api\.minimax\.io\/v2\/video_generation$/);
    assert.equal(providerRequest.body.model, 'MiniMax-H3');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('official Seedance submits directly to Volcano Ark with the selected model', async () => {
  const values = new Map();
  const kv = {
    get:async (key, type) => type === 'json' && values.get(key) ? JSON.parse(values.get(key)) : values.get(key),
    put:async (key, value) => values.set(key, value),
  };
  const env = {SESSION_SECRET:'a-test-secret-that-is-long-enough', JOBS:kv, RATE_LIMITS:kv, USERS:kv};
  const auth = await signInTestUser(env);
  const originalFetch = globalThis.fetch;
  let providerRequest;
  globalThis.fetch = async (url, options) => {
    providerRequest = {url:String(url), authorization:options.headers.Authorization, body:JSON.parse(options.body)};
    return Response.json({id:'seedance-task-1', status:'queued'});
  };
  try {
    const response = await createVideoJob({
      request:new Request('http://127.0.0.1/api/video-jobs', {
        method:'POST',
        headers:{'Content-Type':'application/json', 'X-Provider-Key':'ark-test-key-12345', 'X-Provider-Model':'seedance-test-model', 'Idempotency-Key':'seedance_12345678', Cookie:auth.cookie},
        body:JSON.stringify({provider:'seedance', confirm_paid:true, prompt:'STYLE LOCK: broken CGI cat.', duration:10, ratio:'16:9'}),
      }), env,
    });
    const result = await response.json();
    assert.equal(response.status, 202);
    assert.equal(result.job.provider, 'seedance');
    assert.match(providerRequest.url, /ark\.cn-beijing\.volces\.com\/api\/v3\/contents\/generations\/tasks$/);
    assert.equal(providerRequest.authorization, 'Bearer ark-test-key-12345');
    assert.equal(providerRequest.body.model, 'seedance-test-model');
    assert.doesNotMatch([...values.values()].join(''), /ark-test-key-12345/);
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
    SESSION_SECRET:'a-test-secret-that-is-long-enough', JOBS:kv, RATE_LIMITS:kv, USERS:kv,
    RUNNINGHUB_AI_APPS:JSON.stringify([{
      id:'seedance', name:'Seedance 2.5 文生视频', apiVersion:'v2', webappId:'2085880920086765569', verified:true,
      instanceType:'plus',
      promptNodeId:'1', promptField:'prompt', durationNodeId:'1', durationField:'duration',
      ratioNodeId:'1', ratioField:'ratio', fixedFields:[
        {nodeId:'1', fieldName:'resolution', fieldValue:'720p'},
        {nodeId:'1', fieldName:'outputFormat', fieldValue:'mp4'},
      ],
    }]),
  };
  const auth = await signInTestUser(env);
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
        headers:{'Content-Type':'application/json', 'X-Provider-Key':'runninghub-test-key', 'Idempotency-Key':'v2app_12345678', Cookie:auth.cookie},
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
