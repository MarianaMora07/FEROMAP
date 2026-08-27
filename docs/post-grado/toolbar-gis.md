# Backlog 5 — Toolbar GIS completo

**Estado:** backlog  
**Esfuerzo:** 6–10 días  
**Prioridad post-grado:** media (valor operativo)

## Objetivo

Completar la **barra de herramientas del mapa operativo** con funciones GIS esperadas en un sistema de gestión de flota: medición, dibujo, capas avanzadas, exportación y anotaciones — sin mezclar con la simulación de tesis.

## Por qué esperar

| Razón | Detalle |
|-------|---------|
| No central en tesis | El capítulo demuestra optimización ACO, no SIG corporativo |
| Valor post-despliegue | Útil para supervisores en operación diaria |
| Dependencias UX | Requiere diseño consistente con MapLibre y permisos por rol |
| Estado actual suficiente | Playback, capas operativas y toggle de rutas cubren la defensa |

## Estado actual del mapa

| Función | Estado |
|---------|--------|
| Capas operativas (rutas, contenedores, sectores) | ✅ |
| Playback animado | ✅ |
| Toggle rutas optimizadas | ✅ (Fase 1) |
| Toolbar medición / dibujo | ❌ oculto o stub |
| Export GeoJSON / PDF mapa | ❌ |
| Edición geometría in situ | ❌ |

Ubicación principal: `src/features/map/`, `src/core/map/operationalMapLayers.ts`

## Alcance propuesto

### MVP toolbar (fase A)

- Medir distancia entre dos puntos
- Medir área de polígono simple
- Activar/desactivar capas desde toolbar (no solo panel lateral)
- Leyenda persistente

### Fase B

- Dibujar polígono de zona temporal (incidente, cierre vial)
- Export PNG / GeoJSON de vista actual
- Snap a contenedor más cercano

### Excluido

- Edición de red vial (OSM upstream)
- Sincronización con QGIS desktop

## Criterios de aceptación

- [ ] Toolbar accesible en `/map` y `/optimization` (vista mapa)
- [ ] Permisos: conductor solo lectura; planificador medición; admin export
- [ ] E2E: medición guarda resultado en panel lateral
- [ ] Sin regresión en `route-playback.spec.ts`
- [ ] Sección en `docs/fase-6/manual-usuario.md`

## Referencias

- `src/features/map/index.tsx` — toolbar parcial
- `docs/fase-5/reglas-navegacion.md` — mapa operativo vs simulación
- MapLibre GL draw plugins (evaluar `@mapbox/mapbox-gl-draw` adaptado)
