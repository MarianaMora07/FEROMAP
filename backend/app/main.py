import logging
import os
import threading
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from app.api.v1.router import api_router
from app.config import settings
from app.core import metrics
from app.core.logging import configure_logging, set_request_id

configure_logging(os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("feromap.request")

app = FastAPI(
    title="FEROMAP API",
    description="Optimización dinámica de rutas de recolección — tesis de grado",
    version=metrics.APP_VERSION,
)


def _resolve_cors_origins() -> list[str]:
    """Orígenes permitidos: env CORS_ORIGINS o, en dev, localhost:5173.

    En producción, si no se configura ninguno, CORS queda cerrado (la UI se sirve
    por Nginx en el mismo origen).
    """
    raw = (settings.cors_origins or os.getenv("CORS_ORIGINS") or "").strip()
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    if settings.is_production:
        return []
    return ["http://localhost:5173"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_resolve_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


# --- Rate-limit de login: ventana deslizante por IP (ver F2) ---
_LOGIN_PATH_SUFFIX = "/api/v1/auth/login"
_rate_lock = threading.Lock()
_rate_hits: dict[str, list[float]] = {}


@app.middleware("http")
async def _login_rate_limit(request: Request, call_next):
    limit = settings.login_rate_limit_per_minute
    if (
        limit > 0
        and request.method == "POST"
        and request.url.path.endswith(_LOGIN_PATH_SUFFIX)
    ):
        client = request.client.host if request.client else "unknown"
        now = time.monotonic()
        with _rate_lock:
            hits = [t for t in _rate_hits.get(client, []) if now - t < 60]
            if len(hits) >= limit:
                retry_after = max(1, int(60 - (now - hits[0])))
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Demasiadas solicitudes de login. Intenta más tarde."},
                    headers={"Retry-After": str(retry_after)},
                )
            hits.append(now)
            _rate_hits[client] = hits
    return await call_next(request)


# --- Observabilidad: request-id correlacionado, métricas y log de acceso (F3) ---
@app.middleware("http")
async def _observability(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    set_request_id(request_id)
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.perf_counter() - started) * 1000
        metrics.observe_request(request.method, request.url.path, 500, duration_ms / 1000)
        logger.exception(
            "request_failed",
            extra={
                "event": "request_failed",
                "method": request.method,
                "path": request.url.path,
                "status": 500,
                "duration_ms": round(duration_ms, 2),
            },
        )
        set_request_id(None)
        raise

    response.headers["X-Request-ID"] = request_id
    if request.url.path != "/metrics":
        duration_ms = (time.perf_counter() - started) * 1000
        metrics.observe_request(
            request.method, request.url.path, response.status_code, duration_ms / 1000
        )
        logger.info(
            "request",
            extra={
                "event": "request",
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round(duration_ms, 2),
            },
        )
    set_request_id(None)
    return response


@app.get("/metrics", include_in_schema=False)
def metrics_endpoint():
    return PlainTextResponse(metrics.render_metrics())


@app.on_event("startup")
def _recover_orphan_jobs_on_startup():
    """Marca jobs huérfanos de una sesión anterior como fallidos (Tarea 8)."""
    try:
        from app.services.optimization_job_service import recover_orphan_jobs

        recovered = recover_orphan_jobs()
        if recovered:
            logging.getLogger(__name__).warning(
                "Marcados %d jobs huérfanos como fallidos tras reinicio", recovered
            )
    except Exception:  # noqa: BLE001
        logging.getLogger(__name__).exception("No se pudo recuperar jobs huérfanos al arrancar")


def _outbox_worker_loop() -> None:
    from app.db.session import SessionLocal
    from app.services.notification_service import process_due_outbox

    interval = max(5, settings.outbox_worker_interval_seconds)
    while True:
        try:
            with SessionLocal() as db:
                process_due_outbox(db)
                db.commit()
        except Exception:  # noqa: BLE001
            logger.exception("outbox_worker_error")
        time.sleep(interval)


@app.on_event("startup")
def _start_outbox_worker():
    """Worker de reintentos del outbox de notificaciones (F4)."""
    if not settings.notifications_outbox_enabled or not settings.outbox_worker_enabled:
        return
    threading.Thread(target=_outbox_worker_loop, name="notification-outbox", daemon=True).start()


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
