import { ResidentHubSection } from './ResidentHubSection';
import { ResidentLevelBanner } from './ResidentLevelBanner';

export default function ResidentPage() {
  return (
    <div class="space-y-4">
      <div class="fero-rise">
        <p class="text-xs font-semibold uppercase tracking-wide text-fero-blue">Mi zona</p>
        <p class="mt-1 text-sm text-text-secondary">
          Horario, camión y estado de contenedores de tu sector — consulta ciudadana.
        </p>
      </div>

      <div class="fero-rise fero-rise-delay-1">
        <ResidentLevelBanner title="Vista ciudadano — solo tu sector" />
      </div>

      <ResidentHubSection variant="landing" />
    </div>
  );
}

export { ResidentHubSection };
