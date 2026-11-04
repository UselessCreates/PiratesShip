import { makeLogoRenderer } from './logo.js';
import { artFromFile, parseArtHtml } from './art.js';

const $ = (id) => document.getElementById(id);
const TOKEN =
  new URLSearchParams(location.search).get('t') ||
  ((document.cookie.match(/(?:^|;\s*)ps_token=([^;]+)/) || [])[1] || '');

const api = {
  async req(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: {
        'x-ps-token': TOKEN,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `${method} ${path} failed (${res.status})`);
    return data;
  },
  get: (p) => api.req('GET', p),
  post: (p, b) => api.req('POST', p, b || {}),
  del: (p) => api.req('DELETE', p),
};

const S = {
  state: null,
  step: 0,
  wizardMode: 'first',
  checks: [],
  group: 'cloud',
  providerId: null,
  model: '',
  key: '',
  baseUrl: '',
  extra: {},
  theme: 'dark',
  target: 'site',
  url: '',
  art: null,
  ship: null,
  jobId: null,
  awaiting: false,
  busy: false,
  lastResult: null,
  logoScreen: null,
  logoWizard: null,
  stream: null,
};

function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyTheme(theme) {
  S.theme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = S.theme;
  document.body.dataset.theme = S.theme;
  if (S.logoScreen) S.logoScreen.setDark(S.theme === 'dark');
  if (S.logoWizard) S.logoWizard.setDark(S.theme === 'dark');
}

