// ============================================================================
// PRUEBA: filtro global de resultados.
//
// Permite fijar a mano el resultado de cualquier partido que quede (o
// dejarlo "sin marcar", es decir, tratarlo como probabilístico igual que
// hoy) y recalcula TODA la sección Predicciones -- marcador proyectado,
// distribución de puestos, chuletones, mapa de calor, partidos que más
// mueven la porra, el cuadro con probabilidades y camino a la victoria --
// condicionada a esa elección parcial.
//
// Es la contrapartida "para toda la página" del Simulador (que solo
// recalcula la clasificación de UN escenario totalmente fijado). Aquí,
// cualquier partido que se deje sin marcar sigue pesando por su probabilidad
// real (Kalshi si existe cuota, si no Elo), exactamente como en el modelo
// ponderado de siempre -- por eso reutiliza simHybridProb/simRankGroups/
// simPaymentForRank/simScorePlayer ya definidos en app.js en vez de
// reimplementar esa lógica una cuarta vez.
//
// No recalcula (limitación conocida de este prototipo): "Quién va con
// quién" (no depende de resultados futuros, son solo picks) y "Picks ya
// descartados" (se deja como en los datos reales; fijar un resultado a mano
// no crea eliminaciones hipotéticas en cascada).
// ============================================================================

const ORIGINAL_PD = PD;

// locks: qué partidos ha fijado el usuario.
// - octavos/qf: {indice: 0|1} (0 = gana el equipo "a", 1 = gana "b"); sus
//   dos rivales siempre son conocidos, así que basta con el lado. Si el
//   índice no está presente, el partido sigue sin marcar.
// - sf: {indice: "Nombre del equipo"} -- el rival puede seguir sin
//   decidirse (ver feSfEntrantPool), así que el lock guarda directamente
//   el nombre del equipo que se fija como ganador, no un lado.
// - final/tp: igual que sf pero sin índice (un único cruce cada uno): el
//   nombre del equipo fijado, o null si sigue sin marcar.
// - golden/ball: el nombre del candidato fijado, o null si sigue sin marcar.
let feLocks = { octavos: {}, qf: {}, sf: {}, final: null, tp: null, golden: null, ball: null };

function feAnyLockActive() {
  return Object.keys(feLocks.octavos).length > 0 || Object.keys(feLocks.qf).length > 0 ||
         Object.keys(feLocks.sf).length > 0 || feLocks.final !== null || feLocks.tp !== null ||
         feLocks.golden !== null || feLocks.ball !== null;
}

function feRound1(x) { return Math.round(x * 10) / 10; }
function feRound2(x) { return Math.round(x * 100) / 100; }
function feRound3(x) { return Math.round(x * 1000) / 1000; }
function feRound4(x) { return Math.round(x * 10000) / 10000; }
function feRound6(x) { return Math.round(x * 1e6) / 1e6; }

// Puntos por acertar Bota/Balón de Oro (igual que en scripts/update_predictions.py).
const FE_AWARD_BONUS = 24;

// Rondas cuyo bit se sigue enumerando aunque estén ya decididas por un lock
// (ver feMakeSimulator) -- usado para saber cuándo un 100%/0% en la tabla
// de impacto viene de un partido de verdad ya certero (nunca en estas
// rondas: cuartos/octavos ya salen del todo de la enumeración al fijarse) y
// cuándo hay que ocultar la fila porque ya no queda incertidumbre real.
const FE_STAGES_LOCKABLE = new Set(['Semis', 'Final', '3º-4º puesto']);

// ---------------------------------------------------------- cascada de equipos conocidos --
// Para cada ronda, qué equipos concretos juegan (null si su ronda anterior
// todavía no está decidida ni por resultado real ni por un lock) y quién ha
// ganado (null si esa ronda en sí sigue sin marcar).
//
// A partir de semis, un lock ya no es "gana el lado A o el lado B de un
// cruce conocido" (locks.sf/final/tp eran 0|1) sino directamente el NOMBRE
// del equipo que se fija como ganador de esa ronda, aunque su rival
// concreto todavía dependa de un cruce sin jugar -- así se puede plantear
// "¿y si España gana la final?" sin tener que fijar antes quién sale de la
// otra semifinal. La condición se aplica luego como filtro sobre las ramas
// del cuadro en computeFilteredPD() (ver feLocksSatisfied), no aquí.
function feKnownWinners(locks) {
  const topo = ORIGINAL_PD.topology;
  const O = topo.octavos.map((o, i) => {
    if (o.resolved) return o.winner;
    if (locks.octavos[i] !== undefined) return locks.octavos[i] === 0 ? o.a : o.b;
    return null;
  });
  const Q = topo.qf_pairs.map(([ia, ib], k) => {
    if (topo.qf_resolved[k]) return topo.qf_winner[k];
    if (locks.qf[k] !== undefined && O[ia] && O[ib]) return locks.qf[k] === 0 ? O[ia] : O[ib];
    return null;
  });
  const Qteams = topo.qf_pairs.map(([ia, ib]) => [O[ia], O[ib]]);
  const S = topo.sf_pairs.map((_, k) => {
    if (topo.sf_resolved[k]) return topo.sf_winner[k];
    if (locks.sf[k]) return locks.sf[k];
    return null;
  });
  const Steams = topo.sf_pairs.map(([ia, ib]) => [Q[ia], Q[ib]]);
  // El perdedor de una semi solo es deducible si se conocen sus DOS
  // equipos (si el rival todavía es "Ganador(Cuartos X)", fijar quién gana
  // no basta para saber quién pierde).
  const SLoser = topo.sf_pairs.map((_, k) => {
    if (!S[k]) return null;
    const [ta, tb] = Steams[k];
    if (!ta || !tb) return null;
    return S[k] === ta ? tb : ta;
  });
  return { O, Q, Qteams, S, Steams, SLoser };
}

