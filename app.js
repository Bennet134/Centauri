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
    full:    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    long:    d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
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
  const fmt = formatDate(date);

  document.getElementById('header-date').textContent = fmt.long;

  const container = document.getElementById('today-content');
  container.innerHTML = (existing && !state.editing)
    ? buildSavedCard(existing, date)
    : buildForm(existing);

  if (!existing || state.editing) {
    bindFormEvents(existing);
    // Auto-focus weight if empty
    const wInput = document.getElementById('weight-input');
    if (wInput && !wInput.value) {
      setTimeout(() => wInput.focus(), 80);
    }
  }
}

function buildForm(prefill) {
  const f = state.form;
  const w  = prefill ? prefill.weight     : (f.weight     || '');
  const sd = prefill ? prefill.softdrinks : f.softdrinks;
  const ea = prefill ? prefill.eating     : f.eating;
  const mv = prefill ? prefill.movement   : f.movement;

  const sdOpts = [['0','None'],['1','One'],['2','Two+']];
  const eaOpts = [['bad','Junk'],['okay','Okay'],['clean','Clean']];
  const mvOpts = [['none','None'],['light','Light'],['active','Active']];

  const pillGroup = (group, opts, cur, tones = {}) => `
    <div class="option-pills" data-group="${group}">
      ${opts.map(([val, label]) => {
        const isSel = cur !== null && String(cur) === String(val);
        const tone = isSel && tones[val] ? ` tone-${tones[val]}` : '';
        return `<button class="pill${isSel ? ' selected' + tone : ''}" data-value="${val}">${label}</button>`;
      }).join('')}
    </div>`;

  return `
    <div class="weight-section">
      <span class="field-label">Weight</span>
      <div class="weight-input-row">
        <input id="weight-input" class="weight-input" type="number"
          inputmode="decimal" placeholder="0.0"
          step="0.1" min="20" max="300"
          value="${w}">
        <span class="weight-unit">kg</span>
      </div>
    </div>

    <div class="option-group">
      <span class="field-label">Soft drinks</span>
      ${pillGroup('softdrinks', sdOpts, sd, { 2: 'red', 1: 'amber' })}
    </div>

    <div class="option-group">
      <span class="field-label">Eating</span>
      ${pillGroup('eating', eaOpts, ea, { bad: 'red', okay: 'amber' })}
    </div>

    <div class="option-group">
      <span class="field-label">Movement</span>
      ${pillGroup('movement', mvOpts, mv)}
    </div>

    <button id="save-btn" class="save-btn">Save</button>`;
}

