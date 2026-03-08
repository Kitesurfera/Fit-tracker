import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, Modal, Dimensions, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';

const { width } = Dimensions.get('window');
const DAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function CalendarScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<any>(null);
  
  const [macros, setMacros] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const isTrainer = user?.role === 'trainer';

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      if (isTrainer) {
        const data = await api.getAthletes();
        setAthletes(data || []);
        if (data && data.length > 0) handleSelectAthlete(data[0]);
      } else {
        handleSelectAthlete(user);
      }
    } catch (e) { 
      console.log("Error inicializando calendario:", e); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleSelectAthlete = async (athlete: any) => {
    if (!athlete) return;
    setSelectedAthlete(athlete);
    setShowPicker(false);
    setLoading(true);
    try {
      const res = await api.getPeriodizationTree(athlete.id);
      setMacros(res?.macros || []);
      
      const wks = await api.getWorkouts({ athlete_id: athlete.id });
      setWorkouts(wks || []);
      
    } catch (e) { 
      console.log("Error cargando datos del atleta:", e); 
    } finally { 
      setLoading(false); 
      setUpdating(false); 
    }
  };

  const handleRefresh = () => {
    setUpdating(true);
    if (selectedAthlete) handleSelectAthlete(selectedAthlete);
    else init();
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

  // --- LÓGICA DE COLOR DE MICRO/MACROCICLO MEJORADA ---
  const getDayStatus = (day: number | null) => {
    if (!day) return null;
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    let status: any = { hasWorkout: false, isCompleted: false, phaseColor: null };

    const workoutForDay = workouts?.find(w => w.date === dateStr);
    if (workoutForDay) {
      status.hasWorkout = true;
      status.isCompleted = workoutForDay.completed;
    }

    if (Array.isArray(macros)) {
      for (const macro of macros) {
        if (macro.microciclos && Array.isArray(macro.microciclos)) {
          const micro = macro.microciclos.find((m: any) => dateStr >= m.fecha_inicio && dateStr <= m.fecha_fin);
          if (micro) {
            status.phaseColor = micro.color;
            break; 
          }
        }
      }
    }

    return status;
  };

  const getSelectedDateDetails = () => {
    let details: any = { macro: null, micro: null, workouts: [] };
    details.workouts = workouts?.filter(w => w.date === selectedDate) || [];

    if (Array.isArray(macros)) {
      for (const macro of macros) {
        const micro = macro.microciclos?.find((m: any) => selectedDate >= m.fecha_inicio && selectedDate <= m.fecha_fin);
        if (micro) {
          details.macro = macro;
          details.micro = micro;
          break;
        }
      }
    }
    return details;
  };

  const activeDetail = getSelectedDateDetails();

  const changeMonth = (dir: number) => {
    if (dir === -1) {
      if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
      else setCurrentMonth(currentMonth - 1);
    } else {
      if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
      else setCurrentMonth(currentMonth + 1);
    }
  };

  // --- ACCIÓN AL PULSAR UN ENTRENAMIENTO ---
  const handleWorkoutPress = (workoutId: string) => {
    if (isTrainer) {
      // Si es la entrenadora, la mandamos al editor
      router.push({ 
        pathname: '/add-workout', 
        params: { 
          athlete_id: selectedAthlete.id, 
          name: selectedAthlete.name, 
          edit_id: workoutId 
        } 
      });
    } else {
      // Si eres tú (la deportista), te mandamos a entrenar
      router.push({ 
        pathname: '/training-mode', 
        params: { workoutId } 
      });
    }
  };

  if (loading && athletes.length === 0) {
    return <View style={{flex:1, justifyContent:'center', alignItems:'center', backgroundColor:colors.background}}><ActivityIndicator size="large" color={colors.primary}/></View>;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.topHeader}>
        <View style={{flex:1}}>
          <Text style={styles.headerSubtitle}>{isTrainer ? 'AGENDA DEPORTISTA' : 'MI PLANIFICACIÓN'}</Text>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            {selectedAthlete?.name || 'Calendario'}
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
            const dateStr = day ? `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
            const isSelected = dateStr && selectedDate === dateStr;
            const isToday = dateStr && dateStr === today.toISOString().split('T')[0];
            
            return (
              <TouchableOpacity 
                key={i} 
                style={[
                  styles.dayCell, 
                  // Si tiene fase, le ponemos un fondo muy suavecito de su color
                  status?.phaseColor && { backgroundColor: status.phaseColor + '15', borderRadius: 12 },
                  isSelected && { backgroundColor: (status?.phaseColor || colors.primary) + '40', borderWidth: 2, borderColor: status?.phaseColor || colors.primary, borderRadius: 12 },
                  status?.hasWorkout && !isSelected && { borderWidth: 1, borderColor: status.isCompleted ? colors.success : colors.primary, borderRadius: 12 }
                ]}
                onPress={() => dateStr && setSelectedDate(dateStr)}
                disabled={!day}
              >
                {day && (
                  <>
                    <Text style={[
                      styles.dayText, 
                      { color: colors.textPrimary }, 
                      status?.phaseColor && { color: status.phaseColor, fontWeight: '800' },
                      isSelected && { color: status?.phaseColor || colors.primary, fontWeight: '900' },
                      isToday && !isSelected && { color: colors.error, fontWeight: '900' }
                    ]}>
                      {day}
                    </Text>
                    {/* El puntito inferior lo dejamos por si acaso, pero el fondo ya da la info */}
                    {status?.phaseColor && !isSelected && <View style={[styles.dot, { backgroundColor: status.phaseColor }]} />}
                    {status?.hasWorkout && status?.isCompleted && (
                      <Ionicons name="checkmark-circle" size={12} color={colors.success} style={{ position: 'absolute', top: 2, right: 2 }} />
                    )}
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView style={styles.footer} showsVerticalScrollIndicator={false}>
        <Text style={styles.footerLabel}>DETALLE DEL DÍA SELECCIONADO</Text>
        
        {activeDetail.workouts.length > 0 ? (
          activeDetail.workouts.map((wk: any) => (
            <TouchableOpacity 
              key={wk.id} 
              style={[styles.workoutCard, { backgroundColor: colors.surface }]}
              // AQUÍ LLAMAMOS A LA NUEVA FUNCIÓN QUE DECIDE A DÓNDE IR
              onPress={() => handleWorkoutPress(wk.id)}
            >
              <View style={[styles.workoutIcon, { backgroundColor: wk.completed ? colors.success + '15' : colors.primary + '15' }]}>
                <Ionicons name={wk.completed ? "checkmark-done" : "barbell"} size={22} color={wk.completed ? colors.success : colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.workoutTitle, { color: colors.textPrimary }]}>{wk.title}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {wk.completed ? 'Completado' : isTrainer ? 'Sesión asignada' : 'Sesión pendiente'}
                </Text>
              </View>
              <Ionicons name={isTrainer ? "pencil" : "chevron-forward"} size={20} color={colors.border} />
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-clear-outline" size={32} color={colors.border} />
            <Text style={{ color: colors.textSecondary, marginTop: 10 }}>Día sin sesiones programadas.</Text>
          </View>
        )}

        {activeDetail.micro && (
          <View style={[styles.detailCard, { borderLeftColor: activeDetail.micro.color, backgroundColor: colors.surface }]}>
            <Text style={[styles.macroName, { color: colors.textSecondary }]}>{activeDetail.macro?.nombre}</Text>
            <Text style={[styles.microName, { color: colors.textPrimary }]}>{activeDetail.micro?.nombre}</Text>
            <View style={[styles.badge, { backgroundColor: activeDetail.micro.color + '20' }]}>
              <Text style={{ color: activeDetail.micro.color, fontSize: 10, fontWeight: '900' }}>{activeDetail.micro.tipo}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* MODAL SELECTOR */}
      <Modal visible={showPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Seleccionar Deportista</Text>
            {athletes.map(a => (
              <TouchableOpacity key={a.id} style={[styles.athleteItem, { borderBottomColor: colors.border }]} onPress={() => handleSelectAthlete(a)}>
                <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16 }}>{a.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topHeader: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  headerSubtitle: { fontSize: 10, fontWeight: '800', color: '#888', letterSpacing: 1.5 },
  headerTitle: { fontSize: 24, fontWeight: '900' },
  iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.03)', justifyContent: 'center', alignItems: 'center' },
  monthSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 15 },
  monthLabel: { fontSize: 18, fontWeight: '900', textTransform: 'capitalize' },
  calendarGrid: { paddingHorizontal: 15 },
  weekDays: { flexDirection: 'row', marginBottom: 10 },
  weekDayText: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 }, // Pequeño gap para que los fondos no se pisen
  dayCell: { width: '13.5%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', margin: '0.35%' },
  dayText: { fontSize: 15, fontWeight: '600' },
  dot: { width: 5, height: 5, borderRadius: 2.5, position: 'absolute', bottom: 4 },
  footer: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  footerLabel: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 15, letterSpacing: 1 },
  workoutCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 18, marginBottom: 12 },
  workoutIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  workoutTitle: { fontSize: 16, fontWeight: '800' },
  detailCard: { padding: 18, borderRadius: 20, borderLeftWidth: 6, marginBottom: 25 },
  macroName: { fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  microName: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginTop: 10 },
  emptyCard: { alignItems: 'center', paddingVertical: 30 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { padding: 25, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  modalTitle: { fontSize: 18, fontWeight: '900', marginBottom: 20 },
  athleteItem: { paddingVertical: 18, borderBottomWidth: 1 }
});
