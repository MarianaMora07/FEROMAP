from __future__ import annotations

import csv
import io
import json
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, Driver, OptimizedRoute, RouteWaypoint, Simulation, User, UserRole, Vehicle, Vehicle, VisitSchedule
from app.domain.criticality import (
    HIGH_FILL_PCT,
    hours_until_next_visit,
    is_at_risk_before_next_visit,
    is_critical_now,
)
from app.domain.waste_generation import hours_until_critical
from app.services.auth_service import role_label
from app.services.geo_service import fill_level_pct, fleet_summary, route_geojson, seed_meta_by_code
from app.services.resident_schedule_service import build_resident_schedule
from app.services.alert_service import list_alerts as list_persisted_alerts
from app.services.operations_service import active_routes_view
from app.services.planning_analytics_service import planning_dashboard_snapshot
from app.services.optimization_service import run_optimization_engine
from app.services.scenario_utils import normalize_scenario_id
from app.services.seed_loader import load_seed
from app.services.simulation_parsing import _case_study_fields, parse_simulation


# --- Comparativas multi-corrida (Tarea 5) ------------------------------------


def _comparison_metrics(sim: Simulation) -> dict[str, Any]:
    """Métricas numéricas de una corrida a partir de columnas top-level + KPIs."""
    params: dict[str, Any] = {}
    if sim.parameters_json:
        params = json.loads(sim.parameters_json)
    kpis = params.get("kpis") or {}
    distance = kpis.get("distanceKm") or {}
    duration = kpis.get("durationHours") or {}
    fuel = kpis.get("fuelLiters") or {}
    duration_current = duration.get("current")
    duration_optimized = duration.get("optimized")
    return {
        "distanceCurrentKm": float(sim.kpi_total_distance_historical or distance.get("current", 0) or 0),
        "distanceOptimizedKm": float(sim.kpi_total_distance_optimized or distance.get("optimized", 0) or 0),
        "savingPct": float(sim.kpi_saving_percentage or 0),
        "durationCurrentHours": float(duration_current) if duration_current is not None else None,
        "durationOptimizedHours": float(duration_optimized) if duration_optimized is not None else None,
        "fuelLiters": float(fuel.get("optimized", 0) or 0),
        "co2KgAvoided": float(kpis.get("co2KgAvoided", 0) or 0),
        "containersServed": int(kpis.get("containersServed", 0) or 0),
        "params": params,
    }


def list_simulation_comparisons(
    db: Session,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    scenario_id: str | None = None,
    case_study_id: int | None = None,
    limit: int = 200,
) -> dict[str, Any]:
    """Corridas del historial para la comparativa IA vs histórica (Tarea 5)."""
    stmt = select(Simulation).order_by(Simulation.executed_at.asc())
    if case_study_id is not None:
        stmt = stmt.where(Simulation.case_study_id == case_study_id)
    if from_date is not None:
        stmt = stmt.where(Simulation.executed_at >= datetime.combine(from_date, datetime.min.time(), tzinfo=timezone.utc))
    if to_date is not None:
        end = datetime.combine(to_date + date.resolution, datetime.min.time(), tzinfo=timezone.utc)
        stmt = stmt.where(Simulation.executed_at < end)
    rows = db.scalars(stmt.limit(max(1, min(limit, 500)))).all()

    labels = {row["id"]: row["label"] for row in load_seed("scenarios.json")}
    items: list[dict[str, Any]] = []
    for sim in rows:
        parsed = parse_simulation(sim)
        sid = parsed["scenarioId"]
        if scenario_id and sid != scenario_id:
            continue
        metrics = _comparison_metrics(sim)
        executed_at = sim.executed_at
        items.append(
            {
                "id": sim.id,
                "executedAt": executed_at.isoformat() if executed_at else None,
                "date": executed_at.date().isoformat() if executed_at else None,
                "scenarioId": sid,
                "label": labels.get(sid, parsed["scenarioName"]),
                "distanceHistoricalKm": metrics["distanceCurrentKm"],
                "distanceOptimizedKm": metrics["distanceOptimizedKm"],
                "durationHoursOptimized": metrics["durationOptimizedHours"],
                "co2KgAvoided": metrics["co2KgAvoided"],
                "savingPct": metrics["savingPct"],
                "containersServed": metrics["containersServed"],
                "caseStudyId": parsed.get("caseStudyId"),
                "caseStudyCode": parsed.get("caseStudyCode"),
                "caseStudyName": parsed.get("caseStudyName"),
                "contingency": parsed["contingency"],
            }
        )
    return {"items": items, "count": len(items)}


