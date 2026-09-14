// Local calendar dates, including the entire last day (also on DST changes).
export function albumDateRange(start: string, end: string): { from: number; to: number } | null {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1) return null;
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  };
  const first = parse(start), last = parse(end);
  if (!first || !last || first > last) return null;
  last.setDate(last.getDate() + 1);
  return { from: first.getTime(), to: last.getTime() - 1 };
}
