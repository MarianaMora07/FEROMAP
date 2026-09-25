"""Contrato de la evidencia de la evaluación (tesis) expuesta en la vista de calibración."""

from pydantic import Field

from app.schemas.common import CamelModel


class ThesisEvidenceJobRequest(CamelModel):
    """Cuerpo de creación del job de evidencia.

    Solo la validación estadística usa parámetros: ``nRuns`` acota el número de corridas
    pareadas (10 = iteración rápida, 30 = cifra del capítulo) y ``scenarioIds`` la familia
    del contraste. La comparativa y los casos de estudio tienen diseño fijo y los ignoran.
    """

    n_runs: int | None = Field(default=None, ge=5, le=60)
    scenario_ids: list[str] | None = None
