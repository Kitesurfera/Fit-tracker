import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
import { useAuth } from '../../src/context/AuthContext';

const { width } = Dimensions.get('window');

const TEST_LABELS: Record<string, string> = {
  squat_rm: 'Sentadilla', bench_rm: 'Press Banca', deadlift_rm: 'Peso Muerto',
  cmj: 'Salto CMJ', sj: 'Salto SJ', dj: 'DJ',
  hamstring: 'Isquios', calf: 'Gemelo', quadriceps: 'Cuádriceps', tibialis: 'Tibial',
};

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'summary' | 'progress'>('summary');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [summary, setSummary] = useState<any>(null);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  const [testHistory, setTestHistory] = useState<any[]>([]);
  
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [sum, wk, ts] = await Promise.all([
        api.getSummary().catch(() => null), 
        api.getWorkouts().catch(() => []),
        api.getTests().catch(() => []),
      ]);
      setSummary(sum);
      setWorkoutHistory(Array.isArray(wk) ? wk.filter((w: any) => w.completed && w.completion_data) : []);
      setTestHistory(Array.isArray(ts) ? ts : []);
    } catch (e) {
      console.log('Error loading analytics:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);
  
  const onRefresh = () => { setRefreshing(true); loadData(); };

  // Lógica de Progresión: Agrupa por nombre y busca el Récord Máximo (PB)
  const getCleanProgression = () => {
    const exercises: Record<string, any> = {};

    workoutHistory.forEach(w => {
      w.completion_data?.exercise_results?.forEach((r: any) => {
        if (r.completed_sets > 0) {
          const name = r.name;
          const weight = parseFloat(r.logged_weight) || 0;
          const reps = parseInt(r.logged_reps) || 0;
          const date = w.date;

          if (!exercises[name]) {
            exercises[name] = { name, maxWeight: 0, maxReps: 0, history: [] };
          }

          if (weight > exercises[name].maxWeight) {
            exercises[name].maxWeight = weight;
            exercises[name].maxReps = reps;
          }

          exercises[name].history.push({ date, weight, reps });
        }
      });
    });

    return Object.values(exercises).sort((a: any, b: any) => a.name.localeCompare(b.name));
  };

  const renderProgressionCard = (item: any) => {
    const isSelected = selectedExercise === item.name;
    const sortedHistory = [...item.history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
      <View key={item.name} style={[styles.progCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity 
          style={styles.progHeader} 
          onPress={() => setSelectedExercise(isSelected ? null : item.name)}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.progName, { color: colors.textPrimary }]}>{item.name}</Text>
            <View style={styles.pbRow}>
              <Ionicons name="trophy" size={14} color="#FFD700" />
              <Text style={[styles.pbText, { color: colors.textSecondary }]}>
                Récord: <Text style={{ color: colors.primary, fontWeight: '800' }}>{item.maxWeight} kg</Text> x {item.maxReps} reps
              </Text>
            </View>
          </View>
          <Ionicons name={isSelected ? "chevron-up" : "chevron-forward"} size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        {isSelected && (
          <View style={[styles.historyList, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            {sortedHistory.map((h, i) => (
              <View key={i} style={[styles.historyRow, i > 0 && { borderTopWidth: 0.5, borderTopColor: colors.border }]}>
                <Text style={[styles.historyDate, { color: colors.textSecondary }]}>{h.date}</Text>
                <View style={styles.historyData}>
                  <Text style={[styles.historyWeight, { color: colors.textPrimary }]}>{h.weight} kg</Text>
                  <Text style={[styles.historyReps, { color: colors.textSecondary }]}>x {h.reps} reps</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
      </SafeAreaView>
    );
  }

  const cleanProgression = getCleanProgression();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Rendimiento</Text>
          <TouchableOpacity onPress={onRefresh} disabled={refreshing} style={styles.refreshBtn}>
            {refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="sync-outline" size={24} color={colors.primary} />}
          </TouchableOpacity>
        </View>

        <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'summary' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab('summary')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'summary' ? colors.primary : colors.textSecondary }]}>Resumen</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'progress' && { borderBottomColor: colors.success, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab('progress')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'progress' ? colors.success : colors.textSecondary }]}>Progreso Real</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.innerContent}>
          {activeTab === 'summary' ? (
            <View>
              <View style={styles.statsGrid}>
                <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                  <Ionicons name="flash-outline" size={24} color={colors.primary} />
                  <Text style={[styles.statValue, { color: colors.textPrimary }]}>{summary?.total_workouts || 0}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Entrenos</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                  <Ionicons name="checkmark-done-outline" size={24} color={colors.success} />
                  <Text style={[styles.statValue, { color: colors.success }]}>{summary?.completion_rate || 0}%</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Efectividad</Text>
                </View>
              </View>

              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Últimos Tests</Text>
              {Object.keys(summary?.latest_tests || {}).length > 0 ? (
                Object.values(summary.latest_tests).map((t: any, i) => (
                  <View key={i} style={[styles.itemRow, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.itemName, { color: colors.textPrimary }]}>{TEST_LABELS[t.test_name] || t.test_name}</Text>
                    <Text style={[styles.itemValue, { color: colors.primary }]}>{t.value} {t.unit}</Text>
                  </View>
                ))
              ) : (
                <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 10 }}>Sin registros</Text>
              )}
            </View>
          ) : (
            <View>
              <View style={styles.sectionHeader}>
                <Ionicons name="trending-up-outline" size={20} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0, marginLeft: 8 }]}>Mis Récords Personales</Text>
              </View>
              {cleanProgression.map(renderProgressionCard)}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 15, paddingBottom: 10 },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  refreshBtn: { padding: 4 },
  tabs: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 10, borderBottomWidth: 1 },
  tab: { paddingVertical: 12, marginRight: 25 },
  tabText: { fontSize: 16, fontWeight: '600' },
  innerContent: { paddingHorizontal: 20, paddingTop: 10 },
  statsGrid: { flexDirection: 'row', gap: 15, marginBottom: 25 },
  statCard: { flex: 1, padding: 20, borderRadius: 18, alignItems: 'center', gap: 8 },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 12, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 15 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderRadius: 12, marginBottom: 10 },
  itemName: { fontSize: 16, fontWeight: '600' },
  itemValue: { fontSize: 16, fontWeight: '700' },
  progCard: { borderRadius: 16, marginBottom: 12, borderWidth: 1, overflow: 'hidden' },
  progHeader: { padding: 16, flexDirection: 'row', alignItems: 'center' },
  progName: { fontSize: 17, fontWeight: '700' },
  pbRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  pbText: { fontSize: 13 },
  historyList: { paddingHorizontal: 16 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  historyDate: { fontSize: 13, fontWeight: '500' },
  historyData: { flexDirection: 'row', gap: 8 },
  historyWeight: { fontSize: 14, fontWeight: '700' },
  historyReps: { fontSize: 14 },
});
