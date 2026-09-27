# Textos didácticos — Fases de ejecución

Copy para UI del paso 2 y para el guion de defensa. Fuente única en código: `EXECUTION_PHASES` en `executionPhases.ts`.

---

## 1. Preparando (`preparando`)

| Campo | Texto |
|-------|-------|
| **Qué hace la IA** | Recopila el escenario activo, la flota disponible y los puntos de recolección que entrarán al cálculo. |
| **Por qué importa** | Garantiza que la simulación use datos coherentes con las condiciones que elegiste (lluvia, avería, saturación, etc.). |

---

## 2. Grafo vial (`grafo_vial`)

| Campo | Texto |
|-------|-------|
| **Qué hace la IA** | Carga la red de calles de la parroquia Unare (grafo OSM) donde circularán los camiones. |
| **Por qué importa** | Las rutas se calculan sobre vías reales, no en línea recta; esto hace comparables distancia y tiempo. |

---

## 3. Matriz de costos (`matriz_costos`)

| Campo | Texto |
|-------|-------|
| **Qué hace la IA** | Calcula distancias y tiempos entre cada par de puntos usando el camino más corto en la red vial. |
| **Por qué importa** | Es la base numérica del problema: sin costos fiables, el optimizador no puede elegir rutas eficientes. |

---

## 4. Instancia VRP (`instancia_vrp`)

| Campo | Texto |
|-------|-------|
| **Qué hace la IA** | Arma el problema de rutas con vehículos (capacidad, conductor) y demanda por contenedor (nivel de llenado). |
| **Por qué importa** | Traduce la operación municipal a un modelo matemático resoluble: quién recoge qué y con qué límites. |

---

## 5. Optimización ACO (`aco`)

| Campo | Texto |
|-------|-------|
| **Qué hace la IA** | Ejecuta la colonia de hormigas (ACO) para explorar combinaciones de rutas y acercarse a la mejor solución global. |
| **Por qué importa** | Es el núcleo de la tesis: la metaheurística que reduce distancia, tiempo y combustible frente a la ruta actual. |

---

## 6. Refinamiento 2-opt (`refinamiento_2opt`)

| Campo | Texto |
|-------|-------|
| **Qué hace la IA** | Mejora localmente cada ruta intercambiando tramos (2-opt) para eliminar zigzags innecesarios. |
| **Por qué importa** | ACO encuentra buenas rutas; el refinamiento las pule antes de mostrarlas al planificador. |

---

## 7. Persistencia (`persistencia`)

| Campo | Texto |
|-------|-------|
| **Qué hace la IA** | Guarda la simulación, las rutas optimizadas y los waypoints en la base de datos y genera el GeoJSON del mapa. |
| **Por qué importa** | Permite historial, comparación con corridas anteriores y enlaces a analítica y reportes. |

---

## 8. Listo (`listo`)

| Campo | Texto |
|-------|-------|
| **Qué hace la IA** | Entrega los KPIs finales (distancia, tiempo, combustible, cobertura crítica) y las rutas para visualización. |
| **Por qué importa** | Cierra el ciclo de evaluación: puedes medir el impacto del algoritmo y decidir el siguiente paso operativo. |

---

## Mensajes auxiliares (cancelación y error)

| Situación | Texto UI |
|-----------|----------|
| Cancelar en curso | «Cancelando ejecución…» |
| Cancelado | «Ejecución cancelada. Ajusta el escenario y vuelve a intentar cuando quieras.» |
| Error genérico | «No se pudo completar la optimización. Revisa los recursos del sistema e inténtalo de nuevo.» |

---

## Uso en defensa (10 segundos)

Frase guía para el evaluador:

> «La barra lateral muestra las **8 etapas del motor**: desde cargar el mapa de calles hasta guardar la ruta optimizada. El mapa anima **qué está explorando la IA** en cada momento, y puedes **cancelar** si necesitas cambiar el escenario.»
