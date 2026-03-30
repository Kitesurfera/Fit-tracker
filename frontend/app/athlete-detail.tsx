import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Dimensions, Alert, Platform, Modal, TextInput, Linking
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';
import { useAuth } from '../src/context/AuthContext';

const { width } = Dimensions.get('window');

const WEEKDAYS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

const getLocalDateStr = (date: Date) => {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const extractDateString = (dateVal: any) => {
  if (!dateVal) return null;
  if (typeof dateVal === 'string') return dateVal.split('T')[0]; 
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) return getLocalDateStr(dateVal);
  return null;
};

const MiniVideoPlayer = ({ url, onExpand }: { url: string, onExpand: (u: string) => void }) => {
  if (!url) return null;
  return (
    <View style={styles.miniVideoContainer}>
      <Video source={{ uri: url }} style={styles.miniVideo} resizeMode={ResizeMode.CONTAIN} shouldPlay isLooping isMuted playsInLine />
      <TouchableOpacity style={styles.expandBtn} onPress={() => onExpand(url)}>
        <Ionicons name="expand" size={16} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
};

export default function AthleteDetailScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name: string }>();
  
  const [athlete, setAthlete] = useState<any>(null);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'workouts'>('dashboard');
  const [loading, setLoading] = useState(true);

  const [expandedWorkouts, setExpandedWorkouts] = useState<Record<string, boolean>>({});
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>({}); 
  
  // Nuevo estado para controlar el desplegable del próximo entrenamiento
  const [isNextWorkoutExpanded, setIsNextWorkoutExpanded] = useState(false);
  
  const [showHistory, setShowHistory] = useState(false);
  const [showFuture, setShowFuture] = useState(false); 
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [workoutToDuplicate, setWorkoutToDuplicate] = useState<any>(null);
  const [duplicateDate, setDuplicateDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [ath, wk, sum, hist] = await Promise.all([
        api.getAthlete(params.id!),
        api.getWorkouts({ athlete_id: params.id! }),
        api.getSummary(params.id!),
        api.getWellnessHistory(params.id!)
      ]);
      setAthlete(ath);
      setWorkouts(Array.isArray(wk) ? wk : []);
      setSummary(sum);
      setHistory(Array.isArray(hist) ? hist : []);
    } catch (e) { 
      console.log("Error cargando detalle:", e); 
    } finally { 
      setLoading(false); 
    }
  };

  const toggleWorkout = (id: string) => setExpandedWorkouts(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleBlock = (key: string) => setExpandedBlocks(prev => ({ ...prev, [key]: !prev[key] }));

  const executeDeleteWorkout = async (id: string) => {
    try { await api.deleteWorkout(id); loadData(); } 
    catch (e) { if (Platform.OS !== 'web') Alert.alert("Error", "No se pudo eliminar la sesión."); }
  };

  const handleDeleteWorkout = (id: string, title: string) => {
    if (Platform.OS === 'web') {
      const isConfirmed = window.confirm(`¿Seguro que quieres eliminar "${title}"?`);
      if (isConfirmed) executeDeleteWorkout(id);
    } else {
      Alert.alert("Eliminar Sesión", `¿Seguro que quieres borrar "${title}"?`, [
        { text: "Cancelar", style: "cancel" }, { text: "ELIMINAR", style: "destructive", onPress: () => executeDeleteWorkout(id) }
      ]);
    }
  };

  const handleDuplicateWorkout = async () => {
    if (!workoutToDuplicate || !duplicateDate) return;
    setShowDuplicateModal(false); setLoading(true);
    try {
      const isHiit = workoutToDuplicate.exercises && workoutToDuplicate.exercises.length > 0 && workoutToDuplicate.exercises[0].is_hiit_block === true;
      let cleanExercises = [];

      if (isHiit) {
          cleanExercises = workoutToDuplicate.exercises.map((block: any) => ({
              is_hiit_block: true,
              name: block.name,
              sets: block.sets,
              rest_exercise: block.rest_exercise,
              rest_block: block.rest_block,
              rest_between_blocks: block.rest_between_blocks,
              hiit_exercises: (block.hiit_exercises || []).map((ex: any) => ({
                  name: ex.name,
                  duration_reps: ex.duration_reps,
                  video_url: ex.video_url,
                  exercise_notes: ex.exercise_notes
              }))
          }));
      } else {
          cleanExercises = (workoutToDuplicate.exercises || []).map((ex: any) => ({
            name: ex.name, sets: ex.sets, reps: ex.reps, weight: ex.weight, rest: ex.rest, rest_exercise: ex.rest_exercise, video_url: ex.video_url, exercise_notes: ex.exercise_notes, image_path: ex.image_path
          }));
      }

      const payload = { title: workoutToDuplicate.title, date: duplicateDate, notes: workoutToDuplicate.notes || '', athlete_id: params.id!, microciclo_id: workoutToDuplicate.microciclo_id || null, exercises: cleanExercises };
      await api.createWorkout(payload);
      if (Platform.OS !== 'web') Alert.alert("Éxito", `Sesión duplicada para el ${duplicateDate}`);
      loadData();
    } catch (e) {
      if (Platform.OS !== 'web') Alert.alert("Error", "No se pudo duplicar la sesión.");
      setLoading(false);
    }
  };

  const saveCoachNote = async (workout: any, exerciseIndex: number, noteText: string) => {
    try {
      const payload = {
        title: workout.title, date: workout.date, notes: workout.notes, athlete_id: workout.athlete_id, microciclo_id: workout.microciclo_id,
        exercises: workout.exercises, completed: workout.completed, observations: workout.observations,
        completion_data: {
          ...workout.completion_data,
          exercise_results: workout.completion_data.exercise_results.map((ex: any, i: number) => i === exerciseIndex ? { ...ex, coach_note: noteText } : ex)
        }
      };
      await api.updateWorkout(workout.id, payload);
      setWorkouts(prev => prev.map(w => w.id === workout.id ? payload : w));
      if (Platform.OS !== 'web') Alert.alert("¡Enviado!", "Feedback guardado correctamente.");
    } catch (e) { console.log("Error guardando la nota del coach:", e); }
  };

  const saveHiitCoachNote = async (workout: any, blockIndex: number, exIndex: number, noteText: string) => {
    try {
      const updatedHiitResults = (workout.completion_data?.hiit_results || []).map((block: any, bIdx: number) => {
        if (bIdx !== blockIndex) return block;
        return {
          ...block,
          hiit_exercises: (block.hiit_exercises || []).map((ex: any, eIdx: number) => {
            if (eIdx !== exIndex) return ex;
            return { ...ex, coach_note: noteText };
          })
        };
      });
      const payload = { 
          ...workout, 
          completion_data: { ...workout.completion_data, hiit_results: updatedHiitResults } 
      };
      await api.updateWorkout(workout.id, payload);
      setWorkouts(prev => prev.map(w => w.id === workout.id ? payload : w));
      if (Platform.OS !== 'web') Alert.alert("¡Enviado!", "Feedback guardado correctamente.");
    } catch (e) { console.log("Error guardando nota HIIT:", e); }
  };

  const getLevelColor = (val: number, inverse = false) => {
    if (!val) return colors.border + '50'; 
    if (!inverse) { if (val <= 2) return colors.success || '#10B981'; if (val === 3) return '#F59E0B'; return colors.error || '#EF4444'; } 
    else { if (val >= 4) return colors.success || '#10B981'; if (val === 3) return '#F59E0B'; return colors.error || '#EF4444'; }
  };

  const isTrainer = user?.role === 'trainer';
  const isFemale = ['female', 'mujer', 'femenino'].includes(athlete?.gender?.toLowerCase() || '');
  const todayStr = getLocalDateStr(new Date());

  const getActualDayOneStr = useCallback(() => {
    try {
      if (!history || !Array.isArray(history) || history.length === 0) return '';
      const menstrualLogs = history
        .filter(w => w && w.date && (w.cycle_phase === 'menstrual' || w.cycle_phase?.startsWith('menstruacion')))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      
      if (menstrualLogs.length === 0) return '';

      let actualDayOneStr = extractDateString(menstrualLogs[0].date) || '';
      for (let i = 0; i < menstrualLogs.length - 1; i++) {
        const d1 = extractDateString(menstrualLogs[i].date);
        const d2 = extractDateString(menstrualLogs[i+1].date);
        if (!d1 || !d2) continue;

        const p1 = d1.split('-');
        const p2 = d2.split('-');
        const date1 = new Date(Number(p1[0]), Number(p1[1]) - 1, Number(p1[2]));
        const date2 = new Date(Number(p2[0]), Number(p2[1]) - 1, Number(p2[2]));
        
        const diffDays = (date1.getTime() - date2.getTime()) / (1000 * 3600 * 24);
        if (diffDays <= 2) actualDayOneStr = d2;
        else break; 
      }
      return actualDayOneStr;
    } catch (e) {
      return '';
    }
  }, [history]);

  const cycleData = useMemo(() => {
    try {
      if (!isFemale || !athlete) return null;
      let actualDayOneStr = extractDateString(athlete?.last_period_date);
      if (!actualDayOneStr) {
          if (!history || history.length === 0) return null;
          actualDayOneStr = getActualDayOneStr();
      }
      if (!actualDayOneStr) return null;

      const parts = actualDayOneStr.split('-');
      const startY = Number(parts[0]);
      const startM = Number(parts[1]);
      const startD = Number(parts[2]);

      if (isNaN(startY) || isNaN(startM) || isNaN(startD)) return null;

      const actualDayOne = new Date(startY, startM - 1, startD);
      const cycleLength = Number(athlete?.cycle_length) || 28;
      const periodLength = Number(athlete?.period_length) || 5;

      return { actualDayOne, cycleLength, periodLength };
    } catch (e) {
      return null;
    }
  }, [history, athlete, isFemale, getActualDayOneStr]);

  const phaseInfo = useMemo(() => {
    try {
      if (!cycleData || !cycleData.actualDayOne || isNaN(cycleData.actualDayOne.getTime())) return null;
      
      const parts = todayStr.split('-');
      const tY = Number(parts[0]);
      const tM = Number(parts[1]);
      const tD = Number(parts[2]);
      if (isNaN(tY) || isNaN(tM) || isNaN(tD)) return null;

      const targetTime = new Date(tY, tM - 1, tD).getTime();
      const startTime = cycleData.actualDayOne.getTime();
      const diffDays = Math.floor((targetTime - startTime) / (1000 * 3600 * 24));

      if (diffDays < 0) return null;

      const currentCycleDay = (diffDays % cycleData.cycleLength) + 1;

      if (currentCycleDay <= cycleData.periodLength) {
        return { day: currentCycleDay, name: 'Fase Menstrual (Baja Carga)', color: '#EF4444', icon: 'water', simpleName: 'Menstrual' };
      } else if (currentCycleDay <= Math.floor(cycleData.cycleLength / 2) - 2) {
        return { day: currentCycleDay, name: 'Fase Folicular (Alta Energía)', color: '#10B981', icon: 'leaf', simpleName: 'Folicular' };
      } else if (currentCycleDay <= Math.floor(cycleData.cycleLength / 2) + 2) {
        return { day: currentCycleDay, name: 'Fase Ovulatoria (Pico de Fuerza)', color: '#F59E0B', icon: 'sunny', simpleName: 'Ovulatoria' };
      } else {
        return { day: currentCycleDay, name: 'Fase Lútea (Posible Fatiga)', color: '#8B5CF6', icon: 'moon', simpleName: 'Lútea' };
      }
    } catch (e) {
      return null;
    }
  }, [cycleData, todayStr]);

  const fatigueChartData = useMemo(() => {
    const days = 7;
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const record = history.find(w => w.date === dateStr);
      data.push({
        dateStr,
        dayNum: d.getDate(),
        weekday: WEEKDAYS[d.getDay()],
        fatigue: record?.fatigue || 0
      });
    }
    return data;
  }, [history]);

  const activeWindow = useMemo(() => {
    const now = new Date();
    const day = now.getDay(); 
    
    let start = new Date(now);
    let end = new Date(now);

    if (day === 6) { 
      end.setDate(now.getDate() + 8);
    } else if (day === 0) { 
      end.setDate(now.getDate() + 7);
    } else { 
      start.setDate(now.getDate() - (day - 1));
      end.setDate(now.getDate() + (7 - day));
    }
    
    return { startStr: getLocalDateStr(start), endStr: getLocalDateStr(end) };
  }, [todayStr]);

  const nextWorkout = useMemo(() => {
    const pendingToday = workouts.find(w => w.date === todayStr && !w.completed);
    if (pendingToday) return pendingToday;

    const future = workouts
      .filter(w => w.date > todayStr && !w.completed)
      .sort((a,b) => String(a.date).localeCompare(String(b.date)));
    
    return future.length > 0 ? future[0] : null;
  }, [workouts, todayStr]);

  const renderDashboard = () => {
    const discomfortsObj = summary?.latest_wellness?.discomforts || {};
    const discomfortsEntries = Object.entries(discomfortsObj);

    return (
      <View style={styles.tabContainer}>
        {!!summary?.is_injured && (
          <View style={[styles.alert, { backgroundColor: (colors.error || '#EF4444') + '10', borderColor: colors.error || '#EF4444' }]}>
            <Ionicons name="warning" size={22} color={colors.error || '#EF4444'} />
            <View style={{flex:1, marginLeft: 12}}>
              <Text style={{color: colors.error || '#EF4444', fontWeight: '900', fontSize: 12}}>ESTADO: LESIONADA / BAJA</Text>
              <Text style={{color: colors.textPrimary, fontSize: 13, marginTop: 2}}>{summary.injury_notes}</Text>
            </View>
          </View>
        )}

        {/* PRÓXIMO ENTRENAMIENTO */}
        <Text style={[styles.sectionTitle]}>PRÓXIMO ENTRENAMIENTO</Text>
        {nextWorkout ? (
          <TouchableOpacity 
            style={[styles.nextWorkoutCard, { backgroundColor: colors.surface, flexDirection: 'column', alignItems: 'stretch' }]}
            onPress={() => setIsNextWorkoutExpanded(!isNextWorkoutExpanded)}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[styles.nextWorkoutIcon, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons name="calendar-outline" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '800', marginBottom: 2 }}>
                  {nextWorkout.date === todayStr ? 'HOY' : nextWorkout.date.split('-').reverse().join('/')}
                </Text>
                <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '800' }}>
                  {nextWorkout.title}
                </Text>
              </View>
              <Ionicons name={isNextWorkoutExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
            </View>

            {isNextWorkoutExpanded && (
              <View style={{ marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: colors.border }}>
                {nextWorkout.exercises?.map((ex: any, idx: number) => {
                  const isHiitBlock = ex.is_hiit_block || ex.hiit_exercises !== undefined;

                  if (isHiitBlock) {
                    return (
                      <View key={idx} style={{ marginBottom: 12 }}>
                        <Text style={{ color: colors.error || '#EF4444', fontSize: 13, fontWeight: '800', marginBottom: 6 }}>
                          <Ionicons name="flame" size={12} /> {ex.name} ({ex.sets} Vueltas)
                        </Text>
                        {ex.hiit_exercises?.map((hEx: any, hIdx: number) => (
                          <View key={hIdx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 10, marginBottom: 4 }}>
                            <Text style={{ color: colors.textPrimary, fontSize: 12, flex: 1, fontWeight: '500' }}>• {hEx.name}</Text>
                            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '800' }}>{hEx.duration_reps || hEx.duration}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  } else {
                    return (
                      <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '700', flex: 1 }}>
                          <Ionicons name="barbell-outline" size={14} color={colors.textSecondary} /> {ex.name}
                        </Text>
                        <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                          {(ex.sets && ex.reps) && <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>{ex.sets}x{ex.reps}</Text>}
                          {ex.duration && <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>{ex.duration}</Text>}
                          {ex.weight ? <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>{ex.weight} kg</Text> : null}
                        </View>
                      </View>
                    );
                  }
                })}

                <TouchableOpacity 
                  style={{ backgroundColor: colors.surfaceHighlight, paddingVertical: 12, borderRadius: 10, marginTop: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                  onPress={() => router.push(isTrainer ? `/edit-workout?workoutId=${nextWorkout.id}` : `/training-mode?workoutId=${nextWorkout.id}`)}
                >
                  <Ionicons name={isTrainer ? "pencil" : "play"} size={16} color={colors.textPrimary} />
                  <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 13 }}>
                    {isTrainer ? 'Editar Sesión Completa' : 'Ir a Entrenar'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        ) : (
          <View style={[styles.nextWorkoutCard, { backgroundColor: colors.surface, flexDirection: 'column', alignItems: 'flex-start', padding: 20 }]}>
            <Text style={{ color: colors.textSecondary, marginBottom: 15, fontStyle: 'italic', fontSize: 13 }}>No hay sesiones pendientes próximamente.</Text>
            <TouchableOpacity 
              style={{ backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              onPress={() => router.push(`/add-workout?athlete_id=${params.id}&name=${encodeURIComponent(params.name)}`)}
            >
              <Ionicons name="add" size={18} color="#FFF" />
              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13 }}>Programar Sesión</Text>
            </TouchableOpacity>
          </View>
        )}

        {(isFemale && phaseInfo) && (
          <View style={[styles.cycleCard, { backgroundColor: phaseInfo.color + '15', borderColor: phaseInfo.color }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name={phaseInfo.icon as any} size={24} color={phaseInfo.color} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: phaseInfo.color, fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>BIOLOGÍA (DÍA {phaseInfo.day})</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 2 }}>{phaseInfo.name}</Text>
                {phaseInfo.simpleName === 'Ovulatoria' && (
                    <Text style={{ color: colors.error || '#EF4444', fontSize: 11, fontWeight: '800', marginTop: 4 }}>⚠️ PRECAUCIÓN: Laxitud de ligamentos</Text>
                )}
              </View>
            </View>
          </View>
        )}

        <TouchableOpacity 
          style={[styles.actionBtn, { backgroundColor: colors.primary, marginBottom: 25, marginTop: (isFemale && phaseInfo) ? 0 : 5 }]} 
          onPress={() => router.push(`/periodization?athlete_id=${params.id}&name=${encodeURIComponent(params.name)}`)}
        >
          <Ionicons name="calendar" size={20} color="#FFF" />
          <Text style={styles.actionBtnText}>PLANIFICACIÓN (MACRO/MICRO)</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle]}>EVOLUCIÓN DE FATIGA (ÚLTIMOS 7 DÍAS)</Text>
        <View style={[styles.chartCard, { backgroundColor: colors.surface, marginBottom: 25 }]}>
          <View style={styles.barsContainer}>
            {fatigueChartData.map((day, idx) => (
              <View key={idx} style={[styles.barWrapper, { justifyContent: 'flex-end', height: '100%' }]}>
                <Text style={[styles.barValue, { color: getLevelColor(day.fatigue) }]}>
                  {day.fatigue > 0 ? day.fatigue : '-'}
                </Text>
                <View style={[
                  styles.bar, 
                  { 
                    height: day.fatigue > 0 ? `${(day.fatigue / 5) * 100}%` : '5%', 
                    backgroundColor: getLevelColor(day.fatigue) 
                  }
                ]} />
                <Text style={styles.barDate}>{day.weekday}</Text>
                <Text style={[styles.barDate, {marginTop: 2, fontSize: 11, color: colors.textPrimary, fontWeight: '800'}]}>{day.dayNum}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={[styles.sectionTitle]}>ÚLTIMO REGISTRO DE BIENESTAR</Text>
        <View style={[styles.mainCard, { backgroundColor: colors.surface }]}>
          <View style={styles.wellnessRow}>
            <View style={styles.wellBox}><Text style={[styles.wellVal, { color: getLevelColor(summary?.latest_wellness?.fatigue) }]}>{summary?.latest_wellness?.fatigue || '-'}</Text><Text style={styles.wellLabel}>FATIGA</Text></View>
            <View style={styles.wellBox}><Text style={[styles.wellVal, { color: getLevelColor(summary?.latest_wellness?.soreness) }]}>{summary?.latest_wellness?.soreness || '-'}</Text><Text style={styles.wellLabel}>DOLOR</Text></View>
            <View style={styles.wellBox}><Text style={[styles.wellVal, { color: getLevelColor(summary?.latest_wellness?.sleep_quality, true) }]}>{summary?.latest_wellness?.sleep_quality || '-'}</Text><Text style={styles.wellLabel}>SUEÑO</Text></View>
          </View>
          
          {!!summary?.latest_wellness?.notes && (
            <View style={[styles.noteBox, { backgroundColor: colors.surfaceHighlight }]}><Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} /><Text style={[styles.noteText, { color: colors.textPrimary }]}>"{summary.latest_wellness.notes}"</Text></View>
          )}

          {discomfortsEntries.length > 0 && (
            <View style={{ marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textSecondary, marginBottom: 10 }}>ZONAS CON MOLESTIAS HOY:</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {discomfortsEntries.map(([part, level]) => (
                  <View 
                    key={part} 
                    style={{ 
                      backgroundColor: level === 'leve' ? '#F59E0B20' : '#EF444420', 
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, 
                      borderWidth: 1, borderColor: level === 'leve' ? '#F59E0B' : '#EF4444' 
                    }}
                  >
                     <Text style={{ color: level === 'leve' ? '#F59E0B' : '#EF4444', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>
                       {part} {level === 'fuerte' ? '⚠️' : ''}
                     </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderWorkoutItem = (wk: any) => {
    const isExpanded = !!expandedWorkouts[wk.id];
    
    let isWorkoutHiit = false;
    let itemsToRender = [];

    if (wk.exercises && wk.exercises.length > 0 && wk.exercises[0].is_hiit_block) {
        isWorkoutHiit = true;
        itemsToRender = (wk.completed && wk.completion_data?.hiit_results) ? wk.completion_data.hiit_results : wk.exercises;
    } else {
        itemsToRender = (wk.completed && wk.completion_data?.exercise_results) ? wk.completion_data.exercise_results : (wk.exercises || []);
    }

    return (
      <View key={wk.id} style={[styles.sessionCardExpanded, { backgroundColor: colors.surface, opacity: wk.completed ? 0.85 : 1 }]}>
        <TouchableOpacity 
          style={{ flexDirection: 'row', alignItems: 'center' }} 
          onPress={() => toggleWorkout(wk.id)}
          activeOpacity={0.7}
        >
          <View style={[styles.avatarCircle, { backgroundColor: wk.completed ? (colors.success || '#10B981') + '20' : colors.primary + '20' }]}>
            <Ionicons name={wk.completed ? "checkmark-done" : "calendar-outline"} size={22} color={wk.completed ? (colors.success || '#10B981') : colors.primary} />
          </View>
          
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary, textDecorationLine: wk.completed ? 'line-through' : 'none' }]}>{wk.title}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{wk.date.split('-').reverse().join('/')}</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: 10 }}>
            {isTrainer && (
              <>
                <TouchableOpacity onPress={() => { setWorkoutToDuplicate(wk); setShowDuplicateModal(true); }} style={styles.iconHitbox}>
                  <Ionicons name="copy-outline" size={20} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteWorkout(wk.id, wk.title)} style={styles.iconHitbox}>
                  <Ionicons name="trash-outline" size={20} color={colors.error || '#EF4444'} />
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity onPress={() => router.push(isTrainer && !wk.completed ? `/edit-workout?workoutId=${wk.id}` : `/training-mode?workoutId=${wk.id}`)} style={styles.iconHitbox}>
              <Ionicons name={isTrainer ? (wk.completed ? "eye" : "pencil") : "chevron-forward"} size={20} color={colors.border} />
            </TouchableOpacity>
          </View>

          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        {isExpanded && (
          <View style={[styles.completionDetails, { backgroundColor: colors.background, borderColor: colors.border }]}>
            
            {wk.observations?.includes('[NO COMPLETADA]') && (
              <View style={{ backgroundColor: '#EF444420', padding: 12, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#EF4444' }}>
                 <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 11, marginBottom: 4 }}>MOTIVO DE CANCELACIÓN:</Text>
                 <Text style={{ color: colors.textPrimary, fontSize: 13, fontStyle: 'italic' }}>"{wk.observations.replace('[NO COMPLETADA] Motivo: ', '')}"</Text>
              </View>
            )}

            {(wk.completed && !!wk.completion_data) && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 12, letterSpacing: 0.5 }}>
                  ESFUERZO (RPE): <Text style={{ color: colors.success || '#10B981', fontSize: 14 }}>{wk.completion_data.rpe || '-'}/10</Text>
                </Text>
              </View>
            )}

            {itemsToRender?.map((blockOrEx: any, idx: number) => {
              const isHiitBlock = blockOrEx.is_hiit_block || blockOrEx.hiit_exercises !== undefined;
              
              if (isHiitBlock) {
                const blockKey = `${wk.id}-block-${idx}`;
                const isBlockExpanded = !!expandedBlocks[blockKey];

                return (
                  <View key={idx} style={[styles.exerciseCard, { borderColor: colors.border, backgroundColor: colors.surfaceHighlight }]}>
                    <TouchableOpacity 
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: isBlockExpanded ? 10 : 0, borderBottomWidth: isBlockExpanded ? 1 : 0, borderBottomColor: colors.border }}
                      onPress={() => toggleBlock(blockKey)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="flame" size={18} color={colors.error || '#EF4444'} />
                      <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '800', flex: 1 }}>{blockOrEx.name}</Text>
                      <Ionicons name={isBlockExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                    
                    {isBlockExpanded && (
                      <View style={{ marginTop: 12 }}>
                        {blockOrEx.hiit_exercises?.map((ex: any, eIdx: number) => {
                          const noteKey = `${wk.id}-hiit-${idx}-${eIdx}`;
                          const currentNote = draftNotes[noteKey] !== undefined ? draftNotes[noteKey] : (ex.coach_note || '');
                          const isSaved = currentNote === ex.coach_note && !!ex.coach_note;

                          return (
                            <View key={eIdx} style={{ marginBottom: 15, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: colors.primary + '50' }}>
                                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '700' }}>{ex.name} <Text style={{ color: colors.primary, fontWeight: '800' }}>({ex.duration_reps})</Text></Text>
                                
                                {(wk.completed && !!ex.recorded_video_url) && <View style={{ marginTop: 8 }}><MiniVideoPlayer url={ex.recorded_video_url} onExpand={setExpandedVideo} /></View>}
                                
                                {(!wk.completed && !!ex.video_url) && (
                                    <TouchableOpacity onPress={() => Linking.openURL(ex.video_url)} style={{flexDirection:'row', alignItems:'center', marginTop:5}}>
                                        <Ionicons name="logo-youtube" size={16} color={colors.error || '#EF4444'} />
                                        <Text style={{color: colors.error || '#EF4444', fontSize: 12, marginLeft: 5, fontWeight: '700'}}>Ver técnica</Text>
                                    </TouchableOpacity>
                                )}

                                {(isTrainer && wk.completed && !wk.observations?.includes('[NO COMPLETADA]')) && (
                                    <View style={styles.feedbackRow}>
                                        <TextInput style={[styles.feedbackInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]} placeholder="Feedback para este ejercicio..." placeholderTextColor={colors.textSecondary} value={currentNote} onChangeText={(t) => setDraftNotes(prev => ({...prev, [noteKey]: t}))} />
                                        <TouchableOpacity style={[styles.sendBtn, { backgroundColor: isSaved ? (colors.success || '#10B981') : colors.primary }]} onPress={() => saveHiitCoachNote(wk, idx, eIdx, currentNote)}>
                                            <Ionicons name={isSaved ? "checkmark-done" : "send"} size={16} color="#FFF" />
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              } else {
                const noteKey = `${wk.id}-force-${idx}`;
                const currentNote = draftNotes[noteKey] !== undefined ? draftNotes[noteKey] : (blockOrEx.coach_note || '');
                const isSaved = currentNote === blockOrEx.coach_note && !!blockOrEx.coach_note;
                
                return (
                  <View key={idx} style={[styles.exerciseCard, { borderColor: colors.border, backgroundColor: colors.surfaceHighlight }]}>
                    <View style={styles.exerciseHeader}>
                      <Text style={[styles.exerciseName, { color: colors.textPrimary, flex: 1 }]}><Ionicons name="barbell-outline" size={14} color={colors.textSecondary} /> {blockOrEx.name}</Text>
                      {!wk.completed && (
                        <View style={{alignItems: 'flex-end'}}>
                          {(blockOrEx.sets && blockOrEx.reps) ? <Text style={{color: colors.primary, fontWeight: '700', fontSize: 12}}>{blockOrEx.sets}x{blockOrEx.reps}</Text> : null}
                          {blockOrEx.weight ? <Text style={{color: colors.textSecondary, fontSize: 11}}>{blockOrEx.weight} kg</Text> : null}
                        </View>
                      )}
                    </View>
                    
                    {(wk.completed && !!blockOrEx.recorded_video_url) && <MiniVideoPlayer url={blockOrEx.recorded_video_url} onExpand={setExpandedVideo} />}
                    
                    {(!wk.completed && !!blockOrEx.video_url) && (
                      <TouchableOpacity onPress={() => Linking.openURL(blockOrEx.video_url)} style={{flexDirection:'row', alignItems:'center', marginTop:5}}>
                        <Ionicons name="logo-youtube" size={16} color={colors.error || '#EF4444'} />
                        <Text style={{color: colors.error || '#EF4444', fontSize: 12, marginLeft: 5, fontWeight: '700'}}>Ver técnica en vídeo</Text>
                      </TouchableOpacity>
                    )}
                    
                    {(isTrainer && wk.completed && !wk.observations?.includes('[NO COMPLETADA]')) && (
                      <View style={styles.feedbackRow}>
                        <TextInput style={[styles.feedbackInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]} placeholder="Añadir feedback..." placeholderTextColor={colors.textSecondary} value={currentNote} onChangeText={(t) => setDraftNotes(prev => ({...prev, [noteKey]: t}))} />
                        <TouchableOpacity style={[styles.sendBtn, { backgroundColor: isSaved ? (colors.success || '#10B981') : colors.primary }]} onPress={() => saveCoachNote(wk, idx, currentNote)}>
                          <Ionicons name={isSaved ? "checkmark-done" : "send"} size={16} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              }
            })}
          </View>
        )}
      </View>
    );
  };

  const renderWorkouts = () => {
    const activeWeekWorkouts = workouts.filter(w => w.date >= activeWindow.startStr && w.date <= activeWindow.endStr).sort((a,b) => String(a.date).localeCompare(String(b.date)));
    const historyWorkouts = workouts.filter(w => w.date < activeWindow.startStr).sort((a,b) => String(b.date).localeCompare(String(a.date)));
    const futureWorkouts = workouts.filter(w => w.date > activeWindow.endStr).sort((a,b) => String(a.date).localeCompare(String(b.date)));

    return (
      <View style={styles.tabContainer}>
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
          <Text style={[styles.sectionTitle, { marginBottom: 0, color: colors.primary }]}>SEMANA ACTUAL</Text>
          <TouchableOpacity style={{ backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => router.push(`/add-workout?athlete_id=${params.id}&name=${encodeURIComponent(params.name)}`)}>
            <Ionicons name="add" size={16} color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>NUEVA</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 15, marginTop: -10 }}>Del {activeWindow.startStr.split('-').reverse().join('/')} al {activeWindow.endStr.split('-').reverse().join('/')}</Text>
        
        {activeWeekWorkouts.length > 0 ? activeWeekWorkouts.map(renderWorkoutItem) : <Text style={{ color: colors.textSecondary, marginBottom: 20, fontStyle: 'italic' }}>No hay sesiones en esta ventana.</Text>}

        {futureWorkouts.length > 0 && (
          <>
            <TouchableOpacity style={styles.toggleSectionBtn} onPress={() => setShowFuture(!showFuture)} activeOpacity={0.7}>
              <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 12 }}>PROGRAMACIÓN FUTURA ({futureWorkouts.length})</Text>
              <Ionicons name={showFuture ? "chevron-up" : "chevron-down"} size={18} color={colors.textPrimary} />
            </TouchableOpacity>
            {showFuture && futureWorkouts.map(renderWorkoutItem)}
          </>
        )}

        <TouchableOpacity style={[styles.toggleSectionBtn, { backgroundColor: colors.surfaceHighlight, marginTop: 20 }]} onPress={() => setShowHistory(!showHistory)} activeOpacity={0.7}>
          <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 14 }}>HISTORIAL DE SESIONES ({historyWorkouts.length})</Text>
          <Ionicons name={showHistory ? "chevron-up" : "chevron-down"} size={20} color={colors.textPrimary} />
        </TouchableOpacity>

        {showHistory && (historyWorkouts.length > 0 ? historyWorkouts.map(renderWorkoutItem) : <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 10 }}>No hay historial previo.</Text>)}
      </View>
    );
  };

  const activeContent = () => { if (activeTab === 'dashboard') return renderDashboard(); if (activeTab === 'workouts') return renderWorkouts(); };

  if (loading) return <SafeAreaView style={{flex:1, justifyContent:'center', alignItems:'center', backgroundColor: colors.background}}><ActivityIndicator size="large" color={colors.primary}/></SafeAreaView>;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.textPrimary} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{params.name}</Text>
        <TouchableOpacity onPress={loadData}><Ionicons name="sync" size={24} color={colors.primary} /></TouchableOpacity>
      </View>
      <View style={styles.tabsRow}>
        {[{ id: 'dashboard', label: 'RESUMEN' }, { id: 'workouts', label: 'SESIONES' }].map(tab => (
          <TouchableOpacity key={tab.id} style={[styles.tab, activeTab === tab.id && { borderBottomColor: colors.primary, borderBottomWidth: 3 }]} onPress={() => setActiveTab(tab.id as any)}>
            <Text style={[styles.tabText, { color: activeTab === tab.id ? colors.primary : colors.textSecondary }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <ScrollView showsVerticalScrollIndicator={false}>{activeContent()}</ScrollView>

      {!!athlete?.phone && (
        <TouchableOpacity 
          style={styles.whatsappFab} 
          onPress={() => Linking.openURL(`https://wa.me/${athlete.phone.replace(/\D/g, '')}?text=¡Hola ${params.name}! He estado revisando tu progreso...`)}
        >
          <Ionicons name="logo-whatsapp" size={30} color="#FFF" />
        </TouchableOpacity>
      )}

      <Modal visible={showDuplicateModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Duplicar Sesión</Text>
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} value={duplicateDate} onChangeText={setDuplicateDate} placeholder="YYYY-MM-DD" />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={() => setShowDuplicateModal(false)}><Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={handleDuplicateWorkout}><Text style={{ color: '#FFF', fontWeight: '700' }}>Duplicar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={!!expandedVideo} transparent animationType="fade">
        <View style={styles.fullscreenVideoOverlay}>
          <TouchableOpacity style={styles.closeModalBtn} onPress={() => setExpandedVideo(null)}><Ionicons name="close-circle" size={40} color="#FFF" /></TouchableOpacity>
          {!!expandedVideo && <Video source={{ uri: expandedVideo }} style={styles.fullVideo} resizeMode={ResizeMode.CONTAIN} useNativeControls shouldPlay />}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' }, headerTitle: { fontSize: 22, fontWeight: '900' }, tabsRow: { flexDirection: 'row', justifyContent: 'space-around', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }, tab: { paddingVertical: 15, flex: 1, alignItems: 'center' }, tabText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 }, tabContainer: { padding: 20, paddingBottom: 100 }, alert: { flexDirection: 'row', padding: 18, borderRadius: 20, marginBottom: 25, borderLeftWidth: 6 }, cycleCard: { padding: 16, borderRadius: 20, marginBottom: 20, borderWidth: 1 }, sectionTitle: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 15, letterSpacing: 1.5 }, mainCard: { padding: 20, borderRadius: 25, elevation: 2 }, wellnessRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15 }, wellBox: { alignItems: 'center' }, wellVal: { fontSize: 26, fontWeight: '900' }, wellLabel: { fontSize: 9, fontWeight: '800', color: '#888', marginTop: 4 }, noteBox: { flexDirection: 'row', padding: 15, borderRadius: 15, gap: 10, marginTop: 10 }, noteText: { fontSize: 13, fontStyle: 'italic', flex: 1, lineHeight: 18 }, actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 20, gap: 12 }, actionBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 }, sessionCardExpanded: { padding: 18, borderRadius: 20, marginBottom: 15, elevation: 1 }, iconHitbox: { padding: 8 }, completionDetails: { marginTop: 15, padding: 15, borderRadius: 12, borderWidth: 1 }, avatarCircle: { width: 46, height: 46, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 }, cardTitle: { fontSize: 15, fontWeight: '800' }, barsContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: '100%' }, barWrapper: { alignItems: 'center', flex: 1, height: '100%' }, bar: { width: 16, borderRadius: 8, minHeight: 5 }, barDate: { fontSize: 9, color: '#999', marginTop: 8, fontWeight: '700' }, barValue: { fontSize: 9, fontWeight: '800', marginBottom: 4 }, modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }, modalContent: { padding: 24, borderRadius: 20 }, modalTitle: { fontSize: 18, fontWeight: '900', marginBottom: 10 }, modalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' }, input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 }, miniVideoContainer: { width: 120, height: 80, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', position: 'relative' }, miniVideo: { width: '100%', height: '100%' }, expandBtn: { position: 'absolute', right: 5, bottom: 5, backgroundColor: 'rgba(0,0,0,0.6)', padding: 6, borderRadius: 8 }, fullscreenVideoOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }, closeModalBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10 }, fullVideo: { width: '100%', height: '80%' }, exerciseCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 }, exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }, exerciseName: { fontSize: 14, fontWeight: '800' }, feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5 }, feedbackInput: { flex: 1, paddingHorizontal: 15, paddingVertical: 10, borderRadius: 10, borderWidth: 1, fontSize: 13 }, sendBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }, chartCard: { padding: 20, borderRadius: 25, height: 160, justifyContent: 'flex-end', elevation: 2 },
  whatsappFab: { position: 'absolute', bottom: 30, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: '#25D366', justifyContent: 'center', alignItems: 'center', elevation: 5, zIndex: 100 },
  toggleSectionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, borderRadius: 12, marginBottom: 15 },
  nextWorkoutCard: { padding: 16, borderRadius: 20, marginBottom: 25, elevation: 1 },
  nextWorkoutIcon: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 15 }
});
