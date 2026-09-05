# Evidencia — Comparación entre familias de algoritmos (Tarea 6)

> Fase 3 · Justificación cuantitativa de la elección de ACO.
> Sección complementaria de [evidencia-aco.md](evidencia-aco.md).

## Propósito

El benchmark ACO existente comparaba **perfiles del propio ACO** (rápido/estándar/preciso),
no la familia ACO contra otras metaheurísticas. Esta evidencia compara tres familias sobre
las **mismas instancias controladas**:

| Familia | Configuración |
|---------|---------------|
| ACO (Ant System + 2-opt) | 12 hormigas × 20 iteraciones (perfil estándar) |
| Clarke-Wright (ahorros) | determinista |
| Algoritmo Genético básico | 34 individuos × 70 generaciones (semilla reproducible) |

## Metodología

- **Instancias controladas** generadas de forma sintética y determinista (semillas fijas):
  coordenadas euclidianas × factor de red vial (1.3) en la extensión de la parroquia Unare,
  demanda uniforme por contenedor, un vehículo con holgura de capacidad (CVRP puro, sin
  recarga intermedia).
- Tamaños: 15 / 30 / 60 contenedores. Escenarios: normal, lluvia y tráfico pico (afectan
  solo los tiempos de viaje; la distancia objetivo no cambia).
- El vertedero se ubica en el depósito porque el ACO modela la descarga de fin de jornada
  como parte de su recorrido; así ninguna familia recibe penalización artificial.

> ⚠️ Advertencia: **no son rutas históricas**. La comparación sirve para justificar la
> elección del algoritmo sobre el mismo problema, no para medir ahorros operativos reales
> (eso corresponde a la comparativa IA vs línea base sintética del historial).

## Resultados (generados el `generatedAt` del archivo)

Archivo de evidencia: `data/cache/benchmarks/algorithms_latest.json`.

| Tamaño | ACO (km) | Clarke-Wright (km) | GA (km) |
|--------|----------|--------------------|---------|
| 15     | 23.6     | 36.6               | 27.4    |
| 30     | 31.9     | 104.1              | 55.0    |
| 60     | 46.1     | 113.5              | 142.1   |

Patrón esperado (varía con la semilla): el ACO encuentra la mejor solución en todos los
tamaños; el GA supera a Clarke-Wright en instancias pequeñas/medianas pero con más costo
de CPU; Clarke-Wright es casi instantáneo (heurística constructiva).

## Cómo reproducir

- API: `POST /api/v1/benchmarks/algorithms` → `GET /api/v1/benchmarks/algorithms`.
- UI: `/demostracion` → pestaña Convergencia → "ACO vs otras familias" (botón *Regenerar comparación*).
- Los tiempos de CPU se miden en el servidor y varían por máquina.

## Notas de límites (actualiza "límites del solver")

- El GA es una implementación mínima (OX + mutación por intercambio, sin búsqueda local);
  un GA con 2-opt local mejoraría su calidad a costa de más CPU.
- Las instancias son de un solo vehículo; el caso operativo real multi-vehículo con
  recargas al vertedero se evalúa en la simulación de tesis (escenarios), no aquí.
