const form = document.querySelector('#creator-form');
const workspace = document.querySelector('#workspace');
const toast = document.querySelector('#toast');
let currentPack = null;
let pendingCreatorPayload = null;
let providerState = {providers: [], connected: [], secure_context: false};
let selectedWorkflow = 'rh-seedance-25-text';
let firstFrameDataUrl = null;
let sessionState = null;
let authMode = 'login';
const activePolls = new Map();
const connectionKey = provider => `open-niulai:${provider}:connection`;
const accountScope = () => sessionState?.user?.id || 'guest';
const workflowConfigKey = preset => `open-niulai:${accountScope()}:runninghub:workflow:${preset}`;
const jobHistoryKey = () => `open-niulai:${accountScope()}:video-jobs`;
const creatorDraftKey = () => `open-niulai:${accountScope()}:creator-draft`;
const packDraftKey = () => `open-niulai:${accountScope()}:last-pack`;
const currentPackSchema = '0.2.0';
let workflowPresets = {
  'minimax-h3-style': {id:'minimax-h3-style', name:'MiniMax H3 · 风格参考生成', badge:'风格优先', description:'仅企业共享 API Key 可调用。', supports_image:true, configured:false, mode:'standard_model', uses_builtin_style_reference:true, availability_reason:'消费级 Key 不可用'},
  'minimax-h3': {id:'minimax-h3', name:'MiniMax H3 成片实例', badge:'快速出片', description:'适合文本直出、首帧引导和带声音的短片。', supports_image:true, configured:false, mode:'ai_app'},
  'seedance': {id:'seedance', name:'Seedance 成片实例', badge:'高质量', description:'适合强调镜头表现、角色一致性和参考素材的视频。', supports_image:true, configured:false, mode:'ai_app'},
};

function getConnection(provider) {
  try {
    const connection = JSON.parse(sessionStorage.getItem(connectionKey(provider)) || 'null');
    if (provider === 'seedance' && /^apikey-/i.test(String(connection?.api_key || ''))) return null;
    return connection;
  }
  catch { return null; }
}

function providerHeaders(provider) {
  const connection = getConnection(provider);
  return connection ? {'X-Provider-Key': connection.api_key, 'X-Provider-Region': connection.region || 'cn', ...(connection.model_id ? {'X-Provider-Model':connection.model_id} : {})} : {};
}

function scriptProviderHeaders(provider) {
  const connection = getConnection(provider);
  return connection ? {'X-Script-Provider-Key': connection.api_key} : {};
}

function getWorkflowConfig(preset) {
  try { return JSON.parse(localStorage.getItem(workflowConfigKey(preset)) || '{}'); }
  catch { return {}; }
}

function saveWorkflowConfig(preset, config) {
  localStorage.setItem(workflowConfigKey(preset), JSON.stringify(config));
}

function getJobHistory() {
  try { return JSON.parse(localStorage.getItem(jobHistoryKey()) || '[]').slice(0, 20); }
  catch { return []; }
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch { return null; }
}

function friendlyJobError(error) {
  const message = String(error || '');
  if (message === '工作流运行失败') return 'RunningHub AI 应用实例运行失败。';
  if (/RunningHub 805|APIKEY_TASK_STATUS_ERROR/.test(message)) return '该任务由另一把 RunningHub API Key 创建，当前 Key 无法查询；请移除此记录并新建实例任务。';
  if (/API key format is incorrect/i.test(message)) return '火山方舟 API Key 格式错误：应复制 API Key 列中的真实密钥，不要复制 apikey- 开头的资源 ID。';
  return message;
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
  localStorage.setItem(jobHistoryKey(), JSON.stringify(jobs));
  renderJobHistory();
}

