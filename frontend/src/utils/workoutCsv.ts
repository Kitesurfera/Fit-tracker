// Lector y plantilla UNIVERSAL de sesiones en CSV.
//
// Una sola plantilla sirve para todo: un día o varios, fuerza o circuito HIIT.
// - Una fila = un ejercicio.
// - Fecha y Sesión vacías = las mismas que la fila de arriba (así no hay que repetirlas).
// - Si rellenas la columna "Bloque", esa sesión es un circuito HIIT; si la dejas vacía, es de fuerza.
// - La fecha puede ser 10/11/2026, 2026-11-10 o un número de día (1, 2, 3...) que se cuenta desde la
//   fecha de inicio que eliges al importar.
// También entiende las plantillas antiguas (fuerza, HIIT y multi-día), separadas por comas o por punto y coma.

import { addDaysStr, localDateStr, nextMondayStr, normalizeDateInput } from './dates';

export type StrengthExercise = {
  _key: string; name: string; sets: string; reps: string; duration: string; weight: string;
  rest: string; rest_exercise: string; video_url: string; exercise_notes: string; image_path: string;
  is_unilateral: boolean; group_sets: string;
};
export type HiitExercise = {
  _key: string; name: string; sets: string; duration_reps: string; duration: string;
  exercise_notes: string; video_url: string; is_unilateral: boolean;
};
export type HiitBlock = {
  _key: string; name: string; sets: string; rest_exercise: string; rest_block: string; rest_between_blocks: string;
  exercises: HiitExercise[];
};
export type WorkoutType = 'traditional' | 'hiit';

export type ImportedSession = {
  key: string;
  date: string;              // AAAA-MM-DD, o '' si no venía en el archivo
  dayOffset: number | null;  // "Día 3" → 2 días después de la fecha de inicio
  title: string;
  notes: string;
  type: WorkoutType;
  exercises: StrengthExercise[];
  blocks: HiitBlock[];
  exerciseCount: number;
};

export type CsvParseResult = { sessions: ImportedSession[]; warnings: string[]; error?: string };

type Field = 'date' | 'title' | 'notes' | 'block' | 'blockSets' | 'name' | 'sets' | 'reps' | 'duration' | 'weight'
  | 'rest' | 'restExercise' | 'restRound' | 'restBlock' | 'unilateral' | 'video' | 'exNotes';

// Nombres de columna que reconocemos (ya "limpios": minúsculas, sin tildes, sin lo que va entre paréntesis)
const ALIASES: Record<Field, string[]> = {
  date: ['fecha', 'dia', 'fecha sesion', 'date'],
  title: ['sesion', 'titulo', 'titulo sesion', 'nombre sesion', 'sesion titulo', 'titulo de la sesion'],
  notes: ['indicaciones sesion', 'indicaciones generales', 'indicaciones', 'notas sesion', 'observaciones sesion'],
  block: ['bloque', 'bloque hiit', 'nom bloque', 'nombre bloque', 'circuito', 'bloque circuito'],
  blockSets: ['vueltas bloque', 'vueltas', 'rondas', 'rondas bloque', 'vueltas del bloque'],
  name: ['ejercicio', 'nombre ejercicio', 'nom ejercicio', 'nombre', 'nombre del ejercicio'],
  sets: ['series', 'series ex', 'series ejercicio', 'sets'],
  reps: ['reps', 'repeticiones', 'reps dur', 'reps duracion', 'rep'],
  duration: ['duracion', 'tiempo', 'duracion ejercicio', 'tiempo ejercicio'],
  weight: ['peso', 'kg', 'carga', 'peso kg'],
  rest: ['descanso series', 'descanso serie', 'desc serie', 'desc series', 'descanso entre series'],
  restExercise: ['descanso tras ejercicio', 'descanso entre ejercicios', 'desc ejercicio', 'desc ex', 'descanso ejercicio', 'desc ejercicios'],
  restRound: ['descanso entre vueltas', 'descanso vueltas', 'desc vuelta', 'desc vueltas', 'descanso vuelta'],
  restBlock: ['descanso tras bloque', 'descanso entre bloques', 'desc bloques', 'desc bloque', 'descanso bloques', 'cambio bloque'],
  unilateral: ['unilateral'],
  video: ['video', 'url video', 'video url', 'enlace video', 'url', 'youtube'],
  exNotes: ['notas ejercicio', 'notas', 'observaciones', 'observaciones ejercicio', 'notas del ejercicio'],
};

