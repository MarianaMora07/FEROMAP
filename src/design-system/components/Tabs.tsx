import { For } from 'solid-js';

/**
 * Patrón único de tabs ARIA (docs/design-system/contratos-ui.md §1).
 *
 * `TabList` gestiona `role="tablist"`, `role="tab"`, roving tabindex y navegación
 * por teclado (flechas, Home/End). El panel lo renderiza el módulo con
 * `role="tabpanel"` enlazado por `aria-controls` (`panelId`) y `aria-labelledby`
 * (`tabButtonId`).
 *
 * Reservado a paneles que se intercambian dentro de la misma pantalla; si cada
 * "pestaña" navega a una ruta, usar enlaces con `aria-current="page"`.
 */

export interface TabItem {
  id: string;
  label: string;
  disabled?: boolean;
}

export function tabButtonId(prefix: string, id: string): string {
  return `${prefix}-tab-${id}`;
}

export function tabPanelId(prefix: string, id: string): string {
  return `${prefix}-panel-${id}`;
}

interface TabListProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  /** Prefijo de ids; cada `TabPanel` debe usar el mismo. */
  idPrefix: string;
  /**
   * `aria-controls` fijo para todas las pestañas. Usar cuando el panel es un
   * único contenedor cuyo contenido y `aria-labelledby` cambian con la pestaña
   * activa (contenido intercalado). Si se omite, cada pestaña apunta a su panel.
   */
  panelId?: string;
  ariaLabel: string;
  containerClass?: string;
  /** Clases del botón según estado (conserva el estilo visual de cada módulo). */
  tabClass: (active: boolean) => string;
  testId?: string;
  testIdFor?: (id: string) => string;
}

export function TabList(props: TabListProps) {
  let listRef: HTMLDivElement | undefined;

  const enabledTabs = () => props.tabs.filter((tab) => !tab.disabled);

  const focusTab = (id: string) => {
    queueMicrotask(() => {
      listRef?.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.focus();
    });
  };

  const activate = (id: string) => {
    props.onChange(id);
    focusTab(id);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const tabs = enabledTabs();
    if (tabs.length === 0) return;
    const currentIndex = Math.max(
      tabs.findIndex((tab) => tab.id === props.active),
      0,
    );
    let next: TabItem | undefined;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = tabs[(currentIndex + 1) % tabs.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
        break;
      case 'Home':
        next = tabs[0];
        break;
      case 'End':
        next = tabs[tabs.length - 1];
        break;
      default:
        return;
    }

    if (!next) return;
    event.preventDefault();
    if (next.id === props.active) focusTab(next.id);
    else activate(next.id);
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={props.ariaLabel}
      class={props.containerClass}
      data-testid={props.testId}
      onKeyDown={handleKeyDown}
    >
      <For each={props.tabs}>
        {(tab) => (
          <button
            type="button"
            role="tab"
            id={tabButtonId(props.idPrefix, tab.id)}
            data-tab={tab.id}
            aria-selected={props.active === tab.id}
            aria-controls={props.panelId ?? tabPanelId(props.idPrefix, tab.id)}
            tabindex={props.active === tab.id ? 0 : -1}
            disabled={tab.disabled}
            data-testid={props.testIdFor?.(tab.id)}
            class={props.tabClass(props.active === tab.id)}
            onClick={() => props.onChange(tab.id)}
          >
            {tab.label}
          </button>
        )}
      </For>
    </div>
  );
}
