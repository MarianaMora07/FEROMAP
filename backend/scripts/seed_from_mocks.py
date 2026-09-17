"""CLI: pobla PostgreSQL desde data/seeds/*.json."""

from __future__ import annotations

from app.services.graph_service import warm_road_graph_cache
from app.services.instance_fingerprint import write_seed_epoch
from app.services.seed_service import DEMO_PASSWORD, run_seed


def seed() -> None:
    summary = run_seed()
    # Marca la BD recién sembrada: la evidencia de barridos anteriores queda como «otra
    # instancia» (la vista de calibración lo avisa) sin borrarla.
    epoch = write_seed_epoch()
    print("✅ Seed completado")
    print(f"   parishes: {summary['parishes']}")
    print(f"   sectors: {summary['sectors']}")
    print(f"   collection_points: {summary['collectionPoints']}")
    if summary.get("collectionPointsAutoCreated"):
        print(
            "   collection_points_auto:",
            f"+{summary['collectionPointsAutoCreated']} "
            f"(objetivo {summary.get('collectionPointsTargetTotal', 120)}, "
            f"{summary.get('collectionPointsSectorsCovered', '?')} sectores)",
        )
    print(f"   case_studies: {summary.get('caseStudies', 0)}")
    if summary.get("caseStudyCodes"):
        print(f"   case_study_codes: {', '.join(summary['caseStudyCodes'])}")
    print(f"   vehicles: {summary['vehicles']}")
    print(f"   drivers: {summary['drivers']}")
    print(f"   users: {summary['users']}")
    print("   credenciales demo: admin@fero.com | plan@fero.com | residente@fero.com | conductor@fero.com")
    print(f"   clave demo: {DEMO_PASSWORD}")
    print(f"   optimized_routes: {summary['optimizedRoutes']}")
    print(f"   simulations: {summary['simulations']}")
    print(f"   system_alerts: {summary['systemAlerts']}")
    print(f"   epoch de instancia: {epoch}")

    try:
        graph_meta = warm_road_graph_cache()
        print(
            "   road_graph_cache:",
            f"{graph_meta['source']} ({graph_meta['nodes']} nodos, {graph_meta['edges']} aristas)",
        )
    except Exception as exc:  # noqa: BLE001
        print(f"   road_graph_cache: omitido ({exc})")


if __name__ == "__main__":
    seed()
