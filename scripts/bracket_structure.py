"""
Estructura del bracket de eliminatoria del Mundial 2026 (dieciseisavos a final),
con el número de partido oficial FIFA y de qué cruce/posición de grupo procede
cada lado de cada enfrentamiento. Sirve para:
  1) saber qué fila del Excel corresponde a qué partido real
  2) propagar la eliminación de un equipo a través de las rondas siguientes
"""

# Dieciseisavos: 16 partidos (73-88). 'home'/'away' son referencias a
# posición de grupo (p.ej. '2A' = segundo del grupo A) o a comodín de
# mejor tercero (se resuelve en tiempo de ejecución con el ranking real).
ROUND_OF_32 = [
    {"num": 73, "home": "2A", "away": "2B"},
    {"num": 74, "home": "1E", "away": "3ABCDF"},
    {"num": 75, "home": "1F", "away": "2C"},
    {"num": 76, "home": "1C", "away": "2F"},
    {"num": 77, "home": "1I", "away": "3CDFGH"},
    {"num": 78, "home": "2E", "away": "2I"},
    {"num": 79, "home": "1A", "away": "3CEFHI"},
    {"num": 80, "home": "1L", "away": "3EHIJK"},
    {"num": 81, "home": "1D", "away": "3BEFIJ"},
    {"num": 82, "home": "1G", "away": "3AEHIJ"},
    {"num": 83, "home": "2K", "away": "2L"},
    {"num": 84, "home": "1H", "away": "2J"},
    {"num": 85, "home": "1B", "away": "3EFGIJ"},
    {"num": 86, "home": "1J", "away": "2H"},
    {"num": 87, "home": "1K", "away": "3DEIJL"},
    {"num": 88, "home": "2D", "away": "2G"},
]

# Octavos: 8 partidos (89-96). 'home'/'away' son "W<num>" = ganador del
# partido de dieciseisavos con ese número.
ROUND_OF_16 = [
    {"num": 89, "home": "W74", "away": "W77"},
    {"num": 90, "home": "W73", "away": "W75"},
    {"num": 91, "home": "W76", "away": "W78"},
    {"num": 92, "home": "W79", "away": "W80"},
    {"num": 93, "home": "W83", "away": "W84"},
    {"num": 94, "home": "W81", "away": "W82"},
    {"num": 95, "home": "W86", "away": "W88"},
    {"num": 96, "home": "W85", "away": "W87"},
]

# Cuartos: 4 partidos (97-100)
QUARTERS = [
    {"num": 97, "home": "W89", "away": "W90"},
    {"num": 98, "home": "W93", "away": "W94"},
    {"num": 99, "home": "W91", "away": "W92"},
    {"num": 100, "home": "W95", "away": "W96"},
]

# Semis: 2 partidos (101-102)
SEMIS = [
    {"num": 101, "home": "W97", "away": "W98"},
    {"num": 102, "home": "W99", "away": "W100"},
]

# 3º-4º puesto y Final
THIRD_PLACE = {"home": "L101", "away": "L102"}
FINAL = {"home": "W101", "away": "W102"}

ALL_KO_MATCHES = ROUND_OF_32 + ROUND_OF_16 + QUARTERS + SEMIS

# Filas exactas del Excel (columna ADMIN) para cada bloque, en el mismo
# orden en que aparecen en ALL_KO_MATCHES / listas de arriba.
EXCEL_ROWS = {
    "round_of_32_qualifiers": list(range(130, 162)),   # Dieciseisavofinalista-1..32 (predicción de equipo)
    "round_of_32_matches": list(range(164, 180)),       # Enfrentamientos dieciseisavos (signo|marcador)
    "round_of_16_qualifiers": list(range(182, 198)),    # Octavofinalista-1..16
    "round_of_16_matches": list(range(200, 208)),       # Enfrentamientos octavos
    "quarters_qualifiers": list(range(210, 218)),       # Cuartofinalista-1..8
    "quarters_matches": list(range(220, 224)),          # Enfrentamientos cuartos
    "semis_qualifiers": list(range(226, 230)),          # Semifinalista-1..4
    "semis_matches": list(range(232, 234)),             # Enfrentamientos semis
    "third_place_qualifiers": list(range(236, 238)),    # 3º y 4º puesto-1, Finalista-2 (sic, fila 237)
    "final_qualifiers": list(range(240, 242)),          # Finalista-1, Finalista-2
    "third_place_match": 244,
    "final_match": 247,
    "champion": 250,
    "runner_up": 251,
    "third_place_winner": 252,
}
