import React, { useState, useEffect, useCallback } from 'react';
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
  
  // NUEVO ESTADO: Mapa de fusiones de ejercicios/tests
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
  const [bodyTimeFilter, setBodyTimeFilter] = useState<1 | 7 | 14 | 30>(14);
  
  const [showDictModal, setShowDictModal] = useState(false);
  const [dictTargetExercise, setDictTargetExercise] = useState<string>('');
  const [dictSelectedMuscles, setDictSelectedMuscles] = useState<string[]>([]);

  // ESTADOS DEL MODAL DE FUSIÓN
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTargetItem, setMergeTargetItem] = useState<any>(null);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('custom_exercise_muscles').then(res => {
        if (res) setCustomExerciseMuscles(JSON.parse(res));
      });
      AsyncStorage.getItem('custom_merge_map').then(res => {
        if (res) setMergeMap(JSON.parse(res));
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
      setTestHistory(Array.isArray(ts) ? ts.sort((a,b) => b.date.localeCompare(a.date)) : []);
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

  const saveDictMuscles = async () => {
    const normKey = normalizeName(dictTargetExercise);
    const updatedMap = { ...customExerciseMuscles, [normKey]: dictSelectedMuscles };
    setCustomExerciseMuscles(updatedMap);
    await AsyncStorage.setItem('custom_exercise_muscles', JSON.stringify(updatedMap));
    setShowDictModal(false);
  };

  const toggleDictMuscle = (muscle: string) => {
    setDictSelectedMuscles(prev => prev.includes(muscle) ? prev.filter(m => m !== muscle) : [...prev, muscle]);
  };

  const toggleMerge = async (sourceId: string) => {
    if (!mergeTargetItem) return;
    const newMap = { ...mergeMap };
    
    if (newMap[sourceId] === mergeTargetItem.id) {
        delete newMap[sourceId]; // Desvincular
    } else {
        newMap[sourceId] = mergeTargetItem.id; // Vincular
    }
    
    setMergeMap(newMap);
    await AsyncStorage.setItem('custom_merge_map', JSON.stringify(newMap));
  };

  const getMuscleHeat = () => { /* ... misma lógica intacta ... */
    const heat: Record<string, number> = { 'Pecho': 0, 'Espalda': 0, 'Cuádriceps': 0, 'Isquiotibiales': 0, 'Glúteo': 0, 'Hombro': 0, 'Bíceps': 0, 'Tríceps': 0, 'Core': 0, 'Gemelos': 0, 'Antebrazos': 0, 'Aductores': 0, 'Abductores': 0, 'Tibial': 0 };
    const limitDate = new Date();
    if (bodyTimeFilter === 1) limitDate.setHours(0, 0, 0, 0);
    else limitDate.setDate(limitDate.getDate() - bodyTimeFilter);
    const limitDateStr = limitDate.toISOString().split('T')[0];
    workoutHistory.forEach(w => {
      if (w.date >= limitDateStr) {
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

  const getLatestMeasurements = () => { /* ... misma lógica intacta ... */
    const measures: Record<string, any> = {};
    testHistory.forEach(test => {
      if (test.test_type === 'medicion') {
        if (!measures[test.test_name] || test.date >= measures[test.test_name].date) {
          measures[test.test_name] = test;
        }
      }
    });
    return measures;
  };

  const getPRUniqueTests = () => { /* ... misma lógica intacta ... */
    const prTests: Record<string, { testDoc: any; maxVal: number }> = {};
    testHistory.forEach(test => {
      if (test.test_type === 'medicion') return; 
      const key = test.test_name === 'custom' ? `custom_${test.custom_name}` : test.test_name;
      const currentVal = Math.max(parseFloat(test.value_left) || 0, parseFloat(test.value_right) || 0, parseFloat(test.value) || 0);
      if (!prTests[key] || currentVal > prTests[key].maxVal) { prTests[key] = { testDoc: test, maxVal: currentVal }; }
    });
    return Object.values(prTests).map(item => item.testDoc);
  };

  // --- OBTENCIÓN DE DATOS PUROS (SIN FUSIONAR) ---
  const getRawItems = () => {
    const items: Record<string, any> = {};

    workoutHistory.forEach(w => w.completion_data?.exercise_results?.forEach((r: any) => {
      if (r.completed_sets > 0 && r.name) {
        const normKey = `ex_${normalizeName(r.name)}`;
        const val = parseFloat(String(r.logged_weight || '0').replace(',', '.')) || 0;
        if (!items[normKey]) items[normKey] = { id: normKey, name: r.name, history: [], maxW: 0, type: 'ejercicio', unit: 'kg' };
        if (val > items[normKey].maxW) items[normKey].maxW = val;
        items[normKey].history.push({ date: w.date, val });
      }
    }));

    testHistory.forEach(t => {
      if (t.test_type === 'medicion') return;
      const rawName = t.custom_name || TEST_TRANSLATIONS[t.test_name] || t.test_name;
      if (!rawName) return;
      
      const normKey = `test_${normalizeName(rawName)}`;
      const valL = parseFloat(t.value_left) || 0;
      const valR = parseFloat(t.value_right) || 0;
      const val = parseFloat(t.value) || 0;
      const maxVal = Math.max(valL, valR, val);

      if (!items[normKey]) items[normKey] = { id: normKey, name: rawName, history: [], maxW: 0, type: 'test', unit: t.unit || 'kg' };
      if (maxVal > items[normKey].maxW) items[normKey].maxW = maxVal;
      items[normKey].history.push({ date: t.date, val: maxVal });
    });

    return items;
  };

  // --- OBTENCIÓN DE DATOS FUSIONADOS PARA LA VISTA ---
  const getCleanProgression = () => {
    const itemsRecord = getRawItems();

    // Aplicar las fusiones
    Object.entries(mergeMap).forEach(([sourceId, targetId]) => {
      if (itemsRecord[sourceId] && itemsRecord[targetId]) {
        // Mover historial al destino
        itemsRecord[targetId].history = [...itemsRecord[targetId].history, ...itemsRecord[sourceId].history];
        // Recalcular el PR (max weight/value)
        itemsRecord[targetId].maxW = Math.max(itemsRecord[targetId].maxW, itemsRecord[sourceId].maxW);
        // Etiquetar para la UI
        itemsRecord[targetId].mergedSources = [...(itemsRecord[targetId].mergedSources || []), itemsRecord[sourceId].name];
        // Eliminar el origen para que no salga duplicado
        delete itemsRecord[sourceId];
      }
    });

    return Object.values(itemsRecord).sort((a: any, b: any) => a.name.localeCompare(b.name));
  };

  const renderChart = (history: any[], unit: string) => {
    const data = [...history].sort((a, b) => a.date.localeCompare(b.date));
    if (data.length === 0) return null;
    
    const maxV = Math.max(...data.map(d => d.val));
    const minV = Math.min(...data.map(d => d.val));
    const range = maxV - minV === 0 ? 10 : maxV - minV;

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 15, alignItems: 'flex-end', height: 150, paddingHorizontal: 10 }}>
        {data.map((h, i) => {
          const heightPct = Math.max(((h.val - minV) / range) * 80 + 20, 10);
          return (
            <View key={i} style={{ alignItems: 'center', width: 45 }}>
              <View style={{ height: `${heightPct}%`, width: 14, backgroundColor: colors.primary, borderRadius: 6 }} />
              <Text style={{ fontSize: 10, color: colors.textPrimary, marginTop: 6, fontWeight: '800' }}>{h.val}</Text>
              <Text style={{ fontSize: 9, color: colors.textSecondary, marginTop: 2 }}>{h.date.split('-').slice(1).join('/')}</Text>
            </View>
          );
        })}
      </ScrollView>
    );
  };

  const renderTestChart = (testKey: string) => { /* ... intacta ... */
    const history = testHistory.filter(t => (t.test_name === 'custom' ? `custom_${t.custom_name}` : t.test_name) === testKey);
    const data = history.map(t => ({ date: t.date, val: Math.max(parseFloat(t.value_left) || 0, parseFloat(t.value_right) || 0, parseFloat(t.value) || 0) }));
    return renderChart(data, history[0]?.unit || 'kg');
  };

  const renderTestCard = (test: any, index: number) => { /* ... intacta ... */
    const valL = parseFloat(test.value_left); const valR = parseFloat(test.value_right);
    const hasSides = !isNaN(valL) && !isNaN(valR) && (valL !== 0 || valR !== 0);
    const testKey = test.test_name === 'custom' ? `custom_${test.custom_name}` : test.test_name;
    const isSelected = selectedTestKey === testKey;

    return (
      <View key={index} style={[styles.testCard, { backgroundColor: colors.surface, borderColor: colors.border, width: isDesktop ? '48%' : '100%' }]}>
        <TouchableOpacity onPress={() => setSelectedTestKey(isSelected ? null : testKey)} activeOpacity={0.7}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[styles.testName, { color: colors.textPrimary, flex: 1 }]}>{test.custom_name || TEST_TRANSLATIONS[test.test_name] || test.test_name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="trophy" size={16} color={colors.primary} /><Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700' }}>PR</Text></View>
          </View>
          <View style={{ flexDirection: 'row', marginTop: 15, alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', flex: 1 }}>
              {hasSides ? (
                <>
                  <View style={{ flex: 1 }}><Text style={[styles.testValue, { color: '#3B82F6' }]}>{valL}</Text><Text style={styles.sideLabel}>IZQ</Text></View>
                  <View style={{ flex: 1 }}><Text style={[styles.testValue, { color: '#EF4444' }]}>{valR}</Text><Text style={styles.sideLabel}>DER</Text></View>
                </>
              ) : (
                <Text style={[styles.testValue, { color: colors.textPrimary }]}>{test.value} <Text style={{fontSize: 14, color: colors.textSecondary}}>{test.unit}</Text></Text>
              )}
            </View>
            <Ionicons name={isSelected ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
          </View>
          <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 10 }}>Logrado el {test.date}</Text>
        </TouchableOpacity>
        {isSelected && <View style={{ marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: colors.border }}>{renderTestChart(testKey)}</View>}
      </View>
    );
  };

  const renderFeedbackTab = () => { /* ... intacta ... */
    const feedbacks: any[] = [];
    workoutHistory.forEach(w => w.completion_data?.exercise_results?.forEach((ex: any) => { if (ex.coach_note) feedbacks.push({ date: w.date, exercise: ex.name, note: ex.coach_note }); }));
    return (
      <View>
        {feedbacks.length > 0 ? feedbacks.reverse().map((fb, i) => (
          <View key={i} style={[styles.feedbackCard, { backgroundColor: colors.surface, borderColor: colors.warning + '40' }]}>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{fb.date}</Text><Text style={{ color: colors.textPrimary, fontWeight: '800' }}>{fb.exercise}</Text><Text style={{ color: colors.textPrimary, fontStyle: 'italic' }}>"{fb.note}"</Text>
          </View>
        )) : <Text style={{color: colors.textSecondary, textAlign: 'center'}}>No hay correcciones.</Text>}
      </View>
    );
  };

  const renderMeasurementsCard = () => { /* ... intacta ... */
    const measures = getLatestMeasurements();
    if (Object.keys(measures).length === 0) return null;
    const displayNames: Record<string, string> = { weight: 'Peso', shoulders: 'Hombros', chest: 'Pecho', arm: 'Brazo', thigh: 'Muslo' };
    return (
      <View style={[styles.measurementsContainer, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 20 }]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary, textAlign: isDesktop ? 'left' : 'center', marginBottom: 15 }]}>Últimas Mediciones</Text>
        <View style={styles.measurementsGrid}>
          {Object.entries(displayNames).map(([key, label]) => {
            const m = measures[key]; if (!m) return null;
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

  const renderBodyMap = () => { /* ... intacta ... */
    const heat = getMuscleHeat();
    const totalSets = Object.values(heat).reduce((sum, val) => sum + val, 0);
    const sortedMuscles = Object.entries(heat).sort((a, b) => b[1] - a[1]);
    const bodyData: { slug: string; intensity: number }[] = [];
    const mapIntensity = (p: number) => { if (p === 0) return 0; if (p <= 20) return 1; if (p <= 40) return 2; if (p <= 50) return 3; return 4; };
    const addToBody = (muscle: string, slugs: string[]) => { const s = heat[muscle] || 0; if (s > 0) { const p = (s / totalSets) * 100; slugs.forEach(slug => bodyData.push({ slug, intensity: mapIntensity(p) })); } };

    addToBody('Pecho', ['chest']); addToBody('Espalda', ['trapezius', 'upper-back', 'lower-back']); addToBody('Cuádriceps', ['quadriceps']); addToBody('Isquiotibiales', ['hamstring']); addToBody('Glúteo', ['gluteal']); addToBody('Hombro', ['front-deltoids', 'back-deltoids']); addToBody('Bíceps', ['biceps']); addToBody('Tríceps', ['triceps']); addToBody('Core', ['abs', 'obliques']); addToBody('Gemelos', ['calves']); addToBody('Antebrazos', ['forearm']); addToBody('Aductores', ['adductor']); addToBody('Abductores', ['abductors']);

    if (isDesktop) {
      return (
        <View style={styles.bodyTabWrapper}>
          {renderMeasurementsCard()}
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
        {renderMeasurementsCard()}
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
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{isTrainer ? (selectedAthlete?.name || 'Cargando...') : 'Analíticas'}</Text>
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
             <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 15 } : {}}>
               {getPRUniqueTests().map(renderTestCard)}
             </View>
           ) : 
           activeTab === 'progress' ? (
              <View>
                <TextInput 
                  style={[styles.searchBar, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} 
                  placeholder="Buscar ejercicio o test..." 
                  placeholderTextColor={colors.textSecondary} 
                  value={searchQuery} 
                  onChangeText={setSearchQuery} 
                />
                {getCleanProgression().filter(ex => ex.name.toLowerCase().includes(searchQuery.toLowerCase())).map((item, i) => {
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
                          {/* BOTÓN UNIFICAR */}
                          <TouchableOpacity 
                            style={{ padding: 5 }} 
                            onPress={(e) => { e.stopPropagation(); setMergeTargetItem(item); setShowMergeModal(true); }}
                          >
                            <Ionicons name="git-merge-outline" size={20} color={colors.primary}/>
                          </TouchableOpacity>

                          {item.type === 'ejercicio' && (
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
                })}
              </View>
           ) : activeTab === 'body' ? renderBodyMap() : renderFeedbackTab()}
        </ScrollView>
      </View>

      {/* MODAL FUSIÓN DE DATOS */}
      <Modal visible={showMergeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, maxHeight: '80%' }]}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary, marginBottom: 5 }}>Unificar Datos</Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 20 }}>
              Selecciona qué históricos quieres absorber y sumar a la gráfica de <Text style={{fontWeight: 'bold', color: colors.primary}}>{mergeTargetItem?.name}</Text>.
            </Text>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              {Object.values(getRawItems())
                .filter(rawItem => rawItem.id !== mergeTargetItem?.id)
                .sort((a: any, b: any) => a.name.localeCompare(b.name))
                .map((rawItem: any) => {
                  const isMergedIntoCurrent = mergeMap[rawItem.id] === mergeTargetItem?.id;
                  
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
            
            <TouchableOpacity style={{ marginTop: 20, alignItems: 'center', padding: 15 }} onPress={() => setShowMergeModal(false)}>
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 16 }}>LISTO</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL DICCIONARIO */}
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
  searchBar: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  feedbackCard: { padding: 18, borderRadius: 20, borderWidth: 1, marginBottom: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { padding: 30, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  dictSelectBtn: { padding: 16, borderRadius: 12, borderWidth: 1 },
  confirmBtn: { padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 30 }
});
