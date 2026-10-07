// Fecha de hoy en formato AAAA-MM-DD según la hora del dispositivo.
// (toISOString() usa la hora UTC: en España, entre las 00:00 y las 02:00 devolvía el día anterior)
export function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const parseDateStr = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// "Hoy", "Mañana", "Ayer" o "jue 9 oct" (con año si no es el actual)
export function friendlyDate(dateStr?: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr || 'Sin fecha';
  const date = parseDateStr(dateStr.slice(0, 10));
  const today = parseDateStr(localDateStr());
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';
  const options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
  if (date.getFullYear() !== today.getFullYear()) options.year = 'numeric';
  return date.toLocaleDateString('es-ES', options).replace(/[.,]/g, '');
}
