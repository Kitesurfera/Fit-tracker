// Cálculos del ciclo: medias, fase actual, predicciones y ventana fértil.
// Son funciones puras (sin base de datos) para poder probarlas con `npm test`.
//
// Ojo: son estimaciones orientativas con el método del calendario.
// No sirven como método anticonceptivo ni sustituyen a una profesional sanitaria.

import { addDays, diffDays, formatShort, maxDate, minDate, type ISODate } from "./dates.ts";

export type PeriodInput = { id?: string; start: ISODate; end: ISODate | null };

export type CycleSettings = { cycleLength: number; periodLength: number };

export const LIMITS = {
  cycleMin: 18,
  cycleMax: 60,
  periodMin: 1,
  periodMax: 15,
  /** Una regla sin fecha de fin se considera "en curso" durante estos días como mucho. */
  openPeriodMaxDays: 10,
  /** Ciclos usados para calcular la media. */
  historyWindow: 6,
  /** Días antes de la regla en los que se estima la ovulación (fase lútea típica). */
  lutealDays: 14,
  /** Si el retraso supera esto, los datos se consideran desactualizados. */
  staleAfterLateDays: 45,
} as const;

export const DEFAULT_SETTINGS: CycleSettings = { cycleLength: 28, periodLength: 5 };

export type Phase = "menstrual" | "folicular" | "ovulatoria" | "lutea";

export type CycleStats = {
  cycleLength: number;
  periodLength: number;
  cycleFromHistory: boolean;
  periodFromHistory: boolean;
  cyclesCounted: number;
  shortestCycle: number | null;
  longestCycle: number | null;
  /** Duración de cada ciclo completo (para el historial), indexado por inicio de regla. */
  cycleLengthByStart: Record<ISODate, number>;
};

