import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';

const TEST_LABELS: Record<string, string> = {
  squat_rm: 'Sentadilla RM',
  bench_rm: 'Press Banca RM',
  deadlift_rm: 'Peso Muerto RM',
  cmj: 'CMJ',
  sj: 'SJ',
  dj: 'DJ',
  hamstring: 'Isquiotibiales',
  calf: 'Gemelo',
  quadriceps: 'Cuadriceps',
  tibialis: 'Tibial',
  custom: 'Personalizado',
};

const CATEGORIES = [
  { key: 'all', label: 'Todos' },
  { key: 'strength', label: 'Fuerza' },
  { key: 'plyometrics', label: 'Pliometria' },
  { key: 'max_force', label: 'F. Maxima' },
];

export default function TestsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [tests, setTests] = useState<any[]>([]);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedAthlete, setSelectedAthlete] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const params: any = {};
      if (selectedCategory !== 'all') params.test_type = selectedCategory;
      if (selectedAthlete) params.athlete_id = selectedAthlete;
      const [ts, ath] = await Promise.all([
        api.getTests(params),
        user?.role === 'trainer' ? api.getAthletes() : Promise.resolve([]),
      ]);
      setTests(ts);
      setAthletes(ath);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, [selectedCategory, selectedAthlete]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const deleteTest = async (testId: string) => {
    try {
      await api.deleteTest(testId);
      setTests(prev => prev.filter(t => t.id !== testId));
    } catch (e) {
      console.log(e);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Tests Fisicos</Text>
        <TouchableOpacity
          testID="add-test-btn"
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/add-test')}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.key}
            style={[
              styles.filterChip,
              { borderColor: colors.border },
              selectedCategory === cat.key && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => setSelectedCategory(cat.key)}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.filterText,
              { color: colors.textSecondary },
              selectedCategory === cat.key && { color: '#FFF' },
            ]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {user?.role === 'trainer' && athletes.length > 0 && (
        <FlatList
          data={[{ id: null, name: 'Todos' }, ...athletes]}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id || 'all'}
          contentContainerStyle={styles.athleteFilter}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.athleteChip,
                { backgroundColor: colors.surfaceHighlight },
                selectedAthlete === item.id && { backgroundColor: colors.primary },
              ]}
              onPress={() => setSelectedAthlete(item.id)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.athleteChipText,
                { color: colors.textPrimary },
                selectedAthlete === item.id && { color: '#FFF' },
              ]}>
                {item.name}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          testID="tests-list"
          data={tests}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={[styles.testCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.testHeader}>
                <View style={[styles.typeBadge, { backgroundColor: item.test_type === 'strength' ? colors.primary + '20' : colors.accent + '20' }]}>
                  <Text style={[styles.typeBadgeText, { color: item.test_type === 'strength' ? colors.primary : colors.accent }]}>
                    {item.test_type === 'strength' ? 'FUERZA' : 'PLIO'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => deleteTest(item.id)} activeOpacity={0.7}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.testName, { color: colors.textPrimary }]}>
                {item.test_name === 'custom' ? item.custom_name : (TEST_LABELS[item.test_name] || item.test_name)}
              </Text>
              <View style={styles.testValueRow}>
                <Text style={[styles.testValue, { color: colors.textPrimary }]}>{item.value}</Text>
                <Text style={[styles.testUnit, { color: colors.textSecondary }]}>{item.unit}</Text>
              </View>
              <Text style={[styles.testDate, { color: colors.textSecondary }]}>{item.date}</Text>
              {item.notes ? <Text style={[styles.testNotes, { color: colors.textSecondary }]}>{item.notes}</Text> : null}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="analytics-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No hay tests registrados</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16 },
  screenTitle: { fontSize: 24, fontWeight: '700' },
  addBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 13, fontWeight: '600' },
  athleteFilter: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  athleteChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  athleteChipText: { fontSize: 13, fontWeight: '500' },
  listContent: { padding: 16, paddingBottom: 32 },
  testCard: { borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1 },
  testHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  typeBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  testName: { fontSize: 17, fontWeight: '600', marginBottom: 8 },
  testValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 4 },
  testValue: { fontSize: 32, fontWeight: '700' },
  testUnit: { fontSize: 16 },
  testDate: { fontSize: 13, marginTop: 4 },
  testNotes: { fontSize: 13, marginTop: 4, fontStyle: 'italic' },
  emptyState: { alignItems: 'center', paddingTop: 48, gap: 12 },
  emptyText: { fontSize: 16, fontWeight: '500' },
});
