import { OperatorHubSection } from './OperatorHubSection';
import { OperatorLevelBanner } from './OperatorLevelBanner';

export default function OperatorPage() {
  return (
    <div class="space-y-5">
      <div>
        <h1 class="font-heading text-2xl font-bold text-text-primary dark:text-white">Mi operación</h1>
        <p class="mt-1 text-sm text-text-secondary">
          Tu jornada en campo — en 2 clics sabes si tienes ruta activa y cuál es el siguiente paso.
        </p>
      </div>

      <OperatorLevelBanner title="Operación en campo">
        <p class="text-sm text-text-secondary">
          Usa «Qué hacer ahora» para la acción prioritaria y las acciones rápidas para monitoreo, mapa y
          alertas.
        </p>
      </OperatorLevelBanner>

      <OperatorHubSection variant="landing" />
    </div>
  );
}

export { OperatorHubSection };
