import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, ScrollView, Dimensions
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

const { width } = Dimensions.get('window');

export default function AthleteDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name: string }>();
  
  const [athlete, setAthlete] = useState<any>(null);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]); // Estado para la gráfica
  const [activeTab, setActiveTab] = useState<'dashboard' | 'workouts' | 'progression'>('dashboard');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [ath, wk, sum, hist] = await Promise.all([
        api.getAthlete(params.id!),
        api.getWorkouts({ athlete_id: params.id! }),
        api.getSummary(params.id!),
        api.getWellnessHistory(params.id!) // Historial para la gráfica
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

  // Ayudante visual: Colores según nivel (1-5)
  const getLevelColor = (val: number, inverse = false) => {
    if (!val) return colors.border;
    if (!inverse) { // Fatiga, Estrés, Dolor (Bajo es mejor)
      if (val <= 2) return colors.success;
      if (val === 3) return '#EAB308'; // Amarillo
      return colors.error;
    } else { // Calidad de Sueño (Alto es mejor)
      if (val >= 4) return colors.success;
      if (val === 3) return '#EAB308';
      return colors.error;
    }
  };

  const renderDashboard = () => (
    <View style={styles.tabContainer}>
      
      {/* ALERTA DE LESIÓN (Prioridad alta) */}
      {summary?.is_injured && (
        <View style={[styles.alert, { backgroundColor: colors.error + '10', borderColor: colors.error }]}>
          <Ionicons name="warning" size={22} color={colors.error} />
          <View style={{flex:1, marginLeft: 12}}>
            <Text style={{color: colors.error, fontWeight: '900', fontSize: 12}}>ESTADO: LESIONADA / BAJA</Text>
            <Text style={{color: colors.textPrimary, fontSize: 13, marginTop: 2}}>{summary.injury_notes}</Text>
          </View>
        </View>
      )}

      {/* GRÁFICA DE TENDENCIA (FATIGA SEMANAL) */}
      <Text style={styles.sectionTitle}>EVOLUCIÓN SEMANAL (FATIGA)</Text>
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
            <Text style={{color: colors.textSecondary, fontSize: 12}}>Esperando datos del deportista...</Text>
          )}
        </View>
      </View>

      {/* MÉTRICAS DE HOY (SENSACIONES) */}
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

      {/* EQUIPAMIENTO Y MATERIAL */}
      <View style={[styles.infoCard, { backgroundColor: colors.surface, marginTop: 20 }]}>
        <Text style={styles.infoLabel}>NOTAS DE EQUIPAMIENTO / MATERIAL</Text>
        <Text style={[styles.infoText, { color: colors.textPrimary }]}>
          {summary?.equipment || 'No se ha registrado material específico.'}
        </Text>
      </View>

      {/* BOTONES DE ACCIÓN */}
      <View style={{ gap: 12, marginTop: 25 }}>
        <TouchableOpacity 
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push({ pathname: '/periodization', params: { athlete_id: params.id, name: params.name } })}
        >
          <Ionicons name="calendar" size={20} color="#FFF" />
          <Text style={styles.actionBtnText}>PLANIFICACIÓN (MACRO/MICRO)</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
          onPress={() => router.push({ pathname: '/progress', params: { athlete_id: params.id, name: params.name } })}
        >
          <Ionicons name="stats-chart" size={20} color={colors.primary} />
          <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>VER GRÁFICAS DE EVOLUCIÓN</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const activeContent = () => {
    if (activeTab === 'dashboard') return renderDashboard();
    return <View style={{padding: 40, alignItems: 'center'}}><Text style={{color: colors.textSecondary}}>Cargando historial de sesiones...</Text></View>;
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
        {['dashboard', 'workouts', 'progression'].map(tab => (
          <TouchableOpacity 
            key={tab} 
            style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 3 }]} 
            onPress={() => setActiveTab(tab as any)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textSecondary }]}>{tab.toUpperCase()}</Text>
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
  tab: { paddingVertical: 15 },
  tabText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  tabContainer: { padding: 20 },
  
  alert: { flexDirection: 'row', padding: 18, borderRadius: 20, marginBottom: 25, borderLeftWidth: 6 },
  
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 15, letterSpacing: 1.5 },
  
  // Gráfica
  chartCard: { padding: 20, borderRadius: 25, height: 160, justifyContent: 'flex-end', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  barsContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: '100%' },
  barWrapper: { alignItems: 'center' },
  bar: { width: 16, borderRadius: 8, minHeight: 10 },
  barDate: { fontSize: 9, color: '#999', marginTop: 8, fontWeight: '700' },

  mainCard: { padding: 20, borderRadius: 25, elevation: 2 },
  wellnessRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15 },
  wellBox: { alignItems: 'center' },
  wellVal: { fontSize: 26, fontWeight: '900' },
  wellLabel: { fontSize: 9, fontWeight: '800', color: '#888', marginTop: 4 },
  noteBox: { flexDirection: 'row', padding: 15, borderRadius: 15, gap: 10, marginTop: 10 },
  noteText: { fontSize: 13, fontStyle: 'italic', flex: 1, lineHeight: 18 },

  infoCard: { padding: 20, borderRadius: 20 },
  infoLabel: { fontSize: 9, fontWeight: '800', color: '#888', letterSpacing: 1 },
  infoText: { fontSize: 14, marginTop: 8, fontWeight: '600' },

  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 20, gap: 12 },
  actionBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 }
});
