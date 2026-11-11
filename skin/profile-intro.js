import {stageLabel} from "./stage-labels.js?v=0.2.35";
import {guardDismissClick} from './dismiss-guard.js?v=0.2.35';

const numeric = value => value === null || value === undefined || value === '' || typeof value === 'boolean' || !Number.isFinite(Number(value)) ? null : Number(value);
const format = value => numeric(value) === null ? '—' : String(Math.round(Number(value) * 100) / 100);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const words = (language, zh, en) => language === 'zh' ? zh : en;

// This is a read-only description of the loaded workflow, never a recipe editor.
export function profileIntroModel(workflow = {}, language = 'zh') {
  const p = workflow?.profile ?? {}, context = workflow?.context ?? {};
  const steps = Array.isArray(p.steps) ? p.steps.filter(s => s && typeof s === 'object') : [];
  const dose = numeric(context.targetDoseWeight);
  const target = numeric(context.targetYield ?? p.target_weight);
  const notes = typeof p.notes === 'string' ? p.notes.trim() : '';
  const stages = steps.map((s, index) => {
    const kind = ['pressure', 'flow'].includes(s.pump) ? s.pump : null;
    const seconds = numeric(s.seconds);
    const weight = numeric(s.weight);
    const limit = numeric(s.limiter?.value);
    return {index, name: typeof s.name === 'string' && s.name.trim() ? stageLabel(s.name,language) : words(language, `阶段 ${index + 1}`, `Stage ${index + 1}`),
      kind, value: kind ? numeric(s[kind]) : null,
      seconds: seconds !== null && seconds >= 0 ? seconds : null,
      weight: weight !== null && weight > 0 ? weight : null,
      limit: kind && limit !== null && limit > 0 ? limit : null,
      temperature: numeric(s.temperature), sensor: s.sensor,
      exit: s.exit && typeof s.exit === 'object' ? s.exit : null};
  });
  let description = notes;
  if (!description) {
    if (stages.length === 2 && stages[0].kind === 'pressure' && stages[1].kind === 'flow') {
      description = words(language, '前段以压力控制，后段转为流量控制。', 'Pressure control first, followed by flow control.');
    } else description = words(language, stages.length ? '按下方分段目标运行。' : '此方案没有可显示的分段数据。', stages.length ? 'The stage settings are shown below.' : 'Stage data is not available for this profile.');
  }
  return {title: typeof p.title === 'string' && p.title.trim() ? p.title : words(language, '未命名方案', 'Untitled profile'),
    dose, target, ratio: dose > 0 && target > 0 ? target / dose : null, description, stages};
}

export function profileIntroChart(stages = [], language = 'zh') {
  const text = (zh, en) => words(language, zh, en);
  if (!stages.length || stages.some(s => s.seconds === null) || !stages.some(s => s.seconds > 0)) {
    return `<p class="intro-chart-note">${text('缺少分段时长，无法绘制时间预览。', 'A time preview is unavailable because stage durations are missing.')}</p>`;
  }
  const total = stages.reduce((sum, s) => sum + s.seconds, 0), L = 35, R = 580, T = 20, B = 155;
  const peak = Math.max(12, ...stages.flatMap(s => [s.value ?? 0, s.limit ?? 0]));
  const ceiling = Math.ceil(peak / 4) * 4;
  const x = time => L + time / total * (R - L), y = v => B - v / ceiling * (B - T);
  let svg = `<svg viewBox="0 0 600 190" role="img" aria-label="${text('方案分段目标预览', 'Profile stage targets')}"><g fill="none" stroke="#9eafba" stroke-width=".8"><path d="M${L} ${T}V${B}H${R}"/>`;
  for (let i = 0; i <= 3; i++) {const v = ceiling * i / 3; svg += `<path d="M${L} ${y(v)}H${R}" stroke-opacity=".25"/><text x="25" y="${y(v) + 4}" text-anchor="end" fill="#526c7e" stroke="none" font-size="12">${format(v)}</text>`;}
  svg += '</g>';
  let elapsed = 0;
  for (const s of stages) {
    if (s.kind) for (const kind of ['pressure', 'flow']) {
      const target = s.kind === kind, value = target ? s.value : s.limit;
      if (value === null) continue;
      svg += `<path d="M${x(elapsed)} ${y(value)}H${x(elapsed + s.seconds)}" fill="none" stroke="${kind === 'pressure' ? 'var(--green)' : 'var(--blue)'}" stroke-width="2.5" ${target ? '' : 'stroke-dasharray="5 4"'}/>`;
    }
    // Show individual start labels only when they can remain legible.
    if (stages.length <= 5) svg += `<text x="${x(elapsed)}" y="176" text-anchor="middle" font-size="12" fill="#526c7e">${format(elapsed)}</text>`;
    elapsed += s.seconds;
  }
  return svg + `<text x="${R}" y="176" text-anchor="end" font-size="12" fill="#526c7e">${format(total)} s</text><text x="35" y="11" font-size="11" fill="#526c7e">bar / mL/s</text></svg>`;
}

