// ============ SETUP ============
const D = PORRA_DATA;
const PLAYERS = D.players;

// Paleta fija por posición en la lista de jugadores (no por nombre), para que
// siga funcionando aunque alguien cambie su nombre en el Excel.
const COLOR_PALETTE = ['#BE7F1E', '#3676B0', '#C0392B', '#7455C4', '#2E9A63', '#BD4C8E', '#D2711E', '#2E8F8F', '#8A6A3A'];
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

const hamburgerBtn = document.getElementById('hamburgerBtn');
const mainTabs = document.getElementById('mainTabs');
const navScrim = document.getElementById('navScrim');

function closeNav() {
  mainTabs.classList.remove('open');
  navScrim.classList.remove('open');
  hamburgerBtn.setAttribute('aria-expanded', 'false');
}
function openNav() {
  mainTabs.classList.add('open');
  navScrim.classList.add('open');
  hamburgerBtn.setAttribute('aria-expanded', 'true');
}
hamburgerBtn.addEventListener('click', () => {
  if (mainTabs.classList.contains('open')) closeNav();
  else openNav();
});
navScrim.addEventListener('click', closeNav);

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('page-' + btn.dataset.tab).classList.add('active');
    closeNav();
    window.scrollTo({ top: 0, behavior: 'smooth' });

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
    gridLines += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(59,46,31,0.1)" stroke-width="1"/>`;
    gridLines += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#7C6B4E" font-family="Space Mono, monospace">${pos}</text>`;
  }

  // Etiquetas de fecha en el eje X (todas si caben pocas, si no cada 2)
  let xLabels = '';
  const step = dates.length > 10 ? 2 : 1;
  dates.forEach((d, i) => {
    if (i % step !== 0 && i !== dates.length - 1) return;
    const x = xFor(i);
    xLabels += `<text x="${x}" y="${H - padB + 18}" text-anchor="middle" font-size="10" fill="#7C6B4E" font-family="Inter, sans-serif">${fmtDate(d)}</text>`;
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
      <text x="${padL - 28}" y="${padT}" font-size="10" fill="#7C6B4E" font-family="Inter, sans-serif" transform="rotate(-90 ${padL-28} ${padT})" text-anchor="end"></text>
    </svg>
  `;
}

function renderCharts() {
  const labels = D.dates.map(fmtDate);

  Chart.defaults.color = '#7C6B4E';
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.borderColor = 'rgba(59,46,31,0.1)';

  const c1 = new Chart(document.getElementById('dailyChart'), {
    type: 'bar',
    data: { labels, datasets: buildDatasets(D.daily_points, true) },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Puntos del día', color: '#7C6B4E' }, ticks: { stepSize: 2 } },
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
        y: { beginAtZero: true, title: { display: true, text: 'Puntos totales acumulados', color: '#7C6B4E' } },
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
  const koRounds = KO_ROUND_ORDER.filter(r => koPlayedMatches(r).length > 0);
  const lastKoRound = koRounds.length ? koRounds[koRounds.length - 1] : null;

  const dayPills = D.dates.map((d, i) =>
    `<button class="jornada-pill ${!lastKoRound && i === D.dates.length-1 ? 'active' : ''}" data-kind="date" data-date="${d}">${fmtDateLong(d)}</button>`
  );
  const koPills = koRounds.map(r =>
    `<button class="jornada-pill ko-pill ${r === lastKoRound ? 'active' : ''}" data-kind="ko" data-round="${r}">${KO_ROUND_PILL_LABELS[r]}</button>`
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

  if (lastKoRound) renderJornadaContentKo(lastKoRound);
  else renderJornadaContent(D.dates[D.dates.length-1]);
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
    const homeLost = ko.losers_by_match && ko.losers_by_match[m.num] === m.home_team;
    const awayLost = ko.losers_by_match && ko.losers_by_match[m.num] === m.away_team;
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
        const homeLost = hasResult && m.home_team && ko.losers_by_match && ko.losers_by_match[m.num] === m.home_team;
        const awayLost = hasResult && m.away_team && ko.losers_by_match && ko.losers_by_match[m.num] === m.away_team;
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
        // De octavos en adelante, en modo jugador no hay "partido"
        // predicho como tal (el jugador predijo equipos por slot, no por
        // cruce) — dejamos el hueco vacío aquí; la franja de "clasificados
        // predichos" (renderQualifiersStrip, debajo del árbol) es la que
        // importa para puntos.
        return `<div class="ko-card-slot empty"></div>`;
      }
    }).join('');

    return `<div class="ko-round-col ${gapClass}">${cards}</div>`;
  });

  return roundsHtml;
}

// La franja de "equipo predicho para esta ronda" (lo que el jugador puso
// en Octavofinalista-N, Cuartofinalista-N, etc.), coloreada vivo/eliminado.
function renderQualifiersStrip(ko, player) {
  const rounds = ['octavos', 'cuartos', 'semis', 'final', 'tercer_puesto'];
  const labels = { octavos: 'Pasan a Octavos', cuartos: 'Pasan a Cuartos', semis: 'Pasan a Semis', final: 'Pasan a la Final', tercer_puesto: 'Pasan a 3º/4º puesto' };
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
            const ptsTag = pred.status === 'clasificado' && pred.pts ? ` +${pred.pts}` : '';
            return `<span class="ko-qual-chip ${cls}">${pred.team}${ptsTag}</span>`;
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
  const homeLost = hasResult && fm.home_team && ko.losers_by_match && ko.losers_by_match['F'] === fm.home_team;
  const awayLost = hasResult && fm.away_team && ko.losers_by_match && ko.losers_by_match['F'] === fm.away_team;

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
    const showFixtureCards = mode === 'real' || roundName === 'dieciseisavos';
    const cards = !showFixtureCards ? '' : matches.map(m => {
      const home = m.home_team || '?';
      const away = m.away_team || '?';
      const hasResult = !!m.actual;
      const homeLost = hasResult && ko.losers_by_match && ko.losers_by_match[m.num] === m.home_team;
      const awayLost = hasResult && ko.losers_by_match && ko.losers_by_match[m.num] === m.away_team;

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
        const qualLabel = showFixtureCards ? 'Predichos →' : `Equipos clasificados para ${KO_ROUND_PILL_LABELS[qualRound] || qualRound}`;
        qualHtml = `<div class="kol-qual-row"><span class="kol-qual-label">${qualLabel}</span>${
          slots.map(slot => {
            const pred = slot.predictions && slot.predictions[player];
            if (!pred || !pred.team) return '<span class="ko-qual-chip pending">—</span>';
            const cls = pred.status === 'eliminado' ? 'miss' : (pred.status === 'clasificado' ? 'hit' : (pred.status === 'vivo' ? 'alive' : 'pending'));
            const ptsTag = pred.status === 'clasificado' && pred.pts ? ` +${pred.pts}` : '';
            return `<span class="ko-qual-chip ${cls}">${pred.team}${ptsTag}</span>`;
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
    const fHomeLost = fHasResult && ko.losers_by_match && ko.losers_by_match['F'] === finalMatch.home_team;
    const fAwayLost = fHasResult && ko.losers_by_match && ko.losers_by_match['F'] === finalMatch.away_team;
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

function renderHonorBoard() {
  const el = document.getElementById('honorBoard');
  if (!el) return;
  const fp = D.final_predictions;
  if (!fp) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="honor-board">
      ${PLAYERS.map(p => {
        const row = fp[p] || {};
        return `
          <div class="honor-card" style="border-color:${PLAYER_COLORS[p]}55">
            <div class="honor-player" style="color:${PLAYER_COLORS[p]}">${p}</div>
            <div class="honor-items">
              <div class="honor-item"><span class="honor-icon">🏆</span><span class="honor-label">Campeón</span><span class="honor-value">${row.campeon || '—'}</span></div>
              <div class="honor-item"><span class="honor-icon">👟</span><span class="honor-label">Bota de Oro</span><span class="honor-value">${row.bota_oro || '—'}</span></div>
              <div class="honor-item"><span class="honor-icon">⚽</span><span class="honor-label">Balón de Oro</span><span class="honor-value">${row.balon_oro || '—'}</span></div>
            </div>
          </div>`;
      }).join('')}
    </div>
  `;
}

function renderTopScorers() {
  const el = document.getElementById('topScorersBlock');
  if (!el) return;
  const scorers = D.top_scorers;
  if (!scorers || scorers.length === 0) { el.innerHTML = ''; return; }
  const medals = ['🥇', '🥈', '🥉'];
  el.innerHTML = `
    <div class="section-divider"><span>⚽ Máximos goleadores del Mundial (real)</span></div>
    <div class="scorers-podium">
      ${scorers.map((s, i) => `
        <div class="scorer-card scorer-${i + 1}">
          <span class="scorer-medal">${medals[i] || '⚽'}</span>
          <div class="scorer-info">
            <div class="scorer-name">${s.name}</div>
            <div class="scorer-team">${s.team}</div>
          </div>
          <div class="scorer-goals">${s.goals}<span class="scorer-goals-label">goles</span></div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderKoRealBracket() {
  const el = document.getElementById('koRealBracket');
  if (!el) return;
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
  if (!el) return;
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
  if (!el) return;
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

// ============ PAGE 7: PREDICCIONES ============
// PREDICTIONS_DATA viene de predictions_data.js, generado por
// scripts/update_predictions.py (aparte del resto de data.js: combina el
// estado real ya calculado con cuotas de mercado externas que hay que
// refrescar a mano). Ver la pestaña "Metodología" dentro de Predicciones.
let PD = typeof PREDICTIONS_DATA !== 'undefined' ? PREDICTIONS_DATA : null;
// El roster de jugadores no cambia con el filtro global de resultados (ver
// nota sobre SIM_ELO más abajo), así que calcularlo una sola vez aquí es
// seguro; scripts/filter_engine.js reutiliza esta misma lista.
const PRED_PLAYERS = PD ? PD.players.map(p => p.name) : [];
let predMode = 'uniform';
let predCaminoPlayer = PRED_PLAYERS[0] || null;
let predRound = 'Octavos';
const PRED_ROUNDS = ['Octavos', 'Cuartos', 'Semis', 'Final', '3º-4º puesto'];

document.querySelectorAll('.pred-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pred-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    predMode = btn.dataset.mode;
    renderPredAll();
  });
});

function renderPredIntro() {
  const el = document.getElementById('predIntro');
  if (!PD) { el.textContent = 'Predicciones no disponibles todavía.'; return; }
  const dateTxt = PD.generated_from_last_updated ? fmtDateLong(PD.generated_from_last_updated) : '?';
  el.innerHTML = `Quedan <b>${PD.n_remaining_matches}</b> partidos con dos resultados posibles cada uno (2<sup>${PD.n_remaining_matches}</sup> = <b>${PD.n_combinations.toLocaleString('es-ES')}</b> combinaciones). Con datos hasta el ${dateTxt}.`;
}

function renderPredModeNote() {
  const el = document.getElementById('predModeNote');
  if (predMode === 'uniform') {
    el.innerHTML = 'Cada uno de los partidos que quedan se trata como una moneda al aire (50%/50%). La Bota y el Balón de Oro usan su cuota real de Polymarket en los dos modos: no tendría sentido fingir que todos los candidatos tienen la misma probabilidad.';
  } else {
    el.innerHTML = 'Modelo híbrido: los octavos que quedan y Cuartos 1 (Marruecos-Francia, ya es un cruce real) usan la cuota real "to advance" de <b>Kalshi</b>. El resto de cuartos, semis, final y el 3º-4º puesto usan el <b>rating Elo</b> de cada selección como ancla estable. La Bota y el Balón de Oro usan Polymarket.';
  }
}

function renderPredScoreboard() {
  if (!PD) return;
  document.getElementById('predScoreboardDesc').textContent = predMode === 'uniform'
    ? 'Rango total: el mínimo y el máximo absoluto que puede alcanzar cada jugador entre las 16.384 combinaciones (el extremo más bajo con todo en contra, el más alto acertando todo, incluidas Bota y Balón de Oro).'
    : 'Rango probable (percentil 10–90): el 80% de los escenarios, ponderados por su probabilidad real (Kalshi + Elo), caen dentro de este tramo. Se quedan fuera el 10% de casos más bajo y el 10% más alto.';
  const players = PD.players.slice().sort((a, b) => b[predMode].win_pct - a[predMode].win_pct);
  const maxHi = Math.max(...PD.players.map(p => p.total_max));
  const minLo = Math.min(...PD.players.map(p => p.total_min));
  const span = maxHi - minLo || 1;
  const rangeTag = predMode === 'uniform' ? 'mín–máx' : 'p10–p90';
  const html = players.map((p, i) => {
    const m = p[predMode];
    const lo = predMode === 'uniform' ? p.total_min : m.p10;
    const hi = predMode === 'uniform' ? p.total_max : m.p90;
    const mid = predMode === 'uniform' ? m.total_avg : m.p50;
    const left = ((lo - minLo) / span) * 100;
    const width = ((hi - lo) / span) * 100;
    const midPos = ((mid - minLo) / span) * 100;
    return `
      <div class="pred-score-row ${i === 0 ? 'rank-1' : ''}">
        <div class="pred-score-rank">${i + 1}</div>
        <div class="pred-score-mid">
          <div class="pred-score-name-line">
            <span class="pred-score-name">${p.name}</span>
            <span class="pred-score-current">${p.current} pts hoy</span>
            ${p.dead.length ? `<span class="badge b-miss">${p.dead.length} pick${p.dead.length > 1 ? 's' : ''} muerto${p.dead.length > 1 ? 's' : ''}</span>` : ''}
          </div>
          <div class="pred-range-track">
            <div class="pred-range-fill" style="left:${left}%;width:${Math.max(width, 1)}%"></div>
            <div class="pred-range-marker" style="left:${midPos}%"></div>
          </div>
          <div class="pred-range-label">${Math.round(lo)} – ${Math.round(hi)} pts <span class="pred-range-tag">(${rangeTag})</span></div>
        </div>
        <div class="pred-score-side">
          <div class="pred-win-pct">${m.win_pct}%</div>
          <div class="pred-win-label">de acabar 1º</div>
        </div>
      </div>`;
  }).join('');
  document.getElementById('predScoreboard').innerHTML = html;
}

function renderPredChuleton() {
  if (!PD) return;
  document.getElementById('predChuletonDesc').textContent = predMode === 'uniform'
    ? 'Con los partidos que quedan a 50/50. 1º no paga, 4º paga lo suyo (1 chuletón), 7º paga el doble (2 = lo suyo y lo de otro).'
    : 'Ponderado con Kalshi + Elo. 1º no paga, 4º paga lo suyo (1 chuletón), 7º paga el doble (2 = lo suyo y lo de otro).';
  const players = PD.players.slice().sort((a, b) => a.chuleton[predMode] - b.chuleton[predMode]);
  const html = players.map(p => `
    <div class="pred-chop-row">
      <div class="pred-chop-icon">🥩</div>
      <div class="pred-chop-name">${p.name}</div>
      <div class="pred-chop-value">${p.chuleton[predMode].toFixed(2)}<span>chuletones esperados</span></div>
    </div>`).join('');
  document.getElementById('predChuletonBoard').innerHTML = html;
}

function renderPredBoxplot() {
  if (!PD) return;
  const players = PD.players.slice().sort((a, b) => a.chuleton_box[predMode].mean - b.chuleton_box[predMode].mean);
  const rowH = 40, leftPad = 132, topPad = 10, wPlot = Math.max(280, 380);
  const height = topPad + rowH * players.length + 26;
  const width = leftPad + wPlot + 40;
  const scale = v => (v / 2) * wPlot;
  let svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="pred-boxplot">`;
  [0, 1, 2].forEach(v => {
    const x = leftPad + scale(v);
    svg += `<line x1="${x}" y1="${topPad}" x2="${x}" y2="${topPad + rowH * players.length}" stroke="var(--panel-line)" stroke-width="1"></line>`;
    svg += `<text x="${x}" y="${topPad + rowH * players.length + 18}" text-anchor="middle" font-size="11">${v}</text>`;
  });
  players.forEach((p, i) => {
    const box = p.chuleton_box[predMode];
    const y = topPad + i * rowH + rowH / 2;
    svg += `<text x="${leftPad - 12}" y="${y + 4}" text-anchor="end" font-size="12">${p.name}</text>`;
    const xP10 = leftPad + scale(box.p10), xP90 = leftPad + scale(box.p90);
    const xQ1 = leftPad + scale(box.q1), xQ3 = leftPad + scale(box.q3);
    const xMed = leftPad + scale(box.median), xMean = leftPad + scale(box.mean);
    svg += `<line x1="${xP10}" y1="${y}" x2="${xQ1}" y2="${y}" class="pred-whisker"></line>`;
    svg += `<line x1="${xQ3}" y1="${y}" x2="${xP90}" y2="${y}" class="pred-whisker"></line>`;
    svg += `<rect x="${Math.min(xQ1, xQ3)}" y="${y - 9}" width="${Math.max(Math.abs(xQ3 - xQ1), 1)}" height="18" rx="3" class="pred-box"></rect>`;
    svg += `<line x1="${xMed}" y1="${y - 9}" x2="${xMed}" y2="${y + 9}" stroke-width="2.4" stroke="var(--player-2)"></line>`;
    svg += `<rect x="${xMean - 4}" y="${y - 4}" width="8" height="8" transform="rotate(45 ${xMean} ${y})" class="pred-mean"></rect>`;
  });
  svg += `</svg>`;
  document.getElementById('predBoxplotWrap').innerHTML = svg;
}

function renderPredRoundSelector() {
  document.getElementById('predRoundSelector').innerHTML = PRED_ROUNDS.map(r =>
    `<button class="pred-round-pill ${r === predRound ? 'active' : ''}" data-round="${r}">${r}</button>`
  ).join('');
  document.querySelectorAll('.pred-round-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      predRound = btn.dataset.round;
      renderPredRoundSelector();
      renderPredRoundContent();
    });
  });
}

function predResolvedCardHTML(o) {
  const statusText = o.locked ? '🔒 Fijado (hipotético)' : `Jugado · ${o.score}`;
  return `
    <div class="pred-match-card${o.locked ? ' hypothetical' : ''}">
      <div class="pred-match-head">
        <div class="pred-match-teams">${o.a} <span style="color:var(--chalk-dim)">vs</span> ${o.b}</div>
        <div class="pred-match-resolved">${statusText}</div>
      </div>
      <div class="pred-odds-line">Pasa a cuartos: <b style="color:var(--chalk)">${o.winner}</b></div>
    </div>`;
}

function predResolvedNodeCardHTML(label, team, isReal) {
  return `
    <div class="pred-match-card${isReal ? '' : ' hypothetical'}">
      <div class="pred-match-head">
        <div class="pred-match-teams">${label}</div>
        <div class="pred-match-resolved">${isReal ? 'Jugado' : '🔒 Fijado (hipotético)'}</div>
      </div>
      <div class="pred-odds-line">Pasa: <b style="color:var(--chalk)">${team}</b></div>
    </div>`;
}

function predMatchCardHTML(m) {
  const rows = PRED_PLAYERS.map(name => {
    const v = m.players[name];
    const delta = v.cutsB - v.cutsA;
    const cls = delta > 0 ? 'pred-delta-up' : (delta < 0 ? 'pred-delta-down' : '');
    const sign = delta > 0 ? '+' : '';
    return `<tr>
      <td class="name">${name}</td>
      <td class="num">${v.cutsA.toFixed(2)}</td>
      <td class="num">${v.cutsB.toFixed(2)}</td>
      <td class="num ${cls}">${sign}${delta.toFixed(2)}</td>
    </tr>`;
  }).join('');
  const oddsLine = predMode === 'weighted'
    ? `<div class="pred-odds-line">Cuota real: <b>${m.a} ${m.probA}%</b>
        <div class="pred-odds-track"><div class="pred-odds-fill" style="width:${m.probA}%"></div></div>
        <b>${m.probB}% ${m.b}</b></div>`
    : '';
  return `
    <div class="pred-match-card">
      <div class="pred-match-head">
        <div class="pred-match-teams">${m.a} <span style="color:var(--chalk-dim)">vs</span> ${m.b}</div>
        <div class="pred-match-impact">impacto ${m.impact}</div>
      </div>
      ${oddsLine}
      <table class="pred-cuts-table">
        <thead><tr><th>Jugador</th><th class="num">Gana ${m.a}</th><th class="num">Gana ${m.b}</th><th class="num">Ahorro si gana ${m.a}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderPredRoundContent() {
  if (!PD) return;
  const src = predMode === 'uniform' ? PD.matches_uniform : PD.matches_weighted;
  let html = '';
  if (predRound === 'Octavos') {
    html += PD.bracket.octavos.filter(o => o.resolved).map(predResolvedCardHTML).join('');
  }
  // Un cuartos/semis/final/3º-4º puesto ya decidido (de verdad o fijado a
  // mano con el filtro) no tiene "partido que mueva la porra" -- si no se
  // muestra aquí, desaparece sin más de la pestaña de su ronda.
  if (predRound === 'Cuartos') {
    PD.bracket.qf.forEach((node, k) => {
      if (node.top.length === 1) html += predResolvedNodeCardHTML(`Cuartos ${k + 1}`, node.top[0].team, !!(PD.topology.qf_resolved && PD.topology.qf_resolved[k]));
    });
  }
  if (predRound === 'Semis') {
    PD.bracket.sf.forEach((node, k) => {
      if (node.top.length === 1) html += predResolvedNodeCardHTML(`Semifinal ${k + 1}`, node.top[0].team, !!(PD.topology.sf_resolved && PD.topology.sf_resolved[k]));
    });
  }
  if (predRound === 'Final' && PD.bracket.campeon.top.length === 1) {
    html += predResolvedNodeCardHTML('Final', PD.bracket.campeon.top[0].team, false);
  }
  if (predRound === '3º-4º puesto' && PD.bracket.tercerpuesto.top.length === 1) {
    html += predResolvedNodeCardHTML('3º-4º puesto', PD.bracket.tercerpuesto.top[0].team, false);
  }
  html += src.filter(m => m.stage === predRound).map(predMatchCardHTML).join('');
  document.getElementById('predRoundContent').innerHTML = html || '<p class="chart-desc">Nada que mostrar en esta ronda.</p>';
}

function renderPredHeatmap() {
  if (!PD) return;
  const src = predMode === 'uniform' ? PD.matches_uniform : PD.matches_weighted;
  document.getElementById('predHeatmapDesc').textContent = predMode === 'uniform'
    ? 'Con cada partido a 50/50. Verde = le conviene el equipo de la izquierda de cada cruce; rojo = le conviene el de la derecha.'
    : 'Ponderado con Kalshi + Elo. Verde = le conviene el equipo de la izquierda de cada cruce; rojo = le conviene el de la derecha.';
  const rowsOrder = PD.players.slice().sort((a, b) => a.chuleton[predMode] - b.chuleton[predMode]);
  let maxAbs = 0.01;
  src.forEach(m => rowsOrder.forEach(p => {
    const v = m.players[p.name];
    maxAbs = Math.max(maxAbs, Math.abs(v.cutsB - v.cutsA));
  }));
  const rowLabelW = 140, cellW = 40, cellH = 26, headH = 60, leftPad = 6, topPad = 6;
  const width = leftPad + rowLabelW + cellW * src.length + 10;
  const height = topPad + headH + cellH * rowsOrder.length + 6;
  let svg = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="pred-heatmap">`;
  src.forEach((m, ci) => {
    const x = leftPad + rowLabelW + ci * cellW + cellW / 2;
    const label = `${m.a.slice(0, 3).toUpperCase()}-${m.b.slice(0, 3).toUpperCase()}`;
    svg += `<text class="pred-hm-label" x="${x}" y="${topPad + headH - 8}" text-anchor="start" transform="rotate(-42 ${x} ${topPad + headH - 8})">${label}</text>`;
  });
  rowsOrder.forEach((p, ri) => {
    const y = topPad + headH + ri * cellH;
    svg += `<text class="pred-hm-label" x="${leftPad + rowLabelW - 10}" y="${y + cellH / 2 + 4}" text-anchor="end" font-size="11">${p.name}</text>`;
    src.forEach((m, ci) => {
      const v = m.players[p.name];
      const delta = v.cutsB - v.cutsA;
      const x = leftPad + rowLabelW + ci * cellW;
      const alpha = (0.15 + 0.85 * Math.min(Math.abs(delta) / maxAbs, 1)).toFixed(2);
      const color = delta >= 0 ? `rgba(31,122,77,${alpha})` : `rgba(192,57,43,${alpha})`;
      const favored = delta >= 0 ? m.a : m.b;
      svg += `<rect x="${x + 1}" y="${y + 1}" width="${cellW - 2}" height="${cellH - 2}" rx="3" fill="${color}"><title>${p.name} · ${m.a}-${m.b}: paga ${Math.abs(delta).toFixed(2)} chuletones menos si gana ${favored}</title></rect>`;
    });
  });
  svg += `</svg>`;
  document.getElementById('predHeatmapWrap').innerHTML = svg;
}

function predBracketLeafHTML(o) {
  if (o.resolved) {
    // Mismo alto de 2 filas que la tarjeta con cuota, para que la columna de
    // octavos no quede más alta/baja que el resto y descuadre el árbol.
    const tag = o.locked ? '🔒 ' : '★ ';
    return `<div class="pred-bracket-card resolved${o.locked ? ' hypothetical' : ''}">
      <div class="pred-bracket-team ${o.a === o.winner ? 'fav' : 'dim'}"><span>${o.a === o.winner ? tag : ''}${o.a}</span><span class="pred-bracket-pct">${o.a === o.winner ? o.score : ''}</span></div>
      <div class="pred-bracket-team ${o.b === o.winner ? 'fav' : 'dim'}"><span>${o.b === o.winner ? tag : ''}${o.b}</span><span class="pred-bracket-pct">${o.b === o.winner ? o.score : ''}</span></div>
    </div>`;
  }
  const aFav = o.aProbW >= o.bProbW;
  return `<div class="pred-bracket-card">
    <div class="pred-bracket-team ${aFav ? 'fav' : 'dim'}"><span>${o.a}</span><span class="pred-bracket-pct">${o.aProbW}%</span></div>
    <div class="pred-bracket-team ${!aFav ? 'fav' : 'dim'}"><span>${o.b}</span><span class="pred-bracket-pct">${o.bProbW}%</span></div>
  </div>`;
}
function predBracketNodeHTML(node) {
  const top = node.top;
  const maxPct = Math.max(...top.map(t => t.pct));
  return `<div class="pred-bracket-card">
    ${top.map(t => `<div class="pred-bracket-team ${t.pct === maxPct ? 'fav' : 'dim'}"><span>${t.team}</span><span class="pred-bracket-pct">${t.pct}%</span></div>`).join('')}
  </div>`;
}
// Cuadrícula simple por ronda (sin funambulismo de flexbox con huecos
// calculados a mano): cada ronda es un bloque con su título y una
// rejilla CSS Grid que envuelve sola sin depender de alturas de tarjeta.
// "Llegar" al partido de 3º-4º puesto es un dato distinto de "ganarlo" --
// se muestran como dos tarjetas separadas, cada una con su propio
// subtítulo. (Para la final no hace falta: "Semis" ya muestra quién gana
// cada semifinal, que es exactamente quién llega a la final.)
function predBracketNodeCard(subtitle, node) {
  return `<div class="pred-bracket-subgroup">
    <div class="pred-bracket-subtitle">${subtitle}</div>
    ${predBracketNodeHTML(node)}
  </div>`;
}

function renderPredBracket() {
  if (!PD) return;
  const bk = PD.bracket;
  let html = '';
  html += `<div class="pred-bracket-round"><div class="pred-bracket-round-title">Octavos</div><div class="pred-bracket-grid">${bk.octavos.map(predBracketLeafHTML).join('')}</div></div>`;
  html += `<div class="pred-bracket-round"><div class="pred-bracket-round-title">Cuartos</div><div class="pred-bracket-grid">${bk.qf.map(predBracketNodeHTML).join('')}</div></div>`;
  html += `<div class="pred-bracket-round"><div class="pred-bracket-round-title">Semis</div><div class="pred-bracket-grid">${bk.sf.map(predBracketNodeHTML).join('')}</div></div>`;
  html += `<div class="pred-bracket-round"><div class="pred-bracket-round-title">🏆 Campeón</div><div class="pred-bracket-grid">${predBracketNodeHTML(bk.campeon)}</div></div>`;
  html += `<div class="pred-bracket-round"><div class="pred-bracket-round-title">3º-4º puesto</div><div class="pred-bracket-grid">
    ${predBracketNodeCard('Juega el partido de bronce', bk.clasificados34)}
    ${predBracketNodeCard('🥉 Gana el 3º puesto', bk.tercerpuesto)}
  </div></div>`;
  document.getElementById('predBracketWrap').innerHTML =
    `<p class="chart-desc">Esta vista usa siempre la cuota real (Kalshi + Elo), sea cual sea el modo elegido arriba — en equiprobable no tiene sentido dibujar un cuadro donde todos los equipos están empatados.</p>${html}`;
}

// ---------- Distribución de posición final ----------
const PRED_RANK_COLORS = ['var(--gold-bright)', 'var(--gold)', '#B08A3E', '#8A7048', 'var(--chalk-dim)', '#5C4E3A', 'var(--rust)'];
function renderPredRankDist() {
  if (!PD) return;
  const players = PD.players.slice().sort((a, b) => b[predMode].win_pct - a[predMode].win_pct);
  const rows = players.map(p => {
    const dist = p.rank_dist[predMode];
    const segs = dist.map((pct, i) => {
      if (pct <= 0) return '';
      const label = pct >= 7 ? `${pct.toFixed(0)}%` : '';
      return `<div class="pred-rankdist-seg" style="width:${pct}%;background:${PRED_RANK_COLORS[i]}" title="${p.name} · ${i + 1}º puesto: ${pct.toFixed(1)}%">${label}</div>`;
    }).join('');
    return `<div class="pred-rankdist-row">
      <div class="pred-rankdist-name">${p.name}</div>
      <div class="pred-rankdist-bar">${segs}</div>
    </div>`;
  }).join('');
  const legend = PRED_RANK_COLORS.map((c, i) => `<span><span class="pred-rankdist-swatch" style="background:${c}"></span>${i + 1}º</span>`).join('');
  document.getElementById('predRankDistWrap').innerHTML = rows + `<div class="pred-rankdist-legend">${legend}</div>`;
}

// ---------- Camino a la victoria ----------
function renderPredCaminoSelector() {
  if (!PD) return;
  document.getElementById('predCaminoSelector').innerHTML = PRED_PLAYERS.map((name, i) =>
    `<button class="pred-player-pill ${i === 0 ? 'active' : ''}" data-player="${name}">${name}</button>`
  ).join('');
  document.querySelectorAll('.pred-player-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pred-player-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      predCaminoPlayer = btn.dataset.player;
      renderPredCaminoContent(predCaminoPlayer);
    });
  });
}
function renderPredCaminoContent(player) {
  if (!PD) return;
  const c = PD.camino[player];
  const el = document.getElementById('predCaminoContent');
  if (!c) { el.innerHTML = `<p class="chart-desc">Sin escenario ganador encontrado para ${player}.</p>`; return; }
  const events = c.events.map(e => `
    <div class="pred-camino-event">
      <div class="pred-camino-stage">${e.stage}</div>
      <div class="pred-camino-teams">
        <span class="${e.winner === e.a ? 'won' : 'lost'}">${e.a}</span> vs
        <span class="${e.winner === e.b ? 'won' : 'lost'}">${e.b}</span>
      </div>
      <div class="pred-camino-winner-tag">${e.winner}</div>
    </div>`).join('');
  let porraResult;
  if (c.tied_with && c.tied_with.length) {
    porraResult = `🏆 <b>${player}</b> empata en el 1º puesto de la porra con ${c.score} pts, junto a ${c.tied_with.join(', ')}`;
  } else if (c.second_name) {
    const gap = c.score - c.second_score;
    porraResult = `🏆 <b>${player}</b> gana la porra en solitario con ${c.score} pts (+${gap} sobre ${c.second_name}, 2º con ${c.second_score} pts)`;
  } else {
    porraResult = `🏆 <b>${player}</b> gana la porra en solitario con ${c.score} pts`;
  }
  el.innerHTML = `
    <p class="pred-camino-porra-result">${porraResult}</p>
    <div class="pred-camino-summary">
      <span>⚽ Campeón del Mundial: <b>${c.champion}</b></span>
      <span>🥈 Subcampeón: <b>${c.runner_up}</b></span>
      <span>🥉 3º puesto: <b>${c.tercer_puesto}</b></span>
      <span>🥾 Bota de Oro: <b>${c.golden}</b></span>
      <span>⚽ Balón de Oro: <b>${c.ball}</b></span>
      <span class="pred-camino-prob">${c.prob_pct}% de probabilidad de este escenario exacto</span>
    </div>
    <div class="pred-camino-timeline">${events}</div>`;
}

// ---------- Tarjeta compartible de la clasificación del simulador ----------
const SHARE_COLORS = {
  cream: '#FBF3E3', creamMid: '#F7EEDA', chalk: '#3B2E1F', chalkDim: '#7C6B4E',
  gold: '#BE7F1E', goldBright: '#DE9C2E', rust: '#C0392B', ink: '#2E2417', panelLine: 'rgba(59,46,31,0.14)',
};

function drawCenteredText(ctx, text, x, y, font, color, letterSpacing) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (!letterSpacing) { ctx.fillText(text, x, y); return; }
  const widths = [...text].map(ch => ctx.measureText(ch).width + letterSpacing);
  const total = widths.reduce((a, b) => a + b, 0) - letterSpacing;
  let cx = x - total / 2;
  ctx.textAlign = 'left';
  [...text].forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += widths[i]; });
  ctx.textAlign = 'center';
}

