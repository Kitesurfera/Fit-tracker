import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Dimensions, Modal, TextInput, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
import { useAuth } from '../../src/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Body from 'react-native-body-highlighter';
import { LineChart } from 'react-native-chart-kit';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isDesktop = SCREEN_WIDTH > 768;
const MAX_CONTENT_WIDTH = 1200;

const TEST_TRANSLATIONS: Record<string, string> = {
  squat_rm: 'Sentadilla RM', bench_rm: 'Press Banca RM', deadlift_rm: 'Peso Muerto RM',
  cmj: 'Salto CMJ', sj: 'Salto SJ', dj: 'Drop Jump (DJ)', hamstring: 'Isquiotibiales',
  calf: 'Gemelos', quadriceps: 'Cuádriceps', tibialis: 'Tibial'
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

const getLocalDateStr = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const isTrainer = user?.role === 'trainer';

  const [activeTab, setActiveTab] = useState<'summary' | 'progress' | 'body' | 'feedback'>(params.tab === 'feedback' ? 'feedback' : 'summary');
  const [customExerciseMuscles, setCustomExerciseMuscles] = useState<Record<string, string[]>>({});
  const [mergeMap, setMergeMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [testHistory, setTestHistory] = useState<any[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<any>(null);
  
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [selectedTestKey, setSelectedTestKey] = useState<string | null>(null); 
  const [searchQuery, setSearchQuery] = useState('');
  
  // NUEVO: Estados para los filtros avanzados
  const [hideEmpty, setHideEmpty] = useState(true);
  const [filterCategory, setFilterCategory] = useState<'all' | 'ejercicio' | 'test'>('all');
  
  const [bodyTimeFilter, setBodyTimeFilter] = useState<1 | 7 | 14 | 30>(1);
  
  const [showDictModal, setShowDictModal] = useState(false);
  const [dictTargetExercise, setDictTargetExercise] = useState<string>('');
  const [dictSelectedMuscles, setDictSelectedMuscles] = useState<string[]>([]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTargetItem, setMergeTargetItem] = useState<any>(null);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('custom_exercise_muscles').then(res => { if (res) setCustomExerciseMuscles(JSON.parse(res)); });
      AsyncStorage.getItem('custom_merge_map').then(res => { if (res) setMergeMap(JSON.parse(res)); });
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
      setTestHistory(Array.isArray(ts) ? [...ts].sort((a,b) => b.date.localeCompare(a.date)) : []);
      setWorkoutHistory(Array.isArray(wk) ? wk : []);
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

  const getMusclesForExercise = useCallback((exerciseName: string) => {
    const normName = normalizeName(exerciseName);
    if (customExerciseMuscles[normName]) return customExerciseMuscles[normName];
    const musclesFound: string[] = [];
    for (const [muscle, keywords] of Object.entries(DEFAULT_MUSCLE_MAP)) {
      if (keywords.some(k => normName.includes(k))) musclesFound.push(muscle);
    }
    return musclesFound;
  }, [customExerciseMuscles]);

  const openDictModal = (exerciseName: string) => { setDictTargetExercise(exerciseName); setDictSelectedMuscles(getMusclesForExercise(exerciseName)); setShowDictModal(true); };
  const saveDictMuscles = async () => { const normKey = normalizeName(dictTargetExercise); const updatedMap = { ...customExerciseMuscles, [normKey]: dictSelectedMuscles }; setCustomExerciseMuscles(updatedMap); await AsyncStorage.setItem('custom_exercise_muscles', JSON.stringify(updatedMap)); setShowDictModal(false); };
  const toggleDictMuscle = (muscle: string) => { setDictSelectedMuscles(prev => prev.includes(muscle) ? prev.filter(m => m !== muscle) : [...prev, muscle]); };
  
  const toggleMerge = async (sourceId: string) => {
    if (!mergeTargetItem) return;
    setMergeMap(prevMap => {
      const newMap = { ...prevMap };
      if (newMap[sourceId] === mergeTargetItem.id) delete newMap[sourceId];
      else newMap[sourceId] = mergeTargetItem.id;
      AsyncStorage.setItem('custom_merge_map', JSON.stringify(newMap)).catch(console.error);
      return newMap;
    });
  };

  const heatMap = useMemo(() => {
     const heat: Record<string, number> = {};
     ALL_MUSCLES.forEach(m => heat[m] = 0);
     const now = new Date();
     const localTodayStr = getLocalDateStr(now);
     let limitDateStr = localTodayStr;
     if (bodyTimeFilter !== 1) {
       const limitDate = new Date(); limitDate.setDate(now.getDate() - bodyTimeFilter + 1); limitDateStr = getLocalDateStr(limitDate);
     }
     workoutHistory.forEach(w => {
       const isDateValid = bodyTimeFilter === 1 ? w.date === localTodayStr : (w.date >= limitDateStr && w.date <= localTodayStr);
       if (isDateValid) {
         const exercisesList = w.completed ? (w.completion_data?.exercise_results || []) : (w.exercises || w.routine || w.completion_data?.exercise_results || []);
         exercisesList.forEach((r: any) => {
           if (r.is_hiit_block && r.hiit_exercises) {
             r.hiit_exercises.forEach((he: any) => {
               const exName = he.name || he.exercise_name || he.exercise;
               if (exName) { const sets = parseInt(r.sets) || parseInt(he.sets) || 1; getMusclesForExercise(exName).forEach(m => { if (heat[m] !== undefined) heat[m] += sets; }); }
             });
           } else {
             const exName = r.name || r.exercise_name || r.exercise;
             if (exName) {
               let sets = 0;
               if (w.completed) sets = parseInt(r.completed_sets) || 1;
               else sets = parseInt(r.target_sets) || parseInt(r.sets) || parseInt(r.series) || 1;
               if (sets > 0) getMusclesForExercise(exName).forEach(m => { if (heat[m] !== undefined) heat[m] += sets; });
             }
           }
         });
       }
     });
     return heat;
  }, [workoutHistory, bodyTimeFilter, getMusclesForExercise]);

  const latestMeasurements = useMemo(() => {
    const measures: Record<string, any> = {};
    testHistory.forEach(test => { if (test.test_type === 'medicion') { if (!measures[test.test_name] || test.date >= measures[test.test_name].date) { measures[test.test_name] = test; } } });
    return measures;
  }, [testHistory]);

  const rawItems = useMemo(() => {
    const items: Record<string, any> = {};
    workoutHistory.forEach(w => {
      if (!w.completed) return; 
      w.completion_data?.exercise_results?.forEach((r: any) => {
        if (r.completed_sets > 0 && r.name) {
          const normKey = `ex_${normalizeName(r.name)}`;
          const val = parseFloat(String(r.logged_weight || '0').replace(',', '.')) || 0;
          if (!items[normKey]) items[normKey] = { id: normKey, name: r.name, history: [], maxW: 0, type: 'ejercicio', unit: 'kg' };
          if (val > items[normKey].maxW) items[normKey].maxW = val;
          items[normKey].history.push({ date: w.date, val });
        }
      });
    });
    testHistory.forEach(t => {
      if (t.test_type === 'medicion') return;
      const rawName = t.custom_name || TEST_TRANSLATIONS[t.test_name] || t.test_name;
      if (!rawName) return;
      const normKey = `test_${normalizeName(rawName)}`;
      const valL = parseFloat(t.value_left); const valR = parseFloat(t.value_right); const val = parseFloat(t.value);
      const hasSides = !isNaN(valL) && !isNaN(valR);
      const maxVal = hasSides ? Math.max(valL || 0, valR || 0) : (val || 0);
      if (!items[normKey]) { items[normKey] = { id: normKey, name: rawName, history: [], maxW: 0, type: 'test', unit: t.unit || 'kg', testDoc: t }; }
      if (maxVal > items[normKey].maxW) items[normKey].maxW = maxVal;
      items[normKey].history.push({ date: t.date, val: maxVal, valL: hasSides ? (valL || 0) : null, valR: hasSides ? (valR || 0) : null, isBilateral: hasSides });
    });
    return items;
  }, [workoutHistory, testHistory]);

  const cleanProgression = useMemo(() => {
    const itemsRecord = JSON.parse(JSON.stringify(rawItems));
    Object.entries(mergeMap).forEach(([sourceId, targetId]) => {
      let finalTarget = targetId; let iterations = 0;
      while (mergeMap[finalTarget] && iterations < 10) { finalTarget = mergeMap[finalTarget]; iterations++; }
      if (itemsRecord[sourceId] && itemsRecord[finalTarget] && sourceId !== finalTarget) {
        itemsRecord[finalTarget].history = [...itemsRecord[finalTarget].history, ...itemsRecord[sourceId].history];
        itemsRecord[finalTarget].maxW = Math.max(itemsRecord[finalTarget].maxW, itemsRecord[sourceId].maxW);
        itemsRecord[finalTarget].mergedSources = [...(itemsRecord[finalTarget].mergedSources || []), itemsRecord[sourceId].name];
        delete itemsRecord[sourceId];
      }
    });
    return Object.values(itemsRecord).sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [rawItems, mergeMap]);

  // NUEVA LÓGICA DE FILTRADO MULTIPLE
  const filteredProgression = useMemo(() => {
    let result = cleanProgression;
    
    // 1. Filtro de vacíos
    if (hideEmpty) {
      result = result.filter((item: any) => item.maxW > 0);
    }

    // 2. Filtro de Categoría (Fuerza vs Test)
    if (filterCategory !== 'all') {
      result = result.filter((item: any) => item.type === filterCategory);
    }
    
    // 3. Búsqueda de texto
    if (searchQuery) {
      result = result.filter((ex: any) => ex.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    
    return result;
  }, [cleanProgression, searchQuery, hideEmpty, filterCategory]);

  const renderPerformanceSummary = () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const limitDateStr = getLocalDateStr(thirtyDaysAgo);
    
    const recentWorkouts = workoutHistory.filter(w => w.completed && w.date >= limitDateStr);
    
    return (
      <View style={[styles.summaryBoard, { backgroundColor: colors.surfaceHighlight }]}>
        <View style={styles.summaryItem}>
          <Ionicons name="calendar-outline" size={24} color={colors.primary} />
          <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{recentWorkouts.length}</Text>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Entrenos (30d)</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Ionicons name="flame-outline" size={24} color="#EF4444" />
          <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{Object.keys(rawItems).length}</Text>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Ejercicios Trackeados</Text>
        </View>
      </View>
    );
  };

  const renderChart = (history: any[], unit: string) => {
    const data = [...history].sort((a, b) => a.date.localeCompare(b.date));
    if (data.length === 0) return null;
    
    const slicedData = data.slice(-8); 
    const labels = slicedData.map(d => d.date.split('-').slice(1).join('/'));
    const isBilateral = slicedData.some(d => d.isBilateral);
    
    let datasets = [];
    if (isBilateral) {
      datasets = [
        { data: slicedData.map(d => d.valL || 0), color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`, strokeWidth: 3 },
        { data: slicedData.map(d => d.valR || 0), color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})`, strokeWidth: 3 }
      ];
    } else {
      datasets = [
        { data: slicedData.map(d => d.val || 0), color: (opacity = 1) => colors.primary, strokeWidth: 3 }
      ];
    }

    const chartWidth = isDesktop ? (MAX_CONTENT_WIDTH / 2) - 80 : SCREEN_WIDTH - 80;

    const chartConfig = {
      backgroundGradientFrom: colors.surface,
      backgroundGradientTo: colors.surface,
      color: (opacity = 1) => colors.textSecondary,
      labelColor: (opacity = 1) => colors.textSecondary,
      strokeWidth: 2,
      barPercentage: 0.5,
      useShadowColorFromDataset: false,
      decimalPlaces: 1,
    };

    return (
      <View style={{ alignItems: 'center', marginTop: 10 }}>
        {isBilateral && (
          <View style={{ flexDirection: 'row', gap: 15, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B82F6' }}/><Text style={{ fontSize: 12, color: colors.textSecondary }}>Izquierda</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' }}/><Text style={{ fontSize: 12, color: colors.textSecondary }}>Derecha</Text></View>
          </View>
        )}
        <LineChart
          data={{ labels, datasets }}
          width={chartWidth}
          height={220}
          chartConfig={chartConfig}
          bezier
          style={{ borderRadius: 16 }}
          yAxisSuffix={` ${unit}`}
        />
      </View>
    );
  };

  const renderTestCard = (mergedItem: any, index: number) => { 
    const test = mergedItem.testDoc;
    const valL = test ? parseFloat(test.value_left) : NaN; 
    const valR = test ? parseFloat(test.value_right) : NaN;
    const hasSides = !isNaN(valL) && !isNaN(valR) && (valL !== 0 || valR !== 0);
    const isSelected = selectedTestKey === mergedItem.id;

    return (
      <View key={index} style={[styles.testCard, { backgroundColor: colors.surface, borderColor: colors.border, width: isDesktop ? '48%' : '100%' }]}>
        <TouchableOpacity onPress={() => setSelectedTestKey(isSelected ? null : mergedItem.id)} activeOpacity={0.7}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.testName, { color: colors.textPrimary }]}>{mergedItem.name}</Text>
                {mergedItem.mergedSources && mergedItem.mergedSources.length > 0 && (
                    <View style={{ backgroundColor: colors.warning + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginTop: 4 }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: colors.warning }}>FUSIONADO</Text>
                    </View>
                )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="trophy" size={16} color={colors.primary} />
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '900' }}>PR {mergedItem.maxW}</Text>
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', marginTop: 15, alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', flex: 1 }}>
              {hasSides ? (
                <>
                  <View style={{ flex: 1 }}><Text style={[styles.testValue, { color: '#3B82F6' }]}>{valL}</Text><Text style={styles.sideLabel}>IZQ</Text></View>
                  <View style={{ flex: 1 }}><Text style={[styles.testValue, { color: '#EF4444' }]}>{valR}</Text><Text style={styles.sideLabel}>DER</Text></View>
                </>
              ) : (
                <Text style={[styles.testValue, { color: colors.textPrimary }]}>{mergedItem.maxW} <Text style={{fontSize: 14, color: colors.textSecondary}}>{mergedItem.unit}</Text></Text>
              )}
            </View>
            <Ionicons name={isSelected ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
          </View>
          {test && <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 10 }}>Último registro: {test.date}</Text>}
        </TouchableOpacity>
        
        {isSelected && <View style={{ marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: colors.border }}>{renderChart(mergedItem.history, mergedItem.unit)}</View>}
      </View>
    );
  };

  const renderFeedbackTab = () => { 
    const feedbacks: any[] = [];
    workoutHistory.forEach(w => {
      if (!w.completed) return; 
      w.completion_data?.exercise_results?.forEach((ex: any) => { 
        if (ex.coach_note) feedbacks.push({ date: w.date, exercise: ex.name, note: ex.coach_note }); 
      });
    });
    return (
      <View>
        {feedbacks.length > 0 ? feedbacks.reverse().map((fb, i) => (
          <View key={i} style={[styles.feedbackCard, { backgroundColor: colors.surface, borderColor: colors.warning + '40' }]}>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{fb.date}</Text><Text style={{ color: colors.textPrimary, fontWeight: '800' }}>{fb.exercise}</Text><Text style={{ color: colors.textPrimary, fontStyle: 'italic' }}>"{fb.note}"</Text>
          </View>
        )) : <Text style={{color: colors.textSecondary, textAlign: 'center'}}>No hay correcciones del Coach.</Text>}
      </View>
    );
  };

  const renderMeasurementsCard = () => { 
    if (Object.keys(latestMeasurements).length === 0) return null;
    const displayNames: Record<string, string> = { weight: 'Peso', shoulders: 'Hombros', chest: 'Pecho', arm: 'Brazo', thigh: 'Muslo' };
    return (
      <View style={[styles.measurementsContainer, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 20 }]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary, textAlign: isDesktop ? 'left' : 'center', marginBottom: 15 }]}>Últimas Mediciones</Text>
        <View style={styles.measurementsGrid}>
          {Object.entries(displayNames).map(([key, label]) => {
            const m = latestMeasurements[key]; if (!m) return null;
            return (
              <View key={key} style={[styles.measureBadge, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={{ fontSize: 10, color: colors.textSecondary, fontWeight: '800', textTransform: 'uppercase' }}>{label}</Text>
                <Text style={{ fontSize: 18, color: colors.textPrimary, fontWeight: '900', marginTop: 2 }}>{m.value} <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSecondary }}>{m.unit}</Text></Text>
                <Text style={{ fontSize: 9, color: colors.textSecondary, marginTop: 4 }}>{m.date.split('-').reverse().join('/')}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderBodyMap = () => { 
    const totalSets = Object.values(heatMap).reduce((sum, val) => sum + val, 0);
    const sortedMuscles = Object.entries(heatMap).sort((a, b) => b[1] - a[1]);
    const bodyData: { slug: string; intensity: number }[] = [];
    const mapIntensity = (p: number) => { if (p === 0) return 0; if (p <= 20) return 1; if (p <= 40) return 2; if (p <= 50) return 3; return 4; };
    const addToBody = (muscle: string, slugs: string[]) => { const s = heatMap[muscle] || 0; if (s > 0) { const p = (s / totalSets) * 100; slugs.forEach(slug => bodyData.push({ slug, intensity: mapIntensity(p) })); } };

    addToBody('Pecho', ['chest']); addToBody('Espalda', ['trapezius', 'upper-back', 'lower-back']); addToBody('Cuádriceps', ['quadriceps']); addToBody('Isquiotibiales', ['hamstring']); addToBody('Glúteo', ['gluteal']); addToBody('Hombro', ['front-deltoids', 'back-deltoids']); addToBody('Bíceps', ['biceps']); addToBody('Tríceps', ['triceps']); addToBody('Core', ['abs', 'obliques']); addToBody('Gemelos', ['calves']); addToBody('Antebrazos', ['forearm']); addToBody('Aductores', ['adductor']); addToBody('Abductores', ['abductors']);

    if (isDesktop) {
      return (
        <View style={styles.bodyTabWrapper}>
          <View style={styles.timeFilterContainer}>
            {[ {l: 'Hoy', v: 1}, {l: '7D', v: 7}, {l: '14D', v: 14}, {l: '1 Mes', v: 30} ].map(f => (
              <TouchableOpacity key={f.v} style={[styles.timeBtn, bodyTimeFilter === f.v && {backgroundColor: colors.primary}]} onPress={() => setBodyTimeFilter(f.v as any)}>
                <Text style={{color: bodyTimeFilter === f.v ? '#FFF' : colors.textSecondary, fontWeight: '700'}}>{f.l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.desktopBodyLayout}>
            <View style={styles.silhouettesWrapper}>
              <View style={styles.bodyContainer}>
                <View style={styles.bodySide}><Text style={styles.bodySideLabel}>FRONTAL</Text><Body data={bodyData} gender="female" side="front" scale={1.4} colors={['#3B82F6', '#FBBF24', '#F97316', '#EF4444']} /></View>
                <View style={styles.bodySide}><Text style={styles.bodySideLabel}>DORSAL</Text><Body data={bodyData} gender="female" side="back" scale={1.4} colors={['#3B82F6', '#FBBF24', '#F97316', '#EF4444']} /></View>
              </View>
            </View>
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
                    <View key={m} style={styles.muscleRow}><Text style={{ color: colors.textPrimary, fontWeight: '500' }}>{m}</Text><View style={{ alignItems: 'flex-end' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>{p.toFixed(1)}%</Text><Text style={{ color: colors.textSecondary, fontSize: 10 }}>{s} series</Text></View></View>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={{ paddingBottom: 100 }}>
        <View style={styles.timeFilterContainerMobile}>
          {[ {l: 'Hoy', v: 1}, {l: '7D', v: 7}, {l: '14D', v: 14}, {l: '1 Mes', v: 30} ].map(f => (
            <TouchableOpacity key={f.v} style={[styles.timeBtnMobile, bodyTimeFilter === f.v && { backgroundColor: colors.primary }]} onPress={() => setBodyTimeFilter(f.v as any)}>
              <Text style={{ color: bodyTimeFilter === f.v ? '#FFF' : colors.textSecondary, fontWeight: '700', fontSize: 13 }}>{f.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.dualBodyContainerMobile}>
          <View style={styles.bodyWrapperMobile}><Text style={styles.bodySideLabelMobile}>FRONTAL</Text><Body data={bodyData} gender="female" side="front" scale={0.9} colors={['#3B82F6', '#FBBF24', '#F97316', '#EF4444']} /></View>
          <View style={styles.bodyWrapperMobile}><Text style={styles.bodySideLabelMobile}>DORSAL</Text><Body data={bodyData} gender="female" side="back" scale={0.9} colors={['#3B82F6', '#FBBF24', '#F97316', '#EF4444']} /></View>
        </View>
        <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 16, marginBottom: 15, textAlign: 'center' }}>Distribución de Carga</Text>
        <View style={styles.legendRowMobile}>
          <View style={styles.legendItemMobile}><View style={[styles.dotMobile, { backgroundColor: '#E2E8F0' }]} /><Text style={styles.legendTextMobile}>0%</Text></View>
          <View style={styles.legendItemMobile}><View style={[styles.dotMobile, { backgroundColor: '#3B82F6' }]} /><Text style={styles.legendTextMobile}>0-20%</Text></View>
          <View style={styles.legendItemMobile}><View style={[styles.dotMobile, { backgroundColor: '#FBBF24' }]} /><Text style={styles.legendTextMobile}>20-40%</Text></View>
          <View style={styles.legendItemMobile}><View style={[styles.dotMobile, { backgroundColor: '#F97316' }]} /><Text style={styles.legendTextMobile}>40-50%</Text></View>
          <View style={styles.legendItemMobile}><View style={[styles.dotMobile, { backgroundColor: '#EF4444' }]} /><Text style={styles.legendTextMobile}>50%+</Text></View>
        </View>
        <View style={[styles.topMusclesCardMobile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {sortedMuscles.map(([m, s], i) => {
            const p = totalSets > 0 ? ((s / totalSets) * 100) : 0;
            return (
              <View key={m} style={styles.topMuscleItemMobile}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ color: colors.textSecondary, width: 25, fontWeight: '800' }}>{i + 1}</Text><Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>{m}</Text></View>
                <View style={{ alignItems: 'flex-end' }}><Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '800' }}>{p.toFixed(1)}%</Text><Text style={{ color: colors.textSecondary, fontSize: 10 }}>{s} series</Text></View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.mainWrapper, isDesktop && styles.desktopWrapper]}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {isTrainer ? (selectedAthlete?.name || 'Cargando...') : 'Tus Analíticas'}
            </Text>
            {isTrainer && <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>Vista Entrenador</Text>}
          </View>
          <TouchableOpacity onPress={onRefresh} style={[styles.iconBtn, { backgroundColor: colors.surfaceHighlight }]}>
            {refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh" size={22} color={colors.primary} />}
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: isDesktop ? 25 : 20, marginBottom: 15 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={isDesktop ? styles.tabsContainerDesktop : styles.tabsContainerMobile}>
            {['summary', 'progress', 'body', 'feedback'].map(tab => (
              <TouchableOpacity key={tab} style={[styles.tabButton, activeTab === tab && { backgroundColor: colors.primary }]} onPress={() => setActiveTab(tab as any)}>
                <Text style={[styles.tabButtonText, { color: activeTab === tab ? '#FFF' : colors.textSecondary }]}>
                  {tab === 'summary' ? 'TESTS' : tab === 'progress' ? 'EVOLUCIÓN' : tab === 'body' ? 'CUERPO' : 'FEEDBACK'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ScrollView contentContainerStyle={{ padding: isDesktop ? 25 : 20 }}>
          {loading && !refreshing ? <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }}/> : 
           activeTab === 'summary' ? (
             <View>
               {renderPerformanceSummary()}
               {renderMeasurementsCard()}

               <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, marginTop: 10 }}>
                 <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary }}>Histórico de Tests</Text>
                 {isTrainer && (
                   <TouchableOpacity onPress={() => { setMergeTargetItem(null); setShowMergeModal(true); }}>
                     <Ionicons name="git-merge" size={22} color={colors.primary} />
                   </TouchableOpacity>
                 )}
               </View>

               <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 15 } : {}}>
                 {cleanProgression.filter((item: any) => item.type === 'test').map((item: any, i: number) => renderTestCard(item, i))}
               </View>
             </View>
           ) : 
           activeTab === 'progress' ? (
              <View>
                {/* BARRA DE BÚSQUEDA */}
                <View style={{ marginBottom: 15 }}>
                  <TextInput 
                    style={[styles.searchBar, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} 
                    placeholder="Buscar ejercicio o test..." 
                    placeholderTextColor={colors.textSecondary} 
                    value={searchQuery} 
                    onChangeText={setSearchQuery} 
                  />
                </View>

                {/* NUEVO: FILA DE CHIPS/FILTROS */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsContainer}>
                  {/* Chip de Ocultar Vacíos */}
                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      { borderColor: colors.border, backgroundColor: hideEmpty ? colors.primary + '20' : colors.surface }
                    ]}
                    onPress={() => setHideEmpty(!hideEmpty)}
                  >
                    <Ionicons name={hideEmpty ? "eye-off" : "eye"} size={14} color={hideEmpty ? colors.primary : colors.textSecondary} />
                    <Text style={[styles.filterChipText, { color: hideEmpty ? colors.primary : colors.textSecondary }]}>
                      {hideEmpty ? 'Ocultando 0kg' : 'Mostrando Todo'}
                    </Text>
                  </TouchableOpacity>
                  
                  {/* Divisor Visual */}
                  <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 4, marginVertical: 6 }} />

                  {/* Chips de Categoría */}
                  {['all', 'ejercicio', 'test'].map((cat) => {
                    const isActive = filterCategory === cat;
                    let label = 'Todos';
                    if (cat === 'ejercicio') label = 'Fuerza';
                    if (cat === 'test') label = 'Tests';

                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.filterChip,
                          { 
                            borderColor: isActive ? colors.primary : colors.border, 
                            backgroundColor: isActive ? colors.primary : colors.surface 
                          }
                        ]}
                        onPress={() => setFilterCategory(cat as any)}
                      >
                        <Text style={[
                          styles.filterChipText, 
                          { color: isActive ? '#FFF' : colors.textSecondary, fontWeight: isActive ? '800' : '600' }
                        ]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {filteredProgression.length === 0 ? (
                  <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 40, paddingHorizontal: 20 }}>
                    No hay datos que coincidan con tus filtros actuales.
                  </Text>
                ) : (
                  filteredProgression.map((item: any, i: number) => {
                    return (
                      <View key={item.id} style={[styles.progCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <TouchableOpacity onPress={() => setSelectedExercise(selectedExercise === item.id ? null : item.id)} style={styles.progHeader}>
                          <View style={{flex:1}}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <Text style={[styles.progName, {color: colors.textPrimary}]}>{item.name}</Text>
                              <View style={{ backgroundColor: item.type === 'test' ? colors.primary + '20' : '#E2E8F0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ fontSize: 9, fontWeight: '800', color: item.type === 'test' ? colors.primary : '#64748B' }}>
                                  {item.type.toUpperCase()}
                                </Text>
                              </View>
                              {item.mergedSources && item.mergedSources.length > 0 && (
                                <View style={{ backgroundColor: colors.warning + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                  <Text style={{ fontSize: 9, fontWeight: '800', color: colors.warning }}>FUSIONADO</Text>
                                </View>
                              )}
                            </View>
                            <Text style={{color: colors.primary, fontWeight:'700'}}>PR: {item.maxW} {item.unit}</Text>
                          </View>
                          
                          <View style={{ flexDirection: 'row', gap: 10 }}>
                            {item.type === 'ejercicio' && isTrainer && (
                              <TouchableOpacity style={{ padding: 5 }} onPress={(e) => { e.stopPropagation(); openDictModal(item.name); }}>
                                <Ionicons name="pricetags-outline" size={20} color={colors.textSecondary}/>
                              </TouchableOpacity>
                            )}
                          </View>

                        </TouchableOpacity>
                        {selectedExercise === item.id && (
                          <View style={{padding: 15, borderTopWidth: 1, borderTopColor: colors.border}}>
                            {renderChart(item.history, item.unit)}
                            {item.mergedSources && item.mergedSources.length > 0 && (
                              <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 10, fontStyle: 'italic' }}>
                                Incluye datos absorbidos de: {item.mergedSources.join(', ')}
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
           ) : activeTab === 'body' ? renderBodyMap() : renderFeedbackTab()}
        </ScrollView>
      </View>

      <Modal visible={showMergeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, maxHeight: '85%' }]}>
            {!mergeTargetItem ? (
              <>
                <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary, marginBottom: 5 }}>1. Test Principal</Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 20 }}>Selecciona el test o ejercicio de <Text style={{fontWeight: 'bold', color: colors.primary}}>destino</Text>:</Text>
                
                <ScrollView showsVerticalScrollIndicator={false}>
                  {Object.values(rawItems)
                    .sort((a: any, b: any) => a.name.localeCompare(b.name))
                    .map((item: any) => (
                      <TouchableOpacity 
                        key={item.id} 
                        style={[styles.dictSelectBtn, { borderColor: colors.border, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} 
                        onPress={() => setMergeTargetItem(item)}
                      >
                        <View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 15 }}>{item.name}</Text>
                            <Text style={{ fontSize: 9, color: colors.textSecondary, fontWeight: '700' }}>({item.type.toUpperCase()})</Text>
                          </View>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity style={{ marginTop: 20, alignItems: 'center', padding: 15 }} onPress={() => setShowMergeModal(false)}>
                  <Text style={{ color: colors.textSecondary, fontWeight: '800', fontSize: 16 }}>Cancelar</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary, marginBottom: 5 }}>2. Unificar con...</Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 20 }}>
                  Selecciona qué históricos sumar a <Text style={{fontWeight: 'bold', color: colors.primary}}>{mergeTargetItem.name}</Text>:
                </Text>
                
                <ScrollView showsVerticalScrollIndicator={false}>
                  {Object.values(rawItems)
                    .filter((rawItem: any) => rawItem.id !== mergeTargetItem.id)
                    .sort((a: any, b: any) => a.name.localeCompare(b.name))
                    .map((rawItem: any) => {
                      const isMergedIntoCurrent = mergeMap[rawItem.id] === mergeTargetItem.id;
                      
                      return (
                        <TouchableOpacity 
                          key={rawItem.id} 
                          style={[
                            styles.dictSelectBtn, 
                            { borderColor: colors.border, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, 
                            isMergedIntoCurrent && { backgroundColor: colors.primary + '15', borderColor: colors.primary }
                          ]} 
                          onPress={() => toggleMerge(rawItem.id)}
                        >
                          <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 15 }}>{rawItem.name}</Text>
                              <Text style={{ fontSize: 9, color: colors.textSecondary, fontWeight: '700' }}>({rawItem.type.toUpperCase()})</Text>
                            </View>
                            <Text style={{ fontSize: 12, color: colors.textSecondary }}>PR Actual: {rawItem.maxW} {rawItem.unit}</Text>
                          </View>
                          
                          {isMergedIntoCurrent ? (
                            <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                          ) : (
                            <Ionicons name="add-circle-outline" size={24} color={colors.textSecondary} />
                          )}
                        </TouchableOpacity>
                      );
                  })}
                </ScrollView>
                
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                  <TouchableOpacity style={{ flex: 1, padding: 15, alignItems: 'center' }} onPress={() => setMergeTargetItem(null)}>
                    <Text style={{ color: colors.textSecondary, fontWeight: '800', fontSize: 16 }}>Volver</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1, padding: 15, alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12 }} onPress={() => setShowMergeModal(false)}>
                    <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>Terminar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showDictModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 15 }}>Editar Diccionario: {dictTargetExercise}</Text>
            <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {ALL_MUSCLES.map(m => (
                <TouchableOpacity key={m} style={[styles.dictSelectBtn, { borderColor: colors.border, padding: 12 }, dictSelectedMuscles.includes(m) && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => toggleDictMuscle(m)}>
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
  summaryBoard: { flexDirection: 'row', borderRadius: 20, padding: 20, marginBottom: 20, alignItems: 'center', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center' },
  summaryValue: { fontSize: 24, fontWeight: '900', marginTop: 5 },
  summaryLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  summaryDivider: { width: 1, height: '80%', backgroundColor: 'rgba(0,0,0,0.1)' },
  container: { flex: 1 },
  mainWrapper: { flex: 1, width: '100%' },
  desktopWrapper: { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 24, fontWeight: '900' },
  iconBtn: { width: 45, height: 45, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  tabsContainerDesktop: { gap: 10, flex: 1 },
  tabsContainerMobile: { gap: 8, paddingRight: 20 },
  tabButton: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.05)', justifyContent: 'center' },
  tabButtonText: { fontSize: 11, fontWeight: '800' },
  mergeGlobalBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 15, borderRadius: 16, borderWidth: 1, marginBottom: 20, borderStyle: 'dashed' },
  bodyTabWrapper: { flex: 1 },
  timeFilterContainer: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 30 },
  timeBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.05)' },
  desktopBodyLayout: { flexDirection: 'row', gap: 30, alignItems: 'flex-start' },
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
  timeFilterContainerMobile: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 12, padding: 4, marginBottom: 15 },
  timeBtnMobile: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  dualBodyContainerMobile: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 25 },
  bodyWrapperMobile: { alignItems: 'center', flex: 1 },
  bodySideLabelMobile: { fontSize: 10, fontWeight: '900', color: '#888', marginBottom: 10 },
  legendRowMobile: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 25, justifyContent: 'center' },
  legendItemMobile: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dotMobile: { width: 12, height: 12, borderRadius: 3 },
  legendTextMobile: { fontSize: 10, fontWeight: '600', color: '#888' },
  topMusclesCardMobile: { padding: 15, borderRadius: 20, borderWidth: 1 },
  topMuscleItemMobile: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  measurementsContainer: { padding: 20, borderRadius: 20, borderWidth: 1, marginBottom: 20 },
  measurementsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  measureBadge: { flex: 1, minWidth: '45%', padding: 12, borderRadius: 14, borderWidth: 1 },
  testCard: { padding: 20, borderRadius: 20, borderWidth: 1, marginBottom: 15 },
  testName: { fontSize: 18, fontWeight: '800' },
  testValue: { fontSize: 26, fontWeight: '900' },
  sideLabel: { fontSize: 10, fontWeight: '900', color: '#888' },
  progCard: { borderRadius: 20, borderWidth: 1, marginBottom: 15, overflow: 'hidden' },
  progHeader: { flexDirection: 'row', padding: 18, alignItems: 'center' },
  progName: { fontSize: 16, fontWeight: '800' },
  searchBar: { padding: 14, borderRadius: 12, borderWidth: 1 },
  
  // NUEVO: Estilos para la fila de filtros
  filterChipsContainer: { flexDirection: 'row', gap: 8, marginBottom: 25, paddingBottom: 5 },
  filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, gap: 6 },
  filterChipText: { fontSize: 12, fontWeight: '600' },
  
  feedbackCard: { padding: 18, borderRadius: 20, borderWidth: 1, marginBottom: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { padding: 30, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  dictSelectBtn: { padding: 16, borderRadius: 12, borderWidth: 1 },
  confirmBtn: { padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 30 }
});
