import { api } from '../api';

// Guarda en la agenda una sesión generada por la IA y la asigna a la semana (microciclo) de esa fecha, si la hay
export async function saveAiWorkout(athleteId: string, workoutData: any, targetDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error('La fecha debe tener el formato AAAA-MM-DD (ej: 2026-04-15)');
  }
  const tree = await api.getPeriodizationTree(athleteId).catch(() => ({ macros: [] }));
  let microId = null;
  for (const macro of tree?.macros || []) {
    const micro = (macro.microciclos || []).find((m: any) => {
      const start = String(m.fecha_inicio || '').slice(0, 10);
      const end = String(m.fecha_fin || '').slice(0, 10);
      return start && end && targetDate >= start && targetDate <= end;
    });
    if (micro) { microId = micro.id; break; }
  }
  return api.createWorkout({
    title: workoutData?.title || 'Entrenamiento de IA',
    date: targetDate,
    athlete_id: athleteId,
    exercises: workoutData?.exercises || [],
    notes: workoutData?.notes || '',
    is_ai: true,
    microciclo_id: microId,
  });
}
