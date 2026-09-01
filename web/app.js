const form = document.querySelector('#creator-form');
const workspace = document.querySelector('#workspace');
const toast = document.querySelector('#toast');
let currentPack = null;
let providerState = {providers: [], connected: [], secure_context: false};

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function copyButton(text) {
  return `<button class="copy" type="button" data-copy="${encodeURIComponent(text)}" title="复制" aria-label="复制">⧉</button>`;
}

function render(pack) {
  currentPack = pack;
  document.querySelector('#result-title').textContent = pack.title;
  document.querySelector('#result-hook').textContent = pack.hook;
  document.querySelector('#tab-story').innerHTML = `<div class="story-grid">${pack.script.map((beat, index) => `
    <article class="beat"><time>${escapeHtml(beat.time)} · 镜头 ${String(index + 1).padStart(2, '0')}</time><h3>${escapeHtml(beat.subtitle)}</h3><p>${escapeHtml(beat.action)}</p></article>`).join('')}</div>`;

  const visualLabels = {poster_scam:'宣传海报', broken_footage_still:'崩坏首帧', character_reference:'角色设定', meme_reaction:'反应特写'};
  document.querySelector('#tab-visual').innerHTML = `<div class="prompt-grid">${Object.entries(pack.image_prompts).map(([key, text]) => `
    <article class="prompt-card">${copyButton(text)}<span>图像提示词</span><h3>${visualLabels[key] || key}</h3><p>${escapeHtml(text)}</p></article>`).join('')}</div>`;

  const shot = pack.video_shots[0];
  document.querySelector('#tab-video').innerHTML = `<div class="video-result"><div class="result-player"><video controls muted loop playsinline poster="/demo/mao-first-frame.png"><source src="/demo/mao-lai-svd-captioned.mp4" type="video/mp4"></video><p>当前播放的是本地 SVD 验证样片，不是本次输入即时生成的成片。</p></div><div class="video-prompt"><pre>${escapeHtml(shot.motion_prompt)}</pre><aside class="video-meta"><dl>
    <div><dt>镜头</dt><dd>${escapeHtml(shot.camera)}</dd></div><div><dt>台词</dt><dd>${escapeHtml(shot.voiceover)}</dd></div><div><dt>避免</dt><dd>${escapeHtml(shot.negative_prompt)}</dd></div>
  </dl></aside></div></div><div class="generation-bar"><div><strong>下一步生成成片</strong><span>选择并连接模型平台后，可在本站提交异步视频任务。</span></div><button class="secondary" type="button" data-open-connections>选择模型</button></div>`;

  const copy = pack.publishing_copy;
  document.querySelector('#tab-publish').innerHTML = `<div class="publish-grid">
    <article class="publish-card"><span>标题</span><h3>${escapeHtml(copy.post_title)}</h3>${copyButton(copy.post_title)}</article>
    <article class="publish-card"><span>封面</span><h3>${escapeHtml(copy.cover_text)}</h3>${copyButton(copy.cover_text)}</article>
    <article class="publish-card"><span>首评与标签</span><h3>${escapeHtml(copy.first_comment)}</h3><p>${copy.hashtags.map(escapeHtml).join(' ')}</p>${copyButton(`${copy.first_comment}\n${copy.hashtags.join(' ')}`)}</article>
  </div>`;
  workspace.classList.remove('hidden');
  workspace.scrollIntoView({behavior: 'smooth', block: 'start'});
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('.primary');
  button.disabled = true;
  button.querySelector('span').textContent = '正在构思…';
  const data = Object.fromEntries(new FormData(form));
  data.duration = Number(data.duration);
  try {
    const response = await fetch('/api/packs', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '生成失败');
    render(result.pack);
  } catch (error) {
    notify(error.message);
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = '生成制作方案';
  }
});

document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {
  document.querySelector('#prompt').value = button.dataset.example;
  const match = button.dataset.example.match(/(猫|甲方|代码)来/);
  if (match) document.querySelector('#subject').value = match[1];
}));

document.querySelector('.tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-tab]');
  if (!button) return;
  document.querySelectorAll('.tabs button, .tab-view').forEach(node => node.classList.remove('active'));
  button.classList.add('active');
  document.querySelector(`#tab-${button.dataset.tab}`).classList.add('active');
});

workspace.addEventListener('click', async event => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  await navigator.clipboard.writeText(decodeURIComponent(button.dataset.copy));
  notify('已复制');
});

document.querySelector('#download').addEventListener('click', () => {
  if (!currentPack) return;
  const blob = new Blob([JSON.stringify(currentPack, null, 2)], {type:'application/json'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `open-niulai-${currentPack.constraint_report.subject}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  notify('制作包已下载');
});

const dialog = document.querySelector('#connections-dialog');

async function loadProviders() {
  const response = await fetch('/api/providers');
  providerState = await response.json();
  const notice = document.querySelector('#security-notice');
  notice.classList.toggle('hidden', providerState.secure_context);
  notice.textContent = providerState.secure_context ? '' : '当前站点使用 HTTP，为防止凭证泄露，API Key 连接已禁用。配置 HTTPS 后自动开放。';
  document.querySelector('#provider-list').innerHTML = providerState.providers.map(item => {
    const connected = providerState.connected.includes(item.id);
    const badge = connected ? '已临时连接' : item.connection === 'api_key' ? (providerState.secure_context ? 'API Key' : 'HTTPS 后可连接') : item.connection === 'external' ? '跳转使用' : '演示可用';
    let action = '';
    if (connected) action = `<button type="button" class="secondary" data-disconnect="${item.id}">断开</button>`;
    else if (item.connection === 'api_key' && providerState.secure_context) action = `<form class="key-form" data-provider="${item.id}"><input name="api_key" type="password" autocomplete="off" required minlength="12" placeholder="仅在本次会话中使用"><button class="secondary" type="submit">连接</button></form>`;
    else if (item.account_url) action = `<a class="secondary action-link" href="${item.account_url}" target="_blank" rel="noreferrer">前往平台 ↗</a>`;
    return `<article class="provider-row"><div><span class="provider-badge">${badge}</span><h3>${escapeHtml(item.name)}</h3><p>${item.connection === 'api_key' ? '生成费用从你的平台账户扣除，凭证不写入磁盘。' : item.connection === 'external' ? '复制制作包内容后，在模型平台官网完成生成。' : '可直接查看仓库内经过验证的 SVD 样片。'}</p></div>${action}</article>`;
  }).join('');
}

async function openConnections() {
  try { await loadProviders(); dialog.showModal(); } catch (error) { notify(error.message); }
}

document.querySelector('#connections-open').addEventListener('click', openConnections);
document.querySelector('#connections-close').addEventListener('click', () => dialog.close());
document.addEventListener('click', event => { if (event.target.closest('[data-open-connections]')) openConnections(); });

dialog.addEventListener('submit', async event => {
  const form = event.target.closest('.key-form');
  if (!form) return;
  event.preventDefault();
  const apiKey = new FormData(form).get('api_key');
  form.querySelector('button').disabled = true;
  try {
    const response = await fetch(`/api/connections/${form.dataset.provider}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({api_key:apiKey})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '连接失败');
    form.reset();
    await loadProviders();
    notify('模型账户已临时连接');
  } catch (error) { notify(error.message); }
});

dialog.addEventListener('click', async event => {
  const button = event.target.closest('[data-disconnect]');
  if (!button) return;
  await fetch(`/api/connections/${button.dataset.disconnect}`, {method:'DELETE'});
  await loadProviders();
  notify('连接已断开');
});
