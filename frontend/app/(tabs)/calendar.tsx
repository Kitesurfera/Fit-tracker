import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, Modal, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';

const { width } = Dimensions.get('window');
const DAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function CalendarScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<any>(null);
  const [periodization, setPeriodization] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false); // Estado para el botón
  const [showPicker, setShowPicker] = useState(false);

  const isTrainer = user?.role === 'trainer';

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      if (isTrainer) {
        const data = await api.getAthletes();
        setAthletes(data);
        if (data.length > 0) handleSelectAthlete(data[0]);
      } else {
        handleSelectAthlete(user);
      }
    } catch (e) { console.log(e); }
    finally { setLoading(false); setUpdating(false); }
  };

  const handleSelectAthlete = async (athlete: any) => {
    setSelectedAthlete(athlete);
    setShowPicker(false);
    setLoading(true);
    try {
      const tree = await api.getPeriodizationTree(athlete.id);
      setPeriodization(tree);
    } catch (e) { console.log(e); }
    finally { setLoading(false); setUpdating(false); }
  };

  const handleRefresh = () => {
    setUpdating(true);
    init();
  };

  const daysInMonth = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;
    const days = [];
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let i = 1; i <= lastDay; i++) days.push(i);
    return days;
  }, [currentMonth, currentYear]);

  const getDayStatus = (day: number | null) => {
    if (!day) return null;
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    for (const macro of periodization) {
      const micro = macro.microciclos?.find((m: any) => dateStr >= m.fecha_inicio && dateStr <= m.fecha_fin);
      if (micro) return { color: micro.color, type: micro.tipo };
    }
    return null;
  };

  const activeDetail = useMemo(() => {
    for (const macro of periodization) {
      const micro = macro.microciclos?.find((m: any) => selectedDate >= m.fecha_inicio && selectedDate <= m.fecha_fin);
      if (micro) return { macro, micro };
    }
    return null;
  }, [selectedDate, periodization]);

  const changeMonth = (dir: number) => {
    if (dir === -1) {
      if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
      else setCurrentMonth(currentMonth - 1);
    } else {
      if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
      else setCurrentMonth(currentMonth + 1);
    }
  };

  if (loading && athletes.length === 0) return <View style={{flex:1, justifyContent:'center', backgroundColor:colors.background}}><ActivityIndicator size="large" color={colors.primary}/></View>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      
      {/* CABECERA SUPERIOR CON BOTÓN REFRESCAR */}
      <View style={styles.topHeader}>
        <View style={{flex:1}}>
          <Text style={styles.headerSubtitle}>{isTrainer ? 'GESTIÓN' : 'MI PLANIFICACIÓN'}</Text>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            {isTrainer ? (selectedAthlete?.name || 'Cargando...') : 'Calendario'}
          </Text>
        </View>
        <View style={{flexDirection:'row', gap: 15}}>
          {isTrainer && (
            <TouchableOpacity onPress={() => setShowPicker(true)} style={styles.iconBtn}>
              <Ionicons name="people" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleRefresh} disabled={updating} style={styles.iconBtn}>
            {updating ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="sync" size={22} color={colors.primary} />}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.monthSelector}>
        <TouchableOpacity onPress={() => changeMonth(-1)}><Ionicons name="chevron-back" size={24} color={colors.textPrimary}/></TouchableOpacity>
        <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>{MONTHS[currentMonth]} {currentYear}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)}><Ionicons name="chevron-forward" size={24} color={colors.textPrimary}/></TouchableOpacity>
      </View>

      <View style={styles.calendarGrid}>
        <View style={styles.weekDays}>
          {DAYS.map(d => <Text key={d} style={[styles.weekDayText, { color: colors.textSecondary }]}>{d}</Text>)}
        </View>
        <View style={styles.daysGrid}>
          {daysInMonth.map((day, i) => {
            const status = getDayStatus(day);
            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSelected = day && selectedDate === dateStr;
            return (
              <TouchableOpacity 
                key={i} 
                style={[styles.dayCell, isSelected && { backgroundColor: colors.primary + '20', borderRadius: 10 }]}
                onPress={() => day && setSelectedDate(dateStr)}
              >
                {day && <Text style={[styles.dayText, { color: colors.textPrimary }, isSelected && { color: colors.primary, fontWeight: '800' }]}>{day}</Text>}
                {status && <View style={[styles.dot, { backgroundColor: status.color || colors.primary }]} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerLabel}>DETALLE DEL DÍA</Text>
        {activeDetail ? (
          <View style={[styles.detailCard, { borderLeftColor: activeDetail.micro.color }]}>
            <Text style={[styles.macroName, { color: colors.textSecondary }]}>{activeDetail.macro.nombre}</Text>
            <Text style={[styles.microName, { color: colors.textPrimary }]}>{activeDetail.micro.nombre}</Text>
            <View style={[styles.badge, { backgroundColor: activeDetail.micro.color + '20' }]}>
              <Text style={{ color: activeDetail.micro.color, fontSize: 10, fontWeight: '800' }}>{activeDetail.micro.tipo}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={{ color: colors.textSecondary, fontStyle: 'italic' }}>Sin planificación para hoy.</Text>
          </View>
        )}
      </View>

      <Modal visible={showPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            {athletes.map(a => (
              <TouchableOpacity key={a.id} style={styles.athleteItem} onPress={() => handleSelectAthlete(a)}>
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{a.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 10 },
  headerSubtitle: { fontSize: 9, fontWeight: '800', color: '#888', letterSpacing: 1 },
  headerTitle: { fontSize: 24, fontWeight: '900' },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.03)', justifyContent: 'center', alignItems: 'center' },
  monthSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 30, marginBottom: 20 },
  monthLabel: { fontSize: 18, fontWeight: '800' },
  calendarGrid: { paddingHorizontal: 15 },
  weekDays: { flexDirection: 'row', marginBottom: 10 },
  weekDayText: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  dayText: { fontSize: 15, fontWeight: '500' },
  dot: { width: 5, height: 5, borderRadius: 3, position: 'absolute', bottom: 8 },
  footer: { flex: 1, padding: 25, marginTop: 10 },
  footerLabel: { fontSize: 10, fontWeight: '800', color: '#888', letterSpacing: 1, marginBottom: 15 },
  detailCard: { padding: 18, backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: 20, borderLeftWidth: 6 },
  macroName: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  microName: { fontSize: 20, fontWeight: '900', marginTop: 2 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginTop: 12 },
  emptyCard: { alignItems: 'center', marginTop: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 40 },
  modalContent: { borderRadius: 20, padding: 10 },
  athleteItem: { padding: 20, borderBottomWidth: 0.5, borderBottomColor: '#eee' }
});
