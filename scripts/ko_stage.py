"""
Procesa la fase eliminatoria (dieciseisavos a final) del Mundial 2026.

Lee del Excel:
  - Qué equipo predijo cada jugador para cada "slot" de cada ronda
    (Dieciseisavofinalista-N, Octavofinalista-N, etc.)
  - Los enfrentamientos y resultados reales ya introducidos a mano
    (igual que en fase de grupos: columna 13, formato "1|2-0")

Calcula:
  - Quién ha quedado eliminado en cada ronda real (a partir de los
    resultados introducidos)
  - Para cada jugador y cada ronda, si su predicción para esa ronda
    "sigue viva" (el equipo aún no ha caído) o ya está descartada
  - Puntos: dieciseisavos puntúa signo/diferencia/exacto igual que en
    grupos; de octavos en adelante solo cuenta si el equipo predicho
    para esa ronda llega realmente a jugarla.
"""
import re
import sys
from collections import defaultdict

from bracket_structure import (
    ROUND_OF_32, ROUND_OF_16, QUARTERS, SEMIS, EXCEL_ROWS,
)

# Orden de rondas y cuántos equipos hay en cada una (para los slots
# "Xfinalista-N" del Excel)
ROUND_NAMES = ["dieciseisavos", "octavos", "cuartos", "semis", "final"]
ROUND_LABELS = {
    "dieciseisavos": "Dieciseisavos",
    "octavos": "Octavos de final",
    "cuartos": "Cuartos de final",
    "semis": "Semifinales",
    "final": "Final",
}
SLOTS_PER_ROUND = {
    "dieciseisavos": 32,  # equipos que llegan a dieciseisavos = los 32 clasificados de grupos
    "octavos": 16,
    "cuartos": 8,
    "semis": 4,
    "final": 2,
}
QUALIFIER_ROW_KEYS = {
    "dieciseisavos": "round_of_32_qualifiers",
    "octavos": "round_of_16_qualifiers",
    "cuartos": "quarters_qualifiers",
    "semis": "semis_qualifiers",
    "final": "final_qualifiers",
}
MATCH_ROW_KEYS = {
    "dieciseisavos": "round_of_32_matches",
    "octavos": "round_of_16_matches",
    "cuartos": "quarters_matches",
    "semis": "semis_matches",
}
MATCH_LISTS = {
    "dieciseisavos": ROUND_OF_32,
    "octavos": ROUND_OF_16,
    "cuartos": QUARTERS,
    "semis": SEMIS,
}


def sign_from_score(h, a):
    return "1" if h > a else ("X" if h == a else "2")


# Puntos por ronda según el Excel (columna 4 de las reglas) — actualizado 01/07/2026
KO_ROUND_POINTS = {
    "dieciseisavos": {"sign": 4, "diff": 4, "exact": 8},
    "octavos":       {"sign": 0, "diff": 0, "exact": 0},  # solo cuenta equipo clasificado
    "cuartos":       {"sign": 0, "diff": 0, "exact": 0},
    "semis":         {"sign": 0, "diff": 0, "exact": 0},
    "final":         {"sign": 0, "diff": 0, "exact": 0},
}
KO_QUALIFIER_POINTS = {
    "octavos":       6,   # equipo clasificado para octavos
    "cuartos":       12,  # equipo clasificado para cuartos
    "semis":         24,  # equipo clasificado para semis
    "tercer_puesto": 24,  # equipo clasificado para 3º/4º puesto
    "final":         48,  # equipo clasificado para la final
}