// Solo lista partidos con un resultado ya fijado (real o marcado a mano
// arriba en "Filtra por resultado"); uno que se ha dejado sin marcar no
// tiene ganador que enseñar, así que no aparece en absoluto en la imagen.
function simMatchRows(w) {
  const topo = PD.topology;
  const rows = [];
  topo.octavos.forEach((o, i) => {
    if (o.resolved) return;
    const pick = simState.octavos[i];
    if (pick !== 0 && pick !== 1) return;
    rows.push({ label: 'Octavos', teamA: o.a, teamB: o.b, winner: pick === 0 ? o.a : o.b });
  });
  topo.qf_pairs.forEach(([ia, ib], k) => {
    if (topo.qf_resolved[k]) return; // ya jugado de verdad, no es un pick del usuario
    const teamA = w.O_winner[ia], teamB = w.O_winner[ib];
    const pick = simState.qf[k];
    if (pick !== 0 && pick !== 1) return;
    rows.push({ label: `Cuartos ${k + 1}`, teamA, teamB, winner: pick === 0 ? teamA : teamB });
  });
  topo.sf_pairs.forEach(([ia, ib], k) => {
    if (topo.sf_resolved[k]) return;
    const teamA = w.Q_winner[ia], teamB = w.Q_winner[ib];
    const pick = simState.sf[k];
    if (pick !== 0 && pick !== 1) return;
    rows.push({ label: `Semifinal ${k + 1}`, teamA, teamB, winner: pick === 0 ? teamA : teamB });
  });
  const [fa, fb] = topo.f_pair;
  if (w.champion) rows.push({ label: 'Final', teamA: w.S_winner[fa], teamB: w.S_winner[fb], winner: w.champion });
  const [ta, tb] = topo.tp_pair;
  if (w.winner34) rows.push({ label: '3º-4º puesto', teamA: w.S_loser[ta], teamB: w.S_loser[tb], winner: w.winner34 });
  return rows;
}

