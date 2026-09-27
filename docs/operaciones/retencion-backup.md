# Retención y backup — FEROMAP

**Fase:** F5 (P5a) — ejecución y datos
**Fecha:** 2026-09-11

## Alcance

Este documento define **qué se respalda, cada cuánto y por cuánto tiempo** se conserva en
FEROMAP. Aplica al stack de PostgreSQL + PostGIS (`feromap-db`).

| Recurso | ¿Se respalda? | Cómo |
|---|---|---|
| Base de datos PostgreSQL/PostGIS | ✅ Sí | `just backup` (`pg_dump -Fc`) |
| `data/seeds/*.json` | ✅ En git | Versionado (fuente de verdad de datos semilla) |
| `data/uploads/` (avatares) | ⚠️ Manual | Copia de directorio; no entra en el dump |
| `data/cache/` (grafo OSM, matrices) | ❌ No | Regenerable; se recalienta al vuelo |
| Capturas/imágenes de tesis | ❌ No | Fuera de la operación |

## Comandos

```bash
just backup                 # crea backups/feromap-YYYYmmdd-HHMMSS.dump
just restore backups/feromap-YYYYmmdd-HHMMSS.dump
```

- Los backups viven en `backups/` (ignorado por git).
- `BACKUP_KEEP` (por defecto **14**) controla cuántas copias se conservan; las más antiguas
  se borran automáticamente.
- La restauración usa `pg_restore --clean --if-exists`, por lo que **reemplaza** el contenido
  actual de la base.

## Política de retención recomendada

| Entorno | Frecuencia | Retención | Notas |
|---|---|---|---|
| Desarrollo / defensa local | Antes de cada demo o migración | 14 copias (~2 semanas) | Suficiente para revertir un seed o migración |
| Producción (post-defensa) | Diario | 30 días | Sumar copia semanal externa (otro disco/nube) |
| Antes de cambios de esquema | Obligatorio | Hasta validar la migración | Permite `downgrade` seguro |

## Procedimiento operativo

1. **Antes de migrar o sembrar**: `just backup`.
2. **Regresión**: si algo falla, `just restore backups/<archivo>.dump` y volver a la versión
   de código correspondiente.
3. **Verificación**: la restauración debe reproducir el estado. Para comprobarlo:
   ```bash
   just backup
   just restore backups/<archivo>.dump
   just defense-verify
   ```

## Limitaciones conocidas

- El dump **no incluye** `data/uploads/` ni `data/cache/`. Documenta y copia esos directorios
  por separado si necesitas fidelidad total.
- `pg_restore --clean` puede requerir cerrar conexiones activas del API durante la restauración.
- No hay backup automático programado en el repo; en producción se recomienda un `cron`/tarea
  externa que ejecute `just backup` (ver tabla de frecuencia).
