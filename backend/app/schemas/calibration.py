"""Contrato de los jobs de calibración del motor (Fase 13)."""

from pydantic import Field

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


class AcoValidationProfileRequest(CamelModel):
    """Combinación de parámetros ACO a validar.

    La deriva la vista desde la sensibilidad (mejor nivel medido por eje); el backend solo
    comprueba que los valores sean razonables antes de gastar las dos corridas.
    """

    aco_ants: int = Field(default=12, ge=1, le=200)
    aco_iterations: int = Field(default=20, ge=1, le=1000)
    aco_alpha: float = Field(default=1.0, gt=0, le=20)
    aco_beta: float = Field(default=3.0, gt=0, le=20)
    aco_rho: float = Field(default=0.12, gt=0, le=1)
    pheromone_q: float = Field(default=1.0, gt=0, le=10)


class AcoValidationJobRequest(CalibrationJobRequest):
    """Cuerpo de la validación: escenario/semilla + la combinación a probar.

    Sin ``profile`` se valida el perfil estándar contra sí mismo (el payload lo marca con
    ``sameParams``), así que la vista siempre envía la combinación que muestra.
    """

    profile: AcoValidationProfileRequest = Field(default_factory=AcoValidationProfileRequest)


class CalibrationJobCreated(CamelModel):
    job_id: str


class CalibrationJobCancelResponse(CamelModel):
    job_id: str
    status: str
