import { Show, createSignal, type JSX } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { LogIn, Eye, EyeOff, Mail, Lock, Shield } from 'lucide-solid';
import { Button, TextField } from '../../design-system/components';

const BANNER_SRC = '/login-banner.png';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#00a4ef" d="M12 1h10v10H12z" />
      <path fill="#7fba00" d="M1 12h10v10H1z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  );
}

/** Left panel (desktop): full brand artwork. */
function BrandSide() {
  // Alto mínimo del panel: min-h-160 ≈ 40rem. Sube a min-h-180 / min-h-200 si hace falta.
  return (
    <aside class="relative hidden min-h-180 w-[46%] shrink-0 overflow-hidden lg:block">
      <img
        src={BANNER_SRC}
        alt="FEROMAP — optimización inteligente de rutas"
        class="absolute inset-0 h-full w-full object-cover object-top"
      />
    </aside>
  );
}

/** Bottom strip (mobile/tablet): illustration portion of the same banner. */
function BannerStrip() {
  return (
    <div
      class="h-36 w-full overflow-hidden sm:h-44 lg:hidden"
      style={{
        'background-image': `url(${BANNER_SRC})`,
        'background-size': 'cover',
        'background-position': 'center bottom',
      }}
      role="img"
      aria-label="Ilustración FEROMAP"
    />
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = createSignal(false);

  const onSubmit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = (e) => {
    e.preventDefault();
    navigate('/');
  };

  return (
    <div class="flex min-h-screen flex-col bg-surface">
      <div class="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8">
        {/* Tamaño de la tarjeta: cambia max-w-* (móvil) y lg:max-w-* (desktop).
            Escala Tailwind: 5xl=64rem · 6xl=72rem · 7xl=80rem */}
        <div class="flex w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl lg:max-w-7xl lg:flex-row">
          <BrandSide />

          <main class="flex flex-1 flex-col justify-center px-6 py-8 sm:px-10 lg:px-12 lg:py-12">
            {/* Ancho del formulario dentro de la tarjeta */}
            <div class="mx-auto w-full max-w-md">
              <p class="text-sm font-semibold text-fero-green-dark">¡Bienvenido de vuelta!</p>
              <h2 class="font-heading mt-1 text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
                Inicia sesión en tu cuenta
              </h2>
              <p class="mt-2 text-sm text-text-muted">
                Accede para gestionar y optimizar la recolección de residuos de manera inteligente.
              </p>

              <form class="mt-8 space-y-5" onSubmit={onSubmit}>
                <TextField
                  label="Correo electrónico"
                  type="email"
                  name="email"
                  autocomplete="email"
                  placeholder="ejemplo@correo.com"
                  required
                  leadingIcon={<Mail size={18} />}
                />

                <div>
                  <TextField
                    label="Contraseña"
                    type={showPassword() ? 'text' : 'password'}
                    name="password"
                    autocomplete="current-password"
                    placeholder="••••••••••••"
                    required
                    leadingIcon={<Lock size={18} />}
                    trailing={
                      <button
                        type="button"
                        class="text-text-muted hover:text-text-secondary"
                        aria-label={showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        <Show when={showPassword()} fallback={<Eye size={18} />}>
                          <EyeOff size={18} />
                        </Show>
                      </button>
                    }
                  />
                  <div class="mt-2 flex justify-end">
                    <a href="#" class="text-sm font-medium text-fero-blue hover:underline">
                      ¿Olvidaste tu contraseña?
                    </a>
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="gradient"
                  size="lg"
                  class="w-full font-semibold"
                  icon={<LogIn size={18} />}
                >
                  Iniciar sesión
                </Button>
              </form>

              <div class="my-6 flex items-center gap-3">
                <div class="h-px flex-1 bg-border" />
                <span class="text-xs text-text-muted">o inicia sesión con</span>
                <div class="h-px flex-1 bg-border" />
              </div>

              <div class="grid grid-cols-2 gap-3">
                <Button type="button" variant="outline" class="w-full font-medium" icon={<GoogleIcon />}>
                  Google
                </Button>
                <Button type="button" variant="outline" class="w-full font-medium" icon={<MicrosoftIcon />}>
                  Microsoft
                </Button>
              </div>

              <p class="mt-8 text-center text-sm text-text-secondary">
                ¿No tienes cuenta?{' '}
                <a href="#" class="font-semibold text-fero-blue hover:underline">
                  Solicita acceso
                </a>
              </p>
            </div>
          </main>

          <BannerStrip />
        </div>
      </div>

      <footer class="flex items-center justify-center gap-2 px-4 py-4 text-xs text-text-muted">
        <Shield size={14} class="text-fero-green-dark" />
        <span>FEROMAP © 2026 | Todos los derechos reservados</span>
      </footer>
    </div>
  );
}
