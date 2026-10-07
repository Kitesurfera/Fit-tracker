// Utilidades compartidas para los tests físicos: nombre legible, si "menos es mejor" y cuál es la mejor marca.

const normalize = (text: string) =>
  text.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Nombre legible y unificado de un test (p. ej. "squat_rm", "Sentadilla" o "back squat" → "Sentadilla RM")
export const getStandardizedTestName = (rawName: string) => {
  if (!rawName) return 'Test';
  // Los tests del formulario se guardan con claves como "squat_rm" o "sprint_20m"
  let n = normalize(rawName).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  n = n.replace(/\b(rm|1rm|max|maximo)\b/g, '').replace(/\s+/g, ' ').trim();

  if (n === 'sentadilla' || n === 'squat' || n === 'back squat') return 'Sentadilla RM';
  if (n === 'peso muerto' || n === 'deadlift') return 'Peso Muerto RM';
  if (n === 'press banca' || n === 'bench press' || n === 'bench' || n === 'pecho') return 'Press Banca RM';
  if (n === 'dominadas' || n === 'dominada' || n === 'pull up' || n === 'pull ups') return 'Dominadas RM';
  if (n === 'hip thrust' || n === 'puente gluteo') return 'Hip Thrust RM';
  if (n === 'press militar' || n === 'military press' || n === 'press hombro') return 'Press Militar RM';
  if (n === 'cmj' || n === 'salto cmj' || n === 'contra movimiento') return 'Salto CMJ';
  if (n === 'dj' || n === 'drop jump' || n === 'salto dj' || n === 'rsi') return 'Drop Jump (RSI)';
  if (n === 'sj' || n === 'salto sj' || n === 'squat jump') return 'Salto SJ';
  if (n === 'isquio' || n === 'isquios' || n === 'isquiotibiales' || n === 'hamstring' || n === 'hamstrings') return 'Isquiotibiales';
  if (n === 'cuadriceps' || n === 'quads' || n === 'quad' || n === 'quadriceps') return 'Cuádriceps';
  if (n === 'gemelo' || n === 'gemelos' || n === 'calf' || n === 'calves') return 'Gemelos';
  if (n === 'tibial' || n === 'tibiales' || n === 'tibialis') return 'Tibial';
  const sprint = n.match(/^sprint\s*(\d+)\s*m?$/);
  if (sprint) return `Sprint ${sprint[1]} m`;

  return rawName.trim().replace(/[_]+/g, ' ').replace(/\s+/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const TIME_UNITS = ['s', 'seg', 'segs', 'segundo', 'segundos', 'sec', 'secs', 'ms', 'min', 'mins', 'minutos'];
const TIME_NAME = /\b(sprint|tiempo|time|agilidad|agility|t test|illinois|carrera|vuelta)\b/;
// Tests de aguante: se miden en segundos, pero aguantar más es mejor
const HOLD_NAME = /\b(plancha|plank|isometric[ao]?|aguante|hold|colgado|dead hang|wall sit|pared|sorensen|biering)\b/;

// En los tests de tiempo (sprint, agilidad...) un número más bajo es una mejor marca
export const isLowerBetter = (name?: string, unit?: string) => {
  const n = normalize(name || '').replace(/[_-]+/g, ' ');
  if (HOLD_NAME.test(n)) return false;
  if (TIME_NAME.test(n)) return true;
  return TIME_UNITS.includes(normalize(unit || '').replace(/\./g, ''));
};

const valid = (v: any) => typeof v === 'number' && !isNaN(v) && v > 0;

// Mejor de los dos lados en un test unilateral (el mayor o, si menos es mejor, el menor)
export const bestOfSides = (left: number, right: number, lowerBetter: boolean) => {
  const sides = [left, right].filter(valid);
  if (sides.length === 0) return 0;
  return lowerBetter ? Math.min(...sides) : Math.max(...sides);
};

// ¿Es "candidate" mejor marca que "current"?
export const isBetterResult = (candidate: number, current: number | null | undefined, lowerBetter: boolean) => {
  if (!valid(candidate)) return false;
  if (!valid(current)) return true;
  return lowerBetter ? candidate < (current as number) : candidate > (current as number);
};
