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

// Suma (o resta) días a una fecha AAAA-MM-DD
export function addDaysStr(dateStr: string, days: number): string {
  const date = parseDateStr(dateStr.slice(0, 10));
  date.setDate(date.getDate() + days);
  return localDateStr(date);
}

// Próximo lunes (si hoy es lunes, el de la semana que viene)
export function nextMondayStr(from: Date = new Date()): string {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const daysUntilMonday = ((8 - date.getDay()) % 7) || 7;
  date.setDate(date.getDate() + daysUntilMonday);
  return localDateStr(date);
}

// Acepta 2026-11-10, 10/11/2026, 10-11-26 o 10.11.2026 y devuelve AAAA-MM-DD ('' si no es una fecha válida)
export function normalizeDateInput(value: string): string {
  const v = (value || '').trim();
  let y: number, m: number, d: number;
  let match = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else {
    match = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
    if (!match) return '';
    d = +match[1]; m = +match[2]; y = +match[3]; if (y < 100) y += 2000;
  }
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return '';
  return localDateStr(date);
}
