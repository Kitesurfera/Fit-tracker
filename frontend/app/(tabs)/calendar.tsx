import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, Modal, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router'; // Necesario para navegar a la sesión
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';

const { width } = Dimensions.get('window');
const DAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function CalendarScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter(); // Instanciamos el router
  
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<any>(null);
  
  // Guardamos tanto la periodización como los entrenamientos reales
  const [periodization, setPeriodization] = useState<any[]>([]);
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
        setAthletes(data);
        if (data.length > 0) handleSelectAthlete(data[0]);
      } else {
        handleSelectAthlete(user);
      }
    } catch (e) { 
      console.log("Error inicializando calendario:", e); 
    } finally { 
      setLoading(false); 
      setUpdating(false); 
    }
  };

  // Función principal de carga de datos para el atleta seleccionado
  const handleSelectAthlete = async (athlete: any) => {
    setSelectedAthlete(athlete);
    setShowPicker(false);
    setLoading(true);
    try {
      // 1. Traemos la estrategia (fases)
      const tree = await api.getPeriodizationTree(athlete.id);
      setPeriodization(tree);
      
      // 2. Traemos la táctica (entrenamientos)
      const wks = await api.getWorkouts({ athlete_id: athlete.id });
      setWorkouts(wks);
      
    } catch (e) { 
      console.log("Error cargando datos del atleta:", e); 
    } finally { 
      setLoading(false); 
      setUpdating(false); 
    }
  };

  const handleRefresh = () => {
    setUpdating(true);
    if (selectedAthlete) {
      handleSelectAthlete(selectedAthlete);
    } else {
      init();
    }
  };

  // Lógica para construir la cuadrícula del mes
  const daysInMonth = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    // Ajuste para que la semana empiece en Lunes
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6; 
    
    const days = [];
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let i = 1; i <= lastDay; i++) days.push(i);
    return days;
  }, [currentMonth, currentYear]);

  // Función combinada para obtener el estado visual de un día (Fase + Entrenamiento)
  const getDayStatus = (day: number | null) => {
    if (!day) return null;
    
    // Formateamos la fecha a YYYY-MM-DD
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    let status: any = {
      hasWorkout: false,
      isCompleted: false,
      phaseColor: null,
    };

    // 1. Buscamos si hay entreno
    const workoutForDay = workouts.find(w => w.date === dateStr);
    if (workoutForDay) {
      status.hasWorkout = true;
      status.isCompleted = workoutForDay.completed;
    }

    // 2. Buscamos en qué fase estamos
    for (const macro of periodization) {
      const micro = macro.microciclos?.find((m: any) => dateStr >= m.fecha_inicio && dateStr <= m.fecha_fin);
      if (micro) {
        status.phaseColor = micro.color;
        break;
      }
    }

    return status;
  };

  // Obtenemos los detalles de la fecha seleccionada para la lista inferior
  const getSelectedDateDetails = () => {
    let details: any = {
      macro: null,
      micro: null,
      workouts: []
    };

    // Buscamos entrenos del día seleccionado
    details.workouts = workouts.filter(w => w.date === selectedDate);

    // Buscamos fase del día seleccionado
    for (const macro of periodization) {
      const micro = macro.microciclos?.find((m: any) => selectedDate >= m.fecha_inicio && selectedDate <= m.fecha_fin);
      if (micro) {
        details.macro = macro;
        details.micro = micro;
        break;
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

  if (loading && athletes.length === 0) return <View style={{flex:1, justifyContent:'center', backgroundColor:colors.background}}><ActivityIndicator size="large" color={colors.primary}/></View>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      
      {/* CABECERA SUPERIOR */}
      <View style={styles.topHeader}>
        <View style={{flex:1}}>
          <Text style={styles.headerSubtitle}>{isTrainer ? 'AGENDA DEPORTISTA' : 'MI PLANIFICACIÓN'}</Text>
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

      {/* SELECTOR DE MES */}
      <View style={styles.monthSelector}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={{padding: 10}}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary}/>
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>{MONTHS[currentMonth]} {currentYear}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)} style={{padding: 10}}>
          <Ionicons name="chevron-forward" size={24} color={colors.textPrimary}/>
        </TouchableOpacity>
      </View>

      {/* CUADRÍCULA DEL CALENDARIO */}
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
                  isSelected && { backgroundColor: colors.primary + '15', borderRadius: 12 },
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
                      isSelected && { color: colors.primary, fontWeight: '900' },
                      isToday && !isSelected && { color: colors.error, fontWeight: '800' }
                    ]}>
                      {day}
                    </Text>
                    {/* El punto inferior indica la Fase de Periodización */}
                    {status?.phaseColor && (
                      <View style={[styles.dot, { backgroundColor: status.phaseColor }]} />
                    )}
                    {/* Pequeño check si el entreno está completado */}
                    {status?.hasWorkout && status?.isCompleted && (
                      <Ionicons name="checkmark-circle" size={10} color={colors.success} style={{ position: 'absolute', top: 4, right: 4 }} />
                    )}
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* LISTA INFERIOR: DETALLES DEL DÍA */}
      <ScrollView style={styles.footer} showsVerticalScrollIndicator={false}>
        <Text style={styles.footerLabel}>DETALLE DEL DÍA SELECCIONADO</Text>
        
        {/* Bloque de Entrenamientos */}
        {activeDetail.workouts.length > 0 ? (
          activeDetail.workouts.map((wk: any) => (
            <TouchableOpacity 
              key={wk.id} 
              style={[styles.workoutCard, { backgroundColor: colors.surface }]}
              onPress={() => router.push({ pathname: '/training-mode', params: { workoutId: wk.id } })}
              activeOpacity={0.7}
            >
              <View style={[styles.workoutIcon, { backgroundColor: wk.completed ? colors.success + '15' : colors.primary + '15' }]}>
                <Ionicons name={wk.completed ? "checkmark-done" : "barbell"} size={22} color={wk.completed ? colors.success : colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.workoutTitle, { color: colors.textPrimary }]}>{wk.title}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {wk.exercises?.length || 0} bloques • {wk.completed ? 'Completado' : 'Pendiente'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.border} />
            </TouchableOpacity>
          ))
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: 'transparent' }]}>
            <Ionicons name="calendar-clear-outline" size={32} color={colors.border} />
            <Text style={{ color: colors.textSecondary, marginTop: 10, fontSize: 13, fontWeight: '600' }}>
              Día de descanso libre.
            </Text>
          </View>
        )}

        {/* Bloque de Fase de Periodización */}
        {activeDetail.micro && (
          <View style={[styles.detailCard, { borderLeftColor: activeDetail.micro.color, backgroundColor: colors.surface }]}>
            <Text style={[styles.macroName, { color: colors.textSecondary }]}>{activeDetail.macro.nombre}</Text>
            <Text style={[styles.microName, { color: colors.textPrimary }]}>{activeDetail.micro.nombre}</Text>
            <View style={[styles.badge, { backgroundColor: activeDetail.micro.color + '20' }]}>
              <Text style={{ color: activeDetail.micro.color, fontSize: 10, fontWeight: '800' }}>{activeDetail.micro.tipo}</Text>
            </View>
          </View>
        )}
        
        <View style={{ height: 40 }} /> 
      </ScrollView>

      {/* SELECTOR DE DEPORTISTA (SÓLO ENTRENADOR) */}
      <Modal visible={showPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Seleccionar Deportista</Text>
            {athletes.map(a => (
              <TouchableOpacity key={a.id} style={[styles.athleteItem, { borderBottomColor: colors.border }]} onPress={() => handleSelectAthlete(a)}>
                <View style={[styles.avatarMini, { backgroundColor: colors.primary + '20' }]}>
                  <Text style={{ color: colors.primary, fontWeight: '800' }}>{a.name.charAt(0)}</Text>
                </View>
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
  topHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 10 },
  headerSubtitle: { fontSize: 10, fontWeight: '800', color: '#888', letterSpacing: 1.5 },
  headerTitle: { fontSize: 26, fontWeight: '900', marginTop: 2 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.03)', justifyContent: 'center', alignItems: 'center' },
  
  monthSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 15 },
  monthLabel: { fontSize: 18, fontWeight: '900', textTransform: 'uppercase' },
  
  calendarGrid: { paddingHorizontal: 15 },
  weekDays: { flexDirection: 'row', marginBottom: 15 },
  weekDayText: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', marginVertical: 2 },
  dayText: { fontSize: 15, fontWeight: '600' },
  dot: { width: 6, height: 6, borderRadius: 3, position: 'absolute', bottom: 6 },
  
  footer: { flex: 1, paddingHorizontal: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', marginTop: 10 },
  footerLabel: { fontSize: 11, fontWeight: '800', color: '#888', letterSpacing: 1, marginBottom: 15 },
  
  workoutCard: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 20, marginBottom: 15, elevation: 1 },
  workoutIcon: { width: 46, height: 46, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  workoutTitle: { fontSize: 16, fontWeight: '800' },
  
  detailCard: { padding: 20, borderRadius: 20, borderLeftWidth: 6, marginBottom: 15, elevation: 1 },
  macroName: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  microName: { fontSize: 18, fontWeight: '900', marginTop: 4 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginTop: 12 },
  
  emptyCard: { alignItems: 'center', paddingVertical: 30 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, paddingBottom: 50 },
  modalTitle: { fontSize: 18, fontWeight: '900', marginBottom: 20, textAlign: 'center' },
  athleteItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1 },
  avatarMini: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 }
});
