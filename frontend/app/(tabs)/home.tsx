import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  ActivityIndicator, RefreshControl, ScrollView 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
import WellnessModal from '../../src/components/WellnessModal';

export default function HomeScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();

  const [workouts, setWorkouts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showWellness, setShowWellness] = useState(false);

  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [wData, sData] = await Promise.all([
        api.getWorkouts(),
        api.getSummary()
      ]);
      setWorkouts(wData);
      setSummary(sData);
    } catch (e) {
      console.log("Error cargando dashboard", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const AthleteView = () => (
    <FlatList
      data={workouts.slice(0, 3)} // Solo los 3 más recientes
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.container}>
          {/* CABECERA */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{today}</Text>
              <Text style={[styles.welcomeText, { color: colors.textPrimary }]}>Hola, Claudia 🤙</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/settings')} style={[styles.avatarBtn, { backgroundColor: colors.surfaceHighlight }]}>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>{user?.name?.charAt(0)}</Text>
            </TouchableOpacity>
          </View>

          {/* MÉTRICAS DE SALUD (STRAVA / APPLE WATCH) */}
          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="heart" size={24} color={colors.error} />
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                {summary?.latest_tests?.hr_rest?.value || '--'} <Text style={styles.metricUnit}>bpm</Text>
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>PULSO REPOSO</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="footsteps" size={24} color={colors.primary} />
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                {summary?.latest_wellness?.steps || '0'}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>PASOS HOY</Text>
            </View>
          </View>

          {/* ACCESOS RÁPIDOS */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ACCESO RÁPIDO</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface }]} onPress={() => setShowWellness(true)}>
              <Ionicons name="add-circle" size={20} color={colors.success} />
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Wellness</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface }]} onPress={() => router.push('/analytics')}>
              <Ionicons name="stats-chart" size={20} color={colors.primary} />
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Progreso</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PRÓXIMOS ENTRENOS</Text>

          {/* ESTADO VACÍO */}
          {workouts.length === 0 && (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="sunny-outline" size={40} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                ¡Día libre! Aprovecha para recuperar o Andreina subirá pronto tu sesión.
              </Text>
            </View>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity 
          style={[styles.workoutCard, { backgroundColor: colors.surface }]}
          onPress={() => router.push({ pathname: '/training-mode', params: { workoutId: item.id } })}
        >
          <View style={styles.workoutIcon}>
            <Ionicons name="barbell" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.workoutTitle, { color: colors.textPrimary }]}>{item.title}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.date}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.border} />
        </TouchableOpacity>
      )}
      contentContainerStyle={{ paddingBottom: 100 }}
    />
  );

  if (loading) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <AthleteView />
      <WellnessModal isVisible={showWellness} onClose={() => { setShowWellness(false); loadData(); }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  dateLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  welcomeText: { fontSize: 24, fontWeight: '900' },
  avatarBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  metricsRow: { flexDirection: 'row', gap: 15, marginBottom: 25 },
  metricCard: { flex: 1, padding: 20, borderRadius: 20, alignItems: 'center', elevation: 2 },
  metricValue: { fontSize: 22, fontWeight: '900', marginTop: 10 },
  metricUnit: { fontSize: 12, fontWeight: '400' },
  metricLabel: { fontSize: 10, fontWeight: '700', marginTop: 5, letterSpacing: 1 },
  sectionTitle: { fontSize: 11, fontWeight: '800', marginBottom: 15, marginTop: 10, letterSpacing: 1 },
  quickActions: { flexDirection: 'row', gap: 15, marginBottom: 30 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 15, borderRadius: 15 },
  actionText: { fontWeight: '700' },
  workoutCard: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 18, marginHorizontal: 20, marginBottom: 12 },
  workoutIcon: { width: 45, height: 45, borderRadius: 12, backgroundColor: '#4A90E215', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  workoutTitle: { fontSize: 16, fontWeight: '700' },
  emptyCard: { padding: 30, borderRadius: 20, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#ccc' },
  emptyText: { textAlign: 'center', marginTop: 15, fontSize: 14, lineHeight: 20 }
});
