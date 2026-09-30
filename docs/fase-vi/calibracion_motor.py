"""
calibracion_motor.py — figura ejecutiva (2 paneles) de la calibración del motor ACO.

Genera 'calibracion_motor.png' a 300 DPI (fondo blanco o transparente).
Panel 1: IC 95 % de las diferencias vs. el estándar y significancia (±δ).
Panel 2: frontera de operación cobertura de puntos vs. consumo de combustible.
"""

from __future__ import annotations

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import seaborn as sns
from matplotlib.lines import Line2D

# --------------------------------------------------------------------------- #
# Paleta y estilo
# --------------------------------------------------------------------------- #
GREEN = "#2E8540"
GREEN2 = "#16A34A"
GRAY = "#8C929D"
ORANGE = "#E67E22"
BLUE = "#2563EB"

INK = "#2B3038"
MUTED = "#5A616B"
GRID = "#D5D9DF"
BAND = "#EAF4EE"          # banda de equivalencia (verde muy suave)

DELTA = 18.09             # umbral de mejora significativa (km)
TRANSPARENT = False       # -> True para PNG con fondo transparente

sns.set_theme(style="white", context="talk")
plt.rcParams.update(
    {
        "font.family": "sans-serif",
        "font.sans-serif": [
            "Inter", "Lato", "Roboto", "Helvetica Neue", "Arial", "DejaVu Sans",
        ],
        "axes.edgecolor": "#C9CFD6",
        "axes.linewidth": 0.9,
        "axes.labelcolor": INK,
        "axes.titleweight": "bold",
        "text.color": INK,
        "xtick.color": MUTED,
        "ytick.color": MUTED,
        "savefig.dpi": 300,
    }
)

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6.6), gridspec_kw={"width_ratios": [1.2, 1]})
fig.patch.set_facecolor("white")
fig.subplots_adjust(left=0.155, right=0.985, top=0.86, bottom=0.12, wspace=0.30)

# =========================================================================== #
# PANEL 1 — Calibración: IC 95 % y significancia
# =========================================================================== #
# (etiqueta, centro, ic_low, ic_high)
rows = [
    ("Beta (β 5 vs 3)",         -87.8, -101.0, -74.5),
    ("Rho (ρ 0,30 vs 0,12)",     -3.5,  -15.2,   8.4),
    ("Iteraciones (40 vs 20)",   -1.2,  -12.0,   9.5),
    ("Recomendada vs Estándar",  -2.4,  -14.3,  19.95),
]

n = len(rows)
ys = np.arange(n)[::-1]          # la primera fila queda arriba
CI_X = 26.0                      # columna fija para las etiquetas del IC

# Banda de equivalencia ±δ y referencia en 0
ax1.axvspan(-DELTA, DELTA, color=BAND, zorder=0)
for x in (-DELTA, DELTA):
    ax1.axvline(x, color=GREEN, ls="--", lw=1.3, alpha=0.75, zorder=1)
ax1.axvline(0, color=INK, lw=1.5, zorder=1)

for y, (label, c, lo, hi) in zip(ys, rows):
    if hi < -DELTA:                     # mejora material
        color = GREEN
    elif lo > -DELTA and hi < DELTA:    # equivalente / inerte
        color = GRAY
    else:                               # no concluyente (cruza 0)
        color = ORANGE
    is_key = label.startswith("Recomendada")

    ax1.errorbar(
        c, y, xerr=[[c - lo], [hi - c]],
        fmt="o", markersize=13 if is_key else 10,
        color=color, ecolor=color, elinewidth=3.0,
        capsize=7, capthick=2.4, zorder=4,
        markeredgecolor="white" if is_key else color, markeredgewidth=2.0,
    )
    ax1.text(
        CI_X, y, f"[{lo:g} ; {hi:g}]",
        va="center", ha="left", fontsize=11,
        color=color if is_key else MUTED,
        fontweight="bold" if is_key else "normal",
    )

ax1.set_yticks(ys)
ax1.set_yticklabels([r[0] for r in rows], fontsize=13.5, color=INK)
ax1.set_xlim(-118, 82)
ax1.set_ylim(-0.7, 4.15)
ax1.set_xlabel("Diferencia de distancia vs. Estándar  (km)", fontsize=13)
ax1.set_title("Calibración: Intervalos de Confianza (IC 95 %) y Significancia",
              fontsize=13, color=INK, pad=14)
