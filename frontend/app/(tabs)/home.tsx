import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';

export default function HomeScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [athletes, setAthletes] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      if (user?.role === 'trainer') {
        const [ath, wk] = await Promise.all([api.getAthletes(), api.getWorkouts()]);
        setAthletes(ath);
        setWorkouts(wk.slice(0, 5));
      } else {
        const [wk, sum] = await Promise.all([api.getWorkouts(), api.getSummary()]);
        setWorkouts(wk.slice(0, 10));
        setSummary(sum);
      }
    } catch (e) {
      console.log('Load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);
  const onRefresh = () => { setRefreshing(true); loadData(); };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
      </SafeAreaView>
    );
  }

  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  const TrainerView = () => (
    <FlatList
      testID="trainer-dashboard"
      data={athletes}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View>
          <Text style={[styles.date, { color: colors.textSecondary }]}>{today}</Text>
          <Text style={[styles.greeting, { color: colors.textPrimary }]}>Hola, {user?.name?.split(' ')[0]}</Text>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{athletes.length}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Deportistas</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{workouts.length}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Entrenos</Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              testID="add-athlete-btn"
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/add-athlete')}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add-outline" size={18} color="#FFF" />
              <Text style={styles.actionBtnText}>Nuevo deportista</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="add-workout-btn"
              style={[styles.actionBtnOutline, { borderColor: colors.primary }]}
              onPress={() => router.push('/add-workout')}
              activeOpacity={0.7}
            >
              <Ionicons name="barbell-outline" size={18} color={colors.primary} />
              <Text style={[styles.actionBtnOutlineText, { color: colors.primary }]}>Nuevo entreno</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Deportistas{athletes.length > 0 ? ` (${athletes.length})` : ''}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          testID={`athlete-card-${item.id}`}
          style={[styles.card, { backgroundColor: colors.surface }]}
          onPress={() => router.push({ pathname: '/athlete-detail', params: { id: item.id, name: item.name } })}
          activeOpacity={0.7}
        >
          <View style={[styles.avatar, { backgroundColor: colors.primary + '15' }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>
              {item.name?.charAt(0)?.toUpperCase()}
            </Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.name}</Text>
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
              {[item.sport, item.position].filter(Boolean).join(' · ') || 'Sin deporte asignado'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={44} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Sin deportistas</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Crea tu primer deportista para empezar
          </Text>
        </View>
      }
      contentContainerStyle={styles.listContent}
    />
  );

  const AthleteView = () => (
    <FlatList
      testID="athlete-dashboard"
      data={workouts}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View>
          <Text style={[styles.date, { color: colors.textSecondary }]}>{today}</Text>
          <Text style={[styles.greeting, { color: colors.textPrimary }]}>Hola, {user?.name?.split(' ')[0]}</Text>

          {summary && (
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.statValue, { color: colors.primary }]}>{summary.week_workouts}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Esta semana</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.statValue, { color: colors.success }]}>{summary.completion_rate}%</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Completados</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{summary.total_tests}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Tests</Text>
              </View>
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Mis entrenamientos</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={[styles.workoutCard, { backgroundColor: colors.surface }]}>
          <View style={styles.workoutTop}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.workoutTitle, { color: colors.textPrimary }]}>{item.title}</Text>
              <Text style={[styles.workoutDate, { color: colors.textSecondary }]}>{item.date}</Text>
            </View>
            {item.completed ? (
              <View style={[styles.badge, { backgroundColor: colors.success + '15' }]}>
                <Ionicons name="checkmark" size={14} color={colors.success} />
                <Text style={[styles.badgeText, { color: colors.success }]}>Hecho</Text>
              </View>
            ) : (
              <View style={[styles.badge, { backgroundColor: colors.warning + '15' }]}>
                <Text style={[styles.badgeText, { color: colors.warning }]}>Pendiente</Text>
              </View>
            )}
          </View>
          {item.exercises?.length > 0 && (
            <View style={[styles.exercisePreview, { borderTopColor: colors.border }]}>
              {item.exercises.slice(0, 3).map((ex: any, i: number) => (
                <Text key={i} style={[styles.exerciseText, { color: colors.textSecondary }]}>
                  {ex.name}{ex.sets ? ` — ${ex.sets}×${ex.reps}` : ''}{ex.weight ? ` @ ${ex.weight}kg` : ''}
                </Text>
              ))}
              {item.exercises.length > 3 && (
                <Text style={[styles.exerciseMore, { color: colors.primary }]}>
                  +{item.exercises.length - 3} ejercicios mas
                </Text>
              )}
            </View>
          )}
          {!item.completed && (
            <TouchableOpacity
              testID={`complete-workout-${item.id}`}
              style={[styles.completeBtn, { backgroundColor: colors.success }]}
              onPress={async () => {
                await api.updateWorkout(item.id, { completed: true });
                loadData();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
              <Text style={styles.completeBtnText}>Marcar como completado</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="barbell-outline" size={44} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Sin entrenamientos</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Tu entrenador aun no ha asignado entrenamientos
          </Text>
        </View>
      }
      contentContainerStyle={styles.listContent}
    />
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {user?.role === 'trainer' ? <TrainerView /> : <AthleteView />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 20, paddingBottom: 32 },
  date: { fontSize: 13, fontWeight: '500', textTransform: 'capitalize', marginBottom: 4 },
  greeting: { fontSize: 26, fontWeight: '700', marginBottom: 24 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: { flex: 1, borderRadius: 14, padding: 18, alignItems: 'center' },
  statValue: { fontSize: 26, fontWeight: '700' },
  statLabel: { fontSize: 12, fontWeight: '500', marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 10, paddingVertical: 14,
  },
  actionBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  actionBtnOutline: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 10, paddingVertical: 14, borderWidth: 1.5,
  },
  actionBtnOutlineText: { fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  card: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14,
    marginBottom: 10,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 17, fontWeight: '700' },
  cardContent: { flex: 1, marginLeft: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 13, marginTop: 2 },
  workoutCard: { borderRadius: 14, padding: 16, marginBottom: 12 },
  workoutTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  workoutTitle: { fontSize: 16, fontWeight: '600' },
  workoutDate: { fontSize: 13, marginTop: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  exercisePreview: { marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, gap: 4 },
  exerciseText: { fontSize: 14 },
  exerciseMore: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 14, borderRadius: 8, paddingVertical: 12,
  },
  completeBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyText: { fontSize: 17, fontWeight: '600' },
  emptySubtext: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
