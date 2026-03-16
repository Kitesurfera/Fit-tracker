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

  // Filtros del mapa muscular
  const [bodyView, setBodyView] = useState<'frontal' | 'dorsal'>('frontal');
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

  const handleDeleteFeedback = (workoutId: string, isHiit: boolean, blockIdx: number, exIdx: number) => {
    if (Platform.OS === 'web') {
      if (window.confirm('¿Seguro que quieres eliminar este feedback?')) {
        executeDeleteFeedback(workoutId, isHiit, blockIdx, exIdx);
      }
    } else {
      Alert.alert("Eliminar Feedback", "¿Seguro que quieres borrar la nota de este ejercicio?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: () => executeDeleteFeedback(workoutId, isHiit, blockIdx, exIdx) }
      ]);
    }
  };

  const executeDeleteFeedback = async (workoutId: string, isHiit: boolean, blockIdx: number, exIdx: number) => {
    const targetWorkout = workoutHistory.find(w => w.id === workoutId);
    if (!targetWorkout) return;
    try {
      let updatedData = { ...targetWorkout };
      if (isHiit) {
        const newHiitResults = [...updatedData.completion_data.hiit_results];
        const newBlock = { ...newHiitResults[blockIdx] };
        const newExercises = [...newBlock.hiit_exercises];
        newExercises[exIdx] = { ...newExercises[exIdx], coach_note: "" };
        newBlock.hiit_exercises = newExercises;
        newHiitResults[blockIdx] = newBlock;
        updatedData.completion_data.hiit_results = newHiitResults;
      } else {
        const newExResults = [...updatedData.completion_data.exercise_results];
        newExResults[exIdx] = { ...newExResults[exIdx], coach_note: "" };
        updatedData.completion_data.exercise_results = newExResults;
      }
      await api.updateWorkout(workoutId, updatedData);
      setWorkoutHistory(prev => prev.map(w => w.id === workoutId ? updatedData : w));
      if (Platform.OS !== 'web') Alert.alert("Eliminado", "El feedback ha sido borrado.");
    } catch (e) {
      if (Platform.OS !== 'web') Alert.alert("Error", "No se pudo borrar el feedback.");
    }
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
          const reps = parseInt(r.logged_reps) || 0;
          
          if (!exercises[normKey]) exercises[normKey] = { name: rawName, history: [], maxW: 0 };
          if (weight > exercises[normKey].maxW) exercises[normKey].maxW = weight;

          const existingDay = exercises[normKey].history.find((h: any) => h.date === w.date);
          if (existingDay) {
            if (weight > existingDay.weight) { existingDay.weight = weight; existingDay.reps = reps; }
          } else {
            exercises[normKey].history.push({ date: w.date, weight, reps });
          }
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

  const getMuscleHeat = () => {
    const heat: Record<string, number> = {
      'Pecho': 0, 'Espalda': 0, 'Cuádriceps': 0, 'Isquiotibiales': 0,
      'Glúteo': 0, 'Hombro': 0, 'Bíceps': 0, 'Tríceps': 0, 'Core': 0,
      'Gemelos': 0, 'Antebrazos': 0, 'Aductores': 0, 'Abductores': 0, 'Tibial': 0
    };
    
    // Lógica del nuevo filtro de tiempo
    const limitDate = new Date();
    if (bodyTimeFilter === 1) {
      limitDate.setHours(0, 0, 0, 0); // Desde esta medianoche
    } else {
      limitDate.setDate(limitDate.getDate() - bodyTimeFilter);
    }

    workoutHistory.forEach(w => {
      const wDate = new Date(w.date);
      if (wDate >= limitDate) {
        w.completion_data?.exercise_results?.forEach((r: any) => {
          if (r.completed_sets > 0 && r.name) {
            const sets = parseInt(r.completed_sets) || 1;
            const workedMuscles = getMusclesForExercise(r.name);
            workedMuscles.forEach(muscle => {
              if (heat[muscle] !== undefined) heat[muscle] += sets;
            });
          }
        });
      }
    });
    return heat;
  };

  const renderBodyMap = () => {
    const heat = getMuscleHeat();
    
    const totalSets = Object.values(heat).reduce((sum, val) => sum + val, 0);
    const allMusclesSorted = Object.entries(heat).sort((a, b) => b[1] - a[1]);

    const getFilterText = () => {
      if (bodyTimeFilter === 1) return 'hoy';
      if (bodyTimeFilter === 30) return 'último mes';
      return `últimos ${bodyTimeFilter} días`;
    };

    if (totalSets === 0) {
      return (
        <View style={styles.emptyCard}>
          <View style={styles.timeFilterContainer}>
            {[ {label: 'Hoy', val: 1}, {label: '7D', val: 7}, {label: '14D', val: 14}, {label: '1 Mes', val: 30} ].map(f => (
              <TouchableOpacity key={f.val} style={[styles.timeFilterBtn, bodyTimeFilter === f.val && { backgroundColor: colors.primary }]} onPress={() => setBodyTimeFilter(f.val as any)}>
                <Text style={{ color: bodyTimeFilter === f.val ? '#FFF' : colors.textSecondary, fontWeight: '700', fontSize: 13 }}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Ionicons name="body-outline" size={48} color={colors.border} style={{ marginTop: 20 }}/>
          <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 12, fontSize: 15 }}>
            No hay entrenamientos registrados para el filtro: {getFilterText()}.
          </Text>
        </View>
      );
    }

    const bodyData: { slug: string; intensity: number }[] = [];
    const mapIntensity = (percentage: number) => {
      if (percentage === 0) return 0;
      if (percentage <= 20) return 1;
      if (percentage <= 40) return 2;
      if (percentage <= 50) return 3;
      return 4;
    };

    const addToBody = (muscleName: string, slugs: string[]) => {
      const sets = heat[muscleName] || 0;
      if (sets > 0) {
        const percentage = (sets / totalSets) * 100;
        const intensity = mapIntensity(percentage);
        slugs.forEach(slug => bodyData.push({ slug, intensity }));
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
        
        {/* TABS DE TIEMPO */}
        <View style={styles.timeFilterContainer}>
          {[ {label: 'Hoy', val: 1}, {label: '7D', val: 7}, {label: '14D', val: 14}, {label: '1 Mes', val: 30} ].map(f => (
            <TouchableOpacity 
              key={f.val}
              style={[styles.timeFilterBtn, bodyTimeFilter === f.val && { backgroundColor: colors.primary }]}
              onPress={() => setBodyTimeFilter(f.val as any)}
            >
              <Text style={{ color: bodyTimeFilter === f.val ? '#FFF' : colors.textSecondary, fontWeight: '700', fontSize: 13 }}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* TABS FRONT / BACK */}
        <View style={styles.bodyToggleContainer}>
          <TouchableOpacity 
            style={[styles.bodyToggleBtn, bodyView === 'frontal' && { backgroundColor: colors.surfaceHighlight }]}
            onPress={() => setBodyView('frontal')}
          >
            <Text style={{ color: bodyView === 'frontal' ? colors.textPrimary : colors.textSecondary, fontWeight: '700' }}>Frontal</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.bodyToggleBtn, bodyView === 'dorsal' && { backgroundColor: colors.surfaceHighlight }]}
            onPress={() => setBodyView('dorsal')}
          >
            <Text style={{ color: bodyView === 'dorsal' ? colors.textPrimary : colors.textSecondary, fontWeight: '700' }}>Dorsal</Text>
          </TouchableOpacity>
        </View>

        <View style={{ alignItems: 'center', marginVertical: 20 }}>
          <Body 
            data={bodyData}
            gender="female"
            side={bodyView === 'frontal' ? 'front' : 'back'}
            scale={1.3} 
            colors={['#3B82F6', '#FBBF24', '#F97316', '#EF4444']} 
          />
        </View>

        <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 16, marginBottom: 15 }}>
          Volumen ({getFilterText()})
        </Text>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}><View style={[styles.legendColor, { backgroundColor: '#E2E8F0' }]} /><Text style={[styles.legendText, { color: colors.textSecondary }]}>0%</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendColor, { backgroundColor: '#3B82F6' }]} /><Text style={[styles.legendText, { color: colors.textSecondary }]}>{'>'}0-20%</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendColor, { backgroundColor: '#FBBF24' }]} /><Text style={[styles.legendText, { color: colors.textSecondary }]}>20-40%</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendColor, { backgroundColor: '#F97316' }]} /><Text style={[styles.legendText, { color: colors.textSecondary }]}>40-50%</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendColor, { backgroundColor: '#EF4444' }]} /><Text style={[styles.legendText, { color: colors.textSecondary }]}>50%+</Text></View>
        </View>

        <View style={[styles.topMusclesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 16, marginBottom: 15 }}>Todos los grupos musculares</Text>
          {allMusclesSorted.map(([muscle, sets], i) => {
            const percentage = totalSets > 0 ? ((sets / totalSets) * 100) : 0;
            return (
              <View key={muscle} style={styles.topMuscleItem}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, width: 25, fontWeight: '800' }}>{i + 1}</Text>
                  <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>{muscle}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '800' }}>{percentage.toFixed(1)}%</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{sets} series</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderChart = (history: any[]) => {
    const data = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (data.length === 0) return null;
    const weights = data.map(d => d.weight || d.value || 0);
    const maxW = Math.max(...weights);
    const minW = Math.min(...weights);
    const range = maxW - minW === 0 ? 10 : maxW - minW;

    return (
      <View style={styles.chartContainer}>
        <View style={[styles.yAxis, { borderRightColor: colors.border }]}>
          <Text style={[styles.axisText, { color: colors.textSecondary }]}>{Number(maxW.toFixed(1))}</Text>
          <Text style={[styles.axisText, { color: colors.textSecondary }]}>{Number(((maxW+minW)/2).toFixed(1))}</Text>
          <Text style={[styles.axisText, { color: colors.textSecondary }]}>{Number(minW.toFixed(1))}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartScrollArea}>
          {data.map((h, i) => {
            const val = h.weight || h.value || 0;
            const heightPct = ((val - minW) / range) * 75 + 15;
            return (
              <View key={i} style={styles.chartCol}>
                <View style={styles.chartBarArea}><View style={[styles.chartBar, { height: `${heightPct}%`, backgroundColor: colors.primary }]} /></View>
                <View style={styles.chartLabelsArea}>
                  <Text style={[styles.chartXWeight, { color: colors.textPrimary }]}>{Number(val.toFixed(1))}</Text>
                  <Text style={[styles.chartXDate, { color: colors.textSecondary }]}>{h.date.split('-').slice(1).join('/')}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const getPRUniqueTests = () => {
    const prTests: Record<string, { testDoc: any; maxVal: number }> = {};
    testHistory.forEach(test => {
      const key = test.test_name === 'custom' ? `custom_${test.custom_name}` : test.test_name;
      let currentVal = 0;
      if (test.value_left != null || test.value_right != null) {
        currentVal = Math.max(parseFloat(test.value_left) || 0, parseFloat(test.value_right) || 0); 
      } else {
        currentVal = parseFloat(test.value) || 0;
      }
      if (!prTests[key] || currentVal > prTests[key].maxVal) {
        prTests[key] = { testDoc: test, maxVal: currentVal };
      }
    });
    return Object.values(prTests).map(item => item.testDoc);
  };

  const handleTestPress = (test: any) => {
    const testName = test.test_name === 'custom' ? test.custom_name : (TEST_TRANSLATIONS[test.test_name] || test.test_name);
    const historyForTest = testHistory.filter(t => t.test_name === test.test_name && (test.test_name !== 'custom' || t.custom_name === test.custom_name));
    const adaptedHistory = historyForTest.map(t => {
      let val = 0;
      if (t.value_left != null || t.value_right != null) {
        val = ((parseFloat(t.value_left) || 0) + (parseFloat(t.value_right) || 0)) / 2;
      } else {
        val = parseFloat(t.value) || 0;
      }
      return { date: t.date, value: val, unit: t.unit };
    });
    setSelectedTestName(testName);
    setSelectedTestHistory(adaptedHistory);
    setShowTestChartModal(true);
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
      <TouchableOpacity key={index} style={[styles.testCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => handleTestPress(test)} activeOpacity={0.7}>
        <View style={styles.testHeader}>
          <View><Text style={[styles.testName, { color: colors.textPrimary }]}>{testName}</Text><Text style={[styles.testDate, { color: colors.textSecondary }]}>Récord: {test.date}</Text></View>
          {hasSides ? (
            <View style={[styles.asymBadge, { backgroundColor: asymmetry > 15 ? '#EF4444' : colors.primary + '20' }]}><Text style={{ color: asymmetry > 15 ? '#FFF' : colors.primary, fontSize: 10, fontWeight: '800' }}>{asymmetry.toFixed(1)}% ASIM.</Text></View>
          ) : (<Ionicons name="bar-chart-outline" size={20} color={colors.primary} />)}
        </View>
        <View style={styles.testValuesRow}>
          {hasSides ? (
            <><View style={styles.valueBox}><Text style={[styles.testValue, { color: '#3B82F6' }]}>{valL}</Text><Text style={styles.sideLabel}>IZQ ({test.unit})</Text></View><View style={[styles.valueBox, { borderLeftWidth: 1, borderLeftColor: colors.border }]}><Text style={[styles.testValue, { color: '#EF4444' }]}>{valR}</Text><Text style={styles.sideLabel}>DER ({test.unit})</Text></View></>
          ) : (<View style={styles.valueBox}><Text style={[styles.testValue, { color: colors.textPrimary }]}>{test.value} <Text style={{fontSize: 14}}>{test.unit}</Text></Text><Text style={styles.sideLabel}>GLOBAL</Text></View>)}
        </View>
      </TouchableOpacity>
    );
  };

  const renderFeedbackTab = () => {
    const feedbacks: any[] = [];
    workoutHistory.forEach(w => {
      w.completion_data?.exercise_results?.forEach((ex: any, idx: number) => {
        if (ex.coach_note) feedbacks.push({ workoutId: w.id, isHiit: false, blockIdx: -1, exIdx: idx, date: w.date, title: w.title, exercise: ex.name, note: ex.coach_note });
      });
      w.completion_data?.hiit_results?.forEach((block: any, bIdx: number) => {
        block.hiit_exercises?.forEach((ex: any, eIdx: number) => {
          if (ex.coach_note) feedbacks.push({ workoutId: w.id, isHiit: true, blockIdx: bIdx, exIdx: eIdx, date: w.date, title: w.title, exercise: ex.name, note: ex.coach_note });
        });
      });
    });

    if (feedbacks.length === 0) return (<View style={styles.emptyCard}><Ionicons name="chatbubbles-outline" size={48} color={colors.border} /><Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 12, fontSize: 15 }}>Aún no hay correcciones del coach registradas.</Text></View>);

    return (
      <View style={{ paddingBottom: 100 }}>
        {feedbacks.reverse().map((fb, i) => (
          <View key={i} style={[styles.feedbackCard, { backgroundColor: colors.surface, borderColor: (colors.warning || '#F59E0B') + '40' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="chatbubble-ellipses" size={20} color={colors.warning || '#F59E0B'} /><Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{fb.date} • {fb.title}</Text></View>
              {isTrainer && (<TouchableOpacity onPress={() => handleDeleteFeedback(fb.workoutId, fb.isHiit, fb.blockIdx, fb.exIdx)}><Ionicons name="trash-outline" size={18} color={colors.error || '#EF4444'} /></TouchableOpacity>)}
            </View>
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 8 }}>{fb.exercise}</Text>
            <View style={{ backgroundColor: (colors.warning || '#F59E0B') + '15', padding: 12, borderRadius: 10 }}><Text style={{ color: colors.textPrimary, fontSize: 14, fontStyle: 'italic', lineHeight: 20 }}>"{fb.note}"</Text></View>
          </View>
        ))}
      </View>
    );
  };

  const cleanProgression = getCleanProgression();
  const rawExerciseNames = getUniqueRawExerciseNames();
  const filteredProgression = cleanProgression.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const uniqueTests = getPRUniqueTests();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{isTrainer ? (selectedAthlete?.name || 'Cargando...') : 'Analíticas'}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={onRefresh} disabled={refreshing} style={[styles.iconBtn, { backgroundColor: colors.surfaceHighlight }]}>{refreshing ? <ActivityIndicator size="small" color={colors.primary}/> : <Ionicons name="refresh" size={20} color={colors.primary} />}</TouchableOpacity>
          {isTrainer && (<TouchableOpacity onPress={() => setShowPicker(true)} style={[styles.iconBtn, { backgroundColor: colors.surfaceHighlight }]}><Ionicons name="people" size={20} color={colors.primary} /></TouchableOpacity>)}
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, marginBottom: 15 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.tabsRow, { backgroundColor: colors.surfaceHighlight }]}>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'summary' && { backgroundColor: colors.primary }]} onPress={() => setActiveTab('summary')}><Text style={{ color: activeTab === 'summary' ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>Tests</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'progress' && { backgroundColor: colors.primary }]} onPress={() => setActiveTab('progress')}><Text style={{ color: activeTab === 'progress' ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>Evolución</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'body' && { backgroundColor: colors.primary }]} onPress={() => setActiveTab('body')}><Text style={{ color: activeTab === 'body' ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>Cuerpo</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'feedback' && { backgroundColor: colors.warning || '#F59E0B' }]} onPress={() => setActiveTab('feedback')}><Text style={{ color: activeTab === 'feedback' ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>Feedback</Text></TouchableOpacity>
        </ScrollView>
      </View>

      {activeTab === 'progress' && cleanProgression.length > 0 && (
        <View style={{ paddingHorizontal: 20, marginBottom: 15 }}>
          <TouchableOpacity style={[styles.mergeBtn, { borderColor: colors.primary, marginBottom: 15 }]} onPress={() => setShowMergeModal(true)}><Ionicons name="git-merge-outline" size={18} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: '700', marginLeft: 8 }}>Unificar nombres</Text></TouchableOpacity>
          <View style={styles.controlsRow}>
            <View style={[styles.searchBox, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}><Ionicons name="search" size={20} color={colors.textSecondary} /><TextInput style={[styles.searchInput, { color: colors.textPrimary }]} placeholder="Buscar ejercicio..." placeholderTextColor={colors.textSecondary} value={searchQuery} onChangeText={setSearchQuery} />{searchQuery.length > 0 && (<TouchableOpacity onPress={() => setSearchQuery('')}><Ionicons name="close-circle" size={20} color={colors.textSecondary} /></TouchableOpacity>)}</View>
            <View style={[styles.viewToggle, { backgroundColor: colors.surfaceHighlight }]}>
              <TouchableOpacity onPress={() => setViewMode('list')} style={[styles.toggleBtn, viewMode === 'list' && { backgroundColor: colors.primary }]}><Ionicons name="list" size={20} color={viewMode === 'list' ? '#FFF' : colors.textSecondary} /></TouchableOpacity>
              <TouchableOpacity onPress={() => setViewMode('grid')} style={[styles.toggleBtn, viewMode === 'grid' && { backgroundColor: colors.primary }]}><Ionicons name="grid" size={20} color={viewMode === 'grid' ? '#FFF' : colors.textSecondary} /></TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 100 }}>
        {loading && !refreshing ? (<ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }}/>) : 
         activeTab === 'summary' ? (uniqueTests.length > 0 ? (uniqueTests.map(renderTestCard)) : (<View style={styles.emptyCard}><Ionicons name="clipboard-outline" size={48} color={colors.border} /><Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 12, fontSize: 15 }}>Sin tests registrados.</Text></View>)) : 
         activeTab === 'progress' ? (filteredProgression.length > 0 ? (
            <View style={viewMode === 'grid' ? styles.gridContainer : styles.listContainer}>
              {filteredProgression.map((item, i) => {
                const isSelected = selectedExercise === item.name;
                const isGridFormat = viewMode === 'grid' && !isSelected;
                const workedMuscles = getMusclesForExercise(item.name);

                return (
                  <View key={i} style={[styles.progCard, { backgroundColor: colors.surface, borderColor: colors.border }, isGridFormat ? styles.gridCard : styles.listCard]}>
                    <View style={isGridFormat ? styles.gridHeader : styles.progHeader}>
                      <TouchableOpacity onPress={() => setSelectedExercise(isSelected ? null : item.name)} style={{ flex: 1, alignItems: isGridFormat ? 'center' : 'flex-start' }}>
                        <Text style={[styles.progName, { color: colors.textPrimary, textAlign: isGridFormat ? 'center' : 'left' }, isGridFormat && { fontSize: 14 }]}>{item.name}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: isGridFormat ? 'center' : 'left' }}>{isGridFormat ? 'Récord:\n' : 'Récord Histórico: '}<Text style={{fontWeight:'700', color: colors.primary}}>{Number(item.maxW.toFixed(1))} kg</Text></Text>
                      </TouchableOpacity>
                      
                      {!isGridFormat && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <TouchableOpacity onPress={() => openDictModal(item.name)} style={styles.dictBtn}>
                            <Ionicons name="pricetags-outline" size={20} color={colors.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setSelectedExercise(isSelected ? null : item.name)}>
                            <Ionicons name={isSelected ? "chevron-up" : "bar-chart-outline"} size={22} color={colors.primary} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    {isSelected && (
                      <View style={[styles.chartWrapper, { borderTopColor: colors.border }]}>
                        {workedMuscles.length > 0 && (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 15 }}>
                            {workedMuscles.map((m, idx) => (
                              <View key={idx} style={[styles.muscleTag, { backgroundColor: colors.surfaceHighlight }]}><Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700' }}>{m}</Text></View>
                            ))}
                          </View>
                        )}
                        {renderChart(item.history)}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (<View style={styles.emptyCard}><Ionicons name="bar-chart-outline" size={48} color={colors.border} /><Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 12, fontSize: 15 }}>No hay ejercicios que coincidan.</Text></View>)) : 
         activeTab === 'body' ? (renderBodyMap()) : (renderFeedbackTab())}
      </ScrollView>

      <Modal visible={showDictModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, maxHeight: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <View>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary }}>Editar Diccionario</Text>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>{dictTargetExercise}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowDictModal(false)}><Ionicons name="close" size={24} color={colors.textPrimary}/></TouchableOpacity>
            </View>
            
            <Text style={{ color: colors.textSecondary, marginBottom: 15, fontSize: 13 }}>
              Selecciona los grupos musculares que se trabajan en este ejercicio. Esto actualizará tu mapa de calor.
            </Text>

            <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 20 }}>
              {ALL_MUSCLES.map(muscle => {
                const isSelected = dictSelectedMuscles.includes(muscle);
                return (
                  <TouchableOpacity 
                    key={muscle} 
                    style={[styles.dictSelectBtn, { borderColor: colors.border }, isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => toggleDictMuscle(muscle)}
                  >
                    <Text style={{ color: isSelected ? '#FFF' : colors.textPrimary, fontWeight: '600', fontSize: 13 }}>{muscle}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={[styles.confirmMergeBtn, { backgroundColor: colors.primary }]} onPress={saveDictMuscles}>
              <Text style={{ color: '#FFF', fontWeight: '800', textAlign: 'center' }}>GUARDAR CAMBIOS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showTestChartModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary }}>Evolución: {selectedTestName}</Text>
              <TouchableOpacity onPress={() => setShowTestChartModal(false)}><Ionicons name="close" size={24} color={colors.textPrimary}/></TouchableOpacity>
            </View>
            {selectedTestHistory.length > 1 ? (
              <><Text style={{ color: colors.textSecondary, marginBottom: 15, fontSize: 13 }}>Aquí tienes tu progreso histórico. (En tests asimétricos se muestra la media).</Text><View style={{ height: 250, width: '100%', marginBottom: 20 }}>{renderChart(selectedTestHistory)}</View></>
            ) : (<View style={[styles.emptyCard, { paddingVertical: 20 }]}><Ionicons name="information-circle-outline" size={48} color={colors.border} /><Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 12, fontSize: 15 }}>Solo tienes un registro de este test.</Text></View>)}
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={() => setShowTestChartModal(false)}><Text style={{ color: colors.textPrimary, fontWeight: '700' }}>CERRAR</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showMergeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface, maxHeight: '85%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary }}>Unificar Ejercicios</Text>
                <TouchableOpacity onPress={() => { setShowMergeModal(false); setExercisesToMerge([]); setMergeTargetName(''); }}><Ionicons name="close" size={24} color={colors.textPrimary}/></TouchableOpacity>
              </View>
              <Text style={{ color: colors.textSecondary, marginBottom: 15, fontSize: 13 }}>Selecciona los ejercicios que son el mismo pero se escribieron diferente y asígnales un nombre común.</Text>
              <ScrollView style={{ flexShrink: 1, marginBottom: 15 }}>
                {rawExerciseNames.map(name => (
                  <TouchableOpacity key={name} style={[styles.mergeItem, { borderColor: colors.border }, exercisesToMerge.includes(name) && { backgroundColor: colors.primary + '15', borderColor: colors.primary }]} onPress={() => toggleMergeSelection(name)}>
                    <Ionicons name={exercisesToMerge.includes(name) ? "checkbox" : "square-outline"} size={20} color={exercisesToMerge.includes(name) ? colors.primary : colors.textSecondary} /><Text style={{ color: colors.textPrimary, marginLeft: 10, fontWeight: '500' }}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {exercisesToMerge.length > 1 && (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 15 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '700', marginBottom: 8 }}>¿Cómo quieres que se llamen?</Text>
                  <TextInput style={[styles.mergeInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} placeholder="Ej: Sentadilla Búlgara" placeholderTextColor={colors.textSecondary} value={mergeTargetName} onChangeText={setMergeTargetName} />
                  <TouchableOpacity style={[styles.confirmMergeBtn, { backgroundColor: mergeTargetName.trim() ? colors.primary : colors.border }]} disabled={!mergeTargetName.trim()} onPress={handleMerge}><Text style={{ color: '#FFF', fontWeight: '800', textAlign: 'center' }}>JUNTAR DATOS</Text></TouchableOpacity>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={showPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 20, textAlign: 'center', color: colors.textPrimary }}>Seleccionar Deportista</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {athletes.map(a => (<TouchableOpacity key={a.id} style={[styles.athleteItem, { borderBottomColor: colors.border }]} onPress={() => handleSelectAthlete(a)}><Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 16 }}>{a.name}</Text></TouchableOpacity>))}
            </ScrollView>
            <TouchableOpacity onPress={() => setShowPicker(false)} style={[styles.closeBtn, { backgroundColor: colors.primary }]}><Text style={{ color: '#FFF', fontWeight: '800' }}>CERRAR</Text></TouchableOpacity>
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
  tabsRow: { flexDirection: 'row', borderRadius: 12, padding: 4 },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', borderRadius: 8, marginRight: 5 },
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
  listCard: { width: '100%', height: 'auto' },
  gridCard: { width: '48%', height: GRID_CARD_SIZE, justifyContent: 'center', padding: 5 }, 
  progCard: { borderRadius: 20, borderWidth: 1, marginBottom: 15, overflow: 'hidden' },
  progHeader: { flexDirection: 'row', padding: 20, alignItems: 'center' },
  gridHeader: { alignItems: 'center', justifyContent: 'center', flex: 1, padding: 10, gap: 5 },
  progName: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  
  chartWrapper: { padding: 20, borderTopWidth: 1, height: 260 },
  chartContainer: { flexDirection: 'row', height: 200 },
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
  athleteItem: { paddingVertical: 18, borderBottomWidth: 1 },
  closeBtn: { marginTop: 20, padding: 15, borderRadius: 12, alignItems: 'center' },
  emptyCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  feedbackCard: { padding: 20, borderRadius: 20, borderWidth: 1, marginBottom: 15 },

  timeFilterContainer: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 12, padding: 4, marginBottom: 20, marginHorizontal: 20 },
  timeFilterBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },

  bodyToggleContainer: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 12, padding: 4, marginBottom: 10, marginHorizontal: 40 },
  bodyToggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 30 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendColor: { width: 14, height: 14, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: '600' },
  topMusclesCard: { padding: 20, borderRadius: 20, borderWidth: 1 },
  topMuscleItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  mergeItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  mergeInput: { padding: 14, borderRadius: 10, borderWidth: 1, fontSize: 16, marginBottom: 15 },
  confirmMergeBtn: { padding: 16, borderRadius: 12, marginTop: 10 },
  
  dictBtn: { padding: 8, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8 },
  muscleTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  dictSelectBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1 }
});