// Candidatos posibles a cada ronda a partir de cuartos: el equipo ya
// conocido (real o fijado) si lo hay, o los equipos de los dos cruces de
// los que puede salir. Recursivo hacia atrás en el cuadro -- por eso el
// candidato a la final puede ser cualquiera de los 8 cuartofinalistas
// vivos, aunque ninguna semifinal se haya jugado todavía.
function feQfWinnerPool(kw, k) { return kw.Q[k] ? [kw.Q[k]] : kw.Qteams[k]; }
function feSfEntrantPool(kw, k) {
  const [ia, ib] = ORIGINAL_PD.topology.sf_pairs[k];
  return [...feQfWinnerPool(kw, ia), ...feQfWinnerPool(kw, ib)];
}
function feSfWinnerPool(kw, k) { return kw.S[k] ? [kw.S[k]] : feSfEntrantPool(kw, k); }
// El perdedor nunca puede ser el equipo ya fijado (real o por lock) como
// ganador de esa misma semifinal -- se descarta de la lista aunque el
// cruce siga admitiendo más de dos nombres posibles.
function feSfLoserPool(kw, k) {
  const entrants = feSfEntrantPool(kw, k);
  return kw.S[k] ? entrants.filter(t => t !== kw.S[k]) : entrants;
}
function feFinalEntrantPool(kw) {
  const [fa, fb] = ORIGINAL_PD.topology.f_pair;
  return [...feSfWinnerPool(kw, fa), ...feSfWinnerPool(kw, fb)];
}
function feTpEntrantPool(kw) {
  const [ta, tb] = ORIGINAL_PD.topology.tp_pair;
  return [...feSfLoserPool(kw, ta), ...feSfLoserPool(kw, tb)];
}

// Condición que debe cumplir una rama concreta del cuadro (ya simulada por
// completo por feMakeSimulator().simulate) para no contradecir los locks de
// semis/final/3º-4º puesto -- estos ya no reducen el número de bits a
// enumerar (ver feMakeSimulator), así que se filtran aquí a posteriori.
function feLocksSatisfied(w, locks) {
  for (const k in locks.sf) { if (w.S_winner[k] !== locks.sf[k]) return false; }
  if (locks.final && w.champion !== locks.final) return false;
  if (locks.tp && w.winner34 !== locks.tp) return false;
  return true;
}

// -------------------------------------------------------------- distribuciones del cuadro --
// A diferencia de octavos/cuartos (donde un lock colapsa un cruce conocido
// a {equipo: 1.0} y se puede propagar hacia delante con una DP cerrada),
// desde que semis/final/3º-4º puesto se pueden fijar por nombre de equipo
// sin conocer al rival, la distribución condicionada ya no se puede
// calcular sin más que propagar probabilidades ronda a ronda: hay que
// condicionar TODO el cuadro a que ese equipo efectivamente llegue y gane.
// Como el número de partidos libres que quedan es pequeño, se calcula
// enumerando exactamente las mismas ramas que computeFilteredPD() y
// quedándose solo con las que no contradicen los locks (feLocksSatisfied):
// ver la acumulación de qfAgg/sfAgg/lAgg/champAgg/tpAgg dentro de esa
// función, que sustituye a la antigua DP cerrada de este bloque.
function feMergeDists(dists) {
  const out = {};
  dists.forEach(d => { for (const t in d) out[t] = (out[t] || 0) + d[t]; });
  return out;
}

function feTopN(dist) {
  return Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([team, p]) => ({ team, pct: feRound1(p * 100) }));
}

function feBuildBracket(locks, dists) {
  const topo = ORIGINAL_PD.topology;
  const octavosOut = topo.octavos.map((o, i) => {
    if (o.resolved) {
      const real = ORIGINAL_PD.bracket.octavos[i];
      return { a: o.a, b: o.b, resolved: true, winner: o.winner, score: real.score,
               aProbW: o.winner === o.a ? 100 : 0, bProbW: o.winner === o.b ? 100 : 0 };
    }
    if (locks.octavos[i] !== undefined) {
      const winner = locks.octavos[i] === 0 ? o.a : o.b;
      return { a: o.a, b: o.b, resolved: true, winner, score: '—', locked: true,
               aProbW: winner === o.a ? 100 : 0, bProbW: winner === o.b ? 100 : 0 };
    }
    return { a: o.a, b: o.b, resolved: false, aProbW: feRound1(o.probA * 100), bProbW: feRound1((1 - o.probA) * 100) };
  });
  return {
    octavos: octavosOut,
    qf: topo.qf_pairs.map((pair, k) => ({ label: `Cuartos ${k + 1}`, top: feTopN(dists.Q_dist[k]), from: pair })),
    sf: topo.sf_pairs.map((pair, k) => ({ label: `Semifinal ${k + 1}`, top: feTopN(dists.S_dist[k]), from: pair })),
    campeon: { top: feTopN(dists.F_dist) },
    clasificados34: { label: 'Clasificados a 3º-4º puesto', top: feTopN(feMergeDists(dists.L_dist)), fromLosers: true },
    tercerpuesto: { label: '3º puesto', top: feTopN(dists.T34_dist), fromLosers: true },
  };
}

