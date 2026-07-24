import { Show, createSignal } from 'solid-js';
import { LogIn, Eye, EyeOff } from 'lucide-solid';
import { Button } from '../../design-system/components';

export default function LoginPage() {
  const [showPassword, setShowPassword] = createSignal(false);

  return (
    <div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-sidebar to-fero-blue-dark p-4">
      <div class="w-full max-w-md">
        <div class="mb-8 text-center">
          <img
            src="/feromap-logo.png"
            alt="FEROMAP"
            class="mx-auto h-16 w-16 object-contain mb-4"
          />
          <h1 class="font-heading text-3xl font-bold text-white tracking-tight">FEROMAP</h1>
          <p class="text-sm text-white/50 mt-1">Sistema de Optimización de Rutas</p>
        </div>

        <div class="rounded-[var(--radius-xl)] bg-white p-8 shadow-xl dark:bg-dark-surface">
          <h2 class="font-heading text-xl font-bold text-text-primary dark:text-white mb-1">Iniciar sesión</h2>
          <p class="text-sm text-text-muted mb-6">Ingrese sus credenciales para acceder</p>

          <form class="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label class="block text-sm font-medium text-text-secondary mb-1.5">Correo electrónico</label>
              <input
                type="email"
                placeholder="usuario@feromap.com"
                class="w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-fero-blue focus:outline-none focus:ring-2 focus:ring-fero-blue/20 dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-text-secondary mb-1.5">Contraseña</label>
              <div class="relative">
                <input
                  type={showPassword() ? 'text' : 'password'}
                  placeholder="••••••••"
                  class="w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 py-2.5 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:border-fero-blue focus:outline-none focus:ring-2 focus:ring-fero-blue/20 dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                >
                  <Show when={showPassword()} fallback={<EyeOff size={16} />}>
                    <Eye size={16} />
                  </Show>
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between text-sm">
              <label class="flex items-center gap-2 text-text-secondary">
                <input type="checkbox" class="rounded border-border accent-fero-green-mid" />
                Recordarme
              </label>
              <a href="#" class="text-fero-blue hover:underline">¿Olvidó su contraseña?</a>
            </div>

            <Button type="submit" variant="primary" class="w-full" icon={<LogIn size={16} />}>
              Iniciar sesión
            </Button>
          </form>
        </div>

        <p class="text-center text-xs text-white/30 mt-6">
          © 2026 FEROMAP · Parroquia Unare, Ciudad Guayana
        </p>
      </div>
    </div>
  );
}
