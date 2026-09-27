from pydantic import Field, field_validator

from app.schemas.common import CamelModel


class ProfilePreferences(CamelModel):
    theme: str = "light"
    language: str = "es"
    units: str = "metric"
    default_view: str = "dashboard"
    report_frequency: str = "daily"
    page_size: int = 20
    email_notifications: bool = True
    system_notifications: bool = True
    address: str | None = None
    timezone: str = "America/Caracas"


class ProfilePreferencesUpdate(CamelModel):
    theme: str | None = None
    language: str | None = None
    units: str | None = None
    default_view: str | None = None
    report_frequency: str | None = None
    page_size: int | None = Field(default=None, ge=5, le=100)
    email_notifications: bool | None = None
    system_notifications: bool | None = None
    address: str | None = None
    timezone: str | None = None


class ProfileUpdate(CamelModel):
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None


class ProfileSecuritySummary(CamelModel):
    active_sessions: int
    two_factor_enabled: bool = False


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
    avatar_url: str | None = None
    last_login_at: str | None = None
    created_at: str | None = None
    last_ip_address: str | None = None
    preferences: ProfilePreferences
    security: ProfileSecuritySummary


class ChangePasswordRequest(CamelModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class AvatarUrlRequest(CamelModel):
    avatar_url: str = Field(min_length=1, max_length=512)


class ProfileSession(CamelModel):
    id: str
    device_label: str
    ip_address: str | None = None
    user_agent: str | None = None
    created_at: str
    last_seen_at: str
    current: bool
