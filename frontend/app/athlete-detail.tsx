import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert, TextInput, Dimensions
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
  const [tests, setTests] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'workouts' | 'tests' | 'progression'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const todayYMD = new Date().toISOString().split('T')[0];

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [ath, wk, ts, sum] = await Promise.all([
        api.getAthlete(params.id!),
        api.getWorkouts({ athlete_id: params.id! }),
        api.getTests({ athlete_id: params.id! }),
        api.getSummary(params.id!)
      ]);
      setAthlete(ath);
      setWorkouts(wk || []);
      setTests(ts || []);
      setSummary(sum);
    } catch (e) { console.log(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const renderDashboard = () => (
    <View style={styles.tabContainer}>
      
      {/* RENDIMIENTO APPLE WATCH / STRAVA */}
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Rendimiento Apple Watch</Text>
      <View style={[styles.mainCard, { backgroundColor: colors.surface, marginBottom: 24, flexDirection: 'row', padding: 20, gap: 15, elevation: 2 }]}>
        <View style={{ flex: 1, alignItems: 'center', borderRightWidth: 1, borderRightColor: colors.border }}>
          <Ionicons name="heart" size={24} color={colors.error} />
          <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary, marginTop: 5 }}>
            {summary?.last_workout?.hr || '--'} <Text style={{ fontSize: 12 }}>bpm</Text>
          </Text>
          <Text style={{ fontSize: 10, color: colors.textSecondary, fontWeight: '700' }}>PULSO MEDIO</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Ionicons name="timer" size={24} color={colors.primary} />
          <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary, marginTop: 5 }}>
            {summary?.last_workout?.duration || '0'} <Text style={{ fontSize: 12 }}>min</Text>
          </Text>
          <Text style={{ fontSize: 10, color: colors.textSecondary, textAlign: 'center', fontWeight: '700' }}>
            {summary?.last_workout?.name || 'SIN SESIÓN'}
          </Text>
        </View>
      </View>

      <TouchableOpacity 
        style={[styles.mainCard, { backgroundColor: colors.primary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 18, marginBottom: 12 }]}
        onPress={() => router.push({ pathname: '/periodization', params: { athlete_id: params.id, name: params.name } })}
      >
        <Ionicons name="calendar" size={20} color="#FFF" style={{ marginRight: 10 }} />
        <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 1 }}>PLANIFICACIÓN (MACRO/MICRO)</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.mainCard, { backgroundColor: colors.surface, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 18, marginBottom: 24, borderWidth: 1, borderColor: colors.border }]}
        onPress={() => router.push({ pathname: '/progress', params: { athlete_id: params.id, name: params.name } })}
      >
        <Ionicons name="stats-chart" size={20} color={colors.primary} style={{ marginRight: 10 }} />
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '800', letterSpacing: 1 }}>VER GRÁFICAS Y EVOLUCIÓN</Text>
      </TouchableOpacity>

      {/* Historial rápido */}
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Próximas sesiones</Text>
      {workouts.filter(w => !w.completed && w.date >= todayYMD).slice(0, 2).map(w => (
        <View key={w.id} style={[styles.miniCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.miniTitle, { color: colors.textPrimary }]}>{w.title}</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>{w.date}</Text>
        </View>
      ))}
    </View>
  );

  const getCleanProgression = () => {
    const exMap: Record<string, any> = {};
    workouts.filter(w => w.completed && w.completion_data).forEach(w => {
      w.completion_data.exercise_results?.forEach((r: any) => {
        if (!exMap[r.name]) exMap[r.name] = { name: r.name, maxW: 0, history: [] };
        const weight = parseFloat(r.logged_weight) || 0;
        if (weight > exMap[r.name].maxW) exMap[r.name].maxW = weight;
        exMap[r.name].history.push({ date: w.date, weight, reps: r.logged_reps });
      });
    });
    return Object.values(exMap).sort((a: any, b: any) => a.name.localeCompare(b.name));
  };

  const activeData = activeTab === 'dashboard' ? [1] : activeTab === 'progression' ? getCleanProgression() : workouts;

  if (loading) return <SafeAreaView style={{flex:1, backgroundColor:colors.background, justifyContent:'center'}}><ActivityIndicator size="large" color={colors.primary}/></SafeAreaView>;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.textPrimary} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{params.name}</Text>
        <TouchableOpacity onPress={loadData}><Ionicons name="sync-outline" size={24} color={colors.primary} /></TouchableOpacity>
      </View>

      <FlatList
        data={activeData}
        keyExtractor={(item, index) => index.toString()}
        ListHeaderComponent={
          <View style={styles.tabsRow}>
            {['dashboard', 'workouts', 'progression'].map(tab => (
              <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 3 }]} onPress={() => setActiveTab(tab as any)}>
                <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textSecondary }]}>{tab.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        }
        renderItem={({ item }) => activeTab === 'dashboard' ? renderDashboard() : null}
        contentContainerStyle={{ paddingBottom: 100 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '800' },
  tabsRow: { flexDirection: 'row', justifyContent: 'space-around', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tab: { paddingVertical: 15 },
  tabText: { fontSize: 11, fontWeight: '800' },
  tabContainer: { padding: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12, letterSpacing: 0.5 },
  mainCard: { borderRadius: 20, padding: 15 },
  miniCard: { padding: 15, borderRadius: 15, borderWidth: 1, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  miniTitle: { fontWeight: '700' }
});
