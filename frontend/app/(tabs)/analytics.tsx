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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isDesktop = SCREEN_WIDTH > 768;
const MAX_CONTENT_WIDTH = 1200;

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
  const [testHistory, setTestHistory] = useState<any[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<any>(null);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
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
      const [ts, wk] = await Promise.all([
        api.getTests({ athlete_id: athleteId }).catch(() => []),
        api.getWorkouts({ athlete_id: athleteId }).catch(() => [])
      ]);
      setTestHistory(Array.isArray(ts) ? ts.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : []);
      setWorkoutHistory(Array.isArray(wk) ? wk.filter((w: any) => w.completed) : []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSelectAthlete = (athlete: any) => {
    setSelectedAthlete(athlete);
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

  // --- RENDERS DE LAS OTRAS PESTAÑAS (PARA EVITAR PANTALLA NEGRA) ---

  const renderTestCard = (test: any, index: number) => {
    const valL = parseFloat(test.value_left);
    const valR = parseFloat(test.value_right);
    const hasSides = !isNaN(valL) && !isNaN(valR) && (valL !== 0 || valR !== 0);
    return (
      <View key={index} style={[styles.testCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.testName, { color: colors.textPrimary }]}>{test.custom_name || TEST_TRANSLATIONS[test.test_name] || test.test_name}</Text>
        <View style={{ flexDirection: 'row', marginTop: 10 }}>
          {hasSides ? (
            <>
              <View style={{ flex: 1 }}><Text style={[styles.testValue, { color: '#3B82F6' }]}>{valL}</Text><Text style={styles.sideLabel}>IZQ</Text></View>
              <View style={{ flex: 1 }}><Text style={[styles.testValue, { color: '#EF4444' }]}>{valR}</Text><Text style={styles.sideLabel}>DER</Text></View>
            </>
          ) : (
            <Text style={[styles.testValue, { color: colors.textPrimary }]}>{test.value} {test.unit}</Text>
          )}
        </View>
      </View>
    );
  };

  const renderFeedbackTab = () => {
    const feedbacks: any[] = [];
    workoutHistory.forEach(w => w.completion_data?.exercise_results?.forEach((ex: any) => {
      if (ex.coach_note) feedbacks.push({ date: w.date, exercise: ex.name, note: ex.coach_note });
    }));
    return (
      <View>
        {feedbacks.length > 0 ? feedbacks.reverse().map((fb, i) => (
          <View key={i} style={[styles.feedbackCard, { backgroundColor: colors.surface, borderColor: colors.warning + '40' }]}>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{fb.date}</Text>
            <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>{fb.exercise}</Text>
            <Text style={{ color: colors.textPrimary, fontStyle: 'italic' }}>"{fb.note}"</Text>
          </View>
        )) : <Text style={{color: colors.textSecondary, textAlign: 'center'}}>No hay correcciones.</Text>}
      </View>
    );
  };

  const renderChart = (history: any[]) => {
    const data = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return (
      <ScrollView horizontal contentContainerStyle={{ gap: 10, alignItems: 'flex-end', height: 150 }}>
        {data.map((h, i) => (
          <View key={i} style={{ alignItems: 'center' }}>
            <View style={{ height: (h.weight / 150) * 100, width: 12, backgroundColor: colors.primary, borderRadius: 4 }} />
            <Text style={{ fontSize: 9, color: colors.textPrimary }}>{h.weight}kg</Text>
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderBodyMap = () => {
    const heat = getMuscleHeat();
    const totalSets = Object.values(heat).reduce((sum, val) => sum + val, 0);
    const sortedMuscles = Object.entries(heat).sort((a, b) => b[1] - a[1]);

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
      <View style={styles.bodyTabWrapper}>
        <View style={styles.timeFilterContainer}>
          {[ {l: 'Hoy', v: 1}, {l: '7D', v: 7}, {l: '14D', v: 14}, {l: '1 Mes', v: 30} ].map(f => (
            <TouchableOpacity key={f.v} style={[styles.timeBtn, bodyTimeFilter === f.v && {backgroundColor: colors.primary}]} onPress={() => setBodyTimeFilter(f.v as any)}>
              <Text style={{color: bodyTimeFilter === f.v ? '#FFF' : colors.textSecondary, fontWeight: '700'}}>{f.l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={isDesktop ? styles.desktopBodyLayout : styles.mobileBodyLayout}>
          
          {/* LADO IZQUIERDO: SILUETAS XXL */}
          <View style={styles.silhouettesWrapper}>
            <View style={styles.bodyContainer}>
              <View style={styles.bodySide}>
                <Text style={styles.bodySideLabel}>FRONTAL</Text>
                <Body data={bodyData} gender="female" side="front" scale={isDesktop ? 1.4 : 0.9} colors={['#3B82F6', '#FBBF24', '#F97316', '#EF4444']} />
              </View>
              <View style={styles.bodySide}>
                <Text style={styles.bodySideLabel}>DORSAL</Text>
                <Body data={bodyData} gender="female" side="back" scale={isDesktop ? 1.4 : 0.9} colors={['#3B82F6', '#FBBF24', '#F97316', '#EF4444']} />
              </View>
            </View>
          </View>

          {/* LADO DERECHO: LEYENDA Y LISTA */}
          <View style={styles.dataWrapper}>
            <View style={[styles.legendCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Leyenda de % Series</Text>
              <View style={styles.legendGrid}>
                <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#E2E8F0' }]} /><Text style={styles.legendText}>0%</Text></View>
                <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#3B82F6' }]} /><Text style={styles.legendText}>0-20%</Text></View>
                <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#FBBF24' }]} /><Text style={styles.legendText}>20-40%</Text></View>
                <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#F97316' }]} /><Text style={styles.legendText}>40-50%</Text></View>
                <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#EF4444' }]} /><Text style={styles.legendText}>50%+</Text></View>
              </View>
            </View>

            <View style={[styles.muscleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Reparto Muscular</Text>
              {sortedMuscles.map(([m, s]) => {
                const p = totalSets > 0 ? (s / totalSets) * 100 : 0;
                return (
                  <View key={m} style={styles.muscleRow}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>{m}</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: colors.primary, fontWeight: '800' }}>{p.toFixed(1)}%</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{s} series</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

        </View>
      </View>
    );
  };

  const getCleanProgression = () => {
    const exercises: Record<string, any> = {};
    workoutHistory.forEach(w => w.completion_data?.exercise_results?.forEach((r: any) => {
      if (r.completed_sets > 0 && r.name) {
        const normKey = normalizeName(r.name);
        const weight = parseFloat(String(r.logged_weight || '0').replace(',', '.')) || 0;
        if (!exercises[normKey]) exercises[normKey] = { name: r.name, history: [], maxW: 0 };
        if (weight > exercises[normKey].maxW) exercises[normKey].maxW = weight;
        exercises[normKey].history.push({ date: w.date, weight });
      }
    }));
    return Object.values(exercises).sort((a: any, b: any) => a.name.localeCompare(b.name));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.mainCenteredContent}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{isTrainer ? (selectedAthlete?.name || 'Cargando...') : 'Analíticas'}</Text>
          <TouchableOpacity onPress={onRefresh} style={[styles.iconBtn, { backgroundColor: colors.surfaceHighlight }]}>
            {refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh" size={22} color={colors.primary} />}
          </TouchableOpacity>
        </View>

        <View style={styles.tabsContainer}>
          {['summary', 'progress', 'body', 'feedback'].map(tab => (
            <TouchableOpacity key={tab} style={[styles.tabButton, activeTab === tab && { backgroundColor: colors.primary }]} onPress={() => setActiveTab(tab as any)}>
              <Text style={[styles.tabButtonText, { color: activeTab === tab ? '#FFF' : colors.textSecondary }]}>
                {tab === 'summary' ? 'TESTS' : tab === 'progress' ? 'EVOLUCIÓN' : tab === 'body' ? 'CUERPO' : 'FEEDBACK'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {loading && !refreshing ? <ActivityIndicator color={colors.primary} size="large" /> : 
           activeTab === 'summary' ? testHistory.map(renderTestCard) : 
           activeTab === 'progress' ? (
              <View>
                <TextInput style={[styles.searchBar, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} placeholder="Buscar ejercicio..." placeholderTextColor={colors.textSecondary} value={searchQuery} onChangeText={setSearchQuery} />
                {getCleanProgression().filter(ex => ex.name.toLowerCase().includes(searchQuery.toLowerCase())).map((item, i) => (
                  <View key={i} style={[styles.progCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <TouchableOpacity onPress={() => setSelectedExercise(selectedExercise === item.name ? null : item.name)} style={styles.progHeader}>
                      <View style={{flex:1}}><Text style={[styles.progName, {color: colors.textPrimary}]}>{item.name}</Text><Text style={{color: colors.primary, fontWeight:'700'}}>Récord: {item.maxW}kg</Text></View>
                      <TouchableOpacity onPress={() => openDictModal(item.name)}><Ionicons name="pricetags-outline" size={20} color={colors.textSecondary}/></TouchableOpacity>
                    </TouchableOpacity>
                    {selectedExercise === item.name && <View style={{padding: 15, borderTopWidth: 1, borderTopColor: colors.border}}>{renderChart(item.history)}</View>}
                  </View>
                ))}
              </View>
           ) : activeTab === 'body' ? renderBodyMap() : renderFeedbackTab()}
        </ScrollView>
      </View>

      {/* MODAL DICCIONARIO */}
      <Modal visible={showDictModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 15 }}>Editar Diccionario: {dictTargetExercise}</Text>
            <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {ALL_MUSCLES.map(m => (
                <TouchableOpacity key={m} style={[styles.dictSelectBtn, { borderColor: colors.border }, dictSelectedMuscles.includes(m) && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => toggleDictMuscle(m)}>
                  <Text style={{ color: dictSelectedMuscles.includes(m) ? '#FFF' : colors.textPrimary, fontWeight: '600' }}>{m}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.primary }]} onPress={saveDictMuscles}><Text style={{ color: '#FFF', fontWeight: '800' }}>GUARDAR CAMBIOS</Text></TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 15, alignItems: 'center' }} onPress={() => setShowDictModal(false)}><Text style={{ color: colors.textSecondary }}>Cancelar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mainCenteredContent: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 25 },
  headerTitle: { fontSize: 28, fontWeight: '900' },
  iconBtn: { width: 45, height: 45, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  tabsContainer: { flexDirection: 'row', paddingHorizontal: 25, gap: 10, marginBottom: 10 },
  tabButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.05)' },
  tabButtonText: { fontSize: 11, fontWeight: '800' },
  
  bodyTabWrapper: { flex: 1 },
  timeFilterContainer: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 30 },
  timeBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.05)' },
  
  desktopBodyLayout: { flexDirection: 'row', gap: 30, alignItems: 'flex-start' },
  mobileBodyLayout: { flexDirection: 'column' },
  
  silhouettesWrapper: { flex: 1.5, alignItems: 'center', justifyContent: 'center' },
  bodyContainer: { flexDirection: 'row', justifyContent: 'center', gap: 30 },
  bodySide: { alignItems: 'center' },
  bodySideLabel: { fontSize: 11, fontWeight: '900', color: '#888', marginBottom: 20, letterSpacing: 1 },
  
  dataWrapper: { flex: 1, gap: 20 },
  cardTitle: { fontSize: 18, fontWeight: '800', marginBottom: 15 },
  legendCard: { padding: 20, borderRadius: 20, borderWidth: 1 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 14, height: 14, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: '700', color: '#666' },
  
  muscleCard: { padding: 20, borderRadius: 20, borderWidth: 1 },
  muscleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  
  testCard: { padding: 20, borderRadius: 20, borderWidth: 1, marginBottom: 15 },
  testName: { fontSize: 18, fontWeight: '800' },
  testValue: { fontSize: 26, fontWeight: '900' },
  sideLabel: { fontSize: 10, fontWeight: '900', color: '#888' },
  progCard: { borderRadius: 20, borderWidth: 1, marginBottom: 15, overflow: 'hidden' },
  progHeader: { flexDirection: 'row', padding: 18, alignItems: 'center' },
  progName: { fontSize: 16, fontWeight: '800' },
  searchBar: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  feedbackCard: { padding: 18, borderRadius: 20, borderWidth: 1, marginBottom: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { padding: 30, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  dictSelectBtn: { padding: 12, borderRadius: 10, borderWidth: 1 },
  confirmBtn: { padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 30 }
});