function exitText(exit, language) {
  if (!exit) return '';
  const field = {pressure:['压力','Pressure','bar'], flow:['流量','Flow','mL/s']}[exit.type];
  const condition = {over:['高于','above'], under:['低于','below']}[exit.condition];
  if (!field || !condition || numeric(exit.value) === null) return words(language, '切段条件未识别', 'Unrecognized exit condition');
  const i = language === 'zh' ? 0 : 1;
  return language === 'zh' ? `${field[i]} ${condition[i]} ${format(exit.value)} ${field[2]} 切段` : `Exit when ${field[1].toLowerCase()} is ${condition[1]} ${format(exit.value)} ${field[2]}`;
}

export function profileIntroMarkup(workflow, language = 'zh') {
  const m = profileIntroModel(workflow, language), text = (zh, en) => words(language, zh, en);
  return `<header><div class="intro-brand"></div><h2>${text('方案介绍','About this profile')}</h2><small>${text('当前方案','Current profile')}</small></header><div class="prototype-intro-main"><section class="prototype-intro-summary"><small>${text('当前方案','Current profile')}</small><h1>${escape(m.title)}</h1><p>${escape(m.description)}</p><div class="prototype-intro-values"><div><strong>${format(m.dose)}</strong><small> g</small><span>${text('粉量','Dose')}</span></div><div><strong>${format(m.target)}</strong><small> g</small><span>${text('目标出液','Target yield')}</span></div><div><strong>${m.ratio === null ? '—' : '1:' + format(m.ratio)}</strong><span>${text('粉液比','Ratio')}</span></div></div></section><section class="prototype-intro-targets"><div class="intro-target-visual"><h3>${text('分段目标','Stage targets')}</h3>${profileIntroChart(m.stages, language)}${m.stages.length ? `<p class="intro-chart-note">${text('压力','Pressure')}　<span style="color:var(--green)">━</span>　${text('流量','Flow')}　<span style="color:var(--blue)">━</span>　${text('虚线为上限 · 按最大时长预览','Dashed: limits · maximum stage durations')}</p>` : ''}</div><div class="prototype-intro-steps">${m.stages.map(s => {
    const kind = s.kind === 'pressure' ? text('压力','Pressure') : s.kind === 'flow' ? text('流量','Flow') : text('控制模式未识别','Unknown control mode');
    const unit = s.kind === 'pressure' ? 'bar' : s.kind === 'flow' ? 'mL/s' : '';
    const details = [`${kind} ${format(s.value)} ${unit}`, `${text('最多','Up to')} ${format(s.seconds)} s`];
    if (s.weight !== null) details.push(`${format(s.weight)} g ${text('提前切段','exit weight')}`);
    const extra = [];
    if (s.limit !== null) extra.push(`${s.kind === 'pressure' ? text('流量上限','Flow limit') : text('压力上限','Pressure limit')} ${format(s.limit)} ${s.kind === 'pressure' ? 'mL/s' : 'bar'}`);
    if (s.exit) extra.push(exitText(s.exit, language));
    if (s.sensor === 'water' || s.sensor === 'coffee') extra.push(s.sensor === 'water' ? text('水温探头','Water sensor') : text('咖啡探头','Coffee sensor'));
    return `<article class="prototype-intro-step"><b>${s.index + 1}</b><div><h4>${escape(s.name)}</h4><p>${escape(details.join(' · '))}${extra.length ? '<br>' + escape(extra.join(' · ')) : ''}</p></div><strong>${format(s.temperature)} °C</strong></article>`;
  }).join('')}</div></section></div><footer><button type="button" data-intro-back>‹　${text('返回','Back')}</button><button type="button" data-intro-adjust class="button primary">${text('微调这杯','Adjust this cup')}</button></footer>`;
}

