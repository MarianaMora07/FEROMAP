import { ThesisEvidenceSection } from './ThesisEvidenceSection';

/**
 * Evidencias de la evaluación (`/evidence`).
 *
 * Página propia —hermana de Configuración en el sidebar— para las tres tablas del capítulo
 * de resultados: comparativa base vs optimizado, validación estadística (Wilcoxon) y casos
 * de estudio. Lee la caché JSON que comparten las recetas `just` y permite regenerarla.
 */
export default function EvidencePage() {
  return (
    <div class="space-y-4" data-testid="evidence-page">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200">
          Evaluación
        </p>
        <h1 id="page-title" class="font-heading text-2xl font-bold text-text-primary dark:text-white">
          Evidencias
        </h1>
        <p class="mt-1 text-sm text-text-secondary">
          Comparativa base vs optimizado y validación estadística del capítulo de resultados.
        </p>
      </div>

      <ThesisEvidenceSection />
    </div>
  );
}
