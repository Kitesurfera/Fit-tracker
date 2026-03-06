import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  ActivityIndicator, RefreshControl 
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
  const [athletes, setAthletes] = useState([]);
  const [summary, setSummary] = useState(null);
  const [activeMicro, setActiveMicro] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showWellness, setShowWellness] = useState(false);

  const isTrainer = user?.role === 'trainer';
  const firstName = user?.name?.split(' ')[0] || 'Usuario';
  const todayStr = new Date().toISOString().split('T')[0];
  const todayLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      if (isTrainer) {
        const athletesData = await api.getAthletes();
        setAthletes(athletesData);
      } else {
        const [wData, sData, treeData] = await Promise.all([
          api.getWorkouts(),
          api.getSummary(),
          api.getPeriodizationTree(user.id)
        ]);
        setWorkouts(wData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setSummary(sData);

        let foundMicro = null;
        treeData.forEach(macro => {
          macro.microciclos.forEach(micro => {
            if (todayStr >= micro.fecha_inicio && todayStr <= micro.fecha_fin) {
              foundMicro = { ...micro, macroNombre: macro.nombre };
            }
          });
        });
        setActiveMicro(foundMicro);
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

  const TrainerView = () => (
    <FlatList
      data={athletes}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.container}>
          <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{todayLabel}</Text>
          <Text style={[styles.welcomeText, { color: colors.textPrimary }]}>Hola, {firstName} 📋</Text>
          <Text style={styles.sectionTitle}>MIS DEPORTISTAS</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity style={[styles.card, { backgroundColor: colors.surface }]} onPress={() => router.push(`/athletes/${item.id}`)}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.primary + '15' }]}><Text style={{ color: colors.primary, fontWeight: '800' }}>{item.name.charAt(0)}</Text></View>
          <View style={{ flex: 1 }}><Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.name}</Text><Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.sport || 'Deportista'}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={colors.border} />
        </TouchableOpacity>
      )}
    />
  );

  const AthleteView = () => (
    <FlatList
      data={workouts}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.container}>
          <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{todayLabel}</Text>
          <Text style={[styles.welcomeText, { color: colors.textPrimary }]}>Hola, {firstName} 🤙</Text>

          {/* MICROCICLO ACTUAL */}
          <View style={[styles.phaseCard, { backgroundColor: activeMicro?.color || colors.primary }]}>
            <View style={styles.phaseInfo}>
              <Text style={styles.phaseLabel}>FASE ACTUAL</Text>
              <Text style={styles.phaseName}>{activeMicro ? activeMicro.nombre : 'Sin fase activa'}</Text>
              <Text style={styles.macroRef}>{activeMicro ? `Macro: ${activeMicro.macroNombre}` : 'Sin planificación'}</Text>
            </View>
            <View style={styles.phaseBadge}><Text style={styles.phaseBadgeText}>{activeMicro?.tipo || 'REPOSO'}</Text></View>
          </View>

          {/* ESTADO WELLNESS */}
          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="heart" size={22} color={colors.error} />
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                {summary?.latest_wellness?.hr_rest || '--'} <Text style={styles.metricUnit}>bpm</Text>
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>PULSO REPOSO</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="footsteps" size={22} color={colors.primary} />
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                {summary?.latest_wellness?.steps || '0'}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>PASOS HOY</Text>
            </View>
          </View>

          <View style={styles.quickActions}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface }]} onPress={() => setShowWellness(true)}>
              <Ionicons name="add-circle" size={20} color={colors.success} /><Text style={[styles.actionText, { color: colors.textPrimary }]}>Registrar Wellness</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface }]} onPress={() => router.push('/analytics')}>
              <Ionicons name="analytics" size={20} color={colors.primary} /><Text style={[styles.actionText, { color: colors.textPrimary }]}>Ver Progreso</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>SESIONES PROGRAMADAS</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity 
          style={[styles.card, { backgroundColor: colors.surface, opacity: item.completed ? 0.7 : 1 }]}
          onPress={() => router.push({ pathname: '/training-mode', params: { workoutId: item.id } })}
        >
          <View style={[styles.avatarCircle, { backgroundColor: item.completed ? colors.success + '15' : colors.primary + '15' }]}>
            <Ionicons name={item.completed ? "checkmark-done" : "barbell"} size={20} color={item.completed ? colors.success : colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary, textDecorationLine: item.completed ? 'line-through' : 'none' }]}>{item.title}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.date}</Text>
          </View>
          {item.completed ? <Text style={{ color: colors.success, fontSize: 10, fontWeight: '700' }}>HECHO</Text> : <Ionicons name="play" size={18} color={colors.primary} />}
        </TouchableOpacity>
      )}
    />
  );

  if (loading) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {isTrainer ? <TrainerView /> : <AthleteView />}
      <WellnessModal isVisible={showWellness} onClose={() => { setShowWellness(false); loadData(); }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  dateLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  welcomeText: { fontSize: 28, fontWeight: '900', marginTop: 5, marginBottom: 15 },
  phaseCard: { flexDirection: 'row', padding: 20, borderRadius: 24, marginBottom: 20, alignItems: 'center', elevation: 2 },
  phaseInfo: { flex: 1 },
  phaseLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  phaseName: { color: '#FFF', fontSize: 20, fontWeight: '900', marginTop: 2 },
  macroRef: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4 },
  phaseBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  phaseBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  metricsGrid: { flexDirection: 'row', gap: 15, marginBottom: 20 },
  metricCard: { flex: 1, padding: 18, borderRadius: 22, alignItems: 'center' },
  metricValue: { fontSize: 22, fontWeight: '900', marginTop: 5 },
  metricUnit: { fontSize: 12, fontWeight: '400' },
  metricLabel: { fontSize: 9, fontWeight: '700', marginTop: 2 },
  quickActions: { flexDirection: 'row', gap: 12, marginBottom: 25 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 16 },
  actionText: { fontWeight: '700' },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 15, letterSpacing: 1 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 20, marginHorizontal: 20, marginBottom: 10 },
  avatarCircle: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  cardTitle: { fontSize: 16, fontWeight: '700' }
});
