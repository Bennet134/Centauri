'use strict';

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'centauri_v1';

const DB = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { entries: [] };
    } catch {
      return { entries: [] };
    }
  },
  save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },
  getEntries() {
    return this.get().entries.sort((a, b) => b.date.localeCompare(a.date));
  },
  getEntry(date) {
    return this.get().entries.find(e => e.date === date) || null;
  },
  upsertEntry(entry) {
    const data = this.get();
    const idx = data.entries.findIndex(e => e.date === entry.date);
    if (idx >= 0) data.entries[idx] = entry;
    else data.entries.push(entry);
    this.save(data);
  }
};

// ─── Utils ────────────────────────────────────────────────────────────────────

const LOCALE = 'de-DE';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(dateStr) {
  const d = parseLocalDate(dateStr);
  return {
    full:    d.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' }),
    weekday: d.toLocaleDateString(LOCALE, { weekday: 'short' }),
    long:    d.toLocaleDateString(LOCALE, { weekday: 'long', month: 'long', day: 'numeric' })
  };
}

function getWeekBounds(referenceDate = new Date()) {
  const d = new Date(referenceDate);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  const startStr = start.toISOString().split('T')[0];
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const endStr = end.toISOString().split('T')[0];
  return { start: startStr, end: endStr };
}