// -------------------------------------------------------------- enumeración Monte Carlo --
// Para el resto de visualizaciones (marcador, distribución de puestos,
// chuletones, mapa de calor, camino a la victoria) hace falta enumerar
// todas las combinaciones de los partidos que quedan SIN marcar (los
// fijados por el usuario o ya resueltos de verdad no se enumeran, solo se
// tienen en cuenta como un hecho fijo).
function feMakeSimulator(locks) {
  const topo = ORIGINAL_PD.topology;
  const freeOctavos = [];
  topo.octavos.forEach((o, i) => { if (!o.resolved && locks.octavos[i] === undefined) freeOctavos.push(i); });
  const freeQf = [];
  topo.qf_pairs.forEach((_, k) => { if (!topo.qf_resolved[k] && locks.qf[k] === undefined) freeQf.push(k); });
  // A partir de aquí un lock ya NO retira el bit de la enumeración: fijar
  // "gana España la semifinal 1" no dice, por sí solo, si España llega
  // desde cuartos 1 o cuartos 2, así que ese partido se sigue sorteando
  // igual que si estuviera sin marcar y luego se descartan (en
  // computeFilteredPD, vía feLocksSatisfied) las ramas que no llevan a ese
  // equipo a ganarlo. Octavos/cuartos no tienen este problema porque sus
  // dos equipos siempre son conocidos, así que ahí un lock sigue forzando
  // el resultado y reduciendo la enumeración como antes.
  const freeSf = [];
  topo.sf_pairs.forEach((_, k) => { if (!topo.sf_resolved[k]) freeSf.push(k); });
  const freeFinal = true;
  const freeTp = true;
  const nBits = freeOctavos.length + freeQf.length + freeSf.length + (freeFinal ? 1 : 0) + (freeTp ? 1 : 0);

  function simulate(bits) {
    let idx = 0, probW = 1.0;
    const O_winner = topo.octavos.map(o => o.resolved ? o.winner : null);
    Object.keys(locks.octavos).forEach(iStr => {
      const i = +iStr; O_winner[i] = locks.octavos[i] === 0 ? topo.octavos[i].a : topo.octavos[i].b;
    });
    freeOctavos.forEach(i => {
      const o = topo.octavos[i], pA = o.probA;
      if (bits[idx] === 0) { O_winner[i] = o.a; probW *= pA; } else { O_winner[i] = o.b; probW *= (1 - pA); }
      idx++;
    });

    const Q_winner = topo.qf_pairs.map(() => null);
    topo.qf_pairs.forEach(([ia, ib], k) => {
      const teamA = O_winner[ia], teamB = O_winner[ib];
      if (topo.qf_resolved[k]) { Q_winner[k] = topo.qf_winner[k]; return; }
      if (locks.qf[k] !== undefined) { Q_winner[k] = locks.qf[k] === 0 ? teamA : teamB; return; }
      const pA = simHybridProb(teamA, teamB);
      if (bits[idx] === 0) { Q_winner[k] = teamA; probW *= pA; } else { Q_winner[k] = teamB; probW *= (1 - pA); }
      idx++;
    });

    const S_winner = topo.sf_pairs.map(() => null), S_loser = topo.sf_pairs.map(() => null);
    topo.sf_pairs.forEach(([ia, ib], k) => {
      const teamA = Q_winner[ia], teamB = Q_winner[ib];
      if (topo.sf_resolved[k]) { S_winner[k] = topo.sf_winner[k]; S_loser[k] = S_winner[k] === teamA ? teamB : teamA; return; }
      const pA = simHybridProb(teamA, teamB);
      if (bits[idx] === 0) { S_winner[k] = teamA; S_loser[k] = teamB; probW *= pA; }
      else { S_winner[k] = teamB; S_loser[k] = teamA; probW *= (1 - pA); }
      idx++;
    });

    const [fa, fb] = topo.f_pair, fTeamA = S_winner[fa], fTeamB = S_winner[fb];
    let champion, runner;
    {
      const pA = simHybridProb(fTeamA, fTeamB);
      if (bits[idx] === 0) { champion = fTeamA; runner = fTeamB; probW *= pA; }
      else { champion = fTeamB; runner = fTeamA; probW *= (1 - pA); }
      idx++;
    }

    const [ta, tb] = topo.tp_pair, tTeamA = S_loser[ta], tTeamB = S_loser[tb];
    let winner34;
    {
      const pA = simHybridProb(tTeamA, tTeamB);
      if (bits[idx] === 0) { winner34 = tTeamA; probW *= pA; } else { winner34 = tTeamB; probW *= (1 - pA); }
      idx++;
    }

    return { O_winner, Q_winner, S_winner, S_loser, champion, runner, winner34, probW };
  }

  return { simulate, nBits, freeOctavos, freeQf, freeSf, freeFinal, freeTp };
}

function feMatchLabels(locks, sim, kw) {
  const topo = ORIGINAL_PD.topology;
  const labels = [];
  sim.freeOctavos.forEach(i => { const o = topo.octavos[i]; labels.push(['Octavos', o.a, o.b]); });
  sim.freeQf.forEach(k => {
    const [ia, ib] = topo.qf_pairs[k];
    const oa = topo.octavos[ia], ob = topo.octavos[ib];
    const a = kw.O[ia] || `Ganador(${oa.a}/${oa.b})`;
    const b = kw.O[ib] || `Ganador(${ob.a}/${ob.b})`;
    labels.push(['Cuartos', a, b]);
  });
  sim.freeSf.forEach(k => {
    const [ia, ib] = topo.sf_pairs[k];
    const a = kw.Q[ia] || `Ganador(Cuartos ${ia + 1})`;
    const b = kw.Q[ib] || `Ganador(Cuartos ${ib + 1})`;
    labels.push(['Semis', a, b]);
  });
  if (sim.freeFinal) {
    const [fa, fb] = topo.f_pair;
    const a = kw.S[fa] || `Ganador(Semis ${fa + 1})`;
    const b = kw.S[fb] || `Ganador(Semis ${fb + 1})`;
    labels.push(['Final', a, b]);
  }
  if (sim.freeTp) {
    const [ta, tb] = topo.tp_pair;
    const a = kw.SLoser[ta] || `Perdedor(Semis ${ta + 1})`;
    const b = kw.SLoser[tb] || `Perdedor(Semis ${tb + 1})`;
    labels.push(['3º-4º puesto', a, b]);
  }
  return labels;
}

