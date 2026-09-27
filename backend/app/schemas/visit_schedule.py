from datetime import date

from pydantic import Field

from app.schemas.common import CamelModel


class VisitScheduleUpsert(CamelModel):
    visits_per_week: int = Field(ge=1, le=7)
    weekdays: list[int] = Field(min_length=1, max_length=7)
    is_extra_visit: bool = False
    effective_from: date | None = None
    effective_until: date | None = None
