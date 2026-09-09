const form = document.querySelector('#creator-form');
const workspace = document.querySelector('#workspace');
const toast = document.querySelector('#toast');
let currentPack = null;
let providerState = {providers: [], connected: [], secure_context: false};
let selectedWorkflow = 'minimax-h3';
let firstFrameDataUrl = null;
let sessionState = null;
const activePolls = new Map();
const connectionKey = provider => `open-niulai:${provider}:connection`;
const workflowConfigKey = preset => `open-niulai:runninghub:workflow:${preset}`;
const jobHistoryKey = 'open-niulai:video-jobs';
const creatorDraftKey = 'open-niulai:creator-draft';
const packDraftKey = 'open-niulai:last-pack';
let workflowPresets = {
  'minimax-h3': {id:'minimax-h3', name:'MiniMax H3 成片实例', badge:'快速出片', description:'适合文本直出、首帧引导和带声音的短片。', supports_image:true, configured:false, mode:'ai_app'},
  'seedance': {id:'seedance', name:'Seedance 成片实例', badge:'高质量', description:'适合强调镜头表现、角色一致性和参考素材的视频。', supports_image:true, configured:false, mode:'ai_app'},
  'custom': {id:'custom', name:'自定义工作流', badge:'专业模式', description:'高级用户可以运行自己在 RunningHub 中保存的工作流。', supports_image:true, configured:true, mode:'workflow'},
};

function getConnection(provider) {
  try { return JSON.parse(sessionStorage.getItem(connectionKey(provider)) || 'null'); }
  catch { return null; }
}

function providerHeaders(provider) {
  const connection = getConnection(provider);
  return connection ? {'X-Provider-Key': connection.api_key, 'X-Provider-Region': connection.region || 'cn'} : {};
}

function getWorkflowConfig(preset) {
  try { return JSON.parse(localStorage.getItem(workflowConfigKey(preset)) || '{}'); }
  catch { return {}; }
}

function saveWorkflowConfig(preset, config) {
  localStorage.setItem(workflowConfigKey(preset), JSON.stringify(config));
}

function getJobHistory() {
  try { return JSON.parse(localStorage.getItem(jobHistoryKey) || '[]').slice(0, 20); }
  catch { return []; }
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch { return null; }
}

function saveJob(job) {
  const safe = {
    id:String(job.id), provider:String(job.provider || 'runninghub'), model:String(job.model || 'RunningHub Workflow'),
    status:String(job.status || 'queued'), workflow_id:job.workflow_id ? String(job.workflow_id) : null,
    generation_mode:String(job.generation_mode || 'workflow'), instance_id:job.instance_id ? String(job.instance_id) : null,
    workflow_preset:String(job.workflow_preset || selectedWorkflow), created_at:Number(job.created_at || Date.now() / 1000),
    updated_at:Number(job.updated_at || Date.now() / 1000), video_url:safeExternalUrl(job.video_url),
    error:job.error ? String(job.error) : null,
  };
  const jobs = [safe, ...getJobHistory().filter(item => !(item.id === safe.id && item.provider === safe.provider))].slice(0, 20);
  localStorage.setItem(jobHistoryKey, JSON.stringify(jobs));
  renderJobHistory();
}

function renderJobHistory() {
  const jobs = getJobHistory();
  const section = document.querySelector('#recent-jobs');
  section.classList.toggle('hidden', jobs.length === 0);
  document.querySelector('#job-history').innerHTML = jobs.map(job => {
    const preset = job.generation_mode === 'ai_app' ? job.model : workflowPresets[job.workflow_preset]?.name || job.model;
    const date = new Date(job.created_at * 1000).toLocaleString('zh-CN', {hour12:false});
    const state = {queued:'排队中', running:'生成中', succeeded:'已完成', failed:'失败', cancelled:'已取消', expired:'已过期', timeout:'查询已暂停'}[job.status] || job.status;
    const action = job.video_url
      ? `<a class="secondary" href="${escapeHtml(job.video_url)}" target="_blank" rel="noreferrer">打开成片</a>`
      : `<button class="secondary" type="button" data-resume-job="${encodeURIComponent(job.id)}" data-provider="${escapeHtml(job.provider)}">${job.status === 'failed' ? '重新查询状态' : '恢复查询'}</button>`;
    const failure = job.error ? `<p class="history-error">${escapeHtml(job.error)}</p>` : '';
    return `<article class="history-row"><div><h3>${escapeHtml(preset)}</h3><p>任务 ${escapeHtml(job.id)} · ${escapeHtml(date)}</p>${failure}</div><span class="history-state ${escapeHtml(job.status)}">${escapeHtml(state)}</span><div class="history-actions">${action}</div></article>`;
  }).join('');
}