async function drawSimShareCard(canvas) {
  const { scores, payment, w } = simComputeStandings();
  const ranked = PRED_PLAYERS.slice().sort((a, b) => scores[b] - scores[a]);
  const matchRows = simMatchRows(w);
  if (document.fonts && document.fonts.ready) await document.fonts.ready;

  const matchRowH = 42, leaderRowH = 88, outcomeRowH = 44;
  const W = 1080;
  const headerGap = matchRows.length > 0 ? 40 : 0;
  const H = 260 + headerGap + matchRows.length * matchRowH + 30 + outcomeRowH * 5 + 90 + ranked.length * leaderRowH + 90;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const CL = SHARE_COLORS;

  ctx.fillStyle = CL.cream;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = CL.gold;
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  drawCenteredText(ctx, '🥩 PORRA CHULETÓN · MUNDIAL 2026', W / 2, 95, "24px 'Space Mono'", CL.gold, 2);
  ctx.strokeStyle = CL.panelLine; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(90, 122); ctx.lineTo(W - 90, 122); ctx.stroke();

  drawCenteredText(ctx, 'CON LO YA DECIDIDO...', W / 2, 190, "bold 42px 'Oswald'", CL.chalk);

  let my = 240;
  if (matchRows.length > 0) {
    drawCenteredText(ctx, '· RESULTADOS ELEGIDOS ·', W / 2, 235, "bold 20px 'Oswald'", CL.goldBright, 1.5);
    my = 280;
  }
  matchRows.forEach(m => {
    ctx.font = "13px 'Space Mono'"; ctx.fillStyle = CL.chalkDim; ctx.textAlign = 'left';
    ctx.fillText(m.label.toUpperCase(), 100, my);
    ctx.font = "18px 'Inter'"; ctx.textAlign = 'left';
    ctx.fillStyle = m.winner === m.teamA ? CL.chalk : CL.chalkDim;
    ctx.fillText(m.teamA, 280, my);
    const wA = ctx.measureText(m.teamA).width;
    ctx.fillStyle = CL.chalkDim;
    ctx.fillText(' vs ', 280 + wA, my);
    const wVs = ctx.measureText(' vs ').width;
    ctx.fillStyle = m.winner === m.teamB ? CL.chalk : CL.chalkDim;
    ctx.fillText(m.teamB, 280 + wA + wVs, my);
    ctx.font = "bold 18px 'Inter'"; ctx.fillStyle = CL.goldBright; ctx.textAlign = 'right';
    ctx.fillText(`→ ${m.winner}`, W - 100, my);
    my += matchRowH;
  });

  ctx.strokeStyle = CL.panelLine; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(90, my + 8); ctx.lineTo(W - 90, my + 8); ctx.stroke();
  my += 30;

  const outcomes = [
    ['⚽ Campeón del Mundial', w.champion],
    ['🥈 Subcampeón', w.runner],
    ['🥉 3º puesto', w.winner34],
    ['🥾 Bota de Oro', simState.golden],
    ['⚽ Balón de Oro', simState.ball],
  ];
  let oy = my + 20;
  outcomes.forEach(([label, value]) => {
    ctx.font = "22px 'Inter'"; ctx.fillStyle = CL.chalkDim; ctx.textAlign = 'left';
    ctx.fillText(label, 100, oy);
    ctx.font = "bold 22px 'Inter'"; ctx.fillStyle = value ? CL.chalk : CL.chalkDim; ctx.textAlign = 'right';
    ctx.fillText(value || '— sin decidir', W - 100, oy);
    oy += outcomeRowH;
  });

  ctx.strokeStyle = CL.panelLine; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(90, oy + 10); ctx.lineTo(W - 90, oy + 10); ctx.stroke();
  drawCenteredText(ctx, '· ASÍ QUEDA LA PORRA ·', W / 2, oy + 55, "bold 22px 'Oswald'", CL.goldBright, 1.5);

  let ry = oy + 100;
  const rowH = leaderRowH;
  ranked.forEach((p, i) => {
    const rank = i + 1;
    const cy = ry + rowH / 2;
    ctx.beginPath();
    ctx.arc(140, cy, 28, 0, Math.PI * 2);
    ctx.fillStyle = rank === 1 ? CL.goldBright : CL.cream;
    ctx.fill();
    ctx.strokeStyle = CL.gold; ctx.lineWidth = 2; ctx.stroke();
    drawCenteredText(ctx, String(rank), 140, cy + 9, "bold 26px 'Space Mono'", rank === 1 ? CL.ink : CL.chalk);

    ctx.font = "bold 30px 'Oswald'"; ctx.fillStyle = CL.chalk; ctx.textAlign = 'left';
    ctx.fillText(p, 190, cy + 10);

    ctx.font = "bold 34px 'Space Mono'"; ctx.fillStyle = CL.goldBright; ctx.textAlign = 'right';
    ctx.fillText(`${scores[p]}`, W - 100, cy + 4);
    ctx.font = "18px 'Inter'"; ctx.fillStyle = CL.chalkDim;
    ctx.fillText(`🥩 ${payment[p].toFixed(2)}`, W - 100, cy + 28);

    ry += rowH;
    if (i < ranked.length - 1) {
      ctx.strokeStyle = CL.panelLine; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(100, ry); ctx.lineTo(W - 100, ry); ctx.stroke();
    }
  });

  drawCenteredText(ctx, 'Simulación hecha a mano · predicciones', W / 2, H - 55, "18px 'Inter'", CL.chalkDim);
}

