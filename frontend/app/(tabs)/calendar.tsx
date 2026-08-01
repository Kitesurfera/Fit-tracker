import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, Modal, Alert, Platform, useWindowDimensions, TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
import GeminiChatModal from '../../src/components/GeminiChatModal';
import { useTrainer } from '../../src/context/TrainerContext';

const DAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const SPORT_ICON_MAP: Record<string, {icon: any, lib: string}> = {
  'kite': { icon: 'kitesurfing', lib: 'MaterialCommunityIcons' },
  'football': { icon: 'football', lib: 'Ionicons' },
  'volleyball': { icon: 'volleyball', lib: 'MaterialCommunityIcons' },
  'tennis': { icon: 'tennisball', lib: 'Ionicons' },
  'gym': { icon: 'barbell', lib: 'Ionicons' },
  'surf': { icon: 'surfing', lib: 'MaterialCommunityIcons' },
  'bike': { icon: 'bicycle', lib: 'Ionicons' },
};

const getSportConfig = (sportName?: string) => {
  const key = sportName || 'kite';
  return SPORT_ICON_MAP[key] || SPORT_ICON_MAP['kite'];
};

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
  
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState(localTodayStr);

  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const d = new Date(now);
    const day = d.getDay() || 7; 
    d.setDate(d.getDate() - day + 1);
    return d;
  });
  
  // --- ESTADOS DE DATOS ---
  const [athletes, setAthletes] = useState<any[]>([]);
  const { selectedAthlete, setSelectedAthlete } = useTrainer();
  const [macros, setMacros] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [wellnessHistory, setWellnessHistory] = useState<any[]>([]); 
  
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  const [isChatVisible, setChatVisible] = useState(false);
  const [showSportModal, setShowSportModal] = useState(false);
  const [sportSessions, setSportSessions] = useState<string[]>([]);
  const [sportModalTab, setSportModalTab] = useState<'single' | 'range'>('single');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  const isTrainer = user?.role === 'trainer';
  const isFemale = ['female', 'mujer', 'femenino'].includes(selectedAthlete?.gender?.toLowerCase() || '');
  const isExtraSportEnabled = selectedAthlete?.has_extra_sport === true || selectedAthlete?.has_extra_sport === 1 || selectedAthlete?.has_extra_sport === 'true';

  const sportConfig = getSportConfig(selectedAthlete?.sport_icon);

  const refreshAthleteData = async (athlete: any) => {
    if (!athlete || !athlete.id) return;
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
    } catch (e: any) { 
      console.log("Error recargando datos del atleta:", e); 
    } finally { 
      setUpdating(false); 
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const loadFreshData = async () => {
        if (authLoading) return;
        if (!user) {
          if (isActive) {
            setLoading(false);
            setLoadError("No hay sesión de usuario activa.");
          }
          return;
        }
        
        try {
          setLoadError(null);
          let currentAthlete = selectedAthlete;

          if (isTrainer) {
            const data = await api.getAthletes().catch(() => []);
            const freshAthletes = Array.isArray(data) ? data : [];
            if (isActive) setAthletes(freshAthletes);
            
            if (!currentAthlete && freshAthletes.length > 0) {
              currentAthlete = freshAthletes[0];
            } else if (currentAthlete) {
              const updated = freshAthletes.find((a: any) => a.id === currentAthlete.id);
              if (updated) currentAthlete = updated;
            }
            if (isActive) setSelectedAthlete(currentAthlete);
          } else {
            let freshUser = user;
            if ((api as any).getMe) {
              try {
                const res = await (api as any).getMe();
                if (res && res.user) {
                  freshUser = res.user;
                  if (updateUser) updateUser(res.user);
                }
              } catch (e) {
                console.log("No se pudo refrescar profile:", e);
              }
            }
            currentAthlete = freshUser;
            if (isActive) setSelectedAthlete(currentAthlete);
          }

          if (currentAthlete && isActive) {
             await refreshAthleteData(currentAthlete);
          } else if (isActive) {
            setLoading(false);
          }
        } catch (e: any) { 
          console.log("Error crítico inicializando calendario:", e);
          if (isActive) {
            setLoadError(e?.message || "Error al cargar la planificación.");
            setLoading(false);
          }
        }
      };

      loadFreshData();

      return () => {
        isActive = false;
      };
    }, [authLoading, user?.id, isTrainer])
  );

  useEffect(() => {
    if (selectedAthlete?.technical_sessions) {
      setSportSessions(selectedAthlete.technical_sessions);
    } else {
      setSportSessions([]);
    }
  }, [selectedAthlete]);

  const handleSelectAthlete = (athlete: any) => {
    if (!athlete) return;
    setSelectedAthlete(athlete);
    setShowPicker(false);
    setLoading(true);
    refreshAthleteData(athlete);
  };

  const handleSaveTechnicalSession = async (dates: string[]) => {
    setUpdating(true);
    try {
      if (isTrainer && api.updateAthlete) {
        await api.updateAthlete(selectedAthlete.id, { technical_sessions: dates });
      } else if (api.updateProfile) {
        await api.updateProfile({ technical_sessions: dates });
        if (updateUser) updateUser({ technical_sessions: dates });
      }
      setSportSessions(dates);
      setSelectedAthlete((prev: any) => ({ ...prev, technical_sessions: dates }));
      setShowSportModal(false);
    } catch (e) {
      if (Platform.OS === 'web') window.alert("No se pudo guardar el registro técnico.");
      else Alert.alert("Error", "No se pudo guardar el registro técnico.");
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveDateRange = () => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(rangeStart) || !dateRegex.test(rangeEnd)) {
      if (Platform.OS === 'web') window.alert("Usa el formato AAAA-MM-DD");
      else Alert.alert("Error", "Usa el formato AAAA-MM-DD");
      return;
    }
    if (rangeStart > rangeEnd) {
      if (Platform.OS === 'web') window.alert("La fecha de inicio debe ser anterior a la de fin");
      else Alert.alert("Error", "La fecha de inicio debe ser anterior a la de fin");
      return;
    }

    const start = new Date(rangeStart);
    const end = new Date(rangeEnd);
    const newDates = new Set(sportSessions);

    let curr = new Date(start);
    while (curr <= end) {
      const localStr = getLocalDateStr(curr);
      if (localStr) newDates.add(localStr);
      curr.setDate(curr.getDate() + 1);
    }

    handleSaveTechnicalSession(Array.from(newDates));
  };

  const startCopyWorkout = (workout: any) => {
    setWorkoutToCopy(workout);
    if (Platform.OS !== 'web') Alert.alert("Modo Duplicar", "Toca cualquier día del calendario para pegar este entrenamiento.");
  };

  const pasteWorkout = async (targetDate: string) => {
    if (!workoutToCopy) return;
    setUpdating(true);
    try {
      let matchedMicroId = null;
      if (macros && Array.isArray(macros)) {
        for (const macro of macros) {
          const micros = macro.microciclos || macro.microcycles || [];
          for (const m of micros) {
            const start = extractDateString(m.fecha_inicio || m.start_date);
            const end = extractDateString(m.fecha_fin || m.end_date);
            if (start && end && targetDate >= start && targetDate <= end) {
              matchedMicroId = m.id || m._id;
              break;
            }
          }
          if (matchedMicroId) break;
        }
      }

      const newWorkout = { 
        ...workoutToCopy, 
        date: targetDate, 
        completed: false, 
        completion_data: null, 
        athlete_id: selectedAthlete.id,
        microciclo_id: matchedMicroId,
        microcycle_id: matchedMicroId
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
          const wellnessData = { 
            athlete_id: selectedAthlete.id, 
            date: lastPeriodDateInput, 
            cycle_phase: 'menstruacion', 
            sleep_quality: 3, 
            stress: 3, 
            soreness: 3, 
            fatigue: 3,
            notes: "Ajuste manual de ciclo"
          };
          try {
             if (api.postWellness) await api.postWellness(wellnessData);
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

  const handleSaveWorkoutFromAI = async (workoutData: any, targetDate: string) => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(targetDate)) {
      if (Platform.OS === 'web') window.alert("⚠️ Formato incorrecto. Usa AAAA-MM-DD");
      else Alert.alert("Error", "El formato de fecha debe ser AAAA-MM-DD (Ej: 2026-04-15)");
      return;
    }

    setUpdating(true);
    try {
      let matchedMicroId = null;
      if (macros && Array.isArray(macros)) {
        for (const macro of macros) {
          const micros = macro.microciclos || macro.microcycles || [];
          for (const m of micros) {
            const start = extractDateString(m.fecha_inicio || m.start_date);
            const end = extractDateString(m.fecha_fin || m.end_date);
            if (start && end && targetDate >= start && targetDate <= end) {
              matchedMicroId = m.id || m._id;
              break;
            }
          }
          if (matchedMicroId) break;
        }
      }

      const payload = {
        title: workoutData.title || "Entrenamiento de IA",
        date: targetDate,
        athlete_id: selectedAthlete.id,
        exercises: workoutData.exercises || [],
        notes: workoutData.notes || "",
        completed: false,
        is_ai: true,
        microciclo_id: matchedMicroId 
      };

      await api.createWorkout(payload);
      
      setChatVisible(false);
      refreshAthleteData(selectedAthlete);
      
      if (Platform.OS === 'web') {
        window.alert("¡Entrenamiento guardado y asignado correctamente!");
      } else {
        Alert.alert("¡Hecho!", "Entrenamiento agendado en el calendario.");
      }

    } catch (error) {
      console.error("Error al guardar desde IA:", error);
      if (Platform.OS === 'web') window.alert("Ocurrió un error al guardar la sesión.");
      else Alert.alert("Error", "No se pudo guardar la sesión.");
      setUpdating(false);
    }
  };

  const microWorkouts = useMemo(() => {
    if (!viewMicroInfo) return [];
    return workouts.filter(w => String(w.microciclo_id || w.microcycle_id) === String(viewMicroInfo.id || viewMicroInfo._id)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [workouts, viewMicroInfo]);

  if (authLoading || loading) {
    return (
      <View style={{flex:1, justifyContent:'center', alignItems:'center', backgroundColor: colors.background, padding: 20}}>
        <ActivityIndicator size="large" color={colors.primary}/>
        <Text style={{color: colors.textSecondary, marginTop: 15, fontWeight: '600'}}>Cargando planificación...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={{flex:1, justifyContent:'center', alignItems:'center', backgroundColor: colors.background, padding: 24}}>
        <Ionicons name="alert-circle-outline" size={56} color={colors.error || '#EF4444'} />
        <Text style={{color: colors.textPrimary, fontSize: 18, fontWeight: '900', marginTop: 15, textAlign: 'center'}}>No se pudo cargar el calendario</Text>
        <Text style={{color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 24}}>{loadError}</Text>
        <TouchableOpacity 
          style={{backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12}}
          onPress={() => {
            setLoading(true);
            setLoadError(null);
            if (selectedAthlete) refreshAthleteData(selectedAthlete);
            else setLoading(false);
          }}
        >
          <Text style={{color: '#FFF', fontWeight: '800'}}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* --- CABECERA PRINCIPAL --- */}
      <View style={styles.topHeader}>
        <View style={{flex:1, marginRight: 8}}>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{isTrainer ? 'AGENDA DEPORTISTA' : 'MI PLANIFICACIÓN'}</Text>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{selectedAthlete?.name || 'Calendario'}</Text>
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

        <View style={styles.headerActionsRight}>
          {isFemale && (
            <TouchableOpacity onPress={openCycleSettings} style={[styles.iconBtn, { backgroundColor: '#EF444415' }]}>
               <Ionicons name="water" size={20} color="#EF4444" />
            </TouchableOpacity>
          )}

          {workoutToCopy && <TouchableOpacity onPress={() => setWorkoutToCopy(null)} style={[styles.iconBtn, { backgroundColor: (colors.error || '#EF4444') + '20' }]}><Ionicons name="close" size={20} color={colors.error || '#EF4444'} /></TouchableOpacity>}
          
          {isExtraSportEnabled && (
            <TouchableOpacity onPress={() => {
                setSportModalTab('single');
                setRangeStart(selectedDate);
                setRangeEnd(selectedDate);
                setShowSportModal(true);
            }} style={[styles.iconBtn, { backgroundColor: colors.primary + '15' }]}>
               {sportConfig.lib === 'Ionicons' ? (
                   <Ionicons name={sportConfig.icon as any} size={20} color={colors.primary} />
               ) : (
                   <MaterialCommunityIcons name={sportConfig.icon as any} size={20} color={colors.primary} />
               )}
            </TouchableOpacity>
          )}
          
          {isTrainer && <TouchableOpacity onPress={() => setShowPicker(true)} style={[styles.iconBtn, { backgroundColor: colors.primary + '15' }]}><Ionicons name="people" size={20} color={colors.primary} /></TouchableOpacity>}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: isDesktop ? 40 : 16, paddingBottom: 100, flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 40 : 16 }} showsVerticalScrollIndicator={false}>
        
        {/* === COLUMNA IZQUIERDA (Calendario / Vista Semana) === 
            Fix: En móvil aplicamos width 100% (eliminando flex: 1) para evitar superposición
        */}
        <View style={isDesktop ? { flex: 1.5 } : { width: '100%' }}>
          
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {updating && <View style={[styles.absoluteLoading, {backgroundColor: 'rgba(255,255,255,0.7)'}]}><ActivityIndicator size="small" color={colors.primary} /></View>}
            
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={() => viewMode === 'month' ? changeMonth(-1) : changeWeek(-1)} style={styles.arrowBtn}><Ionicons name="chevron-back" size={24} color={colors.textPrimary} /></TouchableOpacity>
              <View>
                 <Text style={[styles.monthYearText, { color: colors.textPrimary }]}>
                   {viewMode === 'month' ? `${MONTHS[currentMonth]} ${currentYear}` : `Semana del ${currentWeekStart.getDate()} ${MONTHS[currentWeekStart.getMonth()].substring(0,3)}`}
                 </Text>
              </View>
              <TouchableOpacity onPress={() => viewMode === 'month' ? changeMonth(1) : changeWeek(1)} style={styles.arrowBtn}><Ionicons name="chevron-forward" size={24} color={colors.textPrimary} /></TouchableOpacity>
            </View>

            {viewMode === 'month' ? (
              <>
                <View style={styles.daysHeader}>
                  {DAYS.map(day => <Text key={day} style={[styles.dayHeaderText, { color: colors.textSecondary }]}>{day}</Text>)}
                </View>
                <View style={styles.daysGrid}>
                  {daysInMonth.map((day, idx) => {
                    if (!day) return <View key={`empty-${idx}`} style={styles.dayCell} />;
                    
                    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isSelected = selectedDate === dateStr;
                    const isToday = localTodayStr === dateStr;
                    const status = getDayStatus(day);
                    const isTechnical = sportSessions.includes(dateStr);
                    const isCopyTarget = !!workoutToCopy;

                    return (
                      <TouchableOpacity 
                        key={idx} 
                        onPress={() => handleDatePress(dateStr)} 
                        style={[
                          styles.dayCell, 
                          // Resalte de Microciclo (fondo de toda la celda)
                          status?.phaseColor && { backgroundColor: status.phaseColor + '20' },
                          // Borde de selección
                          isSelected && !isCopyTarget && { borderWidth: 1.5, borderColor: colors.primary },
                          isCopyTarget && { backgroundColor: colors.success + '20', borderWidth: 1.5, borderColor: colors.success }
                        ]}
                      >
                        {/* Círculo de número (resalta si hay entrenamiento) */}
                        <View style={[
                           styles.dateNumberContainer,
                           status?.hasWorkout && { backgroundColor: status.isCompleted ? colors.success : colors.primary, borderRadius: 14 }
                        ]}>
                           <Text style={[
                              styles.dayText, 
                              { color: status?.hasWorkout ? '#FFF' : colors.textPrimary }, 
                              isToday && !status?.hasWorkout && { color: colors.primary, fontWeight: '900' },
                              status?.hasWorkout && { fontWeight: '800' }
                           ]}>
                             {day}
                           </Text>
                        </View>

                        {/* Fila de Iconos: Deporte técnico y Gota menstrual */}
                        {(status?.isPeriod || isTechnical) && (
                          <View style={styles.cellIconsRow}>
                             {status?.isPeriod && <Ionicons name="water" size={12} color="#EF4444" />}
                             {isTechnical && (
                                sportConfig.lib === 'Ionicons' ? (
                                    <Ionicons name={sportConfig.icon as any} size={12} color={colors.primary} />
                                ) : (
                                    <MaterialCommunityIcons name={sportConfig.icon as any} size={12} color={colors.primary} />
                                )
                             )}
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : (
              /* --- NUEVA VISTA DE SEMANA DETALLADA HORIZONTAL --- */
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 5, paddingHorizontal: 2 }}>
                {currentWeekDays.map((d, idx) => {
                  const dateStr = getLocalDateStr(d);
                  const isSelected = selectedDate === dateStr;
                  const isToday = localTodayStr === dateStr;
                  const status = monthStatusMap[dateStr] || {};
                  const dayWorkouts = workouts?.filter(w => extractDateString(w.date) === dateStr) || [];
                  const isTechnical = sportSessions.includes(dateStr);

                  return (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => handleDatePress(dateStr)}
                      style={[
                        styles.weekDayCard,
                        { width: isDesktop ? 320 : width * 0.75 },
                        // Resalte de microciclo en el fondo y selección en borde
                        { backgroundColor: status.phaseColor ? status.phaseColor + '15' : colors.surfaceHighlight },
                        { borderColor: isSelected ? colors.primary : (status.phaseColor ? status.phaseColor + '40' : colors.border) }
                      ]}
                    >
                      <View style={styles.weekDayHeaderRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={[styles.weekDayNumBadge, isToday && { backgroundColor: colors.primary }]}>
                            <Text style={[styles.weekDayNumText, isToday && { color: '#FFF' }]}>{d.getDate()}</Text>
                          </View>
                          <Text style={[styles.weekDayNameText, { color: colors.textPrimary }, isToday && { color: colors.primary }]}>
                            {DAYS[idx]} ({d.getDate()}/{d.getMonth() + 1})
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {isTechnical && (
                            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.primary + '15' }}>
                              {sportConfig.lib === 'Ionicons' ? <Ionicons name={sportConfig.icon as any} size={12} color={colors.primary} /> : <MaterialCommunityIcons name={sportConfig.icon as any} size={12} color={colors.primary} />}
                            </View>
                          )}
                          {status.isPeriod && (
                            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: '#EF444415' }}>
                              <Ionicons name="water" size={12} color="#EF4444" />
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Resumen de entrenamientos en la semana */}
                      <View style={{ marginTop: 8, gap: 8 }}>
                        {dayWorkouts.length > 0 ? (
                          dayWorkouts.map((wk: any, wIdx: number) => (
                            <View key={wIdx} style={[styles.weekWorkoutSnippet, { backgroundColor: colors.surface, borderColor: wk.completed ? colors.success + '40' : colors.border }]}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                <Text style={[styles.weekWorkoutTitle, { color: colors.textPrimary }]} numberOfLines={1}>{wk.title}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Ionicons name={wk.completed ? "checkmark-circle" : "time-outline"} size={12} color={wk.completed ? colors.success : colors.warning} />
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: wk.completed ? colors.success : colors.warning }}>{wk.completed ? 'Hecho' : 'Pendiente'}</Text>
                                </View>
                              </View>

                              {/* Lista Detallada de Ejercicios */}
                              {wk.exercises && wk.exercises.length > 0 ? (
                                <View style={{ marginTop: 6, gap: 4 }}>
                                  {wk.exercises.map((ex: any, eIdx: number) => (
                                    <View key={eIdx} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.textSecondary, marginRight: 6 }} />
                                      <Text style={{ fontSize: 11, color: colors.textSecondary, flex: 1 }} numberOfLines={1}>{ex.name}</Text>
                                      {(ex.sets && (ex.reps || ex.time)) && (
                                         <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>
                                           {ex.reps || ex.time} x {ex.sets}
                                         </Text>
                                      )}
                                    </View>
                                  ))}
                                </View>
                              ) : (
                                <Text style={{ fontSize: 11, color: colors.textSecondary, fontStyle: 'italic', marginTop: 4 }}>Sin ejercicios especificados</Text>
                              )}

                              {/* Botones de acción (Entrenador) */}
                              {isTrainer && (
                                <View style={[styles.trainerActionsRow, { marginTop: 10, paddingTop: 10, gap: 6 }]}>
                                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); startCopyWorkout(wk); }} style={[styles.actionBtnTrainer, { backgroundColor: colors.surfaceHighlight, paddingVertical: 6 }]}>
                                    <Ionicons name="copy" size={12} color={colors.primary} />
                                    <Text style={[styles.actionBtnTrainerText, { color: colors.primary, fontSize: 11 }]}>Duplicar</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); router.push({ pathname: '/edit-workout', params: { workoutId: wk.id } }); }} style={[styles.actionBtnTrainer, { backgroundColor: colors.surfaceHighlight, paddingVertical: 6 }]}>
                                    <Ionicons name="pencil" size={12} color={colors.textSecondary} />
                                    <Text style={[styles.actionBtnTrainerText, { color: colors.textSecondary, fontSize: 11 }]}>Editar</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleDeleteWorkout(wk); }} style={[styles.actionBtnTrainer, { backgroundColor: colors.error + '15', paddingVertical: 6 }]}>
                                    <Ionicons name="trash" size={12} color={colors.error || '#EF4444'} />
                                    <Text style={[styles.actionBtnTrainerText, { color: colors.error || '#EF4444', fontSize: 11 }]}>Borrar</Text>
                                  </TouchableOpacity>
                                </View>
                              )}
                            </View>
                          ))
                        ) : (
                          <Text style={{ fontSize: 11, color: colors.textSecondary, fontStyle: 'italic', paddingVertical: 4 }}>Libre de entrenamientos</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            
            {workoutToCopy && (
              <View style={{ marginTop: 15, padding: 15, backgroundColor: colors.success + '15', borderRadius: 12, borderWidth: 1, borderColor: colors.success, alignItems: 'center' }}>
                <Ionicons name="copy" size={24} color={colors.success} style={{ marginBottom: 5 }} />
                <Text style={{ color: colors.success, fontWeight: '800', textAlign: 'center' }}>Modo Duplicar Activo</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 4 }}>Toca cualquier día del calendario para pegar: <Text style={{fontWeight: '700'}}>{workoutToCopy.title}</Text></Text>
                <TouchableOpacity onPress={() => setWorkoutToCopy(null)} style={{ marginTop: 10, paddingVertical: 6, paddingHorizontal: 16, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '700' }}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* INDICADORES DEL MES / MICROCICLOS (Solo Vista Mensual) */}
          {viewMode === 'month' && microciclosDelMes.length > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textSecondary, marginBottom: 10, letterSpacing: 1 }}>FASES ESTE MES</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {microciclosDelMes.map((m: any, i: number) => {
                  const isActive = selectedDate >= m.fecha_inicio && selectedDate <= m.fecha_fin;
                  return (
                    <TouchableOpacity key={i} onPress={() => setViewMicroInfo(m)} style={[styles.microPhaseCard, { borderColor: m.color, backgroundColor: isActive ? m.color + '20' : colors.surface }]}>
                      <View style={[styles.microPhaseDot, { backgroundColor: m.color }]} />
                      <View>
                        <Text style={[styles.microPhaseName, { color: colors.textPrimary }]}>{m.nombre}</Text>
                        <Text style={[styles.microPhaseDates, { color: colors.textSecondary }]}>{(m.fecha_inicio || '').split('-').slice(1).reverse().join('/')} - {(m.fecha_fin || '').split('-').slice(1).reverse().join('/')}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>

        {/* === COLUMNA DERECHA (Detalles del día seleccionado) === 
            Fix: En móvil aplicamos width 100% para evitar superposición
        */}
        <View style={isDesktop ? { flex: 1 } : { width: '100%' }}>
          <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary, marginBottom: 15 }}>
            {selectedDate === localTodayStr ? 'Hoy, ' : ''}
            {selectedDate.split('-').reverse().join('/')}
          </Text>

          {/* FASE DEL CICLO MENSTRUAL */}
          {isFemale && phaseInfo && (
            <View style={[styles.phaseCard, { borderColor: phaseInfo.color, backgroundColor: phaseInfo.color + '10' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Ionicons name={phaseInfo.icon as any} size={22} color={phaseInfo.color} />
                <Text style={{ fontWeight: '900', fontSize: 15, color: phaseInfo.color, marginLeft: 8 }}>{phaseInfo.name} (Día {phaseInfo.day})</Text>
              </View>
              <Text style={{ fontSize: 13, color: colors.textPrimary, marginBottom: 6 }}><Text style={{fontWeight:'800'}}>🏋️ Entreno:</Text> {phaseInfo.training}</Text>
              <Text style={{ fontSize: 13, color: colors.textPrimary, marginBottom: 6 }}><Text style={{fontWeight:'800'}}>⚠️ Riesgo:</Text> {phaseInfo.risk}</Text>
              <Text style={{ fontSize: 13, color: colors.textPrimary }}><Text style={{fontWeight:'800'}}>🥑 Nutrición:</Text> {phaseInfo.nutrition}</Text>
            </View>
          )}
          
          {/* REGISTRO TÉCNICO (DEPORTE EXTRA) */}
          {isExtraSportEnabled && sportSessions.includes(selectedDate) && (
            <View style={[styles.phaseCard, { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                   {sportConfig.lib === 'Ionicons' ? (
                       <Ionicons name={sportConfig.icon as any} size={22} color={colors.primary} />
                   ) : (
                       <MaterialCommunityIcons name={sportConfig.icon as any} size={22} color={colors.primary} />
                   )}
                   <Text style={{ fontWeight: '900', fontSize: 15, color: colors.primary, marginLeft: 8 }}>Sesión Técnica Registrada</Text>
                </View>
                <TouchableOpacity onPress={() => handleSaveTechnicalSession(sportSessions.filter(d => d !== selectedDate))}>
                  <Ionicons name="trash" size={18} color={colors.error || '#EF4444'} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* SESIONES DEL DÍA */}
          {activeDetail.workouts.length > 0 ? (
            activeDetail.workouts.map((w: any) => (
              <TouchableOpacity key={w.id || w._id} style={[styles.workoutCard, { backgroundColor: colors.surface, borderColor: w.completed ? colors.success : colors.border }]} onPress={() => handleWorkoutPress(w)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[styles.workoutTitle, { color: colors.textPrimary }]}>{w.title}</Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>{w.exercises?.length || 0} ejercicios programados</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    {w.is_ai && <View style={[styles.tag, { backgroundColor: '#8B5CF6' + '20' }]}><Ionicons name="sparkles" size={10} color="#8B5CF6" /><Text style={{ color: '#8B5CF6', fontSize: 10, fontWeight: '800', marginLeft: 4 }}>IA</Text></View>}
                    <View style={[styles.statusBadge, { backgroundColor: w.completed ? colors.success + '20' : colors.warning + '20' }]}>
                      <Ionicons name={w.completed ? "checkmark-circle" : "time"} size={14} color={w.completed ? colors.success : colors.warning} />
                      <Text style={[styles.statusText, { color: w.completed ? colors.success : colors.warning }]}>{w.completed ? 'Completado' : 'Pendiente'}</Text>
                    </View>
                  </View>
                </View>

                {isTrainer && (
                  <View style={styles.trainerActionsRow}>
                    <TouchableOpacity onPress={(e) => { e.stopPropagation(); startCopyWorkout(w); }} style={[styles.actionBtnTrainer, { backgroundColor: colors.surfaceHighlight }]}><Ionicons name="copy" size={16} color={colors.primary} /><Text style={[styles.actionBtnTrainerText, { color: colors.primary }]}>Duplicar</Text></TouchableOpacity>
                    <TouchableOpacity onPress={(e) => { e.stopPropagation(); router.push({ pathname: '/edit-workout', params: { workoutId: w.id } }); }} style={[styles.actionBtnTrainer, { backgroundColor: colors.surfaceHighlight }]}><Ionicons name="pencil" size={16} color={colors.textSecondary} /><Text style={[styles.actionBtnTrainerText, { color: colors.textSecondary }]}>Editar</Text></TouchableOpacity>
                    <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleDeleteWorkout(w); }} style={[styles.actionBtnTrainer, { backgroundColor: colors.error + '15' }]}><Ionicons name="trash" size={16} color={colors.error || '#EF4444'} /><Text style={[styles.actionBtnTrainerText, { color: colors.error || '#EF4444' }]}>Borrar</Text></TouchableOpacity>
                  </View>
                )}

                {!isTrainer && !w.completed && (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                     <TouchableOpacity style={[styles.startWorkoutBtn, { flex: 1, backgroundColor: colors.primary }]} onPress={() => handleWorkoutPress(w)}>
                       <Ionicons name="play" size={18} color="#FFF" />
                       <Text style={{ color: '#FFF', fontWeight: '800', marginLeft: 6 }}>COMENZAR</Text>
                     </TouchableOpacity>
                     <TouchableOpacity style={[styles.startWorkoutBtn, { flex: 0.4, backgroundColor: colors.surfaceHighlight, borderWidth: 1, borderColor: colors.border }]} onPress={(e) => { e.stopPropagation(); setSkipWorkoutId(w.id); setShowSkipModal(true); }}>
                       <Ionicons name="play-skip-forward" size={18} color={colors.textSecondary} />
                     </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-clear-outline" size={48} color={colors.border} />
              <Text style={{ color: colors.textSecondary, marginTop: 10, textAlign: 'center' }}>No hay entrenamiento asignado para este día.</Text>
            </View>
          )}

          {isTrainer && (
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => router.push({ pathname: '/add-workout', params: { athlete_id: selectedAthlete.id, date: selectedDate } })}>
              <Ionicons name="add" size={24} color="#FFF" />
              <Text style={styles.addBtnText}>AÑADIR SESIÓN AL DÍA</Text>
            </TouchableOpacity>
          )}
        </View>

      </ScrollView>

      {/* --- MODAL DETALLE DE MICROCICLO --- */}
      <Modal visible={!!viewMicroInfo} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentLarge, { backgroundColor: colors.surface }]}>
            {viewMicroInfo && (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <View style={{ flex: 1 }}>
                     <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 4 }}>{viewMicroInfo.macroNombre}</Text>
                     <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: '900' }}>{viewMicroInfo.nombre}</Text>
                     <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 10 }}>
                        <View style={{ backgroundColor: viewMicroInfo.color + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: viewMicroInfo.color }}>
                          <Text style={{ color: viewMicroInfo.color, fontSize: 10, fontWeight: '900' }}>{viewMicroInfo.tipo}</Text>
                        </View>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                           {(viewMicroInfo.fecha_inicio || '').split('-').reverse().join('/')} - {(viewMicroInfo.fecha_fin || '').split('-').reverse().join('/')}
                        </Text>
                     </View>
                  </View>
                  <TouchableOpacity onPress={handleCloseMicroInfo} style={{ padding: 4 }}><Ionicons name="close" size={28} color={colors.textSecondary} /></TouchableOpacity>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '800', marginBottom: 15, letterSpacing: 0.5 }}>SESIONES DE LA SEMANA ({microWorkouts.length})</Text>
                  
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {microWorkouts.length > 0 ? microWorkouts.map((wk: any) => {
                      const wkId = wk.id || wk._id;
                      const isExpanded = expandedWorkoutId === wkId;
                      return (
                        <View key={wkId} style={{ marginBottom: 15, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                           <TouchableOpacity 
                             style={{ padding: 16, backgroundColor: colors.surfaceHighlight, flexDirection: 'row', alignItems: 'center' }}
                             onPress={() => setExpandedWorkoutId(isExpanded ? null : wkId)}
                           >
                             <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: wk.completed ? colors.success + '20' : colors.primary + '20', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                               <Ionicons name={wk.completed ? "checkmark" : "barbell"} size={20} color={wk.completed ? colors.success : colors.primary} />
                             </View>
                             <View style={{ flex: 1 }}>
                               <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '800' }}>{wk.title}</Text>
                               <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{(wk.date || '').split('-').reverse().join('/')}</Text>
                             </View>
                             <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
                           </TouchableOpacity>

                           {isExpanded && (
                             <View style={{ padding: 16, backgroundColor: colors.surface }}>
                                {wk.notes ? <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', marginBottom: 15 }}>"{wk.notes}"</Text> : null}
                                
                                <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '800', marginBottom: 10 }}>EJERCICIOS ({wk.exercises?.length || 0}):</Text>
                                {wk.exercises?.map((ex: any, idx: number) => (
                                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginRight: 8 }} />
                                    <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1 }}>{ex.name}</Text>
                                    {(ex.sets && ex.reps) ? <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{ex.sets}x{ex.reps}</Text> : null}
                                  </View>
                                ))}

                                <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                                  <TouchableOpacity style={{ flex: 1, backgroundColor: colors.surfaceHighlight, padding: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border }} onPress={() => { handleCloseMicroInfo(); handleWorkoutPress(wk); }}>
                                     <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 13 }}>Ver Detalle</Text>
                                  </TouchableOpacity>
                                  {isTrainer && (
                                    <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, padding: 12, borderRadius: 10, alignItems: 'center' }} onPress={() => { handleCloseMicroInfo(); router.push({ pathname: '/edit-workout', params: { workoutId: wkId } }); }}>
                                       <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 13 }}>Editar</Text>
                                    </TouchableOpacity>
                                  )}
                                </View>
                             </View>
                           )}
                        </View>
                      );
                    }) : (
                      <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center' }}>
                         <Ionicons name="leaf-outline" size={48} color={colors.border} />
                         <Text style={{ color: colors.textSecondary, marginTop: 10, fontWeight: '600' }}>Microciclo vacío.</Text>
                      </View>
                    )}
                  </ScrollView>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* --- MODAL AJUSTES DE CICLO MENSTRUAL --- */}
      <Modal visible={showCycleSettings} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>Ajustes del Ciclo</Text>
              <TouchableOpacity onPress={() => setShowCycleSettings(false)}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
            </View>

            <View style={{ marginBottom: 15 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>DURACIÓN DEL CICLO (DÍAS)</Text>
              <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]} keyboardType="numeric" value={cycleLengthInput} onChangeText={setCycleLengthInput} />
            </View>

            <View style={{ marginBottom: 15 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>DURACIÓN DEL PERIODO (DÍAS)</Text>
              <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]} keyboardType="numeric" value={periodLengthInput} onChangeText={setPeriodLengthInput} />
            </View>

            <View style={{ marginBottom: 25 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>FECHA DEL ÚLTIMO PERIODO (AAAA-MM-DD)</Text>
              <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]} value={lastPeriodDateInput} onChangeText={setLastPeriodDateInput} placeholder="Ej: 2026-03-21" placeholderTextColor={colors.textSecondary} />
              
              {/* Botones de acción rápida para facilitar la vida */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                 <TouchableOpacity style={{ flex: 1, padding: 10, backgroundColor: colors.surfaceHighlight, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border }} onPress={() => setLastPeriodDateInput(localTodayStr)}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>Empezó hoy</Text>
                 </TouchableOpacity>
                 <TouchableOpacity style={{ flex: 1, padding: 10, backgroundColor: colors.surfaceHighlight, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border }} onPress={() => {
                    const d = new Date(); d.setDate(d.getDate() - 1);
                    setLastPeriodDateInput(getLocalDateStr(d));
                 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>Empezó ayer</Text>
                 </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 10, fontStyle: 'italic' }}>*Esto recalibrará el calendario inmediatamente.</Text>
            </View>

            <TouchableOpacity style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center' }} onPress={handleSaveCycleSettings} disabled={updating}>
              {updating ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>Guardar Ajustes</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- MODAL PARA SALTAR SESIÓN --- */}
      <Modal visible={showSkipModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>Saltar Sesión</Text>
              <TouchableOpacity onPress={() => { setShowSkipModal(false); setSkipReason(''); }}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={{ color: colors.textSecondary, marginBottom: 15, fontSize: 14 }}>Indica brevemente por qué no has podido realizar este entrenamiento:</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, minHeight: 80, textAlignVertical: 'top', marginBottom: 20 }]}
              multiline placeholder="Ej: Falta de tiempo, molestia en el hombro..." placeholderTextColor={colors.textSecondary} value={skipReason} onChangeText={setSkipReason}
            />
            <TouchableOpacity style={{ backgroundColor: colors.warning || '#F59E0B', padding: 16, borderRadius: 12, alignItems: 'center' }} onPress={handleSkipSubmit} disabled={updating}>
              {updating ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>Confirmar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- MODAL DE GEMINI IA --- */}
      <GeminiChatModal 
        isVisible={isChatVisible} 
        onClose={() => setChatVisible(false)} 
        athleteId={selectedAthlete?.id}
        athleteName={selectedAthlete?.name}
        onSaveWorkout={handleSaveWorkoutFromAI} 
      />

      {/* MODAL DE DEPORTE EXTRA */}
      {isExtraSportEnabled && (
        <Modal visible={showSportModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {sportConfig.lib === 'Ionicons' ? (
                     <Ionicons name={sportConfig.icon as any} size={24} color={colors.primary} />
                  ) : (
                     <MaterialCommunityIcons name={sportConfig.icon as any} size={24} color={colors.primary} />
                  )}
                  <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary, marginLeft: 10 }}>Registro Deportivo</Text>
                </View>
                <TouchableOpacity onPress={() => setShowSportModal(false)}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceHighlight, borderRadius: 8, padding: 4, marginBottom: 20 }}>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6, backgroundColor: sportModalTab === 'single' ? colors.primary : 'transparent' }} onPress={() => setSportModalTab('single')}>
                  <Text style={{ fontWeight: '700', fontSize: 12, color: sportModalTab === 'single' ? '#FFF' : colors.textSecondary }}>Día Único</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6, backgroundColor: sportModalTab === 'range' ? colors.primary : 'transparent' }} onPress={() => setSportModalTab('range')}>
                  <Text style={{ fontWeight: '700', fontSize: 12, color: sportModalTab === 'range' ? '#FFF' : colors.textSecondary }}>Rango (Viaje/Camp)</Text>
                </TouchableOpacity>
              </View>

              {sportModalTab === 'single' ? (
                <View>
                  <Text style={{ color: colors.textPrimary, marginBottom: 20, fontSize: 14 }}>
                    ¿Añadir sesión técnica para el <Text style={{fontWeight: '800'}}>{selectedDate}</Text>?
                  </Text>
                  <TouchableOpacity style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center' }} onPress={() => {
                    const newDates = Array.from(new Set([...sportSessions, selectedDate]));
                    handleSaveTechnicalSession(newDates);
                  }} disabled={updating}>
                    {updating ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>Guardar Día</Text>}
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 6 }]}>DESDE (AAAA-MM-DD)</Text>
                      <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]} value={rangeStart} onChangeText={setRangeStart} placeholder="2026-04-01" placeholderTextColor={colors.textSecondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 6 }]}>HASTA (AAAA-MM-DD)</Text>
                      <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]} value={rangeEnd} onChangeText={setRangeEnd} placeholder="2026-04-10" placeholderTextColor={colors.textSecondary} />
                    </View>
                  </View>
                  <TouchableOpacity style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center' }} onPress={handleSaveDateRange} disabled={updating}>
                    {updating ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>Guardar Rango</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>
      )}

      {/* --- SELECTOR DE ATLETA (Para Entrenadores) --- */}
      <Modal visible={showPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
             <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
               <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary }}>Seleccionar Atleta</Text>
               <TouchableOpacity onPress={() => setShowPicker(false)}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
             </View>
             <ScrollView style={{ maxHeight: 300 }}>
               {athletes.map(a => (
                 <TouchableOpacity key={a.id} style={[styles.pickerItem, { borderBottomColor: colors.border }]} onPress={() => handleSelectAthlete(a)}>
                   <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: selectedAthlete?.id === a.id ? '800' : '500' }}>{a.name}</Text>
                   {selectedAthlete?.id === a.id && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                 </TouchableOpacity>
               ))}
             </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 15 },
  headerSubtitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: '#888', marginBottom: 2 },
  headerTitle: { fontSize: 20, fontWeight: '900' },
  viewToggleContainer: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8, padding: 3, marginHorizontal: 8 },
  viewToggleBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewToggleText: { fontSize: 12, fontWeight: '700', color: '#888' },
  headerActionsRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  
  card: { borderRadius: 24, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 4, overflow: 'hidden' },
  absoluteLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, justifyContent: 'center', alignItems: 'center' },
  
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  arrowBtn: { padding: 8 },
  monthYearText: { fontSize: 18, fontWeight: '800', textAlign: 'center', textTransform: 'capitalize' },
  
  // SOLUCIÓN A LOS MÁRGENES: Forzamos el ancho máximo.
  daysHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, width: '100%' },
  dayHeaderText: { width: '14.28%', textAlign: 'center', fontSize: 11, fontWeight: '700' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%' },
  
  // SOLUCIÓN AL SOLAPAMIENTO INTERNO EN MÓVIL: Quitamos aspectRatio y usamos padding para que se autoajuste.
  dayCell: { width: '14.28%', minHeight: 52, justifyContent: 'center', alignItems: 'center', borderRadius: 8, paddingVertical: 4, marginVertical: 2 },
  dateNumberContainer: { width: 26, height: 26, justifyContent: 'center', alignItems: 'center' },
  dayText: { fontSize: 14, fontWeight: '500' },
  cellIconsRow: { flexDirection: 'row', gap: 4, marginTop: 2, minHeight: 14, alignItems: 'center', justifyContent: 'center' },
  
  /* Estilos para la Vista Semanal */
  weekDayCard: { padding: 12, borderRadius: 14, borderWidth: 1 },
  weekDayHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weekDayNumBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.06)', justifyContent: 'center', alignItems: 'center' },
  weekDayNumText: { fontSize: 12, fontWeight: '800' },
  weekDayNameText: { fontSize: 13, fontWeight: '800' },
  weekWorkoutSnippet: { padding: 8, borderRadius: 8, borderWidth: 1, marginTop: 4 },
  weekWorkoutTitle: { fontSize: 13, fontWeight: '800', flex: 1, marginRight: 6 },
  weekWorkoutExercises: { fontSize: 11, fontStyle: 'italic', marginTop: 2 },

  microPhaseCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, minWidth: 150 },
  microPhaseDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  microPhaseName: { fontSize: 13, fontWeight: '800' },
  microPhaseDates: { fontSize: 10, marginTop: 2 },

  phaseCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 20 },
  
  workoutCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  workoutTitle: { fontSize: 16, fontWeight: '800' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 4 },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  tag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  
  trainerActionsRow: { flexDirection: 'row', gap: 8, marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  actionBtnTrainer: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8, borderRadius: 8, gap: 6 },
  actionBtnTrainerText: { fontSize: 12, fontWeight: '700' },

  startWorkoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 16, marginTop: 10 },
  addBtnText: { color: '#FFF', fontWeight: '800', marginLeft: 8, fontSize: 14 },
  
  emptyState: { padding: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', borderStyle: 'dashed' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', maxWidth: 400, borderRadius: 24, padding: 24 },
  modalContentLarge: { width: '90%', maxWidth: 600, height: '80%', borderRadius: 24, padding: 24 },
  pickerItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15 }
});
