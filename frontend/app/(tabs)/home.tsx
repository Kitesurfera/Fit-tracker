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

  const TrainerView = () => (
    <FlatList
      testID="trainer-dashboard"
      data={athletes}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.greeting, { color: colors.textSecondary }]}>BIENVENIDO</Text>
              <Text style={[styles.userName, { color: colors.textPrimary }]}>{user?.name}</Text>
            </View>
            <View style={[styles.roleBadge, { backgroundColor: colors.primary + '20' }]}>
              <Text style={[styles.roleText, { color: colors.primary }]}>ENTRENADOR</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{athletes.length}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>DEPORTISTAS</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{workouts.length}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>ENTRENAMIENTOS</Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              testID="add-athlete-btn"
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/add-athlete')}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add-outline" size={20} color="#FFF" />
              <Text style={styles.actionBtnText}>Deportista</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="add-workout-btn"
              style={[styles.actionBtn, { backgroundColor: colors.accent }]}
              onPress={() => router.push('/add-workout')}
              activeOpacity={0.7}
            >
              <Ionicons name="barbell-outline" size={20} color="#FFF" />
              <Text style={styles.actionBtnText}>Entreno</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Deportistas</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          testID={`athlete-card-${item.id}`}
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => router.push({ pathname: '/athlete-detail', params: { id: item.id, name: item.name } })}
          activeOpacity={0.7}
        >
          <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>
              {item.name?.charAt(0)?.toUpperCase()}
            </Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.name}</Text>
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
              {item.sport || 'Sin deporte'} {item.position ? `· ${item.position}` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No tienes deportistas aun
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Crea tu primer deportista con el boton de arriba
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
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.greeting, { color: colors.textSecondary }]}>BIENVENIDO</Text>
              <Text style={[styles.userName, { color: colors.textPrimary }]}>{user?.name}</Text>
            </View>
            <View style={[styles.roleBadge, { backgroundColor: colors.accent + '20' }]}>
              <Text style={[styles.roleText, { color: colors.accent }]}>DEPORTISTA</Text>
            </View>
          </View>

          {summary && (
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{summary.week_workouts}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>ESTA SEMANA</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.success || colors.primary }]}>{summary.completion_rate}%</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>COMPLETADOS</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{summary.total_tests}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>TESTS</Text>
              </View>
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Mis entrenamientos</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={[styles.workoutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.workoutHeader}>
            <Text style={[styles.workoutTitle, { color: colors.textPrimary }]}>{item.title}</Text>
            {item.completed && (
              <View style={[styles.completedBadge, { backgroundColor: colors.success + '20' }]}>
                <Ionicons name="checkmark" size={14} color={colors.success} />
              </View>
            )}
          </View>
          <Text style={[styles.workoutDate, { color: colors.textSecondary }]}>{item.date}</Text>
          {item.exercises?.length > 0 && (
            <View style={styles.exerciseList}>
              {item.exercises.slice(0, 3).map((ex: any, i: number) => (
                <Text key={i} style={[styles.exerciseText, { color: colors.textSecondary }]}>
                  {ex.name} {ex.sets && `${ex.sets}x${ex.reps}`} {ex.weight && `@ ${ex.weight}kg`}
                </Text>
              ))}
              {item.exercises.length > 3 && (
                <Text style={[styles.exerciseText, { color: colors.primary }]}>
                  +{item.exercises.length - 3} mas...
                </Text>
              )}
            </View>
          )}
          {!item.completed && (
            <TouchableOpacity
              testID={`complete-workout-${item.id}`}
              style={[styles.completeBtn, { borderColor: colors.success }]}
              onPress={async () => {
                await api.updateWorkout(item.id, { completed: true });
                loadData();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
              <Text style={[styles.completeBtnText, { color: colors.success }]}>Completar</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="barbell-outline" size={48} color={colors.textSecondary} />
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
  listContent: { padding: 16, paddingBottom: 32 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  greeting: { fontSize: 12, fontWeight: '600', letterSpacing: 1.5 },
  userName: { fontSize: 28, fontWeight: '700', marginTop: 4 },
  roleBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  roleText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1, borderRadius: 12, padding: 16, borderWidth: 1, alignItems: 'center',
  },
  statValue: { fontSize: 28, fontWeight: '700' },
  statLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 8, padding: 14,
  },
  actionBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  sectionTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  card: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700' },
  cardContent: { flex: 1, marginLeft: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 13, marginTop: 2 },
  workoutCard: { borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1 },
  workoutHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  workoutTitle: { fontSize: 17, fontWeight: '600', flex: 1 },
  completedBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  workoutDate: { fontSize: 13, marginTop: 4 },
  exerciseList: { marginTop: 12, gap: 4 },
  exerciseText: { fontSize: 14 },
  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 12, borderRadius: 8, borderWidth: 1, padding: 10,
  },
  completeBtnText: { fontSize: 14, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 48, gap: 12 },
  emptyText: { fontSize: 17, fontWeight: '600' },
  emptySubtext: { fontSize: 14, textAlign: 'center' },
});
