export function kebabToCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, g) => g.toUpperCase());
}

export function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

export function rgbToRGBAString(color: RGB, opacity = 1): string {
  const [r, g, b] = [color.r, color.g, color.b].map((c) => Math.round(c * 255));
  return opacity < 1
    ? `rgba(${r}, ${g}, ${b}, ${opacity})`
    : `rgb(${r}, ${g}, ${b})`;
}

/** var(--x, fallback) → fallback; bare var(--x) → removed. */
export function stripCSSVariables(value: string): string {
  return value
    .replace(/var\(\s*[^,)]+,\s*([^)]+)\)/g, "$1")
    .replace(/var\(\s*[^)]+\)/g, "")
    .trim();
}
