# Unare IA — Prototipo Frontend

Prototipo de demostración para el **Sistema Basado en Inteligencia Artificial para la Optimización Dinámica de Rutas de Recolección de Desechos** en la parroquia Unare, Ciudad Guayana (trabajo de grado UNEXPO 2025–2026).

## Stack

- **SolidJS** + **TypeScript** + **Vite**
- **Tailwind CSS v4**
- **MapLibre GL** + **Turf.js** (visualización GIS)
- **@solidjs/router** (navegación)
- **Kobalte** (componentes accesibles)
- **Chart.js** + **solid-chartjs** (KPIs)
- **lucide-solid** (iconos)

## Inicio rápido

```bash
npm install
npm run dev
```

Abrir [http://localhost:5173](http://localhost:5173)

## Flujo de demostración (defensa de grado)

1. **Mapa** (`/`) — Visualizar sectores de Unare, contenedores con código de color por llenado, y ruta actual (gris discontinua).
2. Revisar el panel **Resumen operativo** con contenedores críticos (>80% llenado).
3. **Simulación** (`/simulation`) — Seleccionar escenario (ej. *Tráfico pico*) y pulsar **Optimizar rutas con IA**.
4. Volver al **Mapa** — Activar capa *Ruta IA* (azul) y comparar con la ruta estática.
5. **Dashboard** (`/dashboard`) — Mostrar KPIs: distancia, tiempo, combustible, CO₂ evitadas y gráficos comparativos.

## Vistas

| Ruta | Descripción |
|------|-------------|
| `/` | Mapa interactivo con capas GeoJSON, popups y controles |
| `/dashboard` | Indicadores de rendimiento (KPIs) y gráficos |
| `/simulation` | Escenarios mock + simulación del motor IA (ACO/VRP) |

## Datos

Todos los datos son **simulados** (mock): 20 contenedores, 8 sectores, rutas precalculadas y KPIs por escenario. No requiere backend.

Coordenadas base: `[-62.715, 8.295]` (Parroquia Unare, Puerto Ordaz).

## Scripts

```bash
npm run dev      # Servidor de desarrollo
npm run build    # Build de producción
npm run preview  # Vista previa del build
```

## Estructura

```
src/
├── components/   # UI, mapa, dashboard
├── data/mock/    # Contenedores, sectores, rutas, KPIs
├── pages/        # MapPage, DashboardPage, SimulationPage
├── stores/       # Estado global (capas, simulación)
└── types/        # Tipos TypeScript
```

## Autores

Victor Astudillo · Mariana Mora — Ingeniería en Informática, UNEXPO Puerto Ordaz