async function initializeService() {
  const status = document.querySelector('#service-status');
  try {
    const [healthResponse, sessionResponse] = await Promise.all([fetch('/api/health'), fetch('/api/session')]);
    const health = await healthResponse.json();
    sessionState = await sessionResponse.json();
    if (!healthResponse.ok || !sessionResponse.ok) throw new Error('初始化失败');
    status.classList.toggle('warning', !health.production_ready);
    status.lastChild.textContent = health.production_ready ? '服务已就绪' : '公开试用模式';
    status.title = health.production_ready ? `Open NiuLai ${health.version}` : '核心功能可用，生产级云端绑定尚未全部配置';
  } catch {
    status.classList.add('error');
    status.lastChild.textContent = '服务连接异常';
  }
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

function qualityMarkup(report, compact = false) {
  if (!report) return '<section class="quality-gate blocked"><div><span class="provider-badge">质量门禁</span><h3>需要重新生成制作包</h3><p>当前草稿没有工程验证记录。</p></div></section>';
  const labels = {
    constraint_coverage_percent:'约束覆盖', required_field_completeness_percent:'字段完整',
    timeline_integrity_percent:'时间线', production_readiness_percent:'生成准备',
  };
  const failures = report.checks.filter(item => item.status !== 'pass');
  return `<section class="quality-gate ${escapeHtml(report.status)} ${compact ? 'compact' : ''}">
    <div class="quality-heading"><div><span class="provider-badge">AI 输出质量门禁</span><h3>规则验证 ${escapeHtml(report.score)}/100 · ${report.status === 'passed' ? '通过' : '已阻断'}</h3><p>${escapeHtml(report.score_note)}</p></div><strong>${escapeHtml(report.summary.passed)}/${escapeHtml(report.summary.total)}</strong></div>
    <div class="quality-metrics">${Object.entries(report.metrics).map(([key, value]) => `<div><b>${escapeHtml(value)}%</b><span>${escapeHtml(labels[key] || key)}</span></div>`).join('')}</div>
    ${compact ? '' : `<details class="quality-evidence"><summary>查看 ${escapeHtml(report.checks.length)} 项验证证据</summary><div>${report.checks.map(item => `<p class="${escapeHtml(item.status)}"><b>${item.status === 'pass' ? '通过' : '失败'} · ${escapeHtml(item.label)}</b><span>${escapeHtml(item.evidence)}</span>${item.remediation ? `<small>${escapeHtml(item.remediation)}</small>` : ''}</p>`).join('')}</div></details>`}
    ${failures.length && compact ? `<p class="quality-blocker">${escapeHtml(failures[0].remediation)}</p>` : ''}
  </section>`;
}

function render(pack, {scroll = true} = {}) {
  currentPack = pack;
  localStorage.setItem(packDraftKey, JSON.stringify(pack));
  document.querySelector('#result-title').textContent = pack.title;
  document.querySelector('#result-hook').textContent = pack.hook;
  document.querySelector('#tab-story').innerHTML = `${qualityMarkup(pack.quality_report)}<div class="story-grid">${pack.script.map((beat, index) => `
    <article class="beat"><time>${escapeHtml(beat.time)} · 镜头 ${String(index + 1).padStart(2, '0')}</time><h3>${escapeHtml(beat.subtitle)}</h3><p>${escapeHtml(beat.action)}</p></article>`).join('')}</div>`;

  const visualLabels = {poster_scam:'宣传海报', broken_footage_still:'崩坏首帧', character_reference:'角色设定', meme_reaction:'反应特写'};
  document.querySelector('#tab-visual').innerHTML = `<div class="prompt-grid">${Object.entries(pack.image_prompts).map(([key, text]) => `
    <article class="prompt-card">${copyButton(text)}<span>图像提示词</span><h3>${visualLabels[key] || key}</h3><p>${escapeHtml(text)}</p></article>`).join('')}</div>`;

  const shot = pack.video_shots[0];
  document.querySelector('#tab-video').innerHTML = `<section class="generation-studio" aria-labelledby="generation-title"><div class="generation-copy"><span class="provider-badge">第 1 步 · 脚本已就绪</span><h3 id="generation-title">确认脚本，直接生成视频</h3><p id="generation-account-note">选择已经调试好的 RunningHub AI 实例，系统会自动填入脚本和素材。</p></div><label class="frame-upload"><span>第 2 步 · 画面来源</span><input id="first-frame" type="file" accept="image/png,image/jpeg,image/webp"><b id="frame-name">未上传首帧：文本直出</b></label><label class="model-select"><span>第 3 步 · AI 实例</span><select id="video-generator" aria-label="选择 RunningHub AI 实例"></select></label><div id="generation-action"></div><label class="script-review"><span>确认或修改最终视频脚本</span><textarea id="video-script-prompt" maxlength="7000">${escapeHtml(shot.motion_prompt)}</textarea><small>这里的内容会作为最终提示词传给所选 AI 实例。</small></label><div id="workflow-summary" class="workflow-summary"></div><ol id="generation-readiness" class="generation-readiness" aria-label="生成准备状态"></ol><details id="workflow-config" class="workflow-config hidden"><summary>高级：使用自定义工作流</summary><div class="advanced-workflow"><div><span class="provider-badge">专业模式</span><h4 id="workflow-config-title">绑定 RunningHub 工作流</h4></div><label>工作流 ID<input id="rh-workflow-id" inputmode="numeric" placeholder="从 RunningHub API 调用页复制"></label><label>提示词节点 ID<input id="rh-prompt-node" placeholder="例如 6"></label><label>提示词字段<input id="rh-prompt-field" value="text"></label><label>图片节点 ID（上传首帧时必填）<input id="rh-image-node" placeholder="例如 12"></label><label>图片字段<input id="rh-image-field" value="image"></label><label>访问密码（可选，不保存）<input id="rh-access-password" type="password" autocomplete="off"></label><p>仅自定义工作流需要这些信息。AI 实例的 WebAppId 和参数映射由平台后台维护，不会显示给普通用户。</p></div></details><div id="video-job-status" class="job-status hidden" role="status"></div></section><div class="mode-note"><strong>两阶段生成</strong><span>Open NiuLai 先生成可修改的脚本和分镜；确认后，RunningHub AI 实例负责生成视频并返回成片。</span></div><div class="video-result"><div class="video-prompt"><pre>${escapeHtml(shot.motion_prompt)}</pre><aside class="video-meta"><dl>
    <div><dt>镜头</dt><dd>${escapeHtml(shot.camera)}</dd></div><div><dt>台词</dt><dd>${escapeHtml(shot.voiceover)}</dd></div><div><dt>避免</dt><dd>${escapeHtml(shot.negative_prompt)}</dd></div>
  </dl></aside></div><div class="result-player"><video controls muted loop playsinline poster="/demo/mao-first-frame.png"><source src="/demo/mao-lai-svd-captioned.mp4" type="video/mp4"></video><p><strong>参考样片</strong><br>当前播放的是本地 SVD 验证样片，不是本次输入即时生成的成片。</p></div></div>`;
  document.querySelector('#tab-video').insertAdjacentHTML('afterbegin', qualityMarkup(pack.quality_report, true));
  Promise.all([loadProviders(), loadVideoInstances()]).then(() => { updateWorkflowPreset(); updateGenerationStudio(); }).catch(error => notify(error.message));

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
  if (scroll) requestAnimationFrame(() => document.querySelector('.generation-studio').scrollIntoView({behavior:'smooth', block:'start'}));
}

function saveCreatorDraft() {
  const values = Object.fromEntries(new FormData(form));
  localStorage.setItem(creatorDraftKey, JSON.stringify(values));
}

function restoreCreatorDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(creatorDraftKey) || 'null');
    if (draft) Object.entries(draft).forEach(([name, value]) => {
      const field = form.elements.namedItem(name);
      if (field && typeof value === 'string') field.value = value;
    });
    const pack = JSON.parse(localStorage.getItem(packDraftKey) || 'null');
    if (pack?.title && Array.isArray(pack.script) && Array.isArray(pack.video_shots)) render(pack, {scroll:false});
  } catch {
    localStorage.removeItem(creatorDraftKey);
    localStorage.removeItem(packDraftKey);
  }
}