function feRanksAndPaymentsFromGroups(groups) {
  const rank = {}, payment = {};
  let pos = 0;
  groups.forEach(group => {
    const avgRank = pos + 1 + (group.length - 1) / 2;
    group.forEach(p => { rank[p] = avgRank; payment[p] = simPaymentForRank(avgRank); });
    pos += group.length;
  });
  return { rank, payment };
}

function feWq(pairsMap, q, tot) {
  const items = Object.entries(pairsMap).map(([v, p]) => [parseFloat(v), p]).sort((a, b) => a[0] - b[0]);
  if (!items.length) return 0;
  const target = q * tot;
  let cum = 0;
  for (const [val, pr] of items) {
    cum += pr;
    if (cum >= target - 1e-9) return val;
  }
  return items[items.length - 1][0];
}

function feDescribeScenario(w, gname, bname, score, tiedWith, secondName, secondScore, branchW, totalProbWeighted, locks) {
  const topo = ORIGINAL_PD.topology;
  const events = [];
  topo.octavos.forEach((o, i) => { if (!o.resolved) events.push({ stage: 'Octavos', a: o.a, b: o.b, winner: w.O_winner[i] }); });
  topo.qf_pairs.forEach(([ia, ib], k) => {
    const oa = topo.octavos[ia], ob = topo.octavos[ib];
    const a = (oa.resolved || locks.octavos[ia] !== undefined) ? w.O_winner[ia] : `Ganador(${oa.a}/${oa.b})`;
    const b = (ob.resolved || locks.octavos[ib] !== undefined) ? w.O_winner[ib] : `Ganador(${ob.a}/${ob.b})`;
    events.push({ stage: 'Cuartos', a, b, winner: w.Q_winner[k] });
  });
  topo.sf_pairs.forEach(([ia, ib], k) => { events.push({ stage: 'Semis', a: w.Q_winner[ia], b: w.Q_winner[ib], winner: w.S_winner[k] }); });
  const [fa, fb] = topo.f_pair; events.push({ stage: 'Final', a: w.S_winner[fa], b: w.S_winner[fb], winner: w.champion });
  const [ta, tb] = topo.tp_pair; events.push({ stage: '3º-4º puesto', a: w.S_loser[ta], b: w.S_loser[tb], winner: w.winner34 });
  return {
    events, champion: w.champion, runner_up: w.runner, tercer_puesto: w.winner34,
    golden: gname, ball: bname, prob_pct: feRound4(100 * branchW / totalProbWeighted),
    score, tied_with: tiedWith, second_name: secondName, second_score: secondScore,
  };
}

