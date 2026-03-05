import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Linking, Platform, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';

const DAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Helpers de fechas
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
  
  const todayObj = new Date();
  const todayStr = formatDate(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate());
  const todayYMD = todayStr; // Alias para lógica de comparación

  const [currentMonth, setCurrentMonth] = useState(todayObj.getMonth());
  const [currentYear, setCurrentYear] = useState(todayObj.getFullYear());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [allWorkouts, setAllWorkouts] = useState<any[]>([]);
  const [allTests, setAllTests] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null);
  const [athleteMap, setAthleteMap] = useState<Record<string, string>>({});

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [wk, ts] = await Promise.all([api.getWorkouts(), api.getTests()]);
      
      if (user?.role === 'trainer') {
        try {
          const athletes = await api.getAthletes();
          const map: Record<string, string> = {};
          athletes.forEach((a: any) => { map[a.id] = a.name; });
          setAthleteMap(map);
        } catch (e) { console.log(e); }
      }

      setAllWorkouts(wk);
      setAllTests(ts);
      filterByDate(selectedDate, wk, ts);
    } catch (e) {
      console.log('Calendar load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filterByDate = (date: string, wk?: any[], ts?: any[]) => {
    const w = wk || allWorkouts;
    const t = ts || allTests;
    setWorkouts(w.filter((item: any) => item.date === date));
    setTests(t.filter((item: any) => item.date === date));
    setExpandedWorkout(null);
  };

  const selectDate = (day: number) => {
    const date = formatDate(currentYear, currentMonth, day);
    setSelectedDate(date);
    filterByDate(date);
  };

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  // Lógica de color de puntos del calendario
  const getDotColor = (dateStr: string) => {
    const workoutsOnDate = allWorkouts.filter(w => w.date === dateStr);
    if (workoutsOnDate.length === 0) return null;

    // Si hay alguno pendiente y es pasado -> Rojo
    const hasMissed = workoutsOnDate.some(w => !w.completed && w.date < todayYMD);
    if (hasMissed) return colors.error;

    // Si todos están completados -> Verde
    const allDone = workoutsOnDate.every(w => w.completed);
    if (allDone) return colors.success;

    // Si hay pendientes para hoy o futuro -> Azul
    return colors.primary;
  };

  const days = getMonthDays(currentYear, currentMonth);
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
        
        {/* Cabecera dinámica */}
        <View style={styles.headerRow}>
          <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Calendario</Text>
          <TouchableOpacity onPress={() => { setRefreshing(true); loadAll(); }} disabled={refreshing}>
            {refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="sync-outline" size={24} color={colors.primary} />}
          </TouchableOpacity>
        </View>

        {/* Cuadrícula del Calendario */}
        <View style={[styles.calendarCard, { backgroundColor: colors.surface }]}>
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
              {MONTHS[currentMonth]} {currentYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
              <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {DAYS.map(d => <Text key={d} style={[styles.weekDay, { color: colors.textSecondary }]}>{d}</Text>)}
          </View>

          <View style={styles.daysGrid}>
            {days.map((day, i) => {
              if (!day) return <View key={`e-${i}`} style={styles.dayCell} />;
              const dateStr = formatDate(currentYear, currentMonth, day);
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === todayStr;
              const dotColor = getDotColor(dateStr);
              const hasTest = allTests.some(t => t.date === dateStr);

              return (
                <TouchableOpacity
                  key={`d-${day}`}
                  style={[
                    styles.dayCell,
                    isSelected && { backgroundColor: colors.primary },
                    isToday && !isSelected && { borderWidth: 1.5, borderColor: colors.primary },
                  ]}
                  onPress={() => selectDate(day)}
                >
                  <Text style={[styles.dayText, { color: colors.textPrimary }, isSelected && { color: '#FFF', fontWeight: '700' }]}>
                    {day}
                  </Text>
                  <View style={styles.dotRow}>
                    {dotColor && <View style={[styles.dot, { backgroundColor: isSelected ? '#FFF' : dotColor }]} />}
                    {hasTest && <View style={[styles.dot, { backgroundColor: isSelected ? '#FFF' : colors.accent }]} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={[styles.dayLabel, { color: colors.textPrimary }]}>{selectedDayName}</Text>

        {/* Lista de Entrenamientos con Lógica de Estado */}
        {workouts.map((w) => {
          const isMissed = !w.completed && w.date < todayYMD;
          const statusColor = w.completed ? colors.success : isMissed ? colors.error : colors.primary;

          return (
            <TouchableOpacity
              key={w.id}
              style={[styles.workoutCard, { backgroundColor: colors.surface }]}
              onPress={() => setExpandedWorkout(expandedWorkout === w.id ? null : w.id)}
            >
              <View style={styles.workoutSummary}>
                <View style={[styles.workoutDot, { backgroundColor: statusColor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.workoutTitle, { color: colors.textPrimary }]}>{w.title}</Text>
                  <Text style={[styles.workoutMeta, { color: colors.textSecondary }]}>
                    {user?.role === 'trainer' && athleteMap[w.athlete_id] ? `${athleteMap[w.athlete_id]} · ` : ''}
                    {w.exercises?.length || 0} ej. · {w.completed ? 'Completado' : isMissed ? 'No realizado' : 'Pendiente'}
                  </Text>
                </View>
                <Ionicons name={expandedWorkout === w.id ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
              </View>

              {expandedWorkout === w.id && (
                <View style={[styles.expandedSection, { borderTopColor: colors.border }]}>
                  {w.exercises?.map((ex: any, i: number) => (
                    <View key={i} style={[styles.exRow, i > 0 && { borderTopWidth: 0.5, borderTopColor: colors.border }]}>
                      <Text style={[styles.exName, { color: colors.textPrimary }]}>{ex.name}</Text>
                      <Text style={[styles.exDetails, { color: colors.textSecondary }]}>
                        {ex.sets}x{ex.reps} {ex.weight ? `· ${ex.weight}kg` : ''}
                      </Text>
                    </View>
                  ))}
                  
                  {user?.role === 'athlete' && !w.completed && (
                    <TouchableOpacity
                      style={[styles.trainingBtn, { backgroundColor: isMissed ? colors.error + '15' : colors.primary }]}
                      onPress={() => router.push({ pathname: '/training-mode', params: { workoutId: w.id } })}
                    >
                      <Ionicons name="play" size={16} color={isMissed ? colors.error : "#FFF"} />
                      <Text style={[styles.trainingBtnText, { color: isMissed ? colors.error : "#FFF" }]}>
                        {isMissed ? 'Recuperar Sesión' : 'Iniciar Entrenamiento'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Tests */}
        {tests.map((t) => (
          <View key={t.id} style={[styles.testCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.workoutDot, { backgroundColor: colors.accent }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.testName, { color: colors.textPrimary }]}>{t.test_name === 'custom' ? t.custom_name : t.test_name}</Text>
              <Text style={[styles.testValue, { color: colors.accent }]}>{t.value} {t.unit}</Text>
            </View>
          </View>
        ))}

        {workouts.length === 0 && tests.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={40} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary }}>No hay eventos programados</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  screenTitle: { fontSize: 24, fontWeight: '800' },
  calendarCard: { borderRadius: 20, padding: 16, marginBottom: 20, elevation: 2 },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  navBtn: { padding: 5 },
  monthTitle: { fontSize: 17, fontWeight: '700' },
  weekRow: { flexDirection: 'row', marginBottom: 10 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  dayText: { fontSize: 14, fontWeight: '600' },
  dotRow: { flexDirection: 'row', gap: 3, position: 'absolute', bottom: 5 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  dayLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 15, letterSpacing: 1 },
  workoutCard: { borderRadius: 16, marginBottom: 12, overflow: 'hidden' },
  workoutSummary: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  workoutDot: { width: 8, height: 8, borderRadius: 4 },
  workoutTitle: { fontSize: 16, fontWeight: '700' },
  workoutMeta: { fontSize: 12, marginTop: 2 },
  expandedSection: { borderTopWidth: 0.5, padding: 16 },
  exRow: { paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between' },
  exName: { fontSize: 14, fontWeight: '600' },
  exDetails: { fontSize: 13 },
  trainingBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 12, marginTop: 15 },
  trainingBtnText: { fontSize: 14, fontWeight: '700' },
  testCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, marginBottom: 10, gap: 12 },
  testName: { fontSize: 15, fontWeight: '700' },
  testValue: { fontSize: 14, fontWeight: '800' },
  emptyState: { alignItems: 'center', marginTop: 40, opacity: 0.5 },
});
