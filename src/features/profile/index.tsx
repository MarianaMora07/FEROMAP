import { For, Show, createSignal, onMount, type JSX } from 'solid-js';
import {
  Calendar,
  Camera,
  Check,
  ChevronRight,
  Clock,
  History,
  Lock,
  MapPin,
  Monitor,
  Pencil,
  Shield,
  Smartphone,
  Sun,
  Trash2,
} from 'lucide-solid';
import {
  Badge,
  Button,
  Card,
  SelectField,
  TextField,
} from '../../design-system/components';
import {
  changePassword,
  deleteProfileSession,
  fetchProfile,
  fetchProfileSessions,
  resolveAvatarUrl,
  updateProfile,
  updateProfilePreferences,
  uploadProfileAvatar,
  type ProfileDetail,
  type ProfilePreferences,
  type ProfileSession,
} from '../../core/api/profile';
import { applyThemePreference } from '../../core/stores/appStore';
import { logout, userInitials } from '../../core/stores/authStore';
import {
  profileDefaultViewOptions,
  profileLanguageOptions,
  profilePageSizeOptions,
  profileReportFrequencyOptions,
  profileThemeOptions,
  profileTimezoneOptions,
  profileUnitsOptions,
} from '../../data/mock/profile';

const defaultPrefs: ProfilePreferences = {
  theme: 'light',
  language: 'es',
  units: 'metric',
  defaultView: 'dashboard',
  reportFrequency: 'daily',
  pageSize: 20,
  emailNotifications: true,
  systemNotifications: true,
  address: '',
  timezone: 'America/Caracas',
};

