/** Clases compartidas de foco visible para controles del sidebar (teclado). */
export const sidebarFocusRingClass =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fero-green focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar';

/** Coincide por pathname; ignora query en href (p. ej. `/map?scope=sector`). */
export function navHrefPath(href: string) {
  return href.split('?')[0] ?? href;
}

export function isNavItemActive(href: string, pathname: string, exact = false) {
  const base = navHrefPath(href);
  if (pathname === base) return true;
  // `exact` evita que un padre quede activo en una subruta propia del menú
  // (p. ej. «Configuración» en `/settings/calibration`).
  if (exact) return false;
  if (base !== '/' && pathname.startsWith(`${base}/`)) return true;
  return false;
}

export function sidebarNavLinkClass(active: boolean) {
  const base = `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-200 ${sidebarFocusRingClass}`;

  if (active) {
    return `${base} bg-nav-active-bg text-nav-active-text shadow-sm ring-1 ring-nav-active-text/15 dark:ring-nav-active-text/25`;
  }

  return `${base} group text-nav hover:bg-sidebar-elevated hover:text-white dark:hover:text-nav`;
}