function renderJobHistory() {
  const jobs = getJobHistory();
  const section = document.querySelector('#recent-jobs');
  section.classList.toggle('hidden', jobs.length === 0);
  document.querySelector('#job-history').innerHTML = jobs.map(job => {
    const preset = ['ai_app','dynamic_ai_app'].includes(job.generation_mode) ? job.model : workflowPresets[job.workflow_preset]?.name || job.model;
    const date = new Date(job.created_at * 1000).toLocaleString('zh-CN', {hour12:false});
    const state = {queued:'排队中', running:'生成中', succeeded:'已完成', failed:'失败', cancelled:'已取消', expired:'已过期', timeout:'查询已暂停'}[job.status] || job.status;
    const action = job.video_url
      ? `<a class="secondary" href="${escapeHtml(job.video_url)}" target="_blank" rel="noreferrer">打开成片</a>`
      : job.status === 'failed'
        ? `<button class="secondary" type="button" data-remove-job="${encodeURIComponent(job.id)}" data-provider="${escapeHtml(job.provider)}">移除失败记录</button>`
        : `<button class="secondary" type="button" data-resume-job="${encodeURIComponent(job.id)}" data-provider="${escapeHtml(job.provider)}">恢复查询</button>`;
    const failure = job.error ? `<p class="history-error">${escapeHtml(friendlyJobError(job.error))}</p>` : '';
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
    updateAccountUI();
    if (sessionState.authenticated) loadAccountWorkspace();
  } catch {
    status.classList.add('error');
    status.lastChild.textContent = '服务连接异常';
  }
}

function updateAccountUI() {
  const accountButton = document.querySelector('#account-open');
  if (!accountButton) return;
  accountButton.textContent = sessionState?.authenticated ? sessionState.user.email : '注册 / 登录';
}

function loadAccountWorkspace() {
  form.reset();
  currentPack = null;
  pendingCreatorPayload = null;
  workspace.classList.add('hidden');
  document.querySelector('#script-candidates').classList.add('hidden');
  restoreCreatorDraft();
  updateCreatorAction();
  renderJobHistory();
}

function requireAccount() {
  if (sessionState?.authenticated) return true;
  openAccount();
  notify('请先注册或登录');
  return false;
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
  localStorage.setItem(packDraftKey(), JSON.stringify(pack));
  document.querySelector('#result-title').textContent = pack.title;
  document.querySelector('#result-hook').textContent = pack.hook;
  const design = pack.story_design || {};
  document.querySelector('#tab-story').innerHTML = `${qualityMarkup(pack.quality_report)}<div class="story-blueprint"><div><span>核心任务</span><strong>${escapeHtml(design.mission || pack.hook)}</strong></div><div><span>重复台词</span><strong>${escapeHtml(design.repeated_line || '')}</strong></div><div><span>最后揭示</span><strong>${escapeHtml(design.reveal || '')}</strong></div></div><div class="story-grid">${pack.script.map((beat, index) => `
    <article class="beat editable-beat" data-beat-index="${index}"><time>${escapeHtml(beat.time)} · 镜头 ${String(index + 1).padStart(2, '0')}</time><label>画面动作<textarea class="beat-action" maxlength="300">${escapeHtml(beat.action)}</textarea></label><label>字幕或台词<input class="beat-subtitle" maxlength="100" value="${escapeHtml(beat.subtitle)}"></label></article>`).join('')}</div><div class="story-confirm"><div><strong>先把故事定下来</strong><span>修改动作和台词不会调用大模型，也不会消耗模型额度。</span></div><button class="primary" type="button" data-apply-story><span>确认脚本，进入视频</span><b>→</b></button></div>`;

  const visualLabels = {poster_scam:'宣传海报', broken_footage_still:'崩坏首帧', character_reference:'角色设定', meme_reaction:'反应特写'};
  document.querySelector('#tab-visual').innerHTML = `<div class="prompt-grid">${Object.entries(pack.image_prompts).map(([key, text]) => `
    <article class="prompt-card">${copyButton(text)}<span>图像提示词</span><h3>${visualLabels[key] || key}</h3><p>${escapeHtml(text)}</p></article>`).join('')}</div>`;

  const shot = pack.video_shots[0];
  document.querySelector('#tab-video').innerHTML = `<section class="generation-studio" aria-labelledby="generation-title"><div class="generation-copy"><span class="provider-badge">第 1 步 · 脚本已就绪</span><h3 id="generation-title">确认脚本，直接生成视频</h3><p id="generation-account-note">选择已经调试好的 RunningHub AI 实例，系统会自动填入脚本和素材。</p></div><div class="frame-source"><label class="frame-upload"><span>第 2 步 · 画面控制</span><input id="first-frame" type="file" accept="image/png,image/jpeg,image/webp"><b id="frame-name">上传实际首帧</b><small>首帧模式会从这张图开始生成，并继承人物、构图与场景；写实照片会继续生成写实画面。</small></label><button class="style-reference" type="button" data-use-style-reference><img src="${escapeHtml(pack.style_profile?.reference_asset || '/style/original-lowpoly-office-reference-v1.png')}" alt="原创粗粝低模参考图"><span>作为实际首帧使用，会继承人物与构图</span></button></div><label class="model-select"><span>第 3 步 · 视频模型</span><select id="video-generator" aria-label="选择 RunningHub 视频模型"></select></label><div id="generation-action"></div><label class="script-review"><span>确认或修改最终视频提示词</span><textarea id="video-script-prompt" maxlength="7000">${escapeHtml(shot.motion_prompt)}</textarea><small>纯文生只能提高风格命中概率；首帧模式会继承图片内容；多模态参考模式可要求只借鉴风格，但仍可能带入部分构图。</small></label><div id="workflow-summary" class="workflow-summary"></div><ol id="generation-readiness" class="generation-readiness" aria-label="生成准备状态"></ol><details id="workflow-config" class="workflow-config hidden"><summary>高级：使用自定义工作流</summary><div class="advanced-workflow"><div><span class="provider-badge">专业模式</span><h4 id="workflow-config-title">绑定 RunningHub 工作流</h4></div><label>工作流 ID<input id="rh-workflow-id" inputmode="numeric" placeholder="从 RunningHub API 调用页复制"></label><label>提示词节点 ID<input id="rh-prompt-node" placeholder="例如 6"></label><label>提示词字段<input id="rh-prompt-field" value="text"></label><label>图片节点 ID（上传首帧时必填）<input id="rh-image-node" placeholder="例如 12"></label><label>图片字段<input id="rh-image-field" value="image"></label><label>访问密码（可选，不保存）<input id="rh-access-password" type="password" autocomplete="off"></label><p>仅自定义工作流需要这些信息。图片节点通常代表实际首帧，不应当作纯风格参考；具体语义以工作流作者定义为准。</p></div></details><div id="video-job-status" class="job-status hidden" role="status"></div></section><div class="mode-note"><strong>脚本与画面分层</strong><span>千问或 DeepSeek 负责故事多样性；Open NiuLai 固定风格和分镜约束；RunningHub 视频模型负责生成视频。</span></div><div class="video-result"><div class="video-prompt"><pre>${escapeHtml(shot.motion_prompt)}</pre><aside class="video-meta"><dl>
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
  showTab('story');
  if (scroll) requestAnimationFrame(() => document.querySelector('.workspace-head').scrollIntoView({behavior:'smooth', block:'start'}));
}

function showTab(name) {
  document.querySelectorAll('.tabs button, .tab-view').forEach(node => node.classList.remove('active'));
  document.querySelector(`[data-tab="${name}"]`)?.classList.add('active');
  document.querySelector(`#tab-${name}`)?.classList.add('active');
}

async function createPack(payload, scriptDraft = null) {
  const response = await fetch('/api/packs', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...payload, script_draft:scriptDraft}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '制作方案生成失败');
  document.querySelector('#script-candidates').classList.add('hidden');
  render(result.pack);
}

