export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 || value >= 10 ? Math.round(value) : value.toFixed(1);
  return `${rounded} ${units[unit]}`;
}

export function formatChars(chars: number): string {
  if (!Number.isFinite(chars) || chars <= 0) return '0 字';
  if (chars >= 100_000_000) return `${(chars / 100_000_000).toFixed(1)} 亿字`;
  if (chars >= 10_000) return `${(chars / 10_000).toFixed(1)} 万字`;
  return `${chars} 字`;
}