let draftTimer = null;
form.addEventListener('input', () => {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveCreatorDraft, 250);
});
form.addEventListener('change', saveCreatorDraft);

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
    saveCreatorDraft();
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
  notice.classList.toggle('hidden', providerState.secure_context && providerState.generation_ready !== false);
  notice.textContent = !providerState.secure_context
    ? '当前站点使用 HTTP，为防止凭证泄露，API Key 连接已禁用。配置 HTTPS 后自动开放。'
    : providerState.generation_ready === false ? '站点正在配置签名会话、任务存储和限流，完成前不会接收 API Key 或付费任务。' : '';
  document.querySelector('#provider-list').innerHTML = providerState.providers.filter(item => item.id === 'runninghub').map(item => {
    const connected = providerState.connected.includes(item.id);
    const badge = connected ? '已临时连接' : providerState.generation_ready === false ? '服务配置中' : item.connection === 'api_key' ? (providerState.secure_context ? 'API Key' : 'HTTPS 后可连接') : item.connection === 'external' ? '跳转使用' : '演示可用';
    let action = '';
    if (connected) action = `<button type="button" class="secondary" data-disconnect="${item.id}">断开</button>`;
    else if (item.connection === 'api_key' && providerState.secure_context && providerState.generation_ready !== false) action = `<form class="key-form" data-provider="${item.id}"><input name="api_key" type="password" autocomplete="off" required minlength="12" placeholder="RunningHub API Key"><button class="secondary" type="submit">连接</button></form>`;
    else if (item.account_url) action = `<a class="secondary action-link" href="${item.account_url}" target="_blank" rel="noreferrer">前往平台 ↗</a>`;
    return `<article class="provider-row"><div><span class="provider-badge">${badge}</span><h3>${escapeHtml(item.name)}</h3><p>${item.connection === 'api_key' ? '生成费用从你的平台账户扣除，凭证不写入磁盘。' : item.connection === 'external' ? '复制制作包内容后，在模型平台官网完成生成。' : '可直接查看仓库内经过验证的 SVD 样片。'}</p></div>${action}</article>`;
  }).join('');
  updateGenerationStudio();
}

