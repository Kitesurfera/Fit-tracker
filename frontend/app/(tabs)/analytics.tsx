import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Modal, TextInput, Platform,
  KeyboardAvoidingView, Alert, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
import { useAuth } from '../../src/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart } from 'react-native-chart-kit';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const MAX_CONTENT_WIDTH = 1200;

// Mapa de iconos dinámico para deportes
const SPORT_ICON_MAP: Record<string, {icon: any, lib: string}> = {
  'kite': { icon: 'kitesurfing', lib: 'MaterialCommunityIcons' },
  'football': { icon: 'football', lib: 'Ionicons' },
  'volleyball': { icon: 'volleyball', lib: 'MaterialCommunityIcons' },
  'tennis': { icon: 'tennisball', lib: 'Ionicons' },
  'gym': { icon: 'barbell', lib: 'Ionicons' },
  'surf': { icon: 'surfing', lib: 'MaterialCommunityIcons' },
  'bike': { icon: 'bicycle', lib: 'Ionicons' },
};

const TEST_TRANSLATIONS: Record<string, string> = {
  squat_rm: 'Sentadilla RM', bench_rm: 'Press Banca RM', deadlift_rm: 'Peso Muerto RM',
  cmj: 'Salto CMJ', sj: 'Salto SJ', dj: 'Drop Jump (DJ)', hamstring: 'Isquiotibiales',
  calf: 'Gemelos', quadriceps: 'Cuádriceps', tibialis: 'Tibial'
};

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
  
  // Responsive hooks
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const isDesktop = SCREEN_WIDTH > 768;

  const [activeTab, setActiveTab] = useState<'summary' | 'progress' | 'workload' | 'feedback'>(params.tab === 'feedback' ? 'feedback' : 'summary');
  const [mergeMap, setMergeMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  
  const [testHistory, setTestHistory] = useState<any[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  const [wellnessHistory, setWellnessHistory] = useState<any[]>([]);
  
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<any>(null);
  
  const [showPicker, setShowPicker] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [selectedTestKey, setSelectedTestKey] = useState<string | null>(null); 
  const [searchQuery, setSearchQuery] = useState('');
  
  const [hideEmpty, setHideEmpty] = useState(true);
  const [filterCategory, setFilterCategory] = useState<'all' | 'ejercicio' | 'test'>('all');
  
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTargetItem, setMergeTargetItem] = useState<any>(null);

  useFocusEffect(
    useCallback(() => {
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
      const [ts, wk, wl] = await Promise.all([
        api.getTests({ athlete_id: athleteId }).catch(() => []),
        api.getWorkouts({ athlete_id: athleteId }).catch(() => []),
        api.getWellnessHistory(athleteId).catch(() => [])
      ]);
      setTestHistory(Array.isArray(ts) ? [...ts].sort((a,b) => b.date.localeCompare(a.date)) : []);
      setWorkoutHistory(Array.isArray(wk) ? wk : []);
      setWellnessHistory(Array.isArray(wl) ? wl : (wl?.data || []));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSelectAthlete = (athlete: any) => {
    setSelectedAthlete(athlete);
    loadAthleteData(athlete.id);
  };

  const onRefresh = async () => { 
    setRefreshing(true); 
    if (isTrainer) {
      const aths = await api.getAthletes().catch(() => []);
      setAthletes(aths);
      if (selectedAthlete) {
        const updated = aths.find((a: any) => a.id === selectedAthlete.id);
        if (updated) setSelectedAthlete(updated);
      }
    }
    loadAthleteData(isTrainer ? selectedAthlete?.id : user?.id); 
  };

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

  const filteredProgression = useMemo(() => {
    let result = cleanProgression;
    if (hideEmpty) result = result.filter((item: any) => item.maxW > 0);
    if (filterCategory !== 'all') result = result.filter((item: any) => item.type === filterCategory);
    if (searchQuery) result = result.filter((ex: any) => ex.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return result;
  }, [cleanProgression, searchQuery, hideEmpty, filterCategory]);

  const recentWorkoutsCount = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const limitDateStr = getLocalDateStr(thirtyDaysAgo);
    return workoutHistory.filter(w => w.completed && w.date >= limitDateStr).length;
  }, [workoutHistory]);

  const workloadData = useMemo(() => {
    const daysToMap = 14;
    const labels: string[] = [];
    const fatigueData: number[] = [];
    const sorenessData: number[] = [];

    for (let i = daysToMap - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateStr(d);
      
      labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
      const well = wellnessHistory.find(w => w.date === dateStr);
      fatigueData.push(well ? well.fatigue || 0 : 0);
      sorenessData.push(well ? well.soreness || well.muscle_soreness || 0 : 0);
    }
    return { labels, fatigueData, sorenessData };
  }, [wellnessHistory]);

  const exportToPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const athleteName = selectedAthlete?.name || user?.name || 'Deportista';
      
      const topPRs = cleanProgression
        .filter((item: any) => item.maxW > 0)
        .sort((a: any, b: any) => b.maxW - a.maxW)
        .slice(0, 5)
        .map((item: any) => `${item.name}: ${item.maxW}${item.unit}`);

      let aiAnalysis = {
        workload_analysis: "Datos insuficientes para análisis.",
        progress_analysis: "Sigue registrando entrenamientos para ver tu evolución.",
        recommendations: ["Mantén la constancia.", "Registra tu fatiga diariamente."]
      };
      
      try {
        if (api.analyzeAnalytics) {
            aiAnalysis = await api.analyzeAnalytics({
                athlete_name: athleteName,
                fatigue_data: workloadData.fatigueData,
                soreness_data: workloadData.sorenessData,
                recent_workouts_count: recentWorkoutsCount,
                recent_prs: topPRs
            });
        }
      } catch (e) { console.log("Aviso: Error generando IA, usando template base."); }

      const htmlContent = `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b; background-color: #f8fafc; }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #3b82f6; padding-bottom: 20px; }
            h1 { font-size: 32px; font-weight: 900; margin: 0; color: #0f172a; text-transform: uppercase; letter-spacing: -1px; }
            .subtitle { color: #64748b; font-size: 16px; margin-top: 5px; }
            
            .section { background: #fff; padding: 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); margin-bottom: 30px; }
            h2 { font-size: 20px; font-weight: 800; color: #3b82f6; margin-top: 0; margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }
            
            .stats-grid { display: flex; gap: 15px; margin-bottom: 20px; }
            .stat-box { flex: 1; background: #f1f5f9; padding: 15px; border-radius: 12px; text-align: center; }
            .stat-value { font-size: 28px; font-weight: 900; color: #0f172a; }
            .stat-label { font-size: 12px; color: #64748b; font-weight: 700; text-transform: uppercase; }

            .text-content { font-size: 15px; line-height: 1.6; color: #334155; }
            .recommendation-list { margin: 0; padding-left: 20px; }
            .recommendation-list li { margin-bottom: 8px; }

            .chart-container { width: 100%; height: 300px; position: relative; margin-top: 20px; }
            
            .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #94a3b8; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Rendimiento Técnico</h1>
            <div class="subtitle">Reporte de Inteligencia Deportiva: ${athleteName} • ${getLocalDateStr(new Date())}</div>
          </div>

          <div class="section">
            <h2>Resumen General</h2>
            <div class="stats-grid">
              <div class="stat-box">
                <div class="stat-value">${recentWorkoutsCount}</div>
                <div class="stat-label">Sesiones (30d)</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${topPRs.length}</div>
                <div class="stat-label">Récords Activos</div>
              </div>
            </div>
            <div class="text-content">
              <strong>Análisis de Evolución:</strong><br/>
              ${aiAnalysis.progress_analysis}
            </div>
          </div>

          <div class="section">
            <h2>Carga, Fatiga y Recuperación (Últimos 14 días)</h2>
            <div class="text-content" style="margin-bottom: 15px;">
              <strong>Estado Actual del SNC:</strong><br/>
              ${aiAnalysis.workload_analysis}
            </div>
            
            <div class="chart-container">
              <canvas id="workloadChart"></canvas>
            </div>
          </div>

          <div class="section">
            <h2>Recomendaciones Técnicas del Coach IA</h2>
            <div class="text-content">
              <ul class="recommendation-list">
                ${aiAnalysis.recommendations.map((r: string) => `<li>${r}</li>`).join('')}
              </ul>
            </div>
          </div>
          
          ${topPRs.length > 0 ? `
          <div class="section">
            <h2>Top Récords Personales</h2>
            <div class="text-content">
              <ul class="recommendation-list">
                ${topPRs.map((pr: string) => `<li><strong>${pr.split(':')[0]}</strong>: ${pr.split(':')[1]}</li>`).join('')}
              </ul>
            </div>
          </div>
          ` : ''}

          <div class="footer">
            Generado automáticamente por Fit Tracker App.
          </div>

          <script>
            const ctx = document.getElementById('workloadChart').getContext('2d');
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ${JSON.stringify(workloadData.labels)},
                    datasets: [
                        {
                            label: 'Fatiga General',
                            data: ${JSON.stringify(workloadData.fatigueData)},
                            borderColor: '#EF4444',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            borderWidth: 3,
                            tension: 0.4,
                            fill: true
                        },
                        {
                            label: 'Agujetas / Dolor',
                            data: ${JSON.stringify(workloadData.sorenessData)},
                            borderColor: '#F59E0B',
                            backgroundColor: 'transparent',
                            borderWidth: 3,
                            borderDash: [5, 5],
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, max: 5, ticks: { stepSize: 1 } }
                    },
                    plugins: {
                        legend: { position: 'bottom' }
                    },
                    animation: { duration: 0 } 
                }
            });
          </script>
        </body>
      </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      
      if (Platform.OS === 'web') {
         const link = document.createElement('a');
         link.href = uri;
         link.download = `Reporte_${athleteName.replace(/\s+/g, '_')}.pdf`;
         link.click();
      } else {
         await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      }

    } catch (e: any) {
      Alert.alert("Error", "No se pudo generar el documento PDF: " + e.message);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const renderPerformanceSummary = () => {
    return (
      <View style={[styles.summaryBoard, { backgroundColor: colors.surfaceHighlight }]}>
        <View style={styles.summaryItem}>
          <Ionicons name="calendar-outline" size={24} color={colors.primary} />
          <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{recentWorkoutsCount}</Text>
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

  const renderMeasurementsCard = () => {
    const measurementKeys = Object.keys(latestMeasurements);
    if (measurementKeys.length === 0) return null;
    return (
      <View style={[styles.measurementsContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Últimas Mediciones</Text>
        <View style={styles.measurementsGrid}>
          {measurementKeys.map(key => {
            const m = latestMeasurements[key];
            return (
              <View key={key} style={[styles.measureBadge, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4, fontWeight: '700' }}>{m.custom_name || m.test_name}</Text>
                <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>{m.value} <Text style={{fontSize: 12, color: colors.textSecondary}}>{m.unit}</Text></Text>
                <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 4 }}>{m.date}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderWorkloadDashboard = () => {
    const targetAthlete = selectedAthlete || user;
    const waterSessions = targetAthlete?.technical_sessions || [];
    
    const sportIconKey = targetAthlete?.sport_icon || 'kite';
    const sportInfo = SPORT_ICON_MAP[sportIconKey] || SPORT_ICON_MAP['kite'];

    const { labels, fatigueData, sorenessData } = workloadData;
    
    const activityGrid: { date: string, gym: boolean, water: boolean }[] = [];
    const daysToMap = 14;
    for (let i = daysToMap - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); const dateStr = getLocalDateStr(d);
      const hasGym = workoutHistory.some(w => w.date === dateStr && w.completed);
      const hasWater = waterSessions.includes(dateStr);
      activityGrid.push({ date: dateStr, gym: hasGym, water: hasWater });
    }

    const chartWidth = Math.min(SCREEN_WIDTH - 60, MAX_CONTENT_WIDTH - 80);

    return (
      <View style={{ marginBottom: 30 }}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary, marginBottom: 5 }]}>Estrés Físico y Técnica</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 20 }}>Cruza tus niveles de dolor y fatiga con tus sesiones de gimnasio y específicas de los últimos 14 días.</Text>

        <View style={[styles.testCard, { backgroundColor: colors.surface, borderColor: colors.border, padding: 20 }]}>
          <View style={{ flexDirection: 'row', gap: 15, marginBottom: 15, justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' }}/><Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700' }}>Fatiga General</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#F59E0B' }}/><Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700' }}>Agujetas / Dolor</Text></View>
          </View>
          
          <LineChart
            data={{
              labels,
              datasets: [
                { data: fatigueData, color: () => '#EF4444', strokeWidth: 3 },
                { data: sorenessData, color: () => '#F59E0B', strokeWidth: 3 }
              ]
            }}
            width={chartWidth}
            height={200}
            fromZero
            yAxisInterval={1}
            chartConfig={{
              backgroundColor: colors.surface, backgroundGradientFrom: colors.surface, backgroundGradientTo: colors.surface,
              decimalPlaces: 0, color: (opacity = 1) => colors.border, labelColor: () => colors.textSecondary,
              propsForDots: { r: "4", strokeWidth: "2", stroke: colors.surface }
            }}
            bezier
            style={{ borderRadius: 16, marginVertical: 8, alignSelf: 'center' }}
          />

          <View style={{ marginTop: 20, paddingTop: 15, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textSecondary, marginBottom: 15, textAlign: 'center', letterSpacing: 1 }}>REGISTRO DE SESIONES</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{flexGrow: 1, justifyContent: 'center'}}>
               <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 10, alignItems: 'center' }}>
                 {activityGrid.map((day, i) => (
                   <View key={i} style={{ alignItems: 'center', width: Math.max(30, (chartWidth - 60) / 14) }}>
                      <Text style={{ fontSize: 10, color: colors.textSecondary, marginBottom: 8 }}>{labels[i]}</Text>
                      <View style={{ height: 28, justifyContent: 'center' }}>
                        {day.gym ? <Ionicons name="barbell" size={18} color={colors.primary} /> : <Text style={{ color: colors.border }}>-</Text>}
                      </View>
                      <View style={{ height: 28, justifyContent: 'center' }}>
                        {day.water ? (
                           sportInfo.lib === 'Ionicons' ? (
                             <Ionicons name={sportInfo.icon as any} size={20} color="#0EA5E9" />
                           ) : (
                             <MaterialCommunityIcons name={sportInfo.icon as any} size={20} color="#0EA5E9" />
                           )
                        ) : <Text style={{ color: colors.border }}>-</Text>}
                      </View>
                   </View>
                 ))}
               </View>
            </ScrollView>
          </View>
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
    let datasets = isBilateral ? [
      { data: slicedData.map(d => d.valL || 0), color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`, strokeWidth: 3 },
      { data: slicedData.map(d => d.valR || 0), color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})`, strokeWidth: 3 }
    ] : [
      { data: slicedData.map(d => d.val || 0), color: (opacity = 1) => colors.primary, strokeWidth: 3 }
    ];
    
    const containerWidth = isDesktop ? Math.min(SCREEN_WIDTH, MAX_CONTENT_WIDTH) / 2 : SCREEN_WIDTH;
    const chartWidth = containerWidth - 90;

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
          width={chartWidth} height={220}
          chartConfig={{ backgroundGradientFrom: colors.surface, backgroundGradientTo: colors.surface, color: (opacity = 1) => colors.textSecondary, labelColor: (opacity = 1) => colors.textSecondary, decimalPlaces: 1 }}
          bezier style={{ borderRadius: 16 }} yAxisSuffix={` ${unit}`}
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
              <Ionicons name="trophy" size={16} color={colors.primary} /><Text style={{ fontSize: 12, color: colors.primary, fontWeight: '900' }}>PR {mergedItem.maxW}</Text>
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

  const renderFeedback = () => {
    return workoutHistory
      .filter(w => w.completed && w.completion_data?.exercise_results?.some((ex: any) => ex.coach_note))
      .map((w, i) => w.completion_data.exercise_results
        .filter((ex: any) => ex.coach_note)
        .map((ex: any, j: number) => (
          <View key={`${i}-${j}`} style={[styles.feedbackCard, { backgroundColor: colors.surface, borderColor: colors.warning + '40' }]}>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{w.date}</Text>
            <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>{ex.name}</Text>
            <Text style={{ color: colors.textPrimary, fontStyle: 'italic' }}>"{ex.coach_note}"</Text>
          </View>
        ))
      );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.mainWrapper, isDesktop && styles.desktopWrapper]}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{isTrainer ? (selectedAthlete?.name || 'Cargando...') : 'Tus Analíticas'}</Text>
              {isTrainer && <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>Vista Entrenador</Text>}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {isTrainer && <TouchableOpacity onPress={() => setShowPicker(true)} style={[styles.iconBtn, { backgroundColor: colors.surfaceHighlight }]}><Ionicons name="people" size={22} color={colors.primary} /></TouchableOpacity>}
              <TouchableOpacity onPress={exportToPDF} disabled={isGeneratingPDF} style={[styles.iconBtn, { backgroundColor: colors.surfaceHighlight }]}>
                {isGeneratingPDF ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="document-text" size={22} color={colors.primary} />}
              </TouchableOpacity>
              <TouchableOpacity onPress={onRefresh} style={[styles.iconBtn, { backgroundColor: colors.surfaceHighlight }]}>{refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh" size={22} color={colors.primary} />}</TouchableOpacity>
            </View>
          </View>

          <View style={{ paddingHorizontal: isDesktop ? 25 : 20, marginBottom: 15 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={isDesktop ? styles.tabsContainerDesktop : styles.tabsContainerMobile}>
              {['summary', 'progress', 'workload', 'feedback'].map(tab => (
                <TouchableOpacity key={tab} style={[styles.tabButton, activeTab === tab && { backgroundColor: colors.primary }]} onPress={() => setActiveTab(tab as any)}>
                  <Text style={[styles.tabButtonText, { color: activeTab === tab ? '#FFF' : colors.textSecondary }]}>
                    {tab === 'summary' ? 'TESTS' : tab === 'progress' ? 'EVOLUCIÓN' : tab === 'workload' ? 'CARGA Y FATIGA' : 'FEEDBACK'}
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
                 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, marginTop: 10 }}><Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary }}>Histórico de Tests</Text>{isTrainer && <TouchableOpacity onPress={() => { setMergeTargetItem(null); setShowMergeModal(true); }}><Ionicons name="git-merge" size={22} color={colors.primary} /></TouchableOpacity>}</View>
                 <View style={{ flexDirection: isDesktop ? 'row' : 'column', flexWrap: 'wrap', gap: 15, justifyContent: 'space-between' }}>
                    {cleanProgression.filter((item: any) => item.type === 'test').map((item: any, i: number) => renderTestCard(item, i))}
                 </View>
               </View>
             ) : activeTab === 'progress' ? (
                <View>
                  <View style={{ marginBottom: 15 }}><TextInput style={[styles.searchBar, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} placeholder="Buscar ejercicio o test..." placeholderTextColor={colors.textSecondary} value={searchQuery} onChangeText={setSearchQuery} /></View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsContainer}>
                    <TouchableOpacity style={[styles.filterChip, { borderColor: colors.border, backgroundColor: hideEmpty ? colors.primary + '20' : colors.surface }]} onPress={() => setHideEmpty(!hideEmpty)}><Ionicons name={hideEmpty ? "eye-off" : "eye"} size={14} color={hideEmpty ? colors.primary : colors.textSecondary} /><Text style={[styles.filterChipText, { color: hideEmpty ? colors.primary : colors.textSecondary }]}>{hideEmpty ? 'Ocultando 0kg' : 'Mostrando Todo'}</Text></TouchableOpacity>
                    <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 4, marginVertical: 6 }} />
                    {['all', 'ejercicio', 'test'].map((cat) => (
                      <TouchableOpacity key={cat} style={[styles.filterChip, { borderColor: filterCategory === cat ? colors.primary : colors.border, backgroundColor: filterCategory === cat ? colors.primary : colors.surface }]} onPress={() => setFilterCategory(cat as any)}><Text style={[styles.filterChipText, { color: filterCategory === cat ? '#FFF' : colors.textSecondary, fontWeight: filterCategory === cat ? '800' : '600' }]}>{cat === 'all' ? 'Todos' : cat === 'ejercicio' ? 'Fuerza' : 'Tests'}</Text></TouchableOpacity>
                    ))}
                  </ScrollView>
                  {filteredProgression.map((item: any) => (
                    <View key={item.id} style={[styles.progCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <TouchableOpacity onPress={() => setSelectedExercise(selectedExercise === item.id ? null : item.id)} style={styles.progHeader}>
                        <View style={{flex:1}}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}><Text style={[styles.progName, {color: colors.textPrimary}]}>{item.name}</Text><View style={{ backgroundColor: item.type === 'test' ? colors.primary + '20' : '#E2E8F0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 9, fontWeight: '800', color: item.type === 'test' ? colors.primary : '#64748B' }}>{item.type.toUpperCase()}</Text></View></View><Text style={{color: colors.primary, fontWeight:'700'}}>PR: {item.maxW} {item.unit}</Text></View>
                      </TouchableOpacity>
                      {selectedExercise === item.id && <View style={{padding: 15, borderTopWidth: 1, borderTopColor: colors.border}}>{renderChart(item.history, item.unit)}</View>}
                    </View>
                  ))}
                </View>
             ) : activeTab === 'workload' ? (
                renderWorkloadDashboard()
             ) : (
                <View>{renderFeedback()}</View>
             )}
          </ScrollView>
        </View>

        {/* Modales (Athlete Picker, Merge) */}
        <Modal visible={showPicker} transparent animationType="slide">
          <TouchableOpacity style={styles.modalOverlayPicker} onPress={() => setShowPicker(false)}>
            <View style={[styles.modalContentPicker, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Seleccionar Deportista</Text>
              <ScrollView>
                {athletes.map(a => (
                  <TouchableOpacity key={a.id} style={[styles.athleteItem, { borderBottomColor: colors.border }]} onPress={() => { handleSelectAthlete(a); setShowPicker(false); }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16 }}>{a.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
        
        <Modal visible={showMergeModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface, maxHeight: '85%' }]}>
              {!mergeTargetItem ? (
                <>
                  <Text style={styles.modalTitle}>1. Test Principal</Text>
                  <ScrollView>
                    {Object.values(rawItems).sort((a: any, b: any) => a.name.localeCompare(b.name)).map((item: any) => (
                      <TouchableOpacity key={item.id} style={[styles.dictSelectBtn, { borderColor: colors.border, marginBottom: 10 }]} onPress={() => setMergeTargetItem(item)}>
                        <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{item.name} ({item.type.toUpperCase()})</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              ) : (
                <>
                  <Text style={styles.modalTitle}>2. Unificar con {mergeTargetItem.name}</Text>
                  <ScrollView>
                    {Object.values(rawItems).filter((r: any) => r.id !== mergeTargetItem.id).map((r: any) => (
                      <TouchableOpacity 
                        key={r.id} 
                        style={[
                          styles.dictSelectBtn, 
                          { 
                            borderColor: mergeMap[r.id] === mergeTargetItem.id ? colors.primary : colors.border, 
                            backgroundColor: mergeMap[r.id] === mergeTargetItem.id ? `${colors.primary}10` : 'transparent', 
                            marginBottom: 10 
                          }
                        ]} 
                        onPress={() => toggleMerge(r.id)}
                      >
                        <Text style={{ color: colors.textPrimary }}>{r.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.primary }]} onPress={() => setShowMergeModal(false)}>
                    <Text style={{ color: '#FFF', fontWeight: '800' }}>TERMINAR</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity onPress={() => setShowMergeModal(false)} style={{marginTop:15, alignItems:'center'}}>
                <Text style={{color:colors.textSecondary}}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mainWrapper: { flex: 1 },
  desktopWrapper: { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', width: '100%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 24, fontWeight: '900' },
  iconBtn: { width: 45, height: 45, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  tabsContainerDesktop: { gap: 10, flex: 1 },
  tabsContainerMobile: { gap: 8, paddingRight: 20 },
  tabButton: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.05)' },
  tabButtonText: { fontSize: 11, fontWeight: '800' },
  summaryBoard: { flexDirection: 'row', borderRadius: 20, padding: 20, marginBottom: 20, justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center' },
  summaryValue: { fontSize: 24, fontWeight: '900' },
  summaryLabel: { fontSize: 12, color: '#888' },
  summaryDivider: { width: 1, backgroundColor: 'rgba(0,0,0,0.1)' },
  measurementsContainer: { padding: 20, borderRadius: 20, borderWidth: 1, marginBottom: 20 },
  measurementsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  measureBadge: { flex: 1, minWidth: '45%', padding: 15, borderRadius: 16, borderWidth: 1 },
  cardTitle: { fontSize: 18, fontWeight: '800', marginBottom: 15 },
  testCard: { padding: 20, borderRadius: 20, borderWidth: 1, marginBottom: 15 },
  testName: { fontSize: 18, fontWeight: '800' },
  testValue: { fontSize: 26, fontWeight: '900' },
  sideLabel: { fontSize: 10, fontWeight: '900', color: '#888' },
  progCard: { borderRadius: 20, borderWidth: 1, marginBottom: 15, overflow: 'hidden' },
  progHeader: { flexDirection: 'row', padding: 18, alignItems: 'center' },
  progName: { fontSize: 16, fontWeight: '800' },
  searchBar: { padding: 14, borderRadius: 12, borderWidth: 1 },
  filterChipsContainer: { flexDirection: 'row', gap: 8, marginBottom: 25, paddingBottom: 5 },
  filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, gap: 6 },
  filterChipText: { fontSize: 12, fontWeight: '600' },
  feedbackCard: { padding: 18, borderRadius: 20, borderWidth: 1, marginBottom: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { padding: 30, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 20 },
  dictSelectBtn: { padding: 16, borderRadius: 12, borderWidth: 1 },
  confirmBtn: { padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 30 },
  modalOverlayPicker: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContentPicker: { padding: 30, borderTopLeftRadius: 30, borderTopRightRadius: 30, maxHeight: '80%' },
  athleteItem: { paddingVertical: 18, borderBottomWidth: 1 }
});