# Calendario oficial FIFA por número de partido (fijo, independiente de qué
# equipos jueguen cada cruce). Fuente: calendario oficial Mundial 2026.
KO_MATCH_DATES = {
    73: "2026-06-28",
    74: "2026-06-29", 75: "2026-06-29", 76: "2026-06-29",
    77: "2026-06-30", 78: "2026-06-30", 79: "2026-06-30",
    80: "2026-07-01", 81: "2026-07-01", 82: "2026-07-01",
    83: "2026-07-02", 84: "2026-07-02", 85: "2026-07-02",
    86: "2026-07-03", 87: "2026-07-03", 88: "2026-07-03",
    89: "2026-07-04", 90: "2026-07-04",
    91: "2026-07-05", 92: "2026-07-05",
    93: "2026-07-06", 94: "2026-07-06",
    95: "2026-07-07", 96: "2026-07-07",
    97: "2026-07-09",
    98: "2026-07-10",
    99: "2026-07-11", 100: "2026-07-11",
    101: "2026-07-14",
    102: "2026-07-15",
}
KO_SPECIAL_DATES = {"tercer_puesto": "2026-07-18", "final": "2026-07-19"}

def score_match(pred_str, actual_str, round_name="dieciseisavos"):
    """Puntúa un partido según la ronda. En 1/16: signo 2pts, diferencia 2pts, exacto 4pts."""
    if not pred_str or not actual_str:
        return {"pts": 0, "sign": False, "diff": False, "exact": False}
    try:
        psign, pscore = pred_str.split("|")
        ph, pa = map(int, pscore.split("-"))
        asign, ascore = actual_str.split("|")
        ah, aa = map(int, ascore.split("-"))
    except (ValueError, AttributeError):
        return {"pts": 0, "sign": False, "diff": False, "exact": False}
    rpts = KO_ROUND_POINTS.get(round_name, {"sign": 2, "diff": 2, "exact": 4})
    pts = 0
    sign_ok = psign == asign
    diff_ok = exact_ok = False
    if sign_ok:
        pts += rpts["sign"]
        if abs(ph - pa) == abs(ah - aa):
            diff_ok = True
            pts += rpts["diff"]
        if ph == ah and pa == aa:
            exact_ok = True
            pts += rpts["exact"]
    return {"pts": pts, "sign": sign_ok, "diff": diff_ok, "exact": exact_ok}


def build_group_ref_resolver(group_standings_real, third_place_ranking=None):
    """Devuelve una función resolve_ref(ref) que convierte '1A'/'2A' en el
    nombre real del equipo, usando solo datos de fase de grupos. Los refs
    '3XXXX' (mejor tercero) NO se resuelven aquí — ver resolve_r32_all,
    porque necesitan tratarse todos juntos para no duplicar equipos."""
    group_slot_team = {}
    for g, rows in (group_standings_real or {}).items():
        for r in rows:
            if r.get("position") in (1, 2):
                group_slot_team[f"{r['position']}{g}"] = r["team"]

    def resolve_ref(ref):
        return group_slot_team.get(ref)

    return resolve_ref


