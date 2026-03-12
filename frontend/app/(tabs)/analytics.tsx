import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Dimensions, Modal, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
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
  const params = useLocalSearchParams();
  const isTrainer = user?.role === 'trainer';

  const [activeTab, setActiveTab] = useState<'summary' | 'progress' | 'feedback'>(params.tab === 'feedback' ? 'feedback' : 'summary');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [testHistory, setTestHistory] = useState<any[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<any>(null);
  const [showPicker, setShowPicker] = useState(false);
  
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  // --- ESTADOS PARA BÚSQUEDA Y VISTA ---
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // --- ESTADOS PARA UNIFICACIÓN MANUAL ---
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [exercisesToMerge, setExercisesToMerge] = useState<string[]>([]);
  const [mergeTargetName, setMergeTargetName] = useState('');
  const [localAliases, setLocalAliases] = useState<Record<string, string>>({});

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
    setLocalAliases({});
    loadAthleteData(athlete.id);
  };

  const onRefresh = () => { 
    setRefreshing(true); 
    loadAthleteData(isTrainer ? selectedAthlete?.id : user?.id); 
  };

  const handleMerge = () => {
    if (exercisesToMerge.length < 2 || !mergeTargetName.trim()) return;
    const newAliases = { ...localAliases };
    exercisesToMerge.forEach(ex => { newAliases[ex] = mergeTargetName.trim(); });
    setLocalAliases(newAliases);
    setShowMergeModal(false);
    setExercisesToMerge([]);
    setMergeTargetName('');
  };

  const toggleMergeSelection = (name: string) => {
    setExercisesToMerge(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const getCleanProgression = () => {
    const exercises: Record<string, any> = {};
    workoutHistory.forEach(w => {
      w.completion_data?.exercise_results?.forEach((r: any) => {
        if (r.completed_sets > 0 && r.name) {
          let rawName = r.name.trim();
          if (localAliases[rawName]) rawName = localAliases[rawName];
          const normKey = normalizeName(rawName);
          const weight = parseFloat(r.logged_weight) || 0;
          if (!exercises[normKey]) exercises[normKey] = { name: rawName, history: [], maxW: 0 };
          exercises[normKey].history.push({ date: w.date, weight, reps: parseInt(r.logged_reps) || 0 });
          if (weight > exercises[normKey].maxW) exercises[normKey].maxW = weight;
        }
      });
    });
    return Object.values(exercises).sort((a: any, b: any) => a.name.localeCompare(b.name));
  };

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
          <Text style={[styles.axisText, { color: colors.textSecondary }]}>{Number(maxW.toFixed(1))}kg</Text>
          <Text style={[styles.axisText, { color: colors.textSecondary }]}>{Number(((maxW+minW)/2).toFixed(1))}kg</Text>
          <Text style={[styles.axisText, { color: colors.textSecondary }]}>{Number(minW.toFixed(1))}kg</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartScrollArea}>
          {data.map((h, i) => {
            const heightPct = ((h.weight - minW) / range) * 75 + 15;
            return (
              <View key={i} style={styles.chartCol}>
                <View style={styles.chartBarArea}>
                  <View style={[styles.chartBar, { height: `${heightPct}%`, backgroundColor: colors.primary }]} />
                </View>
                <View style={styles.chartLabelsArea}>
                  <Text style={[styles.chartXWeight, { color: colors.textPrimary }]}>{Number(h.weight.toFixed(1))}</Text>
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

  const renderFeedbackTab = () => {
    const feedbacks: any[] = [];
    workoutHistory.forEach(w => {
      w.completion_data?.exercise_results?.forEach((ex: any) => {
        if (ex.coach_note) feedbacks.push({ date: w.date, title: w.title, exercise: ex.name, note: ex.coach_note });
      });
      w.completion_data?.hiit_results?.forEach((block: any) => {
        block.hiit_exercises?.forEach((ex: any) => {
          if (ex.coach_note) feedbacks.push({ date: w.date, title: w.title, exercise: ex.name, note: ex.coach_note });
        });
      });
    });

    if (feedbacks.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <Ionicons name="chatbubbles-outline" size={48} color={colors.border} />
          <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 12, fontSize: 15 }}>Aún no hay correcciones del coach registradas.</Text>
        </View>
      );
    }

    return (
      <View style={{ paddingBottom: 100 }}>
        {feedbacks.reverse().map((fb, i) => (
          <View key={i} style={[styles.feedbackCard, { backgroundColor: colors.surface, borderColor: (colors.warning || '#F59E0B') + '40' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
              <Ionicons name="chatbubble-ellipses" size={20} color={colors.warning || '#F59E0B'} />
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{fb.date} • {fb.title}</Text>
            </View>
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 8 }}>{fb.exercise}</Text>
            <View style={{ backgroundColor: (colors.warning || '#F59E0B') + '15', padding: 12, borderRadius: 10 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontStyle: 'italic', lineHeight: 20 }}>"{fb.note}"</Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const cleanProgression = getCleanProgression();
  const rawExerciseNames = getUniqueRawExerciseNames();
  
  // Filtrar progresión basado en la búsqueda
  const filteredProgression = cleanProgression.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
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
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'feedback' && { backgroundColor: colors.warning || '#F59E0B' }]} onPress={() => setActiveTab('feedback')}><Text style={{ color: activeTab === 'feedback' ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>Feedback</Text></TouchableOpacity>
      </View>

      {activeTab === 'progress' && cleanProgression.length > 0 && (
        <View style={{ paddingHorizontal: 20, marginBottom: 15 }}>
          {/* BOTÓN UNIFICAR */}
          <TouchableOpacity style={[styles.mergeBtn, { borderColor: colors.primary, marginBottom: 15 }]} onPress={() => setShowMergeModal(true)}>
            <Ionicons name="git-merge-outline" size={18} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '700', marginLeft: 8 }}>Unificar nombres de ejercicios</Text>
          </TouchableOpacity>

          {/* BARRA DE BÚSQUEDA Y CAMBIO DE VISTA */}
          <View style={styles.controlsRow}>
            <View style={[styles.searchBox, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
              <Ionicons name="search" size={20} color={colors.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder="Buscar ejercicio..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            
            <View style={[styles.viewToggle, { backgroundColor: colors.surfaceHighlight }]}>
              <TouchableOpacity onPress={() => setViewMode('list')} style={[styles.toggleBtn, viewMode === 'list' && { backgroundColor: colors.primary }]}>
                <Ionicons name="list" size={20} color={viewMode === 'list' ? '#FFF' : colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setViewMode('grid')} style={[styles.toggleBtn, viewMode === 'grid' && { backgroundColor: colors.primary }]}>
                <Ionicons name="grid" size={20} color={viewMode === 'grid' ? '#FFF' : colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 100 }}>
        {loading && !refreshing ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }}/>
        ) : activeTab === 'summary' ? (
          testHistory.length > 0 ? (
            testHistory.map(renderTestCard)
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="clipboard-outline" size={48} color={colors.border} />
              <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 12, fontSize: 15 }}>Sin tests registrados.</Text>
            </View>
          )
        ) : activeTab === 'progress' ? (
          filteredProgression.length > 0 ? (
            <View style={viewMode === 'grid' ? styles.gridContainer : styles.listContainer}>
              {filteredProgression.map((item, i) => {
                const isSelected = selectedExercise === item.name;
                const isGridFormat = viewMode === 'grid' && !isSelected;

                return (
                  <View key={i} style={[
                    styles.progCard, 
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    isGridFormat ? styles.gridCard : styles.listCard
                  ]}>
                    <TouchableOpacity 
                      onPress={() => setSelectedExercise(isSelected ? null : item.name)} 
                      style={isGridFormat ? styles.gridHeader : styles.progHeader}
                    >
                      <View style={{ flex: 1, alignItems: isGridFormat ? 'center' : 'flex-start' }}>
                        <Text style={[
                          styles.progName, 
                          { color: colors.textPrimary, textAlign: isGridFormat ? 'center' : 'left' },
                          isGridFormat && { fontSize: 14 }
                        ]}>
                          {item.name}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: isGridFormat ? 'center' : 'left' }}>
                          {isGridFormat ? 'Récord:\n' : 'Récord Histórico: '}
                          <Text style={{fontWeight:'700', color: colors.primary}}>{Number(item.maxW.toFixed(1))} kg</Text>
                        </Text>
                      </View>
                      {!isGridFormat && (
                        <Ionicons name={isSelected ? "chevron-up" : "bar-chart-outline"} size={22} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                    
                    {isSelected && (
                      <View style={[styles.chartWrapper, { borderTopColor: colors.border }]}>
                        {renderChart(item.history)}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="bar-chart-outline" size={48} color={colors.border} />
              <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 12, fontSize: 15 }}>No hay ejercicios que coincidan con tu búsqueda.</Text>
            </View>
          )
        ) : (
          renderFeedbackTab()
        )}
      </ScrollView>

      {/* MODAL PARA UNIFICAR EJERCICIOS */}
      <Modal visible={showMergeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface, maxHeight: '85%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary }}>Unificar Ejercicios</Text>
                <TouchableOpacity onPress={() => { setShowMergeModal(false); setExercisesToMerge([]); setMergeTargetName(''); }}>
                  <Ionicons name="close" size={24} color={colors.textPrimary}/>
                </TouchableOpacity>
              </View>
              
              <Text style={{ color: colors.textSecondary, marginBottom: 15, fontSize: 13 }}>
                Selecciona los ejercicios que son el mismo pero se escribieron diferente y asígnales un nombre común.
              </Text>
              
              <ScrollView style={{ flexShrink: 1, marginBottom: 15 }}>
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
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* MODAL PICKER ATLETA */}
      <Modal visible={showPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 20, textAlign: 'center', color: colors.textPrimary }}>Seleccionar Deportista</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {athletes.map(a => (
                <TouchableOpacity key={a.id} style={[styles.athleteItem, { borderBottomColor: colors.border }]} onPress={() => handleSelectAthlete(a)}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 16 }}>{a.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setShowPicker(false)} style={[styles.closeBtn, { backgroundColor: colors.primary }]}>
              <Text style={{ color: '#FFF', fontWeight: '800' }}>CERRAR</Text>
            </TouchableOpacity>
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
  
  controlsRow: { flexDirection: 'row', gap: 10 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, height: 46 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15 },
  viewToggle: { flexDirection: 'row', borderRadius: 12, padding: 4, height: 46 },
  toggleBtn: { width: 38, height: 38, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },

  listContainer: { flexDirection: 'column' },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  listCard: { width: '100%' },
  gridCard: { width: '48%', aspectRatio: 1, justifyContent: 'center', padding: 5 }, 
  
  progCard: { borderRadius: 20, borderWidth: 1, marginBottom: 15, overflow: 'hidden' },
  progHeader: { flexDirection: 'row', padding: 20, alignItems: 'center' },
  gridHeader: { alignItems: 'center', justifyContent: 'center', flex: 1, padding: 10, gap: 5 },
  progName: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  
  chartWrapper: { padding: 20, borderTopWidth: 1, height: 220 },
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
  
  mergeItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  mergeInput: { padding: 14, borderRadius: 10, borderWidth: 1, fontSize: 16, marginBottom: 15 },
  confirmMergeBtn: { padding: 16, borderRadius: 12 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { padding: 25, borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  athleteItem: { paddingVertical: 18, borderBottomWidth: 1 },
  closeBtn: { marginTop: 20, padding: 15, borderRadius: 12, alignItems: 'center' },
  
  feedbackCard: { padding: 20, borderRadius: 20, borderWidth: 1, marginBottom: 15 },
  
  emptyCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 20 }
});
