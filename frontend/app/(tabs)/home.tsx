import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
import TutorialOverlay from '../../src/components/TutorialOverlay';
import WellnessModal from '../../src/components/WellnessModal'; // NUEVO IMPORT
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function HomeScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  
  const [athletes, setAthletes] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [showTutorial, setShowTutorial] = useState(false);
  const [showWellness, setShowWellness] = useState(false); // NUEVO ESTADO

  const loadData = async () => {
    try {
      if (user?.role === 'trainer') {
        const [ath, wk] = await Promise.all([api.getAthletes(), api.getWorkouts()]);
        setAthletes(ath);
        setWorkouts(wk.slice(0, 5));
      } else {
        const [wk, sum] = await Promise.all([api.getWorkouts(), api.getSummary()]);
        setWorkouts(wk.slice(0, 10));
        setSummary(sum);
      }
    } catch (e) {
      console.log('Load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const checkInitialStates = async () => {
      try {
        // 1. Comprobar Tutorial
        const hasSeenTutorial = await AsyncStorage.getItem('has_seen_tutorial');
        if (hasSeenTutorial !== 'true') {
          setShowTutorial(true);
        }

        // 2. Comprobar Wellness (solo si eres atleta)
        if (user?.role === 'athlete') {
          const res = await api.checkTodayWellness();
          if (!res.submitted) {
            setShowWellness(true);
          }
        }
      } catch (error) {
        console.log('Error al leer estados iniciales:', error);
      }
    };

    checkInitialStates();
    loadData();
  }, [user]);

  const closeTutorial = async () => {
    try {
      await AsyncStorage.setItem('has_seen_tutorial', 'true');
      setShowTutorial(false);
    } catch (error) {
      setShowTutorial(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); loadData(); };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
      </SafeAreaView>
    );
  }

  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const tObj = new Date();
  const todayYMD = `${tObj.getFullYear()}-${String(tObj.getMonth() + 1).padStart(2, '0')}-${String(tObj.getDate()).padStart(2, '0')}`;

  const TrainerView = () => (
    <FlatList
      testID="trainer-dashboard"
      data={athletes}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={[styles.date, { color: colors.textSecondary }]}>{today}</Text>
              <Text style={[styles.greeting, { color: colors.textPrimary }]}>Hola, {user?.name?.split(' ')[0]}</Text>
            </View>
            <TouchableOpacity onPress={onRefresh} disabled={refreshing} style={styles.refreshBtn}>
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="sync-outline" size={26} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{athletes.length}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Deportistas</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{workouts.length}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Entrenos</Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              testID="add-athlete-btn"
              style={[styles.actionBtn, { backgroundColor: colors.primary }] }
              onPress={() => router.push('/add-athlete')}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add-outline" size={18} color="#FFF" />
              <Text style={styles.actionBtnText}>Nuevo deportista</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="add-workout-btn"
              style={[styles.actionBtnOutline, { borderColor: colors.primary }]}
              onPress={() => router.push('/add-workout')}
              activeOpacity={0.7}
            >
              <Ionicons name="barbell-outline" size={18} color={colors.primary} />
              <Text style={[styles.actionBtnOutlineText, { color: colors.primary }]}>Nuevo entreno</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Deportistas{athletes.length > 0 ? ` (${athletes.length})` : ''}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.surface }]}
          onPress={() => router.push({ pathname: '/athlete-detail', params: { id: item.id, name: item.name } })}
        >
          <View style={[styles.avatar, { backgroundColor: colors.primary + '15' }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>{item.name?.charAt(0)?.toUpperCase()}</Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.name}</Text>
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>{item.sport || 'Kitesurf'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
      contentContainerStyle={styles.listContent}
    />
  );

  const AthleteView = () => (
    <FlatList
      testID="athlete-dashboard"
      data={workouts}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={[styles.date, { color: colors.textSecondary }]}>{today}</Text>
              <Text style={[styles.greeting, { color: colors.textPrimary }]}>Hola, {user?.name?.split(' ')[0]}</Text>
            </View>
            <TouchableOpacity onPress={onRefresh} disabled={refreshing} style={styles.refreshBtn}>
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="sync-outline" size={26} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>

          {summary && (
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.statValue, { color: colors.primary }]}>{summary.week_workouts}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Esta semana</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.statValue, { color: colors.success }]}>{summary.completion_rate}%</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Completados</Text>
              </View>
            </View>
          )}
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Mis entrenamientos</Text>
        </View>
      }
      renderItem={({ item }) => {
        const isMissed = !item.completed && item.date < todayYMD;
        return (
          <TouchableOpacity
            style={[styles.workoutCard, { backgroundColor: colors.surface }]}
            onPress={() => !item.completed && router.push({ pathname: '/training-mode', params: { workoutId: item.id } })}
          >
            <View style={styles.workoutTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.workoutTitle, { color: colors.textPrimary }]}>{item.title}</Text>
                <Text style={[styles.workoutDate, { color: colors.textSecondary }]}>{item.date}</Text>
              </View>
              {item.completed ? (
                <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              ) : isMissed ? (
                <Ionicons name="close-circle" size={24} color={colors.error} />
              ) : (
                <Ionicons name="time-outline" size={24} color={colors.primary} />
              )}
            </View>
          </TouchableOpacity>
        );
      }}
      contentContainerStyle={styles.listContent}
    />
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {user?.role === 'trainer' ? <TrainerView /> : <AthleteView />}
      
      {/* CAPA DE TUTORIAL */}
      {showTutorial && (
        <TutorialOverlay 
          role={user?.role || 'athlete'} 
          isVisible={showTutorial} 
          onClose={closeTutorial} 
        />
      )}

      {/* MODAL DE WELLNESS DIARIO */}
      <WellnessModal 
        isVisible={showWellness} 
        onClose={() => setShowWellness(false)} 
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 20, paddingBottom: 32 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  refreshBtn: { padding: 8 },
  date: { fontSize: 13, fontWeight: '500', textTransform: 'capitalize', marginBottom: 4 },
  greeting: { fontSize: 26, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: { flex: 1, borderRadius: 14, padding: 18, alignItems: 'center' },
  statValue: { fontSize: 26, fontWeight: '700' },
  statLabel: { fontSize: 12, fontWeight: '500', marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 14 },
  actionBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  actionBtnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 14, borderWidth: 1.5 },
  actionBtnOutlineText: { fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginBottom: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 17, fontWeight: '700' },
  cardContent: { flex: 1, marginLeft: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 13, marginTop: 2 },
  workoutCard: { borderRadius: 14, padding: 16, marginBottom: 12 },
  workoutTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  workoutTitle: { fontSize: 16, fontWeight: '600' },
  workoutDate: { fontSize: 13, marginTop: 2 },
});
