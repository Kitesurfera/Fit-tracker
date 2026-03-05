import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from "react-native-chart-kit";
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
  
  // Estados para el control de la progresión y gráficas
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [chartTimeframe, setChartTimeframe] = useState<'days' | 'months'>('days');

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
  
  const onRefresh = () => { 
    setRefreshing(true); 
    loadData(); 
  };

  // --- NUEVA LÓGICA DE PROGRESIÓN SIN DUPLICADOS Y CON PBs ---
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
            exercises[name] = {
              name,
              maxWeight: 0,
              maxRepsAtMaxWeight: 0,
              history: []
            };
          }

          // Actualizar Récord Personal (PB)
          if (weight > exercises[name].maxWeight) {
            exercises[name].maxWeight = weight;
            exercises[name].maxRepsAtMaxWeight = reps;
          } else if (weight === exercises[name].maxWeight && reps > exercises[name].maxRepsAtMaxWeight) {
            exercises[name].maxRepsAtMaxWeight = reps;
          }

          exercises[name].history.push({ date, weight });
        }
      });
    });

    return Object.values(exercises).sort((a: any, b: any) => a.name.localeCompare(b.name));
  };

  const renderProgressionCard = (item: any) => {
    const isSelected = selectedExercise === item.name;
    
    // Preparar datos del gráfico
    let rawHistory = [...item.history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let labels: string[] = [];
    let dataPoints: number[] = [];

    if (chartTimeframe === 'months') {
      const monthlyMax: Record<string, number> = {};
      rawHistory.forEach(h => {
        const month = h.date.substring(5, 7); // MM
        monthlyMax[month] = Math.max(monthlyMax[month] || 0, h.weight);
      });
      const sortedMonths = Object.keys(monthlyMax).sort();
      labels = sortedMonths.map(m => m); // Solo el número del mes
      dataPoints = sortedMonths.map(m => monthlyMax[m]);
    } else {
      // Por días, últimos 6 puntos
      const recent = rawHistory.slice(-6);
      labels = recent.map(h => h.date.split('-')[2]); // Solo el día
      dataPoints = recent.map(h => h.weight);
    }

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
              <Ionicons name="trophy-outline" size={14} color={colors.primary} />
              <Text style={[styles.pbText, { color: colors.textSecondary }]}>
                Récord: <Text style={{ color: colors.primary, fontWeight: '800' }}>{item.maxWeight} kg</Text> x {item.maxRepsAtMaxWeight} reps
              </Text>
            </View>
          </View>
          <Ionicons name={isSelected ? "chevron-up" : "analytics-outline"} size={22} color={colors.primary} />
        </TouchableOpacity>

        {isSelected && dataPoints.length > 0 && (
          <View style={styles.chartArea}>
            <View style={styles.chartToggle}>
              <TouchableOpacity onPress={() => setChartTimeframe('days')} style={[styles.miniBtn, chartTimeframe === 'days' && {backgroundColor: colors.primary}]}>
                <Text style={[styles.miniBtnText, {color: chartTimeframe === 'days' ? '#FFF' : colors.textSecondary}]}>Días</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setChartTimeframe('months')} style={[styles.miniBtn, chartTimeframe === 'months' && {backgroundColor: colors.primary}]}>
                <Text style={[styles.miniBtnText, {color: chartTimeframe === 'months' ? '#FFF' : colors.textSecondary}]}>Meses</Text>
              </TouchableOpacity>
            </View>

            {dataPoints.length > 1 ? (
              <LineChart
                data={{
                  labels: labels,
                  datasets: [{ data: dataPoints }]
                }}
                width={width - 72}
                height={180}
                chartConfig={{
                  backgroundColor: colors.surface,
                  backgroundGradientFrom: colors.surface,
                  backgroundGradientTo: colors.surface,
                  decimalPlaces: 1,
                  color: (opacity = 1) => colors.primary,
                  labelColor: (opacity = 1) => colors.textSecondary,
                  style: { borderRadius: 16 },
                  propsForDots: { r: "4", strokeWidth: "2", stroke: colors.primary }
                }}
                bezier
                style={{ marginVertical: 8, borderRadius: 16 }}
              />
            ) : (
              <Text style={{ color: colors.textSecondary, padding: 20 }}>Registra más entrenos para ver la gráfica.</Text>
            )}
            <Text style={styles.chartLegend}>Eje Y: kg | Eje X: {chartTimeframe === 'days' ? 'Día' : 'Mes'}</Text>
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
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Rendimiento</Text>
          <TouchableOpacity onPress={onRefresh} disabled={refreshing} style={styles.refreshBtn}>
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="sync-outline" size={24} color={colors.primary} />
            )}
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
                <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 10 }}>No hay tests registrados</Text>
              )}
            </View>
          ) : (
            <View>
              <View style={styles.sectionHeader}>
                <Ionicons name="trending-up-outline" size={20} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0, marginLeft: 8 }]}>Mis Récords Personales</Text>
              </View>

              {cleanProgression.length > 0 ? (
                cleanProgression.map(item => renderProgressionCard(item))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="barbell-outline" size={40} color={colors.textSecondary} />
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Completa entrenamientos para ver tu progresión.</Text>
                </View>
              )}
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
  
  // ESTILOS PROGRESIÓN MEJORADA
  progCard: { borderRadius: 16, marginBottom: 12, borderWidth: 1, overflow: 'hidden' },
  progHeader: { padding: 16, flexDirection: 'row', alignItems: 'center' },
  progName: { fontSize: 17, fontWeight: '700' },
  pbRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  pbText: { fontSize: 13 },
  chartArea: { padding: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  chartToggle: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 8, padding: 2, marginBottom: 12 },
  miniBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
  miniBtnText: { fontSize: 12, fontWeight: '700' },
  chartLegend: { fontSize: 10, color: '#aaa', marginTop: 4 },
  
  emptyState: { alignItems: 'center', marginTop: 40, paddingHorizontal: 40 },
  emptyText: { textAlign: 'center', fontSize: 14, color: '#888' },
});
