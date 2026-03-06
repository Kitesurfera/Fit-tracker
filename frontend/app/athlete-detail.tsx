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
  const [tests, setTests] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'workouts' | 'tests' | 'progression'>('dashboard');
  const [loading, setLoading] = useState(true);

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
    finally { setLoading(false); }
  };

  const renderDashboard = () => (
    <View style={styles.tabContainer}>
      <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
      
      {/* BOTÓN PERIODIZACIÓN */}
      <TouchableOpacity 
        style={[styles.mainCard, { backgroundColor: colors.primary, marginBottom: 12 }]}
        onPress={() => router.push({ pathname: '/periodization', params: { athlete_id: params.id, name: params.name } })}
      >
        <Ionicons name="calendar" size={24} color="#FFF" />
        <Text style={styles.mainCardText}>PLANIFICACIÓN (MACRO/MICRO)</Text>
      </TouchableOpacity>

      {/* BOTÓN GRÁFICOS */}
      <TouchableOpacity 
        style={[styles.mainCard, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
        onPress={() => router.push({ pathname: '/progress', params: { athlete_id: params.id, name: params.name } })}
      >
        <Ionicons name="stats-chart" size={24} color={colors.primary} />
        <Text style={[styles.mainCardText, { color: colors.textPrimary }]}>VER GRÁFICAS Y EVOLUCIÓN</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Estado Wellness (Hoy)</Text>
      <View style={[styles.wellnessGrid, { backgroundColor: colors.surface }]}>
        <View style={styles.wellItem}>
          <Text style={[styles.wellVal, { color: colors.primary }]}>{summary?.latest_wellness?.hr_rest || '--'}</Text>
          <Text style={styles.wellSub}>PULSO</Text>
        </View>
        <View style={styles.wellItem}>
          <Text style={[styles.wellVal, { color: colors.success }]}>{summary?.latest_wellness?.fatigue || '-'}/5</Text>
          <Text style={styles.wellSub}>FATIGA</Text>
        </View>
      </View>
    </View>
  );

  const renderWorkouts = () => (
    <View style={styles.tabContainer}>
      <TouchableOpacity 
        style={[styles.addBtn, { backgroundColor: colors.primary }]}
        onPress={() => router.push({ pathname: '/create-workout', params: { athlete_id: params.id } })}
      >
        <Ionicons name="add" size={24} color="#FFF" />
        <Text style={{color:'#FFF', fontWeight:'700'}}>Nuevo Entrenamiento</Text>
      </TouchableOpacity>
      {workouts.map(w => (
        <TouchableOpacity key={w.id} style={[styles.miniCard, { backgroundColor: colors.surface }]}>
          <View style={{flex:1}}>
            <Text style={{fontWeight:'700', color: colors.textPrimary}}>{w.title}</Text>
            <Text style={{fontSize:12, color: colors.textSecondary}}>{w.date}</Text>
          </View>
          {w.completed && <Ionicons name="checkmark-circle" size={20} color={colors.success} />}
        </TouchableOpacity>
      ))}
    </View>
  );

  const activeContent = () => {
    if (activeTab === 'dashboard') return renderDashboard();
    if (activeTab === 'workouts') return renderWorkouts();
    return <Text style={{textAlign:'center', marginTop: 40}}>Cargando datos...</Text>;
  };

  if (loading) return <SafeAreaView style={{flex:1, justifyContent:'center', alignItems:'center'}}><ActivityIndicator size="large" color={colors.primary}/></SafeAreaView>;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.textPrimary} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{params.name}</Text>
        <TouchableOpacity onPress={loadData}><Ionicons name="sync" size={24} color={colors.primary} /></TouchableOpacity>
      </View>

      <View style={styles.tabsRow}>
        {['dashboard', 'workouts', 'tests', 'progression'].map(tab => (
          <TouchableOpacity 
            key={tab} 
            style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 3 }]} 
            onPress={() => setActiveTab(tab as any)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textSecondary }]}>{tab.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView>{activeContent()}</ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  tabsRow: { flexDirection: 'row', justifyContent: 'space-around', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tab: { paddingVertical: 15 },
  tabText: { fontSize: 10, fontWeight: '800' },
  tabContainer: { padding: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 15, letterSpacing: 0.5 },
  mainCard: { borderRadius: 18, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 15 },
  mainCardText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  wellnessGrid: { flexDirection: 'row', padding: 20, borderRadius: 20 },
  wellItem: { flex: 1, alignItems: 'center' },
  wellVal: { fontSize: 22, fontWeight: '900' },
  wellSub: { fontSize: 9, fontWeight: '700', marginTop: 4 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 15, marginBottom: 20, gap: 10 },
  miniCard: { flexDirection: 'row', padding: 18, borderRadius: 15, marginBottom: 10, alignItems: 'center' }
});
