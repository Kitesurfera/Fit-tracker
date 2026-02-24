import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert, RefreshControl
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
  const [tests, setTests] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'workouts' | 'tests'>('workouts');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const handleDeleteAthlete = () => {
    Alert.alert('Eliminar deportista', `Estas seguro de eliminar a ${params.name}? Se eliminaran todos sus datos.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          try {
            await api.deleteAthlete(params.id!);
            router.back();
          } catch (e) {
            console.log(e);
          }
        }
      },
    ]);
  };

  const handleDeleteWorkout = async (wId: string) => {
    try {
      await api.deleteWorkout(wId);
      setWorkouts(prev => prev.filter(w => w.id !== wId));
    } catch (e) {
      console.log(e);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
      </SafeAreaView>
    );
  }

  const data = activeTab === 'workouts' ? workouts : tests;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-athlete-detail" activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{params.name}</Text>
        <TouchableOpacity onPress={handleDeleteAthlete} testID="delete-athlete-btn" activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={22} color={colors.error} />
        </TouchableOpacity>
      </View>

      {/* Profile Card */}
      <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {athlete?.name?.charAt(0)?.toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: colors.textPrimary }]}>{athlete?.name}</Text>
          <Text style={[styles.profileSub, { color: colors.textSecondary }]}>{athlete?.email}</Text>
          <Text style={[styles.profileSub, { color: colors.textSecondary }]}>
            {athlete?.sport || 'Sin deporte'} {athlete?.position ? `· ${athlete.position}` : ''}
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>{workouts.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Entrenos</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>{tests.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Tests</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.success }]}>
            {workouts.filter(w => w.completed).length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Completados</Text>
        </View>
      </View>

      {/* Tab selector */}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'workouts' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('workouts')} activeOpacity={0.7}
        >
          <Text style={[styles.tabText, { color: activeTab === 'workouts' ? colors.primary : colors.textSecondary }]}>
            Entrenamientos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'tests' && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('tests')} activeOpacity={0.7}
        >
          <Text style={[styles.tabText, { color: activeTab === 'tests' ? colors.accent : colors.textSecondary }]}>
            Tests
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        testID="athlete-detail-list"
        data={data}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          activeTab === 'workouts' ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.title}</Text>
                  <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                    {item.date} · {item.exercises?.length || 0} ejercicios
                  </Text>
                </View>
                <View style={styles.cardActions}>
                  {item.completed && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  )}
                  <TouchableOpacity onPress={() => handleDeleteWorkout(item.id)} activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                {item.test_name === 'custom' ? item.custom_name : item.test_name}
              </Text>
              <View style={styles.testValueRow}>
                <Text style={[styles.testVal, { color: colors.primary }]}>{item.value}</Text>
                <Text style={[styles.testUnit, { color: colors.textSecondary }]}>{item.unit}</Text>
              </View>
              <Text style={[styles.cardSub, { color: colors.textSecondary }]}>{item.date}</Text>
            </View>
          )
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons
              name={activeTab === 'workouts' ? 'barbell-outline' : 'analytics-outline'}
              size={40} color={colors.textSecondary}
            />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Sin {activeTab === 'workouts' ? 'entrenamientos' : 'tests'}
            </Text>
          </View>
        }
      />

      {/* Quick action buttons */}
      <View style={styles.fabRow}>
        <TouchableOpacity
          testID="fab-add-workout"
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/add-workout')}
          activeOpacity={0.7}
        >
          <Ionicons name="barbell-outline" size={22} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity
          testID="fab-add-test"
          style={[styles.fab, { backgroundColor: colors.accent }]}
          onPress={() => router.push('/add-test')}
          activeOpacity={0.7}
        >
          <Ionicons name="analytics-outline" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', margin: 16, borderRadius: 12, padding: 16, borderWidth: 1,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 24, fontWeight: '700' },
  profileInfo: { marginLeft: 14, flex: 1 },
  profileName: { fontSize: 18, fontWeight: '600' },
  profileSub: { fontSize: 13, marginTop: 2 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 16 },
  statBox: { flex: 1, borderRadius: 10, padding: 14, borderWidth: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  tabs: { flexDirection: 'row', borderBottomWidth: 0.5, marginHorizontal: 16 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 15, fontWeight: '600' },
  listContent: { padding: 16, paddingBottom: 100 },
  card: { borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 13, marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  testValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 6 },
  testVal: { fontSize: 24, fontWeight: '700' },
  testUnit: { fontSize: 14 },
  emptyState: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyText: { fontSize: 15 },
  fabRow: { position: 'absolute', bottom: 24, right: 16, flexDirection: 'row', gap: 12 },
  fab: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
});
