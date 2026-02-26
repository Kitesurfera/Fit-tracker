import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';

const TEST_LABELS: Record<string, string> = {
  squat_rm: 'Sentadilla RM', bench_rm: 'Press Banca RM', deadlift_rm: 'Peso Muerto RM',
  cmj: 'CMJ', sj: 'SJ', dj: 'DJ',
  hamstring: 'Isquiotibiales', calf: 'Gemelo', quadriceps: 'Cuadriceps', tibialis: 'Tibial',
};

const TEST_ICONS: Record<string, string> = {
  squat_rm: 'barbell', bench_rm: 'barbell', deadlift_rm: 'barbell',
  cmj: 'flash', sj: 'flash', dj: 'flash',
  hamstring: 'fitness', calf: 'fitness', quadriceps: 'fitness', tibialis: 'fitness',
};

type Section = 'overview' | 'force' | 'progress';

export default function AnalyticsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [summary, setSummary] = useState<any>(null);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('overview');

  const loadData = async () => {
    try {
      let targetId = user?.role === 'trainer' ? selectedAthlete : user?.id;
      if (user?.role === 'trainer') {
        const ath = await api.getAthletes();
        setAthletes(ath);
        if (!targetId && ath.length > 0) {
          setSelectedAthlete(ath[0].id);
          return;
        }
      }
      if (targetId) {
        const [sum, prog, wk] = await Promise.all([
          api.getSummary(targetId),
          api.getProgress(targetId),
          api.getWorkouts({ athlete_id: targetId }),
        ]);
        setSummary(sum);
        setProgress(prog);
        setWorkouts(wk);
      }
    } catch (e) { console.log(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { loadData(); }, [selectedAthlete]);
  const onRefresh = () => { setRefreshing(true); loadData(); };

  const progressEntries = Object.entries(progress);
  const forceTests = progressEntries.filter(([k, v]) => v.latest?.test_type === 'max_force');
  const otherTests = progressEntries.filter(([k, v]) => v.latest?.test_type !== 'max_force');

  // Compute PRs (best values)
  const prs = progressEntries.map(([name, data]) => {
    const hist = data.history || [];
    const best = hist.reduce((max: any, h: any) => (!max || h.value > max.value) ? h : max, null);
    return { name, best, label: name === 'custom' ? (data.latest?.custom_name || 'Custom') : (TEST_LABELS[name] || name), unit: data.latest?.unit };
  }).filter(p => p.best);

  // Compute series completion stats from workouts
  const computeSeriesStats = () => {
    let total = 0, completed = 0, skipped = 0;
    workouts.forEach(w => {
      const cd = w.completion_data;
      if (cd?.exercise_results) {
        cd.exercise_results.forEach((r: any) => {
          total += r.total_sets || 0;
          completed += r.completed_sets || 0;
          skipped += r.skipped_sets || 0;
        });
      } else if (w.completed) {
        (w.exercises || []).forEach((ex: any) => { const s = parseInt(ex.sets) || 0; total += s; completed += s; });
      } else {
        (w.exercises || []).forEach((ex: any) => { total += parseInt(ex.sets) || 0; });
      }
    });
    return { total, completed, skipped, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
  };

  const seriesStats = computeSeriesStats();

  // Asymmetry data for force tests
  const asymmetryData = forceTests.map(([name, data]) => {
    const latest = data.latest;
    if (!latest?.value_left || !latest?.value_right) return null;
    const left = latest.value_left;
    const right = latest.value_right;
    const max = Math.max(left, right);
    const asymmetry = max > 0 ? Math.abs(((left - right) / max) * 100) : 0;
    const dominant = left > right ? 'IZQ' : left < right ? 'DER' : 'IGUAL';
    return {
      name, label: TEST_LABELS[name] || name, left, right, unit: latest.unit,
      asymmetry: Math.round(asymmetry * 10) / 10, dominant,
    };
  }).filter(Boolean) as any[];

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.topHeader}>
        <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Rendimiento</Text>
      </View>

      {/* Athlete selector for trainers */}
      {user?.role === 'trainer' && athletes.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.athleteFilter}>
          {athletes.map(a => (
            <TouchableOpacity key={a.id}
              style={[styles.athleteChip, { backgroundColor: colors.surfaceHighlight }, selectedAthlete === a.id && { backgroundColor: colors.primary }]}
              onPress={() => setSelectedAthlete(a.id)} activeOpacity={0.7}>
              <Text style={[styles.athleteChipText, { color: colors.textPrimary }, selectedAthlete === a.id && { color: '#FFF' }]}>{a.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Section tabs */}
      <View style={[styles.sectionTabs, { borderBottomColor: colors.border }]}>
        {([
          { key: 'overview', label: 'Resumen', icon: 'grid-outline' },
          { key: 'force', label: 'Asimetria', icon: 'fitness-outline' },
          { key: 'progress', label: 'Progreso', icon: 'trending-up-outline' },
        ] as const).map(tab => (
          <TouchableOpacity key={tab.key}
            style={[styles.sectionTab, activeSection === tab.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveSection(tab.key)} activeOpacity={0.7}>
            <Ionicons name={tab.icon as any} size={16} color={activeSection === tab.key ? colors.primary : colors.textSecondary} />
            <Text style={[styles.sectionTabText, { color: activeSection === tab.key ? colors.primary : colors.textSecondary }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* OVERVIEW SECTION */}
        {activeSection === 'overview' && (
          <>
            {/* Main stats ring */}
            <View style={[styles.ringCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.ringRow}>
                <View style={styles.ringContainer}>
                  <View style={[styles.ringBg, { borderColor: colors.surfaceHighlight }]}>
                    <View style={[styles.ringProgress, {
                      borderColor: seriesStats.pct >= 75 ? colors.success : seriesStats.pct >= 40 ? colors.warning : colors.error,
                      borderTopColor: 'transparent',
                      transform: [{ rotate: `${(seriesStats.pct / 100) * 360}deg` }],
                    }]} />
                    <View style={styles.ringCenter}>
                      <Text style={[styles.ringPct, { color: colors.textPrimary }]}>{seriesStats.pct}%</Text>
                      <Text style={[styles.ringLabel, { color: colors.textSecondary }]}>Series</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.ringStats}>
                  <View style={styles.ringStatRow}>
                    <View style={[styles.ringDot, { backgroundColor: colors.success }]} />
                    <Text style={[styles.ringStatText, { color: colors.textSecondary }]}>Completadas</Text>
                    <Text style={[styles.ringStatVal, { color: colors.textPrimary }]}>{seriesStats.completed}</Text>
                  </View>
                  <View style={styles.ringStatRow}>
                    <View style={[styles.ringDot, { backgroundColor: colors.error }]} />
                    <Text style={[styles.ringStatText, { color: colors.textSecondary }]}>Saltadas</Text>
                    <Text style={[styles.ringStatVal, { color: colors.textPrimary }]}>{seriesStats.skipped}</Text>
                  </View>
                  <View style={styles.ringStatRow}>
                    <View style={[styles.ringDot, { backgroundColor: colors.border }]} />
                    <Text style={[styles.ringStatText, { color: colors.textSecondary }]}>Pendientes</Text>
                    <Text style={[styles.ringStatVal, { color: colors.textPrimary }]}>{seriesStats.total - seriesStats.completed - seriesStats.skipped}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Quick stats */}
            <View style={styles.quickStatsRow}>
              <View style={[styles.quickStat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="barbell-outline" size={20} color={colors.primary} />
                <Text style={[styles.quickStatVal, { color: colors.textPrimary }]}>{summary?.total_workouts || 0}</Text>
                <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>Entrenos</Text>
              </View>
              <View style={[styles.quickStat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="flash-outline" size={20} color={colors.warning} />
                <Text style={[styles.quickStatVal, { color: colors.textPrimary }]}>{summary?.week_workouts || 0}</Text>
                <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>Semana</Text>
              </View>
              <View style={[styles.quickStat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="analytics-outline" size={20} color={colors.accent} />
                <Text style={[styles.quickStatVal, { color: colors.textPrimary }]}>{summary?.total_tests || 0}</Text>
                <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>Tests</Text>
              </View>
            </View>

            {/* Personal Records */}
            {prs.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Records Personales</Text>
                <View style={styles.prGrid}>
                  {prs.map((pr, i) => (
                    <View key={i} style={[styles.prCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Ionicons name="trophy" size={18} color="#FFA000" />
                      <Text style={[styles.prLabel, { color: colors.textSecondary }]}>{pr.label}</Text>
                      <Text style={[styles.prValue, { color: colors.textPrimary }]}>{pr.best.value}</Text>
                      <Text style={[styles.prUnit, { color: colors.textSecondary }]}>{pr.unit}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Workout volume by day */}
            {workouts.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Volumen Semanal</Text>
                <View style={[styles.volumeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {(() => {
                    const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
                    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
                    workouts.forEach(w => {
                      const d = new Date(w.date);
                      const dow = d.getDay();
                      const idx = dow === 0 ? 6 : dow - 1;
                      dayCounts[idx]++;
                    });
                    const max = Math.max(...dayCounts, 1);
                    return (
                      <View style={styles.volumeChart}>
                        {days.map((d, i) => (
                          <View key={i} style={styles.volumeBarCol}>
                            <View style={styles.volumeBarWrapper}>
                              <View style={[styles.volumeBar, {
                                height: `${(dayCounts[i] / max) * 100}%`,
                                backgroundColor: dayCounts[i] > 0 ? colors.primary : colors.surfaceHighlight,
                              }]} />
                            </View>
                            <Text style={[styles.volumeDayLabel, { color: colors.textSecondary }]}>{d}</Text>
                            {dayCounts[i] > 0 && (
                              <Text style={[styles.volumeCount, { color: colors.textPrimary }]}>{dayCounts[i]}</Text>
                            )}
                          </View>
                        ))}
                      </View>
                    );
                  })()}
                </View>
              </>
            )}
          </>
        )}

        {/* ASYMMETRY SECTION */}
        {activeSection === 'force' && (
          <>
            {asymmetryData.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Asimetria Bilateral</Text>
                <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
                  Diferencia de fuerza entre lados. Ideal &lt;10%
                </Text>
                {asymmetryData.map((item, i) => {
                  const totalForce = item.left + item.right;
                  const leftPct = totalForce > 0 ? (item.left / totalForce) * 100 : 50;
                  const rightPct = 100 - leftPct;
                  const isAlert = item.asymmetry > 10;
                  return (
                    <View key={i} style={[styles.asymCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={styles.asymHeader}>
                        <Text style={[styles.asymName, { color: colors.textPrimary }]}>{item.label}</Text>
                        <View style={[styles.asymBadge, { backgroundColor: isAlert ? colors.error + '15' : colors.success + '15' }]}>
                          <Ionicons name={isAlert ? 'warning' : 'checkmark-circle'} size={14} color={isAlert ? colors.error : colors.success} />
                          <Text style={[styles.asymBadgeText, { color: isAlert ? colors.error : colors.success }]}>
                            {item.asymmetry}%
                          </Text>
                        </View>
                      </View>

                      {/* Balance bar */}
                      <View style={styles.balanceBarContainer}>
                        <Text style={[styles.balanceSideLabel, { color: '#1565C0' }]}>IZQ</Text>
                        <View style={[styles.balanceBar, { backgroundColor: colors.surfaceHighlight }]}>
                          <View style={[styles.balanceLeft, { width: `${leftPct}%`, backgroundColor: '#1565C0' }]} />
                          <View style={[styles.balanceRight, { width: `${rightPct}%`, backgroundColor: '#C62828' }]} />
                          <View style={[styles.balanceCenter, { backgroundColor: colors.surface }]} />
                        </View>
                        <Text style={[styles.balanceSideLabel, { color: '#C62828' }]}>DER</Text>
                      </View>

                      <View style={styles.asymValues}>
                        <View style={styles.asymValueCol}>
                          <Text style={[styles.asymVal, { color: '#1565C0' }]}>{item.left}</Text>
                          <Text style={[styles.asymValUnit, { color: colors.textSecondary }]}>{item.unit}</Text>
                        </View>
                        <View style={[styles.asymDominant, { backgroundColor: colors.surfaceHighlight }]}>
                          <Ionicons name={item.dominant === 'IGUAL' ? 'swap-horizontal' : 'arrow-forward'} size={14} color={colors.textSecondary} />
                          <Text style={[styles.asymDominantText, { color: colors.textSecondary }]}>{item.dominant}</Text>
                        </View>
                        <View style={[styles.asymValueCol, { alignItems: 'flex-end' }]}>
                          <Text style={[styles.asymVal, { color: '#C62828' }]}>{item.right}</Text>
                          <Text style={[styles.asymValUnit, { color: colors.textSecondary }]}>{item.unit}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}

                {/* Summary */}
                <View style={[styles.asymSummaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.asymSummaryTitle, { color: colors.textPrimary }]}>Riesgo de Lesion</Text>
                    <Text style={[styles.asymSummaryText, { color: colors.textSecondary }]}>
                      {asymmetryData.some(d => d.asymmetry > 15) ? 'Alto: Asimetrias >15% detectadas. Trabajo correctivo recomendado.'
                        : asymmetryData.some(d => d.asymmetry > 10) ? 'Moderado: Algunas asimetrias >10%. Monitorizar evolucion.'
                        : 'Bajo: Todas las asimetrias <10%. Buen equilibrio bilateral.'}
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="fitness-outline" size={48} color={colors.textSecondary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Registra tests de Fuerza Maxima{'\n'}para ver el analisis de asimetria
                </Text>
              </View>
            )}
          </>
        )}

        {/* PROGRESS SECTION */}
        {activeSection === 'progress' && (
          <>
            {progressEntries.length > 0 ? (
              progressEntries.map(([testName, data], idx) => {
                const label = testName === 'custom' ? (data.latest?.custom_name || 'Custom') : (TEST_LABELS[testName] || testName);
                const isPositive = data.change_percent >= 0;
                const history = data.history || [];
                const maxVal = Math.max(...history.map((h: any) => h.value), 1);
                const isBilateral = data.latest?.test_type === 'max_force';

                return (
                  <View key={idx} style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.progressHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.progressName, { color: colors.textPrimary }]}>{label}</Text>
                        {data.latest && (
                          <View style={styles.latestRow}>
                            <Text style={[styles.latestValue, { color: colors.textPrimary }]}>{data.latest.value}</Text>
                            <Text style={[styles.latestUnit, { color: colors.textSecondary }]}>{data.latest.unit}</Text>
                          </View>
                        )}
                      </View>
                      {history.length >= 2 && (
                        <View style={[styles.changeBadge, { backgroundColor: isPositive ? colors.success + '15' : colors.error + '15' }]}>
                          <Ionicons name={isPositive ? 'trending-up' : 'trending-down'} size={16} color={isPositive ? colors.success : colors.error} />
                          <Text style={[styles.changeText, { color: isPositive ? colors.success : colors.error }]}>
                            {isPositive ? '+' : ''}{data.change_percent}%
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Chart */}
                    {history.length > 0 && (
                      <View style={styles.chartArea}>
                        <View style={styles.chartBars}>
                          {history.slice(-10).map((h: any, i: number) => {
                            const heightPct = maxVal > 0 ? (h.value / maxVal) * 100 : 10;
                            const isLast = i === history.slice(-10).length - 1;
                            return (
                              <View key={i} style={styles.chartBarCol}>
                                <View style={styles.chartBarWrapper}>
                                  {isBilateral && h.value_left && h.value_right ? (
                                    <View style={[styles.chartBarSplit, { height: `${heightPct}%` }]}>
                                      <View style={[styles.chartBarHalf, { backgroundColor: '#1565C0', flex: h.value_left }]} />
                                      <View style={[styles.chartBarHalf, { backgroundColor: '#C62828', flex: h.value_right }]} />
                                    </View>
                                  ) : (
                                    <View style={[styles.chartBar, {
                                      height: `${heightPct}%`,
                                      backgroundColor: isLast ? colors.primary : colors.primary + '40',
                                    }]} />
                                  )}
                                </View>
                                <Text style={[styles.chartLabel, { color: colors.textSecondary }]}>
                                  {h.date?.slice(5) || ''}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="trending-up-outline" size={48} color={colors.textSecondary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Registra tests para ver tu progreso</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topHeader: { paddingHorizontal: 20, paddingTop: 16 },
  screenTitle: { fontSize: 26, fontWeight: '800' },
  athleteFilter: { paddingHorizontal: 20, paddingTop: 14, gap: 8 },
  athleteChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  athleteChipText: { fontSize: 14, fontWeight: '500' },
  sectionTabs: { flexDirection: 'row', marginHorizontal: 20, marginTop: 14, borderBottomWidth: 0.5 },
  sectionTab: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, paddingVertical: 12 },
  sectionTabText: { fontSize: 13, fontWeight: '600' },
  scrollContent: { padding: 20, paddingBottom: 32, gap: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  sectionSub: { fontSize: 13, marginTop: -8 },

  // Ring / overview
  ringCard: { borderRadius: 16, padding: 20, borderWidth: 1 },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  ringContainer: { width: 110, height: 110 },
  ringBg: { width: 110, height: 110, borderRadius: 55, borderWidth: 10, justifyContent: 'center', alignItems: 'center' },
  ringProgress: { position: 'absolute', width: 110, height: 110, borderRadius: 55, borderWidth: 10 },
  ringCenter: { alignItems: 'center' },
  ringPct: { fontSize: 28, fontWeight: '800' },
  ringLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  ringStats: { flex: 1, gap: 12 },
  ringStatRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ringDot: { width: 10, height: 10, borderRadius: 5 },
  ringStatText: { flex: 1, fontSize: 13 },
  ringStatVal: { fontSize: 16, fontWeight: '700' },

  quickStatsRow: { flexDirection: 'row', gap: 10 },
  quickStat: { flex: 1, borderRadius: 12, padding: 16, borderWidth: 1, alignItems: 'center', gap: 4 },
  quickStatVal: { fontSize: 24, fontWeight: '700' },
  quickStatLabel: { fontSize: 11, fontWeight: '500' },

  // PRs
  prGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  prCard: { borderRadius: 12, padding: 14, borderWidth: 1, alignItems: 'center', gap: 4, minWidth: '30%', flex: 1 },
  prLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  prValue: { fontSize: 24, fontWeight: '800' },
  prUnit: { fontSize: 12 },

  // Volume chart
  volumeCard: { borderRadius: 16, padding: 20, borderWidth: 1 },
  volumeChart: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 6 },
  volumeBarCol: { flex: 1, alignItems: 'center', gap: 4 },
  volumeBarWrapper: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  volumeBar: { width: '100%', borderRadius: 4, minHeight: 4 },
  volumeDayLabel: { fontSize: 11, fontWeight: '600' },
  volumeCount: { fontSize: 11, fontWeight: '700' },

  // Asymmetry
  asymCard: { borderRadius: 16, padding: 20, borderWidth: 1, gap: 14 },
  asymHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  asymName: { fontSize: 17, fontWeight: '700' },
  asymBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  asymBadgeText: { fontSize: 14, fontWeight: '700' },
  balanceBarContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balanceSideLabel: { fontSize: 11, fontWeight: '800', width: 24 },
  balanceBar: { flex: 1, height: 20, borderRadius: 10, flexDirection: 'row', overflow: 'hidden', position: 'relative' },
  balanceLeft: { height: '100%' },
  balanceRight: { height: '100%' },
  balanceCenter: { position: 'absolute', left: '50%', top: 2, width: 3, height: 16, borderRadius: 2, marginLeft: -1.5 },
  asymValues: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  asymValueCol: { gap: 2 },
  asymVal: { fontSize: 26, fontWeight: '800' },
  asymValUnit: { fontSize: 12 },
  asymDominant: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  asymDominantText: { fontSize: 12, fontWeight: '600' },
  asymSummaryCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 12, padding: 16, borderWidth: 1 },
  asymSummaryTitle: { fontSize: 14, fontWeight: '700' },
  asymSummaryText: { fontSize: 13, marginTop: 4, lineHeight: 18 },

  // Progress
  progressCard: { borderRadius: 16, padding: 20, borderWidth: 1 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  progressName: { fontSize: 16, fontWeight: '600' },
  changeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  changeText: { fontSize: 14, fontWeight: '700' },
  latestRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  latestValue: { fontSize: 32, fontWeight: '800' },
  latestUnit: { fontSize: 16 },
  chartArea: { marginTop: 12 },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 4 },
  chartBarCol: { flex: 1, alignItems: 'center', gap: 4 },
  chartBarWrapper: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  chartBar: { width: '100%', borderRadius: 4, minHeight: 4 },
  chartBarSplit: { width: '100%', borderRadius: 4, flexDirection: 'row', overflow: 'hidden', minHeight: 4 },
  chartBarHalf: { height: '100%' },
  chartLabel: { fontSize: 9, fontWeight: '500' },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, textAlign: 'center', lineHeight: 22 },
});