def resolve_r32_all(match_defs, resolve_group_ref, third_place_ranking, team_ko_opponent):
    """Resuelve los dos equipos de CADA cruce de dieciseisavos a la vez, en
    vez de uno a uno, para poder garantizar que un mismo 'mejor tercero'
    nunca queda asignado a dos partidos distintos. Prioridad:
      1) el rival que la API ya tiene fijado para el lado conocido del
         cruce (fuente oficial real, sin ambigüedad posible)
      2) si la API todavía no lo tiene: heurística de respaldo que nunca
         reutiliza un equipo ya asignado a otro cruce en este mismo
         cálculo — no garantiza igualar la tabla oficial de 495
         combinaciones (Anexo C), pero nunca duplica un equipo
    Devuelve (resolution, source) donde resolution es
    {num_partido: (home_team, away_team)} y source es
    {num_partido: 'directo'|'api'|'respaldo'|'sin_resolver'} para poder
    diagnosticar de dónde salió cada cruce."""
    third_by_group = {t["group"]: t for t in (third_place_ranking or [])}
    resolution = {}
    source = {}
    used_teams = set()
    pending = []  # (num, known_team, known_is_home, third_ref)

    for match_def in match_defs:
        home_ref, away_ref = match_def["home"], match_def["away"]
        home_is_third = bool(re.match(r"^3[A-L]+$", home_ref))
        away_is_third = bool(re.match(r"^3[A-L]+$", away_ref))
        if not home_is_third and not away_is_third:
            home = resolve_group_ref(home_ref)
            away = resolve_group_ref(away_ref)
            resolution[match_def["num"]] = (home, away)
            source[match_def["num"]] = "directo"
            if home:
                used_teams.add(home)
            if away:
                used_teams.add(away)
            continue
        if home_is_third and away_is_third:
            # No ocurre en el bracket real de 2026, pero por seguridad no
            # intentamos adivinar dos lados inciertos a la vez.
            resolution[match_def["num"]] = (None, None)
            source[match_def["num"]] = "sin_resolver"
            continue
        third_ref, known_ref, known_is_home = (
            (home_ref, away_ref, False) if home_is_third else (away_ref, home_ref, True)
        )
        known_team = resolve_group_ref(known_ref)
        if known_team:
            used_teams.add(known_team)
        opponent = (team_ko_opponent or {}).get(known_team) if known_team else None
        if opponent and opponent in used_teams:
            # El rival que da la API para este equipo ya está asignado a
            # otro cruce en este mismo cálculo (p.ej. porque conflate el
            # rival de octavos con el de dieciseisavos) — no nos fiamos y
            # lo tratamos como si la API no lo tuviera todavía.
            opponent = None
        if opponent:
            used_teams.add(opponent)
            resolution[match_def["num"]] = (known_team, opponent) if known_is_home else (opponent, known_team)
            source[match_def["num"]] = "api"
        else:
            pending.append((match_def["num"], known_team, known_is_home, third_ref))

    # Respaldo sin API: recorre las letras candidatas de cada ref '3XXX' y
    # coge el primer tercero clasificado que NO se haya usado ya en otro
    # cruce de este mismo cálculo (evita duplicar, aunque puede no
    # coincidir con la tabla oficial exacta si no hay API disponible).
    for num, known_team, known_is_home, third_ref in pending:
        m = re.match(r"^3([A-L]+)$", third_ref)
        opponent = None
        if m:
            for g in m.group(1):
                t = third_by_group.get(g)
                if t and t.get("advances") and t["team"] not in used_teams:
                    opponent = t["team"]
                    break
        if opponent:
            used_teams.add(opponent)
        resolution[num] = (known_team, opponent) if known_is_home else (opponent, known_team)
        source[num] = "respaldo" if opponent else "sin_resolver"

    return resolution, source


REF_TOKEN_RE = re.compile(r"\b([WL]\d+)\b")


def locate_ko_rows_by_ref(ws, match_rows, match_defs):
    """Ubica la fila real de cada partido de octavos/cuartos/semis
    buscando los tokens W##/L## (p.ej. 'W74-W77') en la columna 11, en
    vez de asumir que las filas están en el mismo orden que los números
    de partido oficiales — no siempre es así en este Excel (comprobado:
    ocurre en octavos, partidos 89/90)."""
    row_tokens = {}
    for r in match_rows:
        cell_val = ws.cell(row=r, column=11).value
        row_tokens[r] = set(REF_TOKEN_RE.findall(str(cell_val))) if cell_val else set()

    resolved_map = {}
    used_rows = set()
    # Primera pasada: filas cuyo texto todavía tiene los DOS refs sin
    # resolver a nombre de equipo (caso normal, coincidencia exacta).
    for match_def in match_defs:
        want = {match_def["home"], match_def["away"]}
        for r in match_rows:
            if r in used_rows or r not in row_tokens:
                continue
            if row_tokens[r] == want:
                resolved_map[match_def["num"]] = r
                used_rows.add(r)
                break
    # Segunda pasada: si un lado ya se resolvió a nombre de equipo, solo
    # queda un token en la fila — sigue siendo identificable de forma
    # única porque cada W##/L## solo aparece en un partido de la ronda.
    for match_def in match_defs:
        if match_def["num"] in resolved_map:
            continue
        want = {match_def["home"], match_def["away"]}
        for r in match_rows:
            if r in used_rows or r not in row_tokens:
                continue
            found = row_tokens[r]
            if found and found.issubset(want):
                resolved_map[match_def["num"]] = r
                used_rows.add(r)
                break
    return resolved_map