def simulation_routes_feature_collection(db: Session, simulation_id: int) -> dict[str, Any]:
    """FeatureCollection única con rutas actual e IA de una corrida."""
    sim = db.get(Simulation, simulation_id)
    if sim is None:
        raise LookupError("Simulación no encontrada")
    params: dict[str, Any] = {}
    if sim.parameters_json:
        params = json.loads(sim.parameters_json)
    routes = params.get("routesGeojson") or {}
    current = routes.get("current") or {}
    optimized = routes.get("optimized") or {}
    features = list(current.get("features", []) or []) + list(optimized.get("features", []) or [])
    return {"type": "FeatureCollection", "features": features}


def build_simulation_comparison_csv(sim: Simulation) -> str:
    """CSV de la corrida: tabla de comparación actual vs IA + nota metodológica."""
    metrics = _comparison_metrics(sim)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["# Simulación", sim.id])
    writer.writerow(["# Escenario", sim.scenario_name])
    writer.writerow(["# Fecha", sim.executed_at.isoformat() if sim.executed_at else ""])
    writer.writerow(["# Nota", "La ruta 'actual/histórica' es la línea base sintética (orden por código); la 'IA' es la optimizada por ACO."])
    writer.writerow([])
    writer.writerow(["metrica", "actual", "ia", "unidad"])
    writer.writerow(["distancia", f"{metrics['distanceCurrentKm']:.2f}", f"{metrics['distanceOptimizedKm']:.2f}", "km"])
    writer.writerow(["duracion", "", f"{metrics['durationOptimizedHours'] or 0:.2f}", "h"])
    writer.writerow(["combustible", "", f"{metrics['fuelLiters']:.2f}", "L"])
    writer.writerow(["co2_evitado", "", f"{metrics['co2KgAvoided']:.2f}", "kg"])
    writer.writerow(["puntos_servidos", "", str(metrics["containersServed"]), "contenedores"])
    writer.writerow(["ahorro", "", f"{metrics['savingPct']:.2f}%", ""])
    return buffer.getvalue()


def build_simulation_comparison_pdf(sim: Simulation) -> bytes:
    """PDF de la corrida con la misma tabla de comparación."""
    from fpdf import FPDF

    metrics = _comparison_metrics(sim)
    executed = sim.executed_at.isoformat() if sim.executed_at else ""
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 15)
    pdf.cell(0, 10, "FEROMAP - Simulacion de rutas", ln=True)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 6, f"Simulacion #{sim.id} - {sim.scenario_name}", ln=True)
    pdf.cell(0, 6, f"Fecha: {executed[:19]}", ln=True)
    pdf.cell(0, 6, "Nota: la ruta 'actual/historica' es la linea base sintetica (orden por codigo);", ln=True)
    pdf.cell(0, 6, "la 'IA' es la optimizada por ACO.", ln=True)
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(60, 8, "Metrica", border=1)
    pdf.cell(40, 8, "Actual", border=1)
    pdf.cell(40, 8, "IA", border=1)
    pdf.cell(40, 8, "Unidad", border=1, ln=True)
    pdf.set_font("Helvetica", "", 10)
    rows = [
        ("Distancia", f"{metrics['distanceCurrentKm']:.2f}", f"{metrics['distanceOptimizedKm']:.2f}", "km"),
        ("Duracion", "", f"{metrics['durationOptimizedHours'] or 0:.2f}", "h"),
        ("Combustible", "", f"{metrics['fuelLiters']:.2f}", "L"),
        ("CO2 evitado", "", f"{metrics['co2KgAvoided']:.2f}", "kg"),
        ("Puntos servidos", "", str(metrics["containersServed"]), "contenedores"),
        ("Ahorro", "", f"{metrics['savingPct']:.2f}%", ""),
    ]
    for label, current, optimized, unit in rows:
        pdf.cell(60, 7, label, border=1)
        pdf.cell(40, 7, current, border=1)
        pdf.cell(40, 7, optimized, border=1)
        pdf.cell(40, 7, unit, border=1, ln=True)
    return bytes(pdf.output())