function renderScriptCandidates(result) {
  const section = document.querySelector('#script-candidates');
  document.querySelector('#script-model-note').textContent = `${result.provider === 'qwen' ? '通义千问' : 'DeepSeek'} · ${result.model}`;
  document.querySelector('#candidate-list').innerHTML = result.candidates.map((draft, index) => `<article class="candidate-card">
    <div><span>方案 ${String(index + 1).padStart(2, '0')}</span><h3>${escapeHtml(draft.title)}</h3><p>${escapeHtml(draft.premise)}</p></div>
    <dl><div><dt>任务</dt><dd>${escapeHtml(draft.mission)}</dd></div><div><dt>阻碍</dt><dd>${escapeHtml(draft.obstacle)}</dd></div><div><dt>重复台词</dt><dd>${escapeHtml(draft.repeated_line)}</dd></div><div><dt>揭示</dt><dd>${escapeHtml(draft.reveal)}</dd></div></dl>
    <button class="primary" type="button" data-script-draft="${encodeURIComponent(JSON.stringify(draft))}"><span>使用这个脚本</span><b>→</b></button>
  </article>`).join('');
  section.classList.remove('hidden');
  section.scrollIntoView({behavior:'smooth', block:'start'});
}

function saveCreatorDraft() {
  const values = Object.fromEntries(new FormData(form));
  localStorage.setItem(creatorDraftKey(), JSON.stringify(values));
}

function restoreCreatorDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(creatorDraftKey()) || 'null');
    if (draft) Object.entries(draft).forEach(([name, value]) => {
      const field = form.elements.namedItem(name);
      if (field && typeof value === 'string') field.value = value;
    });
    const pack = JSON.parse(localStorage.getItem(packDraftKey()) || 'null');
    if (pack?.schema_version === currentPackSchema && pack?.title && Array.isArray(pack.script) && Array.isArray(pack.video_shots)) render(pack, {scroll:false});
    else if (pack) localStorage.removeItem(packDraftKey());
  } catch {
    localStorage.removeItem(creatorDraftKey());
    localStorage.removeItem(packDraftKey());
  }
}

function updateCreatorAction() {
  const provider = new FormData(form).get('script_provider') || 'local';
  const label = form.querySelector('button[type="submit"] span');
  if (label && !form.querySelector('button[type="submit"]').disabled) {
    label.textContent = provider === 'local' ? '生成制作方案' : '智能生成 3 个脚本';
  }
}

