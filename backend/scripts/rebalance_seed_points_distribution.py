"""Rebalancea data/seeds/collection_points.json: conteos ∝ área por sector y todos los puntos dentro de su polígono.

- Protegidos (códigos <=120): conservan su sector (visit_schedules/case_studies los referencian).
- Móviles (>120): se reasignan de donadores a receptores hasta el target por área.
- Reubica la totalidad de los 300 puntos dentro del polígono de su sector final
  con muestreo por distancia máxima (determinista, sin aleatoriedad).
- Preserva código, orden, atributos y formato del archivo.

Uso: python -m scripts.rebalance_seed_points_distribution [--dry-run]
"""

from __future__ import annotations

import json
import math
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POINTS_PATH = ROOT / "data" / "seeds" / "collection_points.json"
SECTORS_PATH = ROOT / "data" / "seeds" / "sectors.json"

PROTECTED_CODE_MAX = 120
TOTAL_POINTS = 300
FLOOR = 3
CAP = 10
MIN_SEP_M = 60.0
M_PER_DEG_LAT = 110540.0


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def polygon_ring(geometry: dict) -> list[tuple[float, float]]:
    if geometry.get("type") != "Polygon":
        return []
    rings = geometry.get("coordinates") or []
    if not rings or not rings[0]:
        return []
    return [(float(c[0]), float(c[1])) for c in rings[0]]


def point_in_polygon(lng: float, lat: float, ring: list[tuple[float, float]]) -> bool:
    if len(ring) < 3:
        return False
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-30) + xi:
            inside = not inside
        j = i
    return inside


def ring_area_km2(ring: list[tuple[float, float]]) -> float:
    """Shoelace proyectado a metros (aprox. local, suficiente para proporciones)."""
    if len(ring) < 3:
        return 0.0
    lat0 = sum(p[1] for p in ring) / len(ring)
    m_per_deg_lng = M_PER_DEG_LAT * math.cos(math.radians(lat0))
    pts = [(p[0] * m_per_deg_lng, p[1] * M_PER_DEG_LAT) for p in ring]
    s = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0 / 1e6


def centroid(ring: list[tuple[float, float]]) -> tuple[float, float]:
    return (
        sum(p[1] for p in ring) / len(ring),
        sum(p[0] for p in ring) / len(ring),
    )