def export_simulation_detail_file(
    db: Session,
    simulation_id: int,
    export_format: str,
) -> tuple[Any, str, str]:
    """Export de una corrida: (contenido, media_type, filename)."""
    sim = db.get(Simulation, simulation_id)
    if sim is None:
        raise LookupError("Simulación no encontrada")
    if export_format == "csv":
        return (
            build_simulation_comparison_csv(sim),
            "text/csv; charset=utf-8",
            f"feromap-simulacion-{simulation_id}.csv",
        )
    return (
        build_simulation_comparison_pdf(sim),
        "application/pdf",
        f"feromap-simulacion-{simulation_id}.pdf",
    )


def _latest_optimization(db: Session) -> dict[str, Any] | None:
    simulation = db.scalars(
        select(Simulation).order_by(Simulation.executed_at.desc()).limit(1)
    ).first()
    if simulation is None or not simulation.parameters_json:
        return None
    params = json.loads(simulation.parameters_json)
    kpis = params.get("kpis")
    if not kpis:
        return None
    return {
        "simulationId": simulation.id,
        "scenarioName": simulation.scenario_name,
        "savingPercentage": float(simulation.kpi_saving_percentage or 0),
        "executedAt": simulation.executed_at.isoformat() if simulation.executed_at else None,
        "kpis": kpis,
        **_case_study_fields(simulation, params),
    }


def _fleet_status_breakdown(db: Session) -> dict[str, Any]:
    vehicles = db.scalars(select(Vehicle)).all()
    total = len(vehicles) or 1
    active = sum(1 for v in vehicles if v.status in {"available", "in_route"})
    maintenance = sum(1 for v in vehicles if v.status == "maintenance")
    inactive = sum(1 for v in vehicles if v.status == "inactive")
    out_of_service = max(0, total - active - maintenance - inactive)
    items = [
        {"label": "Activos", "count": active, "pct": round(active / total * 100), "color": "#34D634"},
        {"label": "En mantenimiento", "count": maintenance, "pct": round(maintenance / total * 100), "color": "#1143F3"},
        {"label": "Fuera de servicio", "count": out_of_service, "pct": round(out_of_service / total * 100), "color": "#f59e0b"},
        {"label": "Inactivos", "count": inactive, "pct": round(inactive / total * 100), "color": "#94a3b8"},
    ]
    return {"total": total, "items": items}


def _weekly_tons_from_simulations(db: Session) -> dict[str, Any]:
    simulations = db.scalars(
        select(Simulation).order_by(Simulation.executed_at.desc()).limit(7)
    ).all()
    if not simulations:
        return {
            "labels": ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
            "values": [18.0, 19.5, 20.1, 21.0, 22.4, 24.0, 25.0],
        }
    simulations = list(reversed(simulations))
    labels = []
    values = []
    for sim in simulations:
        label = sim.executed_at.strftime("%d %b") if sim.executed_at else "—"
        labels.append(label)
        optimized = float(sim.kpi_total_distance_optimized or 0)
        values.append(round(optimized * 0.45, 1))
    return {"labels": labels, "values": values}


def _recent_alerts_view(db: Session) -> list[dict[str, Any]]:
    alerts = list_persisted_alerts(db, active_only=True)[:3]
    tones = ["danger", "warning", "info"]
    return [
        {
            "title": alert["title"],
            "detail": f"{alert['source']} · {alert['location']}",
            "time": alert["datetime"].split(" ")[-2] + " " + alert["datetime"].split(" ")[-1]
            if " " in alert["datetime"]
            else alert["datetime"],
            "tone": tones[index % len(tones)],
        }
        for index, alert in enumerate(alerts)
    ]


