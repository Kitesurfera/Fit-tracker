import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Dimensions
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

const { width } = Dimensions.get('window');

const CYCLE_COLORS: any = {
  menstrual: '#EF4444',
  folicular: '#10B981',
  ovulatoria: '#F59E0B',
  lutea: '#8B5CF6'
};

const CYCLE_LABELS: any = {
  menstrual: 'Fase Menstrual (Baja Carga)',
  folicular: 'Fase Folicular (Alta Energía)',
  ovulatoria: 'Fase Ovulatoria (Pico de Fuerza)',
  lutea: 'Fase Lútea (Posible Fatiga)'
};

export default function AthleteDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name: string }>();
  
  const [athlete, setAthlete] = useState<any>(null);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'workouts' | 'progression'>('dashboard');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [ath, wk, sum, hist] = await Promise.all([
        api.getAthlete(params.id!),
        api.getWorkouts({ athlete_id: params.id! }),
        api.getSummary(params.id!),
        api.getWellnessHistory(params.id!)
      ]);
      setAthlete(ath);
      setWorkouts(wk || []);
      setSummary(sum);
      setHistory(hist || []);
    } catch (e) { 
      console.log("Error cargando detalle:", e); 
    } finally { 
      setLoading(false); 
    }
  };

  const getLevelColor = (val: number, inverse = false) => {
    if (!val) return colors.border;
    if (!inverse) { 
      if (val <= 2) return colors.success;
      if (val === 3) return '#EAB308';
      return colors.error;
    } else { 
      if (val >= 4) return colors.success;
      if (val === 3) return '#EAB308';
      return colors.error;
    }
  };

  // CORRECCIÓN: Detectamos 'Femenino', 'Mujer', 'female' de forma segura
  const isFemale = ['female', 'mujer', 'femenino'].includes(athlete?.gender?.toLowerCase() || '');
  const currentPhase = summary?.latest_wellness?.cycle_phase;

  const renderDashboard = () => (
    <View style={styles.tabContainer}>
      {summary?.is_injured && (
        <View style={[styles.alert, { backgroundColor: colors.error + '10', borderColor: colors.error }]}>
          <Ionicons name="warning" size={22} color={colors.error} />
          <View style={{flex:1, marginLeft: 12}}>
            <Text style={{color: colors.error, fontWeight: '900', fontSize: 12}}>ESTADO: LESIONADA / BAJA</Text>
            <Text style={{color: colors.textPrimary, fontSize: 13, marginTop: 2}}>{summary.injury_notes}</Text>
          </View>
        </View>
      )}

      {/* TARJETA INTELIGENTE: CICLO MENSTRUAL */}
      {isFemale && currentPhase && (
        <View style={[styles.cycleCard, { backgroundColor: CYCLE_COLORS[currentPhase] + '15', borderColor: CYCLE_COLORS[currentPhase] }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="water" size={24} color={CYCLE_COLORS[currentPhase]} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: CYCLE_COLORS[currentPhase], fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>ESTADO FISIOLÓGICO</Text>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 2 }}>
                {CYCLE_LABELS[currentPhase] || 'Fase Registrada'}
              </Text>
            </View>
          </View>
        </View>
      )}

      <Text style={[styles.sectionTitle, { marginTop: (isFemale && currentPhase) ? 10 : 0 }]}>
        EVOLUCIÓN SEMANAL (FATIGA)
      </Text>
      
      <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
        <View style={styles.barsContainer}>
          {history.length > 0 ? history.map((day, idx) => (
            <View key={idx} style={styles.barWrapper}>
              <View 
                style={[
                  styles.bar, 
                  { 
                    height: (day.fatigue / 5) * 100, 
                    backgroundColor: getLevelColor(day.fatigue) 
                  }
                ]} 
              />
              <Text style={styles.barDate}>{day.date.split('-')[2]}</Text>
            </View>
          )) : (
            <Text style={{color: colors.textSecondary, fontSize: 12}}>Esperando datos del atleta...</Text>
          )}
        </View>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 25 }]}>ÚLTIMO REGISTRO DE BIENESTAR</Text>
      <View style={[styles.mainCard, { backgroundColor: colors.surface }]}>
        <View style={styles.wellnessRow}>
          <View style={styles.wellBox}>
            <Text style={[styles.wellVal, { color: getLevelColor(summary?.latest_wellness?.fatigue) }]}>
              {summary?.latest_wellness?.fatigue || '-'}
            </Text>
            <Text style={styles.wellLabel}>FATIGA</Text>
          </View>
          <View style={styles.wellBox}>
            <Text style={[styles.wellVal, { color: getLevelColor(summary?.latest_wellness?.soreness) }]}>
              {summary?.latest_wellness?.soreness || '-'}
            </Text>
            <Text style={styles.wellLabel}>DOLOR</Text>
          </View>
          <View style={styles.wellBox}>
            <Text style={[styles.wellVal, { color: getLevelColor(summary?.latest_wellness?.sleep_quality, true) }]}>
              {summary?.latest_wellness?.sleep_quality || '-'}
            </Text>
            <Text style={styles.wellLabel}>SUEÑO</Text>
          </View>
        </View>

        {summary?.latest_wellness?.notes && (
          <View style={[styles.noteBox, { backgroundColor: colors.surfaceHighlight }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} />
            <Text style={[styles.noteText, { color: colors.textPrimary }]}>"{summary.latest_wellness.notes}"</Text>
          </View>
        )}
      </View>

      <TouchableOpacity 
        style={[styles.actionBtn, { backgroundColor: colors.primary, marginTop: 25 }]}
        onPress={() => router.push({ pathname: '/periodization', params: { athlete_id: params.id, name: params.name } })}
      >
        <Ionicons name="calendar" size={20} color="#FFF" />
        <Text style={styles.actionBtnText}>PLANIFICACIÓN (MACRO/MICRO)</Text>
      </TouchableOpacity>
    </View>
  );

  const renderWorkouts = () => (
    <View style={styles.tabContainer}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>HISTORIAL DE SESIONES</Text>
        <TouchableOpacity 
          style={{ backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
          onPress={() => router.push({ pathname: '/add-workout', params: { athlete_id: params.id, name: params.name } })}
        >
          <Ionicons name="add" size={16} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>NUEVO</Text>
        </TouchableOpacity>
      </View>

      {workouts.length > 0 ? workouts.map((wk) => (
        <TouchableOpacity 
          key={wk.id} 
          style={[styles.sessionCard, { backgroundColor: colors.surface, opacity: wk.completed ? 0.8 : 1 }]} 
          onPress={() => router.push({ pathname: '/training-mode', params: { workoutId: wk.id } })}
        >
          <View style={[styles.avatarCircle, { backgroundColor: wk.completed ? colors.success + '15' : colors.primary + '15' }]}>
            <Ionicons name={wk.completed ? "checkmark-done" : "barbell"} size={22} color={wk.completed ? colors.success : colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary, textDecorationLine: wk.completed ? 'line-through' : 'none' }]}>
              {wk.title}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              {wk.date} • {wk.completed ? 'Completado' : 'Pendiente'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.border} />
        </TouchableOpacity>
      )) : (
        <View style={{ alignItems: 'center', padding: 30 }}>
          <Ionicons name="folder-open-outline" size={40} color={colors.border} />
          <Text style={{ color: colors.textSecondary, marginTop: 10 }}>No hay sesiones registradas.</Text>
        </View>
      )}
    </View>
  );

  const renderProgression = () => {
    const completed = workouts.filter(w => w.completed).reverse();
    
    const progressionData = completed.map(wk => {
      let totalVolume = 0;
      if (wk.completion_data?.exercise_results) {
        wk.completion_data.exercise_results.forEach((ex: any) => {
          const weight = parseFloat(ex.logged_weight) || 0;
          const reps = parseInt(ex.logged_reps) || 0;
          const sets = parseInt(ex.completed_sets) || 0;
          totalVolume += (weight * reps * sets);
        });
      }
      return {
        date: wk.date.split('-').slice(1).join('/'),
        volume: totalVolume,
        rpe: wk.completion_data?.rpe || 0
      };
    }).slice(-7);

    const maxVolume = Math.max(...progressionData.map(d => d.volume), 100);

    return (
      <View style={styles.tabContainer}>
        <Text style={styles.sectionTitle}>VOLUMEN DE CARGA (KILOS TOTALES)</Text>
        
        <View style={[styles.progressionCard, { backgroundColor: colors.surface }]}>
          {progressionData.length > 0 ? (
            <View style={styles.barsContainer}>
              {progressionData.map((data, idx) => {
                const heightPercentage = (data.volume / maxVolume) * 100;
                return (
                  <View key={idx} style={styles.barWrapper}>
                    <Text style={[styles.barValue, { color: colors.primary }]}>
                      {data.volume > 0 ? `${(data.volume/1000).toFixed(1)}k` : '0'}
                    </Text>
                    <View style={[styles.bar, styles.progressionBar, { height: heightPercentage, backgroundColor: colors.primary }]} />
                    <Text style={styles.barDate}>{data.date}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginVertical: 20 }}>
              Completa sesiones con pesos registrados para ver la evolución.
            </Text>
          )}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 25 }]}>ESFUERZO PERCIBIDO (RPE)</Text>
        <View style={[styles.progressionCard, { backgroundColor: colors.surface }]}>
          {progressionData.length > 0 ? (
            <View style={styles.barsContainer}>
              {progressionData.map((data, idx) => {
                const rpeHeight = (data.rpe / 10) * 100;
                let rpeColor = colors.success;
                if (data.rpe > 6) rpeColor = colors.warning;
                if (data.rpe > 8) rpeColor = colors.error;

                return (
                  <View key={idx} style={styles.barWrapper}>
                    <Text style={[styles.barValue, { color: rpeColor }]}>{data.rpe}</Text>
                    <View style={[styles.bar, styles.progressionBar, { height: rpeHeight, backgroundColor: rpeColor }]} />
                    <Text style={styles.barDate}>{data.date}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>Sin datos de esfuerzo.</Text>
          )}
        </View>
      </View>
    );
  };

  const activeContent = () => {
    if (activeTab === 'dashboard') return renderDashboard();
    if (activeTab === 'workouts') return renderWorkouts();
    if (activeTab === 'progression') return renderProgression();
  };

  if (loading) return <SafeAreaView style={{flex:1, justifyContent:'center', alignItems:'center', backgroundColor: colors.background}}><ActivityIndicator size="large" color={colors.primary}/></SafeAreaView>;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.textPrimary} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{params.name}</Text>
        <TouchableOpacity onPress={loadData}><Ionicons name="sync" size={24} color={colors.primary} /></TouchableOpacity>
      </View>

      <View style={styles.tabsRow}>
        {[
          { id: 'dashboard', label: 'RESUMEN' },
          { id: 'workouts', label: 'SESIONES' },
          { id: 'progression', label: 'EVOLUCIÓN' }
        ].map(tab => (
          <TouchableOpacity 
            key={tab.id} 
            style={[styles.tab, activeTab === tab.id && { borderBottomColor: colors.primary, borderBottomWidth: 3 }]} 
            onPress={() => setActiveTab(tab.id as any)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab.id ? colors.primary : colors.textSecondary }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>{activeContent()}</ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '900' },
  tabsRow: { flexDirection: 'row', justifyContent: 'space-around', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  tab: { paddingVertical: 15, flex: 1, alignItems: 'center' },
  tabText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  tabContainer: { padding: 20, paddingBottom: 50 },
  alert: { flexDirection: 'row', padding: 18, borderRadius: 20, marginBottom: 25, borderLeftWidth: 6 },
  cycleCard: { padding: 16, borderRadius: 20, marginBottom: 25, borderWidth: 1 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 15, letterSpacing: 1.5 },
  chartCard: { padding: 20, borderRadius: 25, height: 160, justifyContent: 'flex-end', elevation: 2, marginBottom: 10 },
  barsContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: '100%' },
  barWrapper: { alignItems: 'center', flex: 1 },
  bar: { width: 16, borderRadius: 8, minHeight: 5 },
  barDate: { fontSize: 9, color: '#999', marginTop: 8, fontWeight: '700' },
  barValue: { fontSize: 9, fontWeight: '800', marginBottom: 4 },
  mainCard: { padding: 20, borderRadius: 25, elevation: 2 },
  wellnessRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15 },
  wellBox: { alignItems: 'center' },
  wellVal: { fontSize: 26, fontWeight: '900' },
  wellLabel: { fontSize: 9, fontWeight: '800', color: '#888', marginTop: 4 },
  noteBox: { flexDirection: 'row', padding: 15, borderRadius: 15, gap: 10, marginTop: 10 },
  noteText: { fontSize: 13, fontStyle: 'italic', flex: 1, lineHeight: 18 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 20, gap: 12 },
  actionBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
  sessionCard: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 20, marginBottom: 12, elevation: 1 },
  avatarCircle: { width: 46, height: 46, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  progressionCard: { padding: 20, borderRadius: 25, height: 180, justifyContent: 'flex-end', elevation: 2 },
  progressionBar: { width: 20, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }
});
