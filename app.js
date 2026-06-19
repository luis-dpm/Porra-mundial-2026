// ============ SETUP ============
const D = PORRA_DATA;
const PLAYERS = D.players;

const PLAYER_COLORS = {
  'LUIS': '#D4A23C',
  'EL MATO': '#6FA8DC',
  'IVÁN': '#C44536',
  'ADRIÁN': '#8B7BC4',
  'JUAN': '#4FAE7E',
  'CARLOS': '#D67BB0',
  'JAVI': '#E8915C',
};

const PLAYER_DASH = {
  'LUIS': [],
  'EL MATO': [6,3],
  'IVÁN': [2,2],
  'ADRIÁN': [6,3,2,3],
  'JUAN': [2,2,6,2],
  'CARLOS': [4,4],
  'JAVI': [1,1],
};

const POINT_STYLES = ['circle','rectRot','triangle','rect','star','crossRot','cross'];

function fmtDate(iso) {
  const [y,m,d] = iso.split('-');
  return `${d}/${m}`;
}
function fmtDateLong(iso) {
  const [y,m,d] = iso.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(d)} de ${months[parseInt(m)-1]}`;
}

// ============ TAB NAVIGATION ============
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('page-' + btn.dataset.tab).classList.add('active');
  });
});

// ============ PAGE 1: CLASIFICACIÓN ============
function renderScoreboard() {
  const el = document.getElementById('scoreboard');
  const maxPts = D.standings[0].points;
  el.innerHTML = D.standings.map(s => {
    const pct = maxPts > 0 ? (s.points / maxPts * 100) : 0;
    return `
      <div class="score-row rank-${s.rank}">
        <div class="score-rank">${s.rank}</div>
        <div class="score-name-block">
          <span class="score-name">${s.player}</span>
          <div class="score-bar-bg">
            <div class="score-bar-fill" style="width:${pct}%; background:${PLAYER_COLORS[s.player]}"></div>
          </div>
        </div>
        <div class="score-pts">${s.points}<span>PUNTOS</span></div>
      </div>
    `;
  }).join('');

  document.getElementById('matchesPlayedCount').textContent =
    D.matches.filter(m => m.actual).length;
}

function renderDaySelector() {
  const sel = document.getElementById('daySelect');
  sel.innerHTML = D.dates.map((d, i) =>
    `<option value="${i}">${fmtDateLong(d)}</option>`
  ).join('');
  sel.value = D.dates.length - 1;
  sel.addEventListener('change', renderDayStandings);
}

function renderDayStandings() {
  const idx = parseInt(document.getElementById('daySelect').value);
  const date = D.dates[idx];
  const prevDate = idx > 0 ? D.dates[idx-1] : null;

  const rows = PLAYERS.map(p => ({
    player: p,
    pts: D.cumulative_points[p][date],
    delta: D.daily_points[p][date],
  })).sort((a,b) => b.pts - a.pts);

  let rank = 0, prevPts = null;
  rows.forEach((r, i) => {
    if (r.pts !== prevPts) rank = i + 1;
    r.rank = rank;
    prevPts = r.pts;
  });

  const el = document.getElementById('dayStandings');
  el.innerHTML = rows.map(r => `
    <div class="day-row rank-${r.rank}">
      <div class="day-row-rank">${r.rank}</div>
      <div class="day-row-name">${r.player}</div>
      <div class="day-row-delta ${r.delta > 0 ? 'pos' : 'zero'}">${r.delta > 0 ? '+' + r.delta : '0'} ese día</div>
      <div class="day-row-pts">${r.pts}</div>
    </div>
  `).join('');
}

// ============ PAGE 2: GRÁFICOS ============
function buildDatasets(dataObj, isBar) {
  return PLAYERS.map((name, i) => {
    const base = {
      label: name,
      data: D.dates.map(d => dataObj[name][d]),
      borderColor: PLAYER_COLORS[name],
      backgroundColor: PLAYER_COLORS[name],
    };
    if (isBar) {
      return { ...base, borderRadius: 3, maxBarThickness: 14 };
    }
    return {
      ...base,
      borderDash: PLAYER_DASH[name],
      borderWidth: 2,
      pointRadius: 4,
      pointStyle: POINT_STYLES[i % POINT_STYLES.length],
      tension: 0,
    };
  });
}

function renderCharts() {
  const labels = D.dates.map(fmtDate);

  Chart.defaults.color = '#C9D4C7';
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.borderColor = 'rgba(244,241,232,0.08)';

  new Chart(document.getElementById('dailyChart'), {
    type: 'bar',
    data: { labels, datasets: buildDatasets(D.daily_points, true) },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Puntos del día', color: '#C9D4C7' }, ticks: { stepSize: 2 } },
        x: { grid: { display: false } }
      }
    }
  });

  new Chart(document.getElementById('posChart'), {
    type: 'line',
    data: { labels, datasets: buildDatasets(D.positions_by_day, false) },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { reverse: true, min: 0.5, max: 7.5, ticks: { stepSize: 1, callback: v => Number.isInteger(v) ? v : '' }, title: { display: true, text: 'Posición', color: '#C9D4C7' } },
        x: { grid: { display: false } }
      }
    }
  });

  new Chart(document.getElementById('cumChart'), {
    type: 'line',
    data: { labels, datasets: buildDatasets(D.cumulative_points, false) },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Puntos acumulados', color: '#C9D4C7' } },
        x: { grid: { display: false } }
      }
    }
  });

  document.getElementById('legendStrip').innerHTML = PLAYERS.map(p => `
    <div class="legend-item">
      <span class="legend-swatch" style="background:${PLAYER_COLORS[p]}"></span>${p}
    </div>
  `).join('');
}

// ============ PAGE 3: JORNADAS ============
function renderJornadaSelector() {
  const el = document.getElementById('jornadaSelector');
  el.innerHTML = D.dates.map((d, i) =>
    `<button class="jornada-pill ${i === D.dates.length-1 ? 'active' : ''}" data-date="${d}">${fmtDateLong(d)}</button>`
  ).join('');

  el.querySelectorAll('.jornada-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.jornada-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderJornadaContent(btn.dataset.date);
    });
  });

  renderJornadaContent(D.dates[D.dates.length-1]);
}

function renderJornadaContent(date) {
  const matches = D.matches.filter(m => m.date === date && m.actual);
  const el = document.getElementById('jornadaContent');

  if (matches.length === 0) {
    el.innerHTML = `<p style="color:var(--chalk-dim)">No hay partidos jugados ese día.</p>`;
    return;
  }

  el.innerHTML = matches.map(m => {
    const [home, away] = m.match.split('-');
    const [, actualScore] = m.actual.split('|');

    const predRows = PLAYERS.map(p => {
      const pred = m.predictions[p];
      const bd = m.breakdown[p];
      if (!pred) {
        return `
          <div class="pred-row">
            <span class="pred-player">${p}</span>
            <span class="pred-guess">—</span>
            <div class="pred-badges"><span class="badge b-miss">SIN APUESTA</span></div>
          </div>`;
      }
      const [, guessScore] = pred.split('|');
      const badges = [];
      if (bd.sign) badges.push('<span class="badge b-sign">SIGNO +1</span>');
      if (bd.diff) badges.push('<span class="badge b-diff">DIF. +1</span>');
      if (bd.exact) badges.push('<span class="badge b-exact">EXACTO +2</span>');
      if (!bd.sign) badges.push('<span class="badge b-miss">FALLO</span>');
      return `
        <div class="pred-row">
          <span class="pred-player">${p}</span>
          <span class="pred-guess">${guessScore}</span>
          <div class="pred-badges">${badges.join('')}<span class="pred-total">${bd.pts} pts</span></div>
        </div>`;
    }).join('');

    return `
      <div class="match-card">
        <div class="match-card-head">
          <div>
            <div class="match-group-tag">Grupo ${m.group}</div>
            <div class="match-teams">${home} – ${away}</div>
          </div>
          <div class="match-result">${actualScore}</div>
        </div>
        <div class="predictions-table">${predRows}</div>
      </div>
    `;
  }).join('');
}

// ============ PAGE 4: GRUPOS ============
let currentGroupPlayer = PLAYERS[0];

function renderGroupPlayerSelector() {
  const el = document.getElementById('groupPlayerSelector');
  el.innerHTML = PLAYERS.map(p =>
    `<button class="player-pill ${p === currentGroupPlayer ? 'active' : ''}" data-player="${p}">${p}</button>`
  ).join('');

  el.querySelectorAll('.player-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      currentGroupPlayer = btn.dataset.player;
      el.querySelectorAll('.player-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGroupsGrid();
    });
  });
}

function renderGroupsGrid() {
  const el = document.getElementById('groupsGrid');
  const groups = Object.keys(D.group_positions).sort();

  el.innerHTML = groups.map(g => {
    const realStandings = D.group_standings_real[g] || [];
    const realByPos = {};
    realStandings.forEach((row, i) => { realByPos[i+1] = row.team; });

    const rows = [1,2,3,4].map(pos => {
      const predTeam = D.group_positions[g][pos][currentGroupPlayer];
      const realTeam = realByPos[pos];
      const isMatch = realTeam && realTeam === predTeam;
      const realInfo = realStandings.length > 0
        ? `<span class="pos-team-real">${realTeam || '—'}${isMatch ? ' <span class=\"check-icon\">✓</span>' : ''}</span>`
        : '';
      return `
        <div class="group-pos-row ${isMatch ? 'match' : 'no-match'}">
          <span class="pos-num">${pos}</span>
          <div class="pos-team">
            <span class="pos-team-pred">${predTeam}</span>
            ${realInfo}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="group-card">
        <div class="group-card-title">Grupo ${g}</div>
        ${rows}
      </div>
    `;
  }).join('');
}

// ============ PAGE 5: PRÓXIMOS PARTIDOS ============
function getFutureDates() {
  const dates = [...new Set(D.matches.filter(m => !m.actual && m.date).map(m => m.date))];
  return dates.sort();
}

function renderProximosSelector() {
  const el = document.getElementById('proximosSelector');
  const dates = getFutureDates();

  if (dates.length === 0) {
    el.innerHTML = '';
    document.getElementById('proximosContent').innerHTML =
      `<p style="color:var(--chalk-dim)">No quedan partidos por jugar. ¡La fase de grupos ha terminado!</p>`;
    return;
  }

  el.innerHTML = dates.map((d, i) =>
    `<button class="jornada-pill ${i === 0 ? 'active' : ''}" data-date="${d}">${fmtDateLong(d)}</button>`
  ).join('');

  el.querySelectorAll('.jornada-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.jornada-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderProximosContent(btn.dataset.date);
    });
  });

  renderProximosContent(dates[0]);
}

function renderProximosContent(date) {
  const matches = D.matches.filter(m => m.date === date && !m.actual);
  const el = document.getElementById('proximosContent');

  if (matches.length === 0) {
    el.innerHTML = `<p style="color:var(--chalk-dim)">No hay partidos programados ese día.</p>`;
    return;
  }

  el.innerHTML = matches.map(m => {
    const [home, away] = m.match.split('-');

    const predRows = PLAYERS.map(p => {
      const pred = m.predictions[p];
      if (!pred) {
        return `
          <div class="pred-row">
            <span class="pred-player">${p}</span>
            <span class="pred-guess">—</span>
            <div class="pred-badges"><span class="badge b-miss">SIN APUESTA</span></div>
          </div>`;
      }
      const [sign, guessScore] = pred.split('|');
      const signLabel = sign === '1' ? 'Local' : (sign === 'X' ? 'Empate' : 'Visitante');
      return `
        <div class="pred-row">
          <span class="pred-player">${p}</span>
          <span class="pred-guess">${guessScore}</span>
          <div class="pred-badges"><span class="badge b-sign">${signLabel.toUpperCase()}</span></div>
        </div>`;
    }).join('');

    return `
      <div class="match-card">
        <div class="match-card-head">
          <div>
            <div class="match-group-tag">Grupo ${m.group}</div>
            <div class="match-teams">${home} – ${away}</div>
          </div>
          <div class="match-result pending">Por jugar</div>
        </div>
        <div class="predictions-table">${predRows}</div>
      </div>
    `;
  }).join('');
}

// ============ INIT ============
renderScoreboard();
renderDaySelector();
renderDayStandings();
renderCharts();
renderJornadaSelector();
renderProximosSelector();
renderGroupPlayerSelector();
renderGroupsGrid();
