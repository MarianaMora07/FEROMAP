from pydantic import EmailStr, Field

from app.schemas.common import CamelModel


class Driver(CamelModel):
    id: int
    document: str
    first_name: str
    last_name: str
    phone: str | None = None
    email: str | None = None
    active: bool
    assigned_vehicles: int = 0


class DriverCreate(CamelModel):
    email: EmailStr
    password: str = Field(min_length=8)
    document: str = Field(min_length=3, max_length=50)
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)
    phone: str | None = None


class DriverUpdate(CamelModel):
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    document: str | None = Field(default=None, min_length=3, max_length=50)
    active: bool | None = None