async function loadVideoInstances() {
  const response = await fetch('/api/video-instances');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'AI 实例目录加载失败');
  const custom = workflowPresets.custom;
  workflowPresets = Object.fromEntries(result.instances.map(instance => [instance.id, {...instance, mode:'ai_app'}]));
  workflowPresets.custom = custom;
  if (!workflowPresets[selectedWorkflow]) selectedWorkflow = Object.keys(workflowPresets)[0] || 'custom';
}

function currentWorkflowConfig() {
  const stored = getWorkflowConfig(selectedWorkflow);
  const value = id => document.querySelector(id)?.value.trim();
  return {
    workflow_id:value('#rh-workflow-id') || stored.workflow_id || '',
    prompt_node_id:value('#rh-prompt-node') || stored.prompt_node_id || '',
    prompt_field:value('#rh-prompt-field') || stored.prompt_field || 'text',
    image_node_id:value('#rh-image-node') || stored.image_node_id || '',
    image_field:value('#rh-image-field') || stored.image_field || 'image',
  };
}

function saveVisibleWorkflowConfig() {
  if (!document.querySelector('#rh-workflow-id')) return;
  saveWorkflowConfig(selectedWorkflow, currentWorkflowConfig());
}

function updateGenerationStudio() {
  const action = document.querySelector('#generation-action');
  if (!action) return;
  const item = providerState.providers.find(provider => provider.id === 'runninghub');
  if (!item) return;
  const connected = providerState.connected.includes(item.id);
  const config = currentWorkflowConfig();
  const preset = workflowPresets[selectedWorkflow] || workflowPresets.custom;
  const customMode = preset.mode === 'workflow';
  const serviceReady = providerState.secure_context && providerState.generation_ready !== false;
  const qualityReady = currentPack?.quality_report?.status === 'passed';
  const scriptReady = Boolean(document.querySelector('#video-script-prompt')?.value.trim());
  const workflowReady = Boolean(config.workflow_id && config.prompt_node_id);
  const generatorReady = customMode ? workflowReady : Boolean(preset.configured);
  const inputReady = !firstFrameDataUrl || (customMode ? Boolean(config.image_node_id) : Boolean(preset.supports_image));
  const note = document.querySelector('#generation-account-note');
  note.textContent = customMode
    ? `${preset.name} 将使用你的节点配置运行，费用从 RunningHub 账户扣除。`
    : `${preset.name} 会自动接收当前脚本${firstFrameDataUrl ? '和首帧' : ''}，费用从 RunningHub 账户扣除。`;
  const checks = [
    {done:qualityReady, label:'质量门禁', detail:qualityReady ? `规则验证 ${currentPack.quality_report.score}/100` : '请重新生成并修正失败项'},
    {done:scriptReady, label:'视频脚本', detail:scriptReady ? '已确认，可继续修改' : '请填写最终视频脚本'},
    {done:serviceReady && connected, label:'模型账户', detail:!serviceReady ? '服务尚未开放付费任务' : connected ? 'RunningHub 已临时连接' : '需要连接 RunningHub'},
    {done:generatorReady, label:customMode ? '工作流绑定' : 'AI 实例', detail:generatorReady ? `${preset.name} 已就绪` : customMode ? '填写工作流 ID 与提示词节点' : '该实例等待管理员绑定'},
    {done:inputReady, label:'画面输入', detail:firstFrameDataUrl ? (inputReady ? '首帧输入已就绪' : customMode ? '还需填写图片节点 ID' : '该实例不接受首帧') : '文本直出'},
  ];
  const firstPending = checks.findIndex(check => !check.done);
  document.querySelector('#generation-readiness').innerHTML = checks.map((check, index) => `<li class="${check.done ? 'done' : index === firstPending ? 'current' : 'waiting'}"><i>${check.done ? '✓' : index + 1}</i><span><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.detail)}</small></span></li>`).join('');
  if (!qualityReady) action.innerHTML = '<button class="primary" type="button" disabled><span>质量门禁未通过</span><b>·</b></button>';
  else if (!scriptReady) action.innerHTML = '<button class="primary" type="button" disabled><span>请先确认视频脚本</span><b>·</b></button>';
  else if (!providerState.secure_context) action.innerHTML = '<button class="primary" type="button" disabled><span>当前连接不安全</span><b>·</b></button>';
  else if (providerState.generation_ready === false) action.innerHTML = '<button class="primary" type="button" disabled><span>生成服务配置中</span><b>·</b></button>';
  else if (!connected) action.innerHTML = '<button class="primary" type="button" data-open-connections><span>下一步：连接账户</span><b>→</b></button>';
  else if (!generatorReady && customMode) action.innerHTML = '<button class="primary" type="button" data-open-workflow-config><span>下一步：绑定工作流</span><b>→</b></button>';
  else if (!generatorReady) action.innerHTML = '<button class="primary" type="button" disabled><span>AI 实例待配置</span><b>·</b></button>';
  else if (!inputReady && customMode) action.innerHTML = '<button class="primary" type="button" data-open-workflow-config><span>下一步：填写图片节点</span><b>→</b></button>';
  else if (!inputReady) action.innerHTML = '<button class="primary" type="button" disabled><span>该实例不支持首帧</span><b>·</b></button>';
  else action.innerHTML = '<button class="primary" type="button" data-submit-runninghub><span>确认费用并生成</span><b>→</b></button>';
}

