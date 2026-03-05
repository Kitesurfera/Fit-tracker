import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert, Modal, TextInput, ScrollView, Platform, Dimensions
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from "react-native-chart-kit"; // Asumimos esta librería estándar en Expo
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

const { width } = Dimensions.get('window');

export default function AthleteDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name: string }>();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'workouts' | 'progression'>('dashboard');
  
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [athlete, setAthlete] = useState<any>(null);
  
  // Estados para el gráfico
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [chartTimeframe, setChartTimeframe] = useState<'days' | 'months'>('days');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [ath, wk] = await Promise.all([
        api.getAthlete(params.id!),
        api.getWorkouts({ athlete_id: params.id! }),
      ]);
      setAthlete(ath);
      setWorkouts(wk);
    } catch (e) { console.log(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const onRefresh = () => { setRefreshing(true); loadData(); };

  // --- LÓGICA DE PROGRESIÓN MEJORADA ---
  const getCleanProgression = () => {
    const exercises: Record<string, any> = {};

    workouts.filter(w => w.completed && w.completion_data).forEach(w => {
      w.completion_data.exercise_results.forEach((r: any) => {
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

          // Récord histórico
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

  const renderProgressionItem = ({ item }: { item: any }) => {
    const isSelected = selectedExercise === item.name;
    
    // Procesar datos para el gráfico
    let chartData = [...item.history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    if (chartTimeframe === 'months') {
      const monthlyMax: Record<string, number> = {};
      chartData.forEach(p => {
        const month = p.date.substring(0, 7); // YYYY-MM
        monthlyMax[month] = Math.max(monthlyMax[month] || 0, p.weight);
      });
      chartData = Object.keys(monthlyMax).map(m => ({ date: m, weight: monthlyMax[m] }));
    }

    // Tomar los últimos 6 puntos para que no sature la pantalla
    const displayData = chartData.slice(-6);

    return (
      <View style={[styles.progCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity 
          style={styles.progHeader} 
          onPress={() => setSelectedExercise(isSelected ? null : item.name)}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.progName, { color: colors.textPrimary }]}>{item.name}</Text>
            <View style={styles.pbContainer}>
              <Ionicons name="trophy" size={14} color={colors.primary} />
              <Text style={[styles.pbText, { color: colors.textSecondary }]}>
                Récord: <Text style={{ color: colors.primary, fontWeight: '800' }}>{item.maxWeight} kg</Text> x {item.maxRepsAtMaxWeight} reps
              </Text>
            </View>
          </View>
          <Ionicons name={isSelected ? "chevron-up" : "analytics"} size={20} color={colors.primary} />
        </TouchableOpacity>

        {isSelected && displayData.length > 1 && (
          <View style={styles.chartContainer}>
            <View style={styles.timeframeToggle}>
              <TouchableOpacity 
                onPress={() => setChartTimeframe('days')}
                style={[styles.toggleBtn, chartTimeframe === 'days' && { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.toggleBtnText, { color: chartTimeframe === 'days' ? '#FFF' : colors.textSecondary }]}>Días</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => setChartTimeframe('months')}
                style={[styles.toggleBtn, chartTimeframe === 'months' && { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.toggleBtnText, { color: chartTimeframe === 'months' ? '#FFF' : colors.textSecondary }]}>Meses</Text>
              </TouchableOpacity>
            </View>

            <LineChart
              data={{
                labels: displayData.map(d => chartTimeframe === 'days' ? d.date.split('-')[2] : d.date.split('-')[1]),
                datasets: [{ data: displayData.map(d => d.weight) }]
              }}
              width={width - 64}
              height={180}
              chartConfig={{
                backgroundColor: colors.surface,
                backgroundGradientFrom: colors.surface,
                backgroundGradientTo: colors.surface,
                decimalPlaces: 1,
                color: (opacity = 1) => colors.primary,
                labelColor: (opacity = 1) => colors.textSecondary,
                propsForDots: { r: "5", strokeWidth: "2", stroke: colors.primary }
              }}
              bezier
              style={styles.chartStyle}
            />
            <Text style={styles.axisLabel}>$Eje\ Y:\ Peso\ (kg)\ |\ Eje\ X:\ {chartTimeframe === 'days' ? 'Día' : 'Mes'}$</Text>
          </View>
        )}
      </View>
    );
  };

  const progressionData = getCleanProgression();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{athlete?.name || 'Cargando...'}</Text>
        <TouchableOpacity onPress={onRefresh} style={{ padding: 4 }}>
          <Ionicons name="sync-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={activeTab === 'progression' ? progressionData : []} // Aquí iría el resto de tabs
        keyExtractor={(item) => item.name}
        renderItem={renderProgressionItem}
        ListHeaderComponent={
          <View style={{ padding: 16 }}>
             {/* Aquí irían las tabs de Resumen, Entrenos, etc. */}
             <View style={styles.tabs}>
                <TouchableOpacity style={[styles.tab, activeTab === 'progression' && styles.activeTab]} onPress={() => setActiveTab('progression')}>
                   <Text style={[styles.tabText, activeTab === 'progression' && {color: colors.primary}]}>Progreso Real</Text>
                </TouchableOpacity>
             </View>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  tabs: { flexDirection: 'row', marginBottom: 20 },
  tab: { paddingVertical: 10, marginRight: 20 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#007AFF' },
  tabText: { fontWeight: '600', color: '#888' },
  progCard: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  progHeader: { padding: 16, flexDirection: 'row', alignItems: 'center' },
  progName: { fontSize: 17, fontWeight: '700' },
  pbContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  pbText: { fontSize: 13 },
  chartContainer: { padding: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#eee' },
  timeframeToggle: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 8, padding: 2, marginBottom: 16 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
  toggleBtnText: { fontSize: 12, fontWeight: '700' },
  chartStyle: { marginVertical: 8, borderRadius: 16 },
  axisLabel: { fontSize: 10, color: '#aaa', marginTop: 4 }
});
