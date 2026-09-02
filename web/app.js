const form = document.querySelector('#creator-form');
const workspace = document.querySelector('#workspace');
const toast = document.querySelector('#toast');
let currentPack = null;
let providerState = {providers: [], connected: [], secure_context: false};
let selectedProvider = 'minimax';
let firstFrameDataUrl = null;
const connectionKey = provider => `open-niulai:${provider}:connection`;

function getConnection(provider) {
  try { return JSON.parse(sessionStorage.getItem(connectionKey(provider)) || 'null'); }
  catch { return null; }
}

function providerHeaders(provider) {
  const connection = getConnection(provider);
  return connection ? {'X-Provider-Key': connection.api_key, 'X-Provider-Region': connection.region || 'cn'} : {};
}

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
  document.querySelector('#tab-video').innerHTML = `<section class="generation-studio" aria-labelledby="generation-title"><div class="generation-copy"><span class="provider-badge">第 1 步 · 内容已就绪</span><h3 id="generation-title">直接从这里生成视频</h3><p id="generation-account-note">选择 MiniMax 将使用你的 MiniMax 账户额度。</p></div><label class="frame-upload"><span>第 2 步 · 画面来源</span><input id="first-frame" type="file" accept="image/png,image/jpeg,image/webp"><b id="frame-name">未上传首帧：文本直出</b></label><label class="model-select"><span>第 3 步 · 生成方式</span><select id="video-provider"><option value="minimax">MiniMax H3 · 快速生成</option><option value="runninghub">RunningHub · 高级工作流</option><option value="runway">Runway</option><option value="kling">可灵</option><option value="seedance">Seedance</option><option value="local-svd">本地 SVD</option></select></label><div id="generation-action"></div><div id="advanced-workflow" class="advanced-workflow hidden"><div><span class="provider-badge">RunningHub 工作流参数</span><h4>把制作方案映射到你的 ComfyUI 工作流</h4></div><label>工作流 ID<input id="rh-workflow-id" inputmode="numeric" placeholder="例如 1904136902449209346"></label><label>提示词节点 ID<input id="rh-prompt-node" placeholder="例如 6"></label><label>提示词字段<input id="rh-prompt-field" value="text"></label><label>图片节点 ID（上传首帧时必填）<input id="rh-image-node" placeholder="例如 12"></label><label>图片字段<input id="rh-image-field" value="image"></label><label>访问密码（可选）<input id="rh-access-password" type="password" autocomplete="off"></label><p>节点 ID 和字段名来自该工作流导出的 API JSON。首帧会先上传，再写入图片加载节点。</p></div><div id="video-job-status" class="job-status hidden" role="status"></div></section><div class="mode-note"><strong>怎么选？</strong><span>MiniMax 适合快速出片；RunningHub 适合需要 LoRA、ControlNet、角色一致性或自定义采样参数的工作流。</span></div><div class="video-result"><div class="video-prompt"><pre>${escapeHtml(shot.motion_prompt)}</pre><aside class="video-meta"><dl>
    <div><dt>镜头</dt><dd>${escapeHtml(shot.camera)}</dd></div><div><dt>台词</dt><dd>${escapeHtml(shot.voiceover)}</dd></div><div><dt>避免</dt><dd>${escapeHtml(shot.negative_prompt)}</dd></div>
  </dl></aside></div><div class="result-player"><video controls muted loop playsinline poster="/demo/mao-first-frame.png"><source src="/demo/mao-lai-svd-captioned.mp4" type="video/mp4"></video><p><strong>参考样片</strong><br>当前播放的是本地 SVD 验证样片，不是本次输入即时生成的成片。</p></div></div>`;
  loadProviders().then(updateGenerationStudio).catch(error => notify(error.message));

  const copy = pack.publishing_copy;
  document.querySelector('#tab-publish').innerHTML = `<div class="publish-grid">
    <article class="publish-card"><span>标题</span><h3>${escapeHtml(copy.post_title)}</h3>${copyButton(copy.post_title)}</article>
    <article class="publish-card"><span>封面</span><h3>${escapeHtml(copy.cover_text)}</h3>${copyButton(copy.cover_text)}</article>
    <article class="publish-card"><span>首评与标签</span><h3>${escapeHtml(copy.first_comment)}</h3><p>${copy.hashtags.map(escapeHtml).join(' ')}</p>${copyButton(`${copy.first_comment}\n${copy.hashtags.join(' ')}`)}</article>
  </div>`;
  workspace.classList.remove('hidden');
  document.querySelectorAll('.tabs button, .tab-view').forEach(node => node.classList.remove('active'));
  document.querySelector('[data-tab="video"]').classList.add('active');
  document.querySelector('#tab-video').classList.add('active');
  requestAnimationFrame(() => document.querySelector('.generation-studio').scrollIntoView({behavior:'smooth', block:'start'}));
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
  providerState.connected = providerState.providers.filter(item => getConnection(item.id)).map(item => item.id);
  const notice = document.querySelector('#security-notice');
  notice.classList.toggle('hidden', providerState.secure_context);
  notice.textContent = providerState.secure_context ? '' : '当前站点使用 HTTP，为防止凭证泄露，API Key 连接已禁用。配置 HTTPS 后自动开放。';
  document.querySelector('#provider-list').innerHTML = providerState.providers.map(item => {
    const connected = providerState.connected.includes(item.id);
    const badge = connected ? '已临时连接' : item.connection === 'api_key' ? (providerState.secure_context ? 'API Key' : 'HTTPS 后可连接') : item.connection === 'external' ? '跳转使用' : '演示可用';
    let action = '';
    if (connected) action = `<button type="button" class="secondary" data-disconnect="${item.id}">断开</button>`;
    else if (item.connection === 'api_key' && providerState.secure_context) action = `<form class="key-form" data-provider="${item.id}"><input name="api_key" type="password" autocomplete="off" required minlength="12" placeholder="仅在本次会话中使用">${item.id === 'minimax' ? '<select name="region" aria-label="MiniMax 服务区"><option value="cn">中国区</option><option value="global">国际区</option></select>' : ''}<button class="secondary" type="submit">连接</button></form>`;
    else if (item.account_url) action = `<a class="secondary action-link" href="${item.account_url}" target="_blank" rel="noreferrer">前往平台 ↗</a>`;
    return `<article class="provider-row"><div><span class="provider-badge">${badge}</span><h3>${escapeHtml(item.name)}</h3><p>${item.connection === 'api_key' ? '生成费用从你的平台账户扣除，凭证不写入磁盘。' : item.connection === 'external' ? '复制制作包内容后，在模型平台官网完成生成。' : '可直接查看仓库内经过验证的 SVD 样片。'}</p></div>${action}</article>`;
  }).join('');
  updateGenerationStudio();
}

