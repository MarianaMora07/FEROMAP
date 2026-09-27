"""Contratos de la simulación dry-run de contingencias del día.

El endpoint ``POST /api/v1/planning/daily/{id}/simulate-contingency`` devuelve un
``ContingencySimulationResult`` **sin persistir**: además del resumen de
antes/después, incluye la geometría del plan alternativo por vehículo para poder
animarlo en el frontend.
"""

from __future__ import annotations

from typing import Literal, TypedDict

#: Cómo resolvió el motor la contingencia.
#: - ``reassigned``: los puntos se reasignan a la flota disponible.
#: - ``pending``: no había vehículos disponibles; los puntos quedan pendientes.
#: - ``no_change``: no había puntos que recalcular.
ResolutionCode = Literal["reassigned", "pending", "no_change"]


class AlternativeStopPayload(TypedDict):
    sequence: int
    lng: float
    lat: float
    code: str
    serviceMinutes: int
    stopType: Literal["collection", "landfill"]


class AlternativeRoutePayload(TypedDict):
    """Modelo de playback (espejo backend de ``RoutePlaybackModel``).

    Una simulación no persiste rutas, así que ``routeId``/``vehicleId`` son
    sintéticos (posición en la colección).
    """

    routeId: int
    vehicleId: int
    vehicleLabel: str
    color: str
    lineCoordinates: list[list[float]]
    stops: list[AlternativeStopPayload]
    totalDurationMinutes: int
    distanceKm: float
    startTime: None


class DroppedPointDetail(TypedDict):
    """Punto que quedaría sin atender, con su criticidad (ADR-002)."""

    code: str
    fillPct: int
    criticality: str
    priority: int


class ContingencySimulationResult(TypedDict):
    type: Literal["breakdown", "critical_container"]
    simulated: bool
    dailyPlanId: int
    vehicleId: str | None
    pointCode: str | None
    beforeDistanceKm: float | None
    afterDistanceKm: float | None
    distanceDeltaKm: float | None
    reassignedPoints: int
    remainingVehicles: int | None
    skippedWaypoints: int
    #: Geometría del plan alternativo (vacía si no hubo recálculo).
    alternativeRoutes: list[AlternativeRoutePayload]
    resolution: ResolutionCode
    #: Códigos de puntos que quedarían sin atender (derivados de ``droppedDetails``).
    droppedPoints: list[str]
    #: Triage de esos puntos, ordenado por criticidad y prioridad (desc).
    droppedDetails: list[DroppedPointDetail]
    message: str
