"""Métricas Prometheus mínimas, sin dependencias externas.

Expone latencia y conteo por método/path/status, más gauges de jobs ACO y cola.
El formato es el de exposición de texto de Prometheus (``GET /metrics``).
"""

from __future__ import annotations

import re
import threading
from collections import defaultdict

APP_VERSION = "0.2.0"

_LATENCY_BUCKETS = (0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)

_lock = threading.Lock()
_requests_total: dict[tuple[str, str, int], int] = defaultdict(int)
_latency_buckets: dict[tuple[str, str], list[int]] = defaultdict(
    lambda: [0] * (len(_LATENCY_BUCKETS) + 1)
)
_latency_sum: dict[tuple[str, str], float] = defaultdict(float)
_latency_count: dict[tuple[str, str], int] = defaultdict(int)
_frontend_errors: dict[str, int] = defaultdict(int)

_UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F-]{20,}$")


def normalize_path(path: str) -> str:
    """Colapsa ids numéricos/UUID a ``{id}`` para acotar la cardinalidad."""
    parts = []
    for segment in path.split("/"):
        if segment.isdigit() or _UUID_RE.match(segment):
            parts.append("{id}")
        else:
            parts.append(segment)
    return "/".join(parts)


def observe_request(method: str, path: str, status: int, duration_seconds: float) -> None:
    key = (method, normalize_path(path))
    with _lock:
        _requests_total[(key[0], key[1], status)] += 1
        buckets = _latency_buckets[key]
        for index, bound in enumerate(_LATENCY_BUCKETS):
            if duration_seconds <= bound:
                buckets[index] += 1
        buckets[-1] += 1  # +Inf
        _latency_sum[key] += duration_seconds
        _latency_count[key] += 1


def record_frontend_error(kind: str) -> None:
    with _lock:
        _frontend_errors[kind] += 1


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _job_gauges() -> tuple[dict[str, int], int]:
    try:
        from app.services.optimization_job_service import count_jobs_by_status

        counts = count_jobs_by_status()
    except Exception:  # noqa: BLE001
        return {}, 0
    queue = counts.get("pending", 0)
    return counts, queue


def render_metrics() -> str:
    lines: list[str] = []

    lines.append("# HELP feromap_http_requests_total Solicitudes HTTP por método, ruta y estado.")
    lines.append("# TYPE feromap_http_requests_total counter")
    for (method, path, status), count in sorted(_requests_total.items()):
        lines.append(
            f'feromap_http_requests_total{{method="{_escape(method)}",'
            f'path="{_escape(path)}",status="{status}"}} {count}'
        )

    lines.append("# HELP feromap_http_request_duration_seconds Latencia de solicitudes HTTP.")
    lines.append("# TYPE feromap_http_request_duration_seconds histogram")
    for (method, path), buckets in sorted(_latency_buckets.items()):
        labels = f'method="{_escape(method)}",path="{_escape(path)}"'
        for index, bound in enumerate(_LATENCY_BUCKETS):
            lines.append(
                f'feromap_http_request_duration_seconds_bucket{{{labels},le="{bound}"}} {buckets[index]}'
            )
        lines.append(
            f'feromap_http_request_duration_seconds_bucket{{{labels},le="+Inf"}} {buckets[-1]}'
        )
        lines.append(
            f"feromap_http_request_duration_seconds_sum{{{labels}}} {_latency_sum[(method, path)]:.6f}"
        )
        lines.append(
            f"feromap_http_request_duration_seconds_count{{{labels}}} {_latency_count[(method, path)]}"
        )

    job_counts, queue = _job_gauges()
    lines.append("# HELP feromap_optimization_jobs Jobs de optimización por estado.")
    lines.append("# TYPE feromap_optimization_jobs gauge")
    for status, count in sorted(job_counts.items()):
        lines.append(f'feromap_optimization_jobs{{status="{_escape(status)}"}} {count}')
    lines.append("# HELP feromap_optimization_queue Jobs de optimización en espera.")
    lines.append("# TYPE feromap_optimization_queue gauge")
    lines.append(f"feromap_optimization_queue {queue}")

    lines.append("# HELP feromap_frontend_errors_total Errores reportados por el frontend.")
    lines.append("# TYPE feromap_frontend_errors_total counter")
    for kind, count in sorted(_frontend_errors.items()):
        lines.append(f'feromap_frontend_errors_total{{kind="{_escape(kind)}"}} {count}')

    lines.append("# HELP feromap_build_info Versión del API.")
    lines.append("# TYPE feromap_build_info gauge")
    lines.append(f'feromap_build_info{{version="{APP_VERSION}"}} 1')

    return "\n".join(lines) + "\n"
