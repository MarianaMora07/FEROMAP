import { ResidentHubSection } from './ResidentHubSection';
import { ResidentLevelBanner } from './ResidentLevelBanner';

export default function ResidentPage() {
  return (
    <div class="space-y-5">
      <div>
        <h1 class="font-heading text-2xl font-bold text-text-primary dark:text-white">
          Mi Recolección
        </h1>
        <p class="mt-1 text-sm text-text-secondary">
          Consulta el horario de paso del camión, el estado de tu sector y los contenedores de tu
          barrio.
        </p>
      </div>

      <ResidentLevelBanner title="Vista ciudadano — solo tu sector">
        <p class="text-sm text-text-secondary">
          Usa «Qué hacer ahora» para saber si hay camión en camino y las acciones rápidas para mapa,
          alertas y puntos de recolección.
        </p>
      </ResidentLevelBanner>

      <ResidentHubSection variant="landing" />
    </div>
  );
}

export { ResidentHubSection };