// ---------------------------------------------------------------------- orquestador --
function computeFilteredPD(locks) {
  const sim = feMakeSimulator(locks);
  const players = PRED_PLAYERS;
  const picks = ORIGINAL_PD.picks;
  const currentTotal = ORIGINAL_PD.current_total;
  const goldenCandidates = locks.golden
    ? [[locks.golden, 1.0]]
    : ORIGINAL_PD.golden.candidates.map(c => [c.name, c.pct / 100]);
  const ballCandidates = locks.ball
    ? [[locks.ball, 1.0]]
    : ORIGINAL_PD.ball.candidates.map(c => [c.name, c.pct / 100]);
  const kw = feKnownWinners(locks);
  const matchLabels = feMatchLabels(locks, sim, kw);
  const nCombos = 1 << sim.nBits;

  const modes = ['uniform', 'weighted'];
  const acc = {};
  modes.forEach(mode => {
    acc[mode] = {
      winMass: {}, scoreSum: {}, scorePairs: {}, cutsSum: {}, cutsPairs: {}, rankDist: {},
      impactMassA: new Array(matchLabels.length).fill(0), impactMassB: new Array(matchLabels.length).fill(0),
      impactCutsA: matchLabels.map(() => ({})), impactCutsB: matchLabels.map(() => ({})),
      totalProb: 0,
    };
    players.forEach(p => {
      acc[mode].winMass[p] = 0; acc[mode].scoreSum[p] = 0; acc[mode].scorePairs[p] = {};
      acc[mode].cutsSum[p] = 0; acc[mode].cutsPairs[p] = {}; acc[mode].rankDist[p] = new Array(players.length).fill(0);
      matchLabels.forEach((_, m) => { acc[mode].impactCutsA[m][p] = 0; acc[mode].impactCutsB[m][p] = 0; });
    });
  });

  const bracketMin = {}, bracketMax = {}; players.forEach(p => { bracketMin[p] = null; bracketMax[p] = null; });
  const caminoBest = {}; players.forEach(p => caminoBest[p] = { w: -1, bits: null, gname: null, bname: null, score: null, tiedWith: [], secondName: null, secondScore: null });

  // Distribución condicionada del cuadro (sustituye a la antigua DP cerrada):
  // se acumula aquí mismo, una vez por rama (no por combinación de
  // Bota/Balón de Oro, que no influye en quién gana cada partido), sumando
  // solo las ramas que sobreviven al filtro de locks de semis/final/tp.
  const topo = ORIGINAL_PD.topology;
  const qfAgg = topo.qf_pairs.map(() => ({}));
  const sfAgg = topo.sf_pairs.map(() => ({}));
  const lAgg = topo.sf_pairs.map(() => ({}));
  const champAgg = {}, tpAgg = {};
  let bracketTotalW = 0;

  for (let mask = 0; mask < nCombos; mask++) {
    const bits = []; for (let b = 0; b < sim.nBits; b++) bits.push((mask >> b) & 1);
    const w = sim.simulate(bits);
    // Descarta ramas que contradicen un lock de "este equipo gana esta
    // ronda" fijado sin conocer todavía a su rival -- es lo que convierte
    // el resto del cálculo en una probabilidad condicionada a ese evento.
    if (!feLocksSatisfied(w, locks)) continue;

    bracketTotalW += w.probW;
    topo.qf_pairs.forEach((_, k) => { qfAgg[k][w.Q_winner[k]] = (qfAgg[k][w.Q_winner[k]] || 0) + w.probW; });
    topo.sf_pairs.forEach((_, k) => {
      sfAgg[k][w.S_winner[k]] = (sfAgg[k][w.S_winner[k]] || 0) + w.probW;
      lAgg[k][w.S_loser[k]] = (lAgg[k][w.S_loser[k]] || 0) + w.probW;
    });
    champAgg[w.champion] = (champAgg[w.champion] || 0) + w.probW;
    tpAgg[w.winner34] = (tpAgg[w.winner34] || 0) + w.probW;

    const bracketScores = {}; players.forEach(p => bracketScores[p] = simScorePlayer(picks[p], w));
    players.forEach(p => {
      bracketMin[p] = bracketMin[p] === null ? bracketScores[p] : Math.min(bracketMin[p], bracketScores[p]);
      bracketMax[p] = bracketMax[p] === null ? bracketScores[p] : Math.max(bracketMax[p], bracketScores[p]);
    });

    goldenCandidates.forEach(([gname, gprob]) => {
      ballCandidates.forEach(([bname, bprob2]) => {
        const scores = {};
        players.forEach(p => {
          let s = currentTotal[p] + bracketScores[p];
          if (picks[p].botaoro === gname) s += FE_AWARD_BONUS;
          if (picks[p].balonoro === bname) s += FE_AWARD_BONUS;
          scores[p] = s;
        });
        const maxscore = Math.max(...players.map(p => scores[p]));
        const leaders = players.filter(p => scores[p] === maxscore);
        const groups = simRankGroups(scores);
        const { payment } = feRanksAndPaymentsFromGroups(groups);
        const secondGroup = groups.length > 1 ? groups[1] : [];

        modes.forEach(mode => {
          const weight = mode === 'weighted' ? (w.probW * gprob * bprob2) : ((1 / nCombos) * gprob * bprob2);
          const A = acc[mode];
          A.totalProb += weight;
          leaders.forEach(p => A.winMass[p] += weight / leaders.length);
          if (mode === 'weighted') {
            leaders.forEach(p => {
              if (weight > caminoBest[p].w) {
                caminoBest[p] = {
                  w: weight, bits: bits.slice(), gname, bname, score: scores[p],
                  tiedWith: leaders.filter(q => q !== p),
                  secondName: secondGroup[0] || null,
                  secondScore: secondGroup.length ? scores[secondGroup[0]] : null,
                };
              }
            });
          }
          let pos = 0;
          groups.forEach(group => {
            const share = weight / group.length;
            for (let gp = pos; gp < pos + group.length; gp++) group.forEach(p => { A.rankDist[p][gp] += share; });
            pos += group.length;
          });
          players.forEach(p => {
            A.scoreSum[p] += weight * scores[p];
            A.scorePairs[p][scores[p]] = (A.scorePairs[p][scores[p]] || 0) + weight;
            const pay = feRound6(payment[p]);
            A.cutsSum[p] += weight * pay;
            A.cutsPairs[p][pay] = (A.cutsPairs[p][pay] || 0) + weight;
          });
          matchLabels.forEach((_, m) => {
            if (bits[m] === 0) { A.impactMassA[m] += weight; players.forEach(p => A.impactCutsA[m][p] += weight * payment[p]); }
            else { A.impactMassB[m] += weight; players.forEach(p => A.impactCutsB[m][p] += weight * payment[p]); }
          });
        });
      });
    });
  }

  // Combinación de locks contradictoria (p. ej. fijar a un equipo como
  // ganador Y como perdedor de la misma semifinal): ninguna rama del cuadro
  // la cumple, así que no hay nada que normalizar.
  if (acc.weighted.totalProb <= 0 || bracketTotalW <= 0) return null;

  const summary = {}, chuletonExp = {}, chuletonDist = {}, rankDistPct = {}, matchesOut = {};
  modes.forEach(mode => {
    const A = acc[mode], tot = A.totalProb;
    summary[mode] = {}; chuletonExp[mode] = {}; chuletonDist[mode] = {};
    players.forEach(p => {
      summary[mode][p] = {
        win_pct: feRound2(100 * A.winMass[p] / tot),
        mean: Math.round((A.scoreSum[p] / tot) * 10) / 10,
        p10: feWq(A.scorePairs[p], 0.10, tot), p50: feWq(A.scorePairs[p], 0.50, tot), p90: feWq(A.scorePairs[p], 0.90, tot),
      };
      chuletonExp[mode][p] = feRound4(A.cutsSum[p] / tot);
      chuletonDist[mode][p] = {
        min: feWq(A.cutsPairs[p], 0.0, tot), p10: feWq(A.cutsPairs[p], 0.10, tot), q1: feWq(A.cutsPairs[p], 0.25, tot),
        median: feWq(A.cutsPairs[p], 0.50, tot), q3: feWq(A.cutsPairs[p], 0.75, tot), p90: feWq(A.cutsPairs[p], 0.90, tot),
        max: feWq(A.cutsPairs[p], 1.0, tot), mean: chuletonExp[mode][p],
      };
    });
    rankDistPct[mode] = {};
    players.forEach(p => { rankDistPct[mode][p] = A.rankDist[p].map(v => feRound2(100 * v / tot)); });

    matchesOut[mode] = matchLabels.map(([stage, a, b], m) => {
      const playersDict = {}; let impact = 0;
      players.forEach(p => {
        const ca = A.impactMassA[m] > 0 ? feRound4(A.impactCutsA[m][p] / A.impactMassA[m]) : 0;
        const cb = A.impactMassB[m] > 0 ? feRound4(A.impactCutsB[m][p] / A.impactMassB[m]) : 0;
        playersDict[p] = { cutsA: ca, cutsB: cb };
        impact += Math.abs(ca - cb);
      });
      return {
        stage, a, b, probA: feRound1(100 * A.impactMassA[m] / tot), probB: feRound1(100 * A.impactMassB[m] / tot),
        impact: feRound3(impact), players: playersDict,
      };
    })
      // Una semifinal/final/3º-4º puesto puede quedar ya decidida al 100%/0%
      // sin haberse fijado ella misma -- basta con que un lock POSTERIOR
      // (p. ej. el campeón) la implique (ver feLocksSatisfied). Su bit se
      // sigue enumerando porque hace falta para filtrar bien esa condición,
      // pero ya no aporta ninguna incertidumbre real que "mueva la porra",
      // así que se saca de la tabla igual que un partido ya jugado de
      // verdad. Cuartos/octavos no necesitan este filtro: cuando se fijan,
      // su bit se retira directamente de la enumeración (feMakeSimulator),
      // así que nunca llegan aquí en primer lugar.
      .filter(row => !(FE_STAGES_LOCKABLE.has(row.stage) && (row.probA === 0 || row.probB === 0)));
  });

  const origByName = {}; ORIGINAL_PD.players.forEach(p => { origByName[p.name] = p; });
  // Si Bota/Balón de Oro está fijado a un candidato, el bonus de +24 solo
  // sigue siendo alcanzable para quien lo tenga picado exactamente a él --
  // para el resto, ese máximo teórico ya no es real y hay que descontarlo.
  const goldenBonusMax = p => (locks.golden ? (picks[p].botaoro === locks.golden ? FE_AWARD_BONUS : 0) : FE_AWARD_BONUS);
  const ballBonusMax = p => (locks.ball ? (picks[p].balonoro === locks.ball ? FE_AWARD_BONUS : 0) : FE_AWARD_BONUS);
  const playersOut = players.map(p => ({
    name: p, current: currentTotal[p],
    ko_min: bracketMin[p], ko_max: bracketMax[p],
    total_min: currentTotal[p] + bracketMin[p],
    total_max: currentTotal[p] + bracketMax[p] + goldenBonusMax(p) + ballBonusMax(p),
    uniform: { total_avg: summary.uniform[p].mean, win_pct: summary.uniform[p].win_pct },
    weighted: {
      mean: summary.weighted[p].mean, p10: summary.weighted[p].p10, p50: summary.weighted[p].p50,
      p90: summary.weighted[p].p90, win_pct: summary.weighted[p].win_pct,
    },
    dead: origByName[p].dead,
    chuleton: { uniform: chuletonExp.uniform[p], weighted: chuletonExp.weighted[p] },
    chuleton_box: { uniform: chuletonDist.uniform[p], weighted: chuletonDist.weighted[p] },
    rank_dist: { uniform: rankDistPct.uniform[p], weighted: rankDistPct.weighted[p] },
    golden_pick: picks[p].botaoro, ball_pick: picks[p].balonoro,
  }));

  const caminoOut = {};
  players.forEach(p => {
    const cb = caminoBest[p];
    if (cb.bits === null) { caminoOut[p] = null; return; }
    const w = sim.simulate(cb.bits);
    caminoOut[p] = feDescribeScenario(w, cb.gname, cb.bname, cb.score, cb.tiedWith, cb.secondName, cb.secondScore, cb.w, acc.weighted.totalProb, locks);
  });

  const feNormDist = (d) => { const out = {}; for (const t in d) out[t] = d[t] / bracketTotalW; return out; };
  const dists = {
    Q_dist: qfAgg.map(feNormDist), S_dist: sfAgg.map(feNormDist), L_dist: lAgg.map(feNormDist),
    F_dist: feNormDist(champAgg), T34_dist: feNormDist(tpAgg),
  };
  const bracket = feBuildBracket(locks, dists);

  // Si Bota/Balón de Oro está fijado, la sección de Premios debe reflejarlo
  // (100% el fijado, 0% el resto) -- si no, mostraría las cuotas reales de
  // mercado contradiciendo al resto de la página, que ya lo trata como seguro.
  const feAwardOut = (original, lockedName) => {
    if (!lockedName) return original;
    return {
      candidates: original.candidates.map(c => ({ name: c.name, pct: c.name === lockedName ? 100 : 0 })),
      picks: original.picks,
    };
  };

  return {
    generated_from_last_updated: ORIGINAL_PD.generated_from_last_updated,
    // matchLabels.length === sim.nBits: un partido ya decidido por el
    // filtro se saca de matchesOut más abajo (ver el .filter() al construir
    // matchesOut), pero su bit se sigue enumerando -- así que
    // 2^n_remaining_matches sigue cuadrando con n_combinations tal cual se
    // anuncia en la página, aunque la tabla de impacto muestre menos filas.
    n_remaining_matches: matchLabels.length,
    n_combinations: nCombos,
    players: playersOut,
    matches_uniform: matchesOut.uniform,
    matches_weighted: matchesOut.weighted,
    bracket,
    golden: feAwardOut(ORIGINAL_PD.golden, locks.golden), ball: feAwardOut(ORIGINAL_PD.ball, locks.ball), elo: ORIGINAL_PD.elo,
    camino: caminoOut,
    affinity: ORIGINAL_PD.affinity,
    picks: ORIGINAL_PD.picks, topology: ORIGINAL_PD.topology,
    current_total: ORIGINAL_PD.current_total, known_matchups: ORIGINAL_PD.known_matchups,
  };
}

