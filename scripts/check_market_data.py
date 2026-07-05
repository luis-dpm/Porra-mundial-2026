#!/usr/bin/env python3
"""Checklist de qué cuotas de mercado hay que refrescar a mano en
update_predictions.py, según cómo va data.js (que ya se actualiza solo cada
2h con los resultados reales).

No modifica nada ni consulta internet -- solo compara el estado de data.js
contra lo que ya hay hardcodeado en OCTAVOS_ODDS / KNOWN_MATCHUPS y avisa de:
  - Partidos de octavos sin jugar a los que les falta cuota (haría que
    update_predictions.py reventara con KeyError).
  - Octavos ya jugados cuya cuota sigue en OCTAVOS_ODDS (limpieza, no
    urgente: el código ya la ignora una vez resuelto el partido).
  - Cruces de cuartos/semis/final que ya son reales (los dos equipos
    conocidos) pero no tienen entrada en KNOWN_MATCHUPS -- sin esto,
    hybrid_prob() cae al Elo en vez de usar la cuota real del mercado.

Uso: python3 scripts/check_market_data.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import update_predictions as UP


def check_round(label, matches, prev_winners, winners_by_match, problems, notes):
    """prev_winners: {num_partido_ronda_anterior: equipo_ganador}.
    Devuelve {num_partido_esta_ronda: equipo_ganador} para encadenar con la
    siguiente ronda."""
    this_round_winners = {}
    for m in matches:
        num = m.get("num")
        ref_a, ref_b = UP.ref_num(m["home_ref"]), UP.ref_num(m["away_ref"])
        team_a, team_b = prev_winners.get(ref_a), prev_winners.get(ref_b)
        if num is not None and m.get("actual"):
            this_round_winners[num] = winners_by_match[str(num)]

        if team_a and team_b:
            key = frozenset({team_a, team_b})
            tag = f" (partido {num})" if num else ""
            if key not in UP.KNOWN_MATCHUPS:
                problems.append(
                    f"{label}{tag}: {team_a} vs {team_b} ya es un cruce real sin cuota en "
                    f"KNOWN_MATCHUPS -- de momento usa Elo en su lugar."
                )
            else:
                notes.append(f"{label}{tag}: {team_a} vs {team_b} ya tiene cuota en KNOWN_MATCHUPS.")
        elif team_a or team_b:
            notes.append(f"{label}{(' partido ' + str(num)) if num else ''}: un lado ya resuelto "
                         f"({team_a or team_b}), esperando al otro.")
    return this_round_winners


def main():
    porra = UP.load_porra_data()
    ko = porra["ko_stage"]["rounds"]
    winners_by_match = porra["ko_stage"]["winners_by_match"]
    problems, notes = [], []

    # ---- octavos: cuotas que faltan o que ya se pueden borrar ----
    octavos_winners = {}
    for m in ko["octavos"]["matches"]:
        num = m["num"]
        if m.get("actual"):
            octavos_winners[num] = winners_by_match[str(num)]
            if num in UP.OCTAVOS_ODDS:
                notes.append(f"Octavos partido {num} ({m['home_team']}-{m['away_team']}) ya se jugó "
                             f"-- puedes borrar su entrada de OCTAVOS_ODDS.")
        else:
            if num not in UP.OCTAVOS_ODDS:
                problems.append(f"Falta cuota Kalshi para octavos {m['home_team']}-{m['away_team']} "
                                 f"(partido {num}) en OCTAVOS_ODDS -- update_predictions.py reventará.")

    # ---- cuartos / semis / final / 3º-4º puesto: cruces que ya son reales ----
    cuartos_winners = check_round("Cuartos", ko["cuartos"]["matches"], octavos_winners, winners_by_match, problems, notes)
    semis_winners = check_round("Semifinal", ko["semis"]["matches"], cuartos_winners, winners_by_match, problems, notes)
    check_round("Final", ko["final"]["matches"], semis_winners, winners_by_match, problems, notes)
    check_round("3º-4º puesto", ko["tercer_puesto"]["matches"], semis_winners, winners_by_match, problems, notes)

    # ---- recordatorios sin comprobación automática posible ----
    notes.append("Elo (eloratings.net/2026_World_Cup): sin forma de comprobar si está desactualizado "
                 "-- conviene refrescarlo a mano tras cada ronda jugada.")
    notes.append("Bota/Balón de Oro (Polymarket): igual, refrescar a mano tras cada ronda jugada.")

    print(f"data.js actualizado a: {porra.get('last_updated')}\n")
    print("=== Hay que actuar ===")
    if problems:
        for p in problems:
            print(" ⚠", p)
    else:
        print(" (nada urgente)")
    print("\n=== Notas / limpieza opcional ===")
    for n in notes:
        print(" -", n)

    if problems:
        sys.exit(1)


if __name__ == "__main__":
    main()
