# Porra Mundial 2026

Dashboard de la porra del Mundial entre amigos. Se actualiza solo cada 6 horas con los resultados reales vía football-data.org.

## Estructura
- `index.html`, `styles.css`, `app.js` — la web
- `data.js` — los datos (se regenera automáticamente)
- `source/predicciones.xlsx` — las apuestas de cada jugador (edítalo y haz commit si cambian)
- `scripts/update_data.py` — el script que cruza predicciones con resultados reales
- `.github/workflows/update.yml` — el robot que ejecuta el script cada 6h

## Actualizar manualmente
Ve a la pestaña **Actions** del repo → "Actualizar resultados Mundial" → **Run workflow**.

## Cambiar la frecuencia
Edita el `cron` en `.github/workflows/update.yml`. Ejemplos:
- `0 */6 * * *` → cada 6 horas
- `0 */3 * * *` → cada 3 horas
- `0 8,20 * * *` → dos veces al día (8:00 y 20:00 UTC)
