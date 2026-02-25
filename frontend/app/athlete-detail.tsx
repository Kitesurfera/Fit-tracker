import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert, RefreshControl, Linking
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
  const [activeTab, setActiveTab] = useState<'workouts' | 'tests'>('workouts');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null);

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

  const handleDeleteAthlete = () => {
    Alert.alert('Eliminar deportista', `Estas seguro de eliminar a ${params.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try { await api.deleteAthlete(params.id!); router.back(); } catch (e) { console.log(e); }
      }},
    ]);
  };

  const handleDeleteWorkout = async (wId: string) => {
    try { await api.deleteWorkout(wId); setWorkouts(prev => prev.filter(w => w.id !== wId)); }
    catch (e) { console.log(e); }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
      </SafeAreaView>
    );
  }

  const renderWorkoutItem = ({ item }: { item: any }) => {
    const isExpanded = expandedWorkout === item.id;
    const cd = item.completion_data;
    const hasCompletionData = cd?.exercise_results?.length > 0;

    // Summary of completion
    let completedSets = 0, skippedSets = 0, totalSets = 0;
    if (hasCompletionData) {
      cd.exercise_results.forEach((r: any) => {
        completedSets += r.completed_sets || 0;
        skippedSets += r.skipped_sets || 0;
        totalSets += r.total_sets || 0;
      });
    }

    return (
      <TouchableOpacity
        testID={`workout-card-${item.id}`}
        style={[styles.workoutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => setExpandedWorkout(isExpanded ? null : item.id)}
        activeOpacity={0.7}
      >
        {/* Summary row */}
        <View style={styles.workoutSummary}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.title}</Text>
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
              {item.date} · {item.exercises?.length || 0} ejercicios
            </Text>
            {/* Completion summary badge */}
            {item.completed && hasCompletionData && (
              <View style={[styles.completionSummary, { backgroundColor: skippedSets > 0 ? colors.warning + '12' : colors.success + '12' }]}>
                <Ionicons
                  name={skippedSets > 0 ? 'alert-circle' : 'checkmark-circle'}
                  size={14}
                  color={skippedSets > 0 ? colors.warning : colors.success}
                />
                <Text style={[styles.completionSummaryText, { color: skippedSets > 0 ? colors.warning : colors.success }]}>
                  {completedSets}/{totalSets} series{skippedSets > 0 ? ` · ${skippedSets} saltada${skippedSets > 1 ? 's' : ''}` : ''}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.cardActions}>
            {item.completed && !hasCompletionData && (
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            )}
            <TouchableOpacity
              testID={`edit-workout-${item.id}`}
              onPress={() => router.push({ pathname: '/edit-workout', params: { workoutId: item.id } })}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteWorkout(item.id)} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </TouchableOpacity>
            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
          </View>
        </View>

        {/* Expanded exercises */}
        {isExpanded && (
          <View style={[styles.expandedSection, { borderTopColor: colors.border }]}>
            {item.exercises?.map((ex: any, i: number) => {
              const exResult = cd?.exercise_results?.find((r: any) => r.exercise_index === i);
              const allDone = exResult && exResult.skipped_sets === 0;
              const allSkipped = exResult && exResult.completed_sets === 0;
              return (
                <View key={i} style={[styles.exRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: 0.5 }]}>
                  <View style={[
                    styles.exBadge,
                    { backgroundColor: exResult ? (allDone ? colors.success + '15' : allSkipped ? colors.error + '15' : colors.warning + '15') : colors.primary + '12' },
                  ]}>
                    {exResult ? (
                      <Ionicons
                        name={allDone ? 'checkmark' : allSkipped ? 'close' : 'remove'}
                        size={14}
                        color={allDone ? colors.success : allSkipped ? colors.error : colors.warning}
                      />
                    ) : (
                      <Text style={[styles.exBadgeText, { color: colors.primary }]}>{i + 1}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.exName, { color: colors.textPrimary }]}>{ex.name}</Text>
                    <Text style={[styles.exDetails, { color: colors.textSecondary }]}>
                      {[
                        ex.sets && `${ex.sets} series`,
                        ex.reps && `${ex.reps} reps`,
                        ex.weight && `${ex.weight} kg`,
                        ex.rest && `${ex.rest}s desc`,
                      ].filter(Boolean).join(' · ') || 'Sin detalles'}
                    </Text>
                    {/* Set completion dots */}
                    {exResult && (
                      <View style={styles.completionRow}>
                        {exResult.set_details?.map((sd: any, si: number) => (
                          <View key={si} style={[
                            styles.completionDot,
                            sd.status === 'completed' && { backgroundColor: colors.success },
                            sd.status === 'skipped' && { backgroundColor: colors.error },
                            sd.status === 'pending' && { backgroundColor: colors.border },
                          ]} />
                        ))}
                        {exResult.skipped_sets > 0 && (
                          <Text style={[styles.completionLabel, { color: colors.error }]}>
                            {exResult.skipped_sets} saltada{exResult.skipped_sets > 1 ? 's' : ''}
                          </Text>
                        )}
                      </View>
                    )}
                    {ex.video_url ? (
                      <TouchableOpacity style={styles.videoLink} onPress={() => Linking.openURL(ex.video_url)} activeOpacity={0.6}>
                        <Ionicons name="play-circle-outline" size={16} color={colors.primary} />
                        <Text style={[styles.videoLinkText, { color: colors.primary }]}>Ver video</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            })}
            {item.notes ? (
              <View style={[styles.notesBox, { backgroundColor: colors.surfaceHighlight }]}>
                <Text style={[styles.notesText, { color: colors.textSecondary }]}>{item.notes}</Text>
              </View>
            ) : null}
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

  const data = activeTab === 'workouts' ? workouts : tests;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-athlete-detail" activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{params.name}</Text>
        <TouchableOpacity onPress={handleDeleteAthlete} testID="delete-athlete-btn" activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={22} color={colors.error} />
        </TouchableOpacity>
      </View>

      <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {athlete?.name?.charAt(0)?.toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: colors.textPrimary }]}>{athlete?.name}</Text>
          <Text style={[styles.profileSub, { color: colors.textSecondary }]}>{athlete?.email}</Text>
          <Text style={[styles.profileSub, { color: colors.textSecondary }]}>
            {athlete?.sport || 'Sin deporte'} {athlete?.position ? `· ${athlete.position}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>{workouts.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Entrenos</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>{tests.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Tests</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.success }]}>
            {workouts.filter(w => w.completed).length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Completados</Text>
        </View>
      </View>

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'workouts' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('workouts')} activeOpacity={0.7}
        >
          <Text style={[styles.tabText, { color: activeTab === 'workouts' ? colors.primary : colors.textSecondary }]}>Entrenamientos</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'tests' && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('tests')} activeOpacity={0.7}
        >
          <Text style={[styles.tabText, { color: activeTab === 'tests' ? colors.accent : colors.textSecondary }]}>Tests</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        testID="athlete-detail-list"
        data={data}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.listContent}
        renderItem={activeTab === 'workouts' ? renderWorkoutItem : renderTestItem}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name={activeTab === 'workouts' ? 'barbell-outline' : 'analytics-outline'} size={40} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Sin {activeTab === 'workouts' ? 'entrenamientos' : 'tests'}</Text>
          </View>
        }
      />

      <View style={styles.fabRow}>
        <TouchableOpacity testID="fab-add-workout" style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/add-workout')} activeOpacity={0.7}>
          <Ionicons name="barbell-outline" size={22} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity testID="fab-add-test" style={[styles.fab, { backgroundColor: colors.accent }]}
          onPress={() => router.push('/add-test')} activeOpacity={0.7}>
          <Ionicons name="analytics-outline" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  profileCard: { flexDirection: 'row', alignItems: 'center', margin: 16, borderRadius: 12, padding: 16, borderWidth: 1 },
  avatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 24, fontWeight: '700' },
  profileInfo: { marginLeft: 14, flex: 1 },
  profileName: { fontSize: 18, fontWeight: '600' },
  profileSub: { fontSize: 13, marginTop: 2 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 16 },
  statBox: { flex: 1, borderRadius: 10, padding: 14, borderWidth: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  tabs: { flexDirection: 'row', borderBottomWidth: 0.5, marginHorizontal: 16 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 15, fontWeight: '600' },
  listContent: { padding: 16, paddingBottom: 100 },
  // Workout card (expandable)
  workoutCard: { borderRadius: 12, marginBottom: 10, borderWidth: 1, overflow: 'hidden' },
  workoutSummary: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 13, marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  completionSummary: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
  completionSummaryText: { fontSize: 12, fontWeight: '600' },
  // Expanded
  expandedSection: { borderTopWidth: 0.5, paddingHorizontal: 14, paddingBottom: 14 },
  exRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, gap: 10 },
  exBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  exBadgeText: { fontSize: 12, fontWeight: '700' },
  exName: { fontSize: 15, fontWeight: '600' },
  exDetails: { fontSize: 13, marginTop: 3 },
  completionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  completionDot: { width: 10, height: 10, borderRadius: 5 },
  completionLabel: { fontSize: 11, fontWeight: '600', marginLeft: 4 },
  videoLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  videoLinkText: { fontSize: 13, fontWeight: '600' },
  notesBox: { borderRadius: 8, padding: 10, marginTop: 8 },
  notesText: { fontSize: 13, fontStyle: 'italic' },
  // Test card
  testCard: { borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1 },
  testValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 6 },
  testVal: { fontSize: 24, fontWeight: '700' },
  testUnit: { fontSize: 14 },
  bilateralRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  bilateralVal: { fontSize: 16, fontWeight: '700' },
  bilateralSep: { fontSize: 16 },
  emptyState: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyText: { fontSize: 15 },
  fabRow: { position: 'absolute', bottom: 24, right: 16, flexDirection: 'row', gap: 12 },
  fab: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
});