// ------------------------------------------------------------------------- UI --
// Si un partido ya bloqueado deja de tener sus dos equipos conocidos (p. ej.
// se desmarca el octavos del que dependía), el bloqueo de la ronda
// siguiente deja de tener sentido -- se retira solo, en vez de arrastrar un
// equipo fantasma por el resto del cálculo. Desde semis, "sentido" ya no
// significa "los dos rivales son conocidos" sino "el equipo fijado sigue
// siendo un candidato posible" (ver feSfEntrantPool/feFinalEntrantPool/
// feTpEntrantPool) -- si otro lock deja fuera de juego al equipo antes
// fijado (p. ej. se marca que pierde su cuartos), el lock de la ronda
// siguiente se retira solo en vez de arrastrar un imposible.
// Reutiliza feKnownWinners() en vez de recorrer la cascada octavos->qf->sf
// por su cuenta (antes lo hacía dos veces, una en cada función). Se
// recalcula tras cada poda porque quitar un lock de una ronda puede dejar
// inválido el de la siguiente (p. ej. desmarcar un octavos invalida el
// cuartos que dependía de él, lo que a su vez invalidaría una semifinal).
function feSanitizeLocks() {
  let kw = feKnownWinners(feLocks);
  Object.keys(feLocks.qf).forEach(k => { if (!kw.Q[+k]) delete feLocks.qf[+k]; });
  kw = feKnownWinners(feLocks);
  Object.keys(feLocks.sf).forEach(k => { if (!feSfEntrantPool(kw, +k).includes(feLocks.sf[k])) delete feLocks.sf[+k]; });
  kw = feKnownWinners(feLocks);
  if (feLocks.final && !feFinalEntrantPool(kw).includes(feLocks.final)) feLocks.final = null;
  if (feLocks.tp && !feTpEntrantPool(kw).includes(feLocks.tp)) feLocks.tp = null;
}