function updateGenerationStudio() {
  const select = document.querySelector('#video-provider');
  const action = document.querySelector('#generation-action');
  if (!select || !action) return;
  select.value = selectedProvider;
  const item = providerState.providers.find(provider => provider.id === selectedProvider);
  if (!item) return;
  const connected = providerState.connected.includes(item.id);
  const note = document.querySelector('#generation-account-note');
  const advanced = document.querySelector('#advanced-workflow');
  advanced?.classList.toggle('hidden', selectedProvider !== 'runninghub');
  note.textContent = item.connection === 'local' ? '本地模式不消耗第三方平台额度，当前服务器仅提供已验证样片。' : `选择 ${item.name} 将使用你的 ${item.name} 账户额度，Open NiuLai 不代充值。`;
  if (item.connection === 'api_key') {
    if (!providerState.secure_context) action.innerHTML = '<button class="primary" type="button" data-open-connections><span>配置 HTTPS 后连接</span><b>→</b></button>';
    else if (!connected) action.innerHTML = '<button class="primary" type="button" data-open-connections><span>连接账户</span><b>→</b></button>';
    else if (selectedProvider === 'runninghub') action.innerHTML = '<button class="primary" type="button" data-submit-runninghub><span>确认费用并运行工作流</span><b>→</b></button>';
    else action.innerHTML = '<button class="primary" type="button" data-submit-video><span>确认费用并生成</span><b>→</b></button>';
  } else if (item.connection === 'external') {
    action.innerHTML = `<a class="primary generation-link" href="${item.account_url}" target="_blank" rel="noreferrer"><span>前往 ${escapeHtml(item.name)} 生成</span><b>↗</b></a>`;
  } else {
    action.innerHTML = '<button class="secondary" type="button" data-view-sample>查看参考样片</button>';
  }
}