def read_ko_predictions(ws, player_columns, group_standings_real=None, third_place_ranking=None,
                         team_ko_opponent=None):
    """Lee, para cada ronda, la lista de equipos que predijo cada jugador
    (uno por slot) y los enfrentamientos con su resultado real si lo hay."""
    rounds_data = {}
    resolve_group_ref = build_group_ref_resolver(group_standings_real, third_place_ranking)

    for round_name in ROUND_NAMES:
        qualifier_rows = EXCEL_ROWS[QUALIFIER_ROW_KEYS[round_name]]
        qualifiers = []  # lista de {slot_index, predictions: {player: team}}
        for i, row_idx in enumerate(qualifier_rows):
            preds = {}
            for player, col in player_columns.items():
                val = ws.cell(row=row_idx, column=col).value
                preds[player] = str(val).strip() if val and isinstance(val, str) and val.strip() else None
            qualifiers.append({"slot": i + 1, "predictions": preds})
        rounds_data[round_name] = {"qualifiers": qualifiers}

        if round_name in MATCH_ROW_KEYS:
            match_rows = EXCEL_ROWS[MATCH_ROW_KEYS[round_name]]
            match_defs = MATCH_LISTS[round_name]

            # El Excel NO lista las filas de dieciseisavos en el mismo orden
            # que los números de partido oficiales (73→88) — el orden real
            # varía. Ubicamos la fila real de cada cruce por su texto exacto
            # en la columna 11 ("Home-Away"), en vez de asumir una posición
            # fija.
            row_for_num = dict(zip((md["num"] for md in match_defs), match_rows))
            if round_name == "dieciseisavos":
                r32_teams, _r32_source = resolve_r32_all(match_defs, resolve_group_ref, third_place_ranking, team_ko_opponent)
                resolved_map = {}
                used_rows = set()
                for match_def in match_defs:
                    home, away = r32_teams.get(match_def["num"], (None, None))
                    if not home or not away:
                        continue
                    target = f"{home}-{away}"
                    for r in match_rows:
                        if r in used_rows:
                            continue
                        cell_val = ws.cell(row=r, column=11).value
                        if cell_val and str(cell_val).strip() == target:
                            resolved_map[match_def["num"]] = r
                            used_rows.add(r)
                            break
                if resolved_map:
                    row_for_num.update(resolved_map)
                if len(resolved_map) < len(match_defs):
                    print(
                        f"AVISO: solo se pudieron ubicar {len(resolved_map)}/{len(match_defs)} filas de "
                        "dieciseisavos por texto (columna 11) — normalmente porque el ranking de mejores "
                        "terceros necesita la API oficial y aquí no está disponible. Los cruces con 'mejor "
                        "tercero' usan el orden posicional de respaldo hasta que haya API.",
                        file=sys.stderr,
                    )
            else:
                resolved_map = locate_ko_rows_by_ref(ws, match_rows, match_defs)
                if resolved_map:
                    row_for_num.update(resolved_map)
                if len(resolved_map) < len(match_defs):
                    print(
                        f"AVISO: solo se pudieron ubicar {len(resolved_map)}/{len(match_defs)} filas de "
                        f"{round_name} por sus referencias W##/L## (columna 11). Se usa el orden posicional "
                        "de respaldo para el resto.",
                        file=sys.stderr,
                    )

            matches = []
            for match_def in match_defs:
                row_idx = row_for_num[match_def["num"]]
                # El resultado real en dieciseisavos vive en columna 13
                # ("goles-goles"). La columna 12 en teoría trae el signo
                # (1/X/2), pero en la práctica algunas versiones del Excel
                # usan '0' para empate en vez de 'X' (columna de fórmula,
                # no de texto) — así que en vez de fiarnos de esa columna,
                # calculamos el signo nosotros mismos a partir del propio
                # marcador, que es la fuente fiable.
                excel_actual = None
                col12 = ws.cell(row=row_idx, column=12).value
                col13 = ws.cell(row=row_idx, column=13).value
                col13s = str(col13).strip() if col13 is not None else ""
                if col13s and col13s != "-" and "-" in col13s:
                    try:
                        gh_str, ga_str = col13s.split("-")
                        gh, ga = int(gh_str.strip()), int(ga_str.strip())
                        excel_actual = f"{sign_from_score(gh, ga)}|{col13s}"
                    except (ValueError, TypeError):
                        excel_actual = None
                if excel_actual is None:
                    col12s = str(col12).strip() if col12 is not None else ""
                    if col13s and "|" in col13s:
                        # fallback: formato completo en col13 (grupos o manual)
                        excel_actual = col13s
                preds = {}
                for player, col in player_columns.items():
                    val = ws.cell(row=row_idx, column=col).value
                    if val and "|" in str(val):
                        s = str(val).strip()
                        # Format may be "TeamA-TeamB·sign|goals-goals" — extract after '·'
                        if '·' in s:
                            s = s.split('·')[1]
                        preds[player] = s
                    else:
                        preds[player] = None
                matches.append({
                    "num": match_def["num"],
                    "home_ref": match_def["home"],
                    "away_ref": match_def["away"],
                    "excel_actual": excel_actual,
                    "predictions": preds,
                })
            rounds_data[round_name]["matches"] = matches

    # 3º-4º puesto y final (estructura especial, fuera del bucle genérico)
    third_qual_rows = EXCEL_ROWS["third_place_qualifiers"]
    third_qualifiers = []
    for i, row_idx in enumerate(third_qual_rows):
        preds = {}
        for player, col in player_columns.items():
            val = ws.cell(row=row_idx, column=col).value
            preds[player] = str(val).strip() if val and isinstance(val, str) and val.strip() else None
        third_qualifiers.append({"slot": i + 1, "predictions": preds})
    rounds_data["tercer_puesto"] = {"qualifiers": third_qualifiers}

    third_row = EXCEL_ROWS["third_place_match"]
    excel_actual = ws.cell(row=third_row, column=13).value
    excel_actual = str(excel_actual).strip() if excel_actual and "|" in str(excel_actual) else None
    preds = {}
    for player, col in player_columns.items():
        val = ws.cell(row=third_row, column=col).value
        preds[player] = str(val).strip() if val and "|" in str(val) else None
    rounds_data["tercer_puesto"]["matches"] = [{
        "num": None, "home_ref": "L101", "away_ref": "L102",
        "excel_actual": excel_actual, "predictions": preds,
    }]

    final_row = EXCEL_ROWS["final_match"]
    excel_actual = ws.cell(row=final_row, column=13).value
    excel_actual = str(excel_actual).strip() if excel_actual and "|" in str(excel_actual) else None
    preds = {}
    for player, col in player_columns.items():
        val = ws.cell(row=final_row, column=col).value
        preds[player] = str(val).strip() if val and "|" in str(val) else None
    rounds_data["final"]["matches"] = [{
        "num": None, "home_ref": "W101", "away_ref": "W102",
        "excel_actual": excel_actual, "predictions": preds,
    }]

    return rounds_data