function feAwardRowHTML(kind, label, candidates, currentLock) {
  const unmarked = currentLock === null || currentLock === undefined;
  let html = `<div class="pred-filter-award-row">
    <div class="pred-filter-row-label">${label}</div>
    <div class="pred-filter-award-pills">
      <button class="pred-filter-pill pred-filter-unmark ${unmarked ? 'active' : ''}" data-fkind="${kind}" data-fname="">❓ sin marcar</button>`;
  candidates.forEach(c => {
    html += `<button class="pred-filter-pill ${currentLock === c.name ? 'active' : ''}" data-fkind="${kind}" data-fname="${c.name}">${c.name}</button>`;
  });
  html += `</div></div>`;
  return html;
}

function feFilterRowHTML(kind, idx, label, teamA, teamB, currentLock) {
  if (!teamA || !teamB) {
    return `<div class="pred-filter-row pred-filter-row-pending">
      <div class="pred-filter-row-label">${label}</div>
      <div class="pred-filter-row-pending-text">depende de una ronda anterior</div>
    </div>`;
  }
  const unmarked = currentLock === undefined || currentLock === null;
  return `<div class="pred-filter-row">
    <div class="pred-filter-row-label">${label}</div>
    <div class="pred-filter-choices">
      <button class="pred-filter-choice ${currentLock === 0 ? 'active' : ''}" data-fkind="${kind}" data-fidx="${idx}" data-fpick="0">${teamA}</button>
      <button class="pred-filter-choice pred-filter-unmark ${unmarked ? 'active' : ''}" data-fkind="${kind}" data-fidx="${idx}" data-fpick="unmark">❓ sin marcar</button>
      <button class="pred-filter-choice ${currentLock === 1 ? 'active' : ''}" data-fkind="${kind}" data-fidx="${idx}" data-fpick="1">${teamB}</button>
    </div>
  </div>`;
}

// Desde semis, en vez de "elige el lado A o B de un cruce ya conocido" se
// puede fijar el ganador por nombre aunque su rival concreto siga sin
// decidirse (p. ej. "gana España la final" sin fijar antes su cruce de
// semis) -- pero se sigue mostrando CON FORMA DE PARTIDO, dos lados
// enfrentados, en vez de una lista plana con todos los candidatos
// mezclados: cada lado es el pool de quien puede llegar por ESE cruce
// (poolA/poolB, típicamente 1 equipo si su ronda anterior ya está fijada,
// o 2 si sigue abierta) y fijar un cuartos rellena aquí su lado con un solo
// nombre ya seleccionable, en cascada, sin tener que tocar nada más.
function feMatchPickRowHTML(kind, idx, label, poolA, poolB, currentLock) {
  const unmarked = currentLock === null || currentLock === undefined;
  const idxAttr = idx === null ? '' : ` data-fidx="${idx}"`;
  const sideHTML = pool => [...new Set(pool)].map(team =>
    `<button class="pred-filter-choice ${currentLock === team ? 'active' : ''}" data-fkind="${kind}"${idxAttr} data-fname="${team}">${team}</button>`
  ).join('');
  return `<div class="pred-filter-row">
    <div class="pred-filter-row-label">${label}</div>
    <div class="pred-filter-match">
      <div class="pred-filter-match-side">${sideHTML(poolA)}</div>
      <div class="pred-filter-match-vs">vs</div>
      <div class="pred-filter-match-side">${sideHTML(poolB)}</div>
    </div>
    <button class="pred-filter-choice pred-filter-unmark ${unmarked ? 'active' : ''}" data-fkind="${kind}"${idxAttr} data-fname="">❓ sin marcar</button>
  </div>`;
}

