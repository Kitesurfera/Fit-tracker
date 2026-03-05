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

  // Estados
  const [workouts, setWorkouts] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showWellness, setShowWellness] = useState(false);

  // Lógica de roles
  const isTrainer = user?.role === 'trainer';
  const firstName = user?.name?.split(' ')[0] || 'Usuario';
  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      if (isTrainer) {
        // Carga para Andreina
        const athletesData = await api.getAthletes();
        setAthletes(athletesData);
      } else {
        // Carga para Claudia o deportistas
        const [wData, sData] = await Promise.all([
          api.getWorkouts(),
          api.getSummary()
        ]);
        setWorkouts(wData);
        setSummary(sData);
      }
    } catch (e) {
      console.log("Error cargando dashboard:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // --- VISTA ENTRENADOR (Panel de Gestión) ---
  const TrainerView = () => (
    <FlatList
      data={athletes}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.container}>
          <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{today}</Text>
          <Text style={[styles.welcomeText, { color: colors.textPrimary }]}>
            Hola, {firstName} 📋
          </Text>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 25 }]}>
            MIS DEPORTISTAS BAJO CONTROL
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity 
          style={[styles.card, { backgroundColor: colors.surface }]}
          onPress={() => router.push(`/athletes/${item.id}`)}
        >
          <View style={[styles.avatarCircle, { backgroundColor: colors.primary + '15' }]}>
            <Text style={{ color: colors.primary, fontWeight: '800' }}>{item.name.charAt(0)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.name}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.sport || 'Especialidad'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.border} />
        </TouchableOpacity>
      )}
      contentContainerStyle={{ paddingBottom: 40 }}
    />
  );

  // --- VISTA DEPORTISTA (Panel de Rendimiento) ---
  const AthleteView = () => (
    <FlatList
      data={workouts}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{today}</Text>
              <Text style={[styles.welcomeText, { color: colors.textPrimary }]}>
                Hola, {firstName} 🤙
              </Text>
            </View>
          </View>

          {/* MÉTRICAS DE SALUD (STRAVA / APPLE WATCH) */}
          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="heart" size={20} color={colors.error} />
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                {summary?.latest_tests?.hr_rest?.value || '--'} <Text style={styles.metricUnit}>bpm</Text>
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>PULSO REPOSO</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="footsteps" size={20} color={colors.primary} />
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                {summary?.latest_wellness?.steps || '0'}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>PASOS HOY</Text>
            </View>
          </View>

          {/* ACCESOS RÁPIDOS */}
          <View style={styles.quickActions}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface }]} onPress={() => setShowWellness(true)}>
              <Ionicons name="pulse-outline" size={20} color={colors.success} />
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Wellness</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface }]} onPress={() => router.push('/analytics')}>
              <Ionicons name="analytics-outline" size={20} color={colors.primary} />
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Progreso</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>TUS SESIONES PROGRAMADAS</Text>
          
          {workouts.length === 0 && (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="cafe-outline" size={30} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No hay entrenos programados. ¡Buen momento para recuperar!
              </Text>
            </View>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity 
          style={[styles.card, { backgroundColor: colors.surface }]}
          onPress={() => router.push({ pathname: '/training-mode', params: { workoutId: item.id } })}
        >
          <View style={[styles.avatarCircle, { backgroundColor: colors.primary + '10' }]}>
            <Ionicons name="barbell-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.title}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.date}</Text>
          </View>
          <Ionicons name="play-circle-outline" size={24} color={colors.primary} />
        </TouchableOpacity>
      )}
      contentContainerStyle={{ paddingBottom: 40 }}
    />
  );

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {isTrainer ? <TrainerView /> : <AthleteView />}
      
      <WellnessModal 
        isVisible={showWellness} 
        onClose={() => { setShowWellness(false); loadData(); }} 
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  dateLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  welcomeText: { fontSize: 28, fontWeight: '900', marginTop: 4 },
  metricsGrid: { flexDirection: 'row', gap: 15, marginBottom: 20 },
  metricCard: { flex: 1, padding: 18, borderRadius: 24, alignItems: 'center', elevation: 2 },
  metricValue: { fontSize: 22, fontWeight: '900', marginTop: 8 },
  metricUnit: { fontSize: 12, fontWeight: '400' },
  metricLabel: { fontSize: 9, fontWeight: '700', marginTop: 4, letterSpacing: 1 },
  quickActions: { flexDirection: 'row', gap: 12, marginBottom: 25 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, elevation: 1 },
  actionText: { fontWeight: '700', fontSize: 14 },
  sectionTitle: { fontSize: 11, fontWeight: '800', marginBottom: 15, marginLeft: 5, letterSpacing: 1.2 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 20, marginHorizontal: 20, marginBottom: 12, elevation: 1 },
  avatarCircle: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  emptyCard: { padding: 40, borderRadius: 24, borderStyle: 'dashed', borderWidth: 1, borderColor: '#ccc', alignItems: 'center' },
  emptyText: { textAlign: 'center', marginTop: 10, fontSize: 13, lineHeight: 18 }
});
