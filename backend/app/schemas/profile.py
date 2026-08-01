from app.schemas.common import CamelModel


class ProfileUpdate(CamelModel):
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None


class ProfileDetail(CamelModel):
    id: int
    email: str
    first_name: str
    last_name: str
    phone: str | None = None
    role: str
    role_label: str
    sector_id: int | None = None
    sector_name: str | None = None
    active: bool
    last_login_at: str | None = None
    created_at: str | None = None