function updateWorkflowPreset() {
  const select = document.querySelector('#video-generator');
  if (!select) return;
  select.innerHTML = Object.values(workflowPresets).map(preset => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)}${preset.mode === 'ai_app' && !preset.configured ? ' · 待配置' : ''}</option>`).join('');
  select.value = selectedWorkflow;
  const preset = workflowPresets[selectedWorkflow];
  const config = getWorkflowConfig(selectedWorkflow);
  const availability = preset.mode === 'ai_app' ? (preset.configured ? `可用 · ${preset.estimated_cost}` : '实例尚未由管理员绑定') : '高级模式';
  document.querySelector('#workflow-summary').innerHTML = `<span class="provider-badge">${escapeHtml(preset.badge)}</span><strong>${escapeHtml(preset.name)}</strong><p>${escapeHtml(preset.description)} · ${escapeHtml(availability)}</p>`;
  document.querySelector('#workflow-config-title').textContent = `绑定 ${preset.name} 工作流`;
  document.querySelector('#rh-workflow-id').value = config.workflow_id || '';
  document.querySelector('#rh-prompt-node').value = config.prompt_node_id || '';
  document.querySelector('#rh-prompt-field').value = config.prompt_field || 'text';
  document.querySelector('#rh-image-node').value = config.image_node_id || '';
  document.querySelector('#rh-image-field').value = config.image_field || 'image';
  document.querySelector('#rh-access-password').value = '';
  const details = document.querySelector('#workflow-config');
  details.classList.toggle('hidden', preset.mode !== 'workflow');
  details.open = preset.mode === 'workflow' && (!config.workflow_id || !config.prompt_node_id);
  updateGenerationStudio();
}

async function openConnections() {
  try { await loadProviders(); dialog.showModal(); } catch (error) { notify(error.message); }
}

document.querySelector('#connections-open').addEventListener('click', openConnections);
document.querySelector('#connections-close').addEventListener('click', () => dialog.close());
document.addEventListener('click', event => { if (event.target.closest('[data-open-connections]')) openConnections(); });
document.addEventListener('change', event => {
  if (event.target.id === 'video-generator') {
    selectedWorkflow = event.target.value;
    updateWorkflowPreset();
  }
  if (event.target.id === 'first-frame') {
    const file = event.target.files[0];
    if (!file) { firstFrameDataUrl = null; document.querySelector('#frame-name').textContent = '未上传首帧：文本直出'; updateGenerationStudio(); return; }
    if (file.size > 10 * 1024 * 1024) { notify('首帧图片不能超过 10 MB'); event.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => { firstFrameDataUrl = reader.result; document.querySelector('#frame-name').textContent = `${file.name} · 首帧引导`; updateGenerationStudio(); };
    reader.readAsDataURL(file);
  }
});
document.addEventListener('input', event => {
  if (event.target.id === 'video-script-prompt') updateGenerationStudio();
  if (event.target.closest('#workflow-config') && event.target.id !== 'rh-access-password') {
    saveVisibleWorkflowConfig();
    updateGenerationStudio();
  }
});
document.addEventListener('click', event => {
  if (event.target.closest('[data-view-sample]')) document.querySelector('.result-player')?.scrollIntoView({behavior:'smooth', block:'center'});
  if (event.target.closest('[data-open-workflow-config]')) {
    const details = document.querySelector('#workflow-config');
    details.open = true;
    details.scrollIntoView({behavior:'smooth', block:'center'});
    setTimeout(() => (!document.querySelector('#rh-workflow-id').value ? document.querySelector('#rh-workflow-id') : document.querySelector('#rh-prompt-node')).focus(), 350);
  }
  if (event.target.closest('[data-submit-runninghub]')) submitRunningHub();
  const resume = event.target.closest('[data-resume-job]');
  if (resume) resumeJob(decodeURIComponent(resume.dataset.resumeJob), resume.dataset.provider, resume);
});

document.addEventListener('submit', async event => {
  const feedbackForm = event.target.closest('.feedback-form');
  if (!feedbackForm) return;
  event.preventDefault();
  const button = feedbackForm.querySelector('button[type="submit"]');
  const data = new FormData(feedbackForm);
  button.disabled = true;
  button.textContent = '提交中';
  try {
    const response = await fetch('/api/feedback', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        job_id:decodeURIComponent(feedbackForm.dataset.jobId),
        provider:feedbackForm.dataset.provider,
        rating:Number(data.get('rating')),
        reason:data.get('reason'),
        comment:data.get('comment'),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '评价提交失败');
    feedbackForm.outerHTML = '<p class="feedback-thanks"><strong>已记录</strong><span>这条评价会用于改进提示词和 AI 实例推荐。</span></p>';
  } catch (error) {
    button.disabled = false;
    button.textContent = '提交评价';
    notify(error.message);
  }
});

document.querySelector('#clear-jobs').addEventListener('click', () => {
  if (!window.confirm('只会清除当前浏览器中的任务记录，不会取消 RunningHub 上的任务。确定清空吗？')) return;
  localStorage.removeItem(jobHistoryKey);
  renderJobHistory();
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

async function submitRunningHub() {
  if (!currentPack) return;
  if (currentPack.quality_report?.status !== 'passed') { notify('质量门禁未通过，请重新生成并检查失败项'); return; }
  const preset = workflowPresets[selectedWorkflow];
  const customMode = preset.mode === 'workflow';
  const workflowId = document.querySelector('#rh-workflow-id').value.trim();
  const promptNodeId = document.querySelector('#rh-prompt-node').value.trim();
  const imageNodeId = document.querySelector('#rh-image-node').value.trim();
  if (customMode && (!workflowId || !promptNodeId)) { notify('请填写工作流 ID 和提示词节点 ID'); return; }
  if (customMode && firstFrameDataUrl && !imageNodeId) { notify('上传首帧后需要填写图片节点 ID'); return; }
  if (!customMode && !preset.configured) { notify('所选 AI 实例尚未配置'); return; }
  if (!customMode && firstFrameDataUrl && !preset.supports_image) { notify('所选 AI 实例不支持首帧输入'); return; }
  if (customMode) saveWorkflowConfig(selectedWorkflow, {
    workflow_id:workflowId, prompt_node_id:promptNodeId,
    prompt_field:document.querySelector('#rh-prompt-field').value.trim() || 'text',
    image_node_id:imageNodeId, image_field:document.querySelector('#rh-image-field').value.trim() || 'image',
  });
  if (!window.confirm(`将使用你的 RunningHub 账户额度运行 ${preset.name}。费用以 RunningHub 实际结算为准，是否确认提交？`)) return;
  const action = document.querySelector('[data-submit-runninghub]');
  const status = document.querySelector('#video-job-status');
  action.disabled = true;
  status.classList.remove('hidden');
  status.innerHTML = `<strong>正在准备${customMode ? '工作流' : ' AI 实例'}</strong><span>正在上传素材并创建付费任务，请勿重复点击。</span>`;
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
    const finalPrompt = document.querySelector('#video-script-prompt').value.trim();
    if (!finalPrompt) throw new Error('请先确认或填写最终视频脚本');
    const response = await fetch('/api/video-jobs', {
      method:'POST', headers:{'Content-Type':'application/json', 'Idempotency-Key':crypto.randomUUID(), ...providerHeaders('runninghub')},
      body:JSON.stringify({
        provider:'runninghub', generation_mode:customMode ? 'workflow' : 'ai_app', instance_id:customMode ? undefined : selectedWorkflow,
        workflow_preset:selectedWorkflow, confirm_paid:true, workflow_id:customMode ? workflowId : undefined, prompt:finalPrompt,
        duration:currentPack.constraint_report?.duration_seconds, ratio:'16:9',
        prompt_node_id:promptNodeId, prompt_field:document.querySelector('#rh-prompt-field').value.trim() || 'text',
        image_node_id:imageNodeId, image_field:document.querySelector('#rh-image-field').value.trim() || 'image',
        uploaded_file_name:uploadedFileName, access_password:customMode ? document.querySelector('#rh-access-password').value : undefined,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '视频生成任务提交失败');
    showJob(result.job);
    saveJob(result.job);
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
  const presetName = job.model || workflowPresets[job.workflow_preset || selectedWorkflow]?.name || 'RunningHub 任务';
  const detail = job.provider === 'runninghub'
    ? `${escapeHtml(presetName)} · RunningHub · ${job.generation_mode === 'ai_app' ? 'AI 实例' : '自定义工作流'}`
    : `MiniMax H3 · ${job.duration || '-'} 秒 · ${job.ratio || '-'} · ${job.input_mode === 'first_frame' ? '首帧引导' : '文本直出'}`;
  status.innerHTML = `<strong>${labels[job.status] || escapeHtml(job.status)}</strong><span>${job.error ? escapeHtml(job.error) : detail}</span>`;
  saveJob(job);
  if (['succeeded','failed','cancelled','expired'].includes(job.status)) {
    const submit = document.querySelector('[data-submit-runninghub]');
    if (submit) submit.disabled = false;
  }
  if (job.video_url) {
    const providerName = job.provider === 'runninghub' ? 'RunningHub' : 'MiniMax';
    document.querySelector('.result-player').innerHTML = `<video controls autoplay playsinline><source src="${escapeHtml(job.video_url)}" type="video/mp4"></video><div class="result-details"><p><strong>本次生成结果</strong><br>${providerName} 已返回真实生成结果，可直接播放或下载。</p><a class="secondary action-link" href="${escapeHtml(job.video_url)}" target="_blank" rel="noreferrer">下载或打开成片</a><form class="feedback-form" data-job-id="${encodeURIComponent(job.id)}" data-provider="${escapeHtml(job.provider)}"><fieldset><legend>这支成片满意吗？</legend><div class="rating-options">${[1,2,3,4,5].map(value => `<label><input type="radio" name="rating" value="${value}" ${value === 4 ? 'checked' : ''}><span>${value}</span></label>`).join('')}</div></fieldset><label>主要问题<select name="reason"><option value="satisfied">整体满意</option><option value="prompt_fit">与创意不符</option><option value="quality">画面质量</option><option value="consistency">角色不一致</option><option value="speed">生成太慢</option><option value="other">其他</option></select></label><label>补充说明<input name="comment" maxlength="300" placeholder="可选，请勿填写联系方式"></label><button class="secondary" type="submit">提交评价</button></form></div>`;
  }
}

function pollJob(jobId, provider, trigger = null) {
  const pollKey = `${provider}:${jobId}`;
  if (activePolls.has(pollKey)) return;
  let attempts = 0;
  const run = async () => {
    try {
      const response = await fetch(`/api/video-jobs/${encodeURIComponent(jobId)}?provider=${encodeURIComponent(provider)}`, {headers:providerHeaders(provider)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '查询失败');
      saveJob(result.job);
      if (document.querySelector('#video-job-status')) showJob(result.job);
      if (['succeeded','failed','cancelled','expired'].includes(result.job.status)) {
        clearInterval(activePolls.get(pollKey));
        activePolls.delete(pollKey);
        if (trigger) trigger.disabled = false;
      }
    } catch (error) {
      clearInterval(activePolls.get(pollKey));
      activePolls.delete(pollKey);
      if (trigger) trigger.disabled = false;
      const target = document.querySelector('#video-job-status');
      if (target) target.innerHTML = `<strong>查询暂停</strong><span>${escapeHtml(error.message)}，任务记录仍保留，可稍后恢复。</span>`;
    }
    attempts += 1;
    if (attempts >= 180 && activePolls.has(pollKey)) {
      clearInterval(activePolls.get(pollKey));
      activePolls.delete(pollKey);
      const existing = getJobHistory().find(item => item.id === jobId && item.provider === provider);
      if (existing) saveJob({...existing, status:'timeout', error:'自动查询已在 30 分钟后暂停，可手动恢复。'});
      if (trigger) trigger.disabled = false;
    }
  };
  activePolls.set(pollKey, setInterval(run, 10000));
  run();
}

function resumeJob(jobId, provider, trigger) {
  if (!getConnection(provider)) {
    notify('请先重新连接 RunningHub，API Key 不会跨标签页保存');
    openConnections();
    return;
  }
  trigger.disabled = true;
  trigger.textContent = '查询中';
  pollJob(jobId, provider, trigger);
}

restoreCreatorDraft();
renderJobHistory();
initializeService();
