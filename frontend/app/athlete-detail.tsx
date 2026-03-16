import React, { useState, useEffect } from 'react';
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

const CYCLE_COLORS: any = {
  menstrual: '#EF4444',
  folicular: '#10B981',
  ovulatoria: '#F59E0B',
  lutea: '#8B5CF6'
};

const CYCLE_LABELS: any = {
  menstrual: 'Fase Menstrual (Baja Carga)',
  folicular: 'Fase Folicular (Alta Energía)',
  ovulatoria: 'Fase Ovulatoria (Pico de Fuerza)',
  lutea: 'Fase Lútea (Posible Fatiga)'
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'workouts' | 'progression'>('dashboard');
  const [loading, setLoading] = useState(true);

  const [expandedWorkouts, setExpandedWorkouts] = useState<Record<string, boolean>>({});
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
      setWorkouts(wk || []);
      setSummary(sum);
      setHistory(hist || []);
    } catch (e) { 
      console.log("Error cargando detalle:", e); 
    } finally { 
      setLoading(false); 
    }
  };

  const toggleWorkout = (id: string) => setExpandedWorkouts(prev => ({ ...prev, [id]: !prev[id] }));

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
      const cleanExercises = (workoutToDuplicate.exercises || []).map((ex: any) => ({
        name: ex.name, sets: ex.sets, reps: ex.reps, weight: ex.weight, rest: ex.rest, rest_exercise: ex.rest_exercise, video_url: ex.video_url, exercise_notes: ex.exercise_notes, image_path: ex.image_path
      }));
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
      const updatedHiitResults = workout.completion_data.hiit_results.map((block: any, bIdx: number) => {
        if (bIdx !== blockIndex) return block;
        return {
          ...block,
          hiit_exercises: block.hiit_exercises.map((ex: any, eIdx: number) => {
            if (eIdx !== exIndex) return ex;
            return { ...ex, coach_note: noteText };
          })
        };
      });
      const payload = {
        title: workout.title, date: workout.date, notes: workout.notes, athlete_id: workout.athlete_id, microciclo_id: workout.microciclo_id,
        exercises: workout.exercises, completed: workout.completed, observations: workout.observations,
        completion_data: { ...workout.completion_data, hiit_results: updatedHiitResults }
      };
      await api.updateWorkout(workout.id, payload);
      setWorkouts(prev => prev.map(w => w.id === workout.id ? payload : w));
      if (Platform.OS !== 'web') Alert.alert("¡Enviado!", "Feedback guardado correctamente.");
    } catch (e) { console.log("Error guardando la nota del coach en HIIT:", e); }
  };

  const getLevelColor = (val: number, inverse = false) => {
    if (!val) return colors.border;
    if (!inverse) { if (val <= 2) return colors.success || '#10B981'; if (val === 3) return '#F59E0B'; return colors.error || '#EF4444'; } 
    else { if (val >= 4) return colors.success || '#10B981'; if (val === 3) return '#F59E0B'; return colors.error || '#EF4444'; }
  };

  const isFemale = ['female', 'mujer', 'femenino'].includes(athlete?.gender?.toLowerCase() || '');
  const currentPhase = summary?.latest_wellness?.cycle_phase;
  const isTrainer = user?.role === 'trainer';

  const renderDashboard = () => (
    <View style={styles.tabContainer}>
      {summary?.is_injured && (
        <View style={[styles.alert, { backgroundColor: (colors.error || '#EF4444') + '10', borderColor: colors.error || '#EF4444' }]}>
          <Ionicons name="warning" size={22} color={colors.error || '#EF4444'} />
          <View style={{flex:1, marginLeft: 12}}>
            <Text style={{color: colors.error || '#EF4444', fontWeight: '900', fontSize: 12}}>ESTADO: LESIONADA / BAJA</Text>
            <Text style={{color: colors.textPrimary, fontSize: 13, marginTop: 2}}>{summary.injury_notes}</Text>
          </View>
        </View>
      )}

      {isFemale && currentPhase && (
        <View style={[styles.cycleCard, { backgroundColor: CYCLE_COLORS[currentPhase] + '15', borderColor: CYCLE_COLORS[currentPhase] }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="water" size={24} color={CYCLE_COLORS[currentPhase]} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: CYCLE_COLORS[currentPhase], fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>ESTADO FISIOLÓGICO</Text>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 2 }}>{CYCLE_LABELS[currentPhase] || 'Fase Registrada'}</Text>
            </View>
          </View>
        </View>
      )}

      {/* BOTÓN MOVIDO ARRIBA */}
      <TouchableOpacity 
        style={[styles.actionBtn, { backgroundColor: colors.primary, marginBottom: 25, marginTop: (isFemale && currentPhase) ? 0 : 5 }]} 
        onPress={() => router.push(`/periodization?athlete_id=${params.id}&name=${encodeURIComponent(params.name)}`)}
      >
        <Ionicons name="calendar" size={20} color="#FFF" />
        <Text style={styles.actionBtnText}>PLANIFICACIÓN (MACRO/MICRO)</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionTitle]}>EVOLUCIÓN SEMANAL (FATIGA)</Text>
      <View style={[styles.chartCard, { backgroundColor: colors.surface, marginBottom: 25 }]}>
        <View style={styles.barsContainer}>
          {history.length > 0 ? history.map((day, idx) => (
            <View key={idx} style={[styles.barWrapper, { justifyContent: 'flex-end', height: '100%' }]}>
              <View style={[styles.bar, { height: `${(day.fatigue / 5) * 100}%`, backgroundColor: getLevelColor(day.fatigue) }]} />
              <Text style={styles.barDate}>{day.date.split('-')[2]}</Text>
            </View>
          )) : <Text style={{color: colors.textSecondary, fontSize: 12}}>Esperando datos...</Text>}
        </View>
      </View>

      <Text style={[styles.sectionTitle]}>ÚLTIMO REGISTRO DE BIENESTAR</Text>
      <View style={[styles.mainCard, { backgroundColor: colors.surface }]}>
        <View style={styles.wellnessRow}>
          <View style={styles.wellBox}><Text style={[styles.wellVal, { color: getLevelColor(summary?.latest_wellness?.fatigue) }]}>{summary?.latest_wellness?.fatigue || '-'}</Text><Text style={styles.wellLabel}>FATIGA</Text></View>
          <View style={styles.wellBox}><Text style={[styles.wellVal, { color: getLevelColor(summary?.latest_wellness?.soreness) }]}>{summary?.latest_wellness?.soreness || '-'}</Text><Text style={styles.wellLabel}>DOLOR</Text></View>
          <View style={styles.wellBox}><Text style={[styles.wellVal, { color: getLevelColor(summary?.latest_wellness?.sleep_quality, true) }]}>{summary?.latest_wellness?.sleep_quality || '-'}</Text><Text style={styles.wellLabel}>SUEÑO</Text></View>
        </View>
        {summary?.latest_wellness?.notes && (
          <View style={[styles.noteBox, { backgroundColor: colors.surfaceHighlight }]}><Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} /><Text style={[styles.noteText, { color: colors.textPrimary }]}>"{summary.latest_wellness.notes}"</Text></View>
        )}
      </View>
    </View>
  );

  const renderWorkouts = () => (
    <View style={styles.tabContainer}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>HISTORIAL DE SESIONES</Text>
        <TouchableOpacity style={{ backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => router.push(`/add-workout?athlete_id=${params.id}&name=${encodeURIComponent(params.name)}`)}>
          <Ionicons name="add" size={16} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>NUEVO</Text>
        </TouchableOpacity>
      </View>
      {workouts.length > 0 ? workouts.map((wk) => (
        <View key={wk.id} style={[styles.sessionCardExpanded, { backgroundColor: colors.surface }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => wk.completed && toggleWorkout(wk.id)} activeOpacity={wk.completed ? 0.6 : 1}>
              <View style={[styles.avatarCircle, { backgroundColor: wk.completed ? (colors.success || '#10B981') + '15' : colors.primary + '15' }]}>
                <Ionicons name={wk.completed ? "checkmark-done" : "barbell"} size={22} color={wk.completed ? (colors.success || '#10B981') : colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary, textDecorationLine: wk.completed ? 'line-through' : 'none' }]}>{wk.title}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{wk.date} • {wk.completed ? 'Completado' : 'Pendiente'}</Text>
              </View>
              {wk.completed && <Ionicons name={expandedWorkouts[wk.id] ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} style={{ marginRight: 10 }} />}
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 5 }}>
              <TouchableOpacity style={styles.iconHitbox} onPress={() => { setWorkoutToDuplicate(wk); setDuplicateDate(new Date().toISOString().split('T')[0]); setShowDuplicateModal(true); }}>
                <Ionicons name="copy-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconHitbox} onPress={() => router.push({ pathname: '/edit-workout', params: { workoutId: wk.id } })}>
                <Ionicons name="pencil-outline" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconHitbox} onPress={() => handleDeleteWorkout(wk.id, wk.title)}>
                <Ionicons name="trash-outline" size={20} color={colors.error || '#EF4444'} />
              </TouchableOpacity>
            </View>
          </View>

          {wk.completed && wk.completion_data && expandedWorkouts[wk.id] && (
            <View style={[styles.completionDetails, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 12, letterSpacing: 0.5 }}>
                  ESFUERZO (RPE): <Text style={{ color: colors.success || '#10B981', fontSize: 14 }}>{wk.completion_data.rpe || '-'}/10</Text>
                </Text>
              </View>
              {wk.completion_data.exercise_results?.map((ex: any, idx: number) => {
                const noteKey = `${wk.id}-force-${idx}`;
                const currentNote = draftNotes[noteKey] !== undefined ? draftNotes[noteKey] : (ex.coach_note || '');
                const isSaved = currentNote === ex.coach_note && !!ex.coach_note;
                return (
                  <View key={idx} style={[styles.exerciseCard, { borderColor: colors.border, backgroundColor: colors.surfaceHighlight }]}>
                    <View style={styles.exerciseHeader}>
                      <Text style={[styles.exerciseName, { color: colors.textPrimary, flex: 1 }]}>{ex.name}</Text>
                    </View>
                    {ex.recorded_video_url && <MiniVideoPlayer url={ex.recorded_video_url} onExpand={setExpandedVideo} />}
                    {isTrainer && (
                      <View style={styles.feedbackRow}>
                        <TextInput style={[styles.feedbackInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]} placeholder="Añadir feedback..." value={currentNote} onChangeText={(t) => setDraftNotes(prev => ({...prev, [noteKey]: t}))} />
                        <TouchableOpacity style={[styles.sendBtn, { backgroundColor: isSaved ? colors.success : colors.primary }]} onPress={() => saveCoachNote(wk, idx, currentNote)}>
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
      )) : <View style={{ alignItems: 'center', padding: 30 }}><Ionicons name="folder-open-outline" size={40} color={colors.border} /><Text style={{ color: colors.textSecondary, marginTop: 10 }}>No hay sesiones registradas.</Text></View>}
    </View>
  );

  const renderProgression = () => (
    <View style={styles.tabContainer}>
      <Text style={styles.sectionTitle}>VOLUMEN DE CARGA (KILOS TOTALES)</Text>
      <View style={[styles.progressionCard, { backgroundColor: colors.surface }]}>
        {workouts.filter(w => w.completed).length > 0 ? (
          <View style={styles.barsContainer}>
            {workouts.filter(w => w.completed).slice(-7).map((wk, idx) => (
              <View key={idx} style={[styles.barWrapper, { justifyContent: 'flex-end', height: '100%' }]}>
                <View style={[styles.bar, styles.progressionBar, { height: '50%', backgroundColor: colors.primary }]} />
                <Text style={styles.barDate}>{wk.date.split('-')[2]}</Text>
              </View>
            ))}
          </View>
        ) : <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>Completa sesiones para ver evolución.</Text>}
      </View>
    </View>
  );

  const activeContent = () => { if (activeTab === 'dashboard') return renderDashboard(); if (activeTab === 'workouts') return renderWorkouts(); if (activeTab === 'progression') return renderProgression(); };

  if (loading) return <SafeAreaView style={{flex:1, justifyContent:'center', alignItems:'center', backgroundColor: colors.background}}><ActivityIndicator size="large" color={colors.primary}/></SafeAreaView>;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.textPrimary} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{params.name}</Text>
        <TouchableOpacity onPress={loadData}><Ionicons name="sync" size={24} color={colors.primary} /></TouchableOpacity>
      </View>
      <View style={styles.tabsRow}>
        {[{ id: 'dashboard', label: 'RESUMEN' }, { id: 'workouts', label: 'SESIONES' }, { id: 'progression', label: 'EVOLUCIÓN' }].map(tab => (
          <TouchableOpacity key={tab.id} style={[styles.tab, activeTab === tab.id && { borderBottomColor: colors.primary, borderBottomWidth: 3 }]} onPress={() => setActiveTab(tab.id as any)}>
            <Text style={[styles.tabText, { color: activeTab === tab.id ? colors.primary : colors.textSecondary }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>{activeContent()}</ScrollView>
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
          {expandedVideo && <Video source={{ uri: expandedVideo }} style={styles.fullVideo} resizeMode={ResizeMode.CONTAIN} useNativeControls shouldPlay />}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' }, headerTitle: { fontSize: 22, fontWeight: '900' }, tabsRow: { flexDirection: 'row', justifyContent: 'space-around', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }, tab: { paddingVertical: 15, flex: 1, alignItems: 'center' }, tabText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 }, tabContainer: { padding: 20, paddingBottom: 100 }, alert: { flexDirection: 'row', padding: 18, borderRadius: 20, marginBottom: 25, borderLeftWidth: 6 }, cycleCard: { padding: 16, borderRadius: 20, marginBottom: 20, borderWidth: 1 }, sectionTitle: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 15, letterSpacing: 1.5 }, chartCard: { padding: 20, borderRadius: 25, height: 160, justifyContent: 'flex-end', elevation: 2 }, barsContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: '100%' }, barWrapper: { alignItems: 'center', flex: 1, height: '100%' }, bar: { width: 16, borderRadius: 8, minHeight: 5 }, barDate: { fontSize: 9, color: '#999', marginTop: 8, fontWeight: '700' }, barValue: { fontSize: 9, fontWeight: '800', marginBottom: 4 }, mainCard: { padding: 20, borderRadius: 25, elevation: 2 }, wellnessRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15 }, wellBox: { alignItems: 'center' }, wellVal: { fontSize: 26, fontWeight: '900' }, wellLabel: { fontSize: 9, fontWeight: '800', color: '#888', marginTop: 4 }, noteBox: { flexDirection: 'row', padding: 15, borderRadius: 15, gap: 10, marginTop: 10 }, noteText: { fontSize: 13, fontStyle: 'italic', flex: 1, lineHeight: 18 }, actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 20, gap: 12 }, actionBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 }, sessionCardExpanded: { padding: 18, borderRadius: 20, marginBottom: 15, elevation: 1 }, iconHitbox: { padding: 8 }, completionDetails: { marginTop: 15, padding: 15, borderRadius: 12, borderWidth: 1 }, avatarCircle: { width: 46, height: 46, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 }, cardTitle: { fontSize: 15, fontWeight: '800' }, progressionCard: { padding: 20, borderRadius: 25, height: 180, justifyContent: 'flex-end', elevation: 2 }, progressionBar: { width: 20, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }, modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }, modalContent: { padding: 24, borderRadius: 20 }, modalTitle: { fontSize: 18, fontWeight: '900', marginBottom: 10 }, modalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' }, input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 }, label: { fontSize: 11, fontWeight: '800', marginBottom: 6, letterSpacing: 0.5 }, miniVideoContainer: { width: 120, height: 80, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', position: 'relative' }, miniVideo: { width: '100%', height: '100%' }, expandBtn: { position: 'absolute', right: 5, bottom: 5, backgroundColor: 'rgba(0,0,0,0.6)', padding: 6, borderRadius: 8 }, fullscreenVideoOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }, closeModalBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10 }, fullVideo: { width: '100%', height: '80%' }, whatsappFab: { position: 'absolute', bottom: 30, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: '#25D366', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  exerciseCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 }, exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }, exerciseName: { fontSize: 14, fontWeight: '800' }, planBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }, planText: { fontSize: 11, fontWeight: '900' }, feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5 }, feedbackInput: { flex: 1, paddingHorizontal: 15, paddingVertical: 10, borderRadius: 10, borderWidth: 1, fontSize: 13 }, sendBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }
});
