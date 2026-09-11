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


@app.on_event("startup")
def _recover_orphan_jobs_on_startup():
    """Marca jobs huérfanos de una sesión anterior como fallidos (Tarea 8)."""
    try:
        from app.services.optimization_job_service import recover_orphan_jobs

        recovered = recover_orphan_jobs()
        if recovered:
            import logging

            logging.getLogger(__name__).warning(
                "Marcados %d jobs huérfanos como fallidos tras reinicio", recovered
            )
    except Exception:  # noqa: BLE001
        import logging

        logging.getLogger(__name__).exception("No se pudo recuperar jobs huérfanos al arrancar")


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
        content={"detail": str(exc), "hint": "Revisa data/seeds/ y vuelve a sembrar con: just seed"},
    )
