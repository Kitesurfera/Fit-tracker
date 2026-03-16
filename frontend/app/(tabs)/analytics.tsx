import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Dimensions, Modal, TextInput, KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
import { useAuth } from '../../src/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Body from 'react-native-body-highlighter';

const { width } = Dimensions.get('window');
const GRID_CARD_SIZE = (width - 40) * 0.48;

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

const DEFAULT_MUSCLE_MAP: Record<string, string[]> = {
  'Pecho': ['press banca', 'flexiones', 'pecho', 'aperturas', 'push up'],
  'Espalda': ['dominadas', 'remo', 'pull up', 'espalda', 'lat pulldown'],
  'Cuádriceps': ['sentadilla', 'squat', 'prensa', 'extensiones', 'bulgara', 'lunge', 'zancada'],
  'Isquiotibiales': ['peso muerto', 'deadlift', 'curl femoral', 'isquios', 'buenos dias'],
  'Glúteo': ['hip thrust', 'puente', 'gluteo', 'patada'],
  'Hombro': ['press militar', 'hombro', 'elevaciones', 'deltoides', 'face pull'],
  'Bíceps': ['curl', 'biceps'],
  'Tríceps': ['triceps', 'extensiones triceps', 'fondos', 'dip'],
  'Core': ['plancha', 'crunch', 'core', 'abs', 'abdominales', 'leg raise', 'rueda'],
  'Gemelos': ['gemelos', 'gemelo', 'calf', 'calves', 'soleo', 'elevacion talones'],
  'Antebrazos': ['antebrazos', 'antebrazo', 'forearm', 'curl muñeca', 'paseo granjero', 'agarre'],
  'Aductores': ['aductores', 'aductor', 'adductor', 'copenhague', 'copenhagen', 'interior pierna'],
  'Abductores': ['abductores', 'abductor', 'aperturas pierna', 'banda lateral', 'exterior pierna'],
  'Tibial': ['tibial', 'tibiales', 'tibialis']
};

