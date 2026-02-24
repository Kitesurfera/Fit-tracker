import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
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
  custom: 'Personalizado',
};

export default function AnalyticsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [summary, setSummary] = useState<any>(null);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const targetId = user?.role === 'trainer' ? selectedAthlete : user?.id;
      if (user?.role === 'trainer') {
        const ath = await api.getAthletes();
        setAthletes(ath);
        if (!targetId && ath.length > 0) {
          setSelectedAthlete(ath[0].id);
          return;
        }
      }
      if (targetId) {
        const [sum, prog] = await Promise.all([
          api.getSummary(targetId),
          api.getProgress(targetId),
        ]);
        setSummary(sum);
        setProgress(prog);
      } else if (user?.role === 'athlete') {
        const [sum, prog] = await Promise.all([
          api.getSummary(),
          api.getProgress(user?.id || ''),
        ]);
        setSummary(sum);
        setProgress(prog);
      }
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, [selectedAthlete]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const progressEntries = Object.entries(progress);

  const renderProgressCard = ({ item }: { item: [string, any] }) => {
    const [testName, data] = item;
    const label = testName === 'custom' ? (data.latest?.custom_name || 'Custom') : (TEST_LABELS[testName] || testName);
    const isPositive = data.change_percent >= 0;
    const barWidth = data.history?.length > 0 ? Math.min(100, Math.max(10, data.history.length * 15)) : 10;

    return (
      <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.progressHeader}>
          <Text style={[styles.progressName, { color: colors.textPrimary }]}>{label}</Text>
          <View style={[styles.changeBadge, { backgroundColor: isPositive ? colors.success + '20' : colors.error + '20' }]}>
            <Ionicons
              name={isPositive ? 'trending-up' : 'trending-down'}
              size={14}
              color={isPositive ? colors.success : colors.error}
            />
            <Text style={[styles.changeText, { color: isPositive ? colors.success : colors.error }]}>
              {isPositive ? '+' : ''}{data.change_percent}%
            </Text>
          </View>
        </View>
        {data.latest && (
          <View style={styles.latestRow}>
            <Text style={[styles.latestValue, { color: colors.textPrimary }]}>{data.latest.value}</Text>
            <Text style={[styles.latestUnit, { color: colors.textSecondary }]}>{data.latest.unit}</Text>
          </View>
        )}
        {/* Mini bar chart */}
        {data.history?.length > 1 && (
          <View style={styles.miniChart}>
            {data.history.slice(-8).map((h: any, i: number) => {
              const maxVal = Math.max(...data.history.map((x: any) => x.value));
              const heightPct = maxVal > 0 ? (h.value / maxVal) * 100 : 50;
              return (
                <View key={i} style={styles.barWrapper}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${heightPct}%`,
                        backgroundColor: i === data.history.slice(-8).length - 1 ? colors.primary : colors.surfaceHighlight,
                      },
                    ]}
                  />
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Rendimiento</Text>

      {user?.role === 'trainer' && athletes.length > 0 && (
        <FlatList
          data={athletes}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
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
          testID="analytics-list"
          data={progressEntries}
          keyExtractor={(item) => item[0]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListHeaderComponent={
            summary ? (
              <View style={styles.summarySection}>
                <View style={styles.summaryRow}>
                  <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="barbell-outline" size={24} color={colors.primary} />
                    <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{summary.total_workouts}</Text>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Entrenos</Text>
                  </View>
                  <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="checkmark-circle-outline" size={24} color={colors.success} />
                    <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{summary.completion_rate}%</Text>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Completados</Text>
                  </View>
                </View>
                <View style={styles.summaryRow}>
                  <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="flash-outline" size={24} color={colors.warning} />
                    <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{summary.week_workouts}</Text>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Esta Semana</Text>
                  </View>
                  <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="analytics-outline" size={24} color={colors.accent} />
                    <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{summary.total_tests}</Text>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Tests</Text>
                  </View>
                </View>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Progreso por Test</Text>
              </View>
            ) : null
          }
          renderItem={renderProgressCard}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="trending-up-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {user?.role === 'trainer' && athletes.length === 0
                  ? 'Crea deportistas para ver su rendimiento'
                  : 'Registra tests para ver tu progreso'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screenTitle: { fontSize: 24, fontWeight: '700', paddingHorizontal: 16, paddingTop: 16 },
  athleteFilter: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  athleteChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  athleteChipText: { fontSize: 13, fontWeight: '500' },
  listContent: { padding: 16, paddingBottom: 32 },
  summarySection: { marginBottom: 8 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  summaryCard: {
    flex: 1, borderRadius: 12, padding: 16, borderWidth: 1, alignItems: 'center', gap: 6,
  },
  summaryValue: { fontSize: 28, fontWeight: '700' },
  summaryLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  progressCard: { borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressName: { fontSize: 16, fontWeight: '600' },
  changeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  changeText: { fontSize: 13, fontWeight: '600' },
  latestRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 12 },
  latestValue: { fontSize: 32, fontWeight: '700' },
  latestUnit: { fontSize: 16 },
  miniChart: { flexDirection: 'row', alignItems: 'flex-end', height: 48, gap: 4, marginTop: 8 },
  barWrapper: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 3, minHeight: 4 },
  emptyState: { alignItems: 'center', paddingTop: 48, gap: 12 },
  emptyText: { fontSize: 16, fontWeight: '500', textAlign: 'center' },
});