let lastShareUrl = null;

function openShareModal() {
  if (!PD || !simState) return;
  const modal = document.getElementById('predShareModal');
  const canvas = document.getElementById('predShareCanvas');
  modal.hidden = false;
  drawSimShareCard(canvas).then(() => {
    canvas.toBlob(blob => {
      if (!blob) return;
      if (lastShareUrl) URL.revokeObjectURL(lastShareUrl);
      lastShareUrl = URL.createObjectURL(blob);
      const dlLink = document.getElementById('predShareDownload');
      dlLink.href = lastShareUrl;
      dlLink.download = 'simulador-porra-mundial-2026.png';
      const nativeBtn = document.getElementById('predShareNative');
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], 'simulador.png', { type: 'image/png' })] })) {
        nativeBtn.hidden = false;
        nativeBtn.onclick = () => {
          navigator.share({
            files: [new File([blob], 'simulador.png', { type: 'image/png' })],
            title: 'Porra Chuletón Mundial 2026',
            text: 'Así queda la porra si el Mundial termina así',
          }).catch(() => {});
        };
      } else {
        nativeBtn.hidden = true;
      }
    }, 'image/png');
  }).catch(err => {
    console.error('No se pudo generar la tarjeta compartible:', err);
    modal.hidden = true;
  });
}

