import test from 'node:test';
import assert from 'node:assert/strict';

import { createPack } from '../functions/_lib/pack.js';
import { buildPayload } from '../functions/_lib/minimax.js';

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
