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
function sbListHTML(rows) {
  const maxPts = Math.max(...rows.map(r => r.pts), 1);
  return rows.map(r => {
    const pct = (r.pts / maxPts * 100);
    return `<div class="sb-col-row rank-${r.rank}">
      <span class="sb-col-rank">${r.rank}</span>
      <span class="sb-col-name" style="color:${PLAYER_COLORS[r.player]}">${r.player}</span>
      <span class="sb-col-pts">${r.pts}</span>
      <div class="sb-col-bar-bg"><div class="sb-col-bar-fill" style="width:${pct}%;background:${PLAYER_COLORS[r.player]}"></div></div>
    </div>`;
  }).join('');
}

function rankedRows(bucket) {
  const by = D.rounds_breakdown.by_player;
  const rows = PLAYERS.map(p => ({ player: p, pts: by[p][bucket] || 0 }))
    .sort((a, b) => b.pts - a.pts);
  let rank = 0, prev = null;
  rows.forEach((r, i) => {
    if (r.pts !== prev) rank = i + 1;
    r.rank = rank;
    prev = r.pts;
  });
  return rows;
}

function renderScoreboard() {
  const el = document.getElementById('scoreboard');
  el.innerHTML = `<div class="sb-general-list">${sbListHTML(rankedRows('general'))}</div>`;

  const groupPlayed = D.matches.filter(m => m.actual).length;
  let koPlayed = 0;
  if (D.ko_stage && D.ko_stage.rounds) {
    Object.values(D.ko_stage.rounds).forEach(r => {
      koPlayed += (r.matches || []).filter(m => m.actual).length;
    });
  }
  document.getElementById('matchesPlayedCount').textContent = groupPlayed + koPlayed;

  renderRoundBreakdownSelector();
}

function renderRoundBreakdownSelector() {
  const rb = D.rounds_breakdown;
  const buckets = rb.order.filter(k => k !== 'general');
  const sel = document.getElementById('roundBreakdownSelector');
  sel.innerHTML = buckets.map((k, i) =>
    `<button class="jornada-pill ${i === 0 ? 'active' : ''}" data-bucket="${k}">${rb.labels[k]}</button>`
  ).join('');
  sel.querySelectorAll('.jornada-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      sel.querySelectorAll('.jornada-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderRoundBreakdownContent(btn.dataset.bucket);
    });
  });
  renderRoundBreakdownContent(buckets[0]);
}

