import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router

app = FastAPI(
    title="FEROMAP API",
    description="Optimización dinámica de rutas de recolección — tesis de grado",
    version="0.2.0",
)

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "feromap-api",
        "env": os.getenv("APP_ENV", "local"),
    }


@app.exception_handler(FileNotFoundError)
def seed_not_found_handler(_, exc: FileNotFoundError):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "hint": "Ejecuta npm run export-seeds en el host"},
    )