def resolve_ko_result(excel_actual, home, away, api_results, openfootball_results, penalty_winners=None):
    """El marcador que puntúa predicciones es el de 120' (90' + prórroga),
    NO el resultado final tras penaltis. En fase KO la API manda primero
    (ya viene con la prórroga incluida en 'fullTime', ver
    fetch_real_results) — el Excel solo rellena si ninguna fuente
    automática tiene el partido todavía. EXCEPCIÓN: si el partido se
    decidió por penaltis, ninguna fuente automática (ni football-data.org
    ni openfootball) da un marcador de 120' fiable en esta competición,
    así que en ese caso se usa directamente el Excel."""
    if not home or not away:
        return excel_actual
    went_to_penalties = (penalty_winners or {}).get((home, away)) is not None
    if went_to_penalties:
        return excel_actual
    fd_res = (api_results or {}).get((home, away))
    of_res = (openfootball_results or {}).get((home, away))
    api_actual = None
    if fd_res and of_res:
        # A diferencia de fase de grupos (donde ante conflicto se prefiere
        # openfootball porque football-data.org puede dar marcadores
        # provisionales justo tras el pitido), en KO preferimos
        # football-data.org: ya incluye los goles de la prórroga (ver
        # fetch_real_results) y se actualiza mucho más rápido que
        # openfootball, que en partidos con prórroga puede quedarse con
        # el marcador de 90' varias horas.
        hg, ag = fd_res
        api_actual = f"{sign_from_score(hg, ag)}|{hg}-{ag}"
    elif fd_res:
        hg, ag = fd_res
        api_actual = f"{sign_from_score(hg, ag)}|{hg}-{ag}"
    elif of_res:
        hg, ag = of_res
        api_actual = f"{sign_from_score(hg, ag)}|{hg}-{ag}"

    if api_actual:
        if excel_actual and excel_actual != api_actual:
            print(
                f"AVISO: KO {home}-{away}: Excel dice '{excel_actual}' pero la API (a 120') dice "
                f"'{api_actual}' — se usa la API. Si el Excel es el correcto, revísalo.",
                file=sys.stderr,
            )
        return api_actual
    return excel_actual


