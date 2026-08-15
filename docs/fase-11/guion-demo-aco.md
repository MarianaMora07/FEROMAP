# Guión — Demostración ACO (laberinto didáctico)

**Audiencia:** tribunal, visitantes técnicos, planificadores curiosos  
**Rol demo:** Planificador (`plan@fero.com` / `123456789`)  
**Ruta:** `/demostracion`  
**Duración lectura del panel:** ~2–3 minutos (antes del laberinto interactivo)

---

## Mensaje clave (~20 s)

> «Antes de ver rutas en el mapa real, esta pantalla explica **cómo piensa el algoritmo**: hormigas que prueban caminos, feromonas que marcan lo bueno y evaporación para no quedarse en rutas mediocres. El laberinto (fases siguientes) animará exactamente esto.»

---

## Secuencia recomendada (panel Concepto — Fase 11.1)

| Paso | Sección UI | Qué decir |
|------|------------|-----------|
| 1 | Banner verde | «Esto es didáctica, no la simulación de tesis ni el despacho del día.» |
| 2 | Intro + flujo 5 pasos | «Inicio y meta → N hormigas → mejor ruta → actualizar feromonas → repetir hasta converger.» |
| 3 | **El problema** | «En producción optimizamos recolección con camiones, vertedero y turno. El laberinto es el mismo idea sin esas reglas: solo el camino más corto.» |
| 4 | **La hormiga** | «En cada cruce la hormiga no elige al azar: probabilidad según rastro (τ) y cercanía (η). Fórmula P ∝ τ^α · η^β con α=1 y β=3.» |
| 5 | **Las feromonas** | «Cada iteración evaporamos ρ=12% y depositamos en la mejor ruta: τ += 1/costo.» |
| 6 | **La iteración** | «12 hormigas por iteración en producción, en paralelo; si no mejora en 5 iteraciones, puede parar antes.» |
| 7 | Tabla de parámetros | Señalar α, β, ρ, hormigas, iteraciones y perfiles Rápido / Estándar / Preciso. |
| 8 | Enlace a Simulación | «Con el contexto claro, pasamos a escenarios reales en Bucaramanga.» |

---

## Frases de cierre

- «El ACO no garantiza óptimo global, pero converge rápido a rutas muy buenas en redes grandes.»
- «La demostración en laberinto usa el mismo τ, α, β y ρ que el servidor — solo cambia el grafo (grilla vs calles).»

---

## Conexión con defensa completa

Este módulo es **opcional al inicio** del guion de `docs/fase-6/guion-demo-defensa.md`:

1. **Opción A (concepto primero):** `/demostracion` 2 min → `/simulation` paso 2 (ejecución ACO en mapa real).
2. **Opción B (impacto primero):** Simulación completa → si preguntan «¿cómo funciona el algoritmo?» → `/demostracion`.

---

## Evidencia de implementación (Fase 11.1)

| Entregable | Ubicación |
|------------|-----------|
| Panel didáctico | `src/features/demostracion/DemoConceptPanel.tsx` |
| Constantes α, β, ρ | `src/core/demo-aco/demoAcoParams.ts` |
| Página | `src/features/demostracion/index.tsx` |

---

## Próximas fases (no narrar aún en defensa)

- **11.2–11.5:** laberinto canvas, motor cliente, playback de hormigas y feromonas.
- **11.6:** curva de convergencia reutilizando `AcoConvergenceChart`.
