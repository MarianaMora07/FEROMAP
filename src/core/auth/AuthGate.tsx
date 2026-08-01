import { Navigate, useLocation } from '@solidjs/router';
import { Show, type JSX } from 'solid-js';
import {
  authInitialized,
  authLoading,
  authUser,
  isAuthenticated,
} from '../stores/authStore';
import { canAccessRoute, homePathForRole } from '../auth/permissions';

export function AuthGate(props: { children: JSX.Element }) {
  const location = useLocation();

  return (
    <Show
      when={authInitialized()}
      fallback={
        <div class="flex min-h-screen items-center justify-center text-sm text-text-muted">
          Verificando sesión...
        </div>
      }
    >
      <Show
        when={isAuthenticated()}
        fallback={<Navigate href={`/login?redirect=${encodeURIComponent(location.pathname)}`} />}
      >
        {props.children}
      </Show>
    </Show>
  );
}

export function GuestGate(props: { children: JSX.Element }) {
  const user = () => authUser();

  return (
    <Show
      when={authInitialized()}
      fallback={
        <div class="flex min-h-screen items-center justify-center text-sm text-text-muted">
          Cargando...
        </div>
      }
    >
      <Show when={!isAuthenticated()} fallback={<Navigate href={homePathForRole(user()!.role)} />}>
        {props.children}
      </Show>
    </Show>
  );
}

export function RoleGate(props: { children: JSX.Element }) {
  const location = useLocation();
  const user = () => authUser();

  return (
    <Show
      when={user() && canAccessRoute(user()!.role, location.pathname)}
      fallback={<Navigate href={user() ? homePathForRole(user()!.role) : '/login'} />}
    >
      {props.children}
    </Show>
  );
}
