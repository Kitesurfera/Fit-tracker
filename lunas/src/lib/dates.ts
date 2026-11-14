// Utilidades de fechas trabajando siempre con cadenas "AAAA-MM-DD" (días de calendario, sin horas).
// Así evitamos los líos de zonas horarias: un día es un día, esté donde esté el servidor.

export type ISODate = string; // "2026-11-14"

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUTC(date: ISODate): number {
  return Date.parse(date + "T00:00:00Z");
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * DAY_MS);
}

/** Días desde `a` hasta `b` (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

/** Fecha de hoy en la zona horaria indicada (por defecto Madrid). */
export function todayIn(timeZone = "Europe/Madrid", now: Date = new Date()): ISODate {
  try {
    // en-CA formatea como AAAA-MM-DD
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Día de la semana empezando en lunes: 0 = lunes … 6 = domingo. */
export function weekdayMondayFirst(date: ISODate): number {
  return (new Date(toUTC(date)).getUTCDay() + 6) % 7;
}

export type MonthKey = string; // "2026-11"

export function monthOf(date: ISODate): MonthKey {
  return date.slice(0, 7);
}

export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Celdas de un calendario mensual (semanas de lunes a domingo, con días de relleno). */
export function monthGrid(month: MonthKey): { date: ISODate; inMonth: boolean }[] {
  const first = `${month}-01`;
  const start = addDays(first, -weekdayMondayFirst(first));
  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const end = addDays(last, 6 - weekdayMondayFirst(last));
  const cells: { date: ISODate; inMonth: boolean }[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    cells.push({ date: d, inMonth: monthOf(d) === month });
  }
  return cells;
}

const LOCALE = "es-ES";

function fmt(date: ISODate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", ...options }).format(new Date(toUTC(date)));
}

/** "14 nov" */
export function formatShort(date: ISODate): string {
  return fmt(date, { day: "numeric", month: "short" }).replace(".", "");
}

/** "14 de noviembre" */
export function formatDayMonth(date: ISODate): string {
  return fmt(date, { day: "numeric", month: "long" });
}

/** "viernes, 14 de noviembre" */
export function formatLong(date: ISODate): string {
  return fmt(date, { weekday: "long", day: "numeric", month: "long" });
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Fecha corta, con año solo si no es el año de referencia: "18 sept" o "18 sept 2025". */
export function formatShortSmart(date: ISODate, reference: ISODate): string {
  return date.slice(0, 4) === reference.slice(0, 4) ? formatShort(date) : formatWithYear(date);
}

/** "14 nov 2026" */
export function formatWithYear(date: ISODate): string {
  return fmt(date, { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
}

/** "noviembre 2026" */
export function formatMonth(month: MonthKey): string {
  return fmt(`${month}-01`, { month: "long", year: "numeric" }).replace(" de ", " ");
}