ax1.grid(axis="x", ls="--", alpha=0.4, color=GRID)
ax1.set_axisbelow(True)
sns.despine(ax=ax1)

ax1.text(0, 3.42, "±δ = 18,09 km", ha="center", va="bottom",
         fontsize=11, color=GREEN, style="italic")

handles = [
    Line2D([0], [0], marker="o", color=GREEN, lw=0, ms=10, label="Mejora material"),
    Line2D([0], [0], marker="o", color=GRAY, lw=0, ms=10, label="Equivalente / inerte"),
    Line2D([0], [0], marker="o", color=ORANGE, lw=0, ms=10, label="No concluyente (cruza 0)"),
]
ax1.legend(handles=handles, loc="lower left", frameon=False, fontsize=10.5)

# =========================================================================== #
# PANEL 2 — Frontera de operación: cobertura vs combustible
# =========================================================================== #
FUEL_BUDGET = 450  # presupuesto de combustible (L)

# Frontera de compromisos alcanzables
cov_front = np.array([82.0, 86.0, 90.0, 94.0, 97.0, 100.0])
fuel_front = np.array([374.0, 381.0, 388.0, 396.0, 402.0, 409.0])

# Punto seleccionado (extremo de la frontera) y línea base estática
cov_sel, fuel_sel = 100.0, 409.0
cov_base, fuel_base = 100.0, 636.0

# Puntos subóptimos / no viables
cov_bad = np.array([88.0, 95.0, 100.0])
fuel_bad = np.array([452.0, 458.0, 520.0])

ax2.axhspan(FUEL_BUDGET, 760, color=ORANGE, alpha=0.06, zorder=0)
ax2.axhline(FUEL_BUDGET, color=ORANGE, ls="--", lw=1.3, alpha=0.85, zorder=1)
ax2.axvline(100, color=GRAY, ls=":", lw=1.2, alpha=0.8, zorder=1)

ax2.plot(cov_front, fuel_front, "-", color=GRAY, lw=2, alpha=0.7, zorder=2)
ax2.scatter(cov_front, fuel_front, s=90, color=GRAY, zorder=3,
            edgecolor="white", linewidth=1.2, label="Frontera de operación")
ax2.scatter(cov_bad, fuel_bad, s=120, marker="X", color=ORANGE, zorder=4,
            edgecolor="white", linewidth=1.0, label="Subóptimos / no viables")
ax2.scatter([cov_base], [fuel_base], s=200, marker="D", color=ORANGE, zorder=4,
            edgecolor="white", linewidth=1.2, label="Línea base estática")
ax2.scatter([cov_sel], [fuel_sel], s=460, marker="*", color=GREEN2, zorder=5,
            edgecolor="white", linewidth=1.4, label="Punto seleccionado (IA)")

ax2.annotate("100 % cobertura\ncombustible controlado",
             (cov_sel, fuel_sel), xytext=(-20, 10), textcoords="offset points",
             ha="right", va="center", fontsize=10.5, color=GREEN, fontweight="bold")
ax2.text(78.2, FUEL_BUDGET + 12, "Presupuesto de combustible",
         fontsize=10.5, color=ORANGE, style="italic")

ax2.set_xlim(77.5, 105)
ax2.set_ylim(340, 760)
ax2.set_xlabel("Cobertura de puntos  (%)", fontsize=13)
ax2.set_ylabel("Consumo de combustible  (L)", fontsize=13)
ax2.set_title("Frontera de Operación: Cobertura vs Combustible",
              fontsize=13, color=INK, pad=14)
ax2.grid(ls="--", alpha=0.4, color=GRID)
ax2.set_axisbelow(True)
sns.despine(ax=ax2)
ax2.legend(loc="upper left", frameon=False, fontsize=10)

fig.savefig(
    "calibracion_motor.png",
    dpi=300,
    facecolor="white",
    transparent=TRANSPARENT,
    bbox_inches="tight",
)
print("OK: calibracion_motor.png")