export function sortPeriods<T extends PeriodInput>(periods: T[]): T[] {
  return [...periods].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

function average(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function computeStats(periods: PeriodInput[], settings: CycleSettings): CycleStats {
  const sorted = sortPeriods(periods);
  const cycleLengthByStart: Record<ISODate, number> = {};
  const cycles: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const len = diffDays(sorted[i].start, sorted[i + 1].start);
    cycleLengthByStart[sorted[i].start] = len;
    if (len >= LIMITS.cycleMin && len <= LIMITS.cycleMax) cycles.push(len);
  }
  const recentCycles = cycles.slice(-LIMITS.historyWindow);

  const lengths = sorted
    .filter((p) => p.end !== null)
    .map((p) => diffDays(p.start, p.end as ISODate) + 1)
    .filter((n) => n >= LIMITS.periodMin && n <= LIMITS.periodMax)
    .slice(-LIMITS.historyWindow);

  return {
    cycleLength: recentCycles.length ? Math.round(average(recentCycles)) : settings.cycleLength,
    periodLength: lengths.length ? Math.round(average(lengths)) : settings.periodLength,
    cycleFromHistory: recentCycles.length > 0,
    periodFromHistory: lengths.length > 0,
    cyclesCounted: recentCycles.length,
    shortestCycle: recentCycles.length ? Math.min(...recentCycles) : null,
    longestCycle: recentCycles.length ? Math.max(...recentCycles) : null,
    cycleLengthByStart,
  };
}

export type ResolvedPeriod = {
  start: ISODate;
  /** Último día real (o estimado si no se marcó el final). */
  end: ISODate;
  /** Sigue en curso hoy (no tiene fecha de fin y empezó hace poco). */
  ongoing: boolean;
  /** El final es una estimación porque nunca se marcó. */
  estimatedEnd: boolean;
  /** Si está en curso: hasta cuándo esperamos que dure. */
  expectedEnd: ISODate;
};

export function resolvePeriod(p: PeriodInput, today: ISODate, periodLength: number): ResolvedPeriod {
  const typicalEnd = addDays(p.start, periodLength - 1);
  if (p.end) {
    return { start: p.start, end: p.end, ongoing: false, estimatedEnd: false, expectedEnd: p.end };
  }
  const daysSinceStart = diffDays(p.start, today);
  if (daysSinceStart >= 0 && daysSinceStart < LIMITS.openPeriodMaxDays) {
    return { start: p.start, end: today, ongoing: true, estimatedEnd: false, expectedEnd: maxDate(today, typicalEnd) };
  }
  return { start: p.start, end: typicalEnd, ongoing: false, estimatedEnd: true, expectedEnd: typicalEnd };
}

export type CycleStatus = {
  hasData: boolean;
  today: ISODate;
  stats: CycleStats;
  /** Llevan mucho sin registrar nada: no tiene sentido predecir. */
  stale: boolean;
  lastPeriod: ResolvedPeriod | null;
  cycleDay: number | null;
  phase: Phase | null;
  onPeriod: boolean;
  periodDay: number | null;
  /** Inicio previsto de la próxima regla (sin ajustar por retraso). */
  nextStart: ISODate | null;
  daysUntilNext: number | null;
  lateDays: number;
  ovulation: ISODate | null;
  fertileStart: ISODate | null;
  fertileEnd: ISODate | null;
};

export function fertileWindowFor(nextStart: ISODate): { ovulation: ISODate; start: ISODate; end: ISODate } {
  const ovulation = addDays(nextStart, -LIMITS.lutealDays);
  return { ovulation, start: addDays(ovulation, -5), end: addDays(ovulation, 1) };
}

export function cycleStatus(periods: PeriodInput[], settings: CycleSettings, today: ISODate): CycleStatus {
  const stats = computeStats(periods, settings);
  const past = sortPeriods(periods).filter((p) => p.start <= today);
  const empty: CycleStatus = {
    hasData: false,
    today,
    stats,
    stale: false,
    lastPeriod: null,
    cycleDay: null,
    phase: null,
    onPeriod: false,
    periodDay: null,
    nextStart: null,
    daysUntilNext: null,
    lateDays: 0,
    ovulation: null,
    fertileStart: null,
    fertileEnd: null,
  };
  if (past.length === 0) return empty;

  const last = resolvePeriod(past[past.length - 1], today, stats.periodLength);
  const cycleDay = diffDays(last.start, today) + 1;
  const nextStart = addDays(last.start, stats.cycleLength);
  const daysUntilNext = diffDays(today, nextStart);
  const onPeriod = today >= last.start && today <= last.end;
  const lateDays = !onPeriod && daysUntilNext < 0 ? -daysUntilNext : 0;
  const stale = lateDays > LIMITS.staleAfterLateDays;
  const fertile = fertileWindowFor(nextStart);

  let phase: Phase;
  if (onPeriod) phase = "menstrual";
  else if (today < fertile.start) phase = "folicular";
  else if (today <= fertile.end) phase = "ovulatoria";
  else phase = "lutea";

  return {
    hasData: true,
    today,
    stats,
    stale,
    lastPeriod: last,
    cycleDay,
    phase: stale ? null : phase,
    onPeriod,
    periodDay: onPeriod ? diffDays(last.start, today) + 1 : null,
    nextStart: stale ? null : nextStart,
    daysUntilNext: stale ? null : daysUntilNext,
    lateDays,
    ovulation: stale ? null : fertile.ovulation,
    fertileStart: stale ? null : fertile.start,
    fertileEnd: stale ? null : fertile.end,
  };
}

export type DayMark = {
  period: boolean;
  predictedPeriod: boolean;
  fertile: boolean;
  ovulation: boolean;
};

/**
 * Marca cada día del rango [from, to] con: regla registrada, regla prevista,
 * días fértiles estimados y ovulación estimada.
 */
export function markDays(
  periods: PeriodInput[],
  settings: CycleSettings,
  today: ISODate,
  from: ISODate,
  to: ISODate,
): Map<ISODate, DayMark> {
  const marks = new Map<ISODate, DayMark>();
  const get = (d: ISODate) => {
    let m = marks.get(d);
    if (!m) {
      m = { period: false, predictedPeriod: false, fertile: false, ovulation: false };
      marks.set(d, m);
    }
    return m;
  };
  const markRange = (a: ISODate, b: ISODate, key: keyof DayMark) => {
    const start = maxDate(a, from);
    const end = minDate(b, to);
    for (let d = start; d <= end; d = addDays(d, 1)) get(d)[key] = true;
  };
  const markFertile = (nextStart: ISODate) => {
    const w = fertileWindowFor(nextStart);
    markRange(w.start, w.end, "fertile");
    markRange(w.ovulation, w.ovulation, "ovulation");
  };

  const status = cycleStatus(periods, settings, today);
  const { periodLength, cycleLength } = status.stats;
  const sorted = sortPeriods(periods).filter((p) => p.start <= today);

  sorted.forEach((p, i) => {
    const r = resolvePeriod(p, today, periodLength);
    markRange(r.start, r.end, "period");
    if (r.ongoing && r.expectedEnd > today) markRange(addDays(today, 1), r.expectedEnd, "predictedPeriod");
    const next = sorted[i + 1];
    if (next) markFertile(next.start);
  });

  if (!status.hasData || status.stale || !status.nextStart) return marks;

  // Ciclo actual: ventana fértil hasta la próxima regla prevista
  markFertile(status.nextStart);

  // Reglas futuras previstas (si hay retraso, la siguiente se espera desde hoy)
  let predicted = maxDate(status.nextStart, today);
  if (status.onPeriod) predicted = status.nextStart;
  for (let i = 0; i < 24 && predicted <= to; i++) {
    markRange(predicted, addDays(predicted, periodLength - 1), "predictedPeriod");
    const following = addDays(predicted, cycleLength);
    markFertile(following);
    predicted = following;
  }

  // Lo registrado manda sobre lo previsto
  for (const m of marks.values()) {
    if (m.period) m.predictedPeriod = false;
  }
  return marks;
}

export type CheckResult = { ok: true; autoClose?: { id: string; end: ISODate } } | { ok: false; error: string };

/**
 * Comprueba que una regla nueva o editada tiene sentido y no se solapa con otras.
 * Si hay una regla abierta (sin fin) anterior a la nueva, propone cerrarla automáticamente.
 */
export function checkPeriod(
  existing: PeriodInput[],
  candidate: PeriodInput,
  today: ISODate,
  periodLength: number,
): CheckResult {
  const { start, end } = candidate;
  if (start > today) return { ok: false, error: "No puedes registrar una regla que todavía no ha empezado." };
  if (end !== null) {
    if (end < start) return { ok: false, error: "El último día no puede ser anterior al primero." };
    if (end > today) return { ok: false, error: "El último día no puede ser en el futuro." };
    if (diffDays(start, end) + 1 > LIMITS.periodMax)
      return { ok: false, error: `Una regla de más de ${LIMITS.periodMax} días es poco habitual: revisa las fechas.` };
  }

  const others = sortPeriods(existing.filter((p) => !candidate.id || p.id !== candidate.id));
  let autoClose: { id: string; end: ISODate } | undefined;
  const candidateEnd = end ?? start;

  for (const o of others) {
    let oEnd: ISODate;
    if (o.end === null) {
      if (start > o.start && o.id) {
        // La abierta anterior se cierra con su duración habitual (y siempre antes de la nueva)
        oEnd = minDate(addDays(start, -1), addDays(o.start, periodLength - 1));
        autoClose = { id: o.id, end: oEnd };
      } else {
        oEnd = resolvePeriod(o, today, periodLength).end;
      }
    } else {
      oEnd = o.end;
    }
    if (start <= oEnd && o.start <= candidateEnd) {
      return { ok: false, error: `Se solapa con la regla del ${formatShort(o.start)}.` };
    }
    if (end === null && o.start > start) {
      return { ok: false, error: "Hay reglas registradas después de esta fecha: indica también el último día." };
    }
  }
  return autoClose ? { ok: true, autoClose } : { ok: true };
}

/** Días de diferencia (circular) entre el inicio de dos ciclos. */
export function syncDistance(aStart: ISODate, bStart: ISODate, cycleLength: number): number {
  const diff = Math.abs(diffDays(aStart, bStart)) % cycleLength;
  return Math.min(diff, cycleLength - diff);
}
