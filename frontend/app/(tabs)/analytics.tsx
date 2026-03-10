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

// --- DICCIONARIO DE RESPALDO POR SI VIENEN DATOS ANTIGUOS ---
const OLD_TEST_INFO: Record<string, string> = {
  squat_rm: 'FUERZA MÁXIMA', bench_rm: 'FUERZA MÁXIMA', deadlift_rm: 'FUERZA MÁXIMA',
  cmj: 'PLIOMETRÍA', sj: 'PLIOMETRÍA', dj: 'PLIOMETRÍA',
  hamstring: 'FUERZA', calf: 'FUERZA', quadriceps: 'FUERZA', tibialis: 'FUERZA'
};

const CATEGORY_COLORS: Record<string, string> = {
  'FUERZA MÁXIMA': '#EF4444', // Rojo
  'PLIOMETRÍA': '#F59E0B',    // Naranja
  'FUERZA': '#10B981',        // Verde
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

  const getLatestTests = () => {
    if (!testHistory || testHistory.length === 0) return [];
    const sortedTests = [...testHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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

  const cleanProgression = getCleanProgression();
  const latestTestsToDisplay = getLatestTests();

  if (loading && !summary && testHistory.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

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
              <TouchableOpacity onPress={() => setShowPicker(true)} style={[styles.iconBtn, { backgroundColor: colors.surfaceHighlight }]}>
                <Ionicons name="people" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onRefresh} style={[styles.iconBtn, { backgroundColor: colors.surfaceHighlight }]}>
              {refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh" size={20} color={colors.primary} />}
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.tabsRow, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'summary' && { backgroundColor: colors.primary }]} onPress={() => setActiveTab('summary')}>
            <Text style={[styles.tabText, { color: activeTab === 'summary' ? '#FFF' : colors.textSecondary }]}>Resumen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'progress' && { backgroundColor: colors.primary }]} onPress={() => setActiveTab('progress')}>
            <Text style={[styles.tabText, { color: activeTab === 'progress' ? '#FFF' : colors.textSecondary }]}>Evolución ({cleanProgression.length})</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'summary' ? (
          <View style={styles.tabContent}>
            
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>ESTADÍSTICAS GLOBALES</Text>
            <View style={styles.statsGrid}>
              <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.statIconBox, { backgroundColor: colors.primary + '15' }]}><Ionicons name="fitness" size={24} color={colors.primary} /></View>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{summary?.total_workouts || 0}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Entrenos</Text>
              </View>

              <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.statIconBox, { backgroundColor: colors.success + '15' }]}><Ionicons name="flash" size={24} color={colors.success} /></View>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{summary?.total_completed_workouts || 0}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Completados</Text>
              </View>

              <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.statIconBox, { backgroundColor: colors.warning + '15' }]}><Ionicons name="barbell" size={24} color={colors.warning} /></View>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{summary?.total_completed_sets || 0}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Series</Text>
              </View>
            </View>

            {/* SECCIÓN DE TESTS ACTUALIZADA: NOMBRE PERSONALIZADO Y 3 CATEGORÍAS */}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 10 }]}>ÚLTIMOS TESTS FÍSICOS</Text>
            {latestTestsToDisplay.length > 0 ? (
              <View style={styles.testsList}>
                {latestTestsToDisplay.map((t: any, i: number) => {
                  
                  // 1. Respetamos el nombre personalizado que haya puesto el entrenador
                  const customName = t.name || t.test_name || t.type || 'Test Físico';
                  
                  // 2. Extraemos la categoría (puede venir en category, type o test_type)
                  const rawCategory = (t.category || t.type || t.test_type || '').toUpperCase();
                  let finalCategory = 'FUERZA'; // Por defecto
                  
                  if (rawCategory.includes('MAX') || rawCategory.includes('MÁX') || rawCategory.includes('RM')) {
                    finalCategory = 'FUERZA MÁXIMA';
                  } else if (rawCategory.includes('PLIO') || rawCategory.includes('JUMP') || rawCategory.includes('SALTO') || rawCategory.includes('CMJ')) {
                    finalCategory = 'PLIOMETRÍA';
                  } else if (rawCategory.includes('FUERZA') || rawCategory.includes('STRENGTH')) {
                    finalCategory = 'FUERZA';
                  } else {
                    // Si el backend envía algo muy raro, miramos el diccionario viejo por si coincide
                    const dictMatch = OLD_TEST_INFO[rawCategory.toLowerCase()];
                    if (dictMatch) finalCategory = dictMatch;
                  }

                  const badgeColor = CATEGORY_COLORS[finalCategory] || colors.primary;
                  
                  return (
                    <View key={i} style={[styles.testCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={styles.testHeader}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <Ionicons name="speedometer" size={16} color={badgeColor} />
                            <Text style={[styles.testName, { color: colors.textPrimary }]}>{customName}</Text>
                          </View>
                          <Text style={[styles.testDate, { color: colors.textSecondary }]}>{t.date}</Text>
                        </View>
                        {/* INSIGNIA DE CATEGORÍA FIJA */}
                        <View style={{ backgroundColor: badgeColor + '15', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' }}>
                          <Text style={{ color: badgeColor, fontSize: 10, fontWeight: '900' }}>{finalCategory}</Text>
                        </View>
                      </View>
                      
                      <View style={[styles.testResultRow, { marginTop: 8 }]}>
                        <Text style={[styles.testValue, { color: colors.textPrimary }]}>
                          {t.value} <Text style={{ fontSize: 14, color: colors.textSecondary }}>{t.unit}</Text>
                        </Text>
                        {t.notes && <Text style={[styles.testNotes, { color: colors.textSecondary }]} numberOfLines={2}>{t.notes}</Text>}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={[styles.emptyBox, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
                <Ionicons name="clipboard-outline" size={32} color={colors.textSecondary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No hay tests físicos registrados recientemente.</Text>
              </View>
            )}

            {summary?.avg_rpe && (
              <View style={[styles.rpeSummaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.rpeCircle, { backgroundColor: summary.avg_rpe > 7 ? colors.error : summary.avg_rpe > 4 ? colors.warning : colors.success }]}><Text style={{ color: '#FFF', fontSize: 24, fontWeight: '800' }}>{parseFloat(summary.avg_rpe).toFixed(1)}</Text></View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={[styles.rpeSummaryTitle, { color: colors.textPrimary }]}>RPE Medio Reciente</Text>
                  <Text style={[styles.rpeSummarySub, { color: colors.textSecondary }]}>Nivel de esfuerzo percibido en los últimos entrenamientos.</Text>
                </View>
              </View>
            )}

          </View>
        ) : (
          <View style={styles.tabContent}>
            {cleanProgression.length > 0 ? (
               <View style={styles.progressionList}>
                 {cleanProgression.map(renderProgressionCard)}
               </View>
            ) : (
              <View style={[styles.emptyBox, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
                <Ionicons name="trending-up" size={32} color={colors.textSecondary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No hay datos de evolución suficientes. Completa entrenamientos registrando tus kilos y repeticiones.</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* MODAL PARA SELECCIONAR ATLETA (SOLO ENTRENADORES) */}
      <Modal visible={showPicker} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Seleccionar Deportista</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {athletes.map(a => (
                <TouchableOpacity key={a.id} style={[styles.modalItem, selectedAthlete?.id === a.id && { backgroundColor: colors.primary + '15' }]} onPress={() => handleSelectAthlete(a)}>
                  <Ionicons name="person-circle" size={24} color={selectedAthlete?.id === a.id ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.modalItemText, { color: selectedAthlete?.id === a.id ? colors.primary : colors.textPrimary, fontWeight: selectedAthlete?.id === a.id ? '700' : '500' }]}>{a.name}</Text>
                  {selectedAthlete?.id === a.id && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerSubtitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  headerTitle: { fontSize: 24, fontWeight: '800' },
  headerActions: { flexDirection: 'row', gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  tabsRow: { flexDirection: 'row', borderRadius: 12, padding: 4, borderWidth: 1, marginBottom: 24 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabText: { fontSize: 14, fontWeight: '700' },
  tabContent: { gap: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 4, marginBottom: 4 },
  statsGrid: { flexDirection: 'row', gap: 12 },
  statBox: { flex: 1, padding: 16, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  statIconBox: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  statValue: { fontSize: 24, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  
  testsList: { gap: 10 },
  testCard: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 8 },
  testHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  testName: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  testDate: { fontSize: 12, fontWeight: '600', marginLeft: 24 },
  testResultRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  testValue: { fontSize: 24, fontWeight: '900' },
  testNotes: { flex: 1, fontSize: 12, fontStyle: 'italic', lineHeight: 16 },
  
  rpeSummaryCard: { flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 16, borderWidth: 1, marginTop: 10 },
  rpeCircle: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  rpeSummaryTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  rpeSummarySub: { fontSize: 12, lineHeight: 18 },
  
  progressionList: { gap: 12 },
  progCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  progHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  progName: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  pbRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pbText: { fontSize: 12, fontWeight: '600' },
  
  chartWrapper: { padding: 16, paddingTop: 20, borderTopWidth: 1 },
  chartContainer: { flexDirection: 'row', height: 160 },
  yAxis: { justifyContent: 'space-between', paddingRight: 10, borderRightWidth: 1, width: 40 },
  axisText: { fontSize: 10, fontWeight: '600', textAlign: 'right' },
  chartScroll: { paddingLeft: 10, paddingRight: 20, gap: 15 },
  chartCol: { width: 60, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  chartBarArea: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 5 },
  chartLine: { width: 6, borderRadius: 3, position: 'absolute', bottom: 5 },
  chartPoint: { width: 14, height: 14, borderRadius: 7, position: 'absolute', transform: [{ translateY: 7 }] },
  xLabels: { height: 35, alignItems: 'center', justifyContent: 'center', paddingTop: 5 },
  chartXDate: { fontSize: 10, fontWeight: '700', marginBottom: 2 },
  chartXData: { fontSize: 11, fontWeight: '800' },
  
  emptyBox: { padding: 30, borderRadius: 16, borderWidth: 1, alignItems: 'center', borderStyle: 'dashed', gap: 12, marginTop: 10 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, gap: 12, marginBottom: 8 },
  modalItemText: { flex: 1, fontSize: 16 }
});