async function openConnections() {
  try { await loadProviders(); dialog.showModal(); } catch (error) { notify(error.message); }
}

document.querySelector('#connections-open').addEventListener('click', openConnections);
document.querySelector('#connections-close').addEventListener('click', () => dialog.close());
document.addEventListener('click', event => { if (event.target.closest('[data-open-connections]')) openConnections(); });
document.addEventListener('change', event => {
  if (event.target.id === 'video-provider') {
    selectedProvider = event.target.value;
    updateGenerationStudio();
  }
  if (event.target.id === 'first-frame') {
    const file = event.target.files[0];
    if (!file) { firstFrameDataUrl = null; return; }
    if (file.size > 10 * 1024 * 1024) { notify('首帧图片不能超过 10 MB'); event.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => { firstFrameDataUrl = reader.result; document.querySelector('#frame-name').textContent = `${file.name} · 首帧引导`; };
    reader.readAsDataURL(file);
  }
});
document.addEventListener('click', event => {
  if (event.target.closest('[data-view-sample]')) document.querySelector('.result-player')?.scrollIntoView({behavior:'smooth', block:'center'});
  if (event.target.closest('[data-submit-video]')) submitVideo();
  if (event.target.closest('[data-submit-runninghub]')) submitRunningHub();
});

dialog.addEventListener('submit', async event => {
  const form = event.target.closest('.key-form');
  if (!form) return;
  event.preventDefault();
  const formData = new FormData(form);
  const apiKey = formData.get('api_key');
  form.querySelector('button').disabled = true;
  try {
    if (!apiKey || apiKey.length < 12) throw new Error('API Key 格式无效');
    sessionStorage.setItem(connectionKey(form.dataset.provider), JSON.stringify({api_key:apiKey, region:formData.get('region') || 'cn'}));
    form.reset();
    await loadProviders();
    notify('模型账户已连接，仅保留在当前标签页');
  } catch (error) { notify(error.message); }
  finally { form.querySelector('button').disabled = false; }
});

dialog.addEventListener('click', async event => {
  const button = event.target.closest('[data-disconnect]');
  if (!button) return;
  sessionStorage.removeItem(connectionKey(button.dataset.disconnect));
  await loadProviders();
  notify('连接已断开');
});

async function submitVideo() {
  if (!currentPack || selectedProvider !== 'minimax') return;
  if (!window.confirm('将使用你自己的 MiniMax 按量付费额度创建 1 个 H3 视频任务。是否确认提交？')) return;
  const action = document.querySelector('[data-submit-video]');
  action.disabled = true;
  const status = document.querySelector('#video-job-status');
  status.classList.remove('hidden');
  status.innerHTML = '<strong>正在提交</strong><span>正在创建一次付费任务，请勿重复点击。</span>';
  try {
    const shot = currentPack.video_shots[0];
    const requested = Number(currentPack.constraint_report.duration_seconds || 10);
    const response = await fetch('/api/video-jobs', {method:'POST', headers:{'Content-Type':'application/json', ...providerHeaders('minimax')}, body:JSON.stringify({provider:'minimax', prompt:shot.motion_prompt, duration:Math.max(4,Math.min(15,requested)), ratio:'16:9', first_frame_image:firstFrameDataUrl, confirm_paid:true})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '任务提交失败');
    showJob(result.job);
    pollJob(result.job.id, 'minimax');
  } catch (error) {
    status.innerHTML = `<strong>提交失败</strong><span>${escapeHtml(error.message)}</span>`;
    action.disabled = false;
  }
}

async function submitRunningHub() {
  if (!currentPack || selectedProvider !== 'runninghub') return;
  const workflowId = document.querySelector('#rh-workflow-id').value.trim();
  const promptNodeId = document.querySelector('#rh-prompt-node').value.trim();
  const imageNodeId = document.querySelector('#rh-image-node').value.trim();
  if (!workflowId || !promptNodeId) { notify('请填写工作流 ID 和提示词节点 ID'); return; }
  if (firstFrameDataUrl && !imageNodeId) { notify('上传首帧后需要填写图片节点 ID'); return; }
  if (!window.confirm('将使用你自己的 RunningHub 账户额度运行一次工作流。是否确认提交？')) return;
  const action = document.querySelector('[data-submit-runninghub]');
  const status = document.querySelector('#video-job-status');
  action.disabled = true;
  status.classList.remove('hidden');
  status.innerHTML = '<strong>正在准备工作流</strong><span>正在上传素材并创建付费任务，请勿重复点击。</span>';
  try {
    let uploadedFileName = null;
    if (firstFrameDataUrl) {
      const upload = await fetch('/api/runninghub/uploads', {
        method:'POST', headers:{'Content-Type':'application/json', ...providerHeaders('runninghub')},
        body:JSON.stringify({data_url:firstFrameDataUrl, filename:'open-niulai-first-frame.png'}),
      });
      const uploaded = await upload.json();
      if (!upload.ok) throw new Error(uploaded.error || '首帧上传失败');
      uploadedFileName = uploaded.file_name;
    }
    const shot = currentPack.video_shots[0];
    const response = await fetch('/api/video-jobs', {
      method:'POST', headers:{'Content-Type':'application/json', ...providerHeaders('runninghub')},
      body:JSON.stringify({
        provider:'runninghub', confirm_paid:true, workflow_id:workflowId, prompt:shot.motion_prompt,
        prompt_node_id:promptNodeId, prompt_field:document.querySelector('#rh-prompt-field').value.trim() || 'text',
        image_node_id:imageNodeId, image_field:document.querySelector('#rh-image-field').value.trim() || 'image',
        uploaded_file_name:uploadedFileName, access_password:document.querySelector('#rh-access-password').value,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '工作流提交失败');
    showJob(result.job);
    pollJob(result.job.id, 'runninghub');
  } catch (error) {
    status.innerHTML = `<strong>提交失败</strong><span>${escapeHtml(error.message)}</span>`;
    action.disabled = false;
  }
}

function showJob(job) {
  const status = document.querySelector('#video-job-status');
  const labels = {queued:'排队中',running:'生成中',succeeded:'生成完成',failed:'生成失败',cancelled:'已取消',expired:'已过期',timeout:'查询暂停'};
  status.classList.remove('hidden');
  const detail = job.provider === 'runninghub'
    ? `RunningHub 工作流${job.workflow_id ? ` · ${escapeHtml(job.workflow_id)}` : ''}`
    : `MiniMax H3 · ${job.duration || '-'} 秒 · ${job.ratio || '-'} · ${job.input_mode === 'first_frame' ? '首帧引导' : '文本直出'}`;
  status.innerHTML = `<strong>${labels[job.status] || escapeHtml(job.status)}</strong><span>${job.error ? escapeHtml(job.error) : detail}</span>`;
  if (job.video_url) {
    const providerName = job.provider === 'runninghub' ? 'RunningHub' : 'MiniMax';
    document.querySelector('.result-player').innerHTML = `<video controls autoplay playsinline><source src="${escapeHtml(job.video_url)}" type="video/mp4"></video><p><strong>本次生成结果</strong><br>${providerName} 已返回真实生成结果，可直接播放或下载。</p><a class="secondary action-link" href="${escapeHtml(job.video_url)}" target="_blank" rel="noreferrer">下载或打开成片</a>`;
  }
}

function pollJob(jobId, provider) {
  const timer = setInterval(async () => {
    try {
      const response = await fetch(`/api/video-jobs/${encodeURIComponent(jobId)}?provider=${encodeURIComponent(provider)}`, {headers:providerHeaders(provider)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '查询失败');
      showJob(result.job);
      if (['succeeded','failed','cancelled','expired','timeout'].includes(result.job.status)) clearInterval(timer);
    } catch (error) {
      clearInterval(timer);
      document.querySelector('#video-job-status').innerHTML = `<strong>查询失败</strong><span>${escapeHtml(error.message)}</span>`;
    }
  }, 10000);
}
