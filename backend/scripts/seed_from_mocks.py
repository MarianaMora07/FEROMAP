"""CLI: pobla PostgreSQL desde data/seeds/*.json."""

from __future__ import annotations

from app.services.seed_service import DEMO_PASSWORD, run_seed


def seed() -> None:
    summary = run_seed()
    print("✅ Seed completado")
    print(f"   parishes: {summary['parishes']}")
    print(f"   sectors: {summary['sectors']}")
    print(f"   collection_points: {summary['collectionPoints']}")
    print(f"   vehicles: {summary['vehicles']}")
    print(f"   drivers: {summary['drivers']}")
    print(f"   users: {summary['users']}")
    print("   credenciales demo: admin@fero.com | plan@fero.com | residente@fero.com | conductor@fero.com")
    print(f"   clave demo: {DEMO_PASSWORD}")
    print(f"   optimized_routes: {summary['optimizedRoutes']}")
    print(f"   simulations: {summary['simulations']}")
    print(f"   system_alerts: {summary['systemAlerts']}")


if __name__ == "__main__":
    seed()
