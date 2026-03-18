import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, Modal, Alert, Platform, useWindowDimensions, TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';

const DAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const now = new Date();
const localTodayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export default function CalendarScreen() {
  const { user, loading: authLoading } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  
  const { width } = useWindowDimensions();
  const isDesktop = width >= 800; 
  
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState(localTodayStr);
  
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<any>(null);
  const [macros, setMacros] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [wellnessHistory, setWellnessHistory] = useState<any[]>([]); 
  
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  
  const [viewMicroInfo, setViewMicroInfo] = useState<any>(null);
  const [workoutToCopy, setWorkoutToCopy] = useState<any>(null);
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);

  // --- ESTADOS PARA EL MODAL DEL CICLO MENSTRUAL ---
  const [showCycleSettings, setShowCycleSettings] = useState(false);
  const [cycleLengthInput, setCycleLengthInput] = useState('28');
  const [periodLengthInput, setPeriodLengthInput] = useState('5');

  const isTrainer = user?.role === 'trainer';
  const isFemale = ['female', 'mujer', 'femenino'].includes(selectedAthlete?.gender?.toLowerCase() || '');

  useEffect(() => { 
    if (!authLoading && user) {
      init(); 
    }
  }, [authLoading, user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (selectedAthlete) {
        setUpdating(true);
        refreshAthleteData(selectedAthlete);
      }
    }, [selectedAthlete])
  );

  const init = async () => {
    try {
      if (isTrainer) {
        const data = await api.getAthletes();
        setAthletes(Array.isArray(data) ? data : []);
        if (data && data.length > 0 && !selectedAthlete) {
          handleSelectAthlete(data[0]);
        }
      } else {
        handleSelectAthlete(user);
      }
    } catch (e) { 
      console.log("Error inicializando calendario:", e); 
    } finally { 
      setLoading(false); 
    }
  };

  const refreshAthleteData = async (athlete: any) => {
    try {
      const [resTree, resWorkouts, resWellness] = await Promise.all([
        api.getPeriodizationTree(athlete.id).catch(() => ({ macros: [] })),
        api.getWorkouts({ athlete_id: athlete.id }).catch(() => []),
        api.getWellnessHistory(athlete.id).catch(() => []) 
      ]);
      
      const macroList = Array.isArray(resTree) ? resTree : (resTree?.macros || []);
      const extractedWorkouts = Array.isArray(resWorkouts) ? resWorkouts : (resWorkouts?.data || []);
      const extractedWellness = Array.isArray(resWellness) ? resWellness : (resWellness?.data || []);
      
      setMacros(macroList);
      setWorkouts(extractedWorkouts);
      setWellnessHistory(extractedWellness);
    } catch (e) { 
      console.log("Error recargando datos:", e); 
    } finally { 
      setUpdating(false); 
      setLoading(false);
    }
  };

  const handleSelectAthlete = (athlete: any) => {
    if (!athlete) return;
    setSelectedAthlete(athlete);
    setShowPicker(false);
    setLoading(true);
    refreshAthleteData(athlete);
  };

  const startCopyWorkout = (workout: any) => {
    setWorkoutToCopy(workout);
    if (Platform.OS !== 'web') {
        Alert.alert("Modo Duplicar", "Toca cualquier día del calendario para pegar este entrenamiento.");
    }
  };

  const pasteWorkout = async (targetDate: string) => {
    if (!workoutToCopy) return;
    setUpdating(true);
    try {
      const newWorkout = {
        ...workoutToCopy,
        date: targetDate,
        completed: false,
        completion_data: null,
        athlete_id: selectedAthlete.id
      };
      delete newWorkout.id; 

      await api.createWorkout(newWorkout);
      setWorkoutToCopy(null);
      refreshAthleteData(selectedAthlete);
    } catch (e) {
      console.error("Error duplicando:", e);
      setUpdating(false);
    }
  };

  const executeDeleteWorkout = async (workoutId: string) => {
    setUpdating(true);
    try {
      await api.deleteWorkout(workoutId);
      refreshAthleteData(selectedAthlete);
    } catch (error) {
      console.error("Error al eliminar la sesión:", error);
      if (Platform.OS !== 'web') Alert.alert("Error", "No se pudo eliminar la sesión.");
      setUpdating(false);
    }
  };

  const handleDeleteWorkout = (workout: any) => {
    if (Platform.OS === 'web') {
      const isConfirmed = window.confirm(`¿Seguro que quieres eliminar la sesión "${workout.title}"?`);
      if (isConfirmed) executeDeleteWorkout(workout.id);
    } else {
      Alert.alert(
        "Eliminar Sesión",
        `¿Seguro que quieres borrar "${workout.title}"?`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Eliminar", style: "destructive", onPress: () => executeDeleteWorkout(workout.id) }
        ]
      );
    }
  };

  // --- FUNCIONES PARA EL MODAL DEL CICLO MENSTRUAL ---
  const openCycleSettings = () => {
    setCycleLengthInput(String(selectedAthlete?.cycle_length || 28));
    setPeriodLengthInput(String(selectedAthlete?.period_length || 5));
    setShowCycleSettings(true);
  };

  const handleSaveCycleSettings = async () => {
    setUpdating(true);
    try {
      const payload = {
        cycle_length: parseInt(cycleLengthInput) || 28,
        period_length: parseInt(periodLengthInput) || 5
      };
      
      // Actualiza en el backend dependiendo del rol
      if (isTrainer && api.updateAthlete) {
        await api.updateAthlete(selectedAthlete.id, payload);
      } else if (api.updateProfile) {
        await api.updateProfile(payload); 
      }

      // Actualiza localmente para que el calendario reaccione en vivo
      setSelectedAthlete({ ...selectedAthlete, ...payload });
      setShowCycleSettings(false);
    } catch (e) {
      console.log("Error guardando ajustes de ciclo:", e);
      if (Platform.OS !== 'web') Alert.alert("Error", "No se pudieron guardar los ajustes.");
    } finally {
      setUpdating(false);
    }
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

  const microciclosDelMes = useMemo(() => {
    if (!Array.isArray(macros)) return [];
    const microsResult: any[] = [];
    
    const firstDayTime = new Date(currentYear, currentMonth, 1).getTime();
    const lastDayTime = new Date(currentYear, currentMonth + 1, 0).getTime();

    macros.forEach(macro => {
      const listaMicros = macro.microciclos || macro.microcycles || [];
      if (Array.isArray(listaMicros)) {
        listaMicros.forEach((m: any) => {
          const start = m.fecha_inicio || m.start_date;
          const end = m.fecha_fin || m.end_date;
          if (start && end) {
            const [sY, sM, sD] = start.split('-').map(Number);
            const [eY, eM, eD] = end.split('-').map(Number);
            const sTime = new Date(sY, sM - 1, sD).getTime();
            const eTime = new Date(eY, eM - 1, eD).getTime();
            
            if (sTime <= lastDayTime && eTime >= firstDayTime) {
              microsResult.push({ 
                ...m, 
                macroNombre: macro.nombre || macro.name || 'Macro', 
                nombre: m.nombre || m.name || 'Micro', 
                fecha_inicio: start, 
                fecha_fin: end, 
                tipo: m.tipo || m.type || 'BASE',
                color: m.color || colors.primary
              });
            }
          }
        });
      }
    });
    return microsResult.sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());
  }, [macros, currentMonth, currentYear, colors.primary]);

  const periodDays = useMemo(() => {
    if (!isFemale || !wellnessHistory || wellnessHistory.length === 0) return {};

    const menstrualLogs = wellnessHistory
      .filter(w => w.cycle_phase === 'menstrual' || w.cycle_phase?.startsWith('menstruacion'))
      .sort((a, b) => b.date.localeCompare(a.date));

    if (menstrualLogs.length === 0) return {};

    let actualDayOneStr = menstrualLogs[0].date;
    for (let i = 0; i < menstrualLogs.length - 1; i++) {
      const [cY, cM, cD] = menstrualLogs[i].date.split('-').map(Number);
      const [pY, pM, pD] = menstrualLogs[i+1].date.split('-').map(Number);
      
      const currDate = new Date(cY, cM - 1, cD).getTime();
      const prevDate = new Date(pY, pM - 1, pD).getTime();
      
      const diffDays = (currDate - prevDate) / (1000 * 3600 * 24);
      
      if (diffDays <= 2) {
        actualDayOneStr = menstrualLogs[i+1].date;
      } else {
        break; 
      }
    }

    const [startY, startM, startD] = actualDayOneStr.split('-').map(Number);
    const actualDayOne = new Date(startY, startM - 1, startD);

    const cycleLength = selectedAthlete?.cycle_length || 28;
    const periodLength = selectedAthlete?.period_length || 5;

    const daysDict: Record<string, { type: 'current' | 'predicted' }> = {};

    for (let i = 0; i < periodLength; i++) {
      const curr = new Date(actualDayOne);
      curr.setDate(actualDayOne.getDate() + i);
      const dateStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
      daysDict[dateStr] = { type: 'current' };
    }

    const nextDayOne = new Date(actualDayOne);
    nextDayOne.setDate(actualDayOne.getDate() + cycleLength);

    for (let i = 0; i < periodLength; i++) {
      const pred = new Date(nextDayOne);
      pred.setDate(nextDayOne.getDate() + i);
      const dateStr = `${pred.getFullYear()}-${String(pred.getMonth() + 1).padStart(2, '0')}-${String(pred.getDate()).padStart(2, '0')}`;
      if (!daysDict[dateStr]) {
        daysDict[dateStr] = { type: 'predicted' };
      }
    }
    
    return daysDict;
  }, [wellnessHistory, selectedAthlete, isFemale]);

  const getDayStatus = (day: number | null) => {
    if (!day) return null;
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    let status: any = { hasWorkout: false, isCompleted: false, phaseColor: null, isPeriod: false, periodType: null };

    const workoutsForDay = workouts?.filter(w => w.date === dateStr) || [];
    if (workoutsForDay.length > 0) {
      status.hasWorkout = true;
      status.isCompleted = workoutsForDay.every(w => w.completed);
    }

    if (periodDays[dateStr]) {
      status.isPeriod = true;
      status.periodType = periodDays[dateStr].type;
    }

    const currentDayTime = new Date(currentYear, currentMonth, day).getTime();

    if (Array.isArray(macros)) {
      for (const macro of macros) {
        const listaMicros = macro.microciclos || macro.microcycles || [];
        const micro = listaMicros.find((m: any) => {
          const start = m.fecha_inicio || m.start_date;
          const end = m.fecha_fin || m.end_date;
          if(!start || !end) return false;
          
          const [sY, sM, sD] = start.split('-').map(Number);
          const [eY, eM, eD] = end.split('-').map(Number);
          const sTime = new Date(sY, sM - 1, sD).getTime();
          const eTime = new Date(eY, eM - 1, eD).getTime();
          
          return currentDayTime >= sTime && currentDayTime <= eTime;
        });
        
        if (micro) { 
          status.phaseColor = micro.color || colors.primary; 
          break; 
        }
      }
    }
    return status;
  };

  const getSelectedDateDetails = () => {
    let details: any = { macro: null, micro: null, workouts: [] };
    details.workouts = workouts?.filter(w => w.date === selectedDate) || [];

    const [selYear, selMonth, selDay] = selectedDate.split('-').map(Number);
    const selTime = new Date(selYear, selMonth - 1, selDay).getTime();

    if (Array.isArray(macros)) {
      for (const macro of macros) {
        const listaMicros = macro.microciclos || macro.microcycles || [];
        const micro = listaMicros.find((m: any) => {
          const start = m.fecha_inicio || m.start_date;
          const end = m.fecha_fin || m.end_date;
          if(!start || !end) return false;
          
          const [sY, sM, sD] = start.split('-').map(Number);
          const [eY, eM, eD] = end.split('-').map(Number);
          const sTime = new Date(sY, sM - 1, sD).getTime();
          const eTime = new Date(eY, eM - 1, eD).getTime();
          
          return selTime >= sTime && selTime <= eTime;
        });
        
        if (micro) { 
          details.macro = { ...macro, nombre: macro.nombre || macro.name || 'Macro' }; 
          details.micro = { 
            ...micro, 
            nombre: micro.nombre || micro.name || 'Micro', 
            tipo: micro.tipo || micro.type || 'BASE', 
            fecha_inicio: micro.fecha_inicio || micro.start_date, 
            fecha_fin: micro.fecha_fin || micro.end_date 
          }; 
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

  const handleDatePress = (dateStr: string) => {
    if (workoutToCopy) {
      pasteWorkout(dateStr);
    } else {
      setSelectedDate(dateStr);
    }
  };

  const handleWorkoutPress = (workout: any) => {
    if (isTrainer) {
      if (workout.completed) {
        router.push(`/training-mode?workoutId=${workout.id}`);
      } else {
        router.push(`/edit-workout?workoutId=${workout.id}`); 
      }
    } else {
      router.push(`/training-mode?workoutId=${workout.id}`);
    }
  };

  const handleCloseMicroInfo = () => {
    setViewMicroInfo(null);
    setExpandedWorkoutId(null);
  };

  const microWorkouts = useMemo(() => {
    if (!viewMicroInfo) return [];
    return workouts
      .filter(w => String(w.microciclo_id || w.microcycle_id) === String(viewMicroInfo.id || viewMicroInfo._id))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [workouts, viewMicroInfo]);

  if (authLoading || (loading && athletes.length === 0)) {
    return (
      <View style={{flex:1, justifyContent:'center', alignItems:'center', backgroundColor: colors.background}}>
        <ActivityIndicator size="large" color={colors.primary}/>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.topHeader}>
        <View style={{flex:1}}>
          <Text style={styles.headerSubtitle}>{isTrainer ? 'AGENDA DEPORTISTA' : 'MI PLANIFICACIÓN'}</Text>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{selectedAthlete?.name || 'Calendario'}</Text>
        </View>
        <View style={{flexDirection:'row', gap: 10}}>
          {workoutToCopy && (
            <TouchableOpacity onPress={() => setWorkoutToCopy(null)} style={[styles.iconBtn, { backgroundColor: (colors.error || '#EF4444') + '20' }]}>
              <Ionicons name="close" size={22} color={colors.error || '#EF4444'} />
            </TouchableOpacity>
          )}
          
          {/* BOTÓN DE AJUSTES DEL CICLO MENSTRUAL */}
          {isFemale && (
            <TouchableOpacity onPress={openCycleSettings} style={[styles.iconBtn, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="water" size={22} color="#EF4444" />
            </TouchableOpacity>
          )}

          {isTrainer && <TouchableOpacity onPress={() => setShowPicker(true)} style={styles.iconBtn}><Ionicons name="people" size={22} color={colors.primary} /></TouchableOpacity>}
          <TouchableOpacity onPress={() => { setUpdating(true); refreshAthleteData(selectedAthlete); }} disabled={updating} style={styles.iconBtn}>
            {updating ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="sync" size={22} color={colors.primary} />}
          </TouchableOpacity>
        </View>
      </View>

      {workoutToCopy && (
        <View style={[styles.copyBanner, { backgroundColor: colors.primary }]}>
          <Ionicons name="copy-outline" size={16} color="#FFF" />
          <Text style={styles.copyBannerText}>Duplicando "{workoutToCopy.title}". Toca un día para pegar.</Text>
        </View>
      )}

      <View style={[styles.mainLayout, isDesktop && styles.mainLayoutDesktop]}>
        
        <View style={[isDesktop && styles.leftColumnDesktop]}>
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
                const isToday = dateStr && dateStr === localTodayStr;
                
                return (
                  <TouchableOpacity 
                    key={i} 
                    style={[
                      styles.dayCell, 
                      status?.phaseColor && { backgroundColor: status.phaseColor + '15', borderRadius: 12 },
                      status?.isPeriod && status?.periodType === 'current' && { 
                        backgroundColor: '#FEE2E2', 
                        borderWidth: 1, 
                        borderColor: '#EF4444', 
                        borderRadius: 12 
                      },
                      status?.isPeriod && status?.periodType === 'predicted' && { 
                        backgroundColor: '#FEE2E2', 
                        borderWidth: 1, 
                        borderColor: '#EF4444', 
                        borderStyle: 'dashed', 
                        borderRadius: 12 
                      },
                      isSelected && { backgroundColor: (status?.phaseColor || colors.primary) + '40', borderWidth: 2, borderColor: status?.phaseColor || colors.primary, borderRadius: 12 },
                      status?.hasWorkout && !isSelected && { borderWidth: 1, borderColor: status.isCompleted ? (colors.success || '#10B981') : colors.primary, borderRadius: 12 }
                    ]}
                    onPress={() => dateStr && handleDatePress(dateStr)}
                    disabled={!day}
                  >
                    {day && (
                      <>
                        <Text style={[
                          styles.dayText, 
                          { color: colors.textPrimary }, 
                          status?.phaseColor && { color: status.phaseColor, fontWeight: '800' },
                          status?.isPeriod && { color: '#EF4444', fontWeight: '900' },
                          isSelected && { color: status?.phaseColor || colors.primary, fontWeight: '900' },
                          isToday && !isSelected && { color: colors.error || '#EF4444', fontWeight: '900' }
                        ]}>
                          {day}
                        </Text>
                        {status?.hasWorkout && status?.isCompleted && (
                          <Ionicons name="checkmark-circle" size={12} color={colors.success || '#10B981'} style={{ position: 'absolute', top: 2, right: 2 }} />
                        )}
                        {status?.isPeriod && (
                          <Ionicons name="water" size={10} color="#EF4444" style={{ position: 'absolute', bottom: 2, right: 4 }} />
                        )}
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        <ScrollView style={[styles.footer, isDesktop && styles.rightColumnDesktop]} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          
          {periodDays[selectedDate] && (
            <View style={[styles.periodWarning, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}>
              <Ionicons name="water" size={20} color="#EF4444" />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={{ color: '#991B1B', fontWeight: '800', fontSize: 13 }}>
                  {periodDays[selectedDate].type === 'current' ? 'Sangrado menstrual actual' : 'Sangrado menstrual estimado'}
                </Text>
                <Text style={{ color: '#B91C1C', fontSize: 11, marginTop: 2 }}>El rendimiento y la fuerza máxima podrían verse alterados.</Text>
              </View>
            </View>
          )}

          <View style={{ marginBottom: 25 }}>
            <Text style={styles.footerLabel}>FASES DE ESTE MES</Text>
            {microciclosDelMes.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20, marginTop: 10 }}>
                {microciclosDelMes.map((micro, idx) => (
                  <TouchableOpacity 
                    key={idx} 
                    style={[styles.microCard, { backgroundColor: colors.surface, borderTopColor: micro.color || colors.primary, borderColor: colors.border }]}
                    onPress={() => setViewMicroInfo(micro)}
                  >
                    <Text style={[styles.microMacroName, { color: colors.textSecondary }]} numberOfLines={1}>{micro.macroNombre}</Text>
                    <Text style={[styles.microName, { color: colors.textPrimary }]} numberOfLines={1}>{micro.nombre}</Text>
                    <View style={[styles.microTypeBadge, { backgroundColor: (micro.color || colors.primary) + '15' }]}>
                      <Text style={{ color: micro.color || colors.primary, fontSize: 10, fontWeight: '800' }}>{micro.tipo}</Text>
                    </View>
                    <Text style={[styles.microDates, { color: colors.textSecondary }]}>
                      {micro.fecha_inicio.split('-').slice(1).reverse().join('/')} al {micro.fecha_fin.split('-').slice(1).reverse().join('/')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', marginTop: 10 }}>
                No hay fases/microciclos planificados para este mes.
              </Text>
            )}
          </View>

          <Text style={styles.footerLabel}>DETALLE DEL {selectedDate.split('-').reverse().join('/')}</Text>
          
          {activeDetail.workouts.length > 0 ? (
            activeDetail.workouts.map((wk: any) => (
              <View key={wk.id} style={[styles.workoutCard, { backgroundColor: colors.surface }]}>
                <TouchableOpacity 
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                  onPress={() => handleWorkoutPress(wk)}
                >
                  <View style={[styles.workoutIcon, { backgroundColor: wk.completed ? (colors.success || '#10B981') + '15' : colors.primary + '15' }]}>
                    <Ionicons name={wk.completed ? "checkmark-done" : "barbell"} size={22} color={wk.completed ? (colors.success || '#10B981') : colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.workoutTitle, { color: colors.textPrimary }]}>{wk.title}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {wk.completed ? 'Completado' : isTrainer ? 'Sesión asignada' : 'Sesión pendiente'}
                    </Text>
                  </View>
                </TouchableOpacity>
                
                <View style={styles.workoutActions}>
                  {isTrainer && (
                    <>
                      <TouchableOpacity onPress={() => handleDeleteWorkout(wk)} style={styles.actionIconBtn}>
                        <Ionicons name="trash-outline" size={20} color={colors.error || '#EF4444'} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => startCopyWorkout(wk)} style={styles.actionIconBtn}>
                        <Ionicons name="copy-outline" size={20} color={colors.primary} />
                      </TouchableOpacity>
                    </>
                  )}
                  <TouchableOpacity onPress={() => handleWorkoutPress(wk)} style={styles.actionIconBtn}>
                    <Ionicons name={isTrainer ? (wk.completed ? "eye" : "pencil") : "chevron-forward"} size={20} color={colors.border} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="calendar-clear-outline" size={32} color={colors.border} />
              <Text style={{ color: colors.textSecondary, marginTop: 10 }}>Día sin sesiones programadas.</Text>
            </View>
          )}
        </ScrollView>
      </View>

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

      {/* NUEVO MODAL: AJUSTES DE CICLO MENSTRUAL */}
      <Modal visible={showCycleSettings} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlayCenter} onPress={() => setShowCycleSettings(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalContentInfo, { backgroundColor: colors.surface, width: '85%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, width: '100%', justifyContent: 'center' }}>
              <View style={[styles.phaseIconBadge, { backgroundColor: '#FEE2E2', marginRight: 10 }]}>
                <Ionicons name="water" size={24} color="#EF4444" />
              </View>
              <Text style={[styles.modalTitle, { color: colors.textPrimary, marginBottom: 0 }]}>Ajustes del Ciclo</Text>
            </View>

            <Text style={[styles.label, { color: colors.textSecondary, alignSelf: 'flex-start' }]}>Duración habitual del ciclo completo (días):</Text>
            <TextInput 
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, marginBottom: 20, width: '100%' }]} 
              keyboardType="numeric" 
              value={cycleLengthInput} 
              onChangeText={setCycleLengthInput} 
            />

            <Text style={[styles.label, { color: colors.textSecondary, alignSelf: 'flex-start' }]}>Días habituales de sangrado:</Text>
            <TextInput 
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, marginBottom: 25, width: '100%' }]} 
              keyboardType="numeric" 
              value={periodLengthInput} 
              onChangeText={setPeriodLengthInput} 
            />

            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={() => setShowCycleSettings(false)}>
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={handleSaveCycleSettings} disabled={updating}>
                {updating ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '700' }}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!viewMicroInfo} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlayCenter} onPress={handleCloseMicroInfo}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalContentInfo, { backgroundColor: colors.surface }]}>
            {viewMicroInfo && (
              <View style={{ alignItems: 'center', width: '100%', flex: 1 }}>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <View style={[styles.phaseIconBadge, { backgroundColor: (viewMicroInfo.color || colors.primary) + '15' }]}>
                    <Ionicons name="flag" size={24} color={viewMicroInfo.color || colors.primary} />
                  </View>
                  <TouchableOpacity onPress={handleCloseMicroInfo}>
                    <Ionicons name="close" size={24} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>PERTENECE AL MACROCICLO:</Text>
                <Text style={[styles.infoTitleMacro, { color: colors.textPrimary }]}>{viewMicroInfo.macroNombre}</Text>
                
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>FASE ACTUAL (MICROCICLO):</Text>
                <Text style={[styles.infoTitleMicro, { color: colors.textPrimary }]}>{viewMicroInfo.nombre}</Text>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
                  <View style={[styles.microTypeBadgeBig, { backgroundColor: (viewMicroInfo.color || colors.primary) }]}>
                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '900', letterSpacing: 1 }}>{viewMicroInfo.tipo}</Text>
                  </View>
                  <View style={[styles.datesRow, { marginTop: 0 }]}>
                    <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginLeft: 6 }}>
                      {viewMicroInfo.fecha_inicio.split('-').reverse().join('/')} - {viewMicroInfo.fecha_fin.split('-').reverse().join('/')}
                    </Text>
                  </View>
                </View>

                <View style={{ width: '100%', marginTop: 25, flexShrink: 1 }}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary, marginBottom: 10, textAlign: 'left' }]}>
                    SESIONES PROGRAMADAS ({microWorkouts.length})
                  </Text>
                  
                  <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={true}>
                    {microWorkouts.map(wk => (
                      <View key={wk.id} style={[styles.microWorkoutCard, { borderColor: colors.border }]}>
                        <TouchableOpacity 
                          style={[styles.microWorkoutHeader, { backgroundColor: colors.surfaceHighlight }]}
                          onPress={() => setExpandedWorkoutId(expandedWorkoutId === wk.id ? null : wk.id)}
                        >
                          <Ionicons name="barbell-outline" size={18} color={viewMicroInfo.color || colors.primary} />
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>{wk.title}</Text>
                            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{wk.date.split('-').reverse().join('/')}</Text>
                          </View>
                          <Ionicons name={expandedWorkoutId === wk.id ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
                        </TouchableOpacity>

                        {expandedWorkoutId === wk.id && (
                          <View style={[styles.microWorkoutExercises, { borderTopColor: colors.border }]}>
                            {wk.exercises && wk.exercises.length > 0 ? (
                              wk.exercises.map((ex: any, i: number) => {
                                if (ex.is_hiit_block) {
                                  return (
                                    <View key={i} style={{ marginBottom: 8 }}>
                                      <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 12 }}>⚡ {ex.name}</Text>
                                      {ex.hiit_exercises?.map((he: any, j: number) => (
                                        <Text key={j} style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 15, marginTop: 2 }}>
                                          • {he.name} <Text style={{fontWeight: '600', color: colors.textPrimary}}>({he.duration_reps})</Text>
                                        </Text>
                                      ))}
                                    </View>
                                  );
                                } else {
                                  return (
                                    <Text key={i} style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>
                                      • {ex.name} <Text style={{fontWeight: '600', color: viewMicroInfo.color || colors.primary}}>{ex.sets}x{ex.reps}</Text>
                                    </Text>
                                  );
                                }
                              })
                            ) : (
                              <Text style={{ color: colors.textSecondary, fontSize: 12, fontStyle: 'italic' }}>Sin ejercicios registrados.</Text>
                            )}
                          </View>
                        )}
                      </View>
                    ))}
                    {microWorkouts.length === 0 && (
                      <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: 15 }}>
                        No hay sesiones asignadas a esta fase todavía.
                      </Text>
                    )}
                  </ScrollView>
                </View>

                {isTrainer && (
                  <TouchableOpacity 
                    style={[styles.editPhaseBtn, { borderColor: viewMicroInfo.color || colors.primary }]} 
                    onPress={() => {
                      handleCloseMicroInfo();
                      router.push(`/periodization?athlete_id=${selectedAthlete.id}&name=${encodeURIComponent(selectedAthlete.name)}`);
                    }}
                  >
                    <Ionicons name="pencil" size={18} color={viewMicroInfo.color || colors.primary} />
                    <Text style={{ color: viewMicroInfo.color || colors.primary, fontWeight: '800', fontSize: 13, marginLeft: 8 }}>
                      EDITAR PLANIFICACIÓN
                    </Text>
                  </TouchableOpacity>
                )}

              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainLayout: { flex: 1, flexDirection: 'column' },
  mainLayoutDesktop: { flexDirection: 'row', paddingHorizontal: 20, gap: 30 },
  leftColumnDesktop: { flex: 1, maxWidth: 380, minWidth: 300 }, 
  rightColumnDesktop: { flex: 1, paddingTop: 0, paddingHorizontal: 0 },
  
  topHeader: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  headerSubtitle: { fontSize: 10, fontWeight: '800', color: '#888', letterSpacing: 1.5 },
  headerTitle: { fontSize: 24, fontWeight: '900' },
  iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.03)', justifyContent: 'center', alignItems: 'center' },
  copyBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 20, justifyContent: 'center' },
  copyBannerText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  monthSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginVertical: 15 },
  monthLabel: { fontSize: 18, fontWeight: '900', textTransform: 'capitalize' },
  calendarGrid: { paddingHorizontal: 15 },
  weekDays: { flexDirection: 'row', marginBottom: 10 },
  weekDayText: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  dayText: { fontSize: 15, fontWeight: '600' },
  
  footer: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  footerLabel: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 15, letterSpacing: 1, textTransform: 'uppercase' },
  
  periodWarning: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 25 },
  
  microCard: { padding: 14, borderRadius: 16, borderTopWidth: 4, borderWidth: 1, width: 160, marginRight: 12 },
  microMacroName: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  microName: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
  microTypeBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 8 },
  microDates: { fontSize: 11, fontWeight: '600' },
  workoutCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 18, marginBottom: 12 },
  workoutIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  workoutTitle: { fontSize: 16, fontWeight: '800' },
  workoutActions: { flexDirection: 'row', gap: 5 },
  actionIconBtn: { padding: 8 },
  emptyCard: { alignItems: 'center', paddingVertical: 30 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { padding: 25, borderTopLeftRadius: 30, borderTopRightRadius: 30, width: '100%', position: 'absolute', bottom: 0 },
  modalTitle: { fontSize: 18, fontWeight: '900', marginBottom: 20 },
  athleteItem: { paddingVertical: 18, borderBottomWidth: 1 },

  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContentInfo: { width: '90%', maxHeight: '85%', margin: 20, padding: 25, borderRadius: 30, alignItems: 'center', elevation: 5 },
  phaseIconBadge: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  infoLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 10, textAlign: 'center' },
  infoTitleMacro: { fontSize: 18, fontWeight: '900', marginTop: 4, textAlign: 'center' },
  divider: { height: 1, width: '80%', marginVertical: 15, opacity: 0.5 },
  infoTitleMicro: { fontSize: 20, fontWeight: '900', marginTop: 4, textAlign: 'center' },
  microTypeBadgeBig: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  datesRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.03)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  
  microWorkoutCard: { borderWidth: 1, borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  microWorkoutHeader: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  microWorkoutExercises: { padding: 14, borderTopWidth: 1 },
  
  editPhaseBtn: { flexDirection: 'row', width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginTop: 20 },
  
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  label: { fontSize: 11, fontWeight: '800', marginBottom: 6, letterSpacing: 0.5 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' }
});