// Los partidos ya resueltos de verdad no se pueden fijar a mano (no hay
// nada que decidir), así que no aportan nada aquí -- se omiten del todo en
// vez de dejar una fila informativa "ya jugado" ocupando sitio. Cada grupo
// solo aparece si le queda al menos un partido por marcar.
function feGroupHTML(title, rowsHtml) {
  return rowsHtml ? `<div class="pred-filter-group-title">${title}</div>${rowsHtml}` : '';
}

function renderPredFilterBar() {
  if (!ORIGINAL_PD) return;
  const topo = ORIGINAL_PD.topology;
  const kw = feKnownWinners(feLocks);
  let html = '';

  // Los octavos ya se jugaron todos de verdad -- no queda ninguno que
  // fijar aquí, así que este filtro empieza directamente en cuartos.
  let qfRows = '';
  topo.qf_pairs.forEach((pair, k) => {
    if (topo.qf_resolved[k]) return;
    const [teamA, teamB] = kw.Qteams[k];
    qfRows += feFilterRowHTML('qf', k, `Cuartos ${k + 1}`, teamA, teamB, feLocks.qf[k]);
  });
  html += feGroupHTML('Cuartos', qfRows);

  let sfRows = '';
  topo.sf_pairs.forEach(([ia, ib], k) => {
    if (topo.sf_resolved[k]) return;
    sfRows += feMatchPickRowHTML('sf', k, `Semifinal ${k + 1}`, feQfWinnerPool(kw, ia), feQfWinnerPool(kw, ib), feLocks.sf[k]);
  });
  html += feGroupHTML('Semis', sfRows);

  const [fa, fb] = topo.f_pair, [ta, tb] = topo.tp_pair;
  const finalTpRows = feMatchPickRowHTML('final', null, 'Final', feSfWinnerPool(kw, fa), feSfWinnerPool(kw, fb), feLocks.final)
    + feMatchPickRowHTML('tp', null, '3º-4º puesto', feSfLoserPool(kw, ta), feSfLoserPool(kw, tb), feLocks.tp);
  html += feGroupHTML('Final y 3º-4º puesto', finalTpRows);

  html += `<div class="pred-filter-group-title">Premios</div>`;
  html += feAwardRowHTML('golden', '🥾 Bota de Oro', ORIGINAL_PD.golden.candidates, feLocks.golden);
  html += feAwardRowHTML('ball', '⚽ Balón de Oro', ORIGINAL_PD.ball.candidates, feLocks.ball);

  document.getElementById('predFilterBar').innerHTML = html;

  const statusEl = document.getElementById('predFilterStatus');
  if (feAnyLockActive()) {
    statusEl.innerHTML = `🎯 Viendo un escenario parcial (los partidos que quedan sin marcar siguen pesando por su probabilidad real). <button id="predFilterClear">✕ Quitar filtro</button>`;
    document.getElementById('predFilterClear').addEventListener('click', feClearFilter);
  } else {
    statusEl.innerHTML = `Marca el resultado de un partido para fijarlo, o déjalo en "❓ sin marcar" para que siga pesando por su probabilidad real (Kalshi/Elo).`;
  }
}

function feUpdateStaleNotes() {
  const active = feAnyLockActive();
  document.getElementById('predFilterStaleAffinity').hidden = !active;
  document.getElementById('predFilterStaleDead').hidden = !active;
}

function feApplyFilter() {
  feSanitizeLocks();
  if (!feAnyLockActive()) {
    PD = ORIGINAL_PD;
    renderPredFilterBar();
    renderPredAll();
    feUpdateStaleNotes();
    return;
  }
  const computed = computeFilteredPD(feLocks);
  // Combinación contradictoria entre locks de rondas distintas (p. ej. un
  // equipo fijado como ganador de una semifinal y también como perdedor de
  // 3º-4º puesto) -- ninguna rama del cuadro la cumple. Se avisa en vez de
  // pintar la página con NaN.
  if (computed === null) {
    renderPredFilterBar();
    const statusEl = document.getElementById('predFilterStatus');
    statusEl.innerHTML = `⚠️ Esa combinación de resultados fijados es imposible entre sí (p. ej. un equipo no puede ganar y perder la misma ronda). Quita alguna marca para seguir. <button id="predFilterClear">✕ Quitar filtro</button>`;
    document.getElementById('predFilterClear').addEventListener('click', feClearFilter);
    return;
  }
  PD = computed;
  renderPredFilterBar();
  renderPredAll();
  feUpdateStaleNotes();
}

function feClearFilter() {
  feLocks = { octavos: {}, qf: {}, sf: {}, final: null, tp: null, golden: null, ball: null };
  PD = ORIGINAL_PD;
  renderPredFilterBar();
  renderPredAll();
  feUpdateStaleNotes();
}

document.getElementById('predFilterBar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-fkind]');
  if (!btn) return;
  const kind = btn.dataset.fkind;
  if (kind === 'golden' || kind === 'ball' || kind === 'final' || kind === 'tp') {
    feLocks[kind] = btn.dataset.fname || null;
  } else if (kind === 'sf') {
    const idx = Number(btn.dataset.fidx);
    const name = btn.dataset.fname;
    if (!name) delete feLocks.sf[idx]; else feLocks.sf[idx] = name;
  } else {
    const pick = btn.dataset.fpick;
    const idx = Number(btn.dataset.fidx);
    if (pick === 'unmark') delete feLocks[kind][idx];
    else feLocks[kind][idx] = Number(pick);
  }
  feApplyFilter();
});

renderPredFilterBar();
