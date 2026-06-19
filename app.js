// ============ SETUP ============
const D = PORRA_DATA;
const PLAYERS = D.players;

// Paleta fija por posición en la lista de jugadores (no por nombre), para que
// siga funcionando aunque alguien cambie su nombre en el Excel.
const COLOR_PALETTE = ['#D4A23C', '#6FA8DC', '#C44536', '#8B7BC4', '#4FAE7E', '#D67BB0', '#E8915C', '#5AC8C8', '#B0905A'];
const DASH_PALETTE = [[], [6,3], [2,2], [6,3,2,3], [2,2,6,2], [4,4], [1,1], [3,1,1,1], [5,2,1,2]];

const PLAYER_COLORS = {};
const PLAYER_DASH = {};
PLAYERS.forEach((p, i) => {
  PLAYER_COLORS[p] = COLOR_PALETTE[i % COLOR_PALETTE.length];
  PLAYER_DASH[p] = DASH_PALETTE[i % DASH_PALETTE.length];
});

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
let chartsRendered = false;
let chartInstances = [];

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('page-' + btn.dataset.tab).classList.add('active');

    if (btn.dataset.tab === 'graficos') {
      if (!chartsRendered) {
        // Esperamos un tick para que el navegador aplique display:block
        // antes de que Chart.js calcule el tamaño del canvas.
        setTimeout(() => {
          renderCharts();
          chartsRendered = true;
        }, 0);
      } else {
        setTimeout(() => chartInstances.forEach(c => c.resize()), 0);
      }
    }
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

  const c1 = new Chart(document.getElementById('dailyChart'), {
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

  const numPlayers = PLAYERS.length;
  const c2 = new Chart(document.getElementById('posChart'), {
    type: 'line',
    data: {
      labels,
      datasets: buildDatasets(D.positions_by_day, false)
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          reverse: true,
          min: 1,
          max: numPlayers,
          ticks: { stepSize: 1 },
          title: { display: true, text: 'Posición', color: '#C9D4C7' }
        },
        x: { grid: { display: false } }
      }
    }
  });

  const c3 = new Chart(document.getElementById('cumChart'), {
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

  chartInstances = [c1, c2, c3];

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
            <span class="pred-guess guess-miss">—</span>
            <div class="pred-badges"><span class="badge b-miss">SIN APUESTA</span></div>
          </div>`;
      }
      const [, guessScore] = pred.split('|');
      const badges = [];
      if (bd.sign) badges.push('<span class="badge b-sign">SIGNO +1</span>');
      if (bd.diff) badges.push('<span class="badge b-diff">DIF. +1</span>');
      if (bd.exact) badges.push('<span class="badge b-exact">EXACTO +2</span>');
      if (!bd.sign) badges.push('<span class="badge b-miss">FALLO</span>');
      let guessClass = 'guess-miss';
      if (bd.exact) guessClass = 'guess-exact';
      else if (bd.diff) guessClass = 'guess-diff';
      else if (bd.sign) guessClass = 'guess-sign';
      return `
        <div class="pred-row">
          <span class="pred-player">${p}</span>
          <span class="pred-guess ${guessClass}">${guessScore}</span>
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
// Puntos por posición de grupo acertada (según sistema de puntuación acordado)
const GROUP_POS_POINTS = { 1: 2, 2: 2, 3: 1, 4: 1 };

function calcGroupPointsForPlayer(player) {
  let total = 0;
  const groups = Object.keys(D.group_positions).sort();
  groups.forEach(g => {
    const realStandings = D.group_standings_real[g] || [];
    const realByPos = {};
    realStandings.forEach((row, i) => { realByPos[i + 1] = row.team; });
    [1, 2, 3, 4].forEach(pos => {
      const predTeam = D.group_positions[g][pos][player];
      const realTeam = realByPos[pos];
      if (realTeam && realTeam === predTeam) {
        total += GROUP_POS_POINTS[pos];
      }
    });
  });
  return total;
}

function renderGroupPlayerSelector() {
  // Banner resumen de puntos esperados por los 7, en vez de selector de un jugador
  const el = document.getElementById('groupPlayerSelector');
  const pts = PLAYERS.map(p => ({ player: p, pts: calcGroupPointsForPlayer(p) }))
    .sort((a, b) => b.pts - a.pts);
  const maxPts = Object.keys(D.group_positions).length * (GROUP_POS_POINTS[1] + GROUP_POS_POINTS[2] + GROUP_POS_POINTS[3] + GROUP_POS_POINTS[4]);

  el.innerHTML = `
    <div class="group-pts-summary">
      <span class="gps-title">Puntos esperados por posiciones de grupo (sobre ${maxPts}, con la clasificación actual)</span>
      <div class="gps-row">
        ${pts.map(x => `
          <div class="gps-item">
            <span class="gps-name" style="color:${PLAYER_COLORS[x.player]}">${x.player}</span>
            <span class="gps-val">${x.pts}</span>
          </div>
        `).join('')}
      </div>
      <p class="gps-disclaimer">
        ⚠️ Solo se puntúan las posiciones <strong>1ª y 2ª</strong> de cada grupo (clasificación directa) y el orden <strong>3º/4º</strong> dentro del grupo.
        Los <strong>mejores terceros</strong> que avanzan a dieciseisavos (8 de los 12 terceros) se calculan comparando puntos, diferencia de gol y goles a favor
        <em>entre los 12 grupos</em> — esa comparación todavía no está implementada aquí porque cambia partido a partido mientras se completa la fase de grupos.
        Se añadirá cuando estén jugados los 72 partidos.
      </p>
    </div>
  `;
}

function renderGroupsGrid() {
  const el = document.getElementById('groupsGrid');
  const groups = Object.keys(D.group_positions).sort();

  const cards = groups.map(g => {
    const realStandings = D.group_standings_real[g] || [];
    const realByPos = {};
    realStandings.forEach((row, i) => { realByPos[i + 1] = row.team; });
    const hasRealData = realStandings.length > 0;

    const rows = [1, 2, 3, 4].map(pos => {
      const realTeam = realByPos[pos];
      const display = hasRealData ? realTeam : '— por jugar —';

      // Para cada jugador, comprobar si acertó esta posición
      const playerChecks = PLAYERS.map(p => {
        const predTeam = D.group_positions[g][pos][p];
        const isMatch = hasRealData && realTeam === predTeam;
        const title = `${p}: ${predTeam}${isMatch ? ' ✓ acierto' : ''}`;
        return `<span class="player-dot ${isMatch ? 'hit' : ''}" style="${isMatch ? `background:${PLAYER_COLORS[p]}` : ''}" title="${title}">${isMatch ? p[0] : ''}</span>`;
      }).join('');

      return `
        <div class="group-pos-row ${hasRealData ? '' : 'no-data'}">
          <span class="pos-num">${pos}</span>
          <span class="pos-team-real">${display}</span>
          <div class="player-dots">${playerChecks}</div>
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

  el.innerHTML = `<div class="groups-grid-inner">${cards}</div>`;
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

    // Detectar si algún jugador va completamente solo con su signo (1/X/2)
    const activeSigns = {};
    PLAYERS.forEach(p => {
      const pred = m.predictions[p];
      if (pred) activeSigns[p] = pred.split('|')[0];
    });
    const signCounts = {};
    Object.values(activeSigns).forEach(s => { signCounts[s] = (signCounts[s] || 0) + 1; });
    const totalActive = Object.keys(activeSigns).length;

    const predRows = PLAYERS.map(p => {
      const pred = m.predictions[p];
      if (!pred) {
        return `
          <div class="pred-row">
            <span class="pred-player">${p}</span>
            <span class="pred-guess guess-miss">—</span>
            <div class="pred-badges"><span class="badge b-miss">SIN APUESTA</span></div>
          </div>`;
      }
      const [sign, guessScore] = pred.split('|');
      const signLabel = sign === '1' ? 'Local' : (sign === 'X' ? 'Empate' : 'Visitante');
      const signClass = sign === '1' ? 'badge-sign-1' : (sign === 'X' ? 'badge-sign-x' : 'badge-sign-2');
      // Va solo si es el único con ese signo entre 4 o más jugadores activos
      const isLone = totalActive >= 4 && signCounts[sign] === 1;
      return `
        <div class="pred-row ${isLone ? 'pred-row-lone' : ''}">
          <span class="pred-player">${p}</span>
          <span class="pred-guess">${guessScore}</span>
          <div class="pred-badges"><span class="badge ${signClass}">${signLabel.toUpperCase()}</span>${isLone ? '<span class="badge b-lone">VA SOLO</span>' : ''}</div>
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
renderJornadaSelector();
renderProximosSelector();
renderGroupPlayerSelector();
renderGroupsGrid();
