import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import {
  Bell,
  Clock,
  Database,
  Info,
  Key,
  Lock,
  Palette,
  Plug,
  Route,
  Ruler,
  Scale,
  Share2,
  Shield,
  SlidersHorizontal,
  Users,
} from 'lucide-solid';
import { Button, Card, SelectField, TextField } from '../../design-system/components';
import {
  adminCategories,
  adminTabs,
  algorithmOptions,
  backupFrequencyOptions,
  dateFormatOptions,
  defaultAdminSettings,
  distanceUnitOptions,
  exportFormatOptions,
  fillThresholdOptions,
  idleOptions,
  languageOptions,
  rateLimitOptions,
  refreshOptions,
  sessionTimeoutOptions,
  themeOptions,
  timeUnitOptions,
  timezoneOptions,
  volumeUnitOptions,
  weightUnitOptions,
  type AdminCategory,
  type AdminCategoryId,
  type AdminTabId,
} from '../../data/mock/admin';

function CategoryIcon(props: { name: AdminCategory['icon'] }) {
  const map: Record<AdminCategory['icon'], () => JSX.Element> = {
    info: () => <Info size={16} />,
    sliders: () => <SlidersHorizontal size={16} />,
    ruler: () => <Ruler size={16} />,
    palette: () => <Palette size={16} />,
    database: () => <Database size={16} />,
    share: () => <Share2 size={16} />,
    route: () => <Route size={16} />,
    scale: () => <Scale size={16} />,
    lock: () => <Lock size={16} />,
    clock: () => <Clock size={16} />,
    bell: () => <Bell size={16} />,
    plug: () => <Plug size={16} />,
    users: () => <Users size={16} />,
    shield: () => <Shield size={16} />,
    key: () => <Key size={16} />,
  };
  return map[props.name]();
}