function ToggleSwitch(props: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <p class="text-sm font-semibold text-text-primary dark:text-white">{props.label}</p>
        <Show when={props.description}>
          <p class="mt-0.5 text-xs text-text-muted">{props.description}</p>
        </Show>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={props.onChange}
        class={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          props.checked ? 'bg-fero-green-dark' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span
          class={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            props.checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function MetaRow(props: { icon: JSX.Element; label: string; value: string }) {
  return (
    <div class="flex items-start gap-2.5 text-sm">
      <span class="mt-0.5 shrink-0 text-text-muted">{props.icon}</span>
      <div class="flex min-w-0 flex-1 items-start justify-between gap-3">
        <span class="shrink-0 text-text-muted">{props.label}</span>
        <span class="text-right text-text-primary dark:text-white">{props.value}</span>
      </div>
    </div>
  );
}

function SecurityRow(props: {
  icon: JSX.Element;
  label: string;
  value: string;
  valueTone?: 'green' | 'blue';
  onClick?: () => void;
}) {
  const tone = () =>
    props.valueTone === 'green'
      ? 'text-fero-green-dark'
      : props.valueTone === 'blue'
        ? 'text-fero-blue'
        : 'text-text-secondary';

  return (
    <button
      type="button"
      onClick={props.onClick}
      class="flex w-full items-center gap-3 rounded-md px-1 py-3 text-left transition-colors hover:bg-surface-hover"
    >
      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-text-secondary dark:bg-dark-surface-hover">
        {props.icon}
      </span>
      <span class="min-w-0 flex-1 text-sm font-medium text-text-primary dark:text-white">
        {props.label}
      </span>
      <span class={`text-sm font-medium ${tone()}`}>{props.value}</span>
      <ChevronRight size={16} class="shrink-0 text-text-muted" />
    </button>
  );
}

interface ProfileFormState {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  phone: string;
  language: string;
  address: string;
}

interface ProfileMetaState {
  registeredAt: string;
  lastAccess: string;
  sectorName: string;
  ipAddress: string;
  timezone: string;
}

function applyProfileToState(
  profile: ProfileDetail,
  setters: {
    setForm: (v: ProfileFormState) => void;
    setMeta: (v: ProfileMetaState) => void;
    setPrefs: (v: ProfilePreferences) => void;
    setAvatarPreview: (v: string | null) => void;
    setSecurity: (v: { activeSessions: number; twoFactorEnabled: boolean }) => void;
  },
) {
  setters.setForm({
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    role: profile.roleLabel,
    phone: profile.phone ?? '',
    language: profile.preferences.language,
    address: profile.preferences.address ?? '',
  });
  setters.setMeta({
    registeredAt: profile.createdAt
      ? new Date(profile.createdAt).toLocaleDateString('es-VE')
      : '—',
    lastAccess: profile.lastLoginAt
      ? new Date(profile.lastLoginAt).toLocaleString('es-VE')
      : '—',
    sectorName: profile.sectorName ?? '',
    ipAddress: profile.lastIpAddress ?? '—',
    timezone:
      profileTimezoneOptions.find((o) => o.value === profile.preferences.timezone)?.label ??
      profile.preferences.timezone,
  });
  setters.setPrefs(profile.preferences);
  setters.setAvatarPreview(resolveAvatarUrl(profile.avatarUrl));
  setters.setSecurity(profile.security);
  applyThemePreference(profile.preferences.theme);
}

export default function ProfilePage() {
  const [editing, setEditing] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [savingPrefs, setSavingPrefs] = createSignal(false);
  const [form, setForm] = createSignal({
    firstName: '',
    lastName: '',
    email: '',
    role: '',
    phone: '',
    language: 'es',
    address: '',
  });
  const [meta, setMeta] = createSignal({
    registeredAt: '—',
    lastAccess: '—',
    sectorName: '',
    ipAddress: '—',
    timezone: '—',
  });
  const [prefs, setPrefs] = createSignal<ProfilePreferences>({ ...defaultPrefs });
  const [security, setSecurity] = createSignal({ activeSessions: 0, twoFactorEnabled: false });
  const [avatarPreview, setAvatarPreview] = createSignal<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = createSignal<File | null>(null);
  const [photoName, setPhotoName] = createSignal('');
  const [flash, setFlash] = createSignal<string | null>(null);
  const [showPasswordForm, setShowPasswordForm] = createSignal(false);
  const [showSessions, setShowSessions] = createSignal(false);
  const [sessions, setSessions] = createSignal<ProfileSession[]>([]);
  const [passwordForm, setPasswordForm] = createSignal({
    current: '',
    next: '',
    confirm: '',
  });

  const loadProfile = () =>
    fetchProfile().then((profile) => {
      applyProfileToState(profile, {
        setForm,
        setMeta,
        setPrefs,
        setAvatarPreview,
        setSecurity,
      });
    });

  onMount(() => {
    void loadProfile().finally(() => setLoading(false));
  });

  const fullName = () => `${form().firstName} ${form().lastName}`.trim();

  const patchForm = (partial: Partial<ReturnType<typeof form>>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const patchPrefs = (partial: Partial<ProfilePreferences>) => {
    setPrefs((prev) => ({ ...prev, ...partial }));
  };

  const showFlash = (message: string) => {
    setFlash(message);
    window.setTimeout(() => setFlash(null), 2500);
  };

  const onPhotoChange = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setPendingAvatarFile(file);
    setPhotoName(file.name);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const openSessions = () => {
    void fetchProfileSessions().then(setSessions);
    setShowSessions(true);
  };

  const handleRevokeSession = async (sessionId: string) => {
    const result = await deleteProfileSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    setSecurity((prev) => ({ ...prev, activeSessions: Math.max(0, prev.activeSessions - 1) }));
    if (result.currentSessionRevoked) {
      await logout();
      window.location.href = '/login';
      return;
    }
    showFlash('Sesión cerrada.');
  };

  return (
    <div class="space-y-5">
      <Show when={loading()}>
        <div class="text-sm text-text-muted">Cargando perfil...</div>
      </Show>

      <Show when={flash()}>
        <div class="rounded-md border border-fero-green-dark/30 bg-fero-green/10 px-3 py-2 text-sm text-fero-green-dark">
          {flash()}
        </div>
      </Show>

      <div class="grid items-stretch gap-5 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
        <Card padding={false} class="flex h-full flex-col p-5 md:p-6">
          <div class="flex flex-col items-center text-center">
            <div class="relative mb-4">
              <Show
                when={avatarPreview()}
                fallback={
                  <div class="flex h-28 w-28 items-center justify-center rounded-full bg-fero-green/15 text-2xl font-bold text-fero-green-dark ring-4 ring-fero-green/20">
                    {userInitials()}
                  </div>
                }
              >
                <img
                  src={avatarPreview()!}
                  alt={fullName()}
                  class="h-28 w-28 rounded-full object-cover ring-4 ring-fero-green/20"
                />
              </Show>
              <button
                type="button"
                class="absolute bottom-0.5 right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-fero-green-dark text-white shadow-sm ring-2 ring-white"
                aria-label="Cambiar foto"
                onClick={() => document.getElementById('profile-photo-input')?.click()}
              >
                <Camera size={14} />
              </button>
            </div>

            <h2 class="font-heading text-xl font-bold text-text-primary dark:text-white">
              {fullName()}
            </h2>
            <p class="mt-0.5 text-sm font-medium text-fero-green-dark">{form().role}</p>
            <p class="mt-1 break-all text-sm text-text-muted">{form().email}</p>

            <Badge variant="success" dot class="mt-3">
              Cuenta activa
            </Badge>
          </div>

          <div class="mt-6 space-y-3 border-t border-border pt-5 dark:border-dark-border">
            <MetaRow icon={<Calendar size={15} />} label="Fecha de registro" value={meta().registeredAt} />
            <MetaRow icon={<Clock size={15} />} label="Último acceso" value={meta().lastAccess} />
            <MetaRow icon={<Monitor size={15} />} label="Dirección IP" value={meta().ipAddress} />
            <Show when={meta().sectorName}>
              <MetaRow icon={<MapPin size={15} />} label="Sector" value={meta().sectorName} />
            </Show>
            <MetaRow icon={<MapPin size={15} />} label="Zona horaria" value={meta().timezone} />
          </div>

          <div class="mt-auto flex justify-center pt-6">
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="border-fero-blue text-fero-blue hover:bg-fero-blue/5"
              icon={<Lock size={14} />}
              onClick={() => setShowPasswordForm((v) => !v)}
            >
              Cambiar contraseña
            </Button>
          </div>

          <Show when={showPasswordForm()}>
            <div class="mt-4 space-y-3 rounded-md border border-border p-3 dark:border-dark-border">
              <TextField
                label="Contraseña actual"
                type="password"
                value={passwordForm().current}
                onInput={(e) => setPasswordForm((p) => ({ ...p, current: e.currentTarget.value }))}
              />
              <TextField
                label="Nueva contraseña"
                type="password"
                value={passwordForm().next}
                onInput={(e) => setPasswordForm((p) => ({ ...p, next: e.currentTarget.value }))}
              />
              <TextField
                label="Confirmar contraseña"
                type="password"
                value={passwordForm().confirm}
                onInput={(e) => setPasswordForm((p) => ({ ...p, confirm: e.currentTarget.value }))}
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                class="w-full"
                onClick={() => {
                  if (passwordForm().next !== passwordForm().confirm) {
                    showFlash('Las contraseñas no coinciden.');
                    return;
                  }
                  void changePassword(passwordForm().current, passwordForm().next)
                    .then(() => {
                      setPasswordForm({ current: '', next: '', confirm: '' });
                      setShowPasswordForm(false);
                      showFlash('Contraseña actualizada.');
                    })
                    .catch(() => showFlash('No se pudo cambiar la contraseña.'));
                }}
              >
                Guardar contraseña
              </Button>
            </div>
          </Show>
        </Card>

        <Card padding={false} class="flex h-full flex-col p-5 md:p-6">
          <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="font-heading text-base font-semibold text-text-primary dark:text-white">
                Información personal
              </h3>
              <p class="mt-0.5 text-sm text-text-muted">Actualiza tu información personal.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="border-fero-blue text-fero-blue hover:bg-fero-blue/5"
              icon={<Pencil size={14} />}
              onClick={() => setEditing((v) => !v)}
            >
              {editing() ? 'Cancelar' : 'Editar perfil'}
            </Button>
          </div>

          <fieldset disabled={!editing()} class="disabled:opacity-90">
            <div class="grid gap-x-5 gap-y-4 sm:grid-cols-2">
              <TextField
                label="Nombre"
                value={form().firstName}
                onInput={(e) => patchForm({ firstName: e.currentTarget.value })}
              />
              <TextField
                label="Apellido"
                value={form().lastName}
                onInput={(e) => patchForm({ lastName: e.currentTarget.value })}
              />
              <TextField label="Correo electrónico" type="email" value={form().email} disabled />
              <TextField label="Rol" value={form().role} disabled />
              <TextField
                label="Teléfono"
                value={form().phone}
                onInput={(e) => patchForm({ phone: e.currentTarget.value })}
              />
              <SelectField
                label="Idioma"
                value={form().language}
                onChange={(e) => patchForm({ language: e.currentTarget.value })}
              >
                <For each={profileLanguageOptions}>
                  {(o) => <option value={o.value}>{o.label}</option>}
                </For>
              </SelectField>

              <div class="sm:col-span-2">
                <label
                  for="profile-address"
                  class="mb-1.5 block text-sm font-semibold text-text-primary dark:text-white"
                >
                  Dirección
                </label>
                <textarea
                  id="profile-address"
                  rows={3}
                  value={form().address}
                  onInput={(e) => patchForm({ address: e.currentTarget.value })}
                  class="w-full resize-none rounded-md border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-text-primary transition-colors focus:border-fero-blue focus:outline-none focus:ring-2 focus:ring-fero-blue/20 dark:border-dark-border dark:bg-dark-surface-hover dark:text-white"
                />
              </div>

              <div>
                <label
                  for="profile-photo-input"
                  class="mb-1.5 block text-sm font-semibold text-text-primary dark:text-white"
                >
                  Foto de perfil
                </label>
                <div
                  class={`flex min-h-[46px] flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 dark:border-dark-border dark:bg-dark-surface-hover ${
                    !editing() ? 'pointer-events-none opacity-90' : ''
                  }`}
                >
                  <label
                    for="profile-photo-input"
                    class="cursor-pointer rounded-md border border-border bg-slate-50 px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover dark:border-dark-border dark:bg-dark-surface"
                  >
                    Seleccionar archivo
                  </label>
                  <span class="text-sm text-text-muted">
                    {photoName() || 'Ningún archivo seleccionado'}
                  </span>
                </div>
              </div>
            </div>
          </fieldset>

          <input
            id="profile-photo-input"
            type="file"
            accept="image/*"
            class="sr-only"
            onChange={(e) => onPhotoChange(e.currentTarget.files)}
          />

          <div class="mt-auto flex justify-end pt-5">
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={<Check size={14} />}
              disabled={!editing()}
              onClick={() => {
                void (async () => {
                  try {
                    let profile = await updateProfile({
                      firstName: form().firstName,
                      lastName: form().lastName,
                      phone: form().phone || null,
                    });
                    if (pendingAvatarFile()) {
                      profile = await uploadProfileAvatar(pendingAvatarFile()!);
                      setPendingAvatarFile(null);
                    }
                    await updateProfilePreferences({
                      language: form().language,
                      address: form().address || null,
                    });
                    applyProfileToState(profile, {
                      setForm,
                      setMeta,
                      setPrefs,
                      setAvatarPreview,
                      setSecurity,
                    });
                    setEditing(false);
                    showFlash('Información personal guardada.');
                  } catch {
                    showFlash('No se pudo guardar el perfil.');
                  }
                })();
              }}
            >
              Guardar cambios
            </Button>
          </div>
        </Card>

        <Card padding={false} class="flex h-full flex-col p-5 md:p-6">
          <div class="mb-2">
            <h3 class="font-heading text-base font-semibold text-text-primary dark:text-white">
              Seguridad de la cuenta
            </h3>
            <p class="mt-0.5 text-sm text-text-muted">
              Configura opciones de seguridad para proteger tu cuenta.
            </p>
          </div>

          <div class="divide-y divide-border dark:divide-dark-border">
            <SecurityRow
              icon={<Shield size={16} />}
              label="Autenticación en dos pasos"
              value={security().twoFactorEnabled ? 'Activada' : 'Desactivada'}
              valueTone="green"
              onClick={() => showFlash('2FA estará disponible en una versión futura.')}
            />
            <SecurityRow
              icon={<Monitor size={16} />}
              label="Sesiones activas"
              value={`${security().activeSessions} sesiones`}
              valueTone="blue"
              onClick={openSessions}
            />
            <SecurityRow
              icon={<Smartphone size={16} />}
              label="Dispositivos registrados"
              value={`${security().activeSessions} dispositivos`}
              valueTone="blue"
              onClick={openSessions}
            />
            <SecurityRow
              icon={<History size={16} />}
              label="Actividad reciente"
              value="Ver actividad"
              valueTone="blue"
              onClick={openSessions}
            />
          </div>

          <Show when={showSessions()}>
            <div class="mt-4 space-y-2 border-t border-border pt-4 dark:border-dark-border">
              <p class="text-sm font-semibold text-text-primary dark:text-white">Sesiones activas</p>
              <For each={sessions()}>
                {(session) => (
                  <div class="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm dark:border-dark-border">
                    <div class="min-w-0">
                      <p class="font-medium text-text-primary dark:text-white">
                        {session.deviceLabel}
                        <Show when={session.current}>
                          <span class="ml-2 text-xs text-fero-green-dark">(actual)</span>
                        </Show>
                      </p>
                      <p class="text-xs text-text-muted">
                        {session.ipAddress ?? 'IP desconocida'} ·{' '}
                        {new Date(session.lastSeenAt).toLocaleString('es-VE')}
                      </p>
                    </div>
                    <Show when={!session.current}>
                      <button
                        type="button"
                        class="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-red-500"
                        aria-label="Cerrar sesión"
                        onClick={() => void handleRevokeSession(session.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Card>

        <Card padding={false} class="flex h-full flex-col p-5 md:p-6">
          <div class="mb-5">
            <h3 class="font-heading text-base font-semibold text-text-primary dark:text-white">
              Preferencias del sistema
            </h3>
            <p class="mt-0.5 text-sm text-text-muted">Personaliza tu experiencia en el sistema.</p>
          </div>

          <div class="space-y-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Tema"
                value={prefs().theme}
                onChange={(e) => patchPrefs({ theme: e.currentTarget.value as ProfilePreferences['theme'] })}
              >
                <For each={profileThemeOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
              <SelectField
                label="Vista predeterminada"
                value={prefs().defaultView}
                onChange={(e) => patchPrefs({ defaultView: e.currentTarget.value })}
              >
                <For each={profileDefaultViewOptions}>
                  {(o) => <option value={o.value}>{o.label}</option>}
                </For>
              </SelectField>
              <SelectField
                label="Idioma"
                value={prefs().language}
                onChange={(e) => patchPrefs({ language: e.currentTarget.value })}
              >
                <For each={profileLanguageOptions}>
                  {(o) => <option value={o.value}>{o.label}</option>}
                </For>
              </SelectField>
              <SelectField
                label="Unidades"
                value={prefs().units}
                onChange={(e) => patchPrefs({ units: e.currentTarget.value as ProfilePreferences['units'] })}
              >
                <For each={profileUnitsOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
              <SelectField
                label="Zona horaria"
                value={prefs().timezone}
                onChange={(e) => patchPrefs({ timezone: e.currentTarget.value })}
              >
                <For each={profileTimezoneOptions}>
                  {(o) => <option value={o.value}>{o.label}</option>}
                </For>
              </SelectField>
            </div>

            <div class="grid gap-4 rounded-md border border-border bg-slate-50/70 p-4 dark:border-dark-border dark:bg-dark-surface-hover/40 sm:grid-cols-2">
              <ToggleSwitch
                label="Notificaciones por correo"
                description="Recibir notificaciones importantes por correo"
                checked={prefs().emailNotifications}
                onChange={() => patchPrefs({ emailNotifications: !prefs().emailNotifications })}
              />
              <ToggleSwitch
                label="Notificaciones en el sistema"
                description="Recibir notificaciones dentro del sistema"
                checked={prefs().systemNotifications}
                onChange={() => patchPrefs({ systemNotifications: !prefs().systemNotifications })}
              />
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Frecuencia de reportes"
                value={prefs().reportFrequency}
                onChange={(e) => patchPrefs({ reportFrequency: e.currentTarget.value })}
              >
                <For each={profileReportFrequencyOptions}>
                  {(o) => <option value={o.value}>{o.label}</option>}
                </For>
              </SelectField>
              <SelectField
                label="Elementos por página"
                value={String(prefs().pageSize)}
                onChange={(e) => patchPrefs({ pageSize: Number(e.currentTarget.value) })}
              >
                <For each={profilePageSizeOptions}>
                  {(o) => <option value={o.value}>{o.label}</option>}
                </For>
              </SelectField>
            </div>
          </div>

          <div class="mt-auto flex items-center justify-between gap-3 pt-5">
            <Show when={prefs().theme === 'light'}>
              <span class="inline-flex items-center gap-1.5 text-xs text-text-muted">
                <Sun size={14} />
                Tema claro activo
              </span>
            </Show>
            <div class="ml-auto">
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={<Check size={14} />}
                loading={savingPrefs()}
                onClick={() => {
                  setSavingPrefs(true);
                  void updateProfilePreferences({
                    theme: prefs().theme,
                    language: prefs().language,
                    units: prefs().units,
                    defaultView: prefs().defaultView,
                    reportFrequency: prefs().reportFrequency,
                    pageSize: prefs().pageSize,
                    emailNotifications: prefs().emailNotifications,
                    systemNotifications: prefs().systemNotifications,
                    timezone: prefs().timezone,
                  })
                    .then((saved) => {
                      setPrefs(saved);
                      applyThemePreference(saved.theme);
                      showFlash('Preferencias guardadas.');
                    })
                    .catch(() => showFlash('No se pudieron guardar las preferencias.'))
                    .finally(() => setSavingPrefs(false));
                }}
              >
                Guardar preferencias
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
