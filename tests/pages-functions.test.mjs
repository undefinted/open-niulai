import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createPack } from '../functions/_lib/pack.js';
import { buildPayload } from '../functions/_lib/minimax.js';
import { buildNodeInfo, normalizeOutputs } from '../functions/_lib/runninghub.js';

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

test('Creator UI exposes RunningHub workflow presets without legacy provider choices', () => {
  const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  assert.match(source, /MiniMax H3 · 快速出片/);
  assert.match(source, /Seedance · 高质量/);
  assert.doesNotMatch(source, /id="video-provider"/);
  assert.doesNotMatch(source, /data-submit-video/);
});
