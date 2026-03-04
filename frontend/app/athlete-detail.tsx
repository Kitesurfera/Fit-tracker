import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert, Linking, TextInput, Modal, ScrollView, Platform
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

const TEST_LABELS: Record<string, string> = {
  squat_rm: 'Sentadilla RM', bench_rm: 'Press Banca RM', deadlift_rm: 'Peso Muerto RM',
  cmj: 'CMJ', sj: 'SJ', dj: 'DJ',
  hamstring: 'Isquiotibiales', calf: 'Gemelo', quadriceps: 'Cuadriceps', tibialis: 'Tibial',
};

export default function AthleteDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name: string }>();
  const [athlete, setAthlete] = useState<any>(null);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'workouts' | 'tests' | 'progression'>('workouts');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null);
  const [duplicateModal, setDuplicateModal] = useState<any>(null);
  const [duplicateDate, setDuplicateDate] = useState('');
  const [duplicating, setDuplicating] = useState(false);

  const tObj = new Date();
  const todayYMD = `${tObj.getFullYear()}-${String(tObj.getMonth() + 1).padStart(2, '0')}-${String(tObj.getDate()).padStart(2, '0')}`;

  const loadData = async () => {
    try {
      const [ath, wk, ts] = await Promise.all([
        api.getAthlete(params.id!),
        api.getWorkouts({ athlete_id: params.id! }),
        api.getTests({ athlete_id: params.id! }),
      ]);
      setAthlete(ath);
      setWorkouts(wk);
      setTests(ts);
    } catch (e) { console.log(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { loadData(); }, []);
  const onRefresh = () => { setRefreshing(true); loadData(); };

  // CORREGIDO PARA WEB: Borrar Deportista
  const handleDeleteAthlete = () => {
    if (Platform.OS === 'web') {
      const confirm = window.confirm(`¿Estás seguro de eliminar a ${params.name}?`);
      if (confirm) {
        api.deleteAthlete(params.id!).then(() => router.back()).catch(e => console.log(e));
      }
    } else {
      Alert.alert('Eliminar deportista', `¿Estás seguro de eliminar a ${params.name}?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: async () => {
          try { await api.deleteAthlete(params.id!); router.back(); } catch (e) { console.log(e); }
        }},
      ]);
    }
  };

  // CORREGIDO PARA WEB: Borrar Entrenamiento
  const handleDeleteWorkout = async (wId: string) => {
    if (Platform.OS === 'web') {
      const confirm = window.confirm('¿Seguro que quieres borrar este entrenamiento?');
      if (confirm) {
        try { 
          await api.deleteWorkout(wId); 
          setWorkouts(prev => prev.filter(w => w.id !== wId)); 
        } catch (e) { console.log(e); }
      }
    } else {
      Alert.alert('Eliminar entreno', '¿Seguro que quieres borrarlo?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: async () => {
          try { await api.deleteWorkout(wId); setWorkouts(prev => prev.filter(w => w.id !== wId)); }
          catch (e) { console.log(e); }
        }}
      ]);
    }
  };

  const openDuplicateModal = (workout: any) => {
    setDuplicateModal(workout);
    setDuplicateDate(todayYMD);
  };

  const handleDuplicate = async () => {
    if (!duplicateModal || !duplicateDate) return;
    setDuplicating(true);
    try {
      const newWorkout = await api.createWorkout({
        athlete_id: params.id!,
        date: duplicateDate,
        title: duplicateModal.title + ' (Copia)',
        exercises: duplicateModal.exercises.map((ex: any) => ({
          name: ex.name, sets: ex.sets, reps: ex.reps,
          weight: ex.weight || '', rest: ex.rest || '', video_url: ex.video_url || '',
          exercise_notes: ex.exercise_notes || '',
        })),
        notes: duplicateModal.notes || '',
      });
      setWorkouts(prev => [newWorkout, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setDuplicateModal(null);
      if (Platform.OS === 'web') {
        window.alert('Entrenamiento copiado con éxito.');
      } else {
        Alert.alert('¡Duplicado!', 'Entrenamiento copiado con éxito.');
      }
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert(e.message || 'No se pudo duplicar');
      } else {
        Alert.alert('Error', e.message || 'No se pudo duplicar');
      }
    } finally { setDuplicating(false); }
  };

  const calcCompletionStats = () => {
    let totalSets = 0, completedSets = 0;
    workouts.forEach(w => {
      const cd = w.completion_data;
      if (cd?.exercise_results?.length > 0) {
        cd.exercise_results.forEach((r: any) => {
          totalSets += r.total_sets || 0;
          completedSets += r.completed_sets || 0;
        });
      } else if (w.completed) {
        (w.exercises || []).forEach((ex: any) => {
          const s = parseInt(ex.sets) || 0;
          totalSets += s;
          completedSets += s;
        });
      } else {
        (w.exercises || []).forEach((ex: any) => {
          totalSets += parseInt(ex.sets) || 0;
        });
      }
    });
    const pct = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;
    return { totalSets, completedSets, pct };
  };

  const getProgressionData = () => {
    const history: Record<string, any[]> = {};

    workouts.filter(w => w.completed && w.completion_data).forEach(w => {
      w.completion_data.exercise_results.forEach((r: any) => {
        if (r.completed_sets > 0) {
          if (!history[r.name]) history[r.name] = [];
          const originalEx = w.exercises?.[r.exercise_index];
          history[r.name].push({
            date: w.date,
            weight: r.logged_weight || originalEx?.weight || '-',
            reps: r.logged_reps || originalEx?.reps || '-',
            completed_sets: r.completed_sets,
            total_sets: r.total_sets
          });
        }
      });
    });

    return Object.keys(history).map(name => ({
      name,
      history: history[name].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    })).sort((a, b) => a.name.localeCompare(b.name));
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
      </SafeAreaView>
    );
  }

  const { pct } = calcCompletionStats();
  const progressionData = getProgressionData();

  const renderWorkoutItem = ({ item }: { item: any }) => {
    const isExpanded = expandedWorkout === item.id;
    const cd = item.completion_data;
    const hasCompletionData = cd?.exercise_results?.length > 0;
    const isMissed = !item.completed && item.date < todayYMD;

    let cSets = 0, sSets = 0, tSets = 0;
    if (hasCompletionData) {
      cd.exercise_results.forEach((r: any) => {
        cSets += r.completed_sets || 0;
        sSets += r.skipped_sets || 0;
        tSets += r.total_sets || 0;
      });
    }

    return (
      <TouchableOpacity
        testID={`workout-card-${item.id}`}
        style={[styles.workoutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => setExpandedWorkout(isExpanded ? null : item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.workoutSummary}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.title}</Text>
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
              {item.date} · {item.exercises?.length || 0} ejercicios
            </Text>
            {item.completed && hasCompletionData && (
              <View style={[styles.completionSummary, { backgroundColor: sSets > 0 ? colors.warning + '12' : colors.success + '12' }]}>
                <Ionicons name={sSets > 0 ? 'alert-circle' : 'checkmark-circle'} size={14}
                  color={sSets > 0 ? colors.warning : colors.success} />
                <Text style={[styles.completionSummaryText, { color: sSets > 0 ? colors.warning : colors.success }]}>
                  {cSets}/{tSets} series{sSets > 0 ? ` · ${sSets} saltada${sSets > 1 ? 's' : ''}` : ''}
                </Text>
              </View>
            )}
            {isMissed && (
              <View style={[styles.completionSummary, { backgroundColor: colors.error + '12' }]}>
                <Ionicons name="close-circle" size={14} color={colors.error} />
                <Text style={[styles.completionSummaryText, { color: colors.error }]}>No realizado</Text>
              </View>
            )}
          </View>
          <View style={styles.cardActions}>
            {item.completed && !hasCompletionData && (
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            )}
            <TouchableOpacity onPress={() => openDuplicateModal(item)} activeOpacity={0.7} style={{ padding: 4 }}>
              <Ionicons name="copy-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push({ pathname: '/edit-workout', params: { workoutId: item.id } })} activeOpacity={0.7} style={{ padding: 4 }}>
              <Ionicons name="create-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteWorkout(item.id)} activeOpacity={0.7} style={{ padding: 4 }}>
              <Ionicons name="trash-outline" size={20} color={colors.error} />
            </TouchableOpacity>
            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
          </View>
        </View>

        {isExpanded && (
          <View style={[styles.expandedSection, { borderTopColor: colors.border }]}>
            {item.exercises?.map((ex: any, i: number) => {
              const exResult = cd?.exercise_results?.find((r: any) => r.exercise_index === i);
              const allDone = exResult && exResult.skipped_sets === 0;
              const allSkipped = exResult && exResult.completed_sets === 0;
              return (
                <View key={i} style={[styles.exRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: 0.5 }]}>
                  <View style={[styles.exBadge, {
                    backgroundColor: exResult ? (allDone ? colors.success + '15' : allSkipped ? colors.error + '15' : colors.warning + '15') : colors.primary + '12',
                  }]}>
                    {exResult ? (
                      <Ionicons name={allDone ? 'checkmark' : allSkipped ? 'close' : 'remove'} size={14}
                        color={allDone ? colors.success : allSkipped ? colors.error : colors.warning} />
                    ) : (
                      <Text style={[styles.exBadgeText, { color: colors.primary }]}>{i + 1}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.exName, { color: colors.textPrimary }]}>{ex.name}</Text>
                    
                    {exResult && (exResult.logged_weight || exResult.logged_reps) ? (
                      <View style={[styles.realDataBox, { backgroundColor: colors.success + '10', borderColor: colors.success + '40' }]}>
                        <Text style={[styles.realDataTitle, { color: colors.success }]}>Completado con:</Text>
                        <Text style={[styles.exDetails, { color: colors.textPrimary, fontWeight: '600' }]}>
                          {[exResult.logged_reps && `${exResult.logged_reps} reps`,
                            exResult.logged_weight && `${exResult.logged_weight} kg`
                          ].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    ) : (
                      <Text style={[styles.exDetails, { color: colors.textSecondary }]}>
                        {[ex.sets && `${ex.sets} series`, ex.reps && `${ex.reps} reps`,
                          ex.weight && `${ex.weight} kg`, ex.rest && `${ex.rest}s desc`,
                        ].filter(Boolean).join(' · ') || 'Sin detalles'}
                      </Text>
                    )}

                    {exResult && (
                      <View style={styles.completionRow}>
                        {exResult.set_details?.map((sd: any, si: number) => (
                          <View key={si} style={[styles.completionDot,
                            sd.status === 'completed' && { backgroundColor: colors.success },
                            sd.status === 'skipped' && { backgroundColor: colors.error },
                            sd.status === 'pending' && { backgroundColor: colors.border },
                          ]} />
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderTestItem = ({ item }: { item: any }) => (
    <View style={[styles.testCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
        {item.test_name === 'custom' ? item.custom_name : (TEST_LABELS[item.test_name] || item.test_name)}
      </Text>
      {item.value_left != null || item.value_right != null ? (
        <View style={styles.bilateralRow}>
          <Text style={[styles.bilateralVal, { color: '#1565C0' }]}>IZQ {item.value_left ?? '-'}</Text>
          <Text style={[styles.bilateralSep, { color: colors.border }]}>|</Text>
          <Text style={[styles.bilateralVal, { color: '#C62828' }]}>DER {item.value_right ?? '-'}</Text>
          <Text style={[styles.testUnit, { color: colors.textSecondary }]}>{item.unit}</Text>
        </View>
      ) : (
        <View style={styles.testValueRow}>
          <Text style={[styles.testVal, { color: colors.primary }]}>{item.value}</Text>
          <Text style={[styles.testUnit, { color: colors.textSecondary }]}>{item.unit}</Text>
        </View>
      )}
      <Text style={[styles.cardSub, { color: colors.textSecondary }]}>{item.date}</Text>
    </View>
  );

  const renderProgressionItem = ({ item }: { item: any }) => (
    <View style={[styles.progressionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.progressionHeader, { backgroundColor: colors.success + '15' }]}>
        <Ionicons name="trending-up-outline" size={18} color={colors.success} />
        <Text style={[styles.progressionTitle, { color: colors.success }]}>{item.name}</Text>
      </View>
      
      <View style={styles.progressionTable}>
        {item.history.map((h: any, i: number) => (
          <View key={i} style={[styles.progressionRow, i > 0 && { borderTopWidth: 0.5, borderTopColor: colors.border }]}>
            <Text style={[styles.progressionDate, { color: colors.textSecondary }]}>{h.date}</Text>
            <View style={styles.progressionStats}>
              <Text style={[styles.progressionStatText, { color: colors.textSecondary }]}>{h.completed_sets}/{h.total_sets} ser.</Text>
              <Text style={[styles.progressionStatText, { color: colors.textPrimary }]}>{h.reps} rep</Text>
              <Text style={[styles.progressionStatBold, { color: colors.textPrimary }]}>{h.weight} kg</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const data = activeTab === 'workouts' ? workouts : activeTab === 'tests' ? tests : progressionData;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-athlete-detail" activeOpacity={0.7} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{params.name}</Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <TouchableOpacity onPress={onRefresh} disabled={refreshing} style={{ padding: 4 }}>
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="sync-outline" size={22} color={colors.primary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDeleteAthlete} testID="delete-athlete-btn" activeOpacity={0.7} style={{ padding: 4 }}>
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        testID="athlete-detail-list"
        data={data}
        keyExtractor={(item, index) => item.id || `prog-${index}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>{athlete?.name?.charAt(0)?.toUpperCase()}</Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={[styles.profileName, { color: colors.textPrimary }]}>{athlete?.name}</Text>
                <Text style={[styles.profileSub, { color: colors.textSecondary }]}>{athlete?.email}</Text>
                <Text style={[styles.profileSub, { color: colors.textSecondary }]}>
                  {athlete?.sport || 'Sin deporte'}
                </Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{workouts.length}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Entrenos</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: pct >= 75 ? colors.success : pct >= 40 ? colors.warning : colors.error }]}>{pct}%</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Realizado</Text>
                <View style={[styles.miniProgressBg, { backgroundColor: colors.surfaceHighlight }]}>
                  <View style={[styles.miniProgressFill, { width: `${pct}%`, backgroundColor: pct >= 75 ? colors.success : pct >= 40 ? colors.warning : colors.error }]} />
                </View>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{tests.length}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Tests</Text>
              </View>
            </View>

            <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
              <View style={{ flexDirection: 'row', width: '100%' }}>
                <TouchableOpacity style={[styles.tab, activeTab === 'workouts' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setActiveTab('workouts')} activeOpacity={0.7}>
                  <Text style={[styles.tabText, { color: activeTab === 'workouts' ? colors.primary : colors.textSecondary }]}>Entrenos</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, activeTab === 'tests' && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]} onPress={() => setActiveTab('tests')} activeOpacity={0.7}>
                  <Text style={[styles.tabText, { color: activeTab === 'tests' ? colors.accent : colors.textSecondary }]}>Tests</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, activeTab === 'progression' && { borderBottomColor: colors.success, borderBottomWidth: 2 }]} onPress={() => setActiveTab('progression')} activeOpacity={0.7}>
                  <Text style={[styles.tabText, { color: activeTab === 'progression' ? colors.success : colors.textSecondary }]}>Progresión</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        }
        renderItem={activeTab === 'workouts' ? renderWorkoutItem : activeTab === 'tests' ? renderTestItem : renderProgressionItem}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name={activeTab === 'workouts' ? 'barbell-outline' : activeTab === 'tests' ? 'analytics-outline' : 'trending-up-outline'} size={40} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {activeTab === 'workouts' ? 'Sin entrenamientos' : activeTab === 'tests' ? 'Sin tests' : 'Sin datos de progresión aún'}
            </Text>
          </View>
        }
      />

      {activeTab !== 'progression' && (
        <View style={styles.fabRow}>
          <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} onPress={() => router.push({ pathname: '/add-workout', params: { athleteId: params.id } })} activeOpacity={0.7}>
            <Ionicons name="barbell-outline" size={22} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.fab, { backgroundColor: colors.accent }]} onPress={() => router.push({ pathname: '/add-test', params: { athleteId: params.id } })} activeOpacity={0.7}>
            <Ionicons name="analytics-outline" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={!!duplicateModal} transparent animationType="fade" onRequestClose={() => setDuplicateModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Duplicar Entrenamiento</Text>
            <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
              Elige la fecha para el nuevo entrenamiento. Se copiarán todos los ejercicios, series y repeticiones.
            </Text>

            <View style={styles.modalField}>
              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>FECHA (YYYY-MM-DD)</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                value={duplicateDate}
                onChangeText={setDuplicateDate}
                placeholder="2024-10-15"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={() => setDuplicateModal(null)} activeOpacity={0.7}>
                <Text style={[styles.modalBtnText, { color: colors.textPrimary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={handleDuplicate} disabled={duplicating} activeOpacity={0.7}>
                {duplicating ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Duplicar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  profileCard: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, borderRadius: 12, padding: 16, borderWidth: 1 },
  avatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 24, fontWeight: '700' },
  profileInfo: { marginLeft: 14, flex: 1 },
  profileName: { fontSize: 18, fontWeight: '600' },
  profileSub: { fontSize: 13, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statBox: { flex: 1, borderRadius: 10, padding: 14, borderWidth: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  miniProgressBg: { width: '80%', height: 4, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  miniProgressFill: { height: '100%', borderRadius: 2 },
  tabs: { flexDirection: 'row', borderBottomWidth: 0.5 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 14, fontWeight: '600' },
  listContent: { padding: 16, paddingBottom: 100 },
  workoutCard: { borderRadius: 12, marginBottom: 10, borderWidth: 1, overflow: 'hidden' },
  workoutSummary: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 13, marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  completionSummary: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
  completionSummaryText: { fontSize: 12, fontWeight: '600' },
  expandedSection: { borderTopWidth: 0.5, paddingHorizontal: 14, paddingBottom: 14 },
  exRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, gap: 10 },
  exBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  exBadgeText: { fontSize: 12, fontWeight: '700' },
  exName: { fontSize: 15, fontWeight: '600' },
  exDetails: { fontSize: 13, marginTop: 3 },
  realDataBox: { marginTop: 6, padding: 8, borderRadius: 8, borderWidth: 1 },
  realDataTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
  completionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  completionDot: { width: 10, height: 10, borderRadius: 5 },
  testCard: { borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1 },
  testValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 6 },
  testVal: { fontSize: 24, fontWeight: '700' },
  testUnit: { fontSize: 14 },
  bilateralRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  bilateralVal: { fontSize: 16, fontWeight: '700' },
  bilateralSep: { fontSize: 16 },
  
  progressionCard: { borderRadius: 12, marginBottom: 12, borderWidth: 1, overflow: 'hidden' },
  progressionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  progressionTitle: { fontSize: 15, fontWeight: '700', textTransform: 'uppercase' },
  progressionTable: { paddingHorizontal: 12 },
  progressionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  progressionDate: { fontSize: 13, fontWeight: '600' },
  progressionStats: { flexDirection: 'row', gap: 12, alignItems: 'baseline' },
  progressionStatText: { fontSize: 13 },
  progressionStatBold: { fontSize: 15, fontWeight: '700' },
  
  emptyState: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyText: { fontSize: 15 },
  fabRow: { position: 'absolute', bottom: 24, right: 16, flexDirection: 'row', gap: 12 },
  fab: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { width: '100%', borderRadius: 16, padding: 24, gap: 14 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalSub: { fontSize: 14, lineHeight: 20 },
  modalField: { gap: 6 },
  modalLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  modalInput: { borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
  modalBtnText: { fontSize: 15, fontWeight: '600' },
});
