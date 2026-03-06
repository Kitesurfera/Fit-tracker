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

export default function AthleteDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name: string }>();
  
  const [athlete, setAthlete] = useState<any>(null);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'workouts' | 'progression'>('dashboard');
  const [loading, setLoading] = useState(true);

  const todayYMD = new Date().toISOString().split('T')[0];

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [ath, wk, sum] = await Promise.all([
        api.getAthlete(params.id!),
        api.getWorkouts({ athlete_id: params.id! }),
        api.getSummary(params.id!)
      ]);
      setAthlete(ath);
      setWorkouts(wk || []);
      setSummary(sum);
    } catch (e) { console.log(e); }
    finally { setLoading(false); }
  };

  const renderDashboard = () => (
    <View style={styles.tabContainer}>
      
      {/* ALERTA DE LESIÓN */}
      {summary?.is_injured && (
        <View style={[styles.alert, { backgroundColor: colors.error + '10', borderColor: colors.error }]}>
          <Ionicons name="warning" size={20} color={colors.error} />
          <View style={{flex:1, marginLeft: 10}}>
            <Text style={{color: colors.error, fontWeight: '900', fontSize: 12}}>ATLETA CON MOLESTIAS / LESIÓN</Text>
            <Text style={{color: colors.textPrimary, fontSize: 13, marginTop: 2}}>{summary.injury_notes}</Text>
          </View>
        </View>
      )}

      {/* NOTAS DE EQUIPAMIENTO */}
      <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
        <Text style={styles.infoLabel}>EQUIPAMIENTO RELEVANTE</Text>
        <Text style={[styles.infoText, { color: colors.textPrimary }]}>
          {summary?.equipment || 'Sin material específico registrado'}
        </Text>
      </View>

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

      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Estado Wellness (Hoy)</Text>
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

  const activeContent = () => {
    if (activeTab === 'dashboard') return renderDashboard();
    return <Text style={{textAlign:'center', marginTop: 40}}>Sección en desarrollo...</Text>;
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
  alert: { flexDirection: 'row', padding: 15, borderRadius: 15, marginBottom: 20, borderLeftWidth: 5 },
  infoCard: { padding: 15, borderRadius: 15, marginBottom: 20 },
  infoLabel: { fontSize: 10, fontWeight: '800', color: '#888', letterSpacing: 1 },
  infoText: { fontSize: 14, marginTop: 5, fontWeight: '600' },
  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 15 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 18, marginBottom: 12, gap: 10 },
  actionBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  wellnessGrid: { flexDirection: 'row', padding: 20, borderRadius: 20 },
  wellItem: { flex: 1, alignItems: 'center' },
  wellVal: { fontSize: 22, fontWeight: '900' },
  wellSub: { fontSize: 9, fontWeight: '700', marginTop: 4 }
});