def dashboard_summary(db: Session, *, current_user: User | None = None) -> dict[str, Any]:
    points = db.scalars(
        select(CollectionPoint).options(joinedload(CollectionPoint.sector)).order_by(CollectionPoint.code)
    ).all()
    meta_by_code = seed_meta_by_code()
    critical = []
    full_count = 0
    for point in points:
        pct = fill_level_pct(point)
        if is_critical_now(pct):
            meta = meta_by_code.get(point.code, {})
            critical.append(
                {
                    "id": point.code,
                    "sector": point.sector.name if point.sector else "",
                    "fillLevel": pct,
                    "priority": meta.get("priority", "critica"),
                }
            )
        if pct >= HIGH_FILL_PCT:
            full_count += 1

    weekdays_by_point: dict[int, list[int]] = {}
    for schedule in db.scalars(select(VisitSchedule)).all():
        raw = getattr(schedule, "weekdays_json", None)
        point_id = getattr(schedule, "collection_point_id", None)
        if raw is None or point_id is None:
            continue
        try:
            weekdays_by_point[point_id] = [int(value) for value in json.loads(raw)]
        except (TypeError, ValueError, json.JSONDecodeError):
            continue

    at_risk: list[dict[str, Any]] = []
    for point in points:
        weekdays = weekdays_by_point.get(point.id)
        if not weekdays or point.status != "active":
            continue
        if is_at_risk_before_next_visit(point, weekdays=weekdays):
            hours_next = hours_until_next_visit(weekdays=weekdays)
            hours_critical = hours_until_critical(point)
            at_risk.append(
                {
                    "id": point.code,
                    "sector": point.sector.name if point.sector else "",
                    "fillLevel": fill_level_pct(point),
                    "hoursUntilCritical": round(hours_critical, 1) if hours_critical is not None else None,
                    "hoursUntilNextVisit": round(hours_next, 1) if hours_next is not None else None,
                }
            )

    sector_fill: dict[str, list[int]] = {}
    for point in points:
        name = point.sector.name if point.sector else "Desconocido"
        sector_fill.setdefault(name, []).append(fill_level_pct(point))
    sector_fill_levels = [
        {"name": name, "pct": round(sum(values) / len(values))}
        for name, values in sorted(sector_fill.items())
    ]

    fleet = fleet_summary(db)
    vehicles = db.scalars(select(Vehicle)).all()
    routes_in_progress = sum(
        1
        for r in db.scalars(
            select(OptimizedRoute).where(OptimizedRoute.status == "in_progress")
        ).all()
    )
    now = datetime.now(timezone.utc)

    if current_user is not None:
        greeting = f"¡Bienvenido/a, {current_user.first_name}!"
        user_block = {
            "name": f"{current_user.first_name} {current_user.last_name}",
            "role": role_label(current_user.role),
            "initials": f"{current_user.first_name[:1]}{current_user.last_name[:1]}".upper(),
        }
    else:
        greeting = "¡Bienvenida, Mariana!"
        user_block = {"name": "Mariana Mora", "role": "Administrador", "initials": "MM"}

    resident_schedule = None
    if current_user is not None and current_user.role == UserRole.residente and current_user.sector_id:
        schedule = build_resident_schedule(db, sector_id=current_user.sector_id)
        resident_schedule = {
            "sectorName": current_user.sector.name if current_user.sector else "—",
            "collectionDays": schedule["collectionDays"],
            "nextCollection": schedule["nextCollection"],
            "isCollectionDay": schedule["isCollectionDay"],
            "message": (
                f"Horario de recolección en {current_user.sector.name}"
                if schedule.get("hasSchedule")
                else f"Sin recolección programada en {current_user.sector.name}"
            ),
        }

    return {
        "greeting": greeting,
        "subtitle": "Resumen general del sistema de recolección de residuos.",
        "dateLabel": now.strftime("%d/%m/%Y"),
        "notifications": len(critical),
        "user": user_block,
        "residentSchedule": resident_schedule,
        "metrics": {
            "totalContainers": len(points),
            "criticalContainers": len(critical),
            "atRiskContainers": len(at_risk),
            "fullContainers": full_count,
            "activeVehicles": fleet["activeVehicles"],
            "routesInProgress": routes_in_progress,
        },
        "fleet": fleet,
        "criticalContainerList": critical,
        "atRiskContainers": at_risk,
        "sectorFillLevels": sector_fill_levels,
        "mapMetrics": [
            {"id": "total", "label": "Contenedores totales", "value": len(points), "tone": "green", "icon": "trash"},
            {
                "id": "critical",
                "label": "Contenedores críticos",
                "value": len(critical),
                "tone": "red",
                "icon": "trash",
            },
            {
                "id": "at_risk",
                "label": "En riesgo de rebose",
                "value": len(at_risk),
                "tone": "amber",
                "icon": "trash",
            },
            {"id": "full", "label": "Contenedores llenos", "value": full_count, "tone": "amber", "icon": "trash"},
            {
                "id": "vehicles",
                "label": "Vehículos activos",
                "value": fleet["activeVehicles"],
                "tone": "blue",
                "icon": "truck",
            },
            {
                "id": "routes",
                "label": "Rutas en ejecución",
                "value": routes_in_progress,
                "tone": "green",
                "icon": "route",
            },
        ],
        "lastOptimization": _latest_optimization(db),
        "fleetStatus": _fleet_status_breakdown(db),
        "activeRoutes": active_routes_view(db),
        "weeklyTons": _weekly_tons_from_simulations(db),
        "recentAlerts": _recent_alerts_view(db),
        "planningSnapshot": planning_dashboard_snapshot(db),
    }


