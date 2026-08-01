from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class UserPublic(BaseModel):
    id: int
    email: str
    firstName: str
    lastName: str
    role: str
    sectorId: int | None = None
    sectorName: str | None = None
    driverId: int | None = None

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    accessToken: str
    tokenType: str = "bearer"
    user: UserPublic
