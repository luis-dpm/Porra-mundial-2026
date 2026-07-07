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

// locks: qué partidos ha fijado el usuario. Cada ronda es un objeto
// {indice: 0|1} (0 = gana el equipo "a", 1 = gana "b"); si el índice no
// está presente, el partido sigue sin marcar. final/tp son un único 0/1/null.
let feLocks = { octavos: {}, qf: {}, sf: {}, final: null, tp: null };

function feAnyLockActive() {
  return Object.keys(feLocks.octavos).length > 0 || Object.keys(feLocks.qf).length > 0 ||
         Object.keys(feLocks.sf).length > 0 || feLocks.final !== null || feLocks.tp !== null;
}

function feRound1(x) { return Math.round(x * 10) / 10; }
function feRound2(x) { return Math.round(x * 100) / 100; }
function feRound3(x) { return Math.round(x * 1000) / 1000; }
function feRound4(x) { return Math.round(x * 10000) / 10000; }

// ---------------------------------------------------------- cascada de equipos conocidos --
// Para cada ronda, qué equipos concretos juegan (null si su ronda anterior
// todavía no está decidida ni por resultado real ni por un lock) y quién ha
// ganado (null si esa ronda en sí sigue sin marcar).
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
  const S = topo.sf_pairs.map(([ia, ib], k) => {
    if (topo.sf_resolved[k]) return topo.sf_winner[k];
    if (locks.sf[k] !== undefined && Q[ia] && Q[ib]) return locks.sf[k] === 0 ? Q[ia] : Q[ib];
    return null;
  });
  const Steams = topo.sf_pairs.map(([ia, ib]) => [Q[ia], Q[ib]]);
  const SLoser = topo.sf_pairs.map((_, k) => {
    if (!S[k]) return null;
    const [ta, tb] = Steams[k];
    return S[k] === ta ? tb : ta;
  });
  const [fa, fb] = topo.f_pair;
  const finalTeams = [S[fa], S[fb]];
  const [ta, tb] = topo.tp_pair;
  const tpTeams = [SLoser[ta], SLoser[tb]];
  return { O, Oteams: topo.octavos.map(o => [o.a, o.b]), Q, Qteams, S, Steams, SLoser, finalTeams, tpTeams };
}

// -------------------------------------------------------------- DP de distribuciones --
// Igual que el "bracket con probabilidades" del script Python: propaga la
// distribución de quién llega a cada ronda sin necesidad de enumerar 2^n
// combinaciones. Un lock (o un resultado real) simplemente colapsa la
// distribución de ese partido a {equipo: 1.0}.
function feNextRoundDist(pairs, dists) {
  return pairs.map(([ia, ib]) => {
    const distA = dists[ia], distB = dists[ib];
    const result = {};
    for (const teamA in distA) {
      let winProb = 0;
      for (const teamB in distB) winProb += distB[teamB] * simHybridProb(teamA, teamB);
      result[teamA] = distA[teamA] * winProb;
    }
    for (const teamB in distB) {
      let winProb = 0;
      for (const teamA in distA) winProb += distA[teamA] * simHybridProb(teamB, teamA);
      result[teamB] = distB[teamB] * winProb;
    }
    return result;
  });
}

function feLoserDist(distA, distB) {
  const result = {};
  for (const teamA in distA) {
    let loseProb = 0;
    for (const teamB in distB) loseProb += distB[teamB] * simHybridProb(teamB, teamA);
    result[teamA] = distA[teamA] * loseProb;
  }
  for (const teamB in distB) {
    let loseProb = 0;
    for (const teamA in distA) loseProb += distA[teamA] * simHybridProb(teamA, teamB);
    result[teamB] = distB[teamB] * loseProb;
  }
  return result;
}

function feMergeDists(dists) {
  const out = {};
  dists.forEach(d => { for (const t in d) out[t] = (out[t] || 0) + d[t]; });
  return out;
}

