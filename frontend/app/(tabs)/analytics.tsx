import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Dimensions, Modal, TextInput
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

const CATEGORY_COLORS: Record<string, string> = {
  'FUERZA MÁXIMA': '#EF4444', 
  'PLIOMETRÍA': '#F59E0B',    
  'FUERZA': '#10B981',        
};

// Limpieza básica de nombres
const normalizeName = (name: string) => {
  if (!name) return "";
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
  const [testHistory, setTestHistory] = useState<any[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<any>(null);
  const [showPicker, setShowPicker] = useState(false);
  
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  // --- ESTADOS PARA UNIFICACIÓN MANUAL ---
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [exercisesToMerge, setExercisesToMerge] = useState<string[]>([]);
  const [mergeTargetName, setMergeTargetName] = useState('');
  const [localAliases, setLocalAliases] = useState<Record<string, string>>({}); // Guarda qué nombre equivale a qué

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
      const [sum, ts, wk] = await Promise.all([
        api.getSummary(athleteId).catch(() => null),
        api.getTests({ athlete_id: athleteId }).catch(() => []),
        api.getWorkouts({ athlete_id: athleteId }).catch(() => [])
      ]);
      setSummary(sum);
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
    setLocalAliases({}); // Reseteamos alias al cambiar de atleta
    loadAthleteData(athlete.id);
  };

  const onRefresh = () => { 
    setRefreshing(true); 
    loadAthleteData(isTrainer ? selectedAthlete?.id : user?.id); 
  };

  // Lógica de unificación
  const handleMerge = () => {
    if (exercisesToMerge.length < 2 || !mergeTargetName.trim()) return;
    const newAliases = { ...localAliases };
    exercisesToMerge.forEach(ex => {
      newAliases[ex] = mergeTargetName.trim();
    });
    setLocalAliases(newAliases);
    setShowMergeModal(false);
    setExercisesToMerge([]);
    setMergeTargetName('');
  };

  const toggleMergeSelection = (name: string) => {
    setExercisesToMerge(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  // Procesamos la evolución aplicando los alias locales
  const getCleanProgression = () => {
    const exercises: Record<string, any> = {};

    workoutHistory.forEach(w => {
      w.completion_data?.exercise_results?.forEach((r: any) => {
        if (r.completed_sets > 0 && r.name) {
          let rawName = r.name.trim();
          // Aplicamos el alias manual si existe
          if (localAliases[rawName]) {
            rawName = localAliases[rawName];
          }

          const normKey = normalizeName(rawName);
          const weight = parseFloat(r.logged_weight) || 0;
          const reps = parseInt(r.logged_reps) || 0;

          if (!exercises[normKey]) {
            exercises[normKey] = { name: rawName, history: [], maxW: 0 };
          }
          exercises[normKey].history.push({ date: w.date, weight, reps });
          if (weight > exercises[normKey].maxW) exercises[normKey].maxW = weight;
        }
      });
    });

    return Object.values(exercises).sort((a: any, b: any) => a.name.localeCompare(b.name));
  };

  // Extraemos solo los nombres únicos para el modal de unificar
  const getUniqueRawExerciseNames = () => {
    const names = new Set<string>();
    workoutHistory.forEach(w => {
      w.completion_data?.exercise_results?.forEach((r: any) => {
        if (r.completed_sets > 0 && r.name) names.add(r.name.trim());
      });
    });
    return Array.from(names).sort();
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
        <View style={[styles.yAxis, { borderRightColor: colors.border }]}>
          <Text style={[styles.axisText, { color: colors.textSecondary }]}>{maxW}kg</Text>
          <Text style={[styles.axisText, { color: colors.textSecondary }]}>{Math.round((maxW+minW)/2)}kg</Text>
          <Text style={[styles.axisText, { color: colors.textSecondary }]}>{minW}kg</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartScrollArea}>
          {data.map((h, i) => {
            const heightPct = ((h.weight - minW) / range) * 75 + 15; // Altura mínima garantizada
            return (
              <View key={i} style={styles.chartCol}>
                <View style={styles.chartBarArea}>
                  <View style={[styles.chartBar, { height: `${heightPct}%`, backgroundColor: colors.primary }]} />
                </View>
                <View style={styles.chartLabelsArea}>
                  <Text style={[styles.chartXWeight, { color: colors.textPrimary }]}>{h.weight}</Text>
                  <Text style={[styles.chartXDate, { color: colors.textSecondary }]}>{h.date.split('-').slice(1).join('/')}</Text>
                </View>
              </View>
            );
          })}
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
              <View style={styles.valueBox}><Text style={[styles.testValue, { color: '#3B82F6' }]}>{valL}</Text><Text style={styles.sideLabel}>IZQ ({test.unit})</Text></View>
              <View style={[styles.valueBox, { borderLeftWidth: 1, borderLeftColor: colors.border }]}><Text style={[styles.testValue, { color: '#EF4444' }]}>{valR}</Text><Text style={styles.sideLabel}>DER ({test.unit})</Text></View>
            </>
          ) : (
            <View style={styles.valueBox}><Text style={[styles.testValue, { color: colors.textPrimary }]}>{test.value} <Text style={{fontSize: 14}}>{test.unit}</Text></Text><Text style={styles.sideLabel}>GLOBAL</Text></View>
          )}
        </View>
      </View>
    );
  };

  const cleanProgression = getCleanProgression();
  const rawExerciseNames = getUniqueRawExerciseNames();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* HEADER CON BOTÓN ACTUALIZAR */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{isTrainer ? (selectedAthlete?.name || 'Cargando...') : 'Rendimiento'}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={onRefresh} disabled={refreshing} style={[styles.iconBtn, { backgroundColor: colors.surfaceHighlight }]}>
            {refreshing ? <ActivityIndicator size="small" color={colors.primary}/> : <Ionicons name="refresh" size={20} color={colors.primary} />}
          </TouchableOpacity>
          {isTrainer && (
            <TouchableOpacity onPress={() => setShowPicker(true)} style={[styles.iconBtn, { backgroundColor: colors.surfaceHighlight }]}>
              <Ionicons name="people" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={[styles.tabsRow, { backgroundColor: colors.surfaceHighlight }]}>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'summary' && { backgroundColor: colors.primary }]} onPress={() => setActiveTab('summary')}><Text style={{ color: activeTab === 'summary' ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>Tests</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'progress' && { backgroundColor: colors.primary }]} onPress={() => setActiveTab('progress')}><Text style={{ color: activeTab === 'progress' ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>Evolución</Text></TouchableOpacity>
      </View>

      {activeTab === 'progress' && cleanProgression.length > 0 && (
        <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
          <TouchableOpacity style={[styles.mergeBtn, { borderColor: colors.primary }]} onPress={() => setShowMergeModal(true)}>
            <Ionicons name="git-merge-outline" size={18} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '700', marginLeft: 8 }}>Unificar nombres de ejercicios</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        {loading && !refreshing ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }}/>
        ) : activeTab === 'summary' ? (
          testHistory.length > 0 ? testHistory.map(renderTestCard) : <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 40 }}>Sin tests registrados.</Text>
        ) : (
          cleanProgression.length > 0 ? (
            cleanProgression.map((item, i) => (
              <View key={i} style={[styles.progCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity onPress={() => setSelectedExercise(selectedExercise === item.name ? null : item.name)} style={styles.progHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.progName, { color: colors.textPrimary }]}>{item.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Récord Histórico: <Text style={{fontWeight:'700', color: colors.primary}}>{item.maxW} kg</Text></Text>
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

      {/* MODAL PARA UNIFICAR EJERCICIOS */}
      <Modal visible={showMergeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, height: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary }}>Unificar Ejercicios</Text>
              <TouchableOpacity onPress={() => { setShowMergeModal(false); setExercisesToMerge([]); setMergeTargetName(''); }}><Ionicons name="close" size={24} color={colors.textPrimary}/></TouchableOpacity>
            </View>
            
            <Text style={{ color: colors.textSecondary, marginBottom: 15, fontSize: 13 }}>Selecciona los ejercicios que son el mismo pero se escribieron diferente y asígnales un nombre común.</Text>
            
            <ScrollView style={{ flex: 1, marginBottom: 15 }}>
              {rawExerciseNames.map(name => (
                <TouchableOpacity 
                  key={name} 
                  style={[styles.mergeItem, { borderColor: colors.border }, exercisesToMerge.includes(name) && { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
                  onPress={() => toggleMergeSelection(name)}
                >
                  <Ionicons name={exercisesToMerge.includes(name) ? "checkbox" : "square-outline"} size={20} color={exercisesToMerge.includes(name) ? colors.primary : colors.textSecondary} />
                  <Text style={{ color: colors.textPrimary, marginLeft: 10, fontWeight: '500' }}>{name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {exercisesToMerge.length > 1 && (
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 15 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '700', marginBottom: 8 }}>¿Cómo quieres que se llamen?</Text>
                <TextInput 
                  style={[styles.mergeInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="Ej: Sentadilla Búlgara"
                  placeholderTextColor={colors.textSecondary}
                  value={mergeTargetName}
                  onChangeText={setMergeTargetName}
                />
                <TouchableOpacity 
                  style={[styles.confirmMergeBtn, { backgroundColor: mergeTargetName.trim() ? colors.primary : colors.border }]}
                  disabled={!mergeTargetName.trim()}
                  onPress={handleMerge}
                >
                  <Text style={{ color: '#FFF', fontWeight: '800', textAlign: 'center' }}>JUNTAR DATOS</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

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
  headerActions: { flexDirection: 'row', gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  tabsRow: { flexDirection: 'row', marginHorizontal: 20, borderRadius: 12, padding: 4, marginBottom: 15 },
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
  
  mergeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' },
  mergeItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  mergeInput: { padding: 14, borderRadius: 10, borderWidth: 1, fontSize: 16, marginBottom: 15 },
  confirmMergeBtn: { padding: 16, borderRadius: 12 },
  
  progCard: { borderRadius: 20, borderWidth: 1, marginBottom: 15, overflow: 'hidden' },
  progHeader: { flexDirection: 'row', padding: 20, alignItems: 'center' },
  progName: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  
  chartWrapper: { padding: 20, borderTopWidth: 1, height: 220 }, // Altura fija para el contenedor general del gráfico
  chartContainer: { flexDirection: 'row', height: '100%' },
  yAxis: { width: 45, justifyContent: 'space-between', paddingRight: 8, borderRightWidth: 1, paddingBottom: 25 }, 
  axisText: { fontSize: 10, fontWeight: '700', textAlign: 'right' },
  chartScrollArea: { paddingLeft: 10, paddingRight: 20, height: '100%', alignItems: 'flex-end', flexDirection: 'row', gap: 15 },
  chartCol: { width: 40, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  chartBarArea: { flex: 1, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  chartBar: { width: 14, borderRadius: 6, marginBottom: 4 },
  chartLabelsArea: { height: 25, alignItems: 'center', justifyContent: 'center' },
  chartXDate: { fontSize: 9, fontWeight: '600' },
  chartXWeight: { fontSize: 11, fontWeight: '800' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { padding: 25, borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  athleteItem: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  closeBtn: { marginTop: 20, backgroundColor: '#000', padding: 15, borderRadius: 12, alignItems: 'center' }
});
