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


# Puntos por ronda según el Excel (columna 4 de las reglas)
KO_ROUND_POINTS = {
    "dieciseisavos": {"sign": 2, "diff": 2, "exact": 4},
    "octavos":       {"sign": 0, "diff": 0, "exact": 0},  # solo cuenta equipo clasificado
    "cuartos":       {"sign": 0, "diff": 0, "exact": 0},
    "semis":         {"sign": 0, "diff": 0, "exact": 0},
    "final":         {"sign": 0, "diff": 0, "exact": 0},
}
KO_QUALIFIER_POINTS = {
    "octavos":       3,   # equipo clasificado para octavos
    "cuartos":       6,   # equipo clasificado para cuartos
    "semis":         12,  # equipo clasificado para semis
    "tercer_puesto": 12,  # equipo clasificado para 3º/4º
    "final":         12,  # equipo clasificado para final (mismo que semis)
}

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


def read_ko_predictions(ws, player_columns):
    """Lee, para cada ronda, la lista de equipos que predijo cada jugador
    (uno por slot) y los enfrentamientos con su resultado real si lo hay."""
    rounds_data = {}

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
            matches = []
            for match_def, row_idx in zip(match_defs, match_rows):
                # El resultado real en dieciseisavos usa columna 12 (signo: 1/X/2)
                # y columna 13 (marcador: "goles-goles"), a diferencia de grupos
                # que usa col 13 con formato completo "signo|goles-goles".
                excel_actual = None
                col12 = ws.cell(row=row_idx, column=12).value
                col13 = ws.cell(row=row_idx, column=13).value
                col12s = str(col12).strip() if col12 is not None else ""
                col13s = str(col13).strip() if col13 is not None else ""
                if col12s in ("1", "X", "2") and "-" in col13s and col13s != "-":
                    excel_actual = f"{col12s}|{col13s}"
                elif col13s and "|" in col13s:
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


def build_ko_dataset(ws, player_columns, group_standings_real, third_place_ranking, group_positions):
    """Construye el dataset completo de la fase eliminatoria, listo para
    volcar a data.js. Si no hay datos en el Excel todavía (fase de grupos
    sin terminar), devuelve la estructura vacía mostrando solo los
    cruces teóricos, sin resultados ni predicciones resueltas."""
    players = list(player_columns.keys())
    raw = read_ko_predictions(ws, player_columns)

    # --- Paso 1: ¿qué equipo real ocupa cada referencia de grupo? ---
    # ('1A' -> equipo 1º del grupo A, '3CDFGH' -> el mejor tercero entre
    # esos grupos si está entre los 8 que clasifican, etc.)
    group_slot_team = {}
    for g, rows in (group_standings_real or {}).items():
        for r in rows:
            if r.get("position") in (1, 2):
                group_slot_team[f"{r['position']}{g}"] = r["team"]

    third_by_group = {t["group"]: t for t in (third_place_ranking or [])}

    def resolve_ref(ref):
        """Convierte una referencia tipo '2A', '3CDFGH' o 'W73' en el
        nombre del equipo real, si ya se conoce; si no, devuelve None."""
        if ref in group_slot_team:
            return group_slot_team[ref]
        m = re.match(r"^3([A-L]+)$", ref)
        if m:
            candidate_groups = list(m.group(1))
            for g in candidate_groups:
                t = third_by_group.get(g)
                if t and t.get("advances") and t["group"] in candidate_groups:
                    return t["team"]
            return None
        # 'W73' / 'L101' se resuelven más adelante, una vez sabemos el
        # resultado de esos partidos concretos (se hace en el paso 2).
        return None

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

    rounds_output = {}
    eliminated_teams = set()  # equipos ya fuera del torneo, en cualquier ronda jugada

    for round_name in ["dieciseisavos", "octavos", "cuartos", "semis"]:
        match_defs = raw[round_name].get("matches", [])
        round_matches = []
        for m in match_defs:
            home_team = resolve_any_ref(m["home_ref"])
            away_team = resolve_any_ref(m["away_ref"])
            actual = m["excel_actual"]

            breakdown = None
            if actual:
                breakdown = {p: score_match(m["predictions"].get(p), actual, round_name) for p in players}

            if actual and home_team and away_team:
                asign, ascore = actual.split("|")
                ah, ag = map(int, ascore.split("-"))
                if ah > ag:
                    winners[str(m["num"])] = home_team
                    losers[str(m["num"])] = away_team
                    eliminated_teams.add(away_team)
                elif ag > ah:
                    winners[str(m["num"])] = away_team
                    losers[str(m["num"])] = home_team
                    eliminated_teams.add(home_team)
                # En un Mundial KO no hay empate final (hay penaltis), pero
                # si el Excel registrara 'X' por penaltis sin decidir aún,
                # no resolvemos el ganador.

            round_matches.append({
                "num": m["num"],
                "home_ref": m["home_ref"],
                "away_ref": m["away_ref"],
                "home_team": home_team,
                "away_team": away_team,
                "actual": actual,
                "breakdown": breakdown,
                "predictions": m["predictions"],
            })
        rounds_output[round_name] = {"matches": round_matches}

    # 3º-4º puesto y Final
    for key, special_key in [("tercer_puesto", "34"), ("final", "F")]:
        m = raw[key]["matches"][0]
        home_team = resolve_any_ref(m["home_ref"])
        away_team = resolve_any_ref(m["away_ref"])
        actual = m["excel_actual"]
        if actual and home_team and away_team:
            asign, ascore = actual.split("|")
            ah, ag = map(int, ascore.split("-"))
            if ah > ag:
                eliminated_teams.add(away_team)
                winners[special_key] = home_team
                losers[special_key] = away_team
            elif ag > ah:
                eliminated_teams.add(home_team)
                winners[special_key] = away_team
                losers[special_key] = home_team
        rounds_output[key] = {"matches": [{
            "num": m["num"], "home_ref": m["home_ref"], "away_ref": m["away_ref"],
            "home_team": home_team, "away_team": away_team,
            "actual": actual, "breakdown": None, "predictions": m["predictions"],
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
                else:
                    status = "vivo"
                    pts = 0
                row["predictions"][p] = {"team": team, "status": status, "pts": pts}
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
    }
