// Informe de rendimiento de una deportista (HTML autocontenido: estilos y gráficas incluidos, sin depender de internet).
// Se usa para verlo dentro de la app y para generar el PDF.

import { addDaysStr } from './dates';
import { getStandardizedTestName, isLowerBetter } from './tests';
import { SLUG_TRANSLATIONS } from './bodyParts';
import { strengthTarget, hiitBlockSummary } from './exerciseFormat';

export type ReportAi = { workload_analysis?: string; progress_analysis?: string; recommendations?: string[] } | null;

export type ReportInput = {
  athleteName: string;
  athleteSport?: string;
  periodDays: number;           // 7, 30 o 90
  today: string;                // AAAA-MM-DD
  phase: string;                // fase de la planificación
  workouts: any[];
  wellness: any[];
  tests: any[];
  progression: any[];           // marcas por ejercicio/test (las de la pantalla de Analíticas)
  videos: any[];
  ai?: ReportAi;
  coachComment?: string;
};

const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const num = (v: any) => { const n = parseFloat(String(v ?? '').replace(',', '.').replace(/[^\d.-]/g, '')); return isNaN(n) ? null : n; };
const avg = (list: (number | null)[]) => { const xs = list.filter((x): x is number => x !== null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
const fmt = (n: number | null, d = 1) => (n === null ? '–' : (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('es-ES'));
const ddmm = (d: string) => (d ? d.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '');
const ddmmyyyy = (d: string) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '');
const isSkipped = (w: any) => String(w.observations || '').includes('[NO COMPLETADA]');
const isHiitWorkout = (w: any) => (w.exercises || [])[0]?.is_hiit_block === true;

export function computeReportStats(input: ReportInput) {
  const end = input.today;
  const start = addDaysStr(end, -(input.periodDays - 1));
  const inPeriod = (d: string) => !!d && d.slice(0, 10) >= start && d.slice(0, 10) <= end;

  const periodWorkouts = input.workouts.filter(w => inPeriod(w.date)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  // Cuentan para el cumplimiento las sesiones de días pasados y las de hoy que ya están hechas o saltadas
  // (una sesión saltada se guarda como "completed" con el motivo en las observaciones)
  const due = periodWorkouts.filter(w => w.date < end || (w.date === end && w.completed));
  const done = due.filter(w => w.completed && !isSkipped(w));
  const skipped = due.filter(isSkipped);
  const missed = due.filter(w => !w.completed);
  const adherence = due.length ? Math.round((done.length / due.length) * 100) : null;

  const minutesOf = (w: any) => (w.completion_data?.duration_seconds ? w.completion_data.duration_seconds / 60 : null);
  const rpeOf = (w: any) => num(w.completion_data?.rpe);
  const totalMinutes = done.reduce((s, w) => s + (minutesOf(w) || 0), 0);
  const avgRpe = avg(done.map(rpeOf));
  const loadOf = (w: any) => { const r = rpeOf(w), m = minutesOf(w); return r !== null && m !== null ? r * m : 0; };
  const totalLoad = done.reduce((s, w) => s + loadOf(w), 0);

  // Bienestar
  const wellness = input.wellness.filter(x => inPeriod(x.date));
  const byDate: Record<string, any> = {};
  wellness.forEach(x => { byDate[String(x.date).slice(0, 10)] = x; });
  const fatigue = avg(wellness.map(x => num(x.fatigue)));
  const soreness = avg(wellness.map(x => num(x.soreness ?? x.muscle_soreness)));
  const stress = avg(wellness.map(x => num(x.stress)));
  const sleepQ = avg(wellness.map(x => num(x.sleep_quality)));
  const sleepH = avg(wellness.map(x => num(x.sleep_hours)));

  // Molestias: las del registro de bienestar y las marcadas al terminar las sesiones
  const discomfort: Record<string, { count: number; strong: number }> = {};
  const addZone = (zone: string, strong = false) => {
    const k = SLUG_TRANSLATIONS[zone] || zone;
    discomfort[k] = discomfort[k] || { count: 0, strong: 0 };
    discomfort[k].count++; if (strong) discomfort[k].strong++;
  };
  wellness.forEach(x => Object.entries(x.discomforts || {}).forEach(([zone, level]) => addZone(zone, level === 'fuerte')));
  done.forEach(w => (w.completion_data?.sore_joints || []).forEach((z: string) => addZone(z)));
  const discomforts = Object.entries(discomfort).sort((a, b) => b[1].count - a[1].count);

  // Serie diaria (o semanal si el periodo es largo) para la gráfica de carga y fatiga
  const days: string[] = [];
  for (let i = input.periodDays - 1; i >= 0; i--) days.push(addDaysStr(end, -i));
  const dayRpe = (d: string) => Math.max(0, ...done.filter(w => w.date === d).map(w => rpeOf(w) || 0));
  let series = days.map(d => ({
    label: ddmm(d), rpe: dayRpe(d),
    fatigue: num(byDate[d]?.fatigue), soreness: num(byDate[d]?.soreness ?? byDate[d]?.muscle_soreness),
  }));
  if (input.periodDays > 31) {
    const weeks: typeof series = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      const rpes = chunk.map(dayRpe).filter(v => v > 0);
      weeks.push({
        label: ddmm(chunk[0]),
        rpe: rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : 0,
        fatigue: avg(chunk.map(d => num(byDate[d]?.fatigue))),
        soreness: avg(chunk.map(d => num(byDate[d]?.soreness ?? byDate[d]?.muscle_soreness))),
      });
    }
    series = weeks;
  }

  // Carga semanal (RPE × minutos)
  const weeklyLoad: { label: string; load: number; sessions: number }[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    const ws = done.filter(w => chunk.includes(w.date));
    weeklyLoad.push({ label: `${ddmm(chunk[0])}–${ddmm(chunk[chunk.length - 1])}`, load: Math.round(ws.reduce((s, w) => s + loadOf(w), 0)), sessions: ws.length });
  }

  // Tests del periodo con su cambio respecto al anterior
  const testName = (t: any) => getStandardizedTestName(t.custom_name || t.test_name || '');
  const testValue = (t: any) => {
    const l = num(t.value_left), r = num(t.value_right), v = num(t.value);
    if (l !== null || r !== null) return { text: `I ${fmt(l)} / D ${fmt(r)}`, value: Math.max(l || 0, r || 0) };
    return { text: fmt(v, 2), value: v };
  };
  const sortedTests = [...input.tests].filter(t => testName(t)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const testsInPeriod = sortedTests.filter(t => inPeriod(t.date)).map(t => {
    const name = testName(t);
    const prev = [...sortedTests].reverse().find(p => testName(p) === name && String(p.date) < String(t.date));
    const cur = testValue(t), before = prev ? testValue(prev) : null;
    let change: number | null = null, better: boolean | null = null;
    if (before?.value && cur.value !== null) {
      change = ((cur.value - before.value) / Math.abs(before.value)) * 100;
      const lower = isLowerBetter(name, t.unit);
      better = change === 0 ? null : (lower ? change < 0 : change > 0);
    }
    return { name, date: t.date, unit: t.unit || '', value: cur.text, previous: before?.text || '', change, better, measurement: t.test_type === 'medicion' };
  });

  // Mejores marcas (y las conseguidas en el periodo)
  const records = (input.progression || []).filter((p: any) => p.maxW > 0).map((p: any) => {
    const hist = p.history || [];
    const newInPeriod = hist.some((h: any) => inPeriod(h.date) && h.val === p.maxW);
    return { name: p.name, value: `${fmt(p.maxW, 2)} ${p.unit || ''}`.trim(), newInPeriod };
  }).sort((a: any, b: any) => Number(b.newInPeriod) - Number(a.newInPeriod)).slice(0, 10);

  // Vídeos y correcciones del entrenador
  const videos = (input.videos || []).filter(v => inPeriod(v.workout_date || String(v.created_at || '').slice(0, 10)));
  const corrections = videos.flatMap(v => (v.comments || []).filter((c: any) => c.author_role === 'trainer')
    .map((c: any) => ({ exercise: v.exercise_name, text: c.text, time: c.time_s, date: v.workout_date })));
  const notes = done.flatMap(w => [
    ...((w.completion_data?.exercise_results || []).filter((e: any) => e.coach_note && !e.recorded_video_url).map((e: any) => ({ date: w.date, exercise: e.name, text: e.coach_note }))),
    ...((w.completion_data?.hiit_results || []).flatMap((b: any) => (b.hiit_exercises || []).filter((e: any) => e.coach_note && !e.recorded_video_url).map((e: any) => ({ date: w.date, exercise: e.name, text: e.coach_note })))),
  ]);

  const sessions = periodWorkouts.map(w => ({
    date: w.date, title: w.title || 'Sesión',
    type: w.is_test_battery ? 'Tests' : isHiitWorkout(w) ? 'HIIT' : 'Fuerza',
    status: isSkipped(w) ? 'saltada' : w.completed ? 'hecha' : w.date < end ? 'no hecha' : w.date === end ? 'hoy' : 'pendiente',
    reason: isSkipped(w) ? String(w.observations).replace('[NO COMPLETADA] Motivo: ', '').replace('[NO COMPLETADA]', '').trim() : '',
    rpe: rpeOf(w), minutes: minutesOf(w),
    summary: (w.exercises || []).slice(0, 4).map((e: any) => e.is_hiit_block ? `${e.name} (${hiitBlockSummary(e)})` : `${e.name}${strengthTarget(e) ? ` ${strengthTarget(e)}` : ''}`).join(' · '),
  }));

  return {
    start, end, due: due.length, done: done.length, skipped: skipped.length, missed: missed.length, upcoming: periodWorkouts.length - due.length,
    adherence, totalMinutes, avgRpe, totalLoad, fatigue, soreness, stress, sleepQ, sleepH, wellnessDays: wellness.length,
    discomforts, series, weeklyLoad, testsInPeriod, records, videos: videos.length, corrections, notes, sessions,
  };
}

export type ReportStats = ReturnType<typeof computeReportStats>;

// Lo que se manda a la IA para que analice exactamente el periodo del informe
export function buildAiPayload(input: ReportInput, stats: ReportStats) {
  const round = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
  const newRecords = stats.records.filter((r: any) => r.newInPeriod);
  return {
    athlete_name: input.athleteName,
    period_days: input.periodDays,
    current_phase: input.phase,
    fatigue_data: stats.series.map(s => round(s.fatigue)),
    soreness_data: stats.series.map(s => round(s.soreness)),
    recent_workouts_count: stats.done,
    recent_prs: (newRecords.length ? newRecords : stats.records.slice(0, 5)).map((r: any) => `${r.name}: ${r.value}`),
    summary: {
      periodo: `${stats.start} a ${stats.end}`,
      sesiones_programadas_hasta_hoy: stats.due,
      sesiones_hechas: stats.done,
      sesiones_saltadas: stats.skipped,
      sesiones_sin_hacer: stats.missed,
      cumplimiento_pct: stats.adherence,
      minutos_totales: Math.round(stats.totalMinutes),
      rpe_medio: round(stats.avgRpe),
      carga_semanal_rpe_x_min: stats.weeklyLoad.map(w => ({ semana: w.label, carga: w.load, sesiones: w.sessions })),
      fatiga_media: round(stats.fatigue),
      agujetas_media: round(stats.soreness),
      estres_medio: round(stats.stress),
      sueno_horas: round(stats.sleepH),
      sueno_calidad: round(stats.sleepQ),
      dias_con_bienestar: stats.wellnessDays,
      molestias: stats.discomforts.slice(0, 8).map(([zona, d]) => ({ zona, veces: d.count, fuertes: d.strong })),
      tests: stats.testsInPeriod.slice(0, 15).map(t => ({ test: t.name, resultado: `${t.value} ${t.unit}`.trim(), anterior: t.previous || null, cambio_pct: round(t.change), mejora: t.better })),
      motivos_sesiones_saltadas: stats.sessions.filter(s => s.reason).map(s => s.reason).slice(0, 8),
      correcciones_tecnica: [...stats.corrections, ...stats.notes].slice(0, 10).map(c => `${c.exercise}: ${c.text}`),
    },
  };
}

// --- Gráficas en SVG (se ven igual en pantalla, al imprimir y en el PDF) ---
function loadFatigueChart(series: ReportStats['series']) {
  const W = 700, H = 250, L = 34, R = 34, T = 26, B = 34;
  const n = Math.max(series.length, 1), step = (W - L - R) / n, bw = Math.max(3, Math.min(22, step * 0.6));
  const y10 = (v: number) => T + (H - T - B) * (1 - v / 10);
  const y5 = (v: number) => T + (H - T - B) * (1 - v / 5);
  const x = (i: number) => L + step * i + step / 2;
  const grid = [0, 2.5, 5, 7.5, 10].map(v => `<line x1="${L}" x2="${W - R}" y1="${y10(v)}" y2="${y10(v)}" stroke="#e2e8f0"/><text x="${L - 6}" y="${y10(v) + 4}" font-size="10" text-anchor="end" fill="#64748b">${v}</text><text x="${W - R + 6}" y="${y10(v) + 4}" font-size="10" fill="#64748b">${v / 2}</text>`).join('');
  const bars = series.map((s, i) => s.rpe > 0 ? `<rect x="${x(i) - bw / 2}" y="${y10(s.rpe)}" width="${bw}" height="${H - B - y10(s.rpe)}" rx="3" fill="#10b981" opacity="0.55"/>` : '').join('');
  const line = (key: 'fatigue' | 'soreness', color: string, dash = '') => {
    const pts = series.map((s, i) => (s[key] !== null ? `${x(i)},${y5(s[key] as number)}` : null)).filter(Boolean);
    if (!pts.length) return '';
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" ${dash ? `stroke-dasharray="${dash}"` : ''} stroke-linejoin="round"/>` +
      series.map((s, i) => (s[key] !== null ? `<circle cx="${x(i)}" cy="${y5(s[key] as number)}" r="3" fill="${color}"/>` : '')).join('');
  };
  const every = Math.ceil(n / 12);
  const labels = series.map((s, i) => (i % every === 0 ? `<text x="${x(i)}" y="${H - B + 16}" font-size="10" text-anchor="middle" fill="#64748b">${esc(s.label)}</text>` : '')).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Carga y fatiga">${grid}${bars}${line('fatigue', '#ef4444')}${line('soreness', '#f59e0b', '5 4')}${labels}
    <text x="${L - 6}" y="11" font-size="10" text-anchor="end" fill="#10b981" font-weight="700">RPE</text><text x="${W - R + 6}" y="11" font-size="10" fill="#ef4444" font-weight="700">0–5</text></svg>
    <div class="legend"><span><i style="background:#10b981;opacity:.6"></i>Esfuerzo (RPE 0–10)</span><span><i style="background:#ef4444"></i>Fatiga (0–5)</span><span><i style="background:#f59e0b"></i>Agujetas / dolor (0–5)</span></div>`;
}

function weeklyLoadChart(weeks: ReportStats['weeklyLoad']) {
  const W = 700, H = 180, L = 10, R = 10, T = 18, B = 40;
  const max = Math.max(1, ...weeks.map(w => w.load));
  const step = (W - L - R) / Math.max(weeks.length, 1), bw = Math.min(70, step * 0.6);
  const bars = weeks.map((w, i) => {
    const h = ((H - T - B) * w.load) / max, x = L + step * i + (step - bw) / 2;
    return `<rect x="${x}" y="${H - B - h}" width="${bw}" height="${Math.max(h, 1)}" rx="4" fill="#2563eb"/>
      <text x="${x + bw / 2}" y="${H - B - h - 5}" font-size="11" text-anchor="middle" font-weight="700" fill="#0f172a">${w.load || ''}</text>
      <text x="${x + bw / 2}" y="${H - B + 15}" font-size="10" text-anchor="middle" fill="#64748b">${esc(w.label)}</text>
      <text x="${x + bw / 2}" y="${H - B + 28}" font-size="10" text-anchor="middle" fill="#94a3b8">${w.sessions} ses.</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Carga semanal">${bars}</svg>`;
}

const kpi = (value: string, label: string, hint = '') => `<div class="kpi"><div class="kpi-v">${value}</div><div class="kpi-l">${label}</div>${hint ? `<div class="kpi-h">${hint}</div>` : ''}</div>`;

export function buildReportHtml(input: ReportInput, stats: ReportStats = computeReportStats(input)) {
  const periodLabel = input.periodDays === 7 ? 'Últimos 7 días' : input.periodDays === 30 ? 'Últimos 30 días' : 'Últimos 3 meses';
  const ai = input.ai;
  const statusBadge = (s: string) => ({ hecha: '<span class="b ok">Hecha</span>', saltada: '<span class="b bad">Saltada</span>', 'no hecha': '<span class="b warn">No hecha</span>', hoy: '<span class="b info">Hoy</span>', pendiente: '<span class="b muted">Pendiente</span>' } as any)[s] || esc(s);

  const sections: string[] = [];

  sections.push(`<section data-block>
    <h2>Resumen del periodo</h2>
    <div class="kpis">
      ${kpi(`${stats.done}/${stats.due}`, 'Sesiones hechas', stats.adherence !== null ? `${stats.adherence}% de cumplimiento` : '')}
      ${kpi(fmt(stats.totalMinutes / 60), 'Horas de entreno', `${Math.round(stats.totalMinutes)} min`)}
      ${kpi(fmt(stats.avgRpe), 'Esfuerzo medio', 'RPE 0–10')}
      ${kpi(String(Math.round(stats.totalLoad)), 'Carga total', 'RPE × minutos')}
    </div>
    <div class="kpis">
      ${kpi(fmt(stats.fatigue), 'Fatiga media', '0–5')}
      ${kpi(fmt(stats.soreness), 'Agujetas / dolor', '0–5')}
      ${kpi(fmt(stats.stress), 'Estrés medio', '0–5')}
      ${kpi(stats.sleepH !== null ? `${fmt(stats.sleepH)} h` : fmt(stats.sleepQ), 'Sueño', stats.sleepH !== null ? `calidad ${fmt(stats.sleepQ)}/5` : 'calidad 0–5')}
    </div>
    <p class="muted">${[
      stats.skipped ? `${stats.skipped} saltada${stats.skipped > 1 ? 's' : ''}` : '',
      stats.missed ? `${stats.missed} sin hacer` : '',
      stats.upcoming ? `${stats.upcoming} pendiente${stats.upcoming > 1 ? 's' : ''} de hoy` : '',
      `bienestar registrado ${stats.wellnessDays} de ${input.periodDays} días`,
    ].filter(Boolean).join(' · ')}</p>
  </section>`);

  if (ai && (ai.progress_analysis || ai.workload_analysis || ai.recommendations?.length)) {
    sections.push(`<section data-block class="ai">
      <h2>Análisis</h2>
      ${ai.workload_analysis ? `<p><strong>Carga y recuperación.</strong> ${esc(ai.workload_analysis)}</p>` : ''}
      ${ai.progress_analysis ? `<p><strong>Evolución.</strong> ${esc(ai.progress_analysis)}</p>` : ''}
      ${ai.recommendations?.length ? `<p><strong>Recomendaciones</strong></p><ul>${ai.recommendations.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
      <p class="tiny">Análisis generado con inteligencia artificial a partir de los datos registrados. Orientativo: revísalo con tu entrenador.</p>
    </section>`);
  }

  if (input.coachComment?.trim()) {
    sections.push(`<section data-block><h2>Comentario del entrenador</h2><p class="quote">${esc(input.coachComment.trim()).replace(/\n/g, '<br/>')}</p></section>`);
  }

  sections.push(`<section data-block><h2>Carga y fatiga ${input.periodDays > 31 ? '(media semanal)' : '(día a día)'}</h2>${loadFatigueChart(stats.series)}</section>`);
  if (stats.weeklyLoad.some(w => w.load > 0)) {
    sections.push(`<section data-block><h2>Carga semanal</h2><p class="muted">Suma de esfuerzo × minutos de cada sesión. Subidas bruscas (más de un 30% de una semana a otra) aumentan el riesgo de lesión.</p>${weeklyLoadChart(stats.weeklyLoad)}</section>`);
  }

  if (stats.testsInPeriod.length) {
    sections.push(`<section data-block><h2>Tests y medidas del periodo</h2><table>
      <tr><th>Test</th><th>Fecha</th><th>Resultado</th><th>Anterior</th><th>Cambio</th></tr>
      ${stats.testsInPeriod.map(t => `<tr><td>${esc(t.name)}</td><td>${ddmm(t.date)}</td><td><strong>${esc(t.value)}</strong> ${esc(t.unit)}</td><td>${esc(t.previous) || '–'}</td>
        <td class="${t.better === true ? 'up' : t.better === false ? 'down' : ''}">${t.change === null ? '–' : `${t.change > 0 ? '+' : ''}${fmt(t.change)}%`}</td></tr>`).join('')}
    </table></section>`);
  }

  if (stats.records.length) {
    sections.push(`<section data-block><h2>Mejores marcas</h2><div class="chips">${stats.records.map((r: any) =>
      `<div class="chip${r.newInPeriod ? ' new' : ''}"><span>${esc(r.name)}</span><strong>${esc(r.value)}</strong>${r.newInPeriod ? '<em>¡Nueva!</em>' : ''}</div>`).join('')}</div></section>`);
  }

  if (stats.discomforts.length) {
    sections.push(`<section data-block><h2>Molestias registradas</h2><div class="chips">${stats.discomforts.map(([zone, d]) =>
      `<div class="chip${d.strong ? ' warnc' : ''}"><span>${esc(zone)}</span><strong>${d.count} ${d.count === 1 ? 'vez' : 'veces'}</strong>${d.strong ? `<em>${d.strong} fuerte${d.strong > 1 ? 's' : ''}</em>` : ''}</div>`).join('')}</div></section>`);
  }

  if (stats.corrections.length || stats.notes.length || stats.videos) {
    sections.push(`<section data-block><h2>Técnica y feedback del entrenador</h2>
      <p class="muted">${stats.videos} vídeo${stats.videos === 1 ? '' : 's'} de técnica en el periodo · ${stats.corrections.length} corrección${stats.corrections.length === 1 ? '' : 'es'}</p>
      <ul class="fb">${[...stats.corrections.map(c => `<li><strong>${esc(c.exercise || 'Vídeo')}</strong>${c.time != null ? ` <span class="t">${Math.floor(c.time / 60)}:${String(Math.round(c.time % 60)).padStart(2, '0')}</span>` : ''} — ${esc(c.text)} <span class="d">${ddmm(c.date)}</span></li>`),
        ...stats.notes.map(n => `<li><strong>${esc(n.exercise)}</strong> — ${esc(n.text)} <span class="d">${ddmm(n.date)}</span></li>`)].join('')}</ul></section>`);
  }

  if (stats.sessions.length) {
    sections.push(`<section data-block><h2>Sesiones del periodo</h2><table>
      <tr><th>Fecha</th><th>Sesión</th><th>Estado</th><th>RPE</th><th>Min</th></tr>
      ${stats.sessions.map(s => `<tr><td>${ddmm(s.date)}</td><td><strong>${esc(s.title)}</strong> <span class="b muted">${s.type}</span>${s.summary ? `<div class="tiny">${esc(s.summary)}</div>` : ''}${s.reason ? `<div class="tiny">Motivo: ${esc(s.reason)}</div>` : ''}</td>
        <td>${statusBadge(s.status)}</td><td>${s.rpe ?? '–'}</td><td>${s.minutes ? Math.round(s.minutes) : '–'}</td></tr>`).join('')}
    </table></section>`);
  }

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Informe ${esc(input.athleteName)} ${ddmmyyyy(input.today)}</title>
<style>
  *{box-sizing:border-box} body{margin:0;background:#f8fafc;color:#0f172a;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:794px;margin:0 auto;padding:28px 24px 40px}
  header{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;border-bottom:3px solid #2563eb;padding-bottom:14px;margin-bottom:18px}
  .brand{font-size:11px;font-weight:800;letter-spacing:2px;color:#2563eb;text-transform:uppercase}
  h1{margin:4px 0 2px;font-size:26px;line-height:1.15} .sub{color:#64748b;font-size:13px}
  .meta{text-align:right;font-size:12px;color:#475569}
  section{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin-bottom:14px}
  h2{margin:0 0 10px;font-size:15px;color:#1e3a8a;text-transform:uppercase;letter-spacing:.6px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px}
  .kpi{background:#f1f5f9;border-radius:12px;padding:10px;text-align:center} .kpi-v{font-size:22px;font-weight:900} .kpi-l{font-size:11px;font-weight:800;color:#475569;text-transform:uppercase} .kpi-h{font-size:11px;color:#64748b}
  .muted{color:#64748b;font-size:12px;margin:4px 0 8px} .tiny{color:#64748b;font-size:11px}
  .ai{border-left:4px solid #2563eb} .ai p{margin:6px 0} ul{margin:6px 0;padding-left:20px}
  .quote{font-style:italic;margin:0;font-size:14px}
  .legend{display:flex;flex-wrap:wrap;gap:14px;font-size:11px;color:#475569;margin-top:4px} .legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
  table{width:100%;border-collapse:collapse;font-size:12px} th{text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;border-bottom:1px solid #e2e8f0;padding:6px 4px} td{border-bottom:1px solid #f1f5f9;padding:7px 4px;vertical-align:top}
  td.up{color:#059669;font-weight:800} td.down{color:#dc2626;font-weight:800}
  .b{display:inline-block;border-radius:8px;padding:1px 7px;font-size:10px;font-weight:800} .ok{background:#d1fae5;color:#047857} .bad{background:#fee2e2;color:#b91c1c} .warn{background:#fef3c7;color:#b45309} .info{background:#dbeafe;color:#1d4ed8} .muted.b{background:#f1f5f9;color:#475569}
  .chips{display:flex;flex-wrap:wrap;gap:8px} .chip{background:#f1f5f9;border-radius:12px;padding:8px 10px;display:flex;flex-direction:column;min-width:120px} .chip span{font-size:11px;color:#475569} .chip strong{font-size:15px} .chip em{font-style:normal;font-size:10px;font-weight:800;color:#047857}
  .chip.new{background:#ecfdf5;border:1px solid #a7f3d0} .chip.warnc{background:#fef2f2;border:1px solid #fecaca} .chip.warnc em{color:#b91c1c}
  .fb{padding-left:18px} .fb li{margin:6px 0} .fb .t{background:#2563eb;color:#fff;border-radius:6px;padding:0 5px;font-size:10px;font-weight:800} .fb .d{color:#94a3b8;font-size:11px}
  footer{text-align:center;color:#94a3b8;font-size:11px;margin-top:18px}
  @media (max-width:600px){.page{padding:16px 12px 28px} .kpis{grid-template-columns:repeat(2,1fr)} header{flex-direction:column;align-items:flex-start} .meta{text-align:left} h1{font-size:22px}}
  @media print{body{background:#fff} .page{padding:0} section{break-inside:avoid}}
</style></head><body><div class="page">
<header data-block>
  <div><div class="brand">AM Coaching · Informe de rendimiento</div><h1>${esc(input.athleteName)}</h1>
  <div class="sub">${[input.athleteSport, input.phase].filter(Boolean).map(esc).join(' · ')}</div></div>
  <div class="meta"><strong>${periodLabel}</strong><br/>${ddmmyyyy(stats.start)} – ${ddmmyyyy(stats.end)}</div>
</header>
${sections.join('\n')}
<footer data-block>Generado el ${ddmmyyyy(input.today)} con AM Coaching</footer>
</div></body></html>`;
}
