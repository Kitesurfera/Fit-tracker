// Texto corto del objetivo de un ejercicio para los resúmenes de sesión (entrenador y deportista).
// Antes solo se mostraba "series x repeticiones": los ejercicios por tiempo (p. ej. 3 series de 30s)
// aparecían vacíos y en los circuitos HIIT salía "()".

const clean = (v: any) => (v === undefined || v === null ? '' : String(v).trim());

// "10r" o "10" → "10 reps"; "45s" o "8-10" se dejan tal cual
export const formatReps = (v: any) => {
  const s = clean(v);
  if (!s) return '';
  const m = s.match(/^(\d+)\s*(r|rep|reps|repeticiones)?$/i);
  return m ? `${m[1]} reps` : s;
};

// "30" → "30s"; "1m", "45s" o "1:30" se dejan tal cual
export const formatDuration = (v: any) => {
  const s = clean(v);
  if (!s) return '';
  return /^\d+$/.test(s) ? `${s}s` : s;
};

// Fuerza: "3x12", "3x30s", "3x12 · 30s", "45s", "3 series"…
export function strengthTarget(ex: any): string {
  const sets = clean(ex?.sets);
  const reps = clean(ex?.reps);
  const dur = formatDuration(ex?.duration);
  if (sets && (reps || dur)) return [`${sets}x${reps || dur}`, reps && dur ? dur : ''].filter(Boolean).join(' · ');
  if (sets) return `${sets} ${sets === '1' ? 'serie' : 'series'}`;
  return [formatReps(reps), dur].filter(Boolean).join(' · ');
}

// Ejercicio de circuito HIIT: "15 reps", "40s", "15 reps · 40s", "2x 40s"…
export function hiitTarget(he: any): string {
  const sets = clean(he?.sets);
  const reps = formatReps(he?.duration_reps);
  const dur = formatDuration(he?.duration);
  const main = [reps, dur && dur !== reps ? dur : ''].filter(Boolean).join(' · ');
  if (!main) return sets && sets !== '1' ? `${sets} series` : '';
  return sets && sets !== '1' ? `${sets}x ${main}` : main;
}

// Bloque HIIT: "3 vueltas · 15s entre ejercicios"
export function hiitBlockSummary(b: any): string {
  const sets = clean(b?.sets);
  const parts = [sets ? `${sets} ${sets === '1' ? 'vuelta' : 'vueltas'}` : ''];
  if (clean(b?.rest_exercise)) parts.push(`${formatDuration(b.rest_exercise)} entre ejercicios`);
  if (clean(b?.rest_block)) parts.push(`${formatDuration(b.rest_block)} entre vueltas`);
  return parts.filter(Boolean).join(' · ');
}
