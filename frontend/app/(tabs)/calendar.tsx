import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';

const DAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;
  const days: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  return days;
}

function formatDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function CalendarScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(formatDate(today.getFullYear(), today.getMonth(), today.getDate()));
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [allWorkoutDates, setAllWorkoutDates] = useState<Set<string>>(new Set());
  const [allTestDates, setAllTestDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null);
  const [allWorkouts, setAllWorkouts] = useState<any[]>([]);
  const [allTests, setAllTests] = useState<any[]>([]);

  const loadAll = async () => {
    try {
      const [wk, ts] = await Promise.all([api.getWorkouts(), api.getTests()]);
      setAllWorkouts(wk);
      setAllTests(ts);
      setAllWorkoutDates(new Set(wk.map((w: any) => w.date)));
      setAllTestDates(new Set(ts.map((t: any) => t.date)));
      filterByDate(selectedDate, wk, ts);
    } catch (e) {
      console.log('Calendar load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const filterByDate = (date: string, wk?: any[], ts?: any[]) => {
    const w = wk || allWorkouts;
    const t = ts || allTests;
    setWorkouts(w.filter((item: any) => item.date === date));
    setTests(t.filter((item: any) => item.date === date));
    setExpandedWorkout(null);
  };

  useEffect(() => { loadAll(); }, []);

  const selectDate = (day: number) => {
    const date = formatDate(currentYear, currentMonth, day);
    setSelectedDate(date);
    filterByDate(date);
  };

  const toggleWorkout = (id: string) => {
    setExpandedWorkout(expandedWorkout === id ? null : id);
  };

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  const days = getMonthDays(currentYear, currentMonth);
  const todayStr = formatDate(today.getFullYear(), today.getMonth(), today.getDate());
  const selectedDayName = new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Calendario</Text>

        {/* Calendar grid */}
        <View style={[styles.calendarCard, { backgroundColor: colors.surface }]}>
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={prevMonth} testID="prev-month" activeOpacity={0.6} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
              {MONTHS[currentMonth]} {currentYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} testID="next-month" activeOpacity={0.6} style={styles.navBtn}>
              <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {DAYS.map(d => (
              <Text key={d} style={[styles.weekDay, { color: colors.textSecondary }]}>{d}</Text>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {days.map((day, i) => {
              if (!day) return <View key={`e-${i}`} style={styles.dayCell} />;
              const dateStr = formatDate(currentYear, currentMonth, day);
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const hasWorkout = allWorkoutDates.has(dateStr);
              const hasTest = allTestDates.has(dateStr);
              return (
                <TouchableOpacity
                  key={`d-${day}`}
                  style={[
                    styles.dayCell,
                    isSelected && { backgroundColor: colors.primary },
                    isToday && !isSelected && { borderWidth: 1.5, borderColor: colors.primary },
                  ]}
                  onPress={() => selectDate(day)}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.dayText, { color: colors.textPrimary }, isSelected && { color: '#FFF', fontWeight: '700' }]}>
                    {day}
                  </Text>
                  {(hasWorkout || hasTest) && (
                    <View style={styles.dotRow}>
                      {hasWorkout && <View style={[styles.dot, { backgroundColor: isSelected ? '#FFF' : colors.primary }]} />}
                      {hasTest && <View style={[styles.dot, { backgroundColor: isSelected ? '#FFF' : colors.accent }]} />}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Selected day header */}
        <Text style={[styles.dayLabel, { color: colors.textPrimary }]}>{selectedDayName}</Text>

        {/* Workouts */}
        {workouts.length > 0 && workouts.map((w) => (
          <TouchableOpacity
            key={w.id}
            testID={`cal-workout-${w.id}`}
            style={[styles.workoutCard, { backgroundColor: colors.surface }]}
            onPress={() => toggleWorkout(w.id)}
            activeOpacity={0.7}
          >
            {/* Summary row - always visible */}
            <View style={styles.workoutSummary}>
              <View style={[styles.workoutDot, { backgroundColor: colors.primary }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.workoutTitle, { color: colors.textPrimary }]}>{w.title}</Text>
                <Text style={[styles.workoutMeta, { color: colors.textSecondary }]}>
                  {w.exercises?.length || 0} ejercicios{w.completed ? ' · Completado' : ''}
                </Text>
              </View>
              <View style={styles.expandRow}>
                {w.completed && <Ionicons name="checkmark-circle" size={18} color={colors.success} />}
                <Ionicons name={expandedWorkout === w.id ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
              </View>
            </View>

            {/* Expanded exercises */}
            {expandedWorkout === w.id && (
              <View style={[styles.expandedSection, { borderTopColor: colors.border }]}>
                {w.exercises?.map((ex: any, i: number) => (
                  <View key={i} style={[styles.exRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: 0.5 }]}>
                    <View style={[styles.exBadge, { backgroundColor: colors.primary + '12' }]}>
                      <Text style={[styles.exBadgeText, { color: colors.primary }]}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.exName, { color: colors.textPrimary }]}>{ex.name}</Text>
                      <Text style={[styles.exDetails, { color: colors.textSecondary }]}>
                        {[
                          ex.sets && `${ex.sets} series`,
                          ex.reps && `${ex.reps} reps`,
                          ex.weight && `${ex.weight} kg`,
                          ex.rest && `${ex.rest}s desc`,
                        ].filter(Boolean).join(' · ') || 'Sin detalles'}
                      </Text>
                      {ex.video_url ? (
                        <TouchableOpacity
                          style={styles.videoLink}
                          onPress={() => Linking.openURL(ex.video_url)}
                          activeOpacity={0.6}
                        >
                          <Ionicons name="play-circle-outline" size={16} color={colors.primary} />
                          <Text style={[styles.videoLinkText, { color: colors.primary }]}>Ver video</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                ))}
                {w.notes ? (
                  <View style={[styles.notesBox, { backgroundColor: colors.surfaceHighlight }]}>
                    <Text style={[styles.notesText, { color: colors.textSecondary }]}>{w.notes}</Text>
                  </View>
                ) : null}

                {/* Training mode button for athletes */}
                {user?.role === 'athlete' && !w.completed && (
                  <TouchableOpacity
                    testID={`start-training-${w.id}`}
                    style={[styles.trainingBtn, { backgroundColor: colors.primary }]}
                    onPress={() => router.push({ pathname: '/training-mode', params: { workoutId: w.id } })}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="play" size={18} color="#FFF" />
                    <Text style={styles.trainingBtnText}>Modo Entrenamiento</Text>
                  </TouchableOpacity>
                )}

                {/* Edit button for trainers */}
                {user?.role === 'trainer' && (
                  <TouchableOpacity
                    testID={`edit-workout-cal-${w.id}`}
                    style={[styles.editBtn, { borderColor: colors.primary }]}
                    onPress={() => router.push({ pathname: '/edit-workout', params: { workoutId: w.id } })}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.primary} />
                    <Text style={[styles.editBtnText, { color: colors.primary }]}>Editar entrenamiento</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </TouchableOpacity>
        ))}

        {/* Tests */}
        {tests.length > 0 && tests.map((t) => (
          <View key={t.id} style={[styles.testCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.workoutDot, { backgroundColor: colors.accent }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.testName, { color: colors.textPrimary }]}>
                {t.test_name === 'custom' ? t.custom_name : t.test_name}
              </Text>
              <Text style={[styles.testValue, { color: colors.accent }]}>{t.value} {t.unit}</Text>
            </View>
            <View style={[styles.testTypeBadge, { backgroundColor: t.test_type === 'strength' ? colors.primary + '12' : colors.accent + '12' }]}>
              <Text style={[styles.testTypeText, { color: t.test_type === 'strength' ? colors.primary : colors.accent }]}>
                {t.test_type === 'strength' ? 'Fuerza' : 'Plio'}
              </Text>
            </View>
          </View>
        ))}

        {workouts.length === 0 && tests.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={40} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Sin eventos este dia</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 32 },
  screenTitle: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  calendarCard: { borderRadius: 14, padding: 16, marginBottom: 20 },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  navBtn: { padding: 6 },
  monthTitle: { fontSize: 16, fontWeight: '600' },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  dayText: { fontSize: 14, fontWeight: '500' },
  dotRow: { flexDirection: 'row', gap: 3, position: 'absolute', bottom: 3 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  dayLabel: { fontSize: 16, fontWeight: '600', textTransform: 'capitalize', marginBottom: 14 },
  // Workout card
  workoutCard: { borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  workoutSummary: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  workoutDot: { width: 8, height: 8, borderRadius: 4 },
  workoutTitle: { fontSize: 16, fontWeight: '600' },
  workoutMeta: { fontSize: 13, marginTop: 2 },
  expandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Expanded
  expandedSection: { borderTopWidth: 0.5, paddingHorizontal: 14, paddingBottom: 14 },
  exRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, gap: 10 },
  exBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  exBadgeText: { fontSize: 12, fontWeight: '700' },
  exName: { fontSize: 15, fontWeight: '600' },
  exDetails: { fontSize: 13, marginTop: 3 },
  videoLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  videoLinkText: { fontSize: 13, fontWeight: '600' },
  notesBox: { borderRadius: 8, padding: 10, marginTop: 8 },
  notesText: { fontSize: 13, fontStyle: 'italic' },
  trainingBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 10, paddingVertical: 14, marginTop: 12,
  },
  trainingBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  // Test card
  testCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginBottom: 10, gap: 12 },
  testName: { fontSize: 15, fontWeight: '600' },
  testValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  testTypeBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  testTypeText: { fontSize: 11, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyText: { fontSize: 15 },
});
