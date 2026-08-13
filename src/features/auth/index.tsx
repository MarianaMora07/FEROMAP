import { Show, createSignal, type JSX } from 'solid-js';
import { useNavigate, useSearchParams } from '@solidjs/router';
import { LogIn, Eye, EyeOff, Mail, Lock, Shield } from 'lucide-solid';
import { Button, TextField } from '../../design-system/components';
import { login, authError, authLoading } from '../../core/stores/authStore';
import { DEMO_USERS, DEMO_PASSWORD } from '../../core/types/auth';

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

function BrandSide() {
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
  const [params] = useSearchParams();
  const [showPassword, setShowPassword] = createSignal(false);
  const [email, setEmail] = createSignal('admin@fero.com');

  const onSubmit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const emailValue = String(formData.get('email') ?? '');
    const passwordValue = String(formData.get('password') ?? '');
    try {
      const home = await login(emailValue, passwordValue);
      const redirect = typeof params.redirect === 'string' ? params.redirect : home;
      navigate(redirect || home, { replace: true });
    } catch {
      // error shown via authError()
    }
  };

  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    const input = document.querySelector<HTMLInputElement>('input[name="password"]');
    if (input) input.value = DEMO_PASSWORD;
  };

  return (
    <div class="flex min-h-screen flex-col bg-app">
      <div class="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8">
        <div class="flex w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-default bg-elevated shadow-xl lg:max-w-7xl lg:flex-row">
          <BrandSide />

          <main class="flex flex-1 flex-col justify-center px-6 py-8 sm:px-10 lg:px-12 lg:py-12">
            <div class="mx-auto w-full max-w-md">
              <p class="text-sm font-semibold text-fero-green-dark">¡Bienvenido de vuelta!</p>
              <h2 class="font-heading mt-1 text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
                Inicia sesión en tu cuenta
              </h2>
              <p class="mt-2 text-sm text-text-muted">
                Accede con uno de los 4 usuarios demo del capítulo 4 (clave: {DEMO_PASSWORD}).
              </p>

              <form class="mt-8 space-y-5" onSubmit={onSubmit}>
                <TextField
                  label="Correo electrónico"
                  type="email"
                  name="email"
                  autocomplete="email"
                  placeholder="admin@fero.com"
                  required
                  value={email()}
                  onInput={(e) => setEmail(e.currentTarget.value)}
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
                </div>

                <Show when={authError()}>
                  <p class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                    {authError()}
                  </p>
                </Show>

                <Button
                  type="submit"
                  variant="gradient"
                  size="lg"
                  class="w-full font-semibold"
                  icon={<LogIn size={18} />}
                  disabled={authLoading()}
                >
                  {authLoading() ? 'Iniciando sesión…' : 'Iniciar sesión'}
                </Button>
              </form>

              <div class="mt-6 rounded-lg border border-default bg-app p-3">
                <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Usuarios demo
                </p>
                <div class="flex flex-wrap gap-2">
                  {DEMO_USERS.map((demo) => (
                    <button
                      type="button"
                      class="rounded-md border border-default bg-elevated px-2.5 py-1 text-xs font-medium text-text-secondary hover:border-fero-green-dark hover:text-fero-green-dark"
                      onClick={() => fillDemo(demo.email)}
                    >
                      {demo.label}
                    </button>
                  ))}
                </div>
              </div>

              <div class="my-6 flex items-center gap-3">
                <div class="h-px flex-1 bg-default" />
                <span class="text-xs text-text-muted">o inicia sesión con</span>
                <div class="h-px flex-1 bg-default" />
              </div>

              <div class="grid grid-cols-2 gap-3">
                <Button type="button" variant="outline" class="w-full font-medium" icon={<GoogleIcon />} disabled>
                  Google
                </Button>
                <Button type="button" variant="outline" class="w-full font-medium" icon={<MicrosoftIcon />} disabled>
                  Microsoft
                </Button>
              </div>
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