document.getElementById('predSimShareBtn').addEventListener('click', openShareModal);
document.getElementById('predShareClose').addEventListener('click', () => {
  document.getElementById('predShareModal').hidden = true;
});
document.getElementById('predShareModal').addEventListener('click', (e) => {
  if (e.target.id === 'predShareModal') document.getElementById('predShareModal').hidden = true;
});

// ---------- Partidos que más mueven la porra ----------
function renderPredTopImpact() {
  if (!PD) return;
  const src = predMode === 'uniform' ? PD.matches_uniform : PD.matches_weighted;
  const top3 = src.slice().sort((a, b) => b.impact - a.impact).slice(0, 3);
  document.getElementById('predTopImpact').innerHTML = top3.map((m, i) => `
    <div class="pred-top-impact-card">
      <div class="pred-top-impact-rank">#${i + 1} · ${m.stage.toUpperCase()}</div>
      <div class="pred-top-impact-teams">${m.a} <span style="color:var(--chalk-dim)">vs</span> ${m.b}</div>
      <div class="pred-top-impact-val">impacto ${m.impact} chuletones</div>
    </div>`).join('');
}

function predAwardCardHTML(title, icon, data) {
  const rows = data.candidates.map(c => {
    const backers = Object.entries(data.picks).filter(([, pick]) => pick === c.name).map(([name]) => name);
    return `<div class="pred-award-row">
      <div>
        <div class="pred-award-name">${c.name}</div>
        ${backers.length ? `<div class="pred-award-backers">${backers.map(n => `<span class="pred-award-chip">${n}</span>`).join('')}</div>` : ''}
      </div>
      <div class="pred-award-pct">${c.pct}%</div>
    </div>`;
  }).join('');
  return `<div class="pred-award-card"><div class="honor-player">${icon} ${title}</div>${rows}</div>`;
}
function renderPredAwards() {
  if (!PD) return;
  document.getElementById('predAwardsGrid').innerHTML =
    predAwardCardHTML('Bota de Oro', '🥾', PD.golden) + predAwardCardHTML('Balón de Oro', '⚽', PD.ball);
}