function bindFormEvents(prefill) {
  const wInput = document.getElementById('weight-input');
  wInput?.addEventListener('input', e => { state.form.weight = e.target.value; });

  document.querySelectorAll('.option-pills').forEach(group => {
    group.addEventListener('click', e => {
      const pill = e.target.closest('.pill');
      if (!pill) return;

      const gName = group.dataset.group;
      const val   = pill.dataset.value;
      const parsed = gName === 'softdrinks' ? parseInt(val) : val;

      state.form[gName] = parsed;

      // Update pill styles
      group.querySelectorAll('.pill').forEach(p => {
        p.classList.remove('selected', 'tone-red', 'tone-amber');
      });
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

  document.getElementById('save-btn')?.addEventListener('click', () => saveEntry());
}

function buildSavedCard(entry, date) {
  // Find previous entry for delta
  const all = DB.getEntries().sort((a, b) => a.date.localeCompare(b.date));
  const idx = all.findIndex(e => e.date === date);
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
    ? `<span class="badge badge-green">Clean eating</span>`
    : entry.eating === 'okay'
    ? `<span class="badge badge-amber">Okay eating</span>`
    : `<span class="badge badge-red">Junk food</span>`;

  const drinkBadge = entry.softdrinks === 0
    ? `<span class="badge badge-green">No soft drinks</span>`
    : entry.softdrinks === 1
    ? `<span class="badge badge-amber">1 soft drink</span>`
    : `<span class="badge badge-red">2+ soft drinks</span>`;

  const moveBadge = entry.movement === 'active'
    ? `<span class="badge badge-green">Active</span>`
    : entry.movement === 'light'
    ? `<span class="badge badge-gray">Light activity</span>`
    : `<span class="badge badge-gray">No movement</span>`;

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
      <button class="edit-btn" id="edit-btn">Edit entry</button>
    </div>`;
}

function startEdit() {
  const entry = DB.getEntry(todayStr());
  if (entry) {
    state.form = { ...entry };
  }
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

  const entry = {
    date:       todayStr(),
    weight,
    softdrinks: state.form.softdrinks !== null ? state.form.softdrinks : 0,
    eating:     state.form.eating     || 'okay',
    movement:   state.form.movement   || 'none'
  };

  DB.upsertEntry(entry);
  state.editing = false;
  state.form = { weight: '', softdrinks: null, eating: null, movement: null };

  showToast('Saved');
  renderToday();
}

// Expose for inline onclick fallback
window.startEdit = startEdit;

// Delegated click for edit button
document.addEventListener('click', e => {
  if (e.target.id === 'edit-btn') startEdit();
});

// ─── History View ─────────────────────────────────────────────────────────────

function renderHistory() {
  const entries = DB.getEntries();
  const container = document.getElementById('history-content');

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No entries yet.<br>Start by logging today's weight.</p>
      </div>`;
    return;
  }

  // Sort ascending for delta calc
  const asc = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  const items = entries.map((entry, i) => {
    const fmt = formatDate(entry.date);
    const isToday = entry.date === todayStr();

    // Delta vs previous entry
    const ascIdx = asc.findIndex(e => e.date === entry.date);
    const prev   = ascIdx > 0 ? asc[ascIdx - 1] : null;
    let deltaHtml = '';
    if (prev) {
      const diff = entry.weight - prev.weight;
      if (Math.abs(diff) >= 0.05) {
        const cls  = diff < 0 ? 'delta-down' : 'delta-up';
        const sign = diff < 0 ? '↓' : '↑';
        deltaHtml = `<span class="history-delta badge ${diff < 0 ? 'badge-green' : 'badge-red'}">${sign}${Math.abs(diff).toFixed(1)}</span>`;
      }
    }

    const eatDot  = entry.eating === 'clean'  ? 'dot-green' : entry.eating  === 'okay' ? 'dot-amber' : 'dot-red';
    const drinkDot= entry.softdrinks === 0   ? 'dot-green' : entry.softdrinks === 1    ? 'dot-amber' : 'dot-red';
    const moveDot = entry.movement === 'active'? 'dot-green': entry.movement === 'light'? 'dot-amber' : 'dot-gray';

    return `
      <div class="history-item" style="animation-delay:${Math.min(i * 25, 180)}ms">
        <div class="history-date">
          <div class="day-num">${fmt.full}</div>
          <div class="day-label">${isToday ? 'Today' : fmt.weekday}</div>
        </div>
        <div class="history-weight">
          ${entry.weight}<span class="unit"> kg</span>
        </div>
        ${deltaHtml}
        <div class="history-dots">
          <div class="dot ${eatDot}"   title="Eating: ${entry.eating}"></div>
          <div class="dot ${drinkDot}" title="Drinks: ${entry.softdrinks}"></div>
          <div class="dot ${moveDot}"  title="Movement: ${entry.movement}"></div>
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
        <p>Log at least 2 days<br>to see your chart.</p>
      </div>`;
    return;
  }

  const minW  = Math.min(...entries.map(e => e.weight));
  const maxW  = Math.max(...entries.map(e => e.weight));
  const first = entries[0];
  const last  = entries[entries.length - 1];
  const diff  = last.weight - first.weight;
  const diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(1) + ' kg';
  const diffCls = diff <= 0 ? 'dot-green' : 'dot-red';

  container.innerHTML = `
    <div class="chart-container">
      ${buildSVGChart(entries)}
    </div>
    <div class="chart-meta">
      <div class="chart-meta-item">
        <div class="chart-meta-label">Low</div>
        <div class="chart-meta-value">${minW.toFixed(1)} kg</div>
      </div>
      <div class="chart-meta-item">
        <div class="chart-meta-label">High</div>
        <div class="chart-meta-value">${maxW.toFixed(1)} kg</div>
      </div>
      <div class="chart-meta-item">
        <div class="chart-meta-label">Change</div>
        <div class="chart-meta-value" style="color:var(${diff <= 0 ? '--green' : '--red'})">${diffStr}</div>
      </div>
    </div>`;

  // Animate line
  setTimeout(() => {
    const path = document.getElementById('chart-line');
    if (!path) return;
    const len = path.getTotalLength();
    path.style.strokeDasharray  = len;
    path.style.strokeDashoffset = len;
    path.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(0.4, 0, 0.2, 1)';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { path.style.strokeDashoffset = 0; });
    });

    // Animate dots
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
  const CW = VW - PL - PR;
  const CH = VH - PT - PB;

  const weights = entries.map(e => e.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = (maxW - minW) || 1;
  const padding = range * 0.15;
  const yMin = minW - padding;
  const yMax = maxW + padding;
  const yRange = yMax - yMin;

  const xOf = i => PL + (i / (entries.length - 1)) * CW;
  const yOf = w => PT + (1 - (w - yMin) / yRange) * CH;

  const pts = entries.map((e, i) => ({ x: xOf(i), y: yOf(e.weight), w: e.weight }));

  // Smooth bezier path
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx.toFixed(1)} ${p0.y.toFixed(1)} ${cx.toFixed(1)} ${p1.y.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }

  // Area fill
  const areaD = d
    + ` L ${pts[pts.length - 1].x.toFixed(1)} ${(VH - PB).toFixed(1)}`
    + ` L ${pts[0].x.toFixed(1)} ${(VH - PB).toFixed(1)} Z`;

  // Y-axis labels (3 ticks)
  const yTicks = [0, 0.5, 1].map(t => {
    const val = yMin + t * yRange;
    return { y: yOf(val), label: val.toFixed(1) };
  });

  // X-axis labels (first, mid, last)
  const xTickIdxs = [0, Math.floor((entries.length - 1) / 2), entries.length - 1];
  const xTicks = xTickIdxs.map(i => ({
    x: xOf(i),
    label: formatDate(entries[i].date).full
  }));

  const gridLines = yTicks.map(t =>
    `<line x1="${PL}" y1="${t.y.toFixed(1)}" x2="${VW - PR}" y2="${t.y.toFixed(1)}" stroke="#e8e5df" stroke-width="1"/>`
  ).join('');

  const yLabels = yTicks.map(t =>
    `<text x="${PL - 5}" y="${(t.y + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#b0aca6">${t.label}</text>`
  ).join('');

  const xLabels = xTicks.map(t =>
    `<text x="${t.x.toFixed(1)}" y="${VH - 6}" text-anchor="middle" font-size="9.5" fill="#b0aca6">${t.label}</text>`
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

  const all       = DB.getEntries();
  const thisWeek  = all.filter(e => e.date >= ws  && e.date <= we);
  const lastWeek  = all.filter(e => e.date >= lws && e.date <= lwe);

  if (thisWeek.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No entries this week yet.</p>
      </div>`;
    return;
  }

  const avgW   = thisWeek.reduce((s, e) => s + e.weight, 0) / thisWeek.length;
  const drinks = thisWeek.reduce((s, e) => s + e.softdrinks, 0);
  const days   = thisWeek.length;

  // Week day dots (Mon–Sun)
  const DAYS = ['M','T','W','T','F','S','S'];
  const weekStart = parseLocalDate(ws);
  const todayDate = todayStr();
  const dayDots = DAYS.map((lbl, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dStr = d.toISOString().split('T')[0];
    const logged = thisWeek.some(e => e.date === dStr);
    const isFuture = dStr > todayDate;
    const cls = isFuture ? '' : logged ? 'logged' : (dStr === todayDate ? 'today-empty' : '');
    return `
      <div class="week-day">
        <div class="week-day-label">${lbl}</div>
        <div class="week-day-dot ${cls}"></div>
      </div>`;
  }).join('');

  // Feedback
  let feedback = '', feedbackCls = '';
  if (lastWeek.length > 0) {
    const lastAvg = lastWeek.reduce((s, e) => s + e.weight, 0) / lastWeek.length;
    const diff = avgW - lastAvg;
    if (diff < -0.2) {
      feedback = `Down ${Math.abs(diff).toFixed(1)} kg from last week. Keep going.`;
      feedbackCls = 'feedback-better';
    } else if (diff > 0.2) {
      feedback = `Up ${diff.toFixed(1)} kg from last week. Stay consistent.`;
      feedbackCls = 'feedback-worse';
    } else {
      feedback = 'About the same as last week. Consistency is the foundation.';
      feedbackCls = 'feedback-same';
    }
  }

  container.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card full-width">
        <span class="stat-label">Average weight</span>
        <div class="stat-value"><span id="cu-weight">—</span><span class="unit"> kg</span></div>
      </div>
      <div class="stat-card">
        <span class="stat-label">Soft drinks</span>
        <div class="stat-value"><span id="cu-drinks">—</span></div>
      </div>
      <div class="stat-card">
        <span class="stat-label">Days logged</span>
        <div class="stat-value"><span id="cu-days">—</span><span class="unit"> / 7</span></div>
      </div>
    </div>

    <div class="stat-card" style="margin-bottom:10px">
      <span class="stat-label">This week</span>
      <div class="week-days">${dayDots}</div>
    </div>

    ${feedback ? `<div class="weekly-feedback ${feedbackCls}">${feedback}</div>` : ''}
  `;

  // Count-up animations
  const wEl = document.getElementById('cu-weight');
  const dEl = document.getElementById('cu-drinks');
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
  const prev = document.getElementById(VIEWS[state.view].el);
  prev?.classList.remove('active');
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
  const r = size * 0.22;

  // Background — rounded rect
  ctx.fillStyle = '#f0ede6';
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(size, 0, size, size, r);
  ctx.arcTo(size, size, 0, size, r);
  ctx.arcTo(0, size, 0, 0, r);
  ctx.arcTo(0, 0, size, 0, r);
  ctx.closePath();
  ctx.fill();

  // Crosshair lines
  const cx = size / 2, cy = size / 2;
  const arm = size * 0.21;
  ctx.strokeStyle = '#2d2d2d';
  ctx.lineWidth   = size * 0.042;
  ctx.lineCap     = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy); ctx.stroke();

  // Center dot
  ctx.fillStyle = '#4a7c59';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.07, 0, Math.PI * 2);
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
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (_) { /* SW is optional */ }
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