let draftTimer = null;
form.addEventListener('input', () => {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveCreatorDraft, 250);
});
form.addEventListener('change', saveCreatorDraft);
form.addEventListener('change', updateCreatorAction);

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!requireAccount()) return;
  const button = form.querySelector('.primary');
  button.disabled = true;
  button.querySelector('span').textContent = '正在构思…';
  const data = Object.fromEntries(new FormData(form));
  data.duration = Number(data.duration);
  try {
    pendingCreatorPayload = data;
    if (data.script_provider === 'local') {
      await createPack(data);
    } else {
      const connection = getConnection(data.script_provider);
      if (!connection) {
        await openConnections();
        throw new Error(`请先连接${data.script_provider === 'qwen' ? '通义千问' : ' DeepSeek'}脚本账户`);
      }
      const response = await fetch('/api/script-drafts', {
        method:'POST', headers:{'Content-Type':'application/json', ...scriptProviderHeaders(data.script_provider)}, body:JSON.stringify({...data, provider:data.script_provider}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '候选脚本生成失败');
      renderScriptCandidates(result);
    }
    saveCreatorDraft();
  } catch (error) {
    notify(error.message);
  } finally {
    button.disabled = false;
    updateCreatorAction();
  }
});

document.querySelector('#candidate-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-script-draft]');
  if (!button || !pendingCreatorPayload) return;
  button.disabled = true;
  button.querySelector('span').textContent = '正在整理…';
  try {
    const draft = JSON.parse(decodeURIComponent(button.dataset.scriptDraft));
    await createPack(pendingCreatorPayload, draft);
  } catch (error) {
    button.disabled = false;
    button.querySelector('span').textContent = '使用这个脚本';
    notify(error.message);
  }
});

document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {
  const values = {
    prompt:button.dataset.example, subject:button.dataset.subject, template:button.dataset.template,
    tone:button.dataset.tone, style_strength:button.dataset.strength,
    required_line:button.dataset.line, duration:button.dataset.duration,
  };
  Object.entries(values).forEach(([name, value]) => {
    const field = form.elements.namedItem(name);
    if (field && value) field.value = value;
  });
  saveCreatorDraft();
  notify(`已填入“${button.textContent.trim()}”完整预设`);
}));

document.querySelector('.tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-tab]');
  if (!button) return;
  showTab(button.dataset.tab);
});

workspace.addEventListener('click', async event => {
  const styleReference = event.target.closest('[data-use-style-reference]');
  if (styleReference) {
    styleReference.disabled = true;
    try {
      const response = await fetch(styleReference.querySelector('img').src);
      if (!response.ok) throw new Error('内置参考图加载失败');
      const blob = await response.blob();
      firstFrameDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('参考图读取失败'));
        reader.readAsDataURL(blob);
      });
      document.querySelector('#first-frame').value = '';
      document.querySelector('#frame-name').textContent = '已选择内置原创低模图作为实际首帧';
      styleReference.classList.add('selected');
      updateGenerationStudio();
      notify('已使用内置原创参考图');
    } catch (error) { notify(error.message); }
    finally { styleReference.disabled = false; }
    return;
  }
  const confirmStory = event.target.closest('[data-apply-story]');
  if (confirmStory && currentPack) {
    confirmStory.disabled = true;
    confirmStory.querySelector('span').textContent = '正在编译…';
    const shots = [...document.querySelectorAll('.editable-beat')].map((item, index) => ({
      beat:['hook','conflict','reveal'][index],
      action:item.querySelector('.beat-action').value.trim(),
      subtitle:item.querySelector('.beat-subtitle').value.trim(),
    }));
    if (shots.some(shot => !shot.action)) {
      confirmStory.disabled = false;
      confirmStory.querySelector('span').textContent = '确认脚本，进入视频';
      notify('每个镜头都需要一个可见动作');
      return;
    }
    const design = currentPack.story_design || {};
    const draft = {title:currentPack.title, premise:design.premise || currentPack.source.prompt, hook:currentPack.hook, mission:design.mission, obstacle:design.obstacle, repeated_line:design.repeated_line, reveal:design.reveal, shots};
    try {
      await createPack({...currentPack.source, script_provider:currentPack.source.script_provider || 'local'}, draft);
      showTab('video');
      document.querySelector('.generation-studio').scrollIntoView({behavior:'smooth', block:'start'});
    } catch (error) {
      confirmStory.disabled = false;
      confirmStory.querySelector('span').textContent = '确认脚本，进入视频';
      notify(error.message);
    }
    return;
  }
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
const accountDialog = document.querySelector('#account-dialog');

function renderAccountDialog() {
  const authenticated = Boolean(sessionState?.authenticated);
  document.querySelector('#account-guest').classList.toggle('hidden', authenticated);
  document.querySelector('#account-user').classList.toggle('hidden', !authenticated);
  document.querySelector('#account-email').textContent = sessionState?.user?.email || '';
}

function openAccount() {
  renderAccountDialog();
  accountDialog.showModal();
}

function setAuthMode(mode) {
  authMode = mode === 'register' ? 'register' : 'login';
  document.querySelectorAll('[data-auth-mode]').forEach(button => button.classList.toggle('active', button.dataset.authMode === authMode));
  const password = document.querySelector('#account-form [name="password"]');
  password.autocomplete = authMode === 'register' ? 'new-password' : 'current-password';
  document.querySelector('#account-form button span').textContent = authMode === 'register' ? '创建账户' : '登录';
  document.querySelector('#account-title').textContent = authMode === 'register' ? '注册 Open NiuLai' : '登录 Open NiuLai';
}

