# Fase VI — Resultados de la evaluación (comparativa y validación estadística)

> Constancia de los números con los que se completa la sección de evaluación del Capítulo V.
> **Actualizado tras recargar la instancia:** `just db-reset` → 65 sectores / 100.000 hab.
> Fecha de la corrida: 2026-09-22 (stack en marcha, caché de matrices en caliente).

## 0. Instancia vigente

Tras el recargado, la base de datos **coincide con `data/seeds/*.json`**:

| Entidad | Valor |
|---|---|
| Sectores | **65** |
| Población | **100.000 hab** |
| Puntos de recolección | **300** |
| Generación diaria | **65.495 kg/día** (≈65,5 t) |
| Flota | 24 (17 volteo + 7 compactadora), 0,35 L/km |
| Grafo vial en caché | 2.363 nodos / 5.467 aristas |
| Validaciones estadísticas | 0 (se borran al sembrar) |

## 1. Resultado clave: las métricas de ruteo son **invariantes** al recargado

La demanda que alimenta al optimizador proviene del **llenado actual de cada punto** (`current_fill_level_kg`), que no cambió con la reescritura de sectores (los 300 puntos conservan sus coordenadas, capacidad y porcentaje de llenado). Por eso las corridas reproducen **exactamente** las distancias, el ahorro, el combustible, el CO₂, la cobertura, los viajes al vertedero y los indicadores de flota y equidad.

Lo único que cambia es el **rebose**, que sí depende de la tasa de generación (población × per cápita) y por tanto de la instancia.

## 2. Comandos ejecutados

```bash
just backup                 # respaldo previo (backups/feromap-20260922-235809.dump)
just db-reset               # down-volumes → up → migrate (001→035) → seed
just phase0-baseline        # comparativa (3 escenarios), no escribe BD
# Comparativa completa de 5 escenarios: ver §3
# Validación estadística: NO re-ejecutada (ver §5)
```

## 3. Resultados por escenario (diseño pareado, perfil 12 hormigas × 20 iteraciones)

| Escenario | Dist. base | Dist. opt | Ahorro | Dur. base | Dur. opt | Fuel base | Fuel opt | CO₂ evitado | Cobertura | Críticos | No cubiertos | Viajes vertedero | Cómputo (s) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| normal | 1808,7 | 1076,0 | **40,5 %** | 156,85 | 144,59 | 633,0 | 376,6 | 687,2 | 100 % | 100 % | 0 | 43 | 5,5 |
| peak_traffic | 1851,4 | 1148,3 | **38,0 %** | 163,61 | 147,94 | 648,0 | 401,9 | 659,6 | 100 % | 100 % | 0 | 45 | 5,9 |
| rain | 1795,0 | 1121,1 | **37,5 %** | 158,78 | 147,10 | 628,2 | 392,4 | 632,1 | 100 % | 100 % | 0 | 46 | 5,5 |
| saturated | 1973,4 | 1250,6 | **36,6 %** | 165,93 | 152,27 | 690,7 | 437,7 | 678,0 | 100 % | 100 % | 0 | 50 | 6,1 |
| broken_vehicle | 1823,8 | 1148,9 | **37,0 %** | 159,91 | 147,37 | 638,3 | 402,1 | 633,0 | 100 % | 100 % | 0 | 44 | 5,5 |

Rangos: ahorro **36,6 % – 40,5 %**; combustible optimizado **376,6 – 437,7 L**; CO₂ evitado **632,1 – 687,2 kg**; cómputo **5,5 – 6,1 s** (caché en caliente; la corrida anterior, con matriz fría en dos escenarios, marcaba hasta 17,6 s).

### 3.1 Flota, jornada y equidad (escenario normal)

| Indicador | Valor |
|---|---|
| Vehículos activos | 13 de 24 |
| Utilización de flota | 54,2 % |
| Ruta más larga (máx. horas) | 11,96 h |
| Holgura de jornada | 0,04 h |
| Desviación de carga (σ_h) | 2,11 h |
| Índice de equidad | 0,81 |

Todas las corridas cierran dentro de la jornada de **12 h** (100 %). Con jornada objetivo de 8 h, `finishUnderTargetPct` = **7,7 %**.

### 3.2 Rebose proyectado (valores de la instancia de 65 sectores)

El rebose **no** se reduce con la optimización; se reporta como KPI y no forma parte de la función objetivo (peso 0).

| Escenario | Rebose base (kg) | Rebose opt. (kg) |
|---|---|---|
| normal | 3774,8 | 3890,7 |
| peak_traffic | 4036,1 | 3682,0 |
| rain | 3773,1 | 3680,4 |
| saturated | 3561,1 | 4398,4 |
| broken_vehicle | 3748,7 | 3885,8 |

## 4. Validación estadística (Wilcoxon pareada, escenario normal, N = 30)

Las distancias son idénticas a las de la corrida previa, así que el resultado **se mantiene**:

| Métrica | Valor |
|---|---|
| Media base | 1808,7 km |
| Media optimizada | 1063,3 km |
| Ahorro medio | **41,2 %** |
| Desviación estándar (optimizada) | 13,24 |
| Estadístico W | **465,0** |
| p-valor (una cola) | **5,47 × 10⁻⁷** |
| IC 95 % de la diferencia (bootstrap) | **[740,6 ; 749,8]** km |
| ¿Significativo (α = 0,05)? | **Sí** |

Tamaño del efecto (no lo reporta la suite; calculado sobre las 30 corridas pareadas): correlación rangos-biserial **r = 1,00** y d de Cohen pareada **d_z = 56,29**.

## 5. Pendientes y advertencias

1. **La tabla `statistical_validations` quedó vacía** tras el recargado. El resultado de §4 sigue siendo válido (misma instancia de ruteo) y su snapshot está en `docs/evidencia/instancia-final/validacion-wilcoxon-normal.json`, pero si se necesita la fila en la BD hay que re-ejecutar la validación (≈15 min) o aprobar/revisar desde la interfaz. **No se re-ejecutó por decisión del usuario.**
2. **Solo estaba validado `normal`.** Para significancia por escenario faltarían `rain`, `saturated`, `peak_traffic` y `broken_vehicle`.
3. **FIGURA 5.2 (tasa de desborde)** sigue sin artefacto que la produzca.
4. **El escenario de avería** aquí es la corrida de `broken_vehicle`; la re-optimización reactiva se prueba en el flujo de contingencias.
5. **Los seeds de 65 sectores siguen sin commitear**: desde un clon limpio, `db-reset` produciría la versión de 91.