// ---------- PRUEBA: quién va con quién ----------
function renderPredAffinity() {
  if (!PD || !PD.affinity) return;
  const names = PRED_PLAYERS;
  let maxPct = 0;
  names.forEach(a => names.forEach(b => { if (a !== b) maxPct = Math.max(maxPct, PD.affinity[a][b].pct); }));

  const head = `<th></th>` + names.map(n => `<th>${n}</th>`).join('');
  const rows = names.map(a => {
    const cells = names.map(b => {
      if (a === b) return `<td class="pred-affinity-self">—</td>`;
      const info = PD.affinity[a][b];
      const alpha = (0.12 + 0.75 * (info.pct / maxPct)).toFixed(2);
      return `<td class="pred-affinity-cell" style="background:rgba(190,127,30,${alpha})" title="${a} y ${b} coinciden en ${info.matches}/${info.total} picks">${info.pct}%</td>`;
    }).join('');
    return `<tr><th>${a}</th>${cells}</tr>`;
  }).join('');
  document.getElementById('predAffinityWrap').innerHTML =
    `<div class="pred-chart-wrap"><table class="pred-affinity-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;

  const callouts = names.map(a => {
    const others = names.filter(b => b !== a).map(b => ({ name: b, ...PD.affinity[a][b] }));
    const most = others.slice().sort((x, y) => y.pct - x.pct)[0];
    const least = others.slice().sort((x, y) => x.pct - y.pct)[0];
    return `<div class="pred-affinity-callout">
      <span class="pred-affinity-name">${a}</span>
      va más con <b>${most.name}</b> <span class="pred-affinity-pct">(${most.pct}%)</span>
      y menos con <b>${least.name}</b> <span class="pred-affinity-pct">(${least.pct}%)</span>
    </div>`;
  }).join('');
  document.getElementById('predAffinityCallouts').innerHTML = callouts;
}

// ---------- PRUEBA: simulador interactivo ----------
// Reimplementa en JS la misma puntuación que scripts/update_predictions.py
// (score_player_bracket + ranks_with_ties + payment_for_rank) para poder
// recalcular la clasificación al vuelo sin volver a llamar a Python.
let simState = null;

// hybrid_prob() de update_predictions.py, para poder calcular el favorito
// real en cuartos/semis/final/3º-4º puesto (antes se asumía "el primer
// equipo" por defecto, que no tenía por qué ser el favorito de verdad).
//
// OJO: se calculan una sola vez al cargar la página, a partir de PD en ese
// momento. PD pasa de const a let porque scripts/filter_engine.js lo
// reasigna al activar el filtro global de resultados -- eso es seguro
// porque el Elo y las cuotas de mercado son hechos del mundo real, no
// dependen del escenario que se esté mirando, y computeFilteredPD() los
// reenvía siempre sin tocar. Si algún día el filtro necesitara Elo/cuotas
// distintas por escenario, esto habría que recalcularlo en cada cambio.
const SIM_ELO = PD ? Object.fromEntries(PD.elo.map(e => [e.team, e.elo])) : {};
const SIM_KNOWN_MATCHUPS = PD ? Object.fromEntries(
  PD.known_matchups.flatMap(m => [[`${m.a}|${m.b}`, m.probA], [`${m.b}|${m.a}`, 1 - m.probA]])
) : {};
function simEloProb(a, b) { return 1 / (1 + Math.pow(10, -(SIM_ELO[a] - SIM_ELO[b]) / 400)); }
function simHybridProb(a, b) {
  const key = `${a}|${b}`;
  if (key in SIM_KNOWN_MATCHUPS) return SIM_KNOWN_MATCHUPS[key];
  return simEloProb(a, b);
}

// Ya no hay controles propios del simulador -- el único mando es "Filtra
// por resultado" arriba de la página. Este estado se deriva siempre de
// feLocks (si hay algo fijado ahí) y, para cualquier partido que se haya
// dejado sin marcar, del favorito real (Kalshi/Elo). feLocks vive en
// scripts/filter_engine.js (se carga después de este archivo); si por lo
// que sea no está definido, se trata como "nada fijado".
// Un partido que se deja "sin marcar" en el filtro se queda sin marcar de
// verdad aquí (null): no se le asigna el favorito, así que no suma ni
// resta puntos hasta que se decida de verdad o se fije a mano. Por eso la
// clasificación de esta sección es "puntos ya seguros", no una proyección.
function simDefaultState() {
  if (!PD || !PD.topology) return null;
  const topo = PD.topology;
  const locks = (typeof feLocks !== 'undefined' && feLocks) ? feLocks : { octavos: {}, qf: {}, sf: {}, final: null, tp: null, golden: null, ball: null };
  const st = {
    octavos: {}, qf: {}, sf: {}, final: null, tp: null,
    golden: locks.golden || null,
    ball: locks.ball || null,
  };
  topo.octavos.forEach((o, i) => {
    if (o.resolved) return;
    st.octavos[i] = locks.octavos[i] !== undefined ? locks.octavos[i] : null;
  });

  // Cascada: si un partido se queda sin marcar (null), todo lo que dependa
  // de él (las rondas siguientes) también se queda sin marcar, aunque esa
  // ronda en sí tenga un lock propio -- ya no tendría equipos que resolver.
  const O_winner = topo.octavos.map((o, i) => {
    if (o.resolved) return o.winner;
    return st.octavos[i] === 0 ? o.a : (st.octavos[i] === 1 ? o.b : null);
  });
  const Q_winner = topo.qf_pairs.map(([ia, ib], k) => {
    if (topo.qf_resolved[k]) return topo.qf_winner[k];
    const teamA = O_winner[ia], teamB = O_winner[ib];
    const pick = (teamA && teamB && locks.qf[k] !== undefined) ? locks.qf[k] : null;
    st.qf[k] = pick;
    if (pick === 0) return teamA;
    if (pick === 1) return teamB;
    return null;
  });
  const S_winner = [], S_loser = [];
  topo.sf_pairs.forEach(([ia, ib], k) => {
    const teamA = Q_winner[ia], teamB = Q_winner[ib];
    if (topo.sf_resolved[k]) {
      const w = topo.sf_winner[k];
      S_winner.push(w); S_loser.push(w === teamA ? teamB : teamA);
      return;
    }
    const pick = (teamA && teamB && locks.sf[k] !== undefined) ? locks.sf[k] : null;
    st.sf[k] = pick;
    if (pick === 0) { S_winner.push(teamA); S_loser.push(teamB); }
    else if (pick === 1) { S_winner.push(teamB); S_loser.push(teamA); }
    else { S_winner.push(null); S_loser.push(null); }
  });
  const [fa, fb] = topo.f_pair;
  st.final = (S_winner[fa] && S_winner[fb] && locks.final !== null && locks.final !== undefined) ? locks.final : null;
  const [ta, tb] = topo.tp_pair;
  st.tp = (S_loser[ta] && S_loser[tb] && locks.tp !== null && locks.tp !== undefined) ? locks.tp : null;
  return st;
}

function simComputeWinners() {
  const topo = PD.topology;
  const O_winner = topo.octavos.map((o, i) => {
    if (o.resolved) return o.winner;
    const pick = simState.octavos[i];
    return pick === 0 ? o.a : (pick === 1 ? o.b : null);
  });
  const Q_winner = topo.qf_pairs.map(([ia, ib], k) => {
    if (topo.qf_resolved[k]) return topo.qf_winner[k];
    const pick = simState.qf[k];
    if (pick === 0) return O_winner[ia];
    if (pick === 1) return O_winner[ib];
    return null;
  });
  const S_winner = [], S_loser = [];
  topo.sf_pairs.forEach(([ia, ib], k) => {
    const teamA = Q_winner[ia], teamB = Q_winner[ib];
    if (topo.sf_resolved[k]) {
      const w = topo.sf_winner[k];
      S_winner.push(w); S_loser.push(w === teamA ? teamB : teamA);
      return;
    }
    const pick = simState.sf[k];
    if (pick === 0) { S_winner.push(teamA); S_loser.push(teamB); }
    else if (pick === 1) { S_winner.push(teamB); S_loser.push(teamA); }
    else { S_winner.push(null); S_loser.push(null); }
  });
  const [fa, fb] = topo.f_pair;
  const champion = simState.final === 0 ? S_winner[fa] : (simState.final === 1 ? S_winner[fb] : null);
  const runner = simState.final === 0 ? S_winner[fb] : (simState.final === 1 ? S_winner[fa] : null);
  const [ta, tb] = topo.tp_pair;
  const winner34 = simState.tp === 0 ? S_loser[ta] : (simState.tp === 1 ? S_loser[tb] : null);
  return { O_winner, Q_winner, S_winner, S_loser, champion, runner, winner34 };
}

const SIM_RESOLVED_OCTAVOS = () => new Set(PD.topology.octavos.map((o, i) => (o.resolved ? i : null)).filter(i => i !== null));
const SIM_RESOLVED_CUARTOS = () => new Set(PD.topology.qf_resolved.map((r, i) => (r ? i : null)).filter(i => i !== null));
const SIM_RESOLVED_SEMIS = () => new Set(PD.topology.sf_resolved.map((r, i) => (r ? i : null)).filter(i => i !== null));

function simScorePlayer(pk, w) {
  let s = 0;
  const resolvedOctavos = SIM_RESOLVED_OCTAVOS();
  const resolvedCuartos = SIM_RESOLVED_CUARTOS();
  const resolvedSemis = SIM_RESOLVED_SEMIS();
  for (let slot = 0; slot < 8; slot++) {
    if (resolvedOctavos.has(slot)) continue; // ya sumado en current_total, no contar dos veces
    if (pk.cuartofinalista[slot] === w.O_winner[slot]) s += 12;
  }
  for (let slot = 0; slot < 4; slot++) {
    if (resolvedCuartos.has(slot)) continue;
    if (pk.semifinalista[slot] === w.Q_winner[slot]) s += 24;
  }
  for (let slot = 0; slot < 2; slot++) {
    if (resolvedSemis.has(slot)) continue;
    if (pk.finalista[slot] === w.S_winner[slot]) s += 48;
    if (pk.tresycuatro[slot] === w.S_loser[slot]) s += 24;
  }
  if (pk.campeon === w.champion) s += 96;
  if (pk.subcampeon === w.runner) s += 48;
  if (pk.tercerpuesto === w.winner34) s += 16;
  return s;
}

function simRankGroups(scores) {
  const order = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const groups = []; let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][1] === order[i][1]) j++;
    groups.push(order.slice(i, j + 1).map(x => x[0]));
    i = j + 1;
  }
  return groups;
}
function simPaymentForRank(avgRank) { return (avgRank - 1) / 3; }

function simComputeStandings() {
  const w = simComputeWinners();
  const scores = {};
  PRED_PLAYERS.forEach(p => {
    const pk = PD.picks[p];
    let s = PD.current_total[p] + simScorePlayer(pk, w);
    if (pk.botaoro === simState.golden) s += 24;
    if (pk.balonoro === simState.ball) s += 24;
    scores[p] = s;
  });
  const groups = simRankGroups(scores);
  const payment = {}; const rank = {};
  let pos = 0;
  groups.forEach(group => {
    const avgRank = pos + 1 + (group.length - 1) / 2;
    group.forEach(p => { payment[p] = simPaymentForRank(avgRank); rank[p] = avgRank; });
    pos += group.length;
  });
  return { scores, payment, rank, w };
}

function renderSimResults() {
  const { scores, payment } = simComputeStandings();
  const rows = PRED_PLAYERS.slice().sort((a, b) => scores[b] - scores[a]).map((p, i) => `
    <div class="pred-sim-result-row ${i === 0 ? 'lead' : ''}">
      <div class="pred-sim-result-rank">${i + 1}</div>
      <div class="pred-sim-result-name">${p}</div>
      <div class="pred-sim-result-pts">${scores[p]} pts</div>
      <div class="pred-sim-result-chop">🥩 ${payment[p].toFixed(2)}</div>
    </div>`).join('');
  document.getElementById('predSimResults').innerHTML = rows;
}

// Ya no hay controles propios: simState se deriva siempre de nuevo (real +
// feLocks + favorito), así que se recalcula en cada render en vez de
// guardarse entre renders -- refleja "Filtra por resultado" en cuanto
// cambia, sin necesitar su propio botón de reinicio.
function renderSimAll() {
  if (!PD || !PD.topology) return;
  simState = simDefaultState();
  renderSimResults();
}

function renderPredDeadList() {
  if (!PD) return;
  const rows = [];
  PD.players.forEach(p => p.dead.forEach(d => rows.push({ name: p.name, stage: d.stage, pick: d.pick })));
  let html = `<div class="pred-dead-row head"><div>Jugador</div><div>Ronda</div><div>Equipo elegido</div></div>`;
  rows.forEach(r => {
    html += `<div class="pred-dead-row"><div><b>${r.name}</b></div><div>${r.stage}</div><div><span class="pred-dead-tag">${r.pick}</span></div></div>`;
  });
  if (!rows.length) html += `<p class="chart-desc">Nadie tiene picks descartados todavía.</p>`;
  document.getElementById('predDeadList').innerHTML = html;
}

function renderPredMethodology() {
  if (!PD) return;
  document.getElementById('predMethodology').innerHTML = `
    <div class="pred-note"><b>Qué se simula:</b> desde los octavos que aún no se han jugado hasta la final y el 3º-4º puesto, con dos resultados posibles por partido (2<sup>${PD.n_remaining_matches}</sup> = ${PD.n_combinations.toLocaleString('es-ES')} combinaciones). Los puntos por ronda (12/24/48/24 según equipo clasificado, más 96/48/16 por Campeón/Subcampeón/3º puesto) son los mismos que usa la pestaña Eliminatoria; la Bota y el Balón de Oro (24 pts cada uno) se añaden con su probabilidad real de mercado.</div>
    <div class="pred-note"><b>Equiprobable:</b> cada partido que queda es una moneda al aire (50%/50%). Sirve para ver el rango de resultados "si todo fuera puro azar", sin opinar sobre quién es mejor equipo.</div>
    <div class="pred-note"><b>Kalshi + Elo:</b> los octavos que quedan y Cuartos 1 (Marruecos-Francia, ya es un cruce real) usan la cuota "to advance" de <a href="https://kalshi.com/category/sports/soccer/fifa-world-cup/world-cup/games" target="_blank" rel="noopener">Kalshi</a>. El resto de cuartos, semis, final y el 3º-4º puesto usan el rating <a href="https://www.eloratings.net/2026_World_Cup" target="_blank" rel="noopener">World Football Elo</a> de cada selección (P(A gana a B) = 1/(1+10^(−(Elo_A−Elo_B)/400))) como ancla estable, porque el cruce concreto todavía no existe como mercado.</div>
    <div class="pred-note"><b>Bota y Balón de Oro:</b> probabilidades reales de los mercados "Golden Boot Winner" / "Golden Ball Winner" de <a href="https://polymarket.com/sports/world-cup" target="_blank" rel="noopener">Polymarket</a>, iguales en los dos modos.</div>
    <div class="pred-note"><b>La cena:</b> 1º no paga, 4º paga lo suyo (1 chuletón), 7º paga el doble (2 = lo suyo y lo de otro), con pasos de 1/3 entre medias. Empates a puntos reparten el chuletón de esas posiciones a partes iguales.</div>
  `;
}

function renderPredAll() {
  renderPredIntro();
  renderPredModeNote();
  renderPredScoreboard();
  renderPredRankDist();
  // "Camino a la victoria" solo tiene sentido con probabilidades reales: en
  // equiprobable todas las ramas del cuadro pesan igual, así que "el
  // escenario más probable" no sería más que uno cualquiera de los muchos
  // empatados al máximo -- se oculta la sección entera en ese modo.
  const caminoSection = document.getElementById('predCaminoSection');
  if (caminoSection) caminoSection.style.display = predMode === 'weighted' ? '' : 'none';
  if (predCaminoPlayer && predMode === 'weighted') renderPredCaminoContent(predCaminoPlayer);
  renderPredChuleton();
  renderPredBoxplot();
  renderPredTopImpact();
  renderPredRoundSelector();
  renderPredRoundContent();
  renderPredHeatmap();
  // El cuadro y la Bota/Balón de Oro siempre usan la cuota real (Kalshi +
  // Elo + Polymarket), así que en equiprobable no aportan nada -- se
  // ocultan enteros en ese modo, igual que "Camino a la victoria".
  const bracketSection = document.getElementById('predBracketSection');
  const awardsSection = document.getElementById('predAwardsSection');
  if (bracketSection) bracketSection.style.display = predMode === 'weighted' ? '' : 'none';
  if (awardsSection) awardsSection.style.display = predMode === 'weighted' ? '' : 'none';
  if (predMode === 'weighted') {
    renderPredBracket();
    renderPredAwards();
  }
  renderPredAffinity();
  renderPredDeadList();
  renderPredMethodology();
  renderSimAll();
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
renderHonorBoard();
renderTopScorers();
renderKoPlayerSelector();
renderKoPlayerBracket();
renderPredCaminoSelector();
renderPredAll();
