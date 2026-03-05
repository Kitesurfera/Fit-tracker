import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert, Linking, TextInput, Modal, ScrollView, Platform, Dimensions
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
      setWorkouts(wk);
      setTests(ts);
    } catch (e) { console.log(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { loadData(); }, []);
  const onRefresh = () => { setRefreshing(true); loadData(); };

  // LÓGICA DE BORRADO (CORREGIDA PARA WEB)
  const handleDeleteAthlete = () => {
    const msg = `¿Estás seguro de eliminar a ${params.name}?`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) api.deleteAthlete(params.id!).then(() => router.back());
    } else {
      Alert.alert('Eliminar', msg, [{ text: 'No' }, { text: 'Sí', onPress: () => api.deleteAthlete(params.id!).then(() => router.back()) }]);
    }
  };

  const handleDeleteWorkout = async (wId: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm('¿Borrar entreno?')) api.deleteWorkout(wId).then(() => setWorkouts(prev => prev.filter(w => w.id !== wId)));
    } else {
      Alert.alert('Borrar', '¿Borrar entreno?', [{ text: 'No' }, { text: 'Sí', onPress: () => api.deleteWorkout(wId).then(() => setWorkouts(prev => prev.filter(w => w.id !== wId))) }]);
    }
  };

  // DUPLICAR ENTRENAMIENTO
  const openDuplicateModal = (workout: any) => { setDuplicateModal(workout); setDuplicateDate(todayYMD); };
  const handleDuplicate = async () => {
    if (!duplicateModal || !duplicateDate) return;
    setDuplicating(true);
    try {
      const newWorkout = await api.createWorkout({
        athlete_id: params.id!, date: duplicateDate, title: duplicateModal.title + ' (Copia)',
        exercises: duplicateModal.exercises.map((ex: any) => ({ name: ex.name, sets: ex.sets, reps: ex.reps, weight: ex.weight || '', rest: ex.rest || '', video_url: ex.video_url || '' })),
        notes: duplicateModal.notes || '',
      });
      setWorkouts(prev => [newWorkout, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setDuplicateModal(null);
    } catch (e: any) { Alert.alert('Error', 'No se pudo duplicar'); }
    finally { setDuplicating(false); }
  };

  // --- LÓGICA DE PROGRESIÓN (VERSIÓN SEGURA SIN GRÁFICAS EXTERNAS) ---
  const getCleanProgression = () => {
    const exercises: Record<string, any> = {};
    workouts.filter(w => w.completed && w.completion_data).forEach(w => {
      w.completion_data.exercise_results?.forEach((r: any) => {
        if (r.completed_sets > 0) {
          const name = r.name;
          const weight = parseFloat(r.logged_weight) || 0;
          const reps = parseInt(r.logged_reps) || 0;
          if (!exercises[name]) exercises[name] = { name, maxWeight: 0, maxReps: 0, history: [] };
          if (weight > exercises[name].maxWeight) { exercises[name].maxWeight = weight; exercises[name].maxReps = reps; }
          exercises[name].history.push({ date: w.date, weight, reps });
        }
      });
    });
    return Object.values(exercises).sort((a: any, b: any) => a.name.localeCompare(b.name));
  };

  const renderDashboard = () => {
    const recentObs = workouts.filter(w => w.observations).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
    return (
      <View style={styles.dashboardContainer}>
        <Text style={[styles.dashboardSectionTitle, { color: colors.textPrimary }]}>Feedback Reciente</Text>
        {recentObs.map(w => (
          <View key={w.id} style={[styles.obsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.obsHeader}><Text style={[styles.obsWorkoutTitle, { color: colors.textPrimary }]}>{w.title}</Text><Text style={[styles.obsDate, { color: colors.textSecondary }]}>{w.date}</Text></View>
            <View style={[styles.obsTextContainer, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.obsText, { color: colors.textPrimary }]}>"{w.observations}"</Text></View>
          </View>
        ))}
      </View>
    );
  };

  const renderProgressionItem = ({ item }: { item: any }) => {
    const isExpanded = expandedExercise === item.name;
    const sortedHistory = [...item.history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return (
      <View style={[styles.progCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity style={styles.progHeader} onPress={() => setExpandedExercise(isExpanded ? null : item.name)}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.progName, { color: colors.textPrimary }]}>{item.name}</Text>
            <Text style={[styles.pbText, { color: colors.textSecondary }]}><Ionicons name="trophy" size={12} color="#FFD700" /> Récord: {item.maxWeight}kg x {item.maxReps}</Text>
          </View>
          <Ionicons name={isExpanded ? "chevron-up" : "chevron-forward"} size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        {isExpanded && (
          <View style={styles.historyList}>
            {sortedHistory.map((h, i) => (
              <View key={i} style={styles.historyRow}><Text style={styles.historyDate}>{h.date}</Text><Text style={styles.historyVal}>{h.weight}kg x {h.reps}</Text></View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const data = activeTab === 'dashboard' ? [1] : activeTab === 'workouts' ? workouts : activeTab === 'tests' ? tests : getCleanProgression();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="arrow-back" size={24} color={colors.textPrimary} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{params.name}</Text>
        <TouchableOpacity onPress={onRefresh} style={{ padding: 4 }}><Ionicons name="sync-outline" size={22} color={colors.primary} /></TouchableOpacity>
      </View>

      <FlatList
        data={data}
        keyExtractor={(item, index) => index.toString()}
        ListHeaderComponent={
          <View style={{ padding: 16 }}>
            <View style={styles.tabsWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {['dashboard', 'workouts', 'tests', 'progression'].map((t) => (
                  <TouchableOpacity key={t} style={[styles.tab, activeTab === t && { borderBottomWidth: 2, borderBottomColor: colors.primary }]} onPress={() => setActiveTab(t as any)}>
                    <Text style={[styles.tabText, { color: activeTab === t ? colors.primary : colors.textSecondary }]}>{t.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        }
        renderItem={activeTab === 'dashboard' ? renderDashboard : activeTab === 'workouts' ? null : activeTab === 'tests' ? null : renderProgressionItem}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {/* MODAL DUPLICAR */}
      <Modal visible={!!duplicateModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={styles.modalTitle}>Duplicar en fecha:</Text>
            <TextInput style={styles.modalInput} value={duplicateDate} onChangeText={setDuplicateDate} />
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setDuplicateModal(null)}><Text>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleDuplicate}><Text style={{ color: colors.primary }}>Confirmar</Text></TouchableOpacity>
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
  tabsWrapper: { borderBottomWidth: 1, borderBottomColor: '#eee', marginBottom: 16 },
  tab: { paddingHorizontal: 16, paddingVertical: 12 },
  tabText: { fontSize: 12, fontWeight: '700' },
  listContent: { padding: 16 },
  dashboardContainer: { padding: 16 },
  dashboardSectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  obsCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  obsHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  obsWorkoutTitle: { fontWeight: '700' },
  obsDate: { fontSize: 11 },
  obsTextContainer: { padding: 10, borderRadius: 8 },
  obsText: { fontStyle: 'italic', fontSize: 13 },
  progCard: { marginHorizontal: 16, marginBottom: 10, borderRadius: 12, borderWidth: 1 },
  progHeader: { padding: 14, flexDirection: 'row', alignItems: 'center' },
  progName: { fontWeight: '700', fontSize: 15 },
  pbText: { fontSize: 12, marginTop: 2 },
  historyList: { padding: 14, borderTopWidth: 1, borderTopColor: '#eee' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  historyDate: { fontSize: 12, color: '#666' },
  historyVal: { fontSize: 12, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 40 },
  modalCard: { padding: 20, borderRadius: 12 },
  modalTitle: { fontWeight: '700', marginBottom: 10 },
  modalInput: { borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 8, marginBottom: 20 },
  modalBtns: { flexDirection: 'row', justifyContent: 'space-between' }
});
