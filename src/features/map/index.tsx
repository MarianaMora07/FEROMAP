import { MapPin } from 'lucide-solid';

export default function MapPage() {
  return (
    <div class="relative h-full w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="text-center text-text-muted">
          <div class="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-fero-blue/10">
            <MapPin size={36} class="text-fero-blue" />
          </div>
          <p class="font-heading text-xl font-bold text-text-primary dark:text-white">Mapa GIS Fullscreen</p>
          <p class="text-sm mt-2 max-w-md">
            Mapa interactivo con contenedores, sectores y rutas de recolección.
            Integra MapLibre GL con capas vectoriales y datos en tiempo real.
          </p>
        </div>
      </div>
    </div>
  );
}
