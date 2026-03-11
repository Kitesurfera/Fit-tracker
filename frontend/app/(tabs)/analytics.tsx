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

const TEST_TRANSLATIONS: Record<string, string> = {
  squat_rm: 'Sentadilla RM',
  bench_rm: 'Press Banca RM',
  deadlift_rm: 'Peso Muerto RM',
  cmj: 'Salto CMJ',
  sj: 'Salto SJ',
  dj: 'Drop Jump (DJ)',
  hamstring: 'Isquiotibiales',
  calf: 'Gemelos',
  quadriceps: 'Cuádriceps',
  tibialis: 'Tibial'
};

// --- UTILIDADES ---
const normalizeName = (name: string) => {
  if (!name) return "";
  let n = name.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Quitamos plurales básicos para agrupar mejor
  if (n.endsWith('es')) n = n.slice(0, -2);
  else if (n.endsWith('s')) n = n.slice(0, -1);
  return n;
};

const detectSide = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('izq') || lower.includes('left')) return 'left';
  if (lower.includes('der') || lower.includes('right')) return 'right';
  return 'bilateral';
};

const getBaseName = (name: string) => {
  return name.replace(/(\(|\s*-?\s*)(izq|der|left|right|izquierda|derecha)(\)|\s*$)/i, '').trim();
};

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const isTrainer = user?.role === 'trainer';

  const [activeTab, setActiveTab] = useState<'summary' | 'progress'>('summary');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [testHistory, setTestHistory] = useState<any[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<any>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      if (isTrainer) {
        const aths = await api.getAthletes().catch(() => []);
        setAthletes(aths);
        if (aths.length > 0) handleSelectAthlete(aths[0]);
      } else {
        loadAthleteData(user?.id);
      }
    };
    init();
  }, [isTrainer]);

  const loadAthleteData = async (athleteId: string | undefined) => {
    if (!athleteId) return;
    setLoading(true);
    try {
      const [ts, wk] = await Promise.all([
        api.getTests({ athlete_id: athleteId }).catch(() => []),
        api.getWorkouts({ athlete_id: athleteId }).catch(() => [])
      ]);
      setTestHistory(Array.isArray(ts) ? ts.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : []);
      setWorkoutHistory(Array.isArray(wk) ? wk.filter((w: any) => w.completed && w.completion_data) : []);
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

  // --- PROCESAMIENTO DE EJERCICIOS ---
  const getCleanProgression = () => {
    const exercises: Record<string, any> = {};

    workoutHistory.forEach(w => {
      w.completion_data?.exercise_results?.forEach((r: any) => {
        if (r.completed_sets > 0 && r.name) {
          const rawName = r.name.trim();
          const baseName = getBaseName(rawName);
          const normKey = normalizeName(baseName);
          const side = detectSide(rawName);
          const weight = parseFloat(r.logged_weight) || 0;
          const reps = parseInt(r.logged_reps) || 0;

          if (!exercises[normKey]) {
            exercises[normKey] = { name: baseName, history: [], maxW: 0 };
          }

          exercises[normKey].history.push({ date: w.date, weight, reps, side });
          if (weight > exercises[normKey].maxW) exercises[normKey].maxW = weight;
        }
      });
    });

    return Object.values(exercises).sort((a: any, b: any) => a.name.localeCompare(b.name));
  };

  const renderChart = (history: any[]) => {
    const data = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (data.length === 0) return null;

    const weights = data.map(d => d.weight);
    const maxW = Math.max(...weights);
    const minW = Math.min(...weights);
    const range = maxW - minW === 0 ? 10 : maxW - minW;

    return (
      <View style={styles.chartContainer}>
        {/* Eje Y con ancho fijo para que no desaparezca */}
        <View style={[styles.yAxis, { borderRightColor: colors.border }]}>
          <Text style={[styles.axisText, { color: colors.textSecondary }]}>{maxW}kg</Text>
          <Text style={[styles.axisText, { color: colors.textSecondary }]}>{Math.round((maxW+minW)/2)}kg</Text>
          <Text style={[styles.axisText, { color: colors.textSecondary }]}>{minW}kg</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 10, paddingRight: 20 }}>
          <View style={styles.barsArea}>
            {data.map((h, i) => {
              const heightPct = ((h.weight - minW) / range) * 70 + 15; // Mínimo 15% de altura para que se vea
              
              // Color según el lado
              let barColor = colors.primary;
              if (h.side === 'left') barColor = '#3B82F6';
              if (h.side === 'right') barColor = '#EF4444';

              return (
                <View key={i} style={styles.chartCol}>
                  <View style={[styles.chartBar, { height: `${heightPct}%`, backgroundColor: barColor }]} />
                  <Text style={[styles.chartXWeight, { color: colors.textPrimary }]}>{h.weight}</Text>
                  <Text style={[styles.chartXDate, { color: colors.textSecondary }]}>{h.date.split('-').slice(1).join('/')}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderTestCard = (test: any, index: number) => {
    const valL = parseFloat(test.value_left);
    const valR = parseFloat(test.value_right);
    const hasSides = !isNaN(valL) && !isNaN(valR) && (valL !== 0 || valR !== 0);
    
    let asymmetry = 0;
    if (hasSides) {
      const maxVal = Math.max(valL, valR);
      asymmetry = maxVal > 0 ? Math.abs(((valL - valR) / maxVal) * 100) : 0;
    }
    const testName = test.test_name === 'custom' ? test.custom_name : (TEST_TRANSLATIONS[test.test_name] || test.test_name);

    return (
      <View key={index} style={[styles.testCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.testHeader}>
          <View>
            <Text style={[styles.testName, { color: colors.textPrimary }]}>{testName}</Text>
            <Text style={[styles.testDate, { color: colors.textSecondary }]}>{test.date}</Text>
          </View>
          {hasSides && (
            <View style={[styles.asymBadge, { backgroundColor: asymmetry > 15 ? '#EF4444' : colors.primary + '20' }]}>
              <Text style={{ color: asymmetry > 15 ? '#FFF' : colors.primary, fontSize: 10, fontWeight: '800' }}>{asymmetry.toFixed(1)}% ASIM.</Text>
            </View>
          )}
        </View>
        <View style={styles.testValuesRow}>
          {hasSides ? (
            <>
              <View style={styles.valueBox}><Text style={[styles.testValue, { color: '#3B82F6' }]}>{valL}</Text><Text style={styles.sideLabel}>IZQUIERDA ({test.unit})</Text></View>
              <View style={[styles.valueBox, { borderLeftWidth: 1, borderLeftColor: colors.border }]}><Text style={[styles.testValue, { color: '#EF4444' }]}>{valR}</Text><Text style={styles.sideLabel}>DERECHA ({test.unit})</Text></View>
            </>
          ) : (
            <View style={styles.valueBox}><Text style={[styles.testValue, { color: colors.textPrimary }]}>{test.value} <Text style={{fontSize: 14}}>{test.unit}</Text></Text><Text style={styles.sideLabel}>RESULTADO GLOBAL</Text></View>
          )}
        </View>
      </View>
    );
  };

  const cleanProgression = getCleanProgression();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{isTrainer ? (selectedAthlete?.name || 'Cargando...') : 'Mi Rendimiento'}</Text>
        {isTrainer && <TouchableOpacity onPress={() => setShowPicker(true)} style={styles.pickerBtn}><Ionicons name="people" size={24} color={colors.primary} /></TouchableOpacity>}
      </View>

      <View style={[styles.tabsRow, { backgroundColor: colors.surfaceHighlight }]}>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'summary' && { backgroundColor: colors.primary }]} onPress={() => setActiveTab('summary')}><Text style={{ color: activeTab === 'summary' ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>Tests</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'progress' && { backgroundColor: colors.primary }]} onPress={() => setActiveTab('progress')}><Text style={{ color: activeTab === 'progress' ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>Evolución</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        {activeTab === 'summary' ? (
          testHistory.length > 0 ? testHistory.map(renderTestCard) : <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 40 }}>Sin tests registrados.</Text>
        ) : (
          cleanProgression.length > 0 ? (
            cleanProgression.map((item, i) => (
              <View key={i} style={[styles.progCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity onPress={() => setSelectedExercise(selectedExercise === item.name ? null : item.name)} style={styles.progHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.progName, { color: colors.textPrimary }]}>{item.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Récord Máximo: {item.maxW} kg</Text>
                  </View>
                  <Ionicons name={selectedExercise === item.name ? "chevron-up" : "bar-chart-outline"} size={22} color={colors.primary} />
                </TouchableOpacity>
                {selectedExercise === item.name && (
                  <View style={[styles.chartWrapper, { borderTopColor: colors.border }]}>
                    {renderChart(item.history)}
                  </View>
                )}
              </View>
            ))
          ) : <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 40 }}>Completa entrenamientos para ver tu evolución.</Text>
        )}
      </ScrollView>

      {/* MODAL PICKER ATLETA */}
      <Modal visible={showPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 20, textAlign: 'center', color: colors.textPrimary }}>Seleccionar Deportista</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {athletes.map(a => (
                <TouchableOpacity key={a.id} style={styles.athleteItem} onPress={() => handleSelectAthlete(a)}><Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{a.name}</Text></TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setShowPicker(false)} style={styles.closeBtn}><Text style={{ color: '#FFF', fontWeight: '800' }}>CERRAR</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '900' },
  pickerBtn: { padding: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.05)' },
  tabsRow: { flexDirection: 'row', marginHorizontal: 20, borderRadius: 12, padding: 4, marginBottom: 10 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  testCard: { padding: 18, borderRadius: 20, borderWidth: 1, marginBottom: 15 },
  testHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  testName: { fontSize: 17, fontWeight: '800' },
  testDate: { fontSize: 11, opacity: 0.6 },
  asymBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  testValuesRow: { flexDirection: 'row', alignItems: 'center' },
  valueBox: { flex: 1, alignItems: 'center' },
  testValue: { fontSize: 26, fontWeight: '900' },
  sideLabel: { fontSize: 9, fontWeight: '800', marginTop: 4, color: '#888' },
  progCard: { borderRadius: 20, borderWidth: 1, marginBottom: 15, overflow: 'hidden' },
  progHeader: { flexDirection: 'row', padding: 20, alignItems: 'center' },
  progName: { fontSize: 17, fontWeight: '800' },
  chartWrapper: { padding: 20, borderTopWidth: 1 },
  chartContainer: { flexDirection: 'row', height: 160, alignItems: 'flex-end' },
  yAxis: { width: 45, justifyContent: 'space-between', height: '100%', paddingRight: 8, borderRightWidth: 1, paddingBottom: 35 }, // paddingBottom para alinear con las barras
  axisText: { fontSize: 10, fontWeight: '700', textAlign: 'right' },
  barsArea: { flexDirection: 'row', alignItems: 'flex-end', gap: 20, height: '100%' },
  chartCol: { width: 45, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  chartBar: { width: 14, borderRadius: 6, marginBottom: 4 },
  chartXDate: { fontSize: 9, fontWeight: '600', marginTop: 2 },
  chartXWeight: { fontSize: 11, fontWeight: '800', marginBottom: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { padding: 25, borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  athleteItem: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  closeBtn: { marginTop: 20, backgroundColor: '#000', padding: 15, borderRadius: 12, alignItems: 'center' }
});
