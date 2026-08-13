from fastapi import APIRouter, HTTPException, Response

from app.services.mbtiles_service import mbtiles_metadata, read_mbtiles_tile

router = APIRouter(prefix="/map", tags=["map-tiles"])


@router.get("/tiles/meta")
def get_map_tiles_meta():
    meta = mbtiles_metadata()
    return {
        "available": meta.available,
        "path": meta.path,
        "minZoom": meta.min_zoom,
        "maxZoom": meta.max_zoom,
        "bounds": {
            "minLng": meta.bounds[0],
            "minLat": meta.bounds[1],
            "maxLng": meta.bounds[2],
            "maxLat": meta.bounds[3],
        },
        "tileCount": meta.tile_count,
        "attribution": meta.attribution,
    }


@router.get("/tiles/{z}/{x}/{y}.png")
def get_map_tile(z: int, x: int, y: int):
    if z < 0 or x < 0 or y < 0:
        raise HTTPException(status_code=400, detail="Coordenadas de tile inválidas")

    meta = mbtiles_metadata()
    if not meta.available:
        raise HTTPException(
            status_code=503,
            detail="MBTiles Unare no disponible. Ejecuta backend/scripts/generate_unare_mbtiles.sh",
        )

    tile = read_mbtiles_tile(z, x, y)
    if tile is None:
        raise HTTPException(status_code=404, detail="Tile no encontrado")

    return Response(
        content=tile,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Tile-Source": "unare-mbtiles",
        },
    )
