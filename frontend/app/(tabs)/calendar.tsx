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

const getLocalDateStr = (date: Date) => {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const extractDateString = (dateVal: any) => {
  if (!dateVal) return null;
  if (typeof dateVal === 'string') return dateVal.split('T')[0]; 
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) return getLocalDateStr(dateVal);
  return null;
};

const now = new Date();
const localTodayStr = getLocalDateStr(now);

export default function CalendarScreen() {
  const { user, loading: authLoading, updateUser } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  
  const { width } = useWindowDimensions();
  const isDesktop = width >= 800; 
  
  // --- ESTADOS DE VISTA ---
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  
  // Estados Calendario Mensual
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState(localTodayStr);

  // Estados Calendario Semanal
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const d = new Date(now);
    const day = d.getDay() || 7; 
    d.setDate(d.getDate() - day + 1); // Lunes de la semana actual
    return d;
  });
  
  // --- ESTADOS DE DATOS ---
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

  const [showCycleSettings, setShowCycleSettings] = useState(false);
  const [cycleLengthInput, setCycleLengthInput] = useState('28');
  const [periodLengthInput, setPeriodLengthInput] = useState('5');
  const [lastPeriodDateInput, setLastPeriodDateInput] = useState('');

  const [showSkipModal, setShowSkipModal] = useState(false);
  const [skipWorkoutId, setSkipWorkoutId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');

  const isTrainer = user?.role === 'trainer';
  const isFemale = ['female', 'mujer', 'femenino'].includes(selectedAthlete?.gender?.toLowerCase() || '');

  useEffect(() => { 
    if (!authLoading && user) init(); 
  }, [authLoading, user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (selectedAthlete) {
        if (workouts.length === 0) setUpdating(true); 
        refreshAthleteData(selectedAthlete);
      }
    }, [selectedAthlete])
  );

  const init = async () => {
    try {
      if (isTrainer) {
        const data = await api.getAthletes();
        setAthletes(Array.isArray(data) ? data : []);
        if (data && data.length > 0 && !selectedAthlete) handleSelectAthlete(data[0]);
      } else {
        handleSelectAthlete(user);
      }
    } catch (e) { 
      console.log("Error inicializando:", e); 
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
      console.log("Error recargando:", e); 
    } finally { 
      setUpdating(false); setLoading(false);
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
    if (Platform.OS !== 'web') Alert.alert("Modo Duplicar", "Toca cualquier día del calendario para pegar este entrenamiento.");
  };

  const pasteWorkout = async (targetDate: string) => {
    if (!workoutToCopy) return;
    setUpdating(true);
    try {
      const newWorkout = { ...workoutToCopy, date: targetDate, completed: false, completion_data: null, athlete_id: selectedAthlete.id };
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
      console.error("Error al eliminar:", error);
      if (Platform.OS !== 'web') Alert.alert("Error", "No se pudo eliminar la sesión.");
      setUpdating(false);
    }
  };

  const handleDeleteWorkout = (workout: any) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`¿Seguro que quieres eliminar la sesión "${workout.title}"?`)) executeDeleteWorkout(workout.id);
    } else {
      Alert.alert("Eliminar Sesión", `¿Seguro que quieres borrar "${workout.title}"?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: () => executeDeleteWorkout(workout.id) }
      ]);
    }
  };

  const handleSkipSubmit = async () => {
    if (!skipReason.trim()) {
      if (Platform.OS === 'web') window.alert("Indica el motivo para que lo revise el coach.");
      else Alert.alert("Aviso", "Indica el motivo para que lo revise el coach.");
      return;
    }
    setUpdating(true);
    try {
      const workout = workouts.find(w => w.id === skipWorkoutId);
      if(workout) {
        await api.updateWorkout(skipWorkoutId!, {
          ...workout,
          completed: true,
          observations: `[NO COMPLETADA] Motivo: ${skipReason}`
        });
      }
      setShowSkipModal(false);
      setSkipReason('');
      refreshAthleteData(selectedAthlete);
    } catch(e) {
      if (Platform.OS !== 'web') Alert.alert("Error", "No se pudo actualizar.");
      setUpdating(false);
    }
  };

  const getActualDayOneStr = () => {
    try {
      if (!wellnessHistory || !Array.isArray(wellnessHistory) || wellnessHistory.length === 0) return '';
      const menstrualLogs = wellnessHistory
        .filter(w => w && w.date && (w.cycle_phase === 'menstrual' || w.cycle_phase?.startsWith('menstruacion')))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      
      if (menstrualLogs.length === 0) return '';

      let actualDayOneStr = extractDateString(menstrualLogs[0].date) || '';
      for (let i = 0; i < menstrualLogs.length - 1; i++) {
        const d1 = extractDateString(menstrualLogs[i].date);
        const d2 = extractDateString(menstrualLogs[i+1].date);
        if (!d1 || !d2) continue;

        const p1 = d1.split('-');
        const p2 = d2.split('-');
        const date1 = new Date(Number(p1[0]), Number(p1[1]) - 1, Number(p1[2]));
        const date2 = new Date(Number(p2[0]), Number(p2[1]) - 1, Number(p2[2]));
        
        const diffDays = (date1.getTime() - date2.getTime()) / (1000 * 3600 * 24);
        if (diffDays <= 2) actualDayOneStr = d2;
        else break; 
      }
      return actualDayOneStr;
    } catch (e) { return ''; }
  };

  const openCycleSettings = () => {
    setCycleLengthInput(String(selectedAthlete?.cycle_length || 28));
    setPeriodLengthInput(String(selectedAthlete?.period_length || 5));
    setLastPeriodDateInput(extractDateString(selectedAthlete?.last_period_date) || getActualDayOneStr()); 
    setShowCycleSettings(true);
  };

  const handleSaveCycleSettings = async () => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (lastPeriodDateInput && !dateRegex.test(lastPeriodDateInput)) {
        const errorMsg = "⚠️ El formato de la fecha debe ser AAAA-MM-DD (Ejemplo: 2026-03-21)";
        if (Platform.OS === 'web') window.alert(errorMsg);
        else Alert.alert("Revisa la fecha", errorMsg);
        return;
    }

    setUpdating(true);
    try {
      const payload = { 
          cycle_length: parseInt(cycleLengthInput) || 28, 
          period_length: parseInt(periodLengthInput) || 5,
          last_period_date: lastPeriodDateInput
      };
      
      if (isTrainer && api.updateAthlete) await api.updateAthlete(selectedAthlete.id, payload);
      else if (api.updateProfile) { await api.updateProfile(payload); updateUser(payload); }

      setSelectedAthlete({ ...selectedAthlete, ...payload });

      const currentActualDayOne = getActualDayOneStr();
      if (lastPeriodDateInput && lastPeriodDateInput !== currentActualDayOne) {
          const wellnessData = { athlete_id: selectedAthlete.id, date: lastPeriodDateInput, cycle_phase: 'menstruacion', sleep_quality: 3, stress_level: 3, muscle_soreness: 3, energy_level: 3 };
          try {
             if (api.submitWellness) await api.submitWellness(wellnessData);
             else if ((api as any).createWellness) await (api as any).createWellness(wellnessData);
             else if ((api as any).logWellness) await (api as any).logWellness(wellnessData);
             setWellnessHistory(prev => [...prev, wellnessData]);
          } catch (wellnessErr) { console.warn("Wellness silencioso falló:", wellnessErr); }
      }

      setShowCycleSettings(false);
      setUpdating(false);
    } catch (e) {
      console.error("Error guardando ajustes:", e);
      if (Platform.OS === 'web') window.alert("No se pudieron guardar los ajustes.");
      else Alert.alert("Error", "No se pudieron guardar los ajustes generales.");
      setUpdating(false);
    }
  };

  // --- LÓGICA SEMANAL ---
  const changeWeek = (dir: number) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + (dir * 7));
    setCurrentWeekStart(d);
  };

  const currentWeekDays = useMemo(() => {
    const days = [];
    for(let i=0; i<7; i++) {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentWeekStart]);

  // --- LÓGICA MENSUAL ---
  const changeMonth = (dir: number) => {
    if (dir === -1) { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); } else setCurrentMonth(currentMonth - 1); } 
    else { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); } else setCurrentMonth(currentMonth + 1); }
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

  // --- LÓGICA CICLO MESTRUAL (Se mantiene igual) ---
  const cycleData = useMemo(() => {
    try {
      if (!isFemale) return null;
      let actualDayOneStr = extractDateString(selectedAthlete?.last_period_date);
      if (!actualDayOneStr) {
          if (!wellnessHistory || wellnessHistory.length === 0) return null;
          actualDayOneStr = getActualDayOneStr();
      }
      if (!actualDayOneStr) return null;
      const parts = actualDayOneStr.split('-');
      const startY = Number(parts[0]); const startM = Number(parts[1]); const startD = Number(parts[2]);
      if (isNaN(startY) || isNaN(startM) || isNaN(startD)) return null;

      const actualDayOne = new Date(startY, startM - 1, startD);
      const cycleLength = Number(selectedAthlete?.cycle_length) || 28;
      const periodLength = Number(selectedAthlete?.period_length) || 5;
      return { actualDayOne, cycleLength, periodLength };
    } catch (e) { return null; }
  }, [wellnessHistory, selectedAthlete, isFemale]);

  const periodDays = useMemo(() => {
    try {
      if (!cycleData || !cycleData.actualDayOne || isNaN(cycleData.actualDayOne.getTime())) return {};
      const daysDict: Record<string, { type: 'current' | 'predicted' }> = {};
      for (let cycleIndex = 0; cycleIndex <= 6; cycleIndex++) {
        const cycleStart = new Date(cycleData.actualDayOne.getTime());
        cycleStart.setDate(cycleData.actualDayOne.getDate() + (cycleData.cycleLength * cycleIndex));
        for (let i = 0; i < cycleData.periodLength; i++) {
          const dayDate = new Date(cycleStart.getTime());
          dayDate.setDate(cycleStart.getDate() + i);
          const dateStr = getLocalDateStr(dayDate);
          if (dateStr && !daysDict[dateStr]) daysDict[dateStr] = { type: cycleIndex === 0 ? 'current' : 'predicted' };
        }
      }
      return daysDict;
    } catch (e) { return {}; }
  }, [cycleData]);

  const getPhaseForDate = (targetDateStr: string) => {
    try {
      if (!cycleData || !cycleData.actualDayOne || isNaN(cycleData.actualDayOne.getTime())) return null;
      if (!targetDateStr) return null;
      const parts = targetDateStr.split('-');
      const targetTime = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime();
      const startTime = cycleData.actualDayOne.getTime();
      const diffDays = Math.floor((targetTime - startTime) / (1000 * 3600 * 24));
      if (diffDays < 0) return null;
      const currentCycleDay = (diffDays % cycleData.cycleLength) + 1;

      if (currentCycleDay <= cycleData.periodLength) {
        return { day: currentCycleDay, name: 'Fase Menstrual', color: '#EF4444', icon: 'water', training: 'Baja carga. Prioriza técnica y recuperación.', risk: 'Fatiga general alta. Escucha a tu cuerpo.', nutrition: 'Aumenta el hierro y alimentos antiinflamatorios.' };
      } else if (currentCycleDay <= Math.floor(cycleData.cycleLength / 2) - 2) {
        return { day: currentCycleDay, name: 'Fase Folicular', color: '#10B981', icon: 'leaf', training: 'Alta energía. Ideal para entrenos de fuerza.', risk: 'Bajo riesgo. ¡Aprovecha el pico de energía!', nutrition: 'Mayor sensibilidad a la insulina. Cargas de carbohidratos eficientes.' };
      } else if (currentCycleDay <= Math.floor(cycleData.cycleLength / 2) + 2) {
        return { day: currentCycleDay, name: 'Fase Ovulatoria', color: '#F59E0B', icon: 'sunny', training: 'Pico de fuerza máxima. Cuidado con el exceso de confianza.', risk: 'ALTO RIESGO: Mayor laxitud de ligamentos (rodillas/hombros). Controla los aterrizajes.', nutrition: 'Mantén hidratación alta y proteína para recuperación.' };
      } else {
        return { day: currentCycleDay, name: 'Fase Lútea', color: '#8B5CF6', icon: 'moon', training: 'Posible bajón de energía. Reduce intensidad si notas pesadez.', risk: 'Aumenta la temperatura basal y fatiga central.', nutrition: 'El cuerpo quema más grasas. Antojos normales; prioriza grasas saludables.' };
      }
    } catch (e) { return null; }
  };

  const microciclosDelMes = useMemo(() => {
    try {
      if (!Array.isArray(macros)) return [];
      const microsResult: any[] = [];
      const firstDayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const lastDayNum = new Date(currentYear, currentMonth + 1, 0).getDate();
      const lastDayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

      macros.forEach(macro => {
        const listaMicros = macro.microciclos || macro.microcycles || [];
        if (Array.isArray(listaMicros)) {
          listaMicros.forEach((m: any) => {
            const start = extractDateString(m.fecha_inicio || m.start_date);
            const end = extractDateString(m.fecha_fin || m.end_date);
            if (start && end && start <= lastDayStr && end >= firstDayStr) {
              microsResult.push({ ...m, macroNombre: macro.nombre || macro.name || 'Macro', nombre: m.nombre || m.name || 'Micro', fecha_inicio: start, fecha_fin: end, tipo: m.tipo || m.type || 'BASE', color: m.color || macro.color || colors.primary });
            }
          });
        }
      });
      return microsResult.sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
    } catch (e) { return []; }
  }, [macros, currentMonth, currentYear, colors.primary]);

  const monthStatusMap = useMemo(() => {
    const map: Record<string, any> = {};
    Object.keys(periodDays).forEach(dateStr => {
      if (!map[dateStr]) map[dateStr] = { hasWorkout: false, isCompleted: false, phaseColor: null, isPeriod: false, periodType: null };
      map[dateStr].isPeriod = true; map[dateStr].periodType = periodDays[dateStr].type;
    });

    workouts?.forEach(w => {
      const dateStr = extractDateString(w.date);
      if (dateStr) {
        if (!map[dateStr]) map[dateStr] = { hasWorkout: false, isCompleted: true, phaseColor: null, isPeriod: false, periodType: null };
        map[dateStr].hasWorkout = true;
        map[dateStr].isCompleted = map[dateStr].isCompleted && w.completed; 
      }
    });

    if (Array.isArray(macros)) {
      macros.forEach(macro => {
        const listaMicros = macro.microciclos || macro.microcycles || [];
        listaMicros.forEach((m: any) => {
          const start = extractDateString(m.fecha_inicio || m.start_date);
          const end = extractDateString(m.fecha_fin || m.end_date);
          if (start && end) {
            let curr = new Date(start); const endDate = new Date(end);
            while (curr <= endDate) {
              const dStr = getLocalDateStr(curr);
              if (!map[dStr]) map[dStr] = { hasWorkout: false, isCompleted: false, phaseColor: null, isPeriod: false, periodType: null };
              map[dStr].phaseColor = m.color || macro.color || colors.primary;
              curr.setDate(curr.getDate() + 1);
            }
          }
        });
      });
    }
    return map;
  }, [workouts, macros, periodDays, colors.primary]);

  const getDayStatus = useCallback((day: number | null) => {
    if (!day) return null;
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return monthStatusMap[dateStr] || null;
  }, [currentYear, currentMonth, monthStatusMap]);

  const activeDetail = { workouts: workouts?.filter(w => extractDateString(w.date) === selectedDate) || [] };
  const phaseInfo = getPhaseForDate(selectedDate);

  const handleDatePress = (dateStr: string) => { workoutToCopy ? pasteWorkout(dateStr) : setSelectedDate(dateStr); };
  const handleWorkoutPress = (workout: any) => { router.push(isTrainer && !workout.completed ? `/edit-workout?workoutId=${workout.id}` : `/training-mode?workoutId=${workout.id}`); };
  const handleCloseMicroInfo = () => { setViewMicroInfo(null); setExpandedWorkoutId(null); };

  const microWorkouts = useMemo(() => {
    if (!viewMicroInfo) return [];
    return workouts.filter(w => String(w.microciclo_id || w.microcycle_id) === String(viewMicroInfo.id || viewMicroInfo._id)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [workouts, viewMicroInfo]);

  if (authLoading || (loading && athletes.length === 0)) return <View style={{flex:1, justifyContent:'center', alignItems:'center', backgroundColor: colors.background}}><ActivityIndicator size="large" color={colors.primary}/></View>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* --- CABECERA PRINCIPAL --- */}
      <View style={styles.topHeader}>
        <View style={{flex:1}}>
          <Text style={styles.headerSubtitle}>{isTrainer ? 'AGENDA DEPORTISTA' : 'MI PLANIFICACIÓN'}</Text>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{selectedAthlete?.name || 'Calendario'}</Text>
        </View>

        <View style={styles.viewToggleContainer}>
          <TouchableOpacity onPress={() => setViewMode('month')} style={[styles.viewToggleBtn, viewMode === 'month' && {backgroundColor: colors.primary}]}>
             <Ionicons name="calendar-outline" size={14} color={viewMode === 'month' ? '#FFF' : colors.textSecondary} />
             {isDesktop && <Text style={[styles.viewToggleText, viewMode === 'month' && {color: '#FFF'}]}>Mes</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setViewMode('week')} style={[styles.viewToggleBtn, viewMode === 'week' && {backgroundColor: colors.primary}]}>
             <Ionicons name="list" size={14} color={viewMode === 'week' ? '#FFF' : colors.textSecondary} />
             {isDesktop && <Text style={[styles.viewToggleText, viewMode === 'week' && {color: '#FFF'}]}>Semana</Text>}
          </TouchableOpacity>
        </View>

        <View style={{flexDirection:'row', gap: 10, marginLeft: 10}}>
          {workoutToCopy && <TouchableOpacity onPress={() => setWorkoutToCopy(null)} style={[styles.iconBtn, { backgroundColor: (colors.error || '#EF4444') + '20' }]}><Ionicons name="close" size={22} color={colors.error || '#EF4444'} /></TouchableOpacity>}
          {isFemale && <TouchableOpacity onPress={openCycleSettings} style={[styles.iconBtn, { backgroundColor: '#FEE2E2' }]}><Ionicons name="water" size={22} color="#EF4444" /></TouchableOpacity>}
          {isTrainer && <TouchableOpacity onPress={() => setShowPicker(true)} style={styles.iconBtn}><Ionicons name="people" size={22} color={colors.primary} /></TouchableOpacity>}
          <TouchableOpacity onPress={() => { setUpdating(true); refreshAthleteData(selectedAthlete); }} disabled={updating} style={styles.iconBtn}>
            {updating ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="sync" size={22} color={colors.primary} />}
          </TouchableOpacity>
        </View>
      </View>

      {workoutToCopy && <View style={[styles.copyBanner, { backgroundColor: colors.primary }]}><Ionicons name="copy-outline" size={16} color="#FFF" /><Text style={styles.copyBannerText}>Duplicando "{workoutToCopy.title}". Toca un día para pegar.</Text></View>}

      {/* --- RENDER CONDICIONAL: SEMANA o MES --- */}
      {viewMode === 'week' ? (
        <View style={{flex: 1}}>
          <View style={styles.monthSelector}>
            <TouchableOpacity onPress={() => changeWeek(-1)}><Ionicons name="chevron-back" size={24} color={colors.textPrimary}/></TouchableOpacity>
            <Text style={[styles.monthLabel, { color: colors.textPrimary, fontSize: 16 }]}>Semana del {currentWeekStart.getDate()} de {MONTHS[currentWeekStart.getMonth()]}</Text>
            <TouchableOpacity onPress={() => changeWeek(1)}><Ionicons name="chevron-forward" size={24} color={colors.textPrimary}/></TouchableOpacity>
          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={isDesktop ? undefined : width * 0.88} decelerationRate="fast" style={{flex: 1}}>
            {currentWeekDays.map((dayDate, i) => {
              const dStr = getLocalDateStr(dayDate);
              const dayWorkouts = workouts.filter(w => extractDateString(w.date) === dStr);
              const isToday = dStr === localTodayStr;
              const columnWidth = isDesktop ? Math.max(width / 7, 280) : width * 0.88;

              return (
                <View key={i} style={[styles.weekDayColumn, { width: columnWidth, backgroundColor: isToday ? colors.primary + '08' : 'transparent' }]}>
                  <TouchableOpacity style={[styles.weekDayHeader, isToday && {borderBottomColor: colors.primary, borderBottomWidth: 3}]} onPress={() => handleDatePress(dStr)}>
                    <Text style={{color: isToday ? colors.primary : colors.textSecondary, fontWeight: '900', textTransform: 'uppercase', fontSize: 12}}>{DAYS[i]}</Text>
                    <Text style={{color: isToday ? colors.primary : colors.textPrimary, fontSize: 24, fontWeight: '900'}}>{dayDate.getDate()}</Text>
                  </TouchableOpacity>

                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 40, paddingHorizontal: 10}}>
                    {dayWorkouts.length > 0 ? dayWorkouts.map(wk => (
                      <View key={wk.id} style={[styles.weeklyWorkoutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <TouchableOpacity style={[styles.weeklyWorkoutHeader, { backgroundColor: wk.completed ? colors.success + '15' : colors.primary + '10' }]} onPress={() => handleWorkoutPress(wk)}>
                          <Text style={{fontWeight: '900', color: colors.textPrimary, flex: 1, fontSize: 13}} numberOfLines={1}>{wk.title}</Text>
                          <Ionicons name={wk.completed ? "checkmark-circle" : "arrow-forward-circle"} size={18} color={wk.completed ? colors.success : colors.primary} />
                        </TouchableOpacity>
                        <View style={{padding: 12}}>
                           {wk.exercises?.map((ex: any, idx: number) => (
                             <View key={idx} style={{marginBottom: 10, borderBottomWidth: idx === wk.exercises.length - 1 ? 0 : 0.5, borderBottomColor: colors.border, paddingBottom: 6}}>
                               <Text style={{color: colors.textPrimary, fontSize: 12, fontWeight: '700'}}>• {ex.name}</Text>
                               {ex.is_hiit_block ? (
                                  <Text style={{color: colors.textSecondary, fontSize: 11, marginLeft: 10, fontStyle: 'italic'}}>Circuito HIIT ({ex.sets} vueltas)</Text>
                               ) : (
                                  <Text style={{color: colors.primary, fontSize: 11, fontWeight: '900', marginLeft: 10}}>{ex.sets}x{ex.reps} {ex.weight ? `@ ${ex.weight}kg` : ''}</Text>
                               )}
                             </View>
                           ))}
                           {(!wk.exercises || wk.exercises.length === 0) && <Text style={{color: colors.textSecondary, fontSize: 11, fontStyle: 'italic'}}>Sin ejercicios detallados</Text>}
                        </View>
                        {isTrainer && (
                          <View style={{flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceHighlight}}>
                            <TouchableOpacity style={{flex: 1, padding: 10, alignItems: 'center', borderRightWidth: 1, borderRightColor: colors.border}} onPress={() => startCopyWorkout(wk)}><Ionicons name="copy-outline" size={16} color={colors.textSecondary} /></TouchableOpacity>
                            <TouchableOpacity style={{flex: 1, padding: 10, alignItems: 'center'}} onPress={() => handleDeleteWorkout(wk)}><Ionicons name="trash-outline" size={16} color={colors.error} /></TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )) : (
                      <View style={styles.emptyDayWeekly}>
                        <Ionicons name="cafe-outline" size={32} color={colors.border} />
                        <Text style={{color: colors.textSecondary, fontSize: 12, marginTop: 8, fontWeight: '600'}}>Descanso</Text>
                      </View>
                    )}
                  </ScrollView>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        /* --- MODO MENSUAL --- */
        <View style={[styles.mainLayout, isDesktop && styles.mainLayoutDesktop]}>
          <View style={[isDesktop && styles.leftColumnDesktop]}>
            <View style={styles.monthSelector}>
              <TouchableOpacity onPress={() => changeMonth(-1)}><Ionicons name="chevron-back" size={24} color={colors.textPrimary}/></TouchableOpacity>
              <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>{MONTHS[currentMonth]} {currentYear}</Text>
              <TouchableOpacity onPress={() => changeMonth(1)}><Ionicons name="chevron-forward" size={24} color={colors.textPrimary}/></TouchableOpacity>
            </View>

            <View style={styles.calendarGrid}>
              <View style={styles.weekDays}>{DAYS.map(d => <Text key={d} style={[styles.weekDayText, { color: colors.textSecondary }]}>{d}</Text>)}</View>
              <View style={styles.daysGrid}>
                {daysInMonth.map((day, i) => {
                  const status = getDayStatus(day);
                  const dateStr = day ? `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
                  const isSelected = dateStr && selectedDate === dateStr;
                  const isToday = dateStr && dateStr === localTodayStr;
                  
                  return (
                    <TouchableOpacity key={i} style={[styles.dayCell, status?.phaseColor && { backgroundColor: status.phaseColor + '15', borderRadius: 12 }, status?.isPeriod && status?.periodType === 'current' && { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#EF4444', borderRadius: 12 }, status?.isPeriod && status?.periodType === 'predicted' && { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#EF4444', borderStyle: 'dashed', borderRadius: 12 }, isSelected && { backgroundColor: (status?.phaseColor || colors.primary) + '40', borderWidth: 2, borderColor: status?.phaseColor || colors.primary, borderRadius: 12 }, status?.hasWorkout && !isSelected && { borderWidth: 1, borderColor: status.isCompleted ? (colors.success || '#10B981') : colors.primary, borderRadius: 12 }]} onPress={() => dateStr && handleDatePress(dateStr)} disabled={!day}>
                      {day && (
                        <>
                          <Text style={[styles.dayText, { color: colors.textPrimary }, status?.phaseColor && { color: status.phaseColor, fontWeight: '800' }, status?.isPeriod && { color: '#EF4444', fontWeight: '900' }, isSelected && { color: status?.phaseColor || colors.primary, fontWeight: '900' }, isToday && !isSelected && { color: colors.error || '#EF4444', fontWeight: '900' }]}>{day}</Text>
                          {status?.hasWorkout && status?.isCompleted && <Ionicons name="checkmark-circle" size={12} color={colors.success || '#10B981'} style={{ position: 'absolute', top: 2, right: 2 }} />}
                          {status?.isPeriod && <Ionicons name="water" size={10} color="#EF4444" style={{ position: 'absolute', bottom: 2, right: 4 }} />}
                        </>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          <ScrollView style={[styles.footer, isDesktop && styles.rightColumnDesktop]} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {isFemale && phaseInfo && (
              <View style={{ marginBottom: 25 }}>
                <Text style={styles.footerLabel}>BIOLOGÍA Y RENDIMIENTO (DÍA {phaseInfo.day})</Text>
                <View style={[styles.insightCard, { borderColor: phaseInfo.color, backgroundColor: colors.surface }]}>
                  <View style={[styles.insightHeader, { backgroundColor: phaseInfo.color + '15' }]}>
                    <Ionicons name={phaseInfo.icon as any} size={20} color={phaseInfo.color} />
                    <Text style={[styles.insightTitle, { color: phaseInfo.color }]}>{phaseInfo.name}</Text>
                  </View>
                  <View style={styles.insightContent}>
                    <Text style={[styles.insightText, { color: colors.textSecondary }]}><Text style={{fontWeight: '800', color: colors.textPrimary}}>Entrenamiento:</Text> {phaseInfo.training}</Text>
                    <Text style={[styles.insightText, { color: colors.textSecondary }]}><Text style={{fontWeight: '800', color: colors.textPrimary}}>Prevención:</Text> {phaseInfo.risk}</Text>
                    <Text style={[styles.insightText, { color: colors.textSecondary }]}><Text style={{fontWeight: '800', color: colors.textPrimary}}>Nutrición:</Text> {phaseInfo.nutrition}</Text>
                  </View>
                </View>
              </View>
            )}

            <View style={{ marginBottom: 25 }}>
              <Text style={styles.footerLabel}>FASES DE ESTE MES</Text>
              {microciclosDelMes.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20, marginTop: 10 }}>
                  {microciclosDelMes.map((micro, idx) => (
                    <TouchableOpacity key={idx} style={[styles.microCard, { backgroundColor: colors.surface, borderTopColor: micro.color || colors.primary, borderColor: colors.border }]} onPress={() => setViewMicroInfo(micro)}>
                      <Text style={[styles.microMacroName, { color: colors.textSecondary }]} numberOfLines={1}>{micro.macroNombre}</Text>
                      <Text style={[styles.microName, { color: colors.textPrimary }]} numberOfLines={1}>{micro.nombre}</Text>
                      <View style={[styles.microTypeBadge, { backgroundColor: (micro.color || colors.primary) + '15' }]}><Text style={{ color: micro.color || colors.primary, fontSize: 10, fontWeight: '800' }} numberOfLines={1} ellipsizeMode="tail">{micro.tipo}</Text></View>
                      <Text style={[styles.microDates, { color: colors.textSecondary }]}>{micro.fecha_inicio.split('-').slice(1).reverse().join('/')} al {micro.fecha_fin.split('-').slice(1).reverse().join('/')}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', marginTop: 10 }}>No hay fases/microciclos planificados para este mes.</Text>}
            </View>

            <Text style={styles.footerLabel}>DETALLE DEL {selectedDate.split('-').reverse().join('/')}</Text>
            
            {activeDetail.workouts.length > 0 ? (
              activeDetail.workouts.map((wk: any) => {
                  let hasVid = false;
                  if (wk.completed && wk.completion_data) {
                      wk.completion_data.exercise_results?.forEach((ex: any) => { if (ex.recorded_video_url) hasVid = true; });
                      wk.completion_data.hiit_results?.forEach((b: any) => b.hiit_exercises?.forEach((ex: any) => { if (ex.recorded_video_url) hasVid = true; }));
                  }

                  return (
                    <View key={wk.id} style={[styles.workoutCard, { backgroundColor: colors.surface }]}>
                      <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={() => handleWorkoutPress(wk)}>
                        <View style={[styles.workoutIcon, { backgroundColor: wk.completed ? (colors.success || '#10B981') + '15' : colors.primary + '15' }]}><Ionicons name={wk.completed ? "checkmark-done" : "barbell"} size={22} color={wk.completed ? (colors.success || '#10B981') : colors.primary} /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.workoutTitle, { color: colors.textPrimary, textDecorationLine: wk.completed ? 'line-through' : 'none' }]}>{wk.title}</Text>
                          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{wk.completed ? 'Completado' : isTrainer ? 'Sesión asignada' : 'Sesión pendiente'}</Text>
                              {(isTrainer && hasVid) && <Ionicons name="videocam" size={14} color={colors.primary} />}
                          </View>
                          {wk.observations?.includes('[NO COMPLETADA]') && <Text style={{color: colors.error || '#EF4444', fontSize: 10, fontWeight: '800', marginTop: 4}}>SESIÓN SALTADA</Text>}
                        </View>
                      </TouchableOpacity>
                      <View style={styles.workoutActions}>
                        {!isTrainer && !wk.completed && (
                          <TouchableOpacity onPress={() => { setSkipWorkoutId(wk.id); setShowSkipModal(true); }} style={styles.actionIconBtn}>
                            <Ionicons name="close-circle-outline" size={24} color={colors.error || '#EF4444'} />
                          </TouchableOpacity>
                        )}
                        {isTrainer && <><TouchableOpacity onPress={() => handleDeleteWorkout(wk)} style={styles.actionIconBtn}><Ionicons name="trash-outline" size={20} color={colors.error || '#EF4444'} /></TouchableOpacity><TouchableOpacity onPress={() => startCopyWorkout(wk)} style={styles.actionIconBtn}><Ionicons name="copy-outline" size={20} color={colors.primary} /></TouchableOpacity></>}
                        <TouchableOpacity onPress={() => handleWorkoutPress(wk)} style={styles.actionIconBtn}><Ionicons name={isTrainer ? (wk.completed ? "eye" : "pencil") : "chevron-forward"} size={20} color={colors.border} /></TouchableOpacity>
                      </View>
                    </View>
                  );
              })
            ) : <View style={styles.emptyCard}><Ionicons name="calendar-clear-outline" size={32} color={colors.border} /><Text style={{ color: colors.textSecondary, marginTop: 10 }}>Día sin sesiones programadas.</Text></View>}
          </ScrollView>
        </View>
      )}

      {/* --- MODALES COMPARTIDOS --- */}
      <Modal visible={showSkipModal} transparent animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={[styles.modalContentInfo, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary, marginBottom: 10 }]}>Saltar Sesión</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 20, textAlign: 'center' }}>¿Por qué no has podido completar el entrenamiento hoy? El coach lo verá para poder ajustar cargas.</Text>
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, width: '100%', minHeight: 80, textAlignVertical: 'top' }]} placeholder="Ej. Falta de tiempo, enfermedad, lesión..." placeholderTextColor={colors.textSecondary} value={skipReason} onChangeText={setSkipReason} multiline />
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 20 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={() => { setShowSkipModal(false); setSkipReason(''); }}><Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.error || '#EF4444' }]} onPress={handleSkipSubmit}><Text style={{ color: '#FFF', fontWeight: '700' }}>Confirmar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showPicker} transparent animationType="slide"><TouchableOpacity style={styles.modalOverlay} onPress={() => setShowPicker(false)}><View style={[styles.modalContent, { backgroundColor: colors.surface }]}><Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Seleccionar Deportista</Text>{athletes.map(a => (<TouchableOpacity key={a.id} style={[styles.athleteItem, { borderBottomColor: colors.border }]} onPress={() => handleSelectAthlete(a)}><Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16 }}>{a.name}</Text></TouchableOpacity>))}</View></TouchableOpacity></Modal>

      <Modal visible={showCycleSettings} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlayCenter} onPress={() => setShowCycleSettings(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalContentInfo, { backgroundColor: colors.surface, width: '85%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, width: '100%', justifyContent: 'center' }}><View style={[styles.phaseIconBadge, { backgroundColor: '#FEE2E2', marginRight: 10 }]}><Ionicons name="water" size={24} color="#EF4444" /></View><Text style={[styles.modalTitle, { color: colors.textPrimary, marginBottom: 0 }]}>Ajustes del Ciclo</Text></View>
            <Text style={[styles.label, { color: colors.textSecondary, alignSelf: 'flex-start' }]}>Fecha de inicio del último periodo:</Text>
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, marginBottom: 20, width: '100%' }]} placeholder="AAAA-MM-DD" placeholderTextColor={colors.textSecondary} value={lastPeriodDateInput} onChangeText={setLastPeriodDateInput} />
            <Text style={[styles.label, { color: colors.textSecondary, alignSelf: 'flex-start' }]}>Duración habitual del ciclo completo (días):</Text><TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, marginBottom: 20, width: '100%' }]} keyboardType="numeric" value={cycleLengthInput} onChangeText={setCycleLengthInput} />
            <Text style={[styles.label, { color: colors.textSecondary, alignSelf: 'flex-start' }]}>Días habituales de sangrado:</Text><TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, marginBottom: 25, width: '100%' }]} keyboardType="numeric" value={periodLengthInput} onChangeText={setPeriodLengthInput} />
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}><TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={() => setShowCycleSettings(false)}><Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Cancelar</Text></TouchableOpacity><TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={handleSaveCycleSettings} disabled={updating}>{updating ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '700' }}>Guardar</Text>}</TouchableOpacity></View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!viewMicroInfo} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlayCenter} onPress={handleCloseMicroInfo}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalContentInfo, { backgroundColor: colors.surface }]}>
            {viewMicroInfo && (
              <View style={{ alignItems: 'center', width: '100%', flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}><View style={[styles.phaseIconBadge, { backgroundColor: (viewMicroInfo.color || colors.primary) + '15' }]}><Ionicons name="flag" size={24} color={viewMicroInfo.color || colors.primary} /></View><TouchableOpacity onPress={handleCloseMicroInfo}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity></View>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>PERTENECE AL MACROCICLO:</Text><Text style={[styles.infoTitleMacro, { color: colors.textPrimary }]}>{viewMicroInfo.macroNombre}</Text>
                <View style={[styles.divider, { backgroundColor: colors.border }]} /><Text style={[styles.infoLabel, { color: colors.textSecondary }]}>FASE ACTUAL (MICROCICLO):</Text><Text style={[styles.infoTitleMicro, { color: colors.textPrimary }]}>{viewMicroInfo.nombre}</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
                  <View style={[styles.microTypeBadgeBig, { backgroundColor: (viewMicroInfo.color || colors.primary) }]}>
                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '900', letterSpacing: 1 }} numberOfLines={1}>{viewMicroInfo.tipo}</Text>
                  </View>
                  <View style={[styles.datesRow, { marginTop: 0 }]}><Ionicons name="calendar-outline" size={16} color={colors.textSecondary} /><Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginLeft: 6 }}>{viewMicroInfo.fecha_inicio.split('-').reverse().join('/')} - {viewMicroInfo.fecha_fin.split('-').reverse().join('/')}</Text></View></View>
                <View style={{ width: '100%', marginTop: 25, flexShrink: 1 }}><Text style={[styles.infoLabel, { color: colors.textSecondary, marginBottom: 10, textAlign: 'left' }]}>SESIONES PROGRAMADAS ({microWorkouts.length})</Text>
                  <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={true}>
                    {microWorkouts.map(wk => (
                      <View key={wk.id} style={[styles.microWorkoutCard, { borderColor: colors.border }]}><TouchableOpacity style={[styles.microWorkoutHeader, { backgroundColor: colors.surfaceHighlight }]} onPress={() => setExpandedWorkoutId(expandedWorkoutId === wk.id ? null : wk.id)}><Ionicons name="barbell-outline" size={18} color={viewMicroInfo.color || colors.primary} /><View style={{ flex: 1, marginLeft: 10 }}><Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>{wk.title}</Text><Text style={{ color: colors.textSecondary, fontSize: 11 }}>{wk.date.split('-').reverse().join('/')}</Text></View><Ionicons name={expandedWorkoutId === wk.id ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} /></TouchableOpacity>
                        {expandedWorkoutId === wk.id && (<View style={[styles.microWorkoutExercises, { borderTopColor: colors.border }]}>{wk.exercises && wk.exercises.length > 0 ? (wk.exercises.map((ex: any, i: number) => { if (ex.is_hiit_block) { return (<View key={i} style={{ marginBottom: 8 }}><Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 12 }}>⚡ {ex.name}</Text>{ex.hiit_exercises?.map((he: any, j: number) => (<Text key={j} style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 15, marginTop: 2 }}>• {he.name} <Text style={{fontWeight: '600', color: colors.textPrimary}}>({he.duration_reps})</Text></Text>))}</View>); } else { return (<Text key={i} style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>• {ex.name} <Text style={{fontWeight: '600', color: viewMicroInfo.color || colors.primary}}>{ex.sets}x{ex.reps}</Text></Text>); } })) : (<Text style={{ color: colors.textSecondary, fontSize: 12, fontStyle: 'italic' }}>Sin ejercicios registrados.</Text>)}</View>)}
                      </View>
                    ))}
                    {microWorkouts.length === 0 && <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: 15 }}>No hay sesiones asignadas a esta fase todavía.</Text>}
                  </ScrollView>
                </View>
                {isTrainer && <TouchableOpacity style={[styles.editPhaseBtn, { borderColor: viewMicroInfo.color || colors.primary }]} onPress={() => { handleCloseMicroInfo(); router.push(`/periodization?athlete_id=${selectedAthlete.id}&name=${encodeURIComponent(selectedAthlete.name)}`); }}><Ionicons name="pencil" size={18} color={viewMicroInfo.color || colors.primary} /><Text style={{ color: viewMicroInfo.color || colors.primary, fontWeight: '800', fontSize: 13, marginLeft: 8 }}>EDITAR PLANIFICACIÓN</Text></TouchableOpacity>}
              </View>
            )}
          </TouchableOpacity>
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
  viewToggleContainer: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 12, padding: 4 },
  viewToggleBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 6 },
  viewToggleText: { fontSize: 12, fontWeight: '800', color: '#888' },
  mainLayout: { flex: 1, flexDirection: 'column' },
  mainLayoutDesktop: { flexDirection: 'row', paddingHorizontal: 20, gap: 30 },
  leftColumnDesktop: { flex: 1, maxWidth: 380, minWidth: 300 },
  rightColumnDesktop: { flex: 1 },
  monthSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginVertical: 15 },
  monthLabel: { fontSize: 18, fontWeight: '900', textTransform: 'capitalize' },
  calendarGrid: { paddingHorizontal: 15 },
  weekDays: { flexDirection: 'row', marginBottom: 10 },
  weekDayText: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  dayText: { fontSize: 15, fontWeight: '600' },
  
  // Estilos de Vista Semanal
  weekDayColumn: { borderRightWidth: 1, borderRightColor: 'rgba(0,0,0,0.05)' },
  weekDayHeader: { paddingVertical: 20, alignItems: 'center', marginBottom: 10 },
  weeklyWorkoutCard: { borderWidth: 1, borderRadius: 16, marginBottom: 15, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity: 0.1, shadowRadius: 4 },
  weeklyWorkoutHeader: { flexDirection: 'row', padding: 12, alignItems: 'center' },
  emptyDayWeekly: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, opacity: 0.3 },
  
  footer: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
  footerLabel: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 15, letterSpacing: 1, textTransform: 'uppercase' },
  workoutCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 18, marginBottom: 12 },
  workoutIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  workoutTitle: { fontSize: 16, fontWeight: '800' },
  workoutActions: { flexDirection: 'row', gap: 5 },
  actionIconBtn: { padding: 8 },
  emptyCard: { alignItems: 'center', paddingVertical: 30 },
  copyBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 20, justifyContent: 'center' },
  copyBannerText: { color: '#FFF', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  
  // Estilos de Modales y Ciclo
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
  microTypeBadgeBig: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, maxWidth: '100%' },
  datesRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.03)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  microWorkoutCard: { borderWidth: 1, borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  microWorkoutHeader: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  microWorkoutExercises: { padding: 14, borderTopWidth: 1 },
  editPhaseBtn: { flexDirection: 'row', width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginTop: 20 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  label: { fontSize: 11, fontWeight: '800', marginBottom: 6, letterSpacing: 0.5 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  insightCard: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  insightHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  insightTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  insightContent: { padding: 15, gap: 8 },
  insightText: { fontSize: 13, lineHeight: 18 },
  microCard: { padding: 14, borderRadius: 16, borderTopWidth: 4, borderWidth: 1, width: 160, marginRight: 12 },
  microMacroName: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  microName: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
  microTypeBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 8, maxWidth: '100%' },
  microDates: { fontSize: 11, fontWeight: '600' }
});