function countUp(el, target, decimals = 1) {
  const duration = 650;
  const startTime = performance.now();
  function tick(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = (target * ease).toFixed(decimals);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

// ─── App State ────────────────────────────────────────────────────────────────

const state = {
  view: 'today',
  editing: false,
  form: { weight: '', softdrinks: null, eating: null, movement: null }
};

// ─── Today View ───────────────────────────────────────────────────────────────

function renderToday() {
  const date = todayStr();
  const existing = DB.getEntry(date);
  document.getElementById('header-date').textContent = formatDate(date).long;

  const container = document.getElementById('today-content');
  container.innerHTML = (existing && !state.editing)
    ? buildSavedCard(existing, date)
    : buildForm(existing);

  if (!existing || state.editing) {
    bindFormEvents();
    const wInput = document.getElementById('weight-input');
    if (wInput && !wInput.value) setTimeout(() => wInput.focus(), 80);
  }
}

function buildForm(prefill) {
  const f  = state.form;
  const w  = prefill ? prefill.weight     : (f.weight     || '');
  const sd = prefill ? prefill.softdrinks : f.softdrinks;
  const ea = prefill ? prefill.eating     : f.eating;
  const mv = prefill ? prefill.movement   : f.movement;

  const pillGroup = (group, opts, cur) => `
    <div class="option-pills" data-group="${group}">
      ${opts.map(([val, label, tone]) => {
        const sel = cur !== null && String(cur) === String(val);
        return `<button class="pill${sel ? ' selected' + (tone ? ' tone-' + tone : '') : ''}" data-value="${val}">${label}</button>`;
      }).join('')}
    </div>`;

  return `
    <div class="weight-section">
      <span class="field-label">Gewicht</span>
      <div class="weight-input-row">
        <input id="weight-input" class="weight-input" type="number"
          inputmode="decimal" placeholder="0,0"
          step="0.1" min="20" max="300" value="${w}">
        <span class="weight-unit">kg</span>
      </div>
    </div>

    <div class="option-group">
      <span class="field-label">Softdrinks</span>
      ${pillGroup('softdrinks', [['0','Keine',''],['1','Einer','amber'],['2','Zwei+','red']], sd)}
    </div>

    <div class="option-group">
      <span class="field-label">Ernährung</span>
      ${pillGroup('eating', [['bad','Ungesund','red'],['okay','Okay','amber'],['clean','Gesund','']], ea)}
    </div>

    <div class="option-group">
      <span class="field-label">Bewegung</span>
      ${pillGroup('movement', [['none','Keine',''],['light','Leicht',''],['active','Aktiv','']], mv)}
    </div>

    <button id="save-btn" class="save-btn">Speichern</button>`;
}

function bindFormEvents() {
  const wInput = document.getElementById('weight-input');
  wInput?.addEventListener('input', e => { state.form.weight = e.target.value; });

  document.querySelectorAll('.option-pills').forEach(group => {
    group.addEventListener('click', e => {
      const pill = e.target.closest('.pill');
      if (!pill) return;

      const gName = group.dataset.group;
      const val   = pill.dataset.value;
      state.form[gName] = gName === 'softdrinks' ? parseInt(val) : val;

      group.querySelectorAll('.pill').forEach(p =>
        p.classList.remove('selected', 'tone-red', 'tone-amber')
      );
      pill.classList.add('selected');

      if (gName === 'softdrinks') {
        if (val === '1') pill.classList.add('tone-amber');
        if (val === '2') pill.classList.add('tone-red');
      }
      if (gName === 'eating') {
        if (val === 'bad')  pill.classList.add('tone-red');
        if (val === 'okay') pill.classList.add('tone-amber');
      }
    });
  });

  document.getElementById('save-btn')?.addEventListener('click', saveEntry);
}

function buildSavedCard(entry, date) {
  const all  = DB.getEntries().sort((a, b) => a.date.localeCompare(b.date));
  const idx  = all.findIndex(e => e.date === date);
  const prev = idx > 0 ? all[idx - 1] : null;

  let deltaHtml = '';
  if (prev) {
    const diff = entry.weight - prev.weight;
    if (Math.abs(diff) >= 0.1) {
      const cls  = diff < 0 ? 'delta-down' : 'delta-up';
      const sign = diff < 0 ? '↓' : '↑';
      deltaHtml = `<span class="saved-weight-delta ${cls}">${sign} ${Math.abs(diff).toFixed(1)} kg</span>`;
    }
  }

  const eatBadge = entry.eating === 'clean'
    ? `<span class="badge badge-green">Gesunde Ernährung</span>`
    : entry.eating === 'okay'
    ? `<span class="badge badge-amber">Okay Ernährung</span>`
    : `<span class="badge badge-red">Ungesundes Essen</span>`;

  const drinkBadge = entry.softdrinks === 0
    ? `<span class="badge badge-green">Keine Softdrinks</span>`
    : entry.softdrinks === 1
    ? `<span class="badge badge-amber">1 Softdrink</span>`
    : `<span class="badge badge-red">2+ Softdrinks</span>`;

  const moveBadge = entry.movement === 'active'
    ? `<span class="badge badge-green">Aktiv</span>`
    : entry.movement === 'light'
    ? `<span class="badge badge-gray">Leichte Bewegung</span>`
    : `<span class="badge badge-gray">Keine Bewegung</span>`;

  return `
    <div class="saved-card">
      <div class="saved-weight-display">
        <span class="saved-weight-num">${entry.weight}</span>
        <span class="saved-weight-unit">kg</span>
        ${deltaHtml}
      </div>
      <div class="saved-badges">
        ${eatBadge}
        ${drinkBadge}
        ${moveBadge}
      </div>
      <button class="edit-btn" id="edit-btn">Eintrag bearbeiten</button>
    </div>`;
}

function startEdit() {
  const entry = DB.getEntry(todayStr());
  if (entry) state.form = { ...entry };
  state.editing = true;
  renderToday();
}

function saveEntry() {
  const wInput = document.getElementById('weight-input');
  const weight = parseFloat(wInput?.value);

  if (!weight || weight < 20 || weight > 300) {
    wInput?.classList.add('shake');
    wInput?.addEventListener('animationend', () => wInput.classList.remove('shake'), { once: true });
    wInput?.focus();
    return;
  }

  const btn = document.getElementById('save-btn');
  if (btn) btn.classList.add('saving');

  DB.upsertEntry({
    date:       todayStr(),
    weight,
    softdrinks: state.form.softdrinks !== null ? state.form.softdrinks : 0,
    eating:     state.form.eating     || 'okay',
    movement:   state.form.movement   || 'none'
  });

  state.editing = false;
  state.form = { weight: '', softdrinks: null, eating: null, movement: null };

  showToast('Gespeichert');
  renderToday();
}

window.startEdit = startEdit;
document.addEventListener('click', e => {
  if (e.target.id === 'edit-btn') startEdit();
});

// ─── History View ─────────────────────────────────────────────────────────────

function renderHistory() {
  const entries   = DB.getEntries();
  const container = document.getElementById('history-content');

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Noch keine Einträge.<br>Starte mit dem heutigen Gewicht.</p>
      </div>`;
    return;
  }

  const asc = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  const items = entries.map((entry, i) => {
    const fmt     = formatDate(entry.date);
    const isToday = entry.date === todayStr();
    const ascIdx  = asc.findIndex(e => e.date === entry.date);
    const prev    = ascIdx > 0 ? asc[ascIdx - 1] : null;

    let deltaHtml = '';
    if (prev) {
      const diff = entry.weight - prev.weight;
      if (Math.abs(diff) >= 0.05) {
        const cls = diff < 0 ? 'badge-green' : 'badge-red';
        const sign = diff < 0 ? '↓' : '↑';
        deltaHtml = `<span class="history-delta badge ${cls}">${sign}${Math.abs(diff).toFixed(1)}</span>`;
      }
    }

    const eatDot   = entry.eating === 'clean'    ? 'dot-green' : entry.eating === 'okay'     ? 'dot-amber' : 'dot-red';
    const drinkDot = entry.softdrinks === 0      ? 'dot-green' : entry.softdrinks === 1      ? 'dot-amber' : 'dot-red';
    const moveDot  = entry.movement === 'active' ? 'dot-green' : entry.movement === 'light'  ? 'dot-amber' : 'dot-gray';

    return `
      <div class="history-item" style="animation-delay:${Math.min(i * 25, 180)}ms">
        <div class="history-date">
          <div class="day-num">${fmt.full}</div>
          <div class="day-label">${isToday ? 'Heute' : fmt.weekday}</div>
        </div>
        <div class="history-weight">${entry.weight}<span class="unit"> kg</span></div>
        ${deltaHtml}
        <div class="history-dots">
          <div class="dot ${eatDot}"   title="Ernährung: ${entry.eating}"></div>
          <div class="dot ${drinkDot}" title="Drinks: ${entry.softdrinks}"></div>
          <div class="dot ${moveDot}"  title="Bewegung: ${entry.movement}"></div>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `<div class="history-list">${items}</div>`;
}

// ─── Graph View ───────────────────────────────────────────────────────────────

function renderGraph() {
  const container = document.getElementById('graph-content');
  const entries = DB.getEntries()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-60);

  if (entries.length < 2) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Trage mindestens 2 Tage ein,<br>um die Grafik zu sehen.</p>
      </div>`;
    return;
  }

  const minW  = Math.min(...entries.map(e => e.weight));
  const maxW  = Math.max(...entries.map(e => e.weight));
  const first = entries[0];
  const last  = entries[entries.length - 1];
  const diff  = last.weight - first.weight;
  const diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(1) + ' kg';

  container.innerHTML = `
    <div class="chart-container">
      ${buildSVGChart(entries)}
    </div>
    <div class="chart-meta">
      <div class="chart-meta-item">
        <div class="chart-meta-label">Min</div>
        <div class="chart-meta-value">${minW.toFixed(1)} kg</div>
      </div>
      <div class="chart-meta-item">
        <div class="chart-meta-label">Max</div>
        <div class="chart-meta-value">${maxW.toFixed(1)} kg</div>
      </div>
      <div class="chart-meta-item">
        <div class="chart-meta-label">Änderung</div>
        <div class="chart-meta-value" style="color:var(${diff <= 0 ? '--green' : '--red'})">${diffStr}</div>
      </div>
    </div>`;

  setTimeout(() => {
    const path = document.getElementById('chart-line');
    if (!path) return;
    const len = path.getTotalLength();
    path.style.strokeDasharray  = len;
    path.style.strokeDashoffset = len;
    path.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(0.4, 0, 0.2, 1)';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      path.style.strokeDashoffset = 0;
    }));
    document.querySelectorAll('.chart-dot').forEach((dot, i) => {
      dot.style.opacity = '0';
      setTimeout(() => {
        dot.style.transition = 'opacity 0.25s ease';
        dot.style.opacity = '1';
      }, 900 + i * 20);
    });
  }, 50);
}

function buildSVGChart(entries) {
  const VW = 320, VH = 180;
  const PL = 40, PR = 12, PT = 12, PB = 26;
  const CW = VW - PL - PR, CH = VH - PT - PB;

  const weights = entries.map(e => e.weight);
  const minW = Math.min(...weights), maxW = Math.max(...weights);
  const range = (maxW - minW) || 1;
  const pad = range * 0.15;
  const yMin = minW - pad, yMax = maxW + pad, yRange = yMax - yMin;

  const xOf = i => PL + (i / (entries.length - 1)) * CW;
  const yOf = w => PT + (1 - (w - yMin) / yRange) * CH;
  const pts  = entries.map((e, i) => ({ x: xOf(i), y: yOf(e.weight) }));

  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx.toFixed(1)} ${p0.y.toFixed(1)} ${cx.toFixed(1)} ${p1.y.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }

  const areaD = d
    + ` L ${pts[pts.length-1].x.toFixed(1)} ${(VH-PB).toFixed(1)}`
    + ` L ${pts[0].x.toFixed(1)} ${(VH-PB).toFixed(1)} Z`;

  const yTicks = [0, 0.5, 1].map(t => {
    const val = yMin + t * yRange;
    return { y: yOf(val), label: val.toFixed(1) };
  });

  const xTickIdxs = [0, Math.floor((entries.length - 1) / 2), entries.length - 1];
  const xTicks = xTickIdxs.map(i => ({
    x: xOf(i),
    label: formatDate(entries[i].date).full
  }));

  const gridLines = yTicks.map(t =>
    `<line x1="${PL}" y1="${t.y.toFixed(1)}" x2="${VW-PR}" y2="${t.y.toFixed(1)}" stroke="#e8e5df" stroke-width="1"/>`
  ).join('');

  const yLabels = yTicks.map(t =>
    `<text x="${PL-5}" y="${(t.y+3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#b0aca6">${t.label}</text>`
  ).join('');

  const xLabels = xTicks.map(t =>
    `<text x="${t.x.toFixed(1)}" y="${VH-6}" text-anchor="middle" font-size="9.5" fill="#b0aca6">${t.label}</text>`
  ).join('');

  const dots = pts.map((p, i) => {
    const isLast = i === pts.length - 1;
    return `<circle class="chart-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}"
      r="${isLast ? 4 : 2.5}"
      fill="${isLast ? '#4a7c59' : '#fff'}"
      stroke="${isLast ? '#4a7c59' : '#c8c4bc'}"
      stroke-width="1.5"/>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#4a7c59" stop-opacity="0.13"/>
          <stop offset="100%" stop-color="#4a7c59" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${gridLines}
      <path d="${areaD}" fill="url(#areaFill)"/>
      <path id="chart-line" d="${d}" fill="none" stroke="#4a7c59" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
      ${yLabels}
      ${xLabels}
    </svg>`;
}

// ─── Weekly View ──────────────────────────────────────────────────────────────

function renderWeekly() {
  const container = document.getElementById('weekly-content');
  const { start: ws, end: we } = getWeekBounds();
  const { start: lws, end: lwe } = getWeekBounds(new Date(parseLocalDate(ws) - 1));

  const all      = DB.getEntries();
  const thisWeek = all.filter(e => e.date >= ws  && e.date <= we);
  const lastWeek = all.filter(e => e.date >= lws && e.date <= lwe);

  if (thisWeek.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Diese Woche noch keine Einträge.</p>
      </div>`;
    return;
  }

  const avgW   = thisWeek.reduce((s, e) => s + e.weight, 0) / thisWeek.length;
  const drinks = thisWeek.reduce((s, e) => s + e.softdrinks, 0);
  const days   = thisWeek.length;

  // Mo Di Mi Do Fr Sa So
  const DAY_LABELS = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  const weekStart  = parseLocalDate(ws);
  const todayDate  = todayStr();

  const dayDots = DAY_LABELS.map((lbl, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dStr   = d.toISOString().split('T')[0];
    const logged = thisWeek.some(e => e.date === dStr);
    const isFut  = dStr > todayDate;
    const cls    = isFut ? '' : logged ? 'logged' : (dStr === todayDate ? 'today-empty' : '');
    return `
      <div class="week-day">
        <div class="week-day-label">${lbl}</div>
        <div class="week-day-dot ${cls}"></div>
      </div>`;
  }).join('');

  let feedback = '', feedbackCls = '';
  if (lastWeek.length > 0) {
    const lastAvg = lastWeek.reduce((s, e) => s + e.weight, 0) / lastWeek.length;
    const diff = avgW - lastAvg;
    if (diff < -0.2) {
      feedback    = `${Math.abs(diff).toFixed(1)} kg weniger als letzte Woche. Weiter so.`;
      feedbackCls = 'feedback-better';
    } else if (diff > 0.2) {
      feedback    = `${diff.toFixed(1)} kg mehr als letzte Woche. Bleib konsequent.`;
      feedbackCls = 'feedback-worse';
    } else {
      feedback    = 'Etwa wie letzte Woche. Konstanz ist die Basis.';
      feedbackCls = 'feedback-same';
    }
  }

  container.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card full-width">
        <span class="stat-label">Durchschnittsgewicht</span>
        <div class="stat-value"><span id="cu-weight">—</span><span class="unit"> kg</span></div>
      </div>
      <div class="stat-card">
        <span class="stat-label">Softdrinks</span>
        <div class="stat-value"><span id="cu-drinks">—</span></div>
      </div>
      <div class="stat-card">
        <span class="stat-label">Tage eingetragen</span>
        <div class="stat-value"><span id="cu-days">—</span><span class="unit"> / 7</span></div>
      </div>
    </div>

    <div class="stat-card" style="margin-bottom:10px">
      <span class="stat-label">Diese Woche</span>
      <div class="week-days">${dayDots}</div>
    </div>

    ${feedback ? `<div class="weekly-feedback ${feedbackCls}">${feedback}</div>` : ''}`;

  const wEl  = document.getElementById('cu-weight');
  const dEl  = document.getElementById('cu-drinks');
  const dyEl = document.getElementById('cu-days');
  if (wEl)  countUp(wEl,  avgW,   1);
  if (dEl)  countUp(dEl,  drinks, 0);
  if (dyEl) countUp(dyEl, days,   0);
}

// ─── Router ───────────────────────────────────────────────────────────────────

const VIEWS = {
  today:   { el: 'view-today',   render: renderToday },
  history: { el: 'view-history', render: renderHistory },
  graph:   { el: 'view-graph',   render: renderGraph },
  weekly:  { el: 'view-weekly',  render: renderWeekly }
};

function navigate(name) {
  if (state.view === name) return;
  document.getElementById(VIEWS[state.view].el)?.classList.remove('active');
  state.view = name;
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === name)
  );
  VIEWS[name].render();
  requestAnimationFrame(() => {
    document.getElementById(VIEWS[name].el)?.classList.add('active');
  });
}

// ─── PWA Icon ─────────────────────────────────────────────────────────────────

function generateIconDataURL(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  // Rounded background
  const r = size * 0.22;
  ctx.fillStyle = '#f0ede6';
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(size, 0,    size, size, r);
  ctx.arcTo(size, size, 0,    size, r);
  ctx.arcTo(0,    size, 0,    0,    r);
  ctx.arcTo(0,    0,    size, 0,    r);
  ctx.closePath();
  ctx.fill();

  // 4-pointed star
  const cx = size / 2, cy = size / 2;
  const out = size * 0.354; // outer radius (tip to center)
  const cp  = size * 0.146; // control-point offset (waist tightness)

  ctx.fillStyle = '#2d2d2d';
  ctx.beginPath();
  ctx.moveTo(cx,       cy - out);
  ctx.quadraticCurveTo(cx + cp, cy - cp, cx + out, cy);
  ctx.quadraticCurveTo(cx + cp, cy + cp, cx,       cy + out);
  ctx.quadraticCurveTo(cx - cp, cy + cp, cx - out, cy);
  ctx.quadraticCurveTo(cx - cp, cy - cp, cx,       cy - out);
  ctx.closePath();
  ctx.fill();

  return c.toDataURL('image/png');
}

function setupIcons() {
  const icon = generateIconDataURL(192);
  const appleLink = document.getElementById('apple-touch-icon');
  if (appleLink) appleLink.href = icon;
}

// ─── Service Worker ───────────────────────────────────────────────────────────

async function registerSW() {
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('sw.js'); } catch (_) {}
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  setupIcons();
  registerSW();

  document.getElementById('bottom-nav').addEventListener('click', e => {
    const btn = e.target.closest('.nav-btn');
    if (btn?.dataset.view) navigate(btn.dataset.view);
  });

  renderToday();
}

document.addEventListener('DOMContentLoaded', init);