function renderRoundBreakdownContent(bucket) {
  const el = document.getElementById('roundBreakdownContent');
  el.innerHTML = sbListHTML(rankedRows(bucket));
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

// Gráfico de posiciones construido con SVG puro (sin Chart.js).
// Usamos un viewBox fijo y porcentajes, así no depende de medir el
// contenedor en el momento de pintarlo — funciona aunque la pestaña
// estuviera oculta justo antes, que era la causa de que Chart.js fallara aquí.
function renderPositionChart() {
  const container = document.getElementById('posChartContainer');
  const dates = D.dates;
  const n = PLAYERS.length;
  if (dates.length === 0) {
    container.innerHTML = '<p style="color:var(--chalk-dim);font-size:13px;">Aún no hay datos suficientes.</p>';
    return;
  }

  const W = 900, H = 320;
  const padL = 36, padR = 16, padT = 16, padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xFor = i => dates.length === 1 ? padL + plotW / 2 : padL + (i / (dates.length - 1)) * plotW;
  const yFor = pos => padT + ((pos - 1) / Math.max(1, n - 1)) * plotH;

  // Líneas horizontales guía (una por cada posición posible)
  let gridLines = '';
  for (let pos = 1; pos <= n; pos++) {
    const y = yFor(pos);
    gridLines += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(244,241,232,0.07)" stroke-width="1"/>`;
    gridLines += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#C9D4C7" font-family="Space Mono, monospace">${pos}</text>`;
  }

  // Etiquetas de fecha en el eje X (todas si caben pocas, si no cada 2)
  let xLabels = '';
  const step = dates.length > 10 ? 2 : 1;
  dates.forEach((d, i) => {
    if (i % step !== 0 && i !== dates.length - 1) return;
    const x = xFor(i);
    xLabels += `<text x="${x}" y="${H - padB + 18}" text-anchor="middle" font-size="10" fill="#C9D4C7" font-family="Inter, sans-serif">${fmtDate(d)}</text>`;
  });

  // Una polilínea + puntos por jugador
  let seriesSvg = '';
  PLAYERS.forEach((p, pi) => {
    const positions = D.positions_by_day[p] || [];
    const points = dates.map((d, i) => `${xFor(i)},${yFor(positions[i] || n)}`).join(' ');
    const color = PLAYER_COLORS[p];
    const dash = (PLAYER_DASH[p] || []).join(',');

    seriesSvg += `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5"
      stroke-dasharray="${dash}" stroke-linejoin="round" stroke-linecap="round" opacity="0.95"/>`;

    dates.forEach((d, i) => {
      const x = xFor(i);
      const y = yFor(positions[i] || n);
      seriesSvg += `<circle cx="${x}" cy="${y}" r="4" fill="${color}" stroke="var(--ink)" stroke-width="1.5">
        <title>${p}: posición ${positions[i]} el ${fmtDateLong(d)}</title>
      </circle>`;
    });
  });

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:280px;display:block" role="img"
         aria-label="Gráfico de líneas mostrando la posición diaria de cada jugador">
      ${gridLines}
      ${xLabels}
      ${seriesSvg}
      <text x="${padL - 28}" y="${padT}" font-size="10" fill="#C9D4C7" font-family="Inter, sans-serif" transform="rotate(-90 ${padL-28} ${padT})" text-anchor="end"></text>
    </svg>
  `;
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

  // El gráfico de posiciones se construye aparte con HTML/CSS puro (ver
  // renderPositionChart) en vez de Chart.js, porque un canvas con eje
  // invertido (1=arriba) dentro de una pestaña que empieza oculta daba
  // problemas de renderizado poco fiables.
  renderPositionChart();

  const c3 = new Chart(document.getElementById('cumChart'), {
    type: 'line',
    data: { labels, datasets: buildDatasets(D.cumulative_points, false) },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Puntos totales acumulados', color: '#C9D4C7' } },
        x: { grid: { display: false } }
      }
    }
  });

  chartInstances = [c1, c3];

  document.getElementById('legendStrip').innerHTML = PLAYERS.map(p => `
    <div class="legend-item">
      <span class="legend-swatch" style="background:${PLAYER_COLORS[p]}"></span>${p}
    </div>
  `).join('');
}

// ============ PAGE 3: JORNADAS ============
const KO_ROUND_ORDER = ['dieciseisavos', 'octavos', 'cuartos', 'semis', 'tercer_puesto', 'final'];
const KO_ROUND_PILL_LABELS = {
  dieciseisavos: '1/16', octavos: 'Octavos', cuartos: 'Cuartos',
  semis: 'Semis', tercer_puesto: '3º puesto', final: 'Final',
};

function koPlayedMatches(roundName) {
  const ko = D.ko_stage;
  if (!ko || !ko.rounds || !ko.rounds[roundName]) return [];
  return (ko.rounds[roundName].matches || []).filter(m => m.actual);
}
function koPendingMatches(roundName) {
  const ko = D.ko_stage;
  if (!ko || !ko.rounds || !ko.rounds[roundName]) return [];
  return (ko.rounds[roundName].matches || []).filter(m => !m.actual);
}

function renderJornadaSelector() {
  const el = document.getElementById('jornadaSelector');
  const dayPills = D.dates.map((d, i) =>
    `<button class="jornada-pill ${i === D.dates.length-1 ? 'active' : ''}" data-kind="date" data-date="${d}">${fmtDateLong(d)}</button>`
  );
  const koRounds = KO_ROUND_ORDER.filter(r => koPlayedMatches(r).length > 0);
  const koPills = koRounds.map(r =>
    `<button class="jornada-pill ko-pill" data-kind="ko" data-round="${r}">${KO_ROUND_PILL_LABELS[r]}</button>`
  );
  el.innerHTML = dayPills.join('') + koPills.join('');

  el.querySelectorAll('.jornada-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.jornada-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.kind === 'ko') renderJornadaContentKo(btn.dataset.round);
      else renderJornadaContent(btn.dataset.date);
    });
  });

  renderJornadaContent(D.dates[D.dates.length-1]);
}

// Tarjeta de partido reutilizable (fase de grupos y dieciseisavos, que sí
// puntúan por marcador exacto/diferencia/signo).
function scoredMatchCardHTML(tag, home, away, actualScore, predictions, breakdown) {
  const predRows = PLAYERS.map(p => {
    const pred = predictions[p];
    const bd = breakdown[p];
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
    if (bd.sign) badges.push('<span class="badge b-sign">SIGNO</span>');
    if (bd.diff) badges.push('<span class="badge b-diff">DIF.</span>');
    if (bd.exact) badges.push('<span class="badge b-exact">EXACTO</span>');
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
          <div class="match-group-tag">${tag}</div>
          <div class="match-teams">${home} – ${away}</div>
        </div>
        <div class="match-result">${actualScore}</div>
      </div>
      <div class="predictions-table">${predRows}</div>
    </div>
  `;
}

// Tarjeta simple de resultado (octavos en adelante: no hay puntuación por
// marcador, solo interesa quién ganó y avanzó).
function simpleResultCardHTML(tag, home, away, actualScore, homeLost, awayLost) {
  return `
    <div class="match-card">
      <div class="match-card-head">
        <div>
          <div class="match-group-tag">${tag}</div>
          <div class="match-teams">
            <span class="${homeLost ? 'kol-team lost' : ''}">${home}</span> – <span class="${awayLost ? 'kol-team lost' : ''}">${away}</span>
          </div>
        </div>
        <div class="match-result">${actualScore}</div>
      </div>
    </div>
  `;
}

function renderJornadaContentKo(roundName) {
  const el = document.getElementById('jornadaContent');
  const matches = koPlayedMatches(roundName);
  const ko = D.ko_stage;
  if (matches.length === 0) {
    el.innerHTML = `<p style="color:var(--chalk-dim)">Aún no hay partidos jugados en esta ronda.</p>`;
    return;
  }
  const tag = KO_ROUND_PILL_LABELS[roundName];
  el.innerHTML = matches.map(m => {
    const home = m.home_team || koRefLabel(m.home_ref);
    const away = m.away_team || koRefLabel(m.away_ref);
    const actualScore = formatKoScore(m);
    if (roundName === 'dieciseisavos' && m.breakdown) {
      return scoredMatchCardHTML(tag, home, away, actualScore, m.predictions, m.breakdown);
    }
    const homeLost = ko.eliminated_teams && ko.eliminated_teams.includes(m.home_team);
    const awayLost = ko.eliminated_teams && ko.eliminated_teams.includes(m.away_team);
    return simpleResultCardHTML(tag, home, away, actualScore, homeLost, awayLost);
  }).join('');
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

function getAdvancingTeams() {
  // 1º y 2º de cada grupo + los 8 mejores terceros
  const advancing = new Set();
  Object.values(D.group_standings_real || {}).forEach(rows => {
    rows.forEach(r => {
      if (r.position === 1 || r.position === 2) advancing.add(r.team);
    });
  });
  (D.third_place_ranking || []).forEach(t => {
    if (t.advances) advancing.add(t.team);
  });
  return advancing;
}

function renderGroupPlayerSelector() {
  // La clasificación de fase de grupos ya está consolidada en la pestaña Clasificación.
  const el = document.getElementById('groupPlayerSelector');
  if (el) el.innerHTML = '';
}

function renderThirdPlaceTable() {
  const el = document.getElementById('thirdPlaceTable');
  if (!el) return;
  const thirds = D.third_place_ranking || [];
  if (thirds.length === 0) {
    el.innerHTML = '<p style="color:var(--chalk-dim);font-size:13px;">Aún no hay suficientes datos para calcular el ranking de terceros (requiere clasificación oficial vía API).</p>';
    return;
  }
  el.innerHTML = `
    <div class="section-divider"><span>Ranking de mejores terceros</span></div>
    <p class="page-sub" style="margin-bottom:16px;">Pasan a dieciseisavos los 8 mejores de los 12 — el orden entre ellos no importa para la porra, solo si están dentro o fuera de los 8</p>
    <div class="third-place-list">
      ${thirds.map(t => `
        <div class="third-place-row ${t.advances ? 'advances' : 'out'}">
          <span class="tp-rank">${t.ranking}</span>
          <span class="tp-team">${t.team}</span>
          <span class="tp-group">Grupo ${t.group}</span>
          <span class="tp-stats">${t.pts} pts · ${t.gd > 0 ? '+' : ''}${t.gd} dif. · ${t.gf} GF</span>
          <span class="tp-status">${t.advances ? '✓ clasifica' : '✗ eliminado'}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderGroupsGrid() {
  const el = document.getElementById('groupsGrid');
  const groups = Object.keys(D.group_positions).sort();
  const advancing = getAdvancingTeams();

  const cards = groups.map(g => {
    const realStandings = D.group_standings_real[g] || [];
    const realByPos = {};
    realStandings.forEach(row => { realByPos[row.position] = row; });
    const hasRealData = realStandings.length > 0;

    const rows = [1, 2, 3, 4].map(pos => {
      const realRow = realByPos[pos];
      const realTeam = realRow ? realRow.team : null;
      const display = hasRealData ? (realTeam || '— sin datos —') : '— por jugar —';
      const ptsTag = realRow && typeof realRow.pts === 'number'
        ? `<span class="team-pts">${realRow.pts} pts</span>`
        : '';
      const qualifiedTag = realTeam && advancing.has(realTeam)
        ? '<span class="qualified-tag" title="Clasificado a dieciseisavos">✓</span>'
        : '';

      const playerChecks = PLAYERS.map(p => {
        const predTeam = D.group_positions[g][pos][p];
        const isMatch = hasRealData && realTeam === predTeam;
        const title = `${p}: ${predTeam}${isMatch ? ' ✓ acierto' : ''}`;
        return `<span class="player-dot ${isMatch ? 'hit' : ''}" style="${isMatch ? `background:${PLAYER_COLORS[p]}` : ''}" title="${title}">${isMatch ? p[0] : ''}</span>`;
      }).join('');

      return `
        <div class="group-pos-row ${hasRealData ? '' : 'no-data'}">
          <div class="gpr-top">
            <span class="pos-num">${pos}</span>
            <span class="pos-team-real">${display} ${qualifiedTag}</span>
            ${ptsTag}
          </div>
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
  const koRounds = KO_ROUND_ORDER.filter(r => koPendingMatches(r).length > 0);

  if (dates.length === 0 && koRounds.length === 0) {
    el.innerHTML = '';
    document.getElementById('proximosContent').innerHTML =
      `<p style="color:var(--chalk-dim)">No quedan partidos por jugar. ¡El Mundial ha terminado!</p>`;
    return;
  }

  const dayPills = dates.map((d, i) =>
    `<button class="jornada-pill ${i === 0 && dates.length ? 'active' : ''}" data-kind="date" data-date="${d}">${fmtDateLong(d)}</button>`
  );
  const koPills = koRounds.map((r, i) =>
    `<button class="jornada-pill ko-pill ${dates.length === 0 && i === 0 ? 'active' : ''}" data-kind="ko" data-round="${r}">${KO_ROUND_PILL_LABELS[r]}</button>`
  );
  el.innerHTML = dayPills.join('') + koPills.join('');

  el.querySelectorAll('.jornada-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.jornada-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.kind === 'ko') renderProximosContentKo(btn.dataset.round);
      else renderProximosContent(btn.dataset.date);
    });
  });

  if (dates.length > 0) renderProximosContent(dates[0]);
  else renderProximosContentKo(koRounds[0]);
}

// Ronda 1/16: aún hay marcador que adivinar, mostramos tarjeta de
// pronóstico igual que en fase de grupos. Octavos en adelante: no hay
// marcador que puntúe, mostramos qué equipo ha puesto cada jugador para
// esa ronda (a partir de sus slots de clasificados, "vivo" o "eliminado").
function renderProximosContentKo(roundName) {
  const el = document.getElementById('proximosContent');
  const ko = D.ko_stage;

  if (roundName === 'dieciseisavos') {
    const matches = koPendingMatches('dieciseisavos');
    if (matches.length === 0) {
      el.innerHTML = `<p style="color:var(--chalk-dim)">No quedan partidos de 1/16 por jugar.</p>`;
      return;
    }
    el.innerHTML = matches.map(m => {
      const home = m.home_team || koRefLabel(m.home_ref);
      const away = m.away_team || koRefLabel(m.away_ref);
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
        return `
          <div class="pred-row">
            <span class="pred-player">${p}</span>
            <span class="pred-guess">${guessScore}</span>
            <div class="pred-badges"><span class="badge ${signClass}">${signLabel.toUpperCase()}</span></div>
          </div>`;
      }).join('');
      return `
        <div class="match-card">
          <div class="match-card-head">
            <div>
              <div class="match-group-tag">1/16</div>
              <div class="match-teams">${home} – ${away}</div>
            </div>
            <div class="match-result pending">Por jugar</div>
          </div>
          <div class="predictions-table">${predRows}</div>
        </div>
      `;
    }).join('');
    return;
  }

  // Octavos, cuartos, semis, 3º puesto, final: tabla de "quién ha puesto
  // cada jugador para llegar aquí", coloreada vivo/eliminado.
  const slots = (ko.qualifiers && ko.qualifiers[roundName]) || [];
  if (slots.length === 0) {
    el.innerHTML = `<p style="color:var(--chalk-dim)">Esta ronda todavía no se puede pronosticar.</p>`;
    return;
  }
  el.innerHTML = `
    <div class="match-card">
      <div class="match-card-head">
        <div class="match-teams">Pronósticos para ${KO_ROUND_PILL_LABELS[roundName]}</div>
      </div>
      <div class="predictions-table">
        ${PLAYERS.map(p => {
          const chips = slots.map(slot => {
            const pred = slot.predictions[p];
            if (!pred || !pred.team) return '<span class="ko-qual-chip pending">—</span>';
            const cls = pred.status === 'eliminado' ? 'miss' : (pred.status === 'clasificado' ? 'hit' : (pred.status === 'vivo' ? 'alive' : 'pending'));
            return `<span class="ko-qual-chip ${cls}">${pred.team}</span>`;
          }).join('');
          return `
            <div class="pred-row">
              <span class="pred-player">${p}</span>
              <div class="pred-badges">${chips}</div>
            </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function renderProximosContent(date) {
  const matches = D.matches
    .filter(m => m.date === date && !m.actual)
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
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
          <div class="match-result pending">${m.time ? `${m.time} (España)` : 'Por jugar'}</div>
        </div>
        <div class="predictions-table">${predRows}</div>
      </div>
    `;
  }).join('');
}

// ============ PAGE 6: ELIMINATORIA (bracket real de torneo) ============
const KO_ROUND_LABELS = {
  dieciseisavos: 'Dieciseisavos',
  octavos: 'Octavos',
  cuartos: 'Cuartos',
  semis: 'Semis',
};

// Misma estructura de árbol que scripts/bracket_structure.py — dos mitades
// que convergen hacia el centro (donde está la semifinal de cada lado,
// y la final las une a ambas). Replicada aquí porque el navegador no
// puede importar el módulo Python.
const BRACKET_TREE = {
  left: {
    dieciseisavos: [73, 75, 74, 77, 83, 84, 81, 82],
    octavos: [90, 89, 93, 94],
    cuartos: [97, 98],
    semis: [101],
  },
  right: {
    dieciseisavos: [76, 78, 79, 80, 86, 88, 85, 87],
    octavos: [91, 92, 95, 96],
    cuartos: [99, 100],
    semis: [102],
  },
};
const ROUND_KEYS = ['dieciseisavos', 'octavos', 'cuartos', 'semis'];

function koTeamLabel(team) {
  return team || '?';
}

// Traduce una referencia de bracket ('2A', '1E', '3ABCDF', 'W73'...) a un
// texto legible que explica de dónde sale ese equipo (p.ej. "2º Grupo A",
// "Mejor 3º (varios grupos)", "Ganador P73").
// Marcador de un partido KO, con la tanda de penaltis si el 90' quedó
// empatado y ya se sabe quién ganó la tanda.
function formatKoScore(m) {
  const score = (m.actual || '').split('|')[1] || '';
  return m.penalties ? `${score} (pen. ${m.penalties})` : score;
}

function koRefLabel(ref) {
  if (!ref) return '';
  let m = ref.match(/^([123])([A-L])$/);
  if (m) {
    const pos = { '1': '1º', '2': '2º', '3': '3º' }[m[1]];
    return `${pos} Grupo ${m[2]}`;
  }
  m = ref.match(/^3([A-L]+)$/);
  if (m) return `Mejor 3º (Grupos ${m[1].split('').join(', ')})`;
  m = ref.match(/^W(\d+)$/);
  if (m) return `Ganador P${m[1]}`;
  m = ref.match(/^L(\d+)$/);
  if (m) return `Perdedor P${m[1]}`;
  if (ref === 'WF') return 'Ganador Final';
  if (ref === 'LF') return 'Perdedor Final';
  return ref;
}

function getKoMatchByNum(ko, num) {
  for (const roundName of ROUND_KEYS) {
    const matches = (ko.rounds[roundName] && ko.rounds[roundName].matches) || [];
    const found = matches.find(m => m.num === num);
    if (found) return found;
  }
  return null;
}

// Construye el HTML de una "rama": columnas de izquierda a derecha (o
// derecha a izquierda si side='right') con separación vertical creciente
// para que cada partido quede centrado entre los dos que lo alimentan.
// mode: 'real' (bracket oficial) o 'player' (predicciones de un jugador)
function renderBracketHalf(ko, side, mode, player) {
  const tree = BRACKET_TREE[side];
  const roundsHtml = ROUND_KEYS.map((roundName, ri) => {
    const nums = tree[roundName];
    // Espaciado: cada ronda dobla el espacio vertical entre tarjetas
    // respecto a la anterior, para que las líneas converjan visualmente.
    const gapClass = `ko-gap-r${ri}`;
    const cards = nums.map(num => {
      const m = getKoMatchByNum(ko, num);
      if (!m) return `<div class="ko-card-slot empty"></div>`;

      if (mode === 'real') {
        const home = koTeamLabel(m.home_team);
        const away = koTeamLabel(m.away_team);
        const hasResult = !!m.actual;
        let resultHtml = '<span class="ko-pending">vs</span>';
        if (hasResult) {
          const score = formatKoScore(m);
          resultHtml = `<span class="ko-score">${score.replace('-', ' – ')}</span>`;
        }
        const homeLost = hasResult && m.home_team && ko.eliminated_teams.includes(m.home_team);
        const awayLost = hasResult && m.away_team && ko.eliminated_teams.includes(m.away_team);
        const homeCriteria = koRefLabel(m.home_ref);
        const awayCriteria = koRefLabel(m.away_ref);
        return `
          <div class="ko-card-slot">
            <div class="ko-real-card ${hasResult ? 'played' : ''}">
              <span class="ko-match-num">P${num}</span>
              <div class="ko-real-team-block">
                <div class="ko-real-team ${homeLost ? 'lost' : ''}">${home}</div>
                <div class="ko-ref-label">${homeCriteria}</div>
              </div>
              ${resultHtml}
              <div class="ko-real-team-block">
                <div class="ko-real-team ${awayLost ? 'lost' : ''}">${away}</div>
                <div class="ko-ref-label">${awayCriteria}</div>
              </div>
            </div>
          </div>
        `;
      } else {
        // mode === 'player': en dieciseisavos mostramos la predicción del
        // partido (con colores de acierto); de octavos en adelante no hay
        // "partido" predicho como tal en este nivel (el jugador predijo
        // equipos por slot, no por cruce), así que mostramos los dos
        // equipos reales del cruce con su estado vivo/eliminado, y dejamos
        // la franja de "clasificados predichos" aparte, debajo del árbol.
        if (roundName === 'dieciseisavos') {
          const pred = m.predictions[player];
          const bd = pred && m.actual && m.breakdown ? m.breakdown[player] : null;
          let cls = 'pending';
          let label = pred ? pred.split('|')[1] : '—';
          if (bd) cls = bd.sign ? (bd.exact ? 'hit-exact' : (bd.diff ? 'hit-diff' : 'hit-sign')) : 'miss';
          return `
            <div class="ko-card-slot">
              <div class="ko-pred-card ${cls} compact">
                <span class="ko-pred-teams">${koTeamLabel(m.home_team)} – ${koTeamLabel(m.away_team)}</span>
                <span class="ko-pred-guess">${label}${bd ? ` <b>+${bd.pts}</b>` : ''}</span>
              </div>
            </div>
          `;
        }
        const home = koTeamLabel(m.home_team);
        const away = koTeamLabel(m.away_team);
        const homeLost = m.home_team && ko.eliminated_teams.includes(m.home_team);
        const awayLost = m.away_team && ko.eliminated_teams.includes(m.away_team);
        return `
          <div class="ko-card-slot">
            <div class="ko-real-card compact">
              <div class="ko-real-team ${homeLost ? 'lost' : ''}">${home}</div>
              <span class="ko-pending">vs</span>
              <div class="ko-real-team ${awayLost ? 'lost' : ''}">${away}</div>
            </div>
          </div>
        `;
      }
    }).join('');

    return `<div class="ko-round-col ${gapClass}">${cards}</div>`;
  });

  return roundsHtml;
}

// La franja de "equipo predicho para esta ronda" (lo que el jugador puso
// en Octavofinalista-N, Cuartofinalista-N, etc.), coloreada vivo/eliminado.
function renderQualifiersStrip(ko, player) {
  const rounds = ['octavos', 'cuartos', 'semis', 'tercer_puesto', 'final'];
  const labels = { octavos: 'Pasan a Cuartos', cuartos: 'Pasan a Semis', semis: 'Pasan a Final', tercer_puesto: '3º puesto', final: 'Campeón / Subcampeón' };
  const blocks = rounds.map(roundName => {
    const slots = ko.qualifiers[roundName] || [];
    if (slots.length === 0) return '';
    return `
      <div class="ko-qual-block">
        <div class="ko-qual-title">${labels[roundName]}</div>
        <div class="ko-qual-items">
          ${slots.map(slot => {
            const pred = slot.predictions[player];
            if (!pred || !pred.team) {
              return `<span class="ko-qual-chip pending">—</span>`;
            }
            const cls = pred.status === 'eliminado' ? 'miss' : (pred.status === 'clasificado' ? 'hit' : (pred.status === 'vivo' ? 'alive' : 'pending'));
            return `<span class="ko-qual-chip ${cls}">${pred.team}</span>`;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
  return `<div class="ko-qual-strip">${blocks}</div>`;
}

function renderFinalCenter(ko, mode, player) {
  const finalMatches = (ko.rounds.final && ko.rounds.final.matches) || [];
  const thirdMatches = (ko.rounds.tercer_puesto && ko.rounds.tercer_puesto.matches) || [];
  const fm = finalMatches[0];
  const tm = thirdMatches[0];
  if (!fm) return '';

  const home = koTeamLabel(fm.home_team);
  const away = koTeamLabel(fm.away_team);
  const hasResult = !!fm.actual;
  let resultHtml = '<span class="ko-pending">vs</span>';
  if (hasResult) {
    const score = formatKoScore(fm);
    resultHtml = `<span class="ko-score">${score.replace('-', ' – ')}</span>`;
  }
  const homeLost = hasResult && fm.home_team && ko.eliminated_teams.includes(fm.home_team);
  const awayLost = hasResult && fm.away_team && ko.eliminated_teams.includes(fm.away_team);

  const honor = ko.honor || {};
  const honorHtml = mode === 'real' && (honor.champion || honor.runner_up) ? `
    <div class="ko-honor">
      ${honor.champion ? `<div class="ko-honor-item gold">🥇 ${honor.champion}</div>` : ''}
      ${honor.runner_up ? `<div class="ko-honor-item silver">🥈 ${honor.runner_up}</div>` : ''}
      ${honor.third_place ? `<div class="ko-honor-item bronze">🥉 ${honor.third_place}</div>` : ''}
    </div>
  ` : '';

  return `
    <div class="ko-final-center">
      <div class="ko-final-label">🏆 FINAL</div>
      <div class="ko-real-card final-card ${hasResult ? 'played' : ''}">
        <div class="ko-real-team ${homeLost ? 'lost' : ''}">${home}</div>
        ${resultHtml}
        <div class="ko-real-team ${awayLost ? 'lost' : ''}">${away}</div>
      </div>
      ${honorHtml}
    </div>
  `;
}

function renderFullBracket(ko, mode, player) {
  const leftCols = renderBracketHalf(ko, 'left', mode, player);
  const rightCols = renderBracketHalf(ko, 'right', mode, player);
  const center = renderFinalCenter(ko, mode, player);

  return `
    <div class="ko-tree-scroll">
      <div class="ko-tree">
        <div class="ko-tree-half">${leftCols.join('')}</div>
        <div class="ko-tree-center">${center}</div>
        <div class="ko-tree-half right">${rightCols.join('')}</div>
      </div>
    </div>
  `;
}

// --- Bracket real ---
// Mobile-friendly list view of bracket
function renderKoListView(ko, mode, player) {
  const ROUND_ORDER = ['dieciseisavos', 'octavos', 'cuartos', 'semis'];
  const ROUND_LABELS_LIST = {
    dieciseisavos: '1/16 — Dieciseisavos de final',
    octavos: '1/8 — Octavos de final',
    cuartos: '1/4 — Cuartos de final',
    semis: 'Semifinales',
  };

  const sections = ROUND_ORDER.map(roundName => {
    const matches = (ko.rounds[roundName] && ko.rounds[roundName].matches) || [];
    if (!matches.length) return '';
    const cards = matches.map(m => {
      const home = m.home_team || '?';
      const away = m.away_team || '?';
      const hasResult = !!m.actual;
      const homeLost = hasResult && ko.eliminated_teams && ko.eliminated_teams.includes(m.home_team);
      const awayLost = hasResult && ko.eliminated_teams && ko.eliminated_teams.includes(m.away_team);

      let scoreHtml = '<span class="kol-vs">vs</span>';
      if (hasResult) {
        const score = formatKoScore(m);
        scoreHtml = `<span class="kol-score">${score.replace('-', ' – ')}</span>`;
      }

      if (mode === 'real') {
        return `
          <div class="kol-match ${hasResult ? 'played' : ''}">
            <span class="kol-num">P${m.num}</span>
            <div class="kol-teams">
              <span class="kol-team ${homeLost ? 'lost' : ''}">${home}</span>
              ${scoreHtml}
              <span class="kol-team ${awayLost ? 'lost' : ''}">${away}</span>
            </div>
          </div>`;
      } else {
        // player view for dieciseisavos: show prediction
        if (roundName === 'dieciseisavos') {
          const pred = m.predictions && m.predictions[player];
          const bd = pred && m.actual && m.breakdown ? m.breakdown[player] : null;
          let cls = 'pending', label = pred ? pred.split('|')[1] : '—';
          if (bd) cls = bd.sign ? (bd.exact ? 'hit-exact' : (bd.diff ? 'hit-diff' : 'hit-sign')) : 'miss';
          const predSign = pred ? pred.split('|')[0] : null;
          const predWin = predSign === '1' ? home : (predSign === '2' ? away : 'Empate');
          return `
            <div class="kol-match ${cls}">
              <span class="kol-num">P${m.num}</span>
              <div class="kol-teams">
                <span class="kol-team ${homeLost ? 'lost' : ''}">${home}</span>
                <span class="kol-pred">${label}${bd ? ' <b>+'+bd.pts+'</b>' : ''}</span>
                <span class="kol-team ${awayLost ? 'lost' : ''}">${away}</span>
              </div>
              <div class="kol-winner-pred">👉 <b style="color:${predSign==='1'?PLAYER_COLORS[player]:'var(--chalk-dim)'}">${predWin}</b>${bd && bd.sign ? ' ✓' : (bd ? ' ✗' : '')}</div>
            </div>`;
        }
        return `
          <div class="kol-match ${hasResult ? 'played' : ''}">
            <span class="kol-num">P${m.num}</span>
            <div class="kol-teams">
              <span class="kol-team ${homeLost ? 'lost' : ''}">${home}</span>
              ${scoreHtml}
              <span class="kol-team ${awayLost ? 'lost' : ''}">${away}</span>
            </div>
          </div>`;
      }
    }).join('');

    // For player mode, also show predicted qualifiers for NEXT round
    let qualHtml = '';
    if (mode === 'player') {
      const nextRound = ROUND_ORDER[ROUND_ORDER.indexOf(roundName) + 1] || 'semis';
      const QUAL_MAP = { dieciseisavos: 'octavos', octavos: 'cuartos', cuartos: 'semis', semis: 'final' };
      const qualRound = QUAL_MAP[roundName];
      const slots = qualRound && ko.qualifiers && ko.qualifiers[qualRound] || [];
      if (slots.length) {
        qualHtml = `<div class="kol-qual-row"><span class="kol-qual-label">Predichos →</span>${
          slots.map(slot => {
            const pred = slot.predictions && slot.predictions[player];
            if (!pred || !pred.team) return '<span class="ko-qual-chip pending">—</span>';
            const cls = pred.status === 'eliminado' ? 'miss' : (pred.status === 'clasificado' ? 'hit' : (pred.status === 'vivo' ? 'alive' : 'pending'));
            return `<span class="ko-qual-chip ${cls}">${pred.team}</span>`;
          }).join('')
        }</div>`;
      }
    }

    return `
      <div class="kol-section">
        <div class="kol-round-title">${ROUND_LABELS_LIST[roundName]}</div>
        ${cards}
        ${qualHtml}
      </div>`;
  }).join('');

  // Final
  const finalMatch = ko.rounds.final && ko.rounds.final.matches && ko.rounds.final.matches[0];
  const thirdMatch = ko.rounds.tercer_puesto && ko.rounds.tercer_puesto.matches && ko.rounds.tercer_puesto.matches[0];
  let finalHtml = '';
  if (finalMatch) {
    const fh = finalMatch.home_team || '?', fa = finalMatch.away_team || '?';
    const fHasResult = !!finalMatch.actual;
    const fHomeLost = fHasResult && ko.eliminated_teams && ko.eliminated_teams.includes(finalMatch.home_team);
    const fAwayLost = fHasResult && ko.eliminated_teams && ko.eliminated_teams.includes(finalMatch.away_team);
    const fScore = fHasResult ? `<span class="kol-score">${formatKoScore(finalMatch).replace('-',' – ')}</span>` : '<span class="kol-vs">vs</span>';
    // honor
    const honor = ko.honor || {};
    const honorHtml = honor.champion ? `<div class="kol-honor">🥇 ${honor.champion}${honor.runner_up ? ' · 🥈 '+honor.runner_up : ''}${honor.third_place ? ' · 🥉 '+honor.third_place : ''}</div>` : '';
    finalHtml = `
      <div class="kol-section kol-final">
        <div class="kol-round-title">🏆 Final</div>
        <div class="kol-match played-final">
          <div class="kol-teams">
            <span class="kol-team ${fHomeLost ? 'lost' : ''}">${fh}</span>
            ${fScore}
            <span class="kol-team ${fAwayLost ? 'lost' : ''}">${fa}</span>
          </div>
        </div>
        ${honorHtml}
      </div>`;
  }

  return `<div class="ko-list-view">${sections}${finalHtml}</div>`;
}

function renderKoRealBracket() {
  const el = document.getElementById('koRealBracket');
  const ko = D.ko_stage;
  if (!ko || !ko.rounds || Object.keys(ko.rounds).length === 0) {
    el.innerHTML = '<p class="ko-empty">Esta sección se rellenará cuando empiece la fase eliminatoria.</p>';
    return;
  }
  // On small screens use list view, on large screens use bracket tree
  const isMobile = window.innerWidth < 900;
  if (isMobile) {
    el.innerHTML = renderKoListView(ko, 'real', null);
  } else {
    el.innerHTML = renderFullBracket(ko, 'real', null);
  }
}

// --- Bracket de un jugador concreto ---
let currentKoPlayer = null;

function renderKoPlayerSelector() {
  const el = document.getElementById('koPlayerSelector');
  if (!currentKoPlayer) currentKoPlayer = PLAYERS[0];

  el.innerHTML = PLAYERS.map(p =>
    `<button class="player-pill ${p === currentKoPlayer ? 'active' : ''}" data-player="${p}">${p}</button>`
  ).join('');

  el.querySelectorAll('.player-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      currentKoPlayer = btn.dataset.player;
      el.querySelectorAll('.player-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderKoPlayerBracket();
    });
  });
}

function renderKoPlayerBracket() {
  const el = document.getElementById('koPlayerBracket');
  const ko = D.ko_stage;
  const player = currentKoPlayer;

  if (!ko || !ko.qualifiers || Object.keys(ko.qualifiers).length === 0) {
    el.innerHTML = '';
    return;
  }

  const isMobile = window.innerWidth < 900;
  const bracketHtml = isMobile ? renderKoListView(ko, 'player', player) : renderFullBracket(ko, 'player', player);
  const stripHtml = isMobile ? '' : renderQualifiersStrip(ko, player);

  el.innerHTML = `
    ${bracketHtml}
    ${stripHtml}
    <div class="ko-legend">
      <span class="ko-legend-item"><span class="ko-dot hit-exact"></span>Resultado exacto (16avos)</span>
      <span class="ko-legend-item"><span class="ko-dot hit-diff"></span>Acierta diferencia</span>
      <span class="ko-legend-item"><span class="ko-dot hit-sign"></span>Acierta signo</span>
      <span class="ko-legend-item"><span class="ko-dot hit"></span>Equipo predicho, clasificación confirmada</span>
      <span class="ko-legend-item"><span class="ko-dot alive"></span>Equipo predicho, aún vivo</span>
      <span class="ko-legend-item"><span class="ko-dot miss"></span>Fallo / equipo eliminado</span>
    </div>
  `;
}

function predWinner(pred, home, away) {
  if (!pred) return '?';
  const sign = pred.split('|')[0];
  if (sign === '1') return home;
  if (sign === '2') return away;
  return 'Empate';
}

function scoreKoMatch(predStr, actualStr) {
  const [psign, pscore] = predStr.split('|');
  const [ph, pa] = pscore.split('-').map(Number);
  const [asign, ascore] = actualStr.split('|');
  const [ah, aa] = ascore.split('-').map(Number);
  let pts = 0;
  const sign = psign === asign;
  let diff = false, exact = false;
  if (sign) {
    pts += 1;
    if (Math.abs(ph - pa) === Math.abs(ah - aa)) { diff = true; pts += 1; }
    if (ph === ah && pa === aa) { exact = true; pts += 2; }
  }
  return { pts, sign, diff, exact };
}

// ============ INIT ============
renderScoreboard();
renderDaySelector();
renderDayStandings();
renderJornadaSelector();
renderProximosSelector();
renderGroupPlayerSelector();
renderGroupsGrid();
renderThirdPlaceTable();
renderKoRealBracket();
renderKoPlayerSelector();
renderKoPlayerBracket();