document.querySelector('#account-open').addEventListener('click', openAccount);
document.querySelector('#account-close').addEventListener('click', () => accountDialog.close());
document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));
document.querySelector('#account-form').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(event.currentTarget));
  submit.disabled = true;
  try {
    const response = await fetch(`/api/auth/${authMode}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '账户操作失败');
    sessionState = {...sessionState, ...result};
    updateAccountUI();
    loadAccountWorkspace();
    renderAccountDialog();
    notify(authMode === 'register' ? '账户创建成功' : '登录成功');
  } catch (error) {
    notify(error.message);
  } finally {
    submit.disabled = false;
  }
});
document.querySelector('#account-logout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', {method:'POST'});
  sessionStorage.clear();
  sessionState = {...sessionState, authenticated:false, user:null};
  updateAccountUI();
  loadAccountWorkspace();
  renderAccountDialog();
  setAuthMode('login');
  await loadProviders();
  notify('已退出登录');
});

async function loadProviders() {
  const response = await fetch('/api/providers');
  providerState = await response.json();
  providerState.connected = providerState.providers.filter(item => getConnection(item.id)).map(item => item.id);
  const notice = document.querySelector('#security-notice');
  notice.classList.toggle('hidden', providerState.secure_context && providerState.generation_ready !== false);
  notice.textContent = !providerState.secure_context
    ? '当前站点使用 HTTP，为防止凭证泄露，API Key 连接已禁用。配置 HTTPS 后自动开放。'
    : providerState.generation_ready === false ? '站点正在配置签名会话、任务存储和限流，完成前不会接收 API Key 或付费任务。' : '';
  document.querySelector('#provider-list').innerHTML = providerState.providers.filter(item => ['qwen','deepseek','minimax','runninghub','seedance'].includes(item.id)).map(item => {
    const connected = providerState.connected.includes(item.id);
    const connectionReady = providerState.secure_context && (item.capability === 'script' || providerState.generation_ready !== false);
    const badge = connected ? '已临时连接' : !providerState.secure_context ? 'HTTPS 后可连接' : !connectionReady ? '服务配置中' : 'API Key';
    let action = '';
    if (connected) action = `<button type="button" class="secondary" data-disconnect="${item.id}">断开</button>`;
    else if (item.connection === 'api_key' && connectionReady) action = `<form class="key-form ${item.id === 'seedance' ? 'seedance-key-form' : ''}" data-provider="${item.id}"><input name="api_key" type="password" autocomplete="off" required minlength="12" placeholder="${escapeHtml(item.name)} API Key">${item.id === 'minimax' ? '<select name="region" aria-label="MiniMax API 区域"><option value="cn">中国站</option><option value="global">国际站</option></select>' : ''}${item.id === 'seedance' ? '<input name="model_id" required minlength="6" aria-label="Seedance 模型 ID" placeholder="Seedance 模型 ID" value="doubao-seedance-1-5-pro-251215">' : ''}<button class="secondary" type="submit">${item.id === 'seedance' ? '验证并连接' : '连接'}</button></form>`;
    else if (item.account_url) action = `<a class="secondary action-link" href="${item.account_url}" target="_blank" rel="noreferrer">前往平台 ↗</a>`;
    const purpose = item.capability === 'script' ? '用于生成三个不同脚本候选，不参与视频扣费。' : item.id === 'minimax' ? '直接调用 MiniMax 官方 H3 API，费用从你的 MiniMax 账户扣除。' : item.id === 'seedance' ? '直接调用火山方舟视频生成 API，需要 API Key 和已开通的 Seedance 模型 ID。' : '用于提交视频生成任务，费用从你的 RunningHub 账户扣除。';
    return `<article class="provider-row"><div><span class="provider-badge">${badge}</span><h3>${escapeHtml(item.name)}</h3><p>${purpose} 凭证不写入磁盘。</p></div>${action}</article>`;
  }).join('');
  updateGenerationStudio();
}

async function loadVideoInstances() {
  const response = await fetch('/api/video-instances');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'AI 实例目录加载失败');
  workflowPresets = Object.fromEntries(result.instances.map(instance => [instance.id, {...instance, mode:instance.mode || 'ai_app'}]));
  workflowPresets['official-minimax-h3'] = {id:'official-minimax-h3', name:'MiniMax H3 · 官方 API', badge:'官方直连', description:'直接调用 MiniMax 官方多模态视频 API，不经过 RunningHub。', supports_image:true, configured:true, mode:'official_api', provider:'minimax', estimated_cost:'按 MiniMax 官方账户实际用量结算'};
  workflowPresets['official-seedance'] = {id:'official-seedance', name:'Seedance · 火山方舟官方 API', badge:'官方直连', description:'直接调用火山方舟视频生成 API，不经过 RunningHub。', supports_image:true, configured:true, mode:'official_api', provider:'seedance', estimated_cost:'按火山方舟账户实际用量结算'};
  if (!workflowPresets[selectedWorkflow] || !workflowPresets[selectedWorkflow].configured) {
    selectedWorkflow = workflowPresets['rh-seedance-25-text'] ? 'rh-seedance-25-text' : Object.keys(workflowPresets).find(id => workflowPresets[id].configured) || 'official-seedance';
  }
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
  const preset = workflowPresets[selectedWorkflow] || workflowPresets.custom;
  const providerId = preset.provider || 'runninghub';
  const item = providerState.providers.find(provider => provider.id === providerId);
  if (!item) return;
  const connected = providerState.connected.includes(item.id);
  const config = currentWorkflowConfig();
  const customMode = preset.mode === 'workflow';
  const standardStyleMode = preset.mode === 'standard_model';
  const serviceReady = providerState.secure_context && providerState.generation_ready !== false;
  const qualityReady = currentPack?.quality_report?.status === 'passed';
  const scriptReady = Boolean(document.querySelector('#video-script-prompt')?.value.trim());
  const workflowReady = Boolean(config.workflow_id && config.prompt_node_id);
  const generatorReady = customMode ? workflowReady : Boolean(preset.configured);
  const inputReady = standardStyleMode || (preset.requires_image ? Boolean(firstFrameDataUrl) : !firstFrameDataUrl || (customMode ? Boolean(config.image_node_id) : Boolean(preset.supports_image)));
  const note = document.querySelector('#generation-account-note');
  const styleMode = standardStyleMode ? '风格优先：自动使用原创低模参考图' : firstFrameDataUrl && preset.supports_image ? '风格优先：首帧会锁定造型' : '仅靠文字：画风可能被模型自动美化';
  note.textContent = customMode
    ? `${preset.name} 将使用你的节点配置运行。${firstFrameDataUrl ? '已提供首帧，请确认图片节点有效。' : '未提供首帧，画风不稳定。'}`
    : `${preset.name} · ${styleMode}。费用从${providerId === 'minimax' ? ' MiniMax 官方' : providerId === 'seedance' ? '火山方舟' : ' RunningHub'}账户扣除。`;
  const checks = [
    {done:qualityReady, label:'质量门禁', detail:qualityReady ? `规则验证 ${currentPack.quality_report.score}/100` : '请重新生成并修正失败项'},
    {done:scriptReady, label:'视频脚本', detail:scriptReady ? '已确认，可继续修改' : '请填写最终视频脚本'},
    {done:serviceReady && connected, label:'模型账户', detail:!serviceReady ? '服务尚未开放付费任务' : connected ? `${item.name} 已临时连接` : `需要连接 ${item.name}`},
    {done:generatorReady, label:customMode ? '工作流绑定' : '视频通道', detail:generatorReady ? `${preset.name} 已就绪` : customMode ? '填写工作流 ID 与提示词节点' : '该实例等待管理员绑定'},
    {done:inputReady, label:'画面输入', detail:standardStyleMode ? '原创低模参考图将自动附带' : firstFrameDataUrl ? (inputReady ? (preset.requires_image ? '将同时填入首帧和尾帧进行稳定性验收' : '风格首帧已就绪') : customMode ? '还需填写图片节点 ID' : '该实例不接受首帧') : (preset.requires_image ? '该候选要求先上传一张低模首帧' : preset.supports_image ? '建议添加低模首帧锁定画风' : '纯文生视频，画风不稳定')},
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
  else if (!inputReady) action.innerHTML = `<button class="primary" type="button" disabled><span>${preset.requires_image ? '请先上传低模首帧' : '该实例不支持首帧'}</span><b>·</b></button>`;
  else action.innerHTML = '<button class="primary" type="button" data-submit-runninghub><span>确认费用并生成</span><b>→</b></button>';
}

function updateWorkflowPreset() {
  const select = document.querySelector('#video-generator');
  if (!select) return;
  const availablePresets = Object.values(workflowPresets).filter(preset => preset.configured && preset.mode !== 'workflow');
  select.innerHTML = availablePresets.map(preset => {
    const channel = ['ai_app','dynamic_ai_app'].includes(preset.mode) ? ' · RunningHub AI 实例' : '';
    return `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)}${escapeHtml(channel)}</option>`;
  }).join('');
  select.value = selectedWorkflow;
  const preset = workflowPresets[selectedWorkflow];
  const config = getWorkflowConfig(selectedWorkflow);
  const availability = preset.mode !== 'workflow' ? (preset.configured ? `可用 · ${preset.estimated_cost}` : preset.availability_reason || '平台尚未接入') : '高级模式';
  const styleFit = preset.uses_builtin_style_reference ? '风格适配：强制附带原创参考图' : preset.supports_image ? '风格适配：可用首帧锁定' : '风格适配：较弱，仅靠文字可能写实化';
  document.querySelector('#workflow-summary').innerHTML = `<span class="provider-badge">${escapeHtml(preset.badge)}</span><strong>${escapeHtml(preset.name)}</strong><p>${escapeHtml(preset.description)} · ${escapeHtml(styleFit)} · ${escapeHtml(availability)}</p>`;
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
  const referenceButton = document.querySelector('[data-use-style-reference]');
  const referenceLabel = referenceButton?.querySelector('span');
  if (referenceButton) referenceButton.disabled = !preset.supports_image || !preset.configured;
  if (referenceLabel) referenceLabel.textContent = preset.mode === 'standard_model'
    ? '仅作风格参考，不复制主体'
    : '作为实际首帧使用，会继承人物与构图';
  updateGenerationStudio();
}

async function openConnections() {
  if (!requireAccount()) return;
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
    if (!file) { firstFrameDataUrl = null; document.querySelector('#frame-name').textContent = '上传实际首帧'; updateGenerationStudio(); return; }
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
  const remove = event.target.closest('[data-remove-job]');
  if (remove) {
    const id = decodeURIComponent(remove.dataset.removeJob);
    const provider = remove.dataset.provider;
    localStorage.setItem(jobHistoryKey(), JSON.stringify(getJobHistory().filter(job => !(job.id === id && job.provider === provider))));
    renderJobHistory();
  }
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
  localStorage.removeItem(jobHistoryKey());
  renderJobHistory();
});

dialog.addEventListener('submit', async event => {
  const form = event.target.closest('.key-form');
  if (!form) return;
  event.preventDefault();
  const formData = new FormData(form);
  const apiKey = formData.get('api_key');
  const button = form.querySelector('button');
  const originalLabel = button.textContent;
  button.disabled = true;
  try {
    if (!apiKey || apiKey.length < 12) throw new Error('API Key 格式无效');
    if (form.dataset.provider === 'seedance' && /^apikey-/i.test(apiKey)) {
      throw new Error('这里应填写 API Key 列中的真实密钥，不是 apikey- 开头的资源 ID');
    }
    const connection = {api_key:apiKey, region:formData.get('region') || 'cn', model_id:formData.get('model_id') || ''};
    if (form.dataset.provider === 'seedance') {
      button.textContent = '验证中';
      const verification = await fetch('/api/providers/verify', {
        method:'POST',
        headers:{'X-Provider-Id':'seedance', 'X-Provider-Key':connection.api_key, 'X-Provider-Model':connection.model_id},
      });
      const result = await verification.json();
      if (!verification.ok) throw new Error(result.error || '火山方舟连接验证失败');
      if (result.model_available === false) {
        const choices = result.seedance_models?.length ? ` 当前 Key 可见：${result.seedance_models.join('、')}` : '';
        throw new Error(`API Key 有效，但未找到模型 ${connection.model_id}。请先开通该模型或更换模型 ID。${choices}`);
      }
    }
    sessionStorage.setItem(connectionKey(form.dataset.provider), JSON.stringify(connection));
    form.reset();
    await loadProviders();
    notify(form.dataset.provider === 'seedance' ? '火山方舟 API Key 与模型权限验证通过' : '模型账户已连接，仅保留在当前标签页');
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; button.textContent = originalLabel; }
});

dialog.addEventListener('click', async event => {
  const button = event.target.closest('[data-disconnect]');
  if (!button) return;
  sessionStorage.removeItem(connectionKey(button.dataset.disconnect));
  await loadProviders();
  notify('连接已断开');
});

async function submitRunningHub() {
  if (!requireAccount()) return;
  if (!currentPack) return;
  if (currentPack.quality_report?.status !== 'passed') { notify('质量门禁未通过，请重新生成并检查失败项'); return; }
  const preset = workflowPresets[selectedWorkflow];
  const providerId = preset.provider || 'runninghub';
  const providerLabel = providerId === 'minimax' ? 'MiniMax 官方' : providerId === 'seedance' ? '火山方舟' : 'RunningHub';
  const customMode = preset.mode === 'workflow';
  const standardStyleMode = preset.mode === 'standard_model';
  const workflowId = document.querySelector('#rh-workflow-id').value.trim();
  const promptNodeId = document.querySelector('#rh-prompt-node').value.trim();
  const imageNodeId = document.querySelector('#rh-image-node').value.trim();
  if (customMode && (!workflowId || !promptNodeId)) { notify('请填写工作流 ID 和提示词节点 ID'); return; }
  if (customMode && firstFrameDataUrl && !imageNodeId) { notify('上传首帧后需要填写图片节点 ID'); return; }
  if (!customMode && !preset.configured) { notify('所选 AI 实例尚未配置'); return; }
  if (!customMode && firstFrameDataUrl && !preset.supports_image) { notify('所选 AI 实例不支持首帧输入'); return; }
  if (preset.requires_image && !firstFrameDataUrl) { notify('该候选实例要求首帧和尾帧，请先上传一张低模首帧'); return; }
  if (customMode) saveWorkflowConfig(selectedWorkflow, {
    workflow_id:workflowId, prompt_node_id:promptNodeId,
    prompt_field:document.querySelector('#rh-prompt-field').value.trim() || 'text',
    image_node_id:imageNodeId, image_field:document.querySelector('#rh-image-field').value.trim() || 'image',
  });
  if (!window.confirm(`将使用你的${providerLabel}账户额度运行 ${preset.name}。费用以${providerLabel}实际结算为准，是否确认提交？`)) return;
  const action = document.querySelector('[data-submit-runninghub]');
  const status = document.querySelector('#video-job-status');
  action.disabled = true;
  status.classList.remove('hidden');
  status.innerHTML = `<strong>正在准备${customMode ? '工作流' : ' AI 实例'}</strong><span>正在上传素材并创建付费任务，请勿重复点击。</span>`;
  try {
    let uploadedFileName = null;
    if (providerId === 'runninghub' && firstFrameDataUrl && !standardStyleMode) {
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
      method:'POST', headers:{'Content-Type':'application/json', 'Idempotency-Key':crypto.randomUUID(), ...providerHeaders(providerId)},
      body:JSON.stringify({
        provider:providerId, generation_mode:customMode ? 'workflow' : 'ai_app', instance_id:customMode ? undefined : selectedWorkflow,
        workflow_preset:selectedWorkflow, confirm_paid:true, workflow_id:customMode ? workflowId : undefined, prompt:finalPrompt,
        duration:currentPack.constraint_report?.duration_seconds, ratio:'16:9',
        prompt_node_id:promptNodeId, prompt_field:document.querySelector('#rh-prompt-field').value.trim() || 'text',
        image_node_id:imageNodeId, image_field:document.querySelector('#rh-image-field').value.trim() || 'image',
        uploaded_file_name:uploadedFileName, first_frame_image:['minimax','seedance'].includes(providerId) ? firstFrameDataUrl : undefined,
        access_password:customMode ? document.querySelector('#rh-access-password').value : undefined,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '视频生成任务提交失败');
    showJob(result.job);
    saveJob(result.job);
    pollJob(result.job.id, providerId);
  } catch (error) {
    status.innerHTML = `<strong>提交失败</strong><span>${escapeHtml(friendlyJobError(error.message))}</span>`;
    action.disabled = false;
  }
}

function showJob(job) {
  const status = document.querySelector('#video-job-status');
  const labels = {queued:'排队中',running:'生成中',succeeded:'生成完成',failed:'生成失败',cancelled:'已取消',expired:'已过期',timeout:'查询暂停'};
  status.classList.remove('hidden');
  const presetName = job.model || workflowPresets[job.workflow_preset || selectedWorkflow]?.name || 'RunningHub 任务';
  const detail = job.provider === 'runninghub'
    ? `${escapeHtml(presetName)} · RunningHub · ${job.generation_mode === 'standard_model' ? '多模态标准模型' : ['ai_app','dynamic_ai_app'].includes(job.generation_mode) ? 'AI 实例' : '自定义工作流'}`
    : `${job.provider === 'seedance' ? `Seedance · 火山方舟 · ${escapeHtml(presetName)}` : 'MiniMax H3'} · ${job.duration || '-'} 秒 · ${job.ratio || '-'} · ${job.input_mode === 'first_frame' ? '首帧引导' : '文本直出'}`;
  status.innerHTML = `<strong>${labels[job.status] || escapeHtml(job.status)}</strong><span>${job.error ? escapeHtml(friendlyJobError(job.error)) : detail}</span>`;
  saveJob(job);
  if (['succeeded','failed','cancelled','expired'].includes(job.status)) {
    const submit = document.querySelector('[data-submit-runninghub]');
    if (submit) submit.disabled = false;
  }
  if (job.video_url) {
    const providerName = job.provider === 'runninghub' ? 'RunningHub' : job.provider === 'seedance' ? 'Seedance · 火山方舟' : 'MiniMax';
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
      if (target) target.innerHTML = `<strong>查询暂停</strong><span>${escapeHtml(friendlyJobError(error.message))}</span>`;
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
    const providerName = provider === 'minimax' ? ' MiniMax' : provider === 'seedance' ? ' Seedance · 火山方舟' : ' RunningHub';
    notify(`请先重新连接${providerName}，API Key 不会跨标签页保存`);
    openConnections();
    return;
  }
  trigger.disabled = true;
  trigger.textContent = '查询中';
  pollJob(jobId, provider, trigger);
}

restoreCreatorDraft();
updateCreatorAction();
renderJobHistory();
initializeService();
