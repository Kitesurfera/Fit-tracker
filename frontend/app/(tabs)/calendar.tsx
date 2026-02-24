import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(formatDate(today.getFullYear(), today.getMonth(), today.getDate()));
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [allWorkoutDates, setAllWorkoutDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    try {
      const [wk, ts] = await Promise.all([api.getWorkouts(), api.getTests()]);
      setAllWorkoutDates(new Set(wk.map((w: any) => w.date)));
      filterByDate(selectedDate, wk, ts);
    } catch (e) {
      console.log('Calendar load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const filterByDate = (date: string, wk?: any[], ts?: any[]) => {
    const w = wk || [];
    const t = ts || [];
    setWorkouts(w.filter((item: any) => item.date === date));
    setTests(t.filter((item: any) => item.date === date));
  };

  useEffect(() => { loadAll(); }, []);

  const selectDate = async (day: number) => {
    const date = formatDate(currentYear, currentMonth, day);
    setSelectedDate(date);
    setLoading(true);
    try {
      const [wk, ts] = await Promise.all([
        api.getWorkouts({ date }),
        api.getTests(),
      ]);
      setWorkouts(wk);
      setTests(ts.filter((t: any) => t.date === date));
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
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

  const renderEvent = ({ item, type }: { item: any; type: string }) => (
    <View style={[styles.eventCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.eventDot, { backgroundColor: type === 'workout' ? colors.primary : colors.accent }]} />
      <View style={styles.eventContent}>
        <Text style={[styles.eventTitle, { color: colors.textPrimary }]}>
          {type === 'workout' ? item.title : `${item.test_name} (${item.test_type})`}
        </Text>
        <Text style={[styles.eventSub, { color: colors.textSecondary }]}>
          {type === 'workout'
            ? `${item.exercises?.length || 0} ejercicios ${item.completed ? '· Completado' : ''}`
            : `${item.value} ${item.unit}`}
        </Text>
      </View>
    </View>
  );

  const events = [
    ...workouts.map(w => ({ ...w, _type: 'workout' })),
    ...tests.map(t => ({ ...t, _type: 'test' })),
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Calendario</Text>

      <View style={[styles.calendarContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={prevMonth} testID="prev-month" activeOpacity={0.7} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
            {MONTHS[currentMonth]} {currentYear}
          </Text>
          <TouchableOpacity onPress={nextMonth} testID="next-month" activeOpacity={0.7} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.weekRow}>
          {DAYS.map(d => (
            <Text key={d} style={[styles.weekDay, { color: colors.textSecondary }]}>{d}</Text>
          ))}
        </View>

        <View style={styles.daysGrid}>
          {days.map((day, i) => {
            if (!day) return <View key={`empty-${i}`} style={styles.dayCell} />;
            const dateStr = formatDate(currentYear, currentMonth, day);
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const hasEvent = allWorkoutDates.has(dateStr);
            return (
              <TouchableOpacity
                key={`day-${day}`}
                style={[
                  styles.dayCell,
                  isSelected && { backgroundColor: colors.primary },
                  isToday && !isSelected && { borderWidth: 1, borderColor: colors.primary },
                ]}
                onPress={() => selectDate(day)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.dayText,
                  { color: colors.textPrimary },
                  isSelected && { color: '#FFFFFF' },
                ]}>
                  {day}
                </Text>
                {hasEvent && <View style={[styles.eventIndicator, { backgroundColor: isSelected ? '#FFF' : colors.accent }]} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>
        {selectedDate}
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : events.length > 0 ? (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderEvent({ item, type: item._type })}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        />
      ) : (
        <View style={styles.noEvents}>
          <Ionicons name="calendar-outline" size={36} color={colors.textSecondary} />
          <Text style={[styles.noEventsText, { color: colors.textSecondary }]}>Sin eventos este dia</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screenTitle: { fontSize: 24, fontWeight: '700', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  calendarContainer: { margin: 16, borderRadius: 12, padding: 16, borderWidth: 1 },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  navBtn: { padding: 4 },
  monthTitle: { fontSize: 17, fontWeight: '600' },
  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 8,
  },
  dayText: { fontSize: 15, fontWeight: '500' },
  eventIndicator: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2, position: 'absolute', bottom: 4 },
  dateLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, paddingHorizontal: 16, marginBottom: 8 },
  eventCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1,
  },
  eventDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  eventContent: { flex: 1 },
  eventTitle: { fontSize: 15, fontWeight: '600' },
  eventSub: { fontSize: 13, marginTop: 2 },
  noEvents: { alignItems: 'center', paddingTop: 32, gap: 8 },
  noEventsText: { fontSize: 15 },
});