// Columnas de la plantilla nueva, en orden
export const TEMPLATE_COLUMNS: { field: Field; header: string; help: string }[] = [
  { field: 'date', header: 'Fecha (DD/MM/AAAA o nº de día)', help: 'Día de la sesión. Vacía = la de la fila de arriba. Puedes poner 1, 2, 3… y elegir la fecha de inicio al importar.' },
  { field: 'title', header: 'Sesión', help: 'Nombre de la sesión. Vacía = la de la fila de arriba.' },
  { field: 'notes', header: 'Indicaciones sesión', help: 'Indicaciones generales. Basta con ponerlas en la primera fila de la sesión.' },
  { field: 'block', header: 'Bloque HIIT (vacío = fuerza)', help: 'Solo para circuitos: nombre del bloque. Vacía = mismo bloque que arriba. Si la sesión no tiene ningún bloque, es de fuerza.' },
  { field: 'blockSets', header: 'Vueltas bloque', help: 'Solo HIIT: vueltas del bloque (en la primera fila del bloque).' },
  { field: 'name', header: 'Ejercicio', help: 'Nombre del ejercicio (obligatorio).' },
  { field: 'sets', header: 'Series', help: 'Número de series.' },
  { field: 'reps', header: 'Reps', help: 'Repeticiones.' },
  { field: 'duration', header: 'Duración (ej. 45s)', help: 'Tiempo de trabajo: 45s, 1m…' },
  { field: 'weight', header: 'Peso (kg)', help: 'Solo fuerza: carga prescrita.' },
  { field: 'rest', header: 'Descanso series', help: 'Solo fuerza: descanso entre series (90s, 2m…).' },
  { field: 'restExercise', header: 'Descanso tras ejercicio', help: 'Fuerza: descanso antes del siguiente ejercicio. HIIT: descanso entre ejercicios del bloque.' },
  { field: 'restRound', header: 'Descanso entre vueltas', help: 'Solo HIIT: descanso al acabar cada vuelta.' },
  { field: 'restBlock', header: 'Descanso tras bloque', help: 'Solo HIIT: descanso antes del siguiente bloque.' },
  { field: 'unilateral', header: 'Unilateral (Sí/No)', help: 'Sí = se hace con cada lado (doble temporizador).' },
  { field: 'video', header: 'Vídeo (URL)', help: 'Enlace de YouTube u otro vídeo.' },
  { field: 'exNotes', header: 'Notas ejercicio', help: 'Observaciones técnicas del ejercicio.' },
];

const newKey = () => Math.random().toString(36).slice(2);

export const normalizeHeader = (h: string) =>
  (h || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const FIELD_BY_ALIAS: Record<string, Field> = Object.entries(ALIASES).reduce((acc, [field, list]) => {
  list.forEach(alias => { acc[alias] = field as Field; });
  return acc;
}, {} as Record<string, Field>);

const YES = ['si', 's', 'x', 'yes', 'y', 'true', '1', 'verdadero'];
export const isYes = (v: string) => YES.includes(normalizeHeader(v));

// Separador: "sep=;" (Excel) o el que más aparece en la primera línea con contenido (; , o tabulador)
export function detectDelimiter(text: string): string {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const sep = line.match(/^"?sep=(.)"?$/i);
    if (sep) return sep[1];
    const outsideQuotes = line.replace(/"[^"]*"/g, '');
    const counts = [';', ',', '\t'].map(d => ({ d, n: outsideQuotes.split(d).length - 1 }));
    counts.sort((a, b) => b.n - a.n);
    return counts[0].n > 0 ? counts[0].d : ',';
  }
  return ',';
}