export function mountProfileIntro(api) {
  const doc = globalThis.document, s = api.state, trigger = doc.getElementById('recipeName');
  let screen = null, snapshot = null, endpoint = null, language = null;
  let referenceRequest = 0;
  const running = () => Boolean(api.isRunning?.() ?? api.running?.());
  const workflow = () => api.getWorkflow?.() ?? s.workflow;
  const key = () => JSON.stringify(workflow() ?? null);
  const editable = () => typeof api.editable === 'function' ? api.editable() : Boolean(s.connection?.connected && s.connection?.machineConnected && !s.connection?.stale && s.workflow && !running() && !s.busy && !s.awaiting && !s.workflowConflict);
  function close({restoreFocus = true, render = true} = {}) {
    if (!screen) return;
    referenceRequest++;
    screen.hidden = true; screen = null;
    doc.removeEventListener('keydown', onKey, true);
    if (s.modal === 'profileIntroDialog') s.modal = null;
    if (restoreFocus && trigger?.isConnected) trigger.focus();
    if (render) api.render?.();
  }
  function onKey(event) {
    if (!screen) return;
    if (event.key === 'Escape') {event.preventDefault(); event.stopImmediatePropagation(); close(); return;}
    if (event.key !== 'Tab') return;
    const focusable = [...screen.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')].filter(el => !el.hidden);
    const first = focusable[0], last = focusable.at(-1);
    if (!first) {event.preventDefault(); return;}
    if (!screen.contains(doc.activeElement) || event.shiftKey && doc.activeElement === first) {event.preventDefault(); (event.shiftKey ? last : first).focus();}
    else if (!event.shiftKey && doc.activeElement === last) {event.preventDefault(); first.focus();}
  }
  async function showReferenceShot(activeScreen, activeWorkflow, activeClient) {
    if (!activeClient?.history || !activeClient?.shot || !api.renderIntroShot) return;
    const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
    const signature = profile => JSON.stringify(canonical({steps:profile?.steps, target_weight:profile?.target_weight, target_volume:profile?.target_volume}));
    const request = ++referenceRequest;
    const expected = signature(activeWorkflow.profile);
    const expectedWorkflow = JSON.stringify(activeWorkflow);
    try {
      const sameWorkflow = workflow => {
        const a = activeWorkflow.context, b = workflow?.context;
        return workflow?.profile?.title === activeWorkflow.profile.title &&
          signature(workflow.profile) === expected &&
          numeric(a?.targetDoseWeight) !== null &&
          numeric(a?.targetYield) !== null &&
          numeric(a.targetDoseWeight) === numeric(b?.targetDoseWeight) &&
          numeric(a.targetYield) === numeric(b?.targetYield);
      };
      const seen = new Set();
      let offset = 0, match = null;
      // Three recent pages cover 150 shots before falling back to stage targets.
      for (let page = 0; page < 3; page++) {
        const history = await activeClient.history(offset, 50);
        if (request !== referenceRequest || screen !== activeScreen || screen.hidden || key() !== expectedWorkflow || api.client !== activeClient || running()) return;
        if (!Array.isArray(history) || !history.length) return;
        match = history.find(shot => shot.id && !seen.has(shot.id) && sameWorkflow(shot.workflow));
        if (match) break;
        let added = 0;
        for (const shot of history) if (shot.id && !seen.has(shot.id)) { seen.add(shot.id); added++; }
        if (history.length < 50 || !added) return;
        offset += history.length;
      }
      if (!match) return;
      const shot = await activeClient.shot(match.id);
      if (request !== referenceRequest || screen !== activeScreen || screen.hidden || key() !== expectedWorkflow || api.client !== activeClient || running()) return;
      if (!sameWorkflow(shot.workflow) || !Array.isArray(shot.measurements)) return;
      const container = screen.querySelector('.intro-reference-chart');
      if (!container) return;
      container.hidden = false;
      if (!api.renderIntroShot(container.querySelector('svg'), shot)) { container.hidden = true; return; }
      const targetVisual = screen.querySelector('.intro-target-visual');
      if (targetVisual) targetVisual.hidden = true;
      const label = container.querySelector('p');
      const stamp = new Date(shot.timestamp);
      label.textContent = words(language, '参考实测 · ', 'Reference shot · ') + (Number.isNaN(stamp.getTime()) ? '' : stamp.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US'));
    } catch { /* Keep the stage-target preview available when history is unavailable. */ }
  }
  function open() {
    if (screen || running() || s.modal || doc.body.dataset.ceramicScreen !== 'ready' || !workflow()?.profile) return;
    snapshot = key(); endpoint = api.client; language = s.language;
    screen = doc.getElementById('profileIntroDialog') || doc.createElement('section'); screen.hidden = false; screen.id = 'profileIntroDialog'; screen.className = 'overlay prototype-intro';
    screen.setAttribute('role', 'dialog'); screen.setAttribute('aria-modal', 'true'); screen.setAttribute('aria-label', words(language, '方案介绍','About this profile'));
    screen.innerHTML = profileIntroMarkup(workflow(), language);
    if (api.renderIntroShot && api.client?.history) {
      const target = screen.querySelector('.prototype-intro-targets');
      target?.insertAdjacentHTML('afterbegin', `<div class="intro-reference-chart" hidden><h3>${words(language,'实际出杯曲线','Actual shot')}</h3><svg aria-label="${words(language,'参考实测曲线','Reference shot chart')}"></svg><p class="intro-chart-note"></p><p class="intro-chart-note">${words(language,'绿色：压力 · 蓝色：流量 · 粉色：温度 · 棕色：杯流 · 紫色：杯重','Green: pressure · Blue: flow · Pink: temperature · Brown: cup flow · Purple: weight')}</p></div>`);
      showReferenceShot(screen, workflow(), endpoint);
    }
    const brand = doc.querySelector('.topbar .brand');
    if (brand) {const clone = brand.cloneNode(true); clone.removeAttribute('id'); clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id')); screen.querySelector('.intro-brand').replaceWith(clone);}
    screen.querySelector('[data-intro-back]').onclick = event => {guardDismissClick(event); close();};
    screen.querySelector('[data-intro-adjust]').onclick = event => {if (!editable()) return;guardDismissClick(event);close({restoreFocus:false,render:false});doc.getElementById('ceramicAdjust')?.click();};
    screen.querySelector('[data-intro-adjust]').disabled = !editable();
    doc.body.append(screen); doc.addEventListener('keydown', onKey, true);
    api.openDialog('profileIntroDialog');
    screen?.querySelector('[data-intro-back]')?.focus();
  }
  function render() {
    trigger?.setAttribute('aria-label', words(s.language,'查看当前方案介绍','About the current profile'));
    if (!screen) return;
    if (running() || doc.body.dataset.ceramicScreen !== 'ready' || key() !== snapshot || api.client !== endpoint || language !== s.language || s.modal !== 'profileIntroDialog' || screen.hidden) {close({restoreFocus:false,render:false}); return;}
    screen.querySelector('[data-intro-adjust]').disabled = !editable();
  }
  trigger?.addEventListener('click', open);
  render();
  return {open, render, close, destroy() {close({render:false});trigger?.removeEventListener('click',open);}};
}