function fmtBytes(n) {
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

function showView(which) {
  $('wizard').hidden = which !== 'wizard';
  $('main').hidden = which !== 'main';
  if (which === 'main') {
    requestAnimationFrame(() => {
      if (!S.logoScreen) {
        S.logoScreen = makeLogoRenderer($('logo'), { dark: S.theme === 'dark' });
        S.logoScreen.setArt(S.art);
        S.logoScreen.setImage(S.ship);
      } else {
        S.logoScreen.setArt(S.art);
        S.logoScreen.setImage(S.ship);
      }
      $('input').focus();
    });
  } else if (!S.logoWizard) {
    requestAnimationFrame(() => {
      S.logoWizard = makeLogoRenderer($('wiz-logo'), { dark: S.theme === 'dark', maxWidth: 380 });
      S.logoWizard.setArt(S.art);
      S.logoWizard.setImage(S.ship);
    });
  } else {
    requestAnimationFrame(() => {
      if (!S.logoWizard) return;
      S.logoWizard.setArt(S.art);
      S.logoWizard.setImage(S.ship);
    });
  }
}

async function boot() {
  try {
    const state = await api.get('/api/state');
    S.state = state;
    S.target = state.target || 'site';
    S.providerId = state.model.id || 'none';
    S.model = state.model.model || '';
    S.theme = state.theme;
    applyTheme(state.theme);
    S.logoScreen = null;
    S.logoWizard = null;

    try {
      const art = await api.get('/api/art');
      S.art = art && art.cells && art.cells.length ? art : null;
    } catch {
      S.art = null;
    }

    if (!S.art) S.art = await loadBundledArt();
    S.ship = await loadLogoImage();

    if (!state.setupComplete) {
      openWizard(1, 'first');
    } else {

      let gate = [];
      try {
        const quick = await api.get('/api/setup/check?quick=1');
        gate = (quick.items || []).filter((i) => i.required && !i.ok);
        S.checks = gate;
      } catch {
        gate = [];
      }
      if (gate.length) {
        openWizard(1, 'repair');
      } else {
        renderMain();
        showView('main');
      }
    }
  } catch (e) {
    document.body.innerHTML = `<div style="max-width:560px;margin:12vh auto;padding:0 24px;font-family:ui-monospace,monospace;color:#e9e9ee">
      <h1 style="font-size:17px;margin:0 0 8px">PiratesShip cannot reach its engine</h1>
      <p style="color:#7d818e;font-size:13px;line-height:1.7;margin:0 0 18px">${escapeHtml(e.message)} — this window was probably left open after the app closed. Close it and start PiratesShip again.</p>
      <button onclick="location.reload()" style="font:inherit;font-size:13px;padding:8px 16px;border-radius:6px;border:0;background:#f5a97f;color:#17110d;cursor:pointer">retry</button>
    </div>`;
  }
}

async function loadBundledArt() {
  for (const name of ['assets/logo.html', 'assets/ascii-art.html']) {
    try {
      const res = await fetch(name, { cache: 'no-store' });
      if (!res.ok) continue;
      const text = await res.text();
      if (!/<span/i.test(text)) continue;
      const art = parseArtHtml(text);
      await api.post('/api/art', { art }).catch(() => {});
      return art;
    } catch {

    }
  }
  return null;
}

async function loadLogoImage() {
  for (const name of ['assets/ship.png', 'assets/logo.png']) {
    try {
      const img = new Image();
      img.src = name;
      await img.decode();
      if (img.naturalWidth) return img;
    } catch {

    }
  }
  return null;
}

function openWizard(step, mode) {
  S.step = step;
  S.wizardMode = mode || 'first';
  renderWizard();
  showView('wizard');
}

function renderWizard() {
  const steps = [...document.querySelectorAll('.step')];
  steps.forEach((btn) => {
    const n = Number(btn.dataset.step);
    btn.setAttribute('aria-current', String(n === S.step));
    btn.dataset.done = String(n < S.step);
    btn.disabled = n > S.step && S.wizardMode === 'first';
  });
  $('wiz-hint').textContent =
    S.wizardMode === 'first'
      ? `step ${S.step} of 3`
      : S.wizardMode === 'repair'
        ? S.step === 1
          ? 'startup check · fix what is missing'
          : 'optional extras'
        : S.step === 3
          ? 'appearance'
          : 'change your model';
  $('wiz-back').textContent = S.step === 1 ? (S.wizardMode === 'repair' ? 'later' : 'close') : 'back';
  $('wiz-back').style.visibility = S.step === 1 && S.wizardMode === 'first' ? 'hidden' : 'visible';
  $('wiz-next').textContent =
    S.step === 3
      ? S.wizardMode === 'first'
        ? 'finish'
        : 'done'
      : S.step === 1 && S.wizardMode === 'repair'
        ? 'continue'
        : 'next';

  const body = $('wiz-body');
  body.innerHTML = '';
  if (S.step === 1) renderStepChecks(body);
  if (S.step === 2) renderStepAi(body);
  if (S.step === 3) renderStepTheme(body);
}

function renderStepChecks(body) {
  const missing = (S.checks || []).filter((c) => c.required && !c.ok);
  const gate =
    S.wizardMode === 'repair'
      ? `<div class="gate"><b>startup check.</b> ${
          missing.length
            ? `${missing.map((m) => escapeHtml(m.label)).join(', ')} ${missing.length > 1 ? 'are' : 'is'} required and missing — a build would fail. Install below, or continue and try anyway.`
            : 're-checking what this machine needs before the first build.'
        }</div>`
      : '';
  body.innerHTML = `
    ${gate}
    <p class="lede">PiratesShip needs a runtime, a renderer and a network path out. Everything below is checked live.
    The engine already ships with <b>zero npm dependencies</b> — nothing is installed unless you ask for it.</p>
    <div id="check-list" class="wiz-body" style="gap:8px"></div>
    <div class="actions">
      <button class="btn ghost sm" id="recheck" type="button">re-check</button>
      <button class="btn ghost sm" id="install-missing" type="button">install missing</button>
    </div>
    <p class="note">Installs use <code>winget</code> (Node, Git, Ollama, WebView2) and <code>npm -g</code> (REA tooling from
    <a href="https://rea.tools/get-started" target="_blank" rel="noreferrer">rea.tools</a>). Your approval is required per package.</p>
  `;
  const list = $('check-list');
  list.innerHTML = '<p class="note">checking…</p>';
  $('recheck').addEventListener('click', () => loadChecks());
  $('install-missing').addEventListener('click', () => installMissing());
  loadChecks();
}

async function loadChecks() {
  const list = $('check-list');
  if (!list) return;
  try {
    const { items } = await api.get('/api/setup/check');
    S.checks = items;
    list.innerHTML = items
      .map((it) => {
        const pill = it.ok
          ? `<span class="pill ok">ready</span>`
          : `<span class="pill ${it.required ? 'req' : 'miss'}">${it.required ? 'missing' : 'optional'}</span>`;
        const actions = !it.ok && it.installable ? `<button class="btn ghost sm" data-install="${it.id}" type="button">install</button>` : '';
        return `<div class="row" data-check="${it.id}">
          <span class="name">${escapeHtml(it.label)}</span>
          <span class="detail">${escapeHtml(it.detail)}${it.note ? ` · <span style="opacity:.75">${escapeHtml(it.note)}</span>` : ''}</span>
          ${pill}
          <span class="row-actions">${actions}</span>
        </div>
        <div class="note" data-log="${it.id}" hidden></div>`;
      })
      .join('');
    list.querySelectorAll('[data-install]').forEach((btn) => {
      btn.addEventListener('click', () => runInstall(btn.dataset.install, btn));
    });
    const ready = items.filter((i) => i.required).every((i) => i.ok);
    $('wiz-next').disabled = false;
    $('wiz-hint').textContent =
      S.wizardMode === 'first'
        ? ready
          ? 'step 1 of 3 · all required checks pass'
          : 'step 1 of 3 · you can continue anyway'
        : S.wizardMode === 'repair'
          ? ready
            ? 'startup check · everything required is installed'
            : 'startup check · fix what is missing'
          : 'step 1 of 3';
  } catch (e) {
    list.innerHTML = `<p class="note" style="color:var(--err)">${escapeHtml(e.message)}</p>`;
  }
}

async function installMissing() {
  const missing = S.checks.filter((c) => !c.ok && c.installable);
  if (!missing.length) {
    toast('nothing to install');
    return;
  }

  for (const c of missing) await runInstall(c.id);
  await loadChecks();
}

async function runInstall(id, btn) {
  const logBox = document.querySelector(`[data-log="${id}"]`);
  if (logBox) {
    logBox.hidden = false;
    logBox.textContent = `installing ${id}…`;
  }
  if (btn) btn.disabled = true;
  try {
    const { jobId } = await api.post('/api/setup/install', { id });
    await new Promise((resolve) => {
      const close = streamJob(jobId, (evt) => {
        if (evt.type === 'log' && logBox) {
          logBox.textContent = `${logBox.textContent.split('\n').slice(-6).join('\n')}\n${evt.text}`.trim();
        }
        if (evt.type === 'done') {
          if (logBox) logBox.textContent = `✓ ${evt.message || `${id} installed`}`;
          close();
          resolve();
        }
        if (evt.type === 'error') {
          if (logBox) logBox.textContent = `✗ ${evt.message}`;
          close();
          resolve();
        }
      });
    });
    await loadChecks();
  } catch (e) {
    if (logBox) logBox.textContent = `✗ ${e.message}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function renderStepAi(body) {
  const catalog = S.state?.catalog || [];
  const groups = [
    { id: 'free', label: 'free / local' },
    { id: 'cloud', label: 'cloud' },
    { id: 'custom', label: 'custom' },
  ];

  if (!S.group || !groups.some((g) => g.id === S.group)) {
    const picked = catalog.find((p) => p.id === S.providerId) || catalog[0];
    S.group = picked ? picked.group : 'free';
  }
  const items = catalog.filter((p) => p.group === S.group);
  const provider = items.find((p) => p.id === S.providerId) || items[0] || null;
  if (provider && S.providerId !== provider.id) {
    S.providerId = provider.id;
    S.model = provider.models[0] || '';
    S.baseUrl = provider.baseUrl || '';
    S.extra = {};
  }

  body.innerHTML = `
    <p class="lede">Pick the brain. <b>${catalog.filter((p) => p.group === 'cloud').length} cloud presets</b>,
    <b>${catalog.filter((p) => p.group === 'free').length} key-free options</b>, or your own OpenAI-compatible endpoint.
    Keys are stored encrypted on this machine and only ever sent to the provider you pick.</p>
    <div class="tabs" role="tablist">
      ${groups
        .map(
          (g) => `<button class="tab" role="tab" data-group="${g.id}" aria-selected="${S.group === g.id}" type="button">${g.label}</button>`
        )
        .join('')}
    </div>
    <div class="ai-grid">
      <div class="pick-list" id="pick-list">
        ${items
          .map(
            (p) => `<button class="pick" data-pick="${p.id}" aria-pressed="${provider && provider.id === p.id}" type="button">
              <span>${escapeHtml(p.name)}</span>
              <em class="tag">${p.local ? 'local' : p.keyRequired ? 'key' : 'free'}</em>
            </button>`
          )
          .join('') || '<p class="note">nothing in this group</p>'}
      </div>
      <div id="provider-panel"></div>
    </div>
  `;

  body.querySelectorAll('[data-group]').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (S.group === tab.dataset.group) return;
      S.group = tab.dataset.group;
      const first = (S.state.catalog || []).find((p) => p.group === S.group) || null;
      if (first) {
        S.providerId = first.id;
        S.model = first.models[0] || '';
        S.baseUrl = first.baseUrl || '';
        S.extra = {};
        S.key = '';
      }

      renderWizard();
    });
  });
  body.querySelectorAll('[data-pick]').forEach((btn) => {
    btn.addEventListener('click', () => selectProvider(btn.dataset.pick, body));
  });

  renderProviderPanel(body, provider);
}

function selectProvider(id, body) {
  const p = (S.state.catalog || []).find((x) => x.id === id);
  if (!p) return;
  S.providerId = id;
  S.model = p.models[0] || '';
  S.baseUrl = p.baseUrl || '';
  S.extra = {};
  S.key = '';
  body.querySelectorAll('[data-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pick === id)));
  renderProviderPanel(body, p);
}

function renderProviderPanel(body, p) {
  const panel = body.querySelector('#provider-panel');
  if (!p) {
    panel.innerHTML = '<p class="note">choose a provider</p>';
    return;
  }
  const keyHidden = !p.keyRequired;
  panel.innerHTML = `
    <div class="card">
      <h4>${escapeHtml(p.name)}</h4>
      ${p.notes ? `<p>${escapeHtml(p.notes)}</p>` : ''}
      ${
        keyHidden
          ? ''
          : `<label class="field">api key
              <span class="inline">
                <input class="text" id="key-input" type="password" placeholder="paste it here" autocomplete="off" spellcheck="false" />
              </span>
            </label>
            <p class="note">${p.keyUrl ? `get one at <a href="${p.keyUrl}" target="_blank" rel="noreferrer">${escapeHtml(new URL(p.keyUrl).host)}</a> · ` : ''}stored locally, never logged.</p>`
      }
      ${
        p.models.length || p.dynamicModels
          ? `<label class="field">model
              <span class="inline">
                <input class="text" id="model-input" list="model-list" value="${escapeHtml(S.model || p.models[0] || '')}" spellcheck="false" />
                <button class="btn ghost sm" id="refresh-models" type="button">refresh</button>
              </span>
            </label>
            <datalist id="model-list">${p.models.map((m) => `<option value="${escapeHtml(m)}"></option>`).join('')}</datalist>
            <p class="note" id="model-hint">${
              p.dynamicModels ? 'loads every chat model this endpoint hosts — paste the key, then refresh' : ''
            }</p>`
          : ''
      }
      ${
        p.baseUrlEditable
          ? `<label class="field">base url<input class="text" id="base-input" value="${escapeHtml(S.baseUrl || '')}" spellcheck="false" /></label>`
          : ''
      }
      ${(p.extraFields || [])
        .map(
          (f) => `<label class="field">${escapeHtml(f.label)}
            <input class="text" data-extra="${escapeHtml(f.key)}" placeholder="${escapeHtml(f.placeholder || '')}" value="${escapeHtml(
              S.extra?.[f.key] || ''
            )}" spellcheck="false" /></label>`
        )
        .join('')}
      ${p.local ? localPanel(p) : ''}
      <div class="actions">
        <button class="btn ghost sm" id="test-btn" type="button">test connection</button>
        <span class="note" id="test-out"></span>
      </div>
    </div>
  `;

  const keyEl = panel.querySelector('#key-input');
  if (keyEl) {
    keyEl.value = S.key;
    keyEl.addEventListener('input', () => (S.key = keyEl.value));
  }
  const modelEl = panel.querySelector('#model-input');
  if (modelEl) {
    modelEl.addEventListener('input', () => (S.model = modelEl.value));
    modelEl.addEventListener('change', () => (S.model = modelEl.value));
  }
  const baseEl = panel.querySelector('#base-input');
  if (baseEl) {
    baseEl.addEventListener('input', () => {
      S.baseUrl = baseEl.value;
      if (baseEl.value.includes('/chat/completions')) baseEl.value = baseEl.value.replace(/\/chat\/completions.*$/, '');
    });
  }
  panel.querySelectorAll('[data-extra]').forEach((input) => {
    input.addEventListener('input', () => {
      S.extra = { ...S.extra, [input.dataset.extra]: input.value };
    });
  });

  const loadModels = async (quiet) => {
    const out = await api.get(
      `/api/provider/models?providerId=${encodeURIComponent(p.id)}&baseUrl=${encodeURIComponent(S.baseUrl || '')}${
        S.key ? `&key=${encodeURIComponent(S.key)}` : ''
      }`
    );
    const hint = panel.querySelector('#model-hint');
    const dl = panel.querySelector('#model-list');
    if (out.models?.length && dl) {
      dl.innerHTML = out.models.map((m) => `<option value="${escapeHtml(m)}"></option>`).join('');
      p.models = out.models;
      if (hint) hint.textContent = `${out.models.length} models · type to filter, or pick one from the list`;
      if (!quiet) toast(`${out.models.length} models available`);
      return true;
    }
    if (hint) hint.textContent = out.error || 'no models listed';
    if (!quiet) toast(out.error || 'no models listed');
    return false;
  };

  const refresh = panel.querySelector('#refresh-models');
  if (refresh) {
    refresh.addEventListener('click', async () => {
      refresh.disabled = true;
      refresh.textContent = '…';
      try {
        await loadModels(false);
      } catch (e) {
        toast(e.message);
      }
      refresh.disabled = false;
      refresh.textContent = 'refresh';
    });
  }
  if (p.dynamicModels) loadModels(true).catch(() => {});

  panel.querySelector('#test-btn').addEventListener('click', async () => {
    const out = panel.querySelector('#test-out');
    const btn = panel.querySelector('#test-btn');
    out.textContent = 'calling the provider…';
    out.style.color = 'var(--dim)';
    btn.disabled = true;
    try {
      const r = await api.post('/api/provider/test', {
        providerId: p.id,
        apiKey: S.key || undefined,
        model: S.model,
        baseUrl: S.baseUrl,
        extra: S.extra,
      });
      if (r.ok) {
        out.textContent = `✓ replied in ${r.ms}ms`;
        out.style.color = 'var(--ok)';
      } else {
        out.textContent = `✗ ${r.error}`;
        out.style.color = 'var(--err)';
      }
    } catch (e) {
      out.textContent = `✗ ${e.message}`;
      out.style.color = 'var(--err)';
    }
    btn.disabled = false;
  });

  if (p.local) wireLocalPanel(panel);
}

function localPanel(p) {
  return `<div class="note" id="local-box">checking local runtime…</div>`;
}

async function wireLocalPanel(panel) {
  const box = panel.querySelector('#local-box');
  if (!box) return;
  let snap;
  try {
    snap = await api.get('/api/local');
  } catch (e) {
    box.textContent = e.message;
    return;
  }
  const ol = snap.ollama;
  const installed = ol.models || [];
  box.innerHTML = `
    <div><span class="status-dot ${ol.running ? 'on' : ''}"></span>
      Ollama ${ol.installed ? escapeHtml(ol.installed) : 'not installed'} · ${ol.running ? 'running' : 'not running'}
      ${snap.lmstudio.running ? ' · LM Studio ready' : ''}
    </div>
    ${
      installed.length
        ? `<div style="margin-top:8px">installed: ${installed.map((m) => `<span class="pill">${escapeHtml(m.id)}</span>`).join(' ')}</div>`
        : ''
    }
    <div style="margin-top:8px">download a model:</div>
    <div class="actions">
      ${snap.recommended
        .map(
          (m) =>
            `<button class="btn ghost sm" data-pull="${escapeHtml(m.id)}" type="button" title="${escapeHtml(
              m.note || ''
            )}">${escapeHtml(m.label)} · ${m.size}</button>`
        )
        .join('')}
    </div>
    <div class="note" id="pull-log" style="margin-top:6px"></div>
  `;
  const pullLog = box.querySelector('#pull-log');
  box.querySelectorAll('[data-pull]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      pullLog.textContent = `pulling ${btn.dataset.pull}… this can take a while`;
      try {
        const { jobId } = await api.post('/api/local/pull', { model: btn.dataset.pull });
        const close = streamJob(jobId, (evt) => {
          if (evt.type === 'log') pullLog.textContent = evt.text;
          if (evt.type === 'done') {
            pullLog.textContent = `✓ ${btn.dataset.pull} ready — select it as the model`;
            S.model = btn.dataset.pull;
            const mEl = document.querySelector('#model-input');
            if (mEl) mEl.value = S.model;
            close();
          }
          if (evt.type === 'error') {
            pullLog.textContent = `✗ ${evt.message}`;
            close();
          }
        });
      } catch (e) {
        pullLog.textContent = `✗ ${e.message}`;
        btn.disabled = false;
      }
    });
  });
}

function renderStepTheme(body) {
  body.innerHTML = `
    <p class="lede">Last thing. Same interface, two moods — pick where you will be reading plans at 2am.</p>
    <div class="themes">
      <button class="theme-card" data-theme-pick="dark" aria-pressed="${S.theme === 'dark'}" type="button">
        <div class="theme-preview pv-dark"><i class="bar"></i><i></i><i style="width:80%"></i><i style="width:60%"></i></div>
        <div class="theme-label">bright off · dark</div>
      </button>
      <button class="theme-card" data-theme-pick="light" aria-pressed="${S.theme === 'light'}" type="button">
        <div class="theme-preview pv-light"><i class="bar"></i><i></i><i style="width:80%"></i><i style="width:60%"></i></div>
        <div class="theme-label">bright on · light</div>
      </button>
    </div>
    <p class="note">Change it any time with <code>/theme</code>.</p>
    <p class="note">Logo: the ship is drawn from the bundled artwork and recoloured to match the theme. Drop your own
    <code>ascii-art.html</code> anywhere in this window to use it instead.</p>
  `;
  body.querySelectorAll('[data-theme-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.themePick);
      body.querySelectorAll('[data-theme-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      api.post('/api/theme', { theme: S.theme }).catch(() => {});
    });
  });
}

async function wizardNext() {
  if (S.step === 1) {
    if (S.wizardMode === 'repair') {
      renderMain();
      showView('main');
      return;
    }
    openWizard(2, S.wizardMode);
    return;
  }
  if (S.step === 2) {
    const p = (S.state.catalog || []).find((x) => x.id === S.providerId);
    try {
      await api.post('/api/provider/select', {
        providerId: S.providerId,
        model: S.model,
        baseUrl: S.baseUrl,
        extra: S.extra,
        apiKey: S.key || undefined,
      });
      S.state = await api.get('/api/state');
      if (p && p.keyRequired && !S.key && !S.state.model.hasKey) {
        toast('saved — add a key before your first build');
      }
    } catch (e) {
      toast(e.message);
      return;
    }
    openWizard(3, S.wizardMode);
    return;
  }

  try {
    await api.post('/api/setup/complete', { theme: S.theme, target: S.target });
    S.state = await api.get('/api/state');
    S.logoScreen = null;
    S.logoWizard = null;
    renderMain();
    showView('main');
    toast(S.wizardMode === 'first' ? 'ready. tell me what to recreate.' : 'saved');
  } catch (e) {
    toast(e.message);
  }
}

function wizardBack() {
  if (S.step === 1) {
    if (S.wizardMode === 'repair' || S.wizardMode === 'edit') {
      renderMain();
      showView('main');
      return;
    }
    openWizard(2, 'first');
    return;
  }
  openWizard(S.step - 1, S.wizardMode);
}

function renderMain() {
  const label = S.state?.model?.label || 'no model';
  $('model-chip').textContent = label;
  $('model-chip').classList.toggle('ready', Boolean(S.state?.model?.ready));
  $('modelline').textContent = label;
  $('ver').textContent = `v${S.state?.version || '0.1.0'}`;
  document.querySelectorAll('[data-kind]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.kind === S.target))
  );
  $('cmds').innerHTML = [
    ['/help', 'show help'],
    ['/new', 'start a new session'],
    ['/clear', 'wipe the screen · /clear history forgets the build list'],
    ['/model', 'model dropdown · switch model or add a key'],
    ['/target site|app|game|other', 'what you are rebuilding'],
    ['/theme', 'switch theme'],
    ['/open', 'open the last build folder'],
    ['/discord', 'join the discord'],
    ['/exit', 'exit the app'],
  ]
    .map(([c, d]) => `<div class="cmd-row"><b><span class="k">/</span>${c.replace(/^\//, '')}</b><span>${d}</span></div>`)
    .join('');
  $('hintline').textContent = 'enter send · /help for commands';
}

function modelMenuOpen() {
  return !$('model-menu').hidden;
}

function closeModelMenu() {
  $('model-menu').hidden = true;
  $('model-chip').setAttribute('aria-expanded', 'false');
}

function toggleModelMenu() {
  if (modelMenuOpen()) {
    closeModelMenu();
    return;
  }
  renderModelMenu();
  $('model-menu').hidden = false;
  $('model-chip').setAttribute('aria-expanded', 'true');
}

function menuGroups() {
  return [
    { id: 'free', label: 'free', hint: 'no key, no cost' },
    { id: 'cloud', label: 'provider', hint: 'bring your own key' },
    { id: 'custom', label: 'custom', hint: 'your endpoint' },
  ];
}

function renderModelMenu() {
  const menu = $('model-menu');
  if (!menu) return;
  const catalog = S.state?.catalog || [];
  const keyed = S.state?.keyed || [];
  const currentId = S.state?.model?.id || 'none';
  const current = catalog.find((p) => p.id === currentId) || null;

  const columns = menuGroups()
    .map((g) => {
      const items = catalog.filter((p) => p.group === g.id);
      const rows = items
        .map((p) => {
          const needsKey = p.keyRequired && !keyed.includes(p.id);
          const tag = p.local ? 'local' : needsKey ? 'key' : 'ready';
          return `<button class="mm-item" data-mm-pick="${p.id}" aria-pressed="${p.id === currentId}" type="button" title="${escapeHtml(
            p.notes || p.name
          )}">
            <span class="mm-name">${escapeHtml(p.name)}</span>
            <em class="mm-tag ${needsKey ? 'needs' : ''}">${tag}</em>
          </button>`;
        })
        .join('');
      return `<div class="mm-col">
        <div class="mm-head"><b>${g.label}</b><em>${g.hint}</em></div>
        <div class="mm-list">${rows || '<p class="note">nothing here</p>'}</div>
      </div>`;
    })
    .join('');

  const needsKey = Boolean(current && current.keyRequired && !keyed.includes(currentId));
  const models = current?.models || [];
  const activeModel = S.state?.model?.model || models[0] || '';
  menu.innerHTML = `
    <div class="mm-top">
      <span class="mm-title">model · ${catalog.length} presets</span>
      <button class="btn ghost sm" id="mm-all" type="button">all options</button>
      <button class="btn ghost sm" id="mm-close" type="button">close</button>
    </div>
    <div class="mm-grid">${columns}</div>
    <div class="mm-foot">
      <div class="mm-current"><span class="mm-k">current</span><span>${escapeHtml(S.state?.model?.label || 'no model')}</span></div>
      ${
        models.length
          ? `<label class="field mm-model">model
              <select class="text" id="mm-model-pick">${models
                .map(
                  (m) => `<option value="${escapeHtml(m)}"${m === activeModel ? ' selected' : ''}>${escapeHtml(m)}</option>`
                )
                .join('')}</select>
            </label>`
          : ''
      }
      ${
        needsKey
          ? `<label class="field mm-key">key for ${escapeHtml(current.name)}
              <span class="inline">
                <input class="text" id="mm-key-input" type="password" placeholder="paste it here" autocomplete="off" spellcheck="false" />
                <button class="btn sm" id="mm-key-save" type="button">save</button>
              </span>
            </label>`
          : ''
      }
    </div>
  `;

  menu.querySelectorAll('[data-mm-pick]').forEach((btn) => {
    btn.addEventListener('click', () => pickMenuProvider(btn.dataset.mmPick));
  });
  $('mm-close').addEventListener('click', closeModelMenu);
  $('mm-all').addEventListener('click', () => {
    closeModelMenu();
    openWizard(2, 'edit');
  });
  const modelPick = menu.querySelector('#mm-model-pick');
  if (modelPick) modelPick.addEventListener('change', () => pickMenuModel(currentId, modelPick.value));
  const keySave = menu.querySelector('#mm-key-save');
  if (keySave) {
    keySave.addEventListener('click', () => saveMenuKey(currentId, menu.querySelector('#mm-key-input').value, keySave));
  }
}

async function pickMenuProvider(id) {
  const p = (S.state?.catalog || []).find((x) => x.id === id);
  if (!p || id === S.state?.model?.id) return;
  try {
    await api.post('/api/provider/select', { providerId: id, model: p.models[0] || '', baseUrl: p.baseUrl || '', extra: {} });
    S.state = await api.get('/api/state');
    renderMain();
    renderModelMenu();
    const needsKey = p.keyRequired && !(S.state.keyed || []).includes(id);
    toast(needsKey ? `${p.name} selected — add its key below` : `model set · ${S.state.model.label}`);
  } catch (e) {
    toast(e.message);
  }
}

async function pickMenuModel(providerId, model) {
  const p = (S.state?.catalog || []).find((x) => x.id === providerId);
  try {
    await api.post('/api/provider/select', { providerId, model, baseUrl: p?.baseUrl || '', extra: {} });
    S.state = await api.get('/api/state');
    renderMain();
    renderModelMenu();
    toast(`model set · ${S.state.model.label}`);
  } catch (e) {
    toast(e.message);
  }
}

async function saveMenuKey(providerId, value, btn) {
  if (!String(value || '').trim()) {
    toast('paste a key first');
    return;
  }
  if (btn) btn.disabled = true;
  try {
    await api.post('/api/provider/select', {
      providerId,
      apiKey: String(value).trim(),
      model: S.state?.model?.model || undefined,
    });
    S.state = await api.get('/api/state');
    renderMain();
    renderModelMenu();
    toast('key saved on this machine');
  } catch (e) {
    toast(e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function setHint(text, busy) {
  const el = $('hintline');
  el.textContent = text;
  el.classList.toggle('busy', Boolean(busy));
}

function resetFeed() {
  const feed = $('feed');
  feed.hidden = false;
  feed.innerHTML = '';
  $('cmds').hidden = true;
}

function feedLine(level, text) {
  const feed = $('feed');
  feed.hidden = false;
  const glyph = { info: '›', ok: '✓', warn: '!', err: '✗', dim: '·' }[level] || '·';
  const div = document.createElement('div');
  div.className = `log lvl-${level || 'dim'}`;
  div.innerHTML = `<i>${glyph}</i><span></span>`;
  div.querySelector('span').textContent = text;
  feed.appendChild(div);
  scrollFeed();
  return div;
}

function feedBlock(html) {
  const feed = $('feed');
  const div = document.createElement('div');
  div.innerHTML = html;
  feed.appendChild(div.firstElementChild || div);
  scrollFeed();
  return div;
}

function scrollFeed() {
  const scroller = $('main-scroll');
  scroller.scrollTop = scroller.scrollHeight;
}

function feedPhase(label) {
  feedBlock(`<div class="phase">${escapeHtml(label)}</div>`);
}

function streamJob(jobId, onEvent) {
  const es = new EventSource(`/api/stream?job=${encodeURIComponent(jobId)}`);
  const close = () => es.close();
  es.onmessage = (msg) => {
    let evt;
    try {
      evt = JSON.parse(msg.data);
    } catch {
      return;
    }
    onEvent(evt);
  };
  es.onerror = () => {

  };
  return close;
}

function handleJobEvent(evt) {
  switch (evt.type) {
    case 'start': {
      S.folder = evt.folder || '';
      feedPhase('session');
      feedLine('info', evt.prompt);
      feedLine(
        'dim',
        `${evt.kind}${evt.url ? ` · ${evt.url}` : ''} · ${evt.model}${evt.free ? ' (free mode)' : ''}`
      );
      if (evt.dir) feedLine('dim', evt.dir);
      break;
    }
    case 'phase':
      feedPhase(evt.label || evt.name);
      break;
    case 'log':
      if (evt.level !== 'dim') feedLine(evt.level, evt.text);
      else feedLine('dim', evt.text);
      break;
    case 'dossier': {
      const st = evt.stats || {};
      feedBlock(`<div class="stats">
        <span class="stat"><b>${st.shots || 0}</b> screenshots</span>
        <span class="stat"><b>${st.pages || 0}</b> pages</span>
        <span class="stat"><b>${st.palette || 0}</b> colours</span>
        <span class="stat"><b>${st.sources || 0}</b> sources</span>
        <span class="stat"><b>${st.requests || 0}</b> requests</span>
        <span class="stat"><b>${st.seconds || 0}s</b></span>
      </div>`);
      const shots = (evt.shots || []).filter((s) => s.ok && s.file && S.folder);
      if (shots.length) {
        const html = shots
          .map(
            (s) =>
              `<figure><img loading="lazy" src="/out/${encodeURIComponent(S.folder)}/${s.file}" alt="${escapeHtml(
                s.label
              )}" /><figcaption>${escapeHtml(s.label)}</figcaption></figure>`
          )
          .join('');
        feedBlock(`<div class="thumbs">${html}</div>`);
      }
      break;
    }
    case 'plan':
      feedBlock(
        `<details class="block" open><summary>plan.md</summary><pre>${escapeHtml(evt.markdown || '')}</pre></details>`
      );
      break;
    case 'ask':
      S.awaiting = true;
      setHint('enter approve · esc cancel', true);
      feedBlock(`<div class="actions">
        <button class="btn sm" id="approve-yes" type="button">approve &amp; build</button>
        <button class="btn ghost sm" id="approve-no" type="button">cancel</button>
      </div>`);
      $('approve-yes').addEventListener('click', () => decide(true));
      $('approve-no').addEventListener('click', () => decide(false));
      break;
    case 'files': {
      const list = (evt.files || []).map((f) => `<div><b>${escapeHtml(f.path)}</b><span>${fmtBytes(f.bytes)}</span></div>`).join('');
      feedBlock(`<details class="block" open><summary>files</summary><div class="files">${list}</div></details>`);
      break;
    }
    case 'score': {
      const dims = (evt.dimensions || [])
        .map((d) => `<span class="stat"><b>${d.ratio}%</b> ${escapeHtml(d.label)}</span>`)
        .join('');
      const gaps = (evt.gaps || []).slice(0, 4).map((g) => `<div>· ${escapeHtml(g)}</div>`).join('');
      feedBlock(`<div class="score"><b class="score-num">${evt.score}</b><em>/100 similar${
        evt.judged ? ` · judge ${evt.judged}` : ''
      }</em></div><div class="stats">${dims}</div>${gaps ? `<div class="note">${gaps}</div>` : ''}`);
      break;
    }
    case 'done': {
      S.awaiting = false;
      S.busy = false;
      S.lastResult = evt;
      const v = evt.verify || {};
      feedBlock(`<div class="result">
        <h3>${v.ok ? 'built and verified' : 'built with warnings'}</h3>
        <code>${escapeHtml(evt.siteDir || evt.dir || '')}</code>
        <code>${v.notes ? escapeHtml(v.notes.join(' · ')) : ''}</code>
        <div class="actions">
          <button class="btn sm" id="open-site" type="button">open build</button>
          <button class="btn ghost sm" id="open-folder" type="button">open folder</button>
          <button class="btn ghost sm" id="open-dossier" type="button">dossier</button>
        </div>
      </div>`);
      $('open-site').addEventListener('click', () => api.post('/api/open', { target: evt.index || evt.siteDir }));
      $('open-folder').addEventListener('click', () => api.post('/api/open', { target: evt.dir }));
      $('open-dossier').addEventListener('click', () => api.post('/api/open', { target: evt.dossierPath }));
      setHint('enter send · /help for commands');
      if (S.stream) {
        S.stream();
        S.stream = null;
      }
      break;
    }
    case 'error':
      S.awaiting = false;
      S.busy = false;
      feedLine('err', evt.message);
      setHint('enter send · /help for commands');
      break;
    default:
      break;
  }
}

async function startJob(prompt) {
  S.busy = true;
  S.awaiting = false;
  resetFeed();
  setHint('working…', true);
  try {
    const { jobId } = await api.post('/api/session', { prompt, kind: S.target, url: S.url || undefined });
    S.jobId = jobId;
    if (S.stream) S.stream();
    S.stream = streamJob(jobId, handleJobEvent);
  } catch (e) {
    S.busy = false;
    feedLine('err', e.message);
    setHint('enter send · /help for commands');
  }
}

function decide(accepted, note = '') {
  if (!S.jobId) return;
  S.awaiting = false;
  setHint(accepted ? 'building…' : 'cancelling…', true);
  api.post('/api/approve', { jobId: S.jobId, accepted, note }).catch((e) => feedLine('err', e.message));
}

async function runCommand(raw) {
  const [cmd, ...rest] = raw.slice(1).split(/\s+/);
  const arg = rest.join(' ').trim();
  switch (cmd) {
    case 'help':
      feedPhase('commands');
      feedLine('dim', '/new              start a fresh session');
      feedLine('dim', '/clear            wipe the screen and reset the session state');
      feedLine('dim', '/clear history    forget the recent-build history (folders stay)');
      feedLine('dim', '/model            switch model, add or rotate a key');
      feedLine('dim', '/target site|app|game|other');
      feedLine('dim', '/url <url>        pin the reference url for the next build');
      feedLine('dim', '/theme            dark ⇄ light');
      feedLine('dim', '/open             open the last build folder');
      feedLine('dim', '/sessions         list recent builds');
      feedLine('dim', '/logo reset       drop an imported ascii-art logo');
      feedLine('dim', '/discord          open the discord invite in your browser');
      feedLine('dim', '/exit             quit');
      feedLine('dim', 'tip: drag an ascii-art.html onto the window to use it as the logo');
      break;
    case 'new':
      resetFeed();
      feedLine('info', `new session · target ${S.target} · model ${S.state?.model?.label || 'none'}`);
      break;
    case 'clear':
    case 'cls':
      if (rest[0] === 'history' || rest[0] === 'sessions' || rest[0] === 'all') {
        await api.del('/api/sessions').catch((e) => feedLine('err', e.message));
        S.lastResult = null;
        S.jobId = null;
        resetFeed();
        feedLine('info', 'history cleared · build folders on disk are untouched');
        break;
      }
      if (S.stream) {
        S.stream();
        S.stream = null;
      }
      S.jobId = null;
      S.lastResult = null;
      S.awaiting = false;
      S.busy = false;
      resetFeed();
      setHint('enter send · /help for commands');
      feedLine('info', 'cleared · screen and session state reset');
      break;
    case 'discord':
      await api
        .post('/api/open', { target: 'https://discord.gg/WMqJhE8a2v' })
        .then(() => feedLine('dim', 'opening discord in your browser'))
        .catch((e) => feedLine('err', e.message));
      break;
    case 'model':
    case 'keys':
      if ($('main').hidden) openWizard(2, 'edit');
      else toggleModelMenu();
      break;
    case 'theme':
      applyTheme(S.theme === 'dark' ? 'light' : 'dark');
      await api.post('/api/theme', { theme: S.theme }).catch(() => {});
      break;
    case 'target':
      if (['site', 'app', 'game', 'other'].includes(arg)) await setTarget(arg);
      else feedLine('warn', 'usage: /target site|app|game|other');
      break;
    case 'url':
      S.url = arg;
      feedLine(arg ? 'info' : 'warn', arg ? `reference set · ${arg}` : 'usage: /url https://example.com');
      break;
    case 'sessions': {
      const { sessions } = await api.get('/api/sessions');
      if (!sessions.length) {
        feedLine('dim', 'no builds yet.');
        break;
      }
      sessions.slice(0, 10).forEach((s) =>
        feedLine('dim', `${s.createdAt.slice(0, 16).replace('T', ' ')} · ${s.prompt} · ${s.files?.length || 0} files`)
      );
      break;
    }
    case 'open': {
      const target = S.lastResult?.dir || S.state?.outputDir;
      if (target) await api.post('/api/open', { target }).catch((e) => feedLine('err', e.message));
      break;
    }
    case 'logo':
      S.art = null;
      await api.del('/api/art').catch(() => {});
      if (S.logoScreen) S.logoScreen.clearArt();
      if (S.logoWizard) S.logoWizard.clearArt();
      toast('logo reset to the built-in wordmark');
      break;
    case 'exit':
      await api.post('/api/quit').catch(() => {});
      window.close();
      feedLine('dim', 'bye.');
      break;
    default:
      feedLine('warn', `unknown command /${cmd} · try /help`);
  }
}

async function setTarget(kind) {
  S.target = kind;
  document.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
  await api.post('/api/target', { target: kind }).catch(() => {});
}

function wireMain() {
  const input = $('input');
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const value = input.value.trim();
      if (S.awaiting) {
        if (!value) {
          decide(true);
          input.value = '';
          return;
        }
      }
      if (!value) return;
      input.value = '';
      if (value.startsWith('/')) {
        await runCommand(value);
        return;
      }
      await startJob(value);
      return;
    }
    if (e.key === 'Escape' && S.awaiting) {
      decide(false);
      input.value = '';
    }
  });

  document.querySelectorAll('[data-kind]').forEach((btn) => {
    btn.addEventListener('click', () => setTarget(btn.dataset.kind));
  });

  $('model-chip').addEventListener('click', toggleModelMenu);

  $('steps').addEventListener('click', (e) => {
    const btn = e.target.closest('.step');
    if (!btn) return;
    const n = Number(btn.dataset.step);
    if (S.wizardMode === 'first' && n > S.step) return;
    openWizard(n, S.wizardMode);
  });

  $('wiz-next').addEventListener('click', wizardNext);
  $('wiz-back').addEventListener('click', wizardBack);

  const fileInput = $('art-file');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (file) await importArt(file);
    fileInput.value = '';
  });

  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth += 1;
    document.body.classList.add('dropping');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) document.body.classList.remove('dropping');
  });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dropping');
    const file = e.dataTransfer?.files?.[0];
    if (file) await importArt(file);
  });
  $('drop-hint').addEventListener('click', () => fileInput.click());

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if ($('main').hidden) return;
      $('input').focus();
      $('input').select();
      return;
    }
    if (e.key === 'Escape' && modelMenuOpen()) closeModelMenu();
  });

  document.addEventListener('click', (e) => {
    if (!modelMenuOpen()) return;
    if (e.target.closest('#model-menu') || e.target.closest('#model-chip')) return;
    closeModelMenu();
  });
}

async function importArt(file) {
  try {
    const art = await artFromFile(file);
    await api.post('/api/art', { art });
    S.art = art;
    if (S.logoScreen) S.logoScreen.setArt(art);
    if (S.logoWizard) S.logoWizard.setArt(art);
    toast(
      `logo imported · ${art.cols}×${art.rows} px${
        art.dropped ? ` · ${art.dropped} dark cells treated as background` : ''
      }`
    );
  } catch (e) {
    toast(`could not read that file: ${e.message}`);
  }
}

wireMain();
boot();
