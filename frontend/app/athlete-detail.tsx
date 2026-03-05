import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert, TextInput, Modal, ScrollView, Platform, Dimensions
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

const { width } = Dimensions.get('window');

const TEST_LABELS: Record<string, string> = {
  squat_rm: 'Sentadilla RM', bench_rm: 'Press Banca RM', deadlift_rm: 'Peso Muerto RM',
  cmj: 'CMJ', sj: 'SJ', dj: 'DJ',
  hamstring: 'Isquiotibiales', calf: 'Gemelo', quadriceps: 'Cuadriceps', tibialis: 'Tibial',
};

export default function AthleteDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name: string }>();
  
  const [athlete, setAthlete] = useState<any>(null);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'workouts' | 'tests' | 'progression'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null);
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [duplicateModal, setDuplicateModal] = useState<any>(null);
  const [duplicateDate, setDuplicateDate] = useState('');
  const [duplicating, setDuplicating] = useState(false);

  const tObj = new Date();
  const todayYMD = `${tObj.getFullYear()}-${String(tObj.getMonth() + 1).padStart(2, '0')}-${String(tObj.getDate()).padStart(2, '0')}`;

  const loadData = async () => {
    try {
      const [ath, wk, ts] = await Promise.all([
        api.getAthlete(params.id!),
        api.getWorkouts({ athlete_id: params.id! }),
        api.getTests({ athlete_id: params.id! }),
      ]);
      setAthlete(ath);
      setWorkouts(wk || []);
      setTests(ts || []);
    } catch (e) { console.log(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { loadData(); }, []);
  const onRefresh = () => { setRefreshing(true); loadData(); };

  // --- LÓGICA DE DATOS PARA DASHBOARD ---
  const lastCompleted = [...workouts]
    .filter(w => w.completed)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  const upcomingWorkouts = [...workouts]
    .filter(w => !w.completed && w.date >= todayYMD)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3);

  // --- LÓGICA DE PROGRESIÓN (SIN DUPLICADOS) ---
  const getCleanProgression = () => {
    const exMap: Record<string, any> = {};
    workouts.filter(w => w.completed && w.completion_data).forEach(w => {
      w.completion_data.exercise_results?.forEach((r: any) => {
        if (!exMap[r.name]) {
          exMap[r.name] = { name: r.name, maxW: 0, history: [] };
        }
        const weight = parseFloat(r.logged_weight) || 0;
        if (weight > exMap[r.name].maxW) exMap[r.name].maxW = weight;
        exMap[r.name].history.push({ date: w.date, weight, reps: r.logged_reps });
      });
    });
    
    let results = Object.values(exMap).sort((a: any, b: any) => a.name.localeCompare(b.name));
    if (searchQuery.trim()) {
      results = results.filter((ex: any) => ex.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return results;
  };

  // --- RENDERIZADORES ---

const renderDashboard = () => (
    <View style={styles.tabContainer}>
      
      {/* NUEVO BOTÓN DE PERIODIZACIÓN */}
      <TouchableOpacity 
        style={[styles.mainCard, { backgroundColor: colors.primary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 16, marginBottom: 24, borderColor: colors.primary }]}
        onPress={() => router.push({ pathname: '/periodization', params: { athlete_id: params.id, name: params.name } })}
        activeOpacity={0.8}
      >
        <Ionicons name="calendar" size={22} color="#FFFFFF" style={{ marginRight: 10 }} />
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>
          Planificación (Macro/Micro)
        </Text>
      </TouchableOpacity>

      {/* Último Entrenamiento */}
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Último realizado</Text>
      {lastCompleted ? (
        <View style={[styles.mainCard, { backgroundColor: colors.surface, borderColor: colors.success + '40' }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardHighlight, { color: colors.success }]}>Completado el {lastCompleted.date}</Text>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          </View>
          <Text style={[styles.workoutTitle, { color: colors.textPrimary }]}>{lastCompleted.title}</Text>
          {lastCompleted.observations && (
            <View style={[styles.obsBox, { backgroundColor: colors.surfaceHighlight }]}>
              <Text style={[styles.obsText, { color: colors.textPrimary }]}>"{lastCompleted.observations}"</Text>
            </View>
          )}
        </View>
      ) : (
        <Text style={styles.emptyText}>No hay entrenamientos completados aún.</Text>
      )}

      {/* Próximos Entrenamientos */}
      <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 24 }]}>Próximas sesiones</Text>
      {upcomingWorkouts.length > 0 ? (
        upcomingWorkouts.map(w => (
          <View key={w.id} style={[styles.miniCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.dateBadge}><Text style={styles.dateBadgeText}>{w.date.split('-')[2]}</Text></View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.miniTitle, { color: colors.textPrimary }]}>{w.title}</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>{w.exercises?.length || 0} ejercicios planificados</Text>
            </View>
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          </View>
        ))
      ) : (
        <Text style={styles.emptyText}>No hay entrenamientos pendientes.</Text>
      )}
    </View>
  );

  const renderProgressionItem = ({ item }: { item: any }) => {
    const isExpanded = expandedExercise === item.name;
    const sortedHistory = [...item.history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return (
      <View style={[styles.progCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity style={styles.progHeader} onPress={() => setExpandedExercise(isExpanded ? null : item.name)}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.progName, { color: colors.textPrimary }]}>{item.name}</Text>
            <View style={styles.pbContainer}>
              <Ionicons name="trophy" size={14} color="#FFD700" />
              <Text style={[styles.pbText, { color: colors.primary }]}>PB: {item.maxW} kg</Text>
            </View>
          </View>
          <Ionicons name={isExpanded ? "chevron-up" : "chevron-forward"} size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        
        {isExpanded && (
          <View style={[styles.historyList, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            {sortedHistory.map((h, i) => (
              <View key={i} style={styles.historyRow}>
                <Text style={[styles.historyDate, { color: colors.textSecondary }]}>{h.date}</Text>
                <Text style={[styles.historyVal, { color: colors.textPrimary }]}>{h.weight}kg x {h.reps} reps</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const activeData = activeTab === 'dashboard' ? [1] : activeTab === 'workouts' ? workouts : activeTab === 'tests' ? tests : getCleanProgression();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.textPrimary} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{params.name}</Text>
        <TouchableOpacity onPress={onRefresh}><Ionicons name="sync-outline" size={24} color={colors.primary} /></TouchableOpacity>
      </View>

      <FlatList
        data={activeData}
        keyExtractor={(item, index) => index.toString()}
        ListHeaderComponent={
          <View style={{ paddingBottom: 8 }}>
            <View style={styles.tabsRow}>
              {['dashboard', 'workouts', 'tests', 'progression'].map(tab => (
                <TouchableOpacity 
                  key={tab} 
                  style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 3 }]} 
                  onPress={() => setActiveTab(tab as any)}
                >
                  <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textSecondary }]}>
                    {tab === 'progression' ? 'PROGRESO' : tab.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {activeTab === 'progression' && (
              <View style={styles.searchWrapper}>
                <View style={[styles.searchBar, { backgroundColor: colors.surfaceHighlight }]}>
                  <Ionicons name="search" size={18} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.textPrimary }]}
                    placeholder="Buscar ejercicio..."
                    placeholderTextColor={colors.textSecondary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                </View>
              </View>
            )}
          </View>
        }
        renderItem={
          activeTab === 'dashboard' ? renderDashboard : 
          activeTab === 'progression' ? renderProgressionItem : 
          null // Los otros renders se mantienen similares pero con este estilo
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '800' },
  tabsRow: { flexDirection: 'row', justifyContent: 'space-around', borderBottomWidth: 1, borderBottomColor: '#eee', paddingHorizontal: 10 },
  tab: { paddingVertical: 14, paddingHorizontal: 4 },
  tabText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  
  tabContainer: { padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  mainCard: { borderRadius: 16, borderWidth: 1, padding: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardHighlight: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  workoutTitle: { fontSize: 20, fontWeight: '700' },
  obsBox: { marginTop: 15, padding: 12, borderRadius: 10 },
  obsText: { fontSize: 14, fontStyle: 'italic', lineHeight: 20 },
  
  miniCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  dateBadge: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
  dateBadgeText: { fontWeight: '800', fontSize: 16 },
  miniTitle: { fontWeight: '700', fontSize: 15 },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 10, fontSize: 14 },

  progCard: { marginHorizontal: 20, marginBottom: 12, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  progHeader: { padding: 18, flexDirection: 'row', alignItems: 'center' },
  progName: { fontWeight: '800', fontSize: 16, marginBottom: 4 },
  pbContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pbText: { fontSize: 14, fontWeight: '700' },
  historyList: { padding: 18, backgroundColor: '#fafafa' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  historyDate: { fontSize: 12, fontWeight: '600' },
  historyVal: { fontSize: 13, fontWeight: '700' },

  searchWrapper: { paddingHorizontal: 20, marginTop: 15 },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, height: 48, borderRadius: 12 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, fontWeight: '500' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 30 },
  modalCard: { padding: 25, borderRadius: 20 },
});