function feTopN(dist) {
  return Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([team, p]) => ({ team, pct: feRound1(p * 100) }));
}

function feSingleWinner(dist) {
  const keys = Object.keys(dist);
  return keys.length === 1 ? keys[0] : null;
}

function feBuildDists(locks) {
  const topo = ORIGINAL_PD.topology;
  const O_dist = topo.octavos.map((o, i) => {
    if (o.resolved) return { [o.winner]: 1.0 };
    if (locks.octavos[i] !== undefined) return { [locks.octavos[i] === 0 ? o.a : o.b]: 1.0 };
    return { [o.a]: o.probA, [o.b]: 1 - o.probA };
  });
  const Q_dist = feNextRoundDist(topo.qf_pairs, O_dist);
  topo.qf_pairs.forEach(([ia, ib], k) => {
    if (topo.qf_resolved[k]) { Q_dist[k] = { [topo.qf_winner[k]]: 1.0 }; return; }
    if (locks.qf[k] !== undefined) {
      const teamA = feSingleWinner(O_dist[ia]), teamB = feSingleWinner(O_dist[ib]);
      if (teamA && teamB) Q_dist[k] = { [locks.qf[k] === 0 ? teamA : teamB]: 1.0 };
    }
  });
  const S_dist = feNextRoundDist(topo.sf_pairs, Q_dist);
  const L_dist = topo.sf_pairs.map(([ia, ib]) => feLoserDist(Q_dist[ia], Q_dist[ib]));
  topo.sf_pairs.forEach(([ia, ib], k) => {
    if (topo.sf_resolved[k]) {
      const winner = topo.sf_winner[k];
      const teamA = feSingleWinner(Q_dist[ia]), teamB = feSingleWinner(Q_dist[ib]);
      const loser = winner === teamA ? teamB : teamA;
      S_dist[k] = { [winner]: 1.0 }; L_dist[k] = { [loser]: 1.0 };
      return;
    }
    if (locks.sf[k] !== undefined) {
      const teamA = feSingleWinner(Q_dist[ia]), teamB = feSingleWinner(Q_dist[ib]);
      if (teamA && teamB) {
        const winner = locks.sf[k] === 0 ? teamA : teamB;
        const loser = winner === teamA ? teamB : teamA;
        S_dist[k] = { [winner]: 1.0 }; L_dist[k] = { [loser]: 1.0 };
      }
    }
  });
  let F_dist = feNextRoundDist([topo.f_pair], S_dist)[0];
  if (locks.final !== null && locks.final !== undefined) {
    const [ia, ib] = topo.f_pair;
    const teamA = feSingleWinner(S_dist[ia]), teamB = feSingleWinner(S_dist[ib]);
    if (teamA && teamB) F_dist = { [locks.final === 0 ? teamA : teamB]: 1.0 };
  }
  let T34_dist = feNextRoundDist([topo.tp_pair], L_dist)[0];
  if (locks.tp !== null && locks.tp !== undefined) {
    const [ia, ib] = topo.tp_pair;
    const teamA = feSingleWinner(L_dist[ia]), teamB = feSingleWinner(L_dist[ib]);
    if (teamA && teamB) T34_dist = { [locks.tp === 0 ? teamA : teamB]: 1.0 };
  }
  return { O_dist, Q_dist, S_dist, L_dist, F_dist, T34_dist };
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
  const freeSf = [];
  topo.sf_pairs.forEach((_, k) => { if (!topo.sf_resolved[k] && locks.sf[k] === undefined) freeSf.push(k); });
  const freeFinal = locks.final === null || locks.final === undefined;
  const freeTp = locks.tp === null || locks.tp === undefined;
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
      if (locks.sf[k] !== undefined) {
        S_winner[k] = locks.sf[k] === 0 ? teamA : teamB; S_loser[k] = S_winner[k] === teamA ? teamB : teamA; return;
      }
      const pA = simHybridProb(teamA, teamB);
      if (bits[idx] === 0) { S_winner[k] = teamA; S_loser[k] = teamB; probW *= pA; }
      else { S_winner[k] = teamB; S_loser[k] = teamA; probW *= (1 - pA); }
      idx++;
    });

    const [fa, fb] = topo.f_pair, fTeamA = S_winner[fa], fTeamB = S_winner[fb];
    let champion, runner;
    if (locks.final !== null && locks.final !== undefined) {
      champion = locks.final === 0 ? fTeamA : fTeamB; runner = champion === fTeamA ? fTeamB : fTeamA;
    } else {
      const pA = simHybridProb(fTeamA, fTeamB);
      if (bits[idx] === 0) { champion = fTeamA; runner = fTeamB; probW *= pA; }
      else { champion = fTeamB; runner = fTeamA; probW *= (1 - pA); }
      idx++;
    }

    const [ta, tb] = topo.tp_pair, tTeamA = S_loser[ta], tTeamB = S_loser[tb];
    let winner34;
    if (locks.tp !== null && locks.tp !== undefined) {
      winner34 = locks.tp === 0 ? tTeamA : tTeamB;
    } else {
      const pA = simHybridProb(tTeamA, tTeamB);
      if (bits[idx] === 0) { winner34 = tTeamA; probW *= pA; } else { winner34 = tTeamB; probW *= (1 - pA); }
      idx++;
    }

    return { O_winner, Q_winner, S_winner, S_loser, champion, runner, winner34, probW };
  }

  return { simulate, nBits, freeOctavos, freeQf, freeSf, freeFinal, freeTp };
}