def build_ko_dataset(ws, player_columns, group_standings_real, third_place_ranking, group_positions,
                      api_results=None, openfootball_results=None, team_ko_opponent=None,
                      penalty_winners=None, penalty_scores=None):
    """Construye el dataset completo de la fase eliminatoria, listo para
    volcar a data.js. Si no hay datos en el Excel todavía (fase de grupos
    sin terminar), devuelve la estructura vacía mostrando solo los
    cruces teóricos, sin resultados ni predicciones resueltas."""
    players = list(player_columns.keys())
    raw = read_ko_predictions(ws, player_columns, group_standings_real, third_place_ranking, team_ko_opponent)

    # --- Paso 1: ¿qué equipo real ocupa cada referencia de grupo? ---
    # ('1A' -> equipo 1º del grupo A, '3CDFGH' -> el mejor tercero entre
    # esos grupos si está entre los 8 que clasifican, etc.)
    resolve_ref = build_group_ref_resolver(group_standings_real, third_place_ranking)

    # --- Paso 2: resolver resultados reales ronda a ronda, propagando
    # ganadores hacia la siguiente ronda (W<num> / L<num>) ---
    winners = {}  # num_partido -> equipo ganador (nombre real)
    losers = {}   # num_partido -> equipo perdedor

    def resolve_w_l_ref(ref):
        m = re.match(r"^([WL])(\w+)$", ref)
        if not m:
            return None
        kind, key = m.group(1), m.group(2)
        table = winners if kind == "W" else losers
        return table.get(key)

    def resolve_any_ref(ref):
        return resolve_ref(ref) or resolve_w_l_ref(ref)

    resolve_any_ref_r32, r32_source = resolve_r32_all(ROUND_OF_32, resolve_ref, third_place_ranking, team_ko_opponent)

    rounds_output = {}
    eliminated_teams = set()  # equipos ya fuera del torneo, en cualquier ronda jugada
    team_advance_date = {}  # equipo -> fecha en la que aseguró su plaza en la ronda siguiente

    for round_name in ["dieciseisavos", "octavos", "cuartos", "semis"]:
        match_defs = raw[round_name].get("matches", [])
        round_matches = []
        for m in match_defs:
            if round_name == "dieciseisavos":
                home_team, away_team = resolve_any_ref_r32.get(m["num"], (None, None))
            else:
                home_team = resolve_any_ref(m["home_ref"])
                away_team = resolve_any_ref(m["away_ref"])
            actual = resolve_ko_result(m["excel_actual"], home_team, away_team, api_results, openfootball_results, penalty_winners)
            match_date = KO_MATCH_DATES.get(m["num"])

            breakdown = None
            if actual:
                breakdown = {p: score_match(m["predictions"].get(p), actual, round_name) for p in players}

            if actual and home_team and away_team:
                asign, ascore = actual.split("|")
                ah, ag = map(int, ascore.split("-"))
                pen_winner = None
                if ah == ag:
                    pen_winner = (penalty_winners or {}).get((home_team, away_team))
                if ah > ag or pen_winner == home_team:
                    winners[str(m["num"])] = home_team
                    losers[str(m["num"])] = away_team
                    eliminated_teams.add(away_team)
                elif ag > ah or pen_winner == away_team:
                    winners[str(m["num"])] = away_team
                    losers[str(m["num"])] = home_team
                    eliminated_teams.add(home_team)
                # Si el marcador quedó en empate y todavía no hay dato de
                # quién ganó por penaltis (ni de la API ni del Excel), no
                # resolvemos ganador — mejor no decidir a ciegas.
                if match_date:
                    winner_team = winners.get(str(m["num"]))
                    loser_team = losers.get(str(m["num"]))
                    if winner_team:
                        team_advance_date[winner_team] = match_date
                    if round_name == "semis" and loser_team:
                        team_advance_date[loser_team] = match_date  # va a 3º/4º puesto

            penalties = None
            if actual and home_team and away_team:
                asign, ascore = actual.split("|")
                ah, ag = map(int, ascore.split("-"))
                if ah == ag:
                    penalties = (penalty_scores or {}).get((home_team, away_team))

            round_matches.append({
                "num": m["num"],
                "home_ref": m["home_ref"],
                "away_ref": m["away_ref"],
                "home_team": home_team,
                "away_team": away_team,
                "actual": actual,
                "penalties": penalties,
                "date": match_date,
                "breakdown": breakdown,
                "predictions": m["predictions"],
            })
        rounds_output[round_name] = {"matches": round_matches}

    # 3º-4º puesto y Final
    for key, special_key in [("tercer_puesto", "34"), ("final", "F")]:
        m = raw[key]["matches"][0]
        home_team = resolve_any_ref(m["home_ref"])
        away_team = resolve_any_ref(m["away_ref"])
        actual = resolve_ko_result(m["excel_actual"], home_team, away_team, api_results, openfootball_results, penalty_winners)
        if actual and home_team and away_team:
            asign, ascore = actual.split("|")
            ah, ag = map(int, ascore.split("-"))
            pen_winner = None
            if ah == ag:
                pen_winner = (penalty_winners or {}).get((home_team, away_team))
            if ah > ag or pen_winner == home_team:
                eliminated_teams.add(away_team)
                winners[special_key] = home_team
                losers[special_key] = away_team
            elif ag > ah or pen_winner == away_team:
                eliminated_teams.add(home_team)
                winners[special_key] = away_team
                losers[special_key] = home_team
        special_penalties = None
        if actual and home_team and away_team:
            asign_chk, ascore_chk = actual.split("|")
            ah_chk, ag_chk = map(int, ascore_chk.split("-"))
            if ah_chk == ag_chk:
                special_penalties = (penalty_scores or {}).get((home_team, away_team))
        rounds_output[key] = {"matches": [{
            "num": m["num"], "home_ref": m["home_ref"], "away_ref": m["away_ref"],
            "home_team": home_team, "away_team": away_team,
            "actual": actual, "penalties": special_penalties, "date": KO_SPECIAL_DATES.get(key),
            "breakdown": None, "predictions": m["predictions"],
        }]}

    # --- Paso 3: para cada ronda y cada jugador, ¿qué equipo predijo en
    # cada "slot" de clasificados, y sigue vivo ese equipo?
    # También calculamos puntos por equipo clasificado correctamente. ---

    # Equipos que realmente pasaron a cada ronda (ganadores de la ronda anterior)
    # dieciseisavos -> octavos: los 16 ganadores de 1/16
    # octavos -> cuartos: los 8 ganadores de octavos, etc.
    teams_in_round = {
        "dieciseisavos": set(),   # los 32 clasificados de grupos (no puntuamos aquí, ya está en qualified_points)
        "octavos": set(winners.get(str(m["num"]), None) for m in raw["dieciseisavos"].get("matches", []) if winners.get(str(m["num"]))),
        "cuartos": set(winners.get(str(m["num"]), None) for m in raw["octavos"].get("matches", []) if winners.get(str(m["num"]))),
        "semis": set(winners.get(str(m["num"]), None) for m in raw["cuartos"].get("matches", []) if winners.get(str(m["num"]))),
        "final": set(winners.get(str(m["num"]), None) for m in raw["semis"].get("matches", []) if winners.get(str(m["num"]))),
        "tercer_puesto": set(losers.get(str(m["num"]), None) for m in raw["semis"].get("matches", []) if losers.get(str(m["num"]))),
    }
    # Remove None values
    for k in teams_in_round:
        teams_in_round[k].discard(None)

    qualifiers_output = {}
    qualifier_pts = {p: 0 for p in players}  # puntos totales por equipos clasificados
    qualifier_pts_by_round = {r: {p: 0 for p in players} for r in ROUND_NAMES + ["tercer_puesto"]}

    for round_name in ROUND_NAMES + ["tercer_puesto"]:
        slots = raw[round_name]["qualifiers"]
        real_teams = teams_in_round.get(round_name, set())
        q_pts = KO_QUALIFIER_POINTS.get(round_name, 0)
        slot_rows = []
        for slot in slots:
            row = {"slot": slot["slot"], "predictions": {}}
            for p in players:
                team = slot["predictions"].get(p)
                if not team:
                    row["predictions"][p] = {"team": None, "status": "sin_apuesta", "pts": 0}
                    continue
                if team in eliminated_teams:
                    status = "eliminado"
                    pts = 0
                elif real_teams and team in real_teams:
                    status = "clasificado"
                    pts = q_pts
                    qualifier_pts[p] += q_pts
                    qualifier_pts_by_round[round_name][p] += q_pts
                else:
                    status = "vivo"
                    pts = 0
                row["predictions"][p] = {
                    "team": team, "status": status, "pts": pts,
                    "date": team_advance_date.get(team) if status == "clasificado" else None,
                }
            slot_rows.append(row)
        qualifiers_output[round_name] = slot_rows

    # Cuadro de honor: campeón (ganador de la final), subcampeón (perdedor
    # de la final) y 3er puesto (ganador del partido por el tercer puesto).
    # Se resuelve igual que cualquier otra referencia de bracket (WF/LF/W34),
    # no dependemos de que alguien lo escriba a mano en otra celda.
    honor = {
        "champion": winners.get("F"),
        "runner_up": losers.get("F"),
        "third_place": winners.get("34"),
    }

    return {
        "rounds": rounds_output,
        "qualifiers": qualifiers_output,
        "honor": honor,
        "eliminated_teams": sorted(eliminated_teams),
        "winners_by_match": dict(winners),
        "losers_by_match": dict(losers),
        "qualifier_pts": qualifier_pts,
        "qualifier_pts_by_round": qualifier_pts_by_round,
        "debug": {
            "team_ko_opponent": sorted((team_ko_opponent or {}).items()),
            "penalty_winners": sorted(f"{h}-{a}: gana {w}" for (h, a), w in (penalty_winners or {}).items()),
            "dieciseisavos_fuente_cruce": {str(num): src for num, src in sorted(r32_source.items())},
        },
    }
