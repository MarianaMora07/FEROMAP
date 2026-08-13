/** WCAG relative luminance for #RRGGBB hex colors. */
function relativeLuminance(hex: string): number {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  const transform = (channel: number) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

  const [lr, lg, lb] = [transform(r), transform(g), transform(b)];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** Contrast ratio between two sRGB hex colors (1–21). */
export function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsWcagAaNormalText(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= 4.5;
}

export function meetsWcagAaLargeText(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= 3;
}
