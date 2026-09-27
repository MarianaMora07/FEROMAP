# Fase 6 — Validación, demo y documentación de tesis

**Estado:** completado  
**Fecha:** 2026-08-08

## Entregables

| Entregable | Ubicación |
|------------|-----------|
| Script de demo de defensa (5–7 min) | [guion-demo-defensa.md](./guion-demo-defensa.md) |
| Checklist Fase 0 completado | [checklist-aceptacion-defensa.md](../fase-0/checklist-aceptacion-defensa.md) |
| Manual de usuario | [manual-usuario.md](./manual-usuario.md) |
| Diagrama navegación Opción A | [diagrama-navegacion-opcion-a.md](./diagrama-navegacion-opcion-a.md) |
| Informe usabilidad | [informe-prueba-usabilidad.md](./informe-prueba-usabilidad.md) |
| Evidencias implementación | [evidencias-implementacion.md](./evidencias-implementacion.md) |

## Verificación técnica

```bash
just defense-verify   # ✅ ejecutado 2026-08-08 (dev)
```

Correcciones aplicadas durante validación:
- Import `fill_level_pct` en `optimization_service.py`
- Import `active_routes_view` en `dashboard_service.py`

## Criterio de cierre

La demo se puede hacer **sin explicar «por qué hay dos pantallas parecidas»**: banners, menú y matriz de responsabilidades (Fase 5) orientan al evaluador.

## Ensayo recomendado

1. Leer [guion-demo-defensa.md](./guion-demo-defensa.md)
2. Cronometrar una corrida completa
3. Tomar capturas listadas en [evidencias-implementacion.md](./evidencias-implementacion.md)
4. (Opcional) Repetir protocolo de [informe-prueba-usabilidad.md](./informe-prueba-usabilidad.md) con 1–2 personas
