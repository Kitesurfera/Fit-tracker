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

const TEST_LABELS: Record<string, string> = {
  squat_rm: 'Sentadilla', bench_rm: 'Press Banca', deadlift_rm: 'Peso Muerto',
  cmj: 'Salto CMJ', sj: 'Salto SJ', dj: 'DJ',
  hamstring: 'Isquios', calf: 'Gemelo', quadriceps: 'Cuádriceps', tibialis: 'Tibial',
};

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  
  const isTrainer = user?.role === 'trainer';

  const [activeTab, setActiveTab] = useState<'summary' | 'progress'>('summary');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // --- Estados de datos ---
  const [summary, setSummary] = useState<any>(null);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  const [testHistory, setTestHistory] = useState<any[]>([]);
  
  // --- Estados para el Entrenador ---
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<any>(null);
  const [showPicker, setShowPicker] = useState(false);

  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  // Inicialización (carga la lista de atletas si eres entrenador)
  useEffect(() => {
    const init = async () => {
      if (isTrainer) {
        try {
          const aths = await api.getAthletes();
          setAthletes(aths);
          if (aths.length > 0) {
            handleSelectAthlete(aths[0]); // Selecciona el primero por defecto
          } else {
            setLoading(false); // No hay atletas
          }
        } catch (e) {
          console.log("Error cargando atletas:", e);
          setLoading(false);
        }
      } else {
        // Si es deportista, carga sus datos directamente
        loadAthleteData(user?.id);
      }
    };
    init();
  }, [isTrainer, user?.id]);

  // Función genérica para cargar datos de un ID concreto
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

  if (loading && !summary) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const cleanProgression = getCleanProgression();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* CABECERA DINÁMICA */}
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
              <TouchableOpacity onPress={() => setShowPicker(true)} style={[styles.iconBtn, { backgroundColor: colors.surfaceHighlight }]}>
                <Ionicons name="people" size={22} color={colors.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onRefresh} disabled={refreshing} style={[styles.iconBtn, { backgroundColor: colors.surfaceHighlight }]}>
              {refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="sync-outline" size={22} color={colors.primary} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* TABS */}
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
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Entrenos Totales</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                  <Ionicons name="checkmark-done-outline" size={24} color={colors.success} />
                  <Text style={[styles.statValue, { color: colors.success }]}>{summary?.completion_rate || 0}%</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Efectividad</Text>
                </View>
              </View>

              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                 {isTrainer ? `Últimos Tests de ${selectedAthlete?.name?.split(' ')[0] || ''}` : 'Mis Últimos Tests'}
              </Text>

              {Object.keys(summary?.latest_tests || {}).length > 0 ? (
                Object.values(summary.latest_tests).map((t: any, i) => (
                  <View key={i} style={[styles.itemRow, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.itemName, { color: colors.textPrimary }]}>{TEST_LABELS[t.test_name] || t.test_name}</Text>
                    <Text style={[styles.itemValue, { color: colors.primary }]}>{t.value} {t.unit}</Text>
                  </View>
                ))
              ) : (
                <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
                   <Ionicons name="analytics-outline" size={32} color={colors.border} />
                   <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 10, fontWeight: '600' }}>Sin registros de tests recientes</Text>
                </View>
              )}
            </View>
          ) : (
            <View>
              <View style={styles.sectionHeader}>
                <Ionicons name="trending-up-outline" size={20} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0, marginLeft: 8 }]}>
                  {isTrainer ? 'Récords Personales' : 'Mis Récords Personales'}
                </Text>
              </View>
              
              {cleanProgression.length > 0 ? (
                 cleanProgression.map(renderProgressionCard)
              ) : (
                 <View style={[styles.emptyCard, { backgroundColor: colors.surface, marginTop: 10 }]}>
                   <Ionicons name="barbell-outline" size={32} color={colors.border} />
                   <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 10, fontWeight: '600' }}>No hay datos de progresión registrados.</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* SELECTOR DE DEPORTISTA (SÓLO ENTRENADOR) */}
      <Modal visible={showPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowPicker(false)} activeOpacity={1}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Seleccionar Deportista</Text>
            {athletes.map(a => (
              <TouchableOpacity key={a.id} style={[styles.athleteItem, { borderBottomColor: colors.border }]} onPress={() => handleSelectAthlete(a)}>
                <View style={[styles.avatarMini, { backgroundColor: colors.primary + '20' }]}>
                  <Text style={{ color: colors.primary, fontWeight: '800' }}>{a.name.charAt(0)}</Text>
                </View>
                <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16 }}>{a.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 15, paddingBottom: 15 },
  headerSubtitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 2 },
  headerTitle: { fontSize: 26, fontWeight: '900' },
  headerActions: { flexDirection: 'row', gap: 10 },
  iconBtn: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  tabs: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 15, borderBottomWidth: 1 },
  tab: { paddingVertical: 12, marginRight: 25 },
  tabText: { fontSize: 15, fontWeight: '700' },
  innerContent: { paddingHorizontal: 20 },
  
  statsGrid: { flexDirection: 'row', gap: 15, marginBottom: 30 },
  statCard: { flex: 1, padding: 22, borderRadius: 20, alignItems: 'center', gap: 8, elevation: 1 },
  statValue: { fontSize: 28, fontWeight: '900' },
  statLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 15, letterSpacing: 0.5 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderRadius: 16, marginBottom: 10, elevation: 1 },
  itemName: { fontSize: 15, fontWeight: '700' },
  itemValue: { fontSize: 18, fontWeight: '900' },
  
  progCard: { borderRadius: 16, marginBottom: 12, borderWidth: 1, overflow: 'hidden' },
  progHeader: { padding: 18, flexDirection: 'row', alignItems: 'center' },
  progName: { fontSize: 16, fontWeight: '800' },
  pbRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  pbText: { fontSize: 13, fontWeight: '600' },
  historyList: { paddingHorizontal: 18, backgroundColor: 'rgba(0,0,0,0.01)' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 },
  historyDate: { fontSize: 13, fontWeight: '600' },
  historyData: { flexDirection: 'row', gap: 10 },
  historyWeight: { fontSize: 14, fontWeight: '800' },
  historyReps: { fontSize: 14, fontWeight: '500' },

  emptyCard: { padding: 30, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, paddingBottom: 50 },
  modalTitle: { fontSize: 18, fontWeight: '900', marginBottom: 20, textAlign: 'center' },
  athleteItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1 },
  avatarMini: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 }
});