def list_scenarios() -> list[dict[str, Any]]:
    return load_seed("scenarios.json")


def get_kpis(scenario_id: str) -> dict[str, Any]:
    normalized = normalize_scenario_id(scenario_id)
    kpis = load_seed("kpis.json")
    if normalized not in kpis:
        raise KeyError(normalized)
    return kpis[normalized]


def run_optimization(
    db: Session,
    scenario_id: str,
    *,
    rain_intensity: str | None = None,
    waste_level_pct: int | None = None,
    estimated_duration_hours: int | None = None,
) -> dict[str, Any]:
    return run_optimization_engine(
        db,
        scenario_id,
        rain_intensity=rain_intensity,
        waste_level_pct=waste_level_pct,
        estimated_duration_hours=estimated_duration_hours,
    )


def list_simulations(
    db: Session,
    *,
    limit: int = 25,
    offset: int = 0,
    case_study_id: int | None = None,
    legacy_only: bool = False,
) -> dict[str, Any]:
    stmt = select(Simulation)
    count_stmt = select(func.count()).select_from(Simulation)
    if legacy_only:
        stmt = stmt.where(Simulation.case_study_id.is_(None))
        count_stmt = count_stmt.where(Simulation.case_study_id.is_(None))
    elif case_study_id is not None:
        stmt = stmt.where(Simulation.case_study_id == case_study_id)
        count_stmt = count_stmt.where(Simulation.case_study_id == case_study_id)

    simulations = db.scalars(
        stmt.order_by(Simulation.executed_at.desc()).offset(offset).limit(limit)
    ).all()
    total = db.scalar(count_stmt) or 0
    items = []
    for simulation in simulations:
        parsed = parse_simulation(simulation)
        items.append(
            {
                "id": parsed["id"],
                "name": parsed["scenarioName"],
                "executedAt": parsed["executedAt"],
                "scenarioId": parsed["scenarioId"],
                "savingPercentage": parsed["savingPercentage"],
                "contingency": parsed["contingency"],
                "caseStudyId": parsed.get("caseStudyId"),
                "caseStudyCode": parsed.get("caseStudyCode"),
                "caseStudyName": parsed.get("caseStudyName"),
            }
        )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


def simulation_detail(db: Session, simulation_id: int) -> dict[str, Any]:
    simulation = db.get(Simulation, simulation_id)
    if simulation is None:
        raise LookupError("Simulación no encontrada")

    params: dict[str, Any] = {}
    if simulation.parameters_json:
        params = json.loads(simulation.parameters_json)
    scenario_id = params.get("scenarioId", "normal")
    kpi = params.get("kpis") or get_kpis(scenario_id)
    routes = params.get("routesGeojson") or {
        "current": route_geojson(db, "current"),
        "optimized": route_geojson(db, "optimized"),
    }

    return {
        "id": simulation.id,
        "executedAt": simulation.executed_at.isoformat() if simulation.executed_at else None,
        "scenarioId": scenario_id,
        "scenarioName": simulation.scenario_name,
        "parameters": params,
        "kpis": kpi,
        "kpiTotalDistanceHistorical": float(simulation.kpi_total_distance_historical or 0),
        "kpiTotalDistanceOptimized": float(simulation.kpi_total_distance_optimized or 0),
        "kpiSavingPercentage": float(simulation.kpi_saving_percentage or 0),
        "caseStudyId": simulation.case_study_id,
        "caseStudyCode": (params.get("simulationParameters") or {}).get("caseStudy", {}).get("caseStudyCode"),
        "caseStudyName": (params.get("simulationParameters") or {}).get("caseStudy", {}).get("caseStudyName"),
        "routes": routes,
    }
