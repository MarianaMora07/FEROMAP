# Diagrama de navegación final — Opción A

**Estado:** vigente tras Fases 1–5  
**Fecha:** 2026-08-08

## Vista general

```mermaid
flowchart TB
    subgraph auth [Autenticación]
        LOGIN["/login"]
    end

    subgraph hub [Hub]
        DASH["/ — Dashboard<br/>CTA: Nueva simulación"]
    end

    subgraph tesis [Flujo principal — Simulación de escenarios]
        SIM["/simulation"]
        SIM_FLOW["Flujo: Configuración → Ejecución → Resultados"]
        SIM_HIST["/simulation?view=history<br/>Historial de tesis"]
        SIM_WEEK["/simulation?view=weekly<br/>Plan semanal (directivo)"]
        SIM --> SIM_FLOW
        SIM --> SIM_HIST
        SIM --> SIM_WEEK
    end

    subgraph evidencia [Seguimiento post-simulación]
        MAP["/map"]
        ANA["/analytics?simulationId="]
        REP["/reports?simulationId="]
    end

    subgraph operacion [Planificación operativa — secundario]
        OPT["/optimization<br/>Fecha · restricciones · despacho"]
        OPT_HIST["Historial operativo<br/>(solo corridas desde /optimization)"]
        OPT --> OPT_HIST
    end

    subgraph soporte [Contexto operativo]
        VEH["/vehicles"]
        PTS["/collection-points"]
        MON["/monitoring"]
    end

    LOGIN --> DASH
    DASH -->|"CTA primario"| SIM
    DASH -->|"CTA secundario"| OPT
    DASH -->|"Última simulación"| SIM

    SIM_FLOW -->|"Paso 3: acciones"| MAP
    SIM_FLOW --> ANA
    SIM_FLOW --> REP
    SIM_FLOW -.->|"Enlace despacho"| OPT

    SIM -.->|"banner"| OPT
    OPT -.->|"banner"| SIM

    VEH -.->|"Nueva simulación"| SIM
    PTS -.->|"puntos críticos"| SIM
    OPT --> MON
```

## Leyenda de responsabilidades

| Color / grupo | Módulo | Propósito |
|---------------|--------|-----------|
| **tesis** | Simulación | Evaluar escenarios y desempeño del algoritmo |
| **evidencia** | Mapa, Analítica, Reportes | Continuar análisis tras una corrida |
| **operacion** | Planificación operativa | Rutas del día y despacho |
| **soporte** | Vehículos, Puntos, Monitoreo | Datos maestros y seguimiento |

## Deep links

| URL | Efecto |
|-----|--------|
| `/simulation?simulationId={id}` | Abre resultados de una simulación |
| `/simulation?view=history` | Pestaña Historial (tesis) |
| `/simulation?view=weekly` | Pestaña Plan semanal (directivo) |
| `/optimization?date=YYYY-MM-DD` | Plan del día administrativo |
| `/analytics?simulationId={id}` | Analítica con banner de contexto |
| `/reports?simulationId={id}` | Reportes con banner de contexto |

## Menú lateral (planificador)

1. Dashboard  
2. **Simulación de escenarios** ← principal  
3. Mapa GIS, Vehículos, Puntos…  
4. — *Operación* —  
5. **Planificación operativa** ← secundario  
6. — *Resultados* —  
7. Reportes, Analítica  

Ver también: [reglas-navegacion.md](../fase-5/reglas-navegacion.md), [matriz-responsabilidades-modulos.md](../fase-5/matriz-responsabilidades-modulos.md).