const ALL_MUSCLES = Object.keys(DEFAULT_MUSCLE_MAP);

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

  const [activeTab, setActiveTab] = useState<'summary' | 'progress' | 'body' | 'feedback'>(params.tab === 'feedback' ? 'feedback' : 'summary');
  const [customExerciseMuscles, setCustomExerciseMuscles] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [testHistory, setTestHistory] = useState<any[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<any>(null);
  const [showPicker, setShowPicker] = useState(false);
  
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const [showMergeModal, setShowMergeModal] = useState(false);
  const [exercisesToMerge, setExercisesToMerge] = useState<string[]>([]);
  const [mergeTargetName, setMergeTargetName] = useState('');
  const [localAliases, setLocalAliases] = useState<Record<string, string>>({});

  const [showTestChartModal, setShowTestChartModal] = useState(false);
  const [selectedTestName, setSelectedTestName] = useState<string>('');
  const [selectedTestHistory, setSelectedTestHistory] = useState<any[]>([]);

  const [bodyTimeFilter, setBodyTimeFilter] = useState<1 | 7 | 14 | 30>(14);

  const [showDictModal, setShowDictModal] = useState(false);
  const [dictTargetExercise, setDictTargetExercise] = useState<string>('');
  const [dictSelectedMuscles, setDictSelectedMuscles] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('custom_exercise_muscles').then(res => {
        if (res) setCustomExerciseMuscles(JSON.parse(res));
      });
    }, [])
  );

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

  const getMusclesForExercise = (exerciseName: string) => {
    const normName = normalizeName(exerciseName);
    if (customExerciseMuscles[normName]) return customExerciseMuscles[normName];
    const musclesFound: string[] = [];
    for (const [muscle, keywords] of Object.entries(DEFAULT_MUSCLE_MAP)) {
      if (keywords.some(k => normName.includes(k))) musclesFound.push(muscle);
    }
    return musclesFound;
  };

  const openDictModal = (exerciseName: string) => {
    setDictTargetExercise(exerciseName);
    setDictSelectedMuscles(getMusclesForExercise(exerciseName));
    setShowDictModal(true);
  };

  const toggleDictMuscle = (muscle: string) => {
    setDictSelectedMuscles(prev => prev.includes(muscle) ? prev.filter(m => m !== muscle) : [...prev, muscle]);
  };

  const saveDictMuscles = async () => {
    const normKey = normalizeName(dictTargetExercise);
    const updatedMap = { ...customExerciseMuscles, [normKey]: dictSelectedMuscles };
    setCustomExerciseMuscles(updatedMap);
    await AsyncStorage.setItem('custom_exercise_muscles', JSON.stringify(updatedMap));
    setShowDictModal(false);
  };

  const getCleanProgression = () => {
    const exercises: Record<string, any> = {};
    workoutHistory.forEach(w => {
      w.completion_data?.exercise_results?.forEach((r: any) => {
        if (r.completed_sets > 0 && r.name) {
          let rawName = r.name.trim();
          if (localAliases[rawName]) rawName = localAliases[rawName];
          const normKey = normalizeName(rawName);
          const weight = parseFloat(String(r.logged_weight || '0').replace(',', '.')) || 0;
          if (!exercises[normKey]) exercises[normKey] = { name: rawName, history: [], maxW: 0 };
          if (weight > exercises[normKey].maxW) exercises[normKey].maxW = weight;
          const existingDay = exercises[normKey].history.find((h: any) => h.date === w.date);
          if (existingDay) {
            if (weight > existingDay.weight) { existingDay.weight = weight; }
          } else {
            exercises[normKey].history.push({ date: w.date, weight });
          }
        }
      });
    });
    return Object.values(exercises).sort((a: any, b: any) => a.name.localeCompare(b.name));
  };

  const getMuscleHeat = () => {
    const heat: Record<string, number> = {
      'Pecho': 0, 'Espalda': 0, 'Cuádriceps': 0, 'Isquiotibiales': 0,
      'Glúteo': 0, 'Hombro': 0, 'Bíceps': 0, 'Tríceps': 0, 'Core': 0,
      'Gemelos': 0, 'Antebrazos': 0, 'Aductores': 0, 'Abductores': 0, 'Tibial': 0
    };
    const limitDate = new Date();
    if (bodyTimeFilter === 1) limitDate.setHours(0, 0, 0, 0);
    else limitDate.setDate(limitDate.getDate() - bodyTimeFilter);

    workoutHistory.forEach(w => {
      if (new Date(w.date) >= limitDate) {
        w.completion_data?.exercise_results?.forEach((r: any) => {
          if (r.completed_sets > 0 && r.name) {
            const sets = parseInt(r.completed_sets) || 1;
            getMusclesForExercise(r.name).forEach(m => { if (heat[m] !== undefined) heat[m] += sets; });
          }
        });
      }
    });
    return heat;
  };

  // --- FUNCIONES DE RENDERIZADO ---

  const renderTestCard = (test: any, index: number) => {
    const valL = parseFloat(test.value_left);
    const valR = parseFloat(test.value_right);
    const hasSides = !isNaN(valL) && !isNaN(valR) && (valL !== 0 || valR !== 0);
    const testName = test.test_name === 'custom' ? test.custom_name : (TEST_TRANSLATIONS[test.test_name] || test.test_name);

    return (
      <View key={index} style={[styles.testCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View>
            <Text style={[styles.testName, { color: colors.textPrimary }]}>{testName}</Text>
            <Text style={{ fontSize: 11, color: colors.textSecondary }}>Récord: {test.date}</Text>
          </View>
          <Ionicons name="trophy-outline" size={20} color={colors.primary} />
        </View>
        <View style={{ flexDirection: 'row', marginTop: 15 }}>
          {hasSides ? (
            <>
              <View style={{ flex: 1, alignItems: 'center' }}><Text style={[styles.testValue, { color: '#3B82F6' }]}>{valL}</Text><Text style={styles.sideLabel}>IZQ ({test.unit})</Text></View>
              <View style={{ flex: 1, alignItems: 'center', borderLeftWidth: 1, borderLeftColor: colors.border }}><Text style={[styles.testValue, { color: '#EF4444' }]}>{valR}</Text><Text style={styles.sideLabel}>DER ({test.unit})</Text></View>
            </>
          ) : (
            <View style={{ flex: 1 }}><Text style={[styles.testValue, { color: colors.textPrimary }]}>{test.value} {test.unit}</Text></View>
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
    });

    if (feedbacks.length === 0) return <View style={styles.emptyCard}><Text style={{color: colors.textSecondary}}>No hay correcciones del coach.</Text></View>;

    return (
      <View>
        {feedbacks.reverse().map((fb, i) => (
          <View key={i} style={[styles.feedbackCard, { backgroundColor: colors.surface, borderColor: (colors.warning || '#F59E0B') + '40' }]}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{fb.date} • {fb.title}</Text>
            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginVertical: 5 }}>{fb.exercise}</Text>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontStyle: 'italic' }}>"{fb.note}"</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderBodyMap = () => {
    const heat = getMuscleHeat();
    const totalSets = Object.values(heat).reduce((sum, val) => sum + val, 0);
    const allMusclesSorted = Object.entries(heat).sort((a, b) => b[1] - a[1]);

    const bodyData: { slug: string; intensity: number }[] = [];
    const mapIntensity = (p: number) => {
      if (p === 0) return 0;
      if (p <= 20) return 1;
      if (p <= 40) return 2;
      if (p <= 50) return 3;
      return 4;
    };

    const addToBody = (muscle: string, slugs: string[]) => {
      const s = heat[muscle] || 0;
      if (s > 0) {
        const p = (s / totalSets) * 100;
        slugs.forEach(slug => bodyData.push({ slug, intensity: mapIntensity(p) }));
      }
    };

    addToBody('Pecho', ['chest']);
    addToBody('Espalda', ['trapezius', 'upper-back', 'lower-back']);
    addToBody('Cuádriceps', ['quadriceps']);
    addToBody('Isquiotibiales', ['hamstring']);
    addToBody('Glúteo', ['gluteal']);
    addToBody('Hombro', ['front-deltoids', 'back-deltoids']);
    addToBody('Bíceps', ['biceps']);
    addToBody('Tríceps', ['triceps']);
    addToBody('Core', ['abs', 'obliques']);
    addToBody('Gemelos', ['calves']);
    addToBody('Antebrazos', ['forearm']);
    addToBody('Aductores', ['adductor']);
    addToBody('Abductores', ['abductors']);

    return (
      <View style={{ paddingBottom: 100 }}>
        <View style={styles.timeFilterContainer}>
          {[ {l: 'Hoy', v: 1}, {l: '7D', v: 7}, {l: '14D', v: 14}, {l: '1 Mes', v: 30} ].map(f => (
            <TouchableOpacity key={f.v} style={[styles.timeFilterBtn, bodyTimeFilter === f.v && { backgroundColor: colors.primary }]} onPress={() => setBodyTimeFilter(f.v as any)}>
              <Text style={{ color: bodyTimeFilter === f.v ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>{f.l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.dualBodyContainer}>
          <View style={styles.bodyWrapper}><Text style={styles.bodySideLabel}>FRONTAL</Text><Body data={bodyData} gender="female" side="front" scale={0.9} colors={['#3B82F6', '#FBBF24', '#F97316', '#EF4444']} /></View>
          <View style={styles.bodyWrapper}><Text style={styles.bodySideLabel}>DORSAL</Text><Body data={bodyData} gender="female" side="back" scale={0.9} colors={['#3B82F6', '#FBBF24', '#F97316', '#EF4444']} /></View>
        </View>

        <View style={[styles.topMusclesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {allMusclesSorted.map(([m, s], i) => (
            <View key={m} style={styles.topMuscleItem}>
              <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{m}</Text>
              <Text style={{ color: colors.primary, fontWeight: '800' }}>{totalSets > 0 ? ((s/totalSets)*100).toFixed(1) : 0}%</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderChart = (history: any[]) => {
    const data = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (data.length === 0) return null;
    const weights = data.map(d => d.weight || 0);
    const maxW = Math.max(...weights);
    const minW = Math.min(...weights);
    const range = maxW - minW === 0 ? 10 : maxW - minW;

    return (
      <View style={styles.chartContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartScrollArea}>
          {data.map((h, i) => (
            <View key={i} style={styles.chartCol}>
              <View style={styles.chartBarArea}><View style={[styles.chartBar, { height: `${((h.weight - minW) / range) * 75 + 15}%`, backgroundColor: colors.primary }]} /></View>
              <Text style={{fontSize: 10, color: colors.textPrimary, fontWeight:'700'}}>{h.weight}kg</Text>
              <Text style={{fontSize: 8, color: colors.textSecondary}}>{h.date.split('-').slice(1).join('/')}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  const uniqueTests = (() => {
    const prTests: Record<string, any> = {};
    testHistory.forEach(test => {
      const key = test.test_name === 'custom' ? `custom_${test.custom_name}` : test.test_name;
      const currentVal = Math.max(parseFloat(test.value_left) || 0, parseFloat(test.value_right) || 0, parseFloat(test.value) || 0);
      if (!prTests[key] || currentVal > (Math.max(parseFloat(prTests[key].value_left) || 0, parseFloat(prTests[key].value_right) || 0, parseFloat(prTests[key].value) || 0))) {
        prTests[key] = test;
      }
    });
    return Object.values(prTests);
  })();

  const filteredProgression = getCleanProgression().filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{isTrainer ? (selectedAthlete?.name || 'Deportista') : 'Analíticas'}</Text>
        <TouchableOpacity onPress={onRefresh} style={[styles.iconBtn, { backgroundColor: colors.surfaceHighlight }]}>
          <Ionicons name="refresh" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 20, marginBottom: 15 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {['summary', 'progress', 'body', 'feedback'].map(tab => (
            <TouchableOpacity key={tab} style={[styles.tabBtn, { backgroundColor: activeTab === tab ? colors.primary : colors.surfaceHighlight }]} onPress={() => setActiveTab(tab as any)}>
              <Text style={{ color: activeTab === tab ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>
                {tab === 'summary' ? 'Tests' : tab === 'progress' ? 'Evolución' : tab === 'body' ? 'Cuerpo' : 'Feedback'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0 }}>
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }}/> : 
         activeTab === 'summary' ? uniqueTests.map(renderTestCard) : 
         activeTab === 'progress' ? (
            <View>
              <TextInput style={[styles.searchInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} placeholder="Buscar ejercicio..." placeholderTextColor={colors.textSecondary} value={searchQuery} onChangeText={setSearchQuery} />
              {filteredProgression.map((item, i) => (
                <View key={i} style={[styles.progCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TouchableOpacity onPress={() => setSelectedExercise(selectedExercise === item.name ? null : item.name)} style={styles.progHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.progName, { color: colors.textPrimary }]}>{item.name}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Récord: {item.maxW} kg</Text>
                    </View>
                    <TouchableOpacity onPress={() => openDictModal(item.name)} style={styles.dictBtn}><Ionicons name="pricetags-outline" size={18} color={colors.textSecondary} /></TouchableOpacity>
                  </TouchableOpacity>
                  {selectedExercise === item.name && <View style={{ padding: 15, borderTopWidth: 1, borderTopColor: colors.border }}>{renderChart(item.history)}</View>}
                </View>
              ))}
            </View>
          ) : activeTab === 'body' ? renderBodyMap() : renderFeedbackTab()}
      </ScrollView>

      {/* MODAL DICCIONARIO */}
      <Modal visible={showDictModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 5 }}>Editar Diccionario</Text>
            <Text style={{ color: colors.primary, fontWeight: '600', marginBottom: 20 }}>{dictTargetExercise}</Text>
            <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {ALL_MUSCLES.map(m => (
                <TouchableOpacity key={m} style={[styles.dictSelectBtn, { borderColor: colors.border }, dictSelectedMuscles.includes(m) && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => toggleDictMuscle(m)}>
                  <Text style={{ color: dictSelectedMuscles.includes(m) ? '#FFF' : colors.textPrimary, fontWeight: '600', fontSize: 12 }}>{m}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.confirmMergeBtn, { backgroundColor: colors.primary, marginTop: 25 }]} onPress={saveDictMuscles}><Text style={{ color: '#FFF', fontWeight: '800' }}>GUARDAR CAMBIOS</Text></TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 15, alignItems: 'center' }} onPress={() => setShowDictModal(false)}><Text style={{ color: colors.textSecondary }}>Cancelar</Text></TouchableOpacity>
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
  iconBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  tabsRow: { flexDirection: 'row', gap: 8 },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  testCard: { padding: 18, borderRadius: 20, borderWidth: 1, marginBottom: 15 },
  testName: { fontSize: 17, fontWeight: '800' },
  testValue: { fontSize: 24, fontWeight: '900' },
  sideLabel: { fontSize: 9, fontWeight: '800', color: '#888' },
  progCard: { borderRadius: 20, borderWidth: 1, marginBottom: 15, overflow: 'hidden' },
  progHeader: { flexDirection: 'row', padding: 18, alignItems: 'center' },
  progName: { fontSize: 16, fontWeight: '800' },
  dictBtn: { padding: 8, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8 },
  searchInput: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 15, fontSize: 15 },
  chartContainer: { height: 180, marginTop: 10 },
  chartScrollArea: { gap: 12, alignItems: 'flex-end', paddingBottom: 10 },
  chartCol: { width: 40, alignItems: 'center' },
  chartBarArea: { height: 120, justifyContent: 'flex-end' },
  chartBar: { width: 12, borderRadius: 4 },
  dualBodyContainer: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 25 },
  bodyWrapper: { alignItems: 'center', flex: 1 },
  bodySideLabel: { fontSize: 10, fontWeight: '900', color: '#888', marginBottom: 10 },
  timeFilterContainer: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 12, padding: 4, marginBottom: 15 },
  timeFilterBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  topMusclesCard: { padding: 15, borderRadius: 20, borderWidth: 1 },
  topMuscleItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  feedbackCard: { padding: 18, borderRadius: 20, borderWidth: 1, marginBottom: 15 },
  emptyCard: { padding: 40, alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { padding: 25, borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  dictSelectBtn: { padding: 10, borderRadius: 10, borderWidth: 1 },
  confirmMergeBtn: { padding: 16, borderRadius: 12, alignItems: 'center' }
});
