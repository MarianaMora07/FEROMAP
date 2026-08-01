from app.schemas.common import CamelModel


class OptimizeRequest(CamelModel):
    scenario_id: str = "normal"
