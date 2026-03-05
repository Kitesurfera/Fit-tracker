import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert, Linking, TextInput, Modal, ScrollView, Platform
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

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
  
  // NUEVO: Estado para el buscador de progresión
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

  // BORRADO SEGURO
  const handleDeleteAthlete = () => {
    const msg = `¿Eliminar a ${params.name}?`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) api.deleteAthlete(params.id!).then(() => router.back());
    } else {
      Alert.alert('Eliminar', msg, [{ text: 'No' }, { text: 'Sí', onPress: () => api.deleteAthlete(params.id!).then(() => router.back()) }]);
    }
  };

  const handleDeleteWorkout = (wId: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm('¿Borrar entreno?')) api.deleteWorkout(wId).then(() => setWorkouts(prev => prev.filter(w => w.id !== wId)));
    } else {
      Alert.alert('Borrar', '¿Borrar?', [{ text: 'No' }, { text: 'Sí', onPress: () => api.deleteWorkout(wId).then(() => setWorkouts(prev => prev.filter(w => w.id !== wId))) }]);
    }
  };

  // DUPLICAR
  const openDuplicateModal = (workout: any) => { setDuplicateModal(workout); setDuplicateDate(todayYMD); };
  const handleDuplicate = async () => {
    if (!duplicateModal || !duplicateDate) return;
    setDuplicating(true);
    try {
      const newWorkout = await api.createWorkout({
        athlete_id: params.id!, date: duplicateDate, title: duplicateModal.title + ' (Copia)',
        exercises: duplicateModal.exercises, notes: duplicateModal.notes || '',
      });
      setWorkouts(prev => [newWorkout, ...prev]);
      setDuplicateModal(null);
    } catch (e) { Alert.alert('Error', 'No se pudo duplicar'); }
    finally { setDuplicating(false); }
  };

  // --- LÓGICA DE PROGRESIÓN ---
  const getProgressionData = () => {
    const exMap: Record<string, any> = {};
    workouts.filter(w => w.completed && w.completion_data).forEach(w => {
      w.completion_data.exercise_results?.forEach((r: any) => {
        if (!exMap[r.name]) exMap[r.name] = { name: r.name, maxW: 0, history: [] };
        const wVal = parseFloat(r.logged_weight) || 0;
        if (wVal > exMap[r.name].maxW) exMap[r.name].maxW = wVal;
        exMap[r.name].history.push({ date: w.date, weight: wVal, reps: r.logged_reps });
      });
    });
    
    const results = Object.values(exMap);

    // FILTRO DEL BUSCADOR
    if (searchQuery.trim() === '') return results;
    return results.filter((ex: any) => 
      ex.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const renderDashboard = () => {
    const recentObs = workouts.filter(w => w.observations).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
    const latest = workouts.find(w => w.completion_data?.rpe || w.completion_data?.sleep);

    return (
      <View style={styles.tabContainer}>
        {latest && (
           <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
             <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Estado Actual</Text>
             <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
               {latest.completion_data.rpe && <View style={styles.badge}><Text style={{ color: colors.primary }}>RPE: {latest.completion_data.rpe}/10</Text></View>}
               {latest.completion_data.sleep && <View style={styles.badge}><Text style={{ color: colors.primary }}>Sueño: {latest.completion_data.sleep}</Text></View>}
             </View>
           </View>
        )}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 20 }]}>Feedback Reciente</Text>
        {recentObs.map(w => (
          <View key={w.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{w.title} ({w.date})</Text>
            <Text style={{ fontStyle: 'italic', marginTop: 5, color: colors.textSecondary }}>"{w.observations}"</Text>
          </View>
        ))}
        {recentObs.length === 0 && <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 20 }}>No hay observaciones aún.</Text>}
      </View>
    );
  };

  const renderWorkoutItem = ({ item }: { item: any }) => {
    const isExpanded = expandedWorkout === item.id;
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity style={styles.cardHeader} onPress={() => setExpandedWorkout(isExpanded ? null : item.id)}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{item.title}</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>{item.date} · {item.exercises?.length || 0} exs.</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => openDuplicateModal(item)}><Ionicons name="copy-outline" size={20} color={colors.primary} /></TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteWorkout(item.id)}><Ionicons name="trash-outline" size={20} color={colors.error} /></TouchableOpacity>
            <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>
        {isExpanded && (
          <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
            {item.exercises?.map((ex: any, i: number) => (
              <Text key={i} style={{ color: colors.textSecondary, marginBottom: 4 }}>• {ex.name} ({ex.sets}x{ex.reps})</Text>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderTestItem = ({ item }: { item: any }) => (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between' }]}>
      <Text style={{ fontWeight: '600', color: colors.textPrimary }}>{TEST_LABELS[item.test_name] || item.test_name}</Text>
      <Text style={{ fontWeight: '700', color: colors.primary }}>{item.value} {item.unit}</Text>
    </View>
  );

  const renderProgressionItem = ({ item }: { item: any }) => {
    const isExpanded = expandedExercise === item.name;
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity style={styles.cardHeader} onPress={() => setExpandedExercise(isExpanded ? null : item.name)}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{item.name}</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>Récord: {item.maxW}kg</Text>
          </View>
          <Ionicons name={isExpanded ? "chevron-up" : "chevron-forward"} size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        {isExpanded && (
          <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
            {item.history.map((h: any, i: number) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>{h.date}</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPrimary }}>{h.weight}kg x {h.reps}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const activeData = activeTab === 'dashboard' ? [1] : activeTab === 'workouts' ? workouts : activeTab === 'tests' ? tests : getProgressionData();

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
          <View style={{ padding: 16 }}>
            <View style={styles.tabsRow}>
              {['dashboard', 'workouts', 'tests', 'progression'].map(tab => (
                <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setActiveTab(tab as any)}>
                  <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textSecondary }]}>{tab.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* BUSCADOR: SOLO APARECE EN PESTAÑA PROGRESIÓN */}
            {activeTab === 'progression' && (
              <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="search" size={18} color={colors.textSecondary} />
                <TextInput
                  style={[styles.searchInput, { color: colors.textPrimary }]}
                  placeholder="Buscar ejercicio..."
                  placeholderTextColor={colors.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        }
        renderItem={activeTab === 'dashboard' ? renderDashboard : activeTab === 'workouts' ? renderWorkoutItem : activeTab === 'tests' ? renderTestItem : renderProgressionItem}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      <Modal visible={!!duplicateModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={{ fontWeight: '700', marginBottom: 10 }}>Duplicar en fecha (YYYY-MM-DD):</Text>
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} value={duplicateDate} onChangeText={setDuplicateDate} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }}>
              <TouchableOpacity onPress={() => setDuplicateModal(null)}><Text style={{ color: colors.error }}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleDuplicate}><Text style={{ color: colors.primary, fontWeight: '700' }}>Confirmar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  tabsRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#eee', marginBottom: 16 },
  tab: { paddingVertical: 10, paddingHorizontal: 5 },
  tabText: { fontSize: 10, fontWeight: '700' },
  tabContainer: { padding: 16 },
  card: { padding: 15, borderRadius: 12, borderWidth: 1, marginBottom: 10, marginHorizontal: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  badge: { backgroundColor: '#e3f2fd', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  
  // NUEVOS ESTILOS DEL BUSCADOR
  searchContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 12, 
    height: 44, 
    borderRadius: 10, 
    borderWidth: 1, 
    marginTop: 8,
    marginHorizontal: 0
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 40 },
  modalCard: { padding: 25, borderRadius: 15 },
  input: { borderWidth: 1, padding: 12, borderRadius: 8 },
});
