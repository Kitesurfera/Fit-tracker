import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Dimensions, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
import { useAuth } from '../../src/context/AuthContext';

const { width } = Dimensions.get('window');

// --- EL DICCIONARIO TRADUCTOR ---
// Aquí mapeamos los nombres feos de la base de datos a etiquetas bonitas
const TEST_LABELS: Record<string, string> = {
  squat_rm: 'Sentadilla', 
  bench_rm: 'Press Banca', 
  deadlift_rm: 'Peso Muerto',
  cmj: 'Salto CMJ', 
  sj: 'Salto SJ', 
  dj: 'Salto DJ (Drop Jump)',
  hamstring: 'Fuerza Isquios', 
  calf: 'Fuerza Gemelo', 
  quadriceps: 'Fuerza Cuádriceps', 
  tibialis: 'Fuerza Tibial',
  'max-force': 'Fuerza Máxima (1RM)',
  'core-endurance': 'Resistencia Core',
  'vo2-max': 'VO2 Max',
  'explosiveness': 'Explosividad',
  'agility': 'Agilidad / Cambio de Dirección'
};

const normalizeName = (name: string) => {
  let n = name.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.endsWith('es')) n = n.slice(0, -2);
  else if (n.endsWith('s')) n = n.slice(0, -1);
  return n;
};

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  
  const isTrainer = user?.role === 'trainer';

  const [activeTab, setActiveTab] = useState<'summary' | 'progress'>('summary');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [summary, setSummary] = useState<any>(null);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  const [testHistory, setTestHistory] = useState<any[]>([]);
  
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<any>(null);
  const [showPicker, setShowPicker] = useState(false);

  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      if (isTrainer) {
        try {
          const aths = await api.getAthletes();
          setAthletes(aths);
          if (aths.length > 0) {
            handleSelectAthlete(aths[0]);
          } else {
            setLoading(false);
          }
        } catch (e) {
          console.log("Error cargando atletas:", e);
          setLoading(false);
        }
      } else {
        loadAthleteData(user?.id);
      }
    };
    init();
  }, [isTrainer, user?.id]);

  const loadAthleteData = async (athleteId: string | undefined) => {
    if (!athleteId) return;
    setLoading(true);
    try {
      const [sum, wk, ts] = await Promise.all([
        api.getSummary(athleteId).catch(() => null), 
        api.getWorkouts({ athlete_id: athleteId }).catch(() => []),
        api.getTests({ athlete_id: athleteId }).catch(() => []),
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

  const handleSelectAthlete = (athlete: any) => {
    setSelectedAthlete(athlete);
    setShowPicker(false);
    loadAthleteData(athlete.id);
  };

  const onRefresh = () => { 
    setRefreshing(true); 
    loadAthleteData(isTrainer ? selectedAthlete?.id : user?.id); 
  };

  // --- FILTRO ACTUALIZADO: LOS 3 ÚLTIMOS TESTS EN EL TIEMPO ---
  const getLatestTests = () => {
    if (!testHistory || testHistory.length === 0) return [];
    
    // Ordenamos de más reciente a más antiguo
    const sortedTests = [...testHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    // Devolvemos exactamente los 3 primeros de la lista
    return sortedTests.slice(0, 3);
  };

  const getCleanProgression = () => {
    const exercises: Record<string, any> = {};

    workoutHistory.forEach(w => {
      w.completion_data?.exercise_results?.forEach((r: any) => {
        if (r.completed_sets > 0 && r.name) {
          const rawName = r.name.trim();
          const normKey = normalizeName(rawName);
          const weight = parseFloat(r.logged_weight) || 0;
          const reps = parseInt(r.logged_reps) || 0;
          const date = w.date;

          if (!exercises[normKey]) {
            exercises[normKey] = { name: rawName, maxWeight: 0, maxReps: 0, history: [] };
          }
          
          if (rawName.length > exercises[normKey].name.length || (rawName[0] && rawName[0] === rawName[0].toUpperCase())) {
             exercises[normKey].name = rawName; 
          }

          if (weight > exercises[normKey].maxWeight) {
            exercises[normKey].maxWeight = weight;
            exercises[normKey].maxReps = reps;
          }

          exercises[normKey].history.push({ date, weight, reps });
        }
      });
    });

    return Object.values(exercises).sort((a: any, b: any) => a.name.localeCompare(b.name));
  };

  const renderChart = (history: any[]) => {
    const data = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const maxW = Math.max(...data.map(d => d.weight));
    const minW = Math.min(...data.map(d => d.weight));
    const range = maxW - minW === 0 ? 10 : maxW - minW;

    return (
      <View style={styles.chartContainer}>
        <View style={[styles.yAxis, { borderRightColor: colors.border }]}>
          <Text style={[styles.axisText, { color: colors.textSecondary }]}>{maxW}kg -</Text>
          <Text style={[styles.axisText, { color: colors.textSecondary }]}>{(maxW + minW) / 2}kg -</Text>
          <Text style={[styles.axisText, { color: colors.textSecondary }]}>{minW}kg -</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartScroll}>
          {data.map((h, i) => {
            const heightPct = minW === maxW ? 50 : ((h.weight - minW) / range) * 75 + 15;
            return (
              <View key={i} style={styles.chartCol}>
                <View style={styles.chartBarArea}>
                  <View style={[styles.chartLine, { height: `${heightPct}%`, backgroundColor: colors.primary + '30' }]} />
                  <View style={[styles.chartPoint, { bottom: `${heightPct}%`, backgroundColor: colors.primary }]} />
                </View>
                <View style={styles.xLabels}>
                  <Text style={[styles.chartXDate, { color: colors.textSecondary }]}>{h.date.split('-').slice(1).join('/')}</Text>
                  <Text style={[styles.chartXData, { color: colors.textPrimary }]}>{h.weight}k x{h.reps}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderProgressionCard = (item: any) => {
    const isSelected = selectedExercise === item.name;

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
                Récord Histórico: <Text style={{ color: colors.primary, fontWeight: '800' }}>{item.maxWeight} kg</Text> x {item.maxReps} reps
              </Text>
            </View>
          </View>
          <Ionicons name={isSelected ? "chevron-up" : "bar-chart-outline"} size={22} color={colors.primary} />
        </TouchableOpacity>

        {isSelected && (
          <View style={[styles.chartWrapper, { borderTopColor: colors.border }]}>
            {renderChart(item.history)}
          </View>
        )}
      </View>
    );
  };

  if (loading && !summary && testHistory.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const cleanProgression = getCleanProgression();
  const latestTestsToDisplay = getLatestTests();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            {isTrainer ? (
              <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>ANALÍTICAS DEL DEPORTISTA</Text>
            ) : null}
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {isTrainer ? (selectedAthlete?.name || 'Rendimiento') : 'Rendimiento'}
            </Text>
          </View>

          <View style={styles.headerActions}>
            {isTrainer && (
              <TouchableOpacity onPress={() => setShowPicker(true)} style={[styles.iconBtn,
