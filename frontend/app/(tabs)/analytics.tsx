import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
import { useAuth } from '../../src/context/AuthContext';

const { width } = Dimensions.get('window');

const TEST_LABELS: Record<string, string> = {
  squat_rm: 'Sentadilla', bench_rm: 'Press Banca', deadlift_rm: 'Peso Muerto',
  cmj: 'Salto CMJ', sj: 'Salto SJ', dj: 'Salto DJ',
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
  
  // Estados para el filtro de deportistas
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const params: any = {};
      if (selectedAthlete) params.athlete_id = selectedAthlete;

      const [sum, wk, ts, ath] = await Promise.all([
        api.getSummary(params), 
        api.getWorkouts(params),
        api.getTests(params),
        user?.role === 'trainer' ? api.getAthletes() : Promise.resolve([])
      ]);
      setSummary(sum);
      setWorkoutHistory(wk.filter((w: any) => w.completed && w.completion_data));
      setTestHistory(ts);
      setAthletes(ath);
    } catch (e) {
      console.log('Error loading analytics:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Recargar datos cuando se cambia el deportista seleccionado
  useEffect(() => { loadData(); }, [selectedAthlete]);
  
  const onRefresh = () => { setRefreshing(true); loadData(); };

  const getWorkoutProgression = () => {
    const groups: Record<string, any[]> = {};
    workoutHistory.forEach(w => {
      w.completion_data.exercise_results.forEach((r: any) => {
        if (r.completed_sets > 0 && (r.logged_weight || w.exercises?.[r.exercise_index]?.weight)) {
          if (!groups[r.name]) groups[r.name] = [];
          groups[r.name].push({
            date: w.date,
            weight: r.logged_weight || w.exercises?.[r.exercise_index]?.weight || '0',
            reps: r.logged_reps || w.exercises?.[r.exercise_index]?.reps || '0'
          });
        }
      });
    });
    return Object.keys(groups).map(name => ({
      name,
      data: groups[name].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5)
    })).sort((a, b) => a.name.localeCompare(b.name));
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
      </SafeAreaView>
    );
  }

  const workoutProgression = getWorkoutProgression();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Rendimiento</Text>
      </View>

      {/* FILTRO DE DEPORTISTAS (SOLO PARA ENTRENADORES) */}
      {user?.role === 'trainer' && Array.isArray(athletes) && athletes.length > 0 && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.athleteFilter}
        >
          {[{ id: null, name: 'Todos' }, ...athletes].map((item, index) => (
            <TouchableOpacity
              key={item.id || `all-${index}`}
              style={[
                styles.athleteChip,
                { backgroundColor: colors.surfaceHighlight },
                selectedAthlete === item.id && { backgroundColor: colors.primary },
              ]}
              onPress={() => setSelectedAthlete(item.id)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.athleteChipText,
                { color: colors.textPrimary },
                selectedAthlete === item.id && { color: '#FFF' },
              ]}>
                {item.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

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
          <Text style={[styles.tabText, { color: activeTab === 'progress' ? colors.success : colors.textSecondary }]}>Progreso</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {activeTab === 'summary' ? (
          <View>
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                <Ionicons name="flash-outline" size={24} color={colors.primary} />
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{summary?.total_workouts || 0}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Entrenos totales</Text>
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
              <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 10 }}>No hay tests registrados</Text>
            )}
          </View>
        ) : (
          <View>
            <View style={styles.sectionHeader}>
              <Ionicons name="trophy-outline" size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0, marginLeft: 8 }]}>RMs (Tests Físicos)</Text>
            </View>
            
            <View style={styles.horizontalScroll}>
              {testHistory.filter(t => t.test_type === 'strength').slice(0, 4).map((t, i) => (
                <View key={i} style={[styles.rmCard, { backgroundColor: colors.surface, borderColor: colors.primary + '30' }]}>
                  <Text style={[styles.rmLabel, { color: colors.textSecondary }]}>{TEST_LABELS[t.test_name] || t.test_name}</Text>
                  <Text style={[styles.rmValue, { color: colors.primary }]}>{t.value}<Text style={styles.rmUnit}>{t.unit}</Text></Text>
                  <Text style={[styles.rmDate, { color: colors.textSecondary }]}>{t.date}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.sectionHeader, { marginTop: 20 }]}>
              <Ionicons name="trending-up-outline" size={20} color={colors.success} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0, marginLeft: 8 }]}>Cargas en Entrenamientos</Text>
            </View>

            {workoutProgression.length > 0 ? (
              workoutProgression.map((item, i) => (
                <View key={i} style={[styles.progCard, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.progName, { color: colors.textPrimary }]}>{item.name}</Text>
                  <View style={styles.progHistory}>
                    {item.data.map((h, idx) => (
                      <View key={idx} style={[styles.progRow, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                        <Text style={[styles.progDate, { color: colors.textSecondary }]}>{h.date}</Text>
                        <View style={styles.progStats}>
                          <Text style={[styles.progWeight, { color: colors.textPrimary }]}>{h.weight} kg</Text>
                          <Text style={[styles.progReps, { color: colors.textSecondary }]}>x {h.reps} rep</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="barbell-outline" size={40} color={colors.textSecondary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {selectedAthlete ? 'Este deportista no tiene registros de carga aún' : 'No hay registros de progresión de cargas'}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 10 },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  // Estilos del nuevo filtro
  athleteFilter: { paddingHorizontal: 20, paddingBottom: 15, gap: 8 },
  athleteChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  athleteChipText: { fontSize: 13, fontWeight: '500' },
  // Fin estilos filtro
  tabs: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 10, borderBottomWidth: 1 },
  tab: { paddingVertical: 12, marginRight: 25 },
  tabText: { fontSize: 16, fontWeight: '600' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  statsGrid: { flexDirection: 'row', gap: 15, marginBottom: 25 },
  statCard: { flex: 1, padding: 20, borderRadius: 18, alignItems: 'center', gap: 8, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 15 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderRadius: 12, marginBottom: 10 },
  itemName: { fontSize: 16, fontWeight: '600' },
  itemValue: { fontSize: 16, fontWeight: '700' },
  horizontalScroll: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  rmCard: { width: width * 0.4, padding: 15, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  rmLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 5 },
  rmValue: { fontSize: 26, fontWeight: '900' },
  rmUnit: { fontSize: 14, fontWeight: '600' },
  rmDate: { fontSize: 11, marginTop: 5 },
  progCard: { borderRadius: 16, padding: 16, marginBottom: 15, elevation: 1 },
  progName: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  progHistory: { borderRadius: 10, overflow: 'hidden' },
  progRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, alignItems: 'center' },
  progDate: { fontSize: 13, fontWeight: '500' },
  progStats: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progWeight: { fontSize: 15, fontWeight: '800' },
  progReps: { fontSize: 13, fontWeight: '500' },
  emptyState: { alignItems: 'center', marginTop: 40, paddingHorizontal: 40 },
  emptyText: { textAlign: 'center', fontSize: 14, marginTop: 10, lineHeight: 20 },
});