def ring_bbox(ring: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    lngs = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    return min(lngs), min(lats), max(lngs), max(lats)


def compute_targets(
    protected: Counter,
    area_km2: dict[str, float],
    names: list[str],
) -> dict[str, int]:
    """Targets por sector: base protegido, mínimo FLOOR, máximo CAP, resto ∝ área."""
    total_area = sum(area_km2.values())
    base = {n: max(protected.get(n, 0), FLOOR) for n in names}
    remaining = TOTAL_POINTS - sum(base.values())
    if remaining < 0:
        raise SystemExit(f"base > {TOTAL_POINTS}: {sum(base.values())}")

    # Capacidad de crecimiento: hasta CAP (o el protegido si supera CAP).
    cap_of = {n: max(protected.get(n, 0), CAP) for n in names}
    room = {n: max(0, cap_of[n] - base[n]) for n in names}
    total_room = sum(room.values())
    if total_room < remaining:
        raise SystemExit(f"capacidad insuficiente: {total_room} < {remaining}")

    # Reparto ∝ área con mayor resto de Hamilton.
    exact = {n: remaining * (area_km2[n] / total_area) for n in names}
    alloc = {n: min(room[n], int(exact[n])) for n in names}
    left = remaining - sum(alloc.values())
    order = sorted(names, key=lambda n: (-(exact[n] - int(exact[n])), n))
    for n in order:
        if left <= 0:
            break
        if alloc[n] < room[n]:
            alloc[n] += 1
            left -= 1
    if left > 0:  # reparto por capacidad residual (greedy, determinista)
        for n in sorted(names, key=lambda n: (-room[n], n)):
            if left <= 0:
                break
            add = min(room[n] - alloc[n], left)
            alloc[n] += add
            left -= add
    if left > 0:
        raise SystemExit(f"no se pudieron asignar {left} slots")

    target = {n: base[n] + alloc[n] for n in names}
    if sum(target.values()) != TOTAL_POINTS:
        raise SystemExit(f"targets suman {sum(target.values())} != {TOTAL_POINTS}")
    return target


def place_sector(
    name: str,
    ring: list[tuple[float, float]],
    count: int,
    placed: list[tuple[float, float]],
    taken_rounded: set[tuple[float, float]],
    sep_m: float,
) -> list[tuple[float, float]]:
    """Elige `count` posiciones dentro del polígono (FPS desde el centroide)."""
    min_lng, min_lat, max_lng, max_lat = ring_bbox(ring)
    clat, clng = centroid(ring)

    def round_safe(p: tuple[float, float]) -> bool:
        r = (round(p[0], 6), round(p[1], 6))
        return r not in taken_rounded and point_in_polygon(r[1], r[0], ring)

    # Grilla creciente hasta tener suficientes candidatos LIBRES
    # (polígonos idénticos entre sectores comparten celdas ya tomadas).
    best: list[tuple[float, float]] = []
    free_needed = count * 3
    for res in (6, 9, 13, 18, 25, 36, 50):
        cells: list[tuple[float, float]] = []
        for r in range(res):
            lat = min_lat + (max_lat - min_lat) * (r + 0.5) / res
            for c in range(res):
                lng = min_lng + (max_lng - min_lng) * (c + 0.5) / res
                if point_in_polygon(lng, lat, ring):
                    cells.append((lat, lng))
        best = cells
        free = sum(1 for c in cells if round_safe(c))
        if free >= free_needed or (len(cells) >= free_needed and res == 50):
            break
    if not best:
        raise SystemExit(f"sector {name}: sin candidatos dentro del polígono")
    free_cells = [c for c in best if round_safe(c)]
    if len(free_cells) >= count:
        best = free_cells

    chosen: list[tuple[float, float]] = []
    first = min(best, key=lambda p: haversine_m(p[0], p[1], clat, clng))
    if round_safe(first):
        chosen.append(first)
        taken_rounded.add((round(first[0], 6), round(first[1], 6)))

    while len(chosen) < count:
        pool = best if len(best) >= count * 4 else _refine(min_lng, min_lat, max_lng, max_lat, ring, best)
        scored: list[tuple[float, int, tuple[float, float]]] = []
        degraded = False
        for pass_threshold in (sep_m, 0.0):
            scored = []
            for cand in pool:
                if cand in chosen:
                    continue
                if not round_safe(cand):
                    continue
                d = min(
                    (haversine_m(cand[0], cand[1], q[0], q[1]) for q in chosen),
                    default=1e9,
                )
                if d < pass_threshold:
                    continue
                dg = min(
                    (haversine_m(cand[0], cand[1], q[0], q[1]) for q in placed),
                    default=1e9,
                )
                scored.append((min(d, dg), len(scored), cand))
            if scored:
                degraded = pass_threshold == 0.0
                break
        if not scored:
            return chosen  # sin espacio: degradar cantidad
        scored.sort(reverse=True)
        pick = scored[0][2]
        chosen.append(pick)
        taken_rounded.add((round(pick[0], 6), round(pick[1], 6)))
        if degraded:
            sep_m = max(5.0, sep_m * 0.6)  # polígono saturado: relajar para este sector
    return chosen


def _refine(
    min_lng: float,
    min_lat: float,
    max_lng: float,
    max_lat: float,
    ring: list[tuple[float, float]],
    base: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    res = 34
    cells: list[tuple[float, float]] = list(base)
    for r in range(res):
        lat = min_lat + (max_lat - min_lat) * (r + 0.5) / res
        for c in range(res):
            lng = min_lng + (max_lng - min_lng) * (c + 0.5) / res
            if point_in_polygon(lng, lat, ring):
                cells.append((lat, lng))
    return cells


def main() -> None:
    dry = "--dry-run" in sys.argv
    points = json.loads(POINTS_PATH.read_text(encoding="utf-8"))
    sectors = json.loads(SECTORS_PATH.read_text(encoding="utf-8"))

    if len(points) != TOTAL_POINTS:
        raise SystemExit(f"esperaba {TOTAL_POINTS} puntos, hay {len(points)}")
    codes = [p["code"] for p in points]
    if codes != sorted(codes) or len(set(codes)) != TOTAL_POINTS:
        raise SystemExit("códigos no únicos o desordenados")
    attrs_before = {
        p["code"]: {k: v for k, v in p.items() if k not in ("sectorName", "latitude", "longitude")}
        for p in points
    }
    sector_before = {p["code"]: p["sectorName"] for p in points}

    geom: dict[str, dict] = {}
    area: dict[str, float] = {}
    rings: dict[str, list[tuple[float, float]]] = {}
    for s in sectors:
        ring = polygon_ring(s.get("geometry") or {})
        if not ring:
            raise SystemExit(f"sector sin polígono: {s['name']}")
        geom[s["name"]] = s
        rings[s["name"]] = ring
        area[s["name"]] = ring_area_km2(ring)
    names = sorted(rings)

    protected = Counter(
        p["sectorName"] for p in points if int(p["code"].split("-")[1]) <= PROTECTED_CODE_MAX
    )
    current = Counter(p["sectorName"] for p in points)

    target = compute_targets(protected, area, names)
    print(f"targets: min={min(target.values())} max={max(target.values())} sum={sum(target.values())}")

    # --- 1. Reasignar móviles de donadores a receptores ---
    donors = {n: current[n] - target[n] for n in names if current[n] > target[n]}
    receivers = {n: target[n] - current[n] for n in names if current[n] < target[n]}
    movable_by_sector: dict[str, list[dict]] = {}
    for p in points:
        if int(p["code"].split("-")[1]) > PROTECTED_CODE_MAX:
            movable_by_sector.setdefault(p["sectorName"], []).append(p)
    for plist in movable_by_sector.values():
        plist.sort(key=lambda p: p["code"])

    moves = 0
    for n in sorted(donors, key=lambda x: (-donors[x], x)):
        available = movable_by_sector.get(n, [])
        if len(available) < donors[n]:
            raise SystemExit(f"donador {n}: {donors[n]} a mover, solo {len(available)} móviles")
    pool: list[dict] = []
    for n in sorted(donors, key=lambda x: (-donors[x], x)):
        pool.extend(movable_by_sector[n][: donors[n]])
    pool.sort(key=lambda p: p["code"])
    need = sum(receivers.values())
    if len(pool) != need:
        raise SystemExit(f"pool={len(pool)} != receptores={need}")

    by_name = {p["code"]: p for p in points}
    rx_order = sorted(receivers, key=lambda x: (-receivers[x], x))
    pi = 0
    for n in rx_order:
        for _ in range(receivers[n]):
            p = pool[pi]
            pi += 1
            p["sectorName"] = n
            moves += 1
    print(f"reasignados: {moves} puntos móviles en {len(donors)} donadores -> {len(receivers)} receptores")

    # --- 2. Reubicar los 300 puntos dentro de su polígono final ---
    final_by_sector: dict[str, list[dict]] = {n: [] for n in names}
    for p in points:
        final_by_sector[p["sectorName"]].append(p)
    for plist in final_by_sector.values():
        plist.sort(key=lambda p: p["code"])

    placed_pts: list[tuple[float, float]] = []
    taken_rounded: set[tuple[float, float]] = set()
    sep = MIN_SEP_M
    for n in names:
        plist = final_by_sector[n]
        if not plist:
            continue
        positions = place_sector(n, rings[n], len(plist), placed_pts, taken_rounded, sep)
        if len(positions) < len(plist):
            # polígono saturado: rellenar con jitter determinista alrededor de los elegidos
            print(f"  aviso: {n}: {len(positions)}/{len(plist)} posiciones base, rellenando con jitter")
            clat, clng = centroid(rings[n])
            i = 0
            while len(positions) < len(plist) and i < 5000:
                f = 0.00004 * (i // 8 + 1)
                ang = (i % 8) * (math.pi / 4)
                cand = (
                    round(clat + f * math.cos(ang) * 1.1, 6),
                    round(clng + f * math.sin(ang) / math.cos(math.radians(clat)), 6),
                )
                i += 1
                if cand in taken_rounded or not point_in_polygon(cand[1], cand[0], rings[n]):
                    continue
                positions.append(cand)
                taken_rounded.add(cand)
            if len(positions) < len(plist):
                raise SystemExit(f"sector {n}: sin espacio para {len(plist)} puntos")
            sep = max(10.0, sep * 0.6)
        for p, (lat, lng) in zip(plist, positions):
            rlat, rlng = round(lat, 6), round(lng, 6)
            if not point_in_polygon(rlng, rlat, rings[n]):
                clat, clng = centroid(rings[n])
                for k in range(1, 11):
                    f = k / 10.0
                    rlat = round(lat + (clat - lat) * f, 6)
                    rlng = round(lng + (clng - lng) * f, 6)
                    if point_in_polygon(rlng, rlat, rings[n]):
                        break
                else:
                    rlat, rlng = round(clat, 6), round(clng, 6)
            key = (rlat, rlng)
            taken_rounded.add(key)
            p["latitude"] = rlat
            p["longitude"] = rlng
            placed_pts.append((rlat, rlng))

    # --- 3. Validaciones ---
    errors: list[str] = []
    final_counts = Counter(p["sectorName"] for p in points)
    for n in names:
        if final_counts[n] != target[n]:
            errors.append(f"{n}: conteo {final_counts[n]} != target {target[n]}")
    for p in points:
        if int(p["code"].split("-")[1]) <= PROTECTED_CODE_MAX and p["sectorName"] != sector_before[p["code"]]:
            errors.append(f"protegido {p['code']} cambió de sector")
        if p["sectorName"] not in rings:
            errors.append(f"{p['code']}: sector desconocido {p['sectorName']}")
        elif not point_in_polygon(p["longitude"], p["latitude"], rings[p["sectorName"]]):
            errors.append(f"{p['code']}: fuera del polígono de {p['sectorName']}")
        attrs = {k: v for k, v in p.items() if k not in ("sectorName", "latitude", "longitude")}
        if attrs != attrs_before[p["code"]]:
            errors.append(f"{p['code']}: atributos alterados")

    coords = [(p["latitude"], p["longitude"]) for p in points]
    if len(set(coords)) != TOTAL_POINTS:
        errors.append(f"coordenadas duplicadas: {TOTAL_POINTS - len(set(coords))}")
    min_sep = min(
        haversine_m(coords[i][0], coords[i][1], coords[j][0], coords[j][1])
        for i in range(TOTAL_POINTS)
        for j in range(i + 1, TOTAL_POINTS)
    )
    cells = Counter((round(p["latitude"], 2), round(p["longitude"], 2)) for p in points)
    top_cell = max(cells.values())
    outside = sum(
        1 for p in points if not point_in_polygon(p["longitude"], p["latitude"], rings[p["sectorName"]])
    )
    print(f"fuera de polígono: {outside}/{TOTAL_POINTS}")
    print(f"separación mínima: {min_sep:.1f} m")
    print(f"celda 0.01° más poblada: {top_cell} pts (antes 43)")
    print(f"densidad por sector: ", end="")
    dens = [final_counts[n] / area[n] for n in names]
    print(f"min={min(dens):.1f} max={max(dens):.1f} pts/km²")

    if errors:
        for e in errors[:20]:
            print(f"ERROR: {e}")
        raise SystemExit(f"{len(errors)} errores, no se escribe")

    if dry:
        print("dry-run: OK, no se escribió")
        return

    payload = json.dumps(points, ensure_ascii=False, indent=2)
    POINTS_PATH.write_text(payload, encoding="utf-8", newline="\n")
    print(f"escrito: {POINTS_PATH}")


if __name__ == "__main__":
    main()
