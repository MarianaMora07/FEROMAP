const LAST_OPTIMIZED_KEY = 'feromap:lastOptimizedCodes';
const PRIORITY_BOOST_KEY = 'feromap:priorityBoostCodes';

export function readLastOptimizedCodes(): string[] {
  try {
    const raw = localStorage.getItem(LAST_OPTIMIZED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function writeLastOptimizedCodes(codes: string[]): void {
  localStorage.setItem(LAST_OPTIMIZED_KEY, JSON.stringify(codes));
}

export function readLocalPriorityBoostCodes(): string[] {
  try {
    const raw = localStorage.getItem(PRIORITY_BOOST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function writeLocalPriorityBoostCodes(codes: string[]): void {
  localStorage.setItem(PRIORITY_BOOST_KEY, JSON.stringify(codes));
}

export function toggleLocalPriorityBoost(code: string, enabled: boolean): string[] {
  const current = new Set(readLocalPriorityBoostCodes());
  if (enabled) current.add(code);
  else current.delete(code);
  const next = [...current].sort();
  writeLocalPriorityBoostCodes(next);
  return next;
}