function feMatchLabels(locks, sim) {
  const topo = ORIGINAL_PD.topology;
  const labels = [];
  sim.freeOctavos.forEach(i => { const o = topo.octavos[i]; labels.push(['Octavos', o.a, o.b]); });
  sim.freeQf.forEach(k => {
    const [ia, ib] = topo.qf_pairs[k];
    const oa = topo.octavos[ia], ob = topo.octavos[ib];
    const a = oa.resolved ? oa.winner : (locks.octavos[ia] !== undefined ? (locks.octavos[ia] === 0 ? oa.a : oa.b) : `Ganador(${oa.a}/${oa.b})`);
    const b = ob.resolved ? ob.winner : (locks.octavos[ib] !== undefined ? (locks.octavos[ib] === 0 ? ob.a : ob.b) : `Ganador(${ob.a}/${ob.b})`);
    labels.push(['Cuartos', a, b]);
  });
  sim.freeSf.forEach(k => {
    const [ia, ib] = topo.sf_pairs[k];
    labels.push(['Semis', `Ganador(Cuartos ${ia + 1})`, `Ganador(Cuartos ${ib + 1})`]);
  });
  if (sim.freeFinal) {
    const [fa, fb] = topo.f_pair;
    labels.push(['Final', `Ganador(Semis ${fa + 1})`, `Ganador(Semis ${fb + 1})`]);
  }
  if (sim.freeTp) {
    const [ta, tb] = topo.tp_pair;
    labels.push(['3º-4º puesto', `Perdedor(Semis ${ta + 1})`, `Perdedor(Semis ${tb + 1})`]);
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

function feDescribeScenario(w, gname, bname, score, tiedWith, secondName, secondScore, branchW, totalProbWeighted) {
  const topo = ORIGINAL_PD.topology;
  const events = [];
  topo.octavos.forEach((o, i) => { if (!o.resolved) events.push({ stage: 'Octavos', a: o.a, b: o.b, winner: w.O_winner[i] }); });
  topo.qf_pairs.forEach(([ia, ib], k) => {
    const oa = topo.octavos[ia], ob = topo.octavos[ib];
    const a = oa.resolved ? oa.winner : `Ganador(${oa.a}/${oa.b})`;
    const b = ob.resolved ? ob.winner : `Ganador(${ob.a}/${ob.b})`;
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
  const goldenCandidates = ORIGINAL_PD.golden.candidates.map(c => [c.name, c.pct / 100]);
  const ballCandidates = ORIGINAL_PD.ball.candidates.map(c => [c.name, c.pct / 100]);
  const matchLabels = feMatchLabels(locks, sim);
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

  for (let mask = 0; mask < nCombos; mask++) {
    const bits = []; for (let b = 0; b < sim.nBits; b++) bits.push((mask >> b) & 1);
    const w = sim.simulate(bits);
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
          if (picks[p].botaoro === gname) s += 24;
          if (picks[p].balonoro === bname) s += 24;
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
            const pay = Math.round(payment[p] * 1e6) / 1e6;
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
    });
  });

  const origByName = {}; ORIGINAL_PD.players.forEach(p => { origByName[p.name] = p; });
  const playersOut = players.map(p => ({
    name: p, current: currentTotal[p],
    ko_min: bracketMin[p], ko_max: bracketMax[p],
    total_min: currentTotal[p] + bracketMin[p],
    total_max: currentTotal[p] + bracketMax[p] + 24 + 24,
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
    caminoOut[p] = feDescribeScenario(w, cb.gname, cb.bname, cb.score, cb.tiedWith, cb.secondName, cb.secondScore, cb.w, acc.weighted.totalProb);
  });

  const dists = feBuildDists(locks);
  const bracket = feBuildBracket(locks, dists);

  return {
    generated_from_last_updated: ORIGINAL_PD.generated_from_last_updated,
    n_remaining_matches: matchLabels.length,
    n_combinations: nCombos,
    players: playersOut,
    matches_uniform: matchesOut.uniform,
    matches_weighted: matchesOut.weighted,
    bracket,
    golden: ORIGINAL_PD.golden, ball: ORIGINAL_PD.ball, elo: ORIGINAL_PD.elo,
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
// equipo fantasma por el resto del cálculo.
function feSanitizeLocks() {
  const topo = ORIGINAL_PD.topology;
  const O = topo.octavos.map((o, i) => o.resolved ? o.winner : (feLocks.octavos[i] !== undefined ? (feLocks.octavos[i] === 0 ? o.a : o.b) : null));
  topo.qf_pairs.forEach(([ia, ib], k) => {
    if (feLocks.qf[k] !== undefined && !(O[ia] && O[ib])) delete feLocks.qf[k];
  });
  const Q = topo.qf_pairs.map(([ia, ib], k) => {
    if (topo.qf_resolved[k]) return topo.qf_winner[k];
    if (feLocks.qf[k] !== undefined && O[ia] && O[ib]) return feLocks.qf[k] === 0 ? O[ia] : O[ib];
    return null;
  });
  topo.sf_pairs.forEach(([ia, ib], k) => {
    if (feLocks.sf[k] !== undefined && !(Q[ia] && Q[ib])) delete feLocks.sf[k];
  });
  const S = topo.sf_pairs.map(([ia, ib], k) => {
    if (topo.sf_resolved[k]) return topo.sf_winner[k];
    if (feLocks.sf[k] !== undefined && Q[ia] && Q[ib]) return feLocks.sf[k] === 0 ? Q[ia] : Q[ib];
    return null;
  });
  const Steams = topo.sf_pairs.map(([ia, ib]) => [Q[ia], Q[ib]]);
  const [fa, fb] = topo.f_pair;
  if (feLocks.final !== null && !(S[fa] && S[fb])) feLocks.final = null;
  const SLoser = topo.sf_pairs.map((_, k) => { if (!S[k]) return null; const [ta, tb] = Steams[k]; return S[k] === ta ? tb : ta; });
  const [ta, tb] = topo.tp_pair;
  if (feLocks.tp !== null && !(SLoser[ta] && SLoser[tb])) feLocks.tp = null;
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

function renderPredFilterBar() {
  if (!ORIGINAL_PD) return;
  const topo = ORIGINAL_PD.topology;
  const kw = feKnownWinners(feLocks);
  let html = '';

  html += `<div class="pred-filter-group-title">Octavos</div>`;
  topo.octavos.forEach((o, i) => {
    if (o.resolved) {
      html += `<div class="pred-filter-row pred-filter-row-real"><div class="pred-filter-row-label">Octavos</div><div class="pred-filter-row-real-text">✅ ${o.winner} (real${o.score && o.score !== '—' ? ', ' + o.score : ''})</div></div>`;
      return;
    }
    html += feFilterRowHTML('octavos', i, 'Octavos', o.a, o.b, feLocks.octavos[i]);
  });

  html += `<div class="pred-filter-group-title">Cuartos</div>`;
  topo.qf_pairs.forEach((pair, k) => {
    if (topo.qf_resolved[k]) {
      html += `<div class="pred-filter-row pred-filter-row-real"><div class="pred-filter-row-label">Cuartos ${k + 1}</div><div class="pred-filter-row-real-text">✅ ${topo.qf_winner[k]} (real)</div></div>`;
      return;
    }
    const [teamA, teamB] = kw.Qteams[k];
    html += feFilterRowHTML('qf', k, `Cuartos ${k + 1}`, teamA, teamB, feLocks.qf[k]);
  });

  html += `<div class="pred-filter-group-title">Semis</div>`;
  topo.sf_pairs.forEach((pair, k) => {
    if (topo.sf_resolved[k]) {
      html += `<div class="pred-filter-row pred-filter-row-real"><div class="pred-filter-row-label">Semifinal ${k + 1}</div><div class="pred-filter-row-real-text">✅ ${topo.sf_winner[k]} (real)</div></div>`;
      return;
    }
    const [teamA, teamB] = kw.Steams[k];
    html += feFilterRowHTML('sf', k, `Semifinal ${k + 1}`, teamA, teamB, feLocks.sf[k]);
  });

  html += `<div class="pred-filter-group-title">Final y 3º-4º puesto</div>`;
  html += feFilterRowHTML('final', 0, 'Final', kw.finalTeams[0], kw.finalTeams[1], feLocks.final);
  html += feFilterRowHTML('tp', 0, '3º-4º puesto', kw.tpTeams[0], kw.tpTeams[1], feLocks.tp);

  document.getElementById('predFilterBar').innerHTML = html;

  const statusEl = document.getElementById('predFilterStatus');
  if (feAnyLockActive()) {
    statusEl.innerHTML = `🎯 Viendo un escenario parcial (los partidos que quedan sin marcar siguen pesando por su probabilidad real). <button id="predFilterClear">✕ Quitar filtro</button>`;
    document.getElementById('predFilterClear').addEventListener('click', feClearFilter);
  } else {
    statusEl.innerHTML = `Marca el resultado de un partido para fijarlo, o déjalo en "❓ sin marcar" para que siga pesando por su probabilidad real (Kalshi/Elo).`;
  }
}

function feApplyFilter() {
  feSanitizeLocks();
  PD = feAnyLockActive() ? computeFilteredPD(feLocks) : ORIGINAL_PD;
  renderPredFilterBar();
  renderPredAll();
}

function feClearFilter() {
  feLocks = { octavos: {}, qf: {}, sf: {}, final: null, tp: null };
  PD = ORIGINAL_PD;
  renderPredFilterBar();
  renderPredAll();
}

document.getElementById('predFilterBar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-fkind]');
  if (!btn) return;
  const kind = btn.dataset.fkind;
  const pick = btn.dataset.fpick;
  if (kind === 'final' || kind === 'tp') {
    feLocks[kind] = pick === 'unmark' ? null : Number(pick);
  } else {
    const idx = Number(btn.dataset.fidx);
    if (pick === 'unmark') delete feLocks[kind][idx];
    else feLocks[kind][idx] = Number(pick);
  }
  feApplyFilter();
});

renderPredFilterBar();