function ToggleSwitch(props: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}) {
  return (
    <div class="flex items-start justify-between gap-4 rounded-md border border-border bg-slate-50/80 px-4 py-3 dark:border-dark-border dark:bg-dark-surface-hover/40">
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
        onClick={props.onChange}
        class={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
          props.checked ? 'bg-fero-blue' : 'bg-slate-300 dark:bg-slate-600'
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

function UnitField(props: {
  label: string;
  value: string;
  unit: string;
  onInput: (value: string) => void;
  type?: string;
}) {
  const id = () => `unit-${props.label}`;
  return (
    <div>
      <label for={id()} class="mb-1.5 block text-sm font-semibold text-text-primary dark:text-white">
        {props.label}
      </label>
      <div class="relative">
        <input
          id={id()}
          type={props.type ?? 'number'}
          value={props.value}
          onInput={(e) => props.onInput(e.currentTarget.value)}
          class="w-full rounded-md border border-border bg-surface py-3 pl-4 pr-24 text-sm text-text-primary transition-colors focus:border-fero-blue focus:outline-none focus:ring-2 focus:ring-fero-blue/20 dark:border-dark-border dark:bg-dark-surface-hover dark:text-white"
        />
        <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
          {props.unit}
        </span>
      </div>
    </div>
  );
}

function SettingsSection(props: {
  id: AdminCategoryId;
  title: string;
  description: string;
  children: JSX.Element;
  onSave: () => void;
}) {
  return (
    <div id={props.id} class="scroll-mt-4">
      <Card padding={false} class="p-5 md:p-6">
        <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="font-heading text-base font-semibold text-text-primary dark:text-white">
              {props.title}
            </h3>
            <p class="mt-0.5 text-sm text-text-muted">{props.description}</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={props.onSave}>
            Guardar cambios
          </Button>
        </div>
        {props.children}
      </Card>
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = createSignal<AdminTabId>('general');
  const [category, setCategory] = createSignal<AdminCategoryId>('info');
  const [settings, setSettings] = createSignal({ ...defaultAdminSettings });
  const [savedFlash, setSavedFlash] = createSignal<string | null>(null);

  const categoriesForTab = createMemo(() => adminCategories.filter((c) => c.tab === tab()));

  const patch = (partial: Partial<typeof defaultAdminSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  const saveSection = (sectionId: string) => {
    setSavedFlash(sectionId);
    window.setTimeout(() => {
      setSavedFlash((cur) => (cur === sectionId ? null : cur));
    }, 1800);
  };

  const selectCategory = (id: AdminCategoryId) => {
    setCategory(id);
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const selectTab = (id: AdminTabId) => {
    setTab(id);
    const first = adminCategories.find((c) => c.tab === id);
    if (first) setCategory(first.id);
  };

  return (
    <div class="space-y-5">
      <div class="overflow-x-auto border-b border-border dark:border-dark-border">
        <nav class="flex min-w-max gap-1" aria-label="Secciones de configuración">
          <For each={adminTabs}>
            {(item) => (
              <button
                type="button"
                onClick={() => selectTab(item.id)}
                class={`relative px-3 py-2.5 text-sm font-medium transition-colors ${
                  tab() === item.id
                    ? 'text-fero-blue'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {item.label}
                <Show when={tab() === item.id}>
                  <span class="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-fero-blue" />
                </Show>
              </button>
            )}
          </For>
        </nav>
      </div>

      <div class="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside class="rounded-[var(--radius-lg)] border border-border bg-surface p-3 dark:border-dark-border dark:bg-dark-surface lg:sticky lg:top-4">
          <p class="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Categorías de configuración
          </p>
          <nav class="space-y-0.5">
            <For each={categoriesForTab()}>
              {(item) => (
                <button
                  type="button"
                  onClick={() => selectCategory(item.id)}
                  class={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left text-sm transition-colors ${
                    category() === item.id
                      ? 'bg-fero-blue/10 font-semibold text-fero-blue'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                >
                  <span
                    class={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                      category() === item.id
                        ? 'bg-fero-blue/15 text-fero-blue'
                        : 'bg-slate-100 text-text-muted dark:bg-dark-surface-hover'
                    }`}
                  >
                    <CategoryIcon name={item.icon} />
                  </span>
                  <span class="leading-snug">{item.label}</span>
                </button>
              )}
            </For>
          </nav>
        </aside>

        <div class="space-y-4">
          <Show when={savedFlash()}>
            <div class="rounded-md border border-fero-green-dark/30 bg-fero-green/10 px-3 py-2 text-sm text-fero-green-dark">
              Cambios guardados correctamente.
            </div>
          </Show>

          <Show when={tab() === 'general'}>
            <SettingsSection
              id="info"
              title="Información general"
              description="Define la identidad básica y localización del sistema."
              onSave={() => saveSection('info')}
            >
              <div class="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Nombre del sistema"
                  class="sm:col-span-2"
                  value={settings().systemName}
                  onInput={(e) => patch({ systemName: e.currentTarget.value })}
                />
                <SelectField
                  label="Idioma"
                  value={settings().language}
                  onChange={(e) => patch({ language: e.currentTarget.value })}
                >
                  <For each={languageOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
                </SelectField>
                <SelectField
                  label="Zona horaria"
                  value={settings().timezone}
                  onChange={(e) => patch({ timezone: e.currentTarget.value })}
                >
                  <For each={timezoneOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
                </SelectField>
                <SelectField
                  label="Formato de fecha"
                  value={settings().dateFormat}
                  onChange={(e) => patch({ dateFormat: e.currentTarget.value })}
                >
                  <For each={dateFormatOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
                </SelectField>
              </div>
            </SettingsSection>

            <SettingsSection
              id="params"
              title="Parámetros del sistema"
              description="Ajusta los valores operativos por defecto de la flota y el monitoreo."
              onSave={() => saveSection('params')}
            >
              <div class="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Tiempo de actualización en tiempo real"
                  value={settings().refreshSeconds}
                  onChange={(e) => patch({ refreshSeconds: e.currentTarget.value })}
                >
                  <For each={refreshOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
                </SelectField>
                <UnitField
                  label="Capacidad máxima de carga permitida"
                  value={settings().maxLoadTons}
                  unit="toneladas"
                  onInput={(v) => patch({ maxLoadTons: v })}
                />
                <SelectField
                  label="Tiempo máximo de inactividad de vehículo"
                  value={settings().idleMinutes}
                  onChange={(e) => patch({ idleMinutes: e.currentTarget.value })}
                >
                  <For each={idleOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
                </SelectField>
                <UnitField
                  label="Velocidad promedio por defecto"
                  value={settings().defaultSpeed}
                  unit="km/h"
                  onInput={(v) => patch({ defaultSpeed: v })}
                />
                <UnitField
                  label="Distancia máxima para asignación automática"
                  value={settings().maxAssignDistance}
                  unit="km"
                  onInput={(v) => patch({ maxAssignDistance: v })}
                />
              </div>
              <div class="mt-4">
                <ToggleSwitch
                  label="Recalcular rutas automáticamente"
                  description="Cuando hay cambios en demanda, tráfico o estado de flota."
                  checked={settings().autoRecalcRoutes}
                  onChange={() => patch({ autoRecalcRoutes: !settings().autoRecalcRoutes })}
                />
              </div>
            </SettingsSection>

            <SettingsSection
              id="units"
              title="Unidades y medidas"
              description="Selecciona las unidades utilizadas en reportes, mapas y paneles."
              onSave={() => saveSection('units')}
            >
              <div class="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Unidad de distancia"
                  value={settings().distanceUnit}
                  onChange={(e) => patch({ distanceUnit: e.currentTarget.value })}
                >
                  <For each={distanceUnitOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
                </SelectField>
                <SelectField
                  label="Unidad de volumen"
                  value={settings().volumeUnit}
                  onChange={(e) => patch({ volumeUnit: e.currentTarget.value })}
                >
                  <For each={volumeUnitOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
                </SelectField>
                <SelectField
                  label="Unidad de peso"
                  value={settings().weightUnit}
                  onChange={(e) => patch({ weightUnit: e.currentTarget.value })}
                >
                  <For each={weightUnitOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
                </SelectField>
                <SelectField
                  label="Unidad de tiempo"
                  value={settings().timeUnit}
                  onChange={(e) => patch({ timeUnit: e.currentTarget.value })}
                >
                  <For each={timeUnitOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
                </SelectField>
              </div>
            </SettingsSection>

            <SettingsSection
              id="personalization"
              title="Personalización"
              description="Ajusta la apariencia de la interfaz para operadores y supervisores."
              onSave={() => saveSection('personalization')}
            >
              <div class="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Tema de interfaz"
                  value={settings().theme}
                  onChange={(e) => patch({ theme: e.currentTarget.value })}
                >
                  <For each={themeOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
                </SelectField>
                <TextField
                  label="Color de acento"
                  type="color"
                  value={settings().accentColor}
                  onInput={(e) => patch({ accentColor: e.currentTarget.value })}
                  inputClass="h-[46px] py-1.5"
                />
              </div>
            </SettingsSection>

            <SettingsSection
              id="backup"
              title="Respaldo y restauración"
              description="Define la política de copias de seguridad del sistema."
              onSave={() => saveSection('backup')}
            >
              <div class="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Frecuencia de respaldo"
                  value={settings().backupFrequency}
                  onChange={(e) => patch({ backupFrequency: e.currentTarget.value })}
                >
                  <For each={backupFrequencyOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
                </SelectField>
                <div>
                  <p class="mb-1.5 text-sm font-semibold text-text-primary dark:text-white">
                    Último respaldo
                  </p>
                  <p class="rounded-md border border-border bg-slate-50 px-4 py-3 text-sm text-text-secondary dark:border-dark-border dark:bg-dark-surface-hover dark:text-white/80">
                    {settings().lastBackup}
                  </p>
                </div>
              </div>
              <div class="mt-4">
                <Button type="button" variant="outline" size="sm">
                  Generar respaldo ahora
                </Button>
              </div>
            </SettingsSection>

            <SettingsSection
              id="import-export"
              title="Importar / Exportar datos"
              description="Intercambia catálogos, rutas y puntos de recolección."
              onSave={() => saveSection('import-export')}
            >
              <div class="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Formato de exportación"
                  value={settings().exportFormat}
                  onChange={(e) => patch({ exportFormat: e.currentTarget.value })}
                >
                  <For each={exportFormatOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
                </SelectField>
                <div class="flex items-end gap-2">
                  <Button type="button" variant="secondary" size="sm" class="w-full sm:w-auto">
                    Exportar datos
                  </Button>
                  <Button type="button" variant="outline" size="sm" class="w-full sm:w-auto">
                    Importar archivo
                  </Button>
                </div>
              </div>
            </SettingsSection>
          </Show>

          <Show when={tab() === 'routes'}>
            <SettingsSection
              id="algorithm"
              title="Algoritmo de rutas"
              description="Selecciona el motor de optimización utilizado por defecto."
              onSave={() => saveSection('algorithm')}
            >
              <SelectField
                label="Algoritmo"
                value={settings().algorithm}
                onChange={(e) => patch({ algorithm: e.currentTarget.value })}
              >
                <For each={algorithmOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
            </SettingsSection>
            <SettingsSection
              id="weights"
              title="Pesos y prioridades"
              description="Distribuye la importancia relativa entre tiempo, distancia y llenado."
              onSave={() => saveSection('weights')}
            >
              <div class="grid gap-4 sm:grid-cols-3">
                <UnitField
                  label="Peso tiempo"
                  value={settings().timeWeight}
                  unit="%"
                  onInput={(v) => patch({ timeWeight: v })}
                />
                <UnitField
                  label="Peso distancia"
                  value={settings().distanceWeight}
                  unit="%"
                  onInput={(v) => patch({ distanceWeight: v })}
                />
                <UnitField
                  label="Peso llenado"
                  value={settings().fillWeight}
                  unit="%"
                  onInput={(v) => patch({ fillWeight: v })}
                />
              </div>
            </SettingsSection>
            <SettingsSection
              id="constraints"
              title="Restricciones"
              description="Límites operativos aplicados al planificador de rutas."
              onSave={() => saveSection('constraints')}
            >
              <div class="grid gap-4 sm:grid-cols-2">
                <UnitField
                  label="Máximo de paradas por ruta"
                  value={settings().maxStops}
                  unit="paradas"
                  onInput={(v) => patch({ maxStops: v })}
                />
                <div class="sm:col-span-2">
                  <ToggleSwitch
                    label="Evitar peajes"
                    description="Prioriza corredores sin costo de peaje cuando sea viable."
                    checked={settings().avoidTolls}
                    onChange={() => patch({ avoidTolls: !settings().avoidTolls })}
                  />
                </div>
              </div>
            </SettingsSection>
          </Show>

          <Show when={tab() === 'collection'}>
            <SettingsSection
              id="schedules"
              title="Horarios operativos"
              description="Ventana diaria de operación para la flota de recolección."
              onSave={() => saveSection('schedules')}
            >
              <div class="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Inicio de jornada"
                  type="time"
                  value={settings().workStart}
                  onInput={(e) => patch({ workStart: e.currentTarget.value })}
                />
                <TextField
                  label="Fin de jornada"
                  type="time"
                  value={settings().workEnd}
                  onInput={(e) => patch({ workEnd: e.currentTarget.value })}
                />
              </div>
            </SettingsSection>
            <SettingsSection
              id="thresholds"
              title="Umbrales de llenado"
              description="Nivel a partir del cual un punto entra en prioridad de recolección."
              onSave={() => saveSection('thresholds')}
            >
              <SelectField
                label="Umbral de llenado"
                value={settings().fillThreshold}
                onChange={(e) => patch({ fillThreshold: e.currentTarget.value })}
              >
                <For each={fillThresholdOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
            </SettingsSection>
          </Show>

          <Show when={tab() === 'notifications'}>
            <SettingsSection
              id="channels"
              title="Canales"
              description="Activa o desactiva los canales de aviso a operadores."
              onSave={() => saveSection('channels')}
            >
              <div class="space-y-3">
                <ToggleSwitch
                  label="Notificaciones por correo"
                  checked={settings().emailNotifications}
                  onChange={() => patch({ emailNotifications: !settings().emailNotifications })}
                />
                <ToggleSwitch
                  label="Notificaciones push"
                  checked={settings().pushNotifications}
                  onChange={() => patch({ pushNotifications: !settings().pushNotifications })}
                />
                <ToggleSwitch
                  label="SMS para alertas críticas"
                  checked={settings().smsCritical}
                  onChange={() => patch({ smsCritical: !settings().smsCritical })}
                />
              </div>
            </SettingsSection>
            <SettingsSection
              id="alerts-cfg"
              title="Alertas automáticas"
              description="Comportamiento del motor de alertas ante eventos críticos."
              onSave={() => saveSection('alerts-cfg')}
            >
              <ToggleSwitch
                label="Escalar alertas críticas automáticamente"
                description="Asigna y notifica a supervisores si no hay respuesta en 15 minutos."
                checked={settings().autoEscalate}
                onChange={() => patch({ autoEscalate: !settings().autoEscalate })}
              />
            </SettingsSection>
          </Show>

          <Show when={tab() === 'integrations'}>
            <SettingsSection
              id="gis"
              title="GIS / Mapas"
              description="Proveedor cartográfico utilizado en el mapa operativo."
              onSave={() => saveSection('gis')}
            >
              <TextField
                label="Proveedor de mapas"
                value={settings().mapProvider}
                onInput={(e) => patch({ mapProvider: e.currentTarget.value })}
              />
            </SettingsSection>
            <SettingsSection
              id="telemetry"
              title="Telemetría"
              description="Intervalo de muestreo de posición y sensores de flota."
              onSave={() => saveSection('telemetry')}
            >
              <SelectField
                label="Intervalo de telemetría"
                value={settings().telemetryInterval}
                onChange={(e) => patch({ telemetryInterval: e.currentTarget.value })}
              >
                <For each={refreshOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
            </SettingsSection>
          </Show>

          <Show when={tab() === 'users'}>
            <SettingsSection
              id="roles"
              title="Roles y permisos"
              description="Roles disponibles en el prototipo (gestión completa en fase posterior)."
              onSave={() => saveSection('roles')}
            >
              <div class="grid gap-2 sm:grid-cols-3">
                <For each={['Administrador', 'Supervisor', 'Operador']}>
                  {(role) => (
                    <div class="rounded-md border border-border px-3 py-3 text-sm font-medium text-text-primary dark:border-dark-border dark:text-white">
                      {role}
                    </div>
                  )}
                </For>
              </div>
            </SettingsSection>
            <SettingsSection
              id="accounts"
              title="Cuentas"
              description="Resumen de cuentas activas en el entorno de demostración."
              onSave={() => saveSection('accounts')}
            >
              <p class="text-sm text-text-secondary">
                18 cuentas activas · 3 pendientes de activación · 1 suspendida
              </p>
            </SettingsSection>
          </Show>

          <Show when={tab() === 'security'}>
            <SettingsSection
              id="auth"
              title="Autenticación"
              description="Controles de acceso al panel FEROMAP."
              onSave={() => saveSection('auth')}
            >
              <ToggleSwitch
                label="Requerir autenticación en dos pasos"
                description="Solicita un segundo factor al iniciar sesión."
                checked={settings().require2fa}
                onChange={() => patch({ require2fa: !settings().require2fa })}
              />
            </SettingsSection>
            <SettingsSection
              id="sessions"
              title="Sesiones"
              description="Tiempo máximo de inactividad antes de cerrar la sesión."
              onSave={() => saveSection('sessions')}
            >
              <SelectField
                label="Tiempo de sesión"
                value={settings().sessionTimeout}
                onChange={(e) => patch({ sessionTimeout: e.currentTarget.value })}
              >
                <For each={sessionTimeoutOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
            </SettingsSection>
          </Show>

          <Show when={tab() === 'api'}>
            <SettingsSection
              id="keys"
              title="Claves de API"
              description="Credenciales para integraciones externas (valor enmascarado)."
              onSave={() => saveSection('keys')}
            >
              <div class="flex flex-wrap items-end gap-3">
                <TextField
                  label="Clave activa"
                  class="min-w-[240px] flex-1"
                  value={settings().apiKeyMasked}
                  readOnly
                />
                <Button type="button" variant="outline" size="sm">
                  Rotar clave
                </Button>
              </div>
            </SettingsSection>
            <SettingsSection
              id="limits"
              title="Límites y cuotas"
              description="Tope de solicitudes por minuto para el API público."
              onSave={() => saveSection('limits')}
            >
              <SelectField
                label="Límite de tasa"
                value={settings().rateLimit}
                onChange={(e) => patch({ rateLimit: e.currentTarget.value })}
              >
                <For each={rateLimitOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </SelectField>
            </SettingsSection>
          </Show>
        </div>
      </div>
    </div>
  );
}
