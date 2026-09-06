import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createPack } from '../functions/_lib/pack.js';
import { buildPayload } from '../functions/_lib/minimax.js';
import { buildNodeInfo, normalizeOutputs } from '../functions/_lib/runninghub.js';
import { assertPaidRuntime, consumeRateLimit, ensureSession, getSession, validateIdempotencyKey } from '../functions/_lib/session.js';
import { onRequestPost as createVideoJob } from '../functions/api/video-jobs/index.js';
import { onRequestPost as submitFeedback } from '../functions/api/feedback.js';

test('Pages pack builder preserves the web contract', () => {
  const pack = createPack({ subject: '猫', prompt: '一只加班的猫试图逃离办公室', duration: 10, template: 'ad_hook' });
  assert.equal(pack.title, '《猫来》');
  assert.equal(pack.constraint_report.duration_seconds, 10);
  assert.equal(pack.script.length, 3);
  assert.match(pack.video_shots[0].motion_prompt, /10-second/);
});

test('Pages pack builder rejects an empty prompt', () => {
  assert.throws(() => createPack({ subject: '猫', prompt: '' }), /一句话创意/);
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

test('Creator UI exposes RunningHub workflow presets without legacy provider choices', () => {
  const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  assert.match(source, /MiniMax H3 · 快速出片/);
  assert.match(source, /Seedance · 高质量/);
  assert.doesNotMatch(source, /id="video-provider"/);
  assert.doesNotMatch(source, /data-submit-video/);
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
  assert.match(source, /Idempotency-Key/);
  assert.match(source, /open-niulai:video-jobs/);
  assert.match(source, /open-niulai:creator-draft/);
  assert.match(source, /generation-readiness/);
  assert.match(source, /feedback-form/);
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
