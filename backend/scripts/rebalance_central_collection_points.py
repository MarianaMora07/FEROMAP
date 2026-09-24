"""Reubica >=30% de los puntos centrales de Unare hacia la periferia (plan A)."""

from __future__ import annotations

import json
import math
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POINTS_PATH = ROOT / "data" / "seeds" / "collection_points.json"
SECTORS_PATH = ROOT / "data" / "seeds" / "sectors.json"

CENTER_LAT, CENTER_LNG = 8.27, -62.75
CENTRAL_RADIUS_KM = 2.0
PROTECTED_CODE_MAX = 120
NEED = 33


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
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


def coords_in_sector(ring: list[tuple[float, float]], index: int) -> tuple[float, float]:
    lngs = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    min_lng, max_lng = min(lngs), max(lngs)
    min_lat, max_lat = min(lats), max(lats)
    cell = index % 9
    col, row = cell % 3, cell // 3
    lat = min_lat + (max_lat - min_lat) * (0.25 + row * 0.25)
    lng = min_lng + (max_lng - min_lng) * (0.25 + col * 0.25)
    if not point_in_polygon(lng, lat, ring):
        lat = sum(p[1] for p in ring) / len(ring)
        lng = sum(p[0] for p in ring) / len(ring)
    # spread so stacked points in same sector do not share exact coords
    lat += (index % 7) * 0.00035
    lng += (index % 5) * 0.00045
    if not point_in_polygon(lng, lat, ring):
        lat = sum(p[1] for p in ring) / len(ring)
        lng = sum(p[0] for p in ring) / len(ring)
    return round(lat, 6), round(lng, 6)


def is_central(lat: float, lng: float) -> bool:
    return haversine_km(lat, lng, CENTER_LAT, CENTER_LNG) <= CENTRAL_RADIUS_KM


def main() -> None:
    points = json.loads(POINTS_PATH.read_text(encoding="utf-8"))
    sectors = json.loads(SECTORS_PATH.read_text(encoding="utf-8"))
    geom_by_name = {s["name"]: s.get("geometry") or {} for s in sectors}
    sector_names = set(geom_by_name)

    def code_num(p: dict) -> int:
        return int(p["code"].split("-")[1])

    original_counts = Counter(p["sectorName"] for p in points)
    for name in original_counts:
        if name not in sector_names:
            raise SystemExit(f"unknown sector in points: {name}")

    central_before = sum(1 for p in points if is_central(p["latitude"], p["longitude"]))
    print(f"total={len(points)} central_before={central_before}")

    movable = [
        p
        for p in points
        if is_central(p["latitude"], p["longitude"])
        and code_num(p) > PROTECTED_CODE_MAX
        and original_counts[p["sectorName"]] >= 3
    ]
    movable.sort(key=lambda p: (-original_counts[p["sectorName"]], code_num(p)))
    print(f"movable={len(movable)}")
    if len(movable) < NEED:
        raise SystemExit(f"need {NEED} movable central points, got {len(movable)}")

    def centroid(geometry: dict) -> tuple[float, float]:
        ring = polygon_ring(geometry)
        if not ring:
            return CENTER_LAT, CENTER_LNG
        return (
            sum(p[1] for p in ring) / len(ring),
            sum(p[0] for p in ring) / len(ring),
        )

    # peripheral target sectors with polygon, farthest first preference among sparsest
    candidates: list[tuple[int, float, str]] = []
    for name, geom in geom_by_name.items():
        ring = polygon_ring(geom)
        if not ring:
            continue
        clat, clng = centroid(geom)
        if is_central(clat, clng):
            continue
        candidates.append((original_counts.get(name, 0), -haversine_km(clat, clng, CENTER_LAT, CENTER_LNG), name))
    candidates.sort()
    # only sectors that already exist in seed OR empty sectors in seed file (all 91 should be in sectors.json)
    # original seed covered all sectors that appear in points; ensure_coverage wants all sectors with points
    target_names = [c[2] for c in candidates]
    if not target_names:
        raise SystemExit("no peripheral targets")

    live_counts = Counter(original_counts)
    # index offset per target to vary grid cells
    target_idx = {name: original_counts.get(name, 0) for name in target_names}

    moves: list[tuple[str, str, str]] = []
    ti = 0
    for p in movable:
        if len(moves) >= NEED:
            break
        donor = p["sectorName"]
        # keep >=1 point per original sector (coverage); donors may go 3 -> 1
        if live_counts[donor] < 2:
            continue

        chosen = None
        ring = None
        for _ in range(len(target_names)):
            cand = target_names[ti % len(target_names)]
            ti += 1
            if live_counts[cand] >= 6:
                continue
            r = polygon_ring(geom_by_name[cand])
            if not r:
                continue
            clat = sum(q[1] for q in r) / len(r)
            clng = sum(q[0] for q in r) / len(r)
            if is_central(clat, clng):
                continue
            chosen = cand
            ring = r
            break
        if not chosen or ring is None:
            continue

        idx = target_idx[chosen]
        lat, lng = coords_in_sector(ring, idx)
        tries = 0
        while is_central(lat, lng) and tries < 8:
            idx += 1
            lat, lng = coords_in_sector(ring, idx)
            tries += 1
        if is_central(lat, lng):
            continue
        # avoid stacking on an existing point in the same target
        existing = {
            (round(q["latitude"], 5), round(q["longitude"], 5))
            for q in points
            if q is not p and q["sectorName"] == chosen
        }
        bump = 0
        while (round(lat, 5), round(lng, 5)) in existing and bump < 10:
            idx += 1
            lat, lng = coords_in_sector(ring, idx)
            bump += 1

        p["sectorName"] = chosen
        p["latitude"] = lat
        p["longitude"] = lng
        live_counts[donor] -= 1
        live_counts[chosen] += 1
        target_idx[chosen] = idx + 1
        moves.append((p["code"], donor, chosen))

    if len(moves) < NEED:
        raise SystemExit(f"only moved {len(moves)}")

    # coverage: every sector that had points still has >=1
    for name, before in original_counts.items():
        if live_counts[name] < 1:
            raise SystemExit(f"sector emptied: {name} (had {before})")

    # every original sector name still present in the seed file
    after_counts = Counter(p["sectorName"] for p in points)
    for name, before in original_counts.items():
        if after_counts[name] < 1:
            raise SystemExit(f"post-write empty sector: {name}")

    # If some sectors in sectors.json never had points, seed top-up handles them; we only guarantee non-empty donors
    central_after = sum(1 for p in points if is_central(p["latitude"], p["longitude"]))
    cut = (central_before - central_after) / central_before
    print(f"central_after={central_after} cut={cut:.1%} moves={len(moves)}")
    if cut < 0.30:
        raise SystemExit(f"central cut {cut:.1%} < 30%")

    # spread check: max points in any 0.01 deg cell should drop
    def cell_count() -> int:
        cells = Counter(
            (round(p["latitude"], 2), round(p["longitude"], 2)) for p in points
        )
        return cells.most_common(1)[0][1]

    print(f"top_cell_before_est max_cell_after={cell_count()}")
    for code, a, b in moves:
        print(f"  {code}: {a} -> {b}")

    assert len(points) == 300
    assert len({p["code"] for p in points}) == 300

    payload = json.dumps(points, ensure_ascii=False, indent=2) + "\n"
    POINTS_PATH.write_text(payload, encoding="utf-8", newline="\n")
    print(f"wrote {POINTS_PATH}")


if __name__ == "__main__":
    main()