export function parseCSV(input: string, delimiter?: string): string[][] {
  const str = input.replace(/^﻿/, '');
  const delim = delimiter || detectDelimiter(str);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quote = false;
  for (let c = 0; c < str.length; c++) {
    const cc = str[c], nc = str[c + 1];
    if (quote) {
      if (cc === '"' && nc === '"') { cell += '"'; c++; }
      else if (cc === '"') quote = false;
      else cell += cc;
      continue;
    }
    if (cc === '"') { quote = true; continue; }
    if (cc === delim) { row.push(cell); cell = ''; continue; }
    if (cc === '\r' || cc === '\n') {
      if (cc === '\r' && nc === '\n') c++;
      row.push(cell); rows.push(row); row = []; cell = '';
      continue;
    }
    cell += cc;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Lee la fecha de una celda. Devuelve la fecha, un desplazamiento en días o un error.
function readDateCell(raw: string): { date: string; offset: number | null } | null {
  const v = raw.trim();
  const day = v.match(/^(?:d[ií]a|day|d)?\s*(\d{1,3})$/i);
  if (day) {
    const n = parseInt(day[1], 10);
    if (n >= 1 && n <= 366) return { date: '', offset: n - 1 };
  }
  if (/^\d{5}$/.test(v)) { // Número de serie de fecha de Excel (p. ej. 46336)
    const base = new Date(1899, 11, 30);
    base.setDate(base.getDate() + parseInt(v, 10));
    return { date: localDateStr(base), offset: null };
  }
  const date = normalizeDateInput(v.split(/\s+/)[0]); // "10/11/2026 0:00" → "10/11/2026"
  return date ? { date, offset: null } : null;
}

export function parseWorkoutCsv(text: string): CsvParseResult {
  const warnings: string[] = [];
  const rows = parseCSV(text);
  const isBlank = (r: string[]) => !r.some(c => (c || '').trim());
  const isComment = (r: string[]) => (r.find(c => (c || '').trim()) || '').trim().startsWith('#');

  // 1. Buscar la fila de títulos (la primera que tenga una columna de ejercicio)
  let headerIdx = -1;
  let columns: (Field | null)[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (isBlank(r) || isComment(r) || /^"?sep=/i.test((r[0] || '').trim())) continue;
    const mapped = r.map(h => FIELD_BY_ALIAS[normalizeHeader(h)] || null);
    if (mapped.includes('name')) { headerIdx = i; columns = mapped; break; }
  }
  if (headerIdx === -1) {
    return { sessions: [], warnings, error: 'No encuentro la columna «Ejercicio». Usa la plantilla de la app (o pon una fila de títulos con las columnas).' };
  }
  const unknown = rows[headerIdx].filter((h, i) => h.trim() && !columns[i]);
  if (unknown.length) warnings.push(`Columnas que no reconozco y se ignoran: ${unknown.map(h => `«${h.trim()}»`).join(', ')}.`);
  // Si una columna aparece dos veces, usamos la primera
  const colIndex: Partial<Record<Field, number>> = {};
  columns.forEach((f, i) => { if (f && colIndex[f] === undefined) colIndex[f] = i; });
  const get = (r: string[], f: Field) => (colIndex[f] !== undefined ? (r[colIndex[f]!] || '').trim() : '');

  // 2. Agrupar filas por sesión
  type Draft = { key: string; date: string; dayOffset: number | null; title: string; notes: string; rows: { r: string[]; line: number }[] };
  const drafts = new Map<string, Draft>();
  let curDateRaw = '';
  let curTitle = '';
  const badDates: number[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (isBlank(r) || isComment(r)) continue;
    const dateCell = get(r, 'date');
    const titleCell = get(r, 'title');
    if (dateCell) curDateRaw = dateCell;
    if (titleCell) curTitle = titleCell;

    let parsedDate: { date: string; offset: number | null } = { date: '', offset: null };
    if (curDateRaw) {
      const d = readDateCell(curDateRaw);
      if (!d) { badDates.push(i + 1); continue; }
      parsedDate = d;
    }
    const key = `${parsedDate.date}|${parsedDate.offset ?? ''}|${curTitle}`;
    if (!drafts.has(key)) drafts.set(key, { key, date: parsedDate.date, dayOffset: parsedDate.offset, title: curTitle, notes: '', rows: [] });
    const draft = drafts.get(key)!;
    if (!draft.notes && get(r, 'notes')) draft.notes = get(r, 'notes');
    draft.rows.push({ r, line: i + 1 });
  }
  if (badDates.length) warnings.push(`Fechas que no entiendo en las filas ${badDates.join(', ')}: se han saltado. Usa DD/MM/AAAA, AAAA-MM-DD o un número de día.`);

  // 3. Convertir cada sesión en ejercicios de fuerza o bloques HIIT
  const sessions: ImportedSession[] = [];
  drafts.forEach(draft => {
    const exRows = draft.rows.filter(({ r }) => get(r, 'name'));
    if (exRows.length === 0) return;
    const isHiit = draft.rows.some(({ r }) => get(r, 'block'));
    const session: ImportedSession = {
      key: draft.key, date: draft.date, dayOffset: draft.dayOffset, title: draft.title, notes: draft.notes,
      type: isHiit ? 'hiit' : 'traditional', exercises: [], blocks: [], exerciseCount: exRows.length,
    };

    if (!isHiit) {
      session.exercises = exRows.map(({ r }) => ({
        _key: newKey(), name: get(r, 'name'), sets: get(r, 'sets'), reps: get(r, 'reps'), duration: get(r, 'duration'),
        weight: get(r, 'weight'), rest: get(r, 'rest'), rest_exercise: get(r, 'restExercise'), video_url: get(r, 'video'),
        exercise_notes: get(r, 'exNotes'), image_path: '', is_unilateral: isYes(get(r, 'unilateral')), group_sets: '1',
      }));
    } else {
      let current: HiitBlock | null = null;
      draft.rows.forEach(({ r }) => {
        const blockName = get(r, 'block');
        if (!current || (blockName && blockName !== current.name)) {
          current = { _key: newKey(), name: blockName || `Bloque ${session.blocks.length + 1}`, sets: '', rest_exercise: '', rest_block: '', rest_between_blocks: '', exercises: [] };
          session.blocks.push(current);
        }
        const b: HiitBlock = current;
        // Los datos del bloque se toman de la primera fila del bloque que los tenga
        if (!b.sets && get(r, 'blockSets')) b.sets = get(r, 'blockSets');
        if (!b.rest_exercise && get(r, 'restExercise')) b.rest_exercise = get(r, 'restExercise');
        if (!b.rest_block && get(r, 'restRound')) b.rest_block = get(r, 'restRound');
        if (!b.rest_between_blocks && get(r, 'restBlock')) b.rest_between_blocks = get(r, 'restBlock');
        if (get(r, 'name')) {
          b.exercises.push({
            _key: newKey(), name: get(r, 'name'), sets: get(r, 'sets') || '1', duration_reps: get(r, 'reps'),
            duration: get(r, 'duration'), exercise_notes: get(r, 'exNotes'), video_url: get(r, 'video'),
            is_unilateral: isYes(get(r, 'unilateral')),
          });
        }
      });
      session.blocks = session.blocks.filter(b => b.exercises.length > 0);
      session.blocks.forEach(b => { if (!b.sets) b.sets = '1'; });
    }
    sessions.push(session);
  });

  if (sessions.length === 0) {
    return { sessions, warnings, error: 'El archivo no tiene ningún ejercicio. Rellena al menos la columna «Ejercicio».' };
  }
  return { sessions, warnings };
}

// Fecha final de una sesión importada
export function resolveSessionDate(s: ImportedSession, startDate: string, fallbackDate: string): string {
  if (s.date) return s.date;
  if (s.dayOffset !== null) return addDaysStr(startDate, s.dayOffset);
  return fallbackDate;
}

export const formatShortDate = (dateStr: string) => dateStr ? dateStr.split('-').reverse().slice(0, 2).join('/') : '';

// --- Microciclos ---
export function microsFromTree(tree: any): any[] {
  const macros = Array.isArray(tree) ? tree : (tree?.macros || []);
  const micros = macros.flatMap((macro: any) => macro.microciclos || macro.microcycles || []);
  micros.sort((a: any, b: any) => new Date(a.fecha_inicio || a.start_date).getTime() - new Date(b.fecha_inicio || b.start_date).getTime());
  return micros;
}

export function findMicroForDate(micros: any[], date: string): any | null {
  if (!date) return null;
  return micros.find(m => {
    const start = String(m.fecha_inicio || m.start_date || '').slice(0, 10);
    const end = String(m.fecha_fin || m.end_date || '').slice(0, 10);
    return start && end && date >= start && date <= end;
  }) || null;
}

export const microId = (m: any) => (m ? (m.id || m._id || null) : null);

// --- Datos que se envían al servidor (lo mismo que hace el formulario al guardar) ---
export type HiitConfig = { reps: boolean; duration: boolean; restEx: boolean; restSet: boolean; restBlock: boolean };
export const FULL_HIIT_CONFIG: HiitConfig = { reps: true, duration: true, restEx: true, restSet: true, restBlock: true };

export function buildWorkoutPayload(w: {
  title: string; date: string; notes: string; athleteId: string; microId: string | null;
  type: WorkoutType; exercises: any[]; blocks: any[]; hiitConfig?: HiitConfig;
}) {
  const cfg = w.hiitConfig || FULL_HIIT_CONFIG;
  const payload: any = {
    title: w.title.trim(), date: w.date.trim(), notes: (w.notes || '').trim(), athlete_id: w.athleteId,
    microciclo_id: w.microId, microcycle_id: w.microId, hiit_settings: cfg,
  };
  if (w.type === 'traditional') {
    payload.exercises = w.exercises.filter(e => (e.name || '').trim()).map(ex => ({
      name: ex.name, sets: ex.sets, reps: ex.reps, duration: ex.duration, weight: ex.weight,
      rest: ex.rest, rest_exercise: ex.rest_exercise, video_url: ex.video_url, exercise_notes: ex.exercise_notes,
      is_unilateral: !!ex.is_unilateral,
      group_id: ex.group_id || null, group_name: ex.group_name || null, group_sets: ex.group_sets || '1',
    }));
  } else {
    payload.exercises = w.blocks.map(block => ({
      is_hiit_block: true, name: block.name, sets: block.sets, rest_exercise: cfg.restEx ? block.rest_exercise : '',
      rest_block: cfg.restSet ? block.rest_block : '', rest_between_blocks: cfg.restBlock ? block.rest_between_blocks : '',
      hiit_exercises: (block.exercises || []).filter((e: any) => (e.name || '').trim()).map((e: any) => {
        let dReps = cfg.reps ? (e.duration_reps ? String(e.duration_reps).trim() : '') : '';
        if (/^\d+$/.test(dReps)) dReps += 'r';
        return {
          name: e.name, sets: e.sets, duration_reps: dReps, duration: cfg.duration ? e.duration : '',
          exercise_notes: e.exercise_notes, video_url: e.video_url, is_unilateral: !!e.is_unilateral,
        };
      }),
    })).filter((b: any) => b.hiit_exercises.length > 0);
  }
  return payload;
}

export const defaultSessionTitle = (type: WorkoutType, date: string) =>
  `${type === 'hiit' ? 'Circuito HIIT' : 'Fuerza'}${date ? ` ${formatShortDate(date)}` : ''}`;

// --- Plantilla descargable ---
const csvCell = (v: string, delim: string) => (/[";\n\r,\t]/.test(v) || v.includes(delim) ? `"${v.replace(/"/g, '""')}"` : v);

export const TEMPLATE_FILE_NAME = 'Plantilla_Sesiones_AM_Coaching.csv';

// Ejemplo con dos sesiones de fuerza y un circuito HIIT a partir del próximo lunes.
// Usamos punto y coma, que es lo que espera Excel en español (la app lee también las comas).
export function buildTemplateCsv(startDate: string = nextMondayStr(), delim = ';'): string {
  const d = (n: number) => addDaysStr(startDate, n).split('-').reverse().join('/');
  const order = TEMPLATE_COLUMNS.map(c => c.field);
  const row = (values: Partial<Record<Field, string>>) => order.map(f => csvCell(values[f] || '', delim)).join(delim);
  const lines = [
    TEMPLATE_COLUMNS.map(c => csvCell(c.header, delim)).join(delim),
    row({ date: d(0), title: 'Fuerza tren inferior', notes: 'Calienta 10 min de movilidad', name: 'Sentadilla', sets: '4', reps: '8', weight: '60', rest: '2m', restExercise: '2m', unilateral: 'No', exNotes: 'Espalda neutra' }),
    row({ name: 'Zancada búlgara', sets: '3', reps: '10', weight: '20', rest: '90s', restExercise: '90s', unilateral: 'Sí' }),
    row({ name: 'Plancha frontal', sets: '3', duration: '45s', rest: '1m', unilateral: 'No' }),
    row({ date: d(2), title: 'Circuito HIIT', notes: 'Técnica antes que velocidad', block: 'Bloque 1', blockSets: '3', name: 'Burpees', sets: '1', reps: '10', duration: '40s', restExercise: '20s', restRound: '1m', restBlock: '2m', unilateral: 'No' }),
    row({ name: 'Jumping jacks', sets: '1', duration: '40s', unilateral: 'No' }),
    row({ block: 'Bloque 2', blockSets: '2', name: 'Flexiones', sets: '1', reps: '12', restExercise: '15s', restRound: '1m', unilateral: 'No' }),
    row({ name: 'Plancha lateral', sets: '1', duration: '30s', unilateral: 'Sí' }),
    row({ date: d(4), title: 'Fuerza tren superior', name: 'Press banca', sets: '4', reps: '6', weight: '40', rest: '2m', restExercise: '2m', unilateral: 'No' }),
    row({ name: 'Remo con mancuerna', sets: '3', reps: '10', weight: '16', rest: '90s', unilateral: 'Sí' }),
  ];
  return '﻿' + lines.join('\r\n') + '\r\n';
}
