#!/usr/bin/env bash
# Genera backend/data/tiles/unare.mbtiles para mapas offline de Unare.
#
# Estrategia:
#   1) Planetiler (recomendado si está instalado)
#   2) Tilemaker (alternativa)
#   3) Bootstrap Python (descarga tiles OSM una sola vez; ~5–30 MB según zoom)
#
# Uso:
#   ./backend/scripts/generate_unare_mbtiles.sh
#   MIN_ZOOM=12 MAX_ZOOM=16 ./backend/scripts/generate_unare_mbtiles.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA_DIR="${DATA_DIR:-${ROOT_DIR}/data}"
OUTPUT="${DATA_DIR}/tiles/unare.mbtiles"
MIN_ZOOM="${MIN_ZOOM:-12}"
MAX_ZOOM="${MAX_ZOOM:-16}"
BBOX="-62.81,8.24,-62.69,8.31"
WORK="${DATA_DIR}/tiles/build"
PBF="${WORK}/unare.osm.pbf"
PLANETILER_JAR="${WORK}/planetiler.jar"

mkdir -p "${DATA_DIR}/tiles" "${WORK}"

echo "→ Salida: ${OUTPUT}"
echo "→ Zoom: ${MIN_ZOOM}-${MAX_ZOOM}"

if command -v planetiler >/dev/null 2>&1; then
  echo "→ Usando planetiler CLI"
  planetiler \
    --download \
    --area="${BBOX}" \
    --minzoom="${MIN_ZOOM}" \
    --maxzoom="${MAX_ZOOM}" \
    --output="${OUTPUT}"
  exit 0
fi

if [[ -f "${PLANETILER_JAR}" ]] && command -v java >/dev/null 2>&1; then
  echo "→ Usando planetiler.jar"
  java -jar "${PLANETILER_JAR}" \
    --download \
    --area="${BBOX}" \
    --minzoom="${MIN_ZOOM}" \
    --maxzoom="${MAX_ZOOM}" \
    --output="${OUTPUT}"
  exit 0
fi

if command -v tilemaker >/dev/null 2>&1; then
  echo "→ Usando tilemaker (requiere extracto OSM en ${PBF})"
  if [[ ! -f "${PBF}" ]]; then
    echo "Descarga manual requerida: coloca un extracto OSM en ${PBF}"
    echo "  Ejemplo: osmium extract -b ${BBOX} venezuela-latest.osm.pbf -o ${PBF}"
    exit 1
  fi
  tilemaker \
    --input "${PBF}" \
    --output "${OUTPUT}" \
    --minzoom "${MIN_ZOOM}" \
    --maxzoom "${MAX_ZOOM}"
  exit 0
fi

echo "→ Fallback: bootstrap Python (descarga tiles OSM para Unare)"

BOOTSTRAP="${ROOT_DIR}/backend/scripts/build_bootstrap_unare_mbtiles.py"
API_CONTAINER="${API_CONTAINER:-${COMPOSE_PROJECT_NAME:-feromap}-api}"

run_python_bootstrap() {
  if command -v python >/dev/null 2>&1; then
    python "${BOOTSTRAP}" --output "${OUTPUT}" --min-zoom "${MIN_ZOOM}" --max-zoom "${MAX_ZOOM}"
    return
  fi
  if command -v python >/dev/null 2>&1; then
    python "${BOOTSTRAP}" --output "${OUTPUT}" --min-zoom "${MIN_ZOOM}" --max-zoom "${MAX_ZOOM}"
    return
  fi
  if command -v docker >/dev/null 2>&1 && docker inspect "${API_CONTAINER}" >/dev/null 2>&1; then
    echo "→ python no está en el PATH; generando dentro de ${API_CONTAINER}"
    docker exec "${API_CONTAINER}" python /app/scripts/build_bootstrap_unare_mbtiles.py \
      --output /tmp/unare.mbtiles \
      --min-zoom "${MIN_ZOOM}" \
      --max-zoom "${MAX_ZOOM}"
    docker cp "${API_CONTAINER}:/tmp/unare.mbtiles" "${OUTPUT}"
    return
  fi
  echo "Error: no se encontró python ni python, y el contenedor ${API_CONTAINER} no está en marcha." >&2
  echo "Instala Python 3 o levanta el stack (docker compose) y vuelve a ejecutar este script." >&2
  exit 1
}

run_python_bootstrap

echo "✓ MBTiles generado: ${OUTPUT}"
du -h "${OUTPUT}"
