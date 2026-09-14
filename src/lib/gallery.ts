// Local dates must include the entire final day, including its last millisecond.
export function photoDateRange(from: string, to: string) {
  return {
    valid: !(from && to && from > to),
    from: from ? new Date(`${from}T00:00:00`).getTime() : undefined,
    to: to ? new Date(`${to}T23:59:59.999`).getTime() : undefined,
  };
}

export function photoSwipe(dx: number, dy: number, zoom: number): -1 | 0 | 1 {
  if (zoom !== 1 || Math.abs(dx) <= 60 || Math.abs(dx) <= Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}

export function pinchColumns(start: number, scale: number, current: number) {
  if (!Number.isFinite(scale) || scale <= 0) return current;
  const target = Math.max(1, Math.min(6, start / scale));
  // A dead zone around each step keeps small finger movements from flickering.
  return Math.abs(target - current) < 0.65 ? current : Math.round(target);
}

export type GalleryAnchor = { index: number; fraction: number; y: number };

export function galleryAnchor(width: number, columns: number, top: number, x: number, y: number, total: number): GalleryAnchor {
  const step = (width + 6) / columns;
  const row = Math.floor((top + y) / step);
  return {
    index: Math.max(0, Math.min(total - 1, row * columns + Math.max(0, Math.min(columns - 1, Math.floor(x / step))))),
    fraction: Math.max(0, Math.min(1, (top + y - row * step) / (step - 6))),
    y,
  };
}

export function galleryAnchorTop(anchor: GalleryAnchor, width: number, columns: number, height: number, total: number) {
  const step = (width + 6) / columns;
  const top = Math.floor(anchor.index / columns) * step + anchor.fraction * (step - 6) - anchor.y;
  return Math.max(0, Math.min(Math.max(0, Math.ceil(total / columns) * step - height), top));
}

export type PhotoMonth = { month: string; count: number; offset: number };

export function timelineMonthAt(months: PhotoMonth[], index: number) {
  // Buckets follow the current sort order, and offsets always increase.
  let low = 0, high = months.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (months[mid].offset <= index) low = mid + 1;
    else high = mid - 1;
  }
  return Math.max(0, high);
}

export function monthLabel(month: string) {
  const [year, number] = month.split("-");
  return `${year}년 ${Number(number)}월`;
}

export function timelinePointerPosition(y: number, top: number, height: number, count: number) {
  // Match the ruler's 18px end insets; captured drags may leave its bounds.
  const fraction = Math.max(0, Math.min(1, (y - top - 18) / Math.max(1, height - 36)));
  return { fraction, index: Math.round(fraction * Math.max(0, count - 1)) };
}

export function timelineLabelIndices(count: number, height: number, active: number) {
  if (count < 1) return [];
  if (count === 1) return [0];
  const span = Math.max(1, height - 36);
  const slots = Math.min(count, Math.max(2, Math.floor(span / 32) + 1));
  const labels = new Set(Array.from({ length: slots }, (_, index) =>
    Math.round(index / (slots - 1) * (count - 1))));
  labels.add(active);
  // Keep the selected month readable even in a library spanning many years.
  return [...labels].filter((index) => index === active || Math.abs(index - active) / (count - 1) * span >= 26)
    .sort((a, b) => a - b);
}
