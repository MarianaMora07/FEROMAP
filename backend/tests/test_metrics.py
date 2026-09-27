"""Tests de métricas Prometheus mínimas (F3)."""

from __future__ import annotations

from types import SimpleNamespace

from app.core import metrics
from app.services import optimization_job_service as jobs


def setup_function():
    metrics._requests_total.clear()
    metrics._latency_buckets.clear()
    metrics._latency_sum.clear()
    metrics._latency_count.clear()
    metrics._frontend_errors.clear()
    jobs._jobs.clear()


def test_normalize_path_collapses_ids():
    assert metrics.normalize_path("/api/v1/collection-points/12") == "/api/v1/collection-points/{id}"
    assert (
        metrics.normalize_path("/api/v1/planning/daily/2026-09-11")
        == "/api/v1/planning/daily/2026-09-11"
    )


def test_observe_request_records_status_and_latency():
    metrics.observe_request("GET", "/api/v1/sectors", 200, 0.12)
    metrics.observe_request("GET", "/api/v1/sectors", 500, 1.2)

    text = metrics.render_metrics()

    assert 'feromap_http_requests_total{method="GET",path="/api/v1/sectors",status="200"} 1' in text
    assert 'feromap_http_requests_total{method="GET",path="/api/v1/sectors",status="500"} 1' in text
    assert (
        'feromap_http_request_duration_seconds_count{method="GET",path="/api/v1/sectors"} 2' in text
    )
    assert (
        'feromap_http_request_duration_seconds_bucket{method="GET",path="/api/v1/sectors",le="+Inf"} 2'
        in text
    )


def test_render_includes_job_gauges_and_queue():
    jobs._jobs["j1"] = SimpleNamespace(status="running")
    jobs._jobs["j2"] = SimpleNamespace(status="pending")
    jobs._jobs["j3"] = SimpleNamespace(status="pending")

    text = metrics.render_metrics()

    assert 'feromap_optimization_jobs{status="running"} 1' in text
    assert 'feromap_optimization_jobs{status="pending"} 2' in text
    assert "feromap_optimization_queue 2" in text


def test_frontend_error_counter():
    metrics.record_frontend_error("api")

    assert 'feromap_frontend_errors_total{kind="api"} 1' in metrics.render_metrics()
