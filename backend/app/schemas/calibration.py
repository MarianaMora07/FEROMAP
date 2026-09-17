"""Contrato de los jobs de calibración del motor (Fase 13)."""

from app.schemas.common import CamelModel


class CalibrationJobRequest(CamelModel):
    """Cuerpo de creación de un job de barrido.

    ``scenarioId``/``seed`` se resuelven a los defaults reproducibles (``normal`` /
    ``42``) cuando se omiten. ``refresh=False`` reutiliza la caché si corresponde al
    mismo escenario/semilla en vez de recalcular.
    """

    scenario_id: str | None = None
    seed: int | None = None
    refresh: bool = True


class ObjectiveSweepJobRequest(CalibrationJobRequest):
    """Cuerpo del barrido de pesos: añade la jornada declarada.

    ``durationHours`` **no configura** el barrido (las jornadas las fijan los casos): se
    valida contra las que el barrido cubre para que un valor inconsistente falle con un
    error explícito en vez de ignorarse.
    """

    duration_hours: int | None = None


class CalibrationJobCreated(CamelModel):
    job_id: str


class CalibrationJobCancelResponse(CamelModel):
    job_id: str
    status: str
