import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, Link } from 'expo-router'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
import WellnessModal from '../../src/components/WellnessModal';
import { syncManager } from '../../src/offline';
import { scheduleDailyWellnessReminder, testNotification } from '../../src/notifications';
import { subscribeToWebPush } from '../../src/webPush';

const DAILY_TIPS = [
  "El descanso es tan importante como tu serie más pesada.",
  "La constancia siempre le gana a la intensidad de un solo día.",
  "No busques la perfección hoy, busca moverte un poco más que ayer.",
  "El mejor entrenamiento no es el más duro, es el que realmente llegas a terminar.",
  "Escucha a tu cuerpo: si hoy toca aflojar, se afloja sin culpa.",
  "Tu salud es una carrera de fondo, no un sprint.",
  "Cada día que decides entrenar, ya estás ganando en calidad de vida.",
  "El progreso real se esconde en dominar lo básico y repetirlo.",
  "Construye un cuerpo para vivir mejor, moverte libre y sin dolores.",
  "Tu mayor logro es convertir el ejercicio en un hábito, no en una obligación."
];

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

export default function HomeScreen() {
  const { user, loading: authLoading } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();

  const [athletes, setAthletes] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [wellnessHistory, setWellnessHistory] = useState<any[]>([]); 
  const [activeMicro, setActiveMicro] = useState<any>(null);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showWellness, setShowWellness] = useState(false);
  const [tip] = useState(DAILY_TIPS[Math.floor(Math.random() * DAILY_TIPS.length)]);

  const [showAthleteModal, setShowAthleteModal] = useState(false);
  const [editingAthleteId, setEditingAthleteId] = useState<string | null>(null);
  const [athleteForm, setAthleteForm] = useState({ name: '', email: '', password: '', gender: 'Femenino', sport: '', phone: '' });

  const [feedbackSignature, setFeedbackSignature] = useState('');
  const [hasUnreadFeedback, setHasUnreadFeedback] = useState(false);

  const [viewMicroInfo, setViewMicroInfo] = useState<any>(null);
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);
  const [expandedPreviewId, setExpandedPreviewId] = useState<string | null>(null);
  
  const [showHistory, setShowHistory] = useState(false);

  const [showSkipModal, setShowSkipModal] = useState(false);
  const [skipWorkoutId, setSkipWorkoutId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');

  const isTrainer = user?.role === 'trainer';
  const firstName = user?.name?.split(' ')[0] || 'Atleta';
  const todayStr = new Date().toISOString().split('T')[0];
  const todayLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  const isFemale = ['female', 'mujer', 'femenino'].includes(user?.gender?.toLowerCase() || '');

  // --- LÓGICA DE FASE DEL CICLO AUTOMÁTICA ---
  const getActualDayOneStr = useCallback(() => {
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
    } catch (e) {
      return '';
    }
  }, [wellnessHistory]);

  const cycleData = useMemo(() => {
    try {
      if (!isFemale) return null;
      let actualDayOneStr = extractDateString((user as any)?.last_period_date);
      if (!actualDayOneStr) {
          if (!wellnessHistory || wellnessHistory.length === 0) return null;
          actualDayOneStr = getActualDayOneStr();
      }
      if (!actualDayOneStr) return null;

      const parts = actualDayOneStr.split('-');
      const startY = Number(parts[0]);
      const startM = Number(parts[1]);
      const startD = Number(parts[2]);

      if (isNaN(startY) || isNaN(startM) || isNaN(startD)) return null;

      const actualDayOne = new Date(startY, startM - 1, startD);
      const cycleLength = Number((user as any)?.cycle_length) || 28;
      const periodLength = Number((user as any)?.period_length) || 5;

      return { actualDayOne, cycleLength, periodLength };
    } catch (e) {
      return null;
    }
  }, [wellnessHistory, user, isFemale, getActualDayOneStr]);

  const getPhaseForDate = useCallback((targetDateStr: string) => {
    try {
      if (!cycleData || !cycleData.actualDayOne || isNaN(cycleData.actualDayOne.getTime())) return null;
      if (!targetDateStr) return null;
      
      const parts = targetDateStr.split('-');
      const tY = Number(parts[0]);
      const tM = Number(parts[1]);
      const tD = Number(parts[2]);
      if (isNaN(tY) || isNaN(tM) || isNaN(tD)) return null;

      const targetTime = new Date(tY, tM - 1, tD).getTime();
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
    } catch (e) {
      return null;
    }
  }, [cycleData]);

  const phaseInfo = useMemo(() => getPhaseForDate(todayStr), [getPhaseForDate, todayStr]);

  const loadData = async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      if (isTrainer) {
        const data = await api.getAthletes();
        setAthletes(Array.isArray(data) ? data : []);
      } else {
        const [wData, sData, treeData, wellnessData] = await Promise.all([
          api.getWorkouts(),
          api.getSummary(),
          api.getPeriodizationTree(user.id),
          api.getWellnessHistory(user.id).catch(() => [])
        ]);
        
        const safeWorkouts = Array.isArray(wData) ? [...wData] : [];
        const sortedWorkouts = safeWorkouts.sort((a: any, b: any) => {
          const timeA = a.date ? new Date(a.date).getTime() : 0;
          const timeB = b.date ? new Date(b.date).getTime() : 0;
          return timeB - timeA;
        });

        setWorkouts(sortedWorkouts);
        setSummary(sData);
        setWellnessHistory(Array.isArray(wellnessData) ? wellnessData : []);

        let foundMicro = null;
        const todayWorkout = sortedWorkouts.find((w: any) => w.date === todayStr);
        let targetMicroId = todayWorkout?.microciclo_id || todayWorkout?.microcycle_id;

        if (treeData?.macros && Array.isArray(treeData.macros)) {
          if (targetMicroId) {
            for (const macro of treeData.macros) {
              const micros = macro.microciclos || macro.microcycles || [];
              const micro = micros.find((m: any) => String(m.id || m._id) === String(targetMicroId));
              if (micro) {
                foundMicro = { ...micro, macroNombre: macro.nombre || macro.name || 'Macro', nombre: micro.nombre || micro.name || 'Micro', tipo: micro.tipo || micro.type || 'BASE', color: micro.color || colors.primary };
                break;
              }
            }
          }
          if (!foundMicro) {
            for (const macro of treeData.macros) {
              const micros = macro.microciclos || macro.microcycles || [];
              const micro = micros.find((m: any) => {
                const start = m.fecha_inicio || m.start_date;
                const end = m.fecha_fin || m.end_date;
                return start && end && todayStr >= start && todayStr <= end;
              });
              if (micro) {
                foundMicro = { ...micro, macroNombre: macro.nombre || macro.name || 'Macro', nombre: micro.nombre || micro.name || 'Micro', tipo: micro.tipo || micro.type || 'BASE', color: micro.color || colors.primary };
                break;
              }
            }
          }
        }
        setActiveMicro(foundMicro);
        return sData;
      }
    } catch (e) {
      console.log("Error cargando dashboard:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setUpdating(false);
    }
  };

useFocusEffect(
    useCallback(() => {
      if (authLoading || (!user && !isTrainer)) return;
      
      const init = async () => {
        try {
          await syncManager.syncPendingWorkouts();
        } catch (e) {
          console.log("Error en sync:", e);
        }

        // 1. Si es Entrenador, cargamos los datos directamente y cortamos aquí
        if (isTrainer) { 
          await loadData(true); 
          return; 
        }
        
        // 2. Si es Atleta, cargamos sus datos y comprobamos la fatiga
        const sData = await loadData(true);
        if (sData?.latest_wellness?.date !== todayStr) setShowWellness(true);
        
        // 3. Programamos la notificación al final, SIN 'await' y capturando el error 
        // para que si el navegador web la bloquea, no rompa la pantalla.
        scheduleDailyWellnessReminder().catch(() => {});
      };
      
      init();
    }, [isTrainer, user, authLoading, todayStr])
  );
  useEffect(() => {
    const checkFeedbackStatus = async () => {
      if (!user || isTrainer) return;
      let sig = '';
      workouts.forEach(w => {
        if (w.completed && w.completion_data) {
          w.completion_data.exercise_results?.forEach((ex: any) => { if (ex.coach_note) sig += `${w.id}-${ex.coach_note}|`; });
          w.completion_data.hiit_results?.forEach((block: any) => { block.hiit_exercises?.forEach((ex: any) => { if (ex.coach_note) sig += `${w.id}-${ex.coach_note}|`; }); });
        }
      });
      setFeedbackSignature(sig);
      if (sig) {
        const savedSig = await AsyncStorage.getItem(`feedback_read_${user.id}`);
        setHasUnreadFeedback(savedSig !== sig);
      } else {
        setHasUnreadFeedback(false);
      }
    };
    checkFeedbackStatus();
  }, [workouts, isTrainer, user]);

  const handleManualUpdate = () => { setUpdating(true); loadData(); };

  const openNewAthlete = () => { setEditingAthleteId(null); setAthleteForm({ name: '', email: '', password: '', gender: 'Femenino', sport: '', phone: '' }); setShowAthleteModal(true); };
  const openEditAthlete = (athlete: any) => { setEditingAthleteId(athlete.id); setAthleteForm({ name: athlete.name, email: athlete.email, password: '', gender: athlete.gender || 'Femenino', sport: athlete.sport || '', phone: athlete.phone || '' }); setShowAthleteModal(true); };

  const handleSaveAthlete = async () => {
    if (!athleteForm.name || !athleteForm.email || (!editingAthleteId && !athleteForm.password)) { Alert.alert("Campos incompletos", "Rellena todos los datos obligatorios."); return; }
    try {
      if (editingAthleteId) { if (api.updateAthlete) await api.updateAthlete(editingAthleteId, athleteForm); } 
      else { if (api.createAthlete) await api.createAthlete(athleteForm); }
      setShowAthleteModal(false); loadData();
    } catch (e) { if (Platform.OS !== 'web') Alert.alert("Error", "No se pudo guardar la información."); }
  };

  const executeDelete = async (id: string) => { try { if (api.deleteAthlete) { await api.deleteAthlete(id); loadData(); } } catch (e) { if (Platform.OS !== 'web') Alert.alert("Error", "No se pudo eliminar al deportista."); } };

  const handleDeleteAthlete = (id: string, name: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`¿Seguro que quieres eliminar a ${name}?\nSe borrará todo su historial.`)) executeDelete(id);
    } else {
      Alert.alert("Eliminar", `¿Seguro que quieres borrar a ${name}?`, [
        { text: "Cancelar", style: "cancel" }, { text: "ELIMINAR", style: "destructive", onPress: () => executeDelete(id) }
      ]);
    }
  };

  const handleFeedbackClick = async () => {
    if (user) await AsyncStorage.setItem(`feedback_read_${user.id}`, feedbackSignature);
    setHasUnreadFeedback(false);
    router.push(`/analytics?tab=feedback`);
  };

  const handleSkipSubmit = async () => {
    if (!skipReason.trim()) return Alert.alert("Aviso", "Por favor, indica un motivo para el coach.");
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
      loadData();
    } catch(e) {
      if (Platform.OS !== 'web') Alert.alert("Error", "No se pudo actualizar.");
    } finally {
      setUpdating(false);
    }
  };

const handleShareStatus = () => {
    const latestWellness = summary?.latest_wellness || {};
    const fatigue = latestWellness.fatigue || '?';
    const sleep = latestWellness.sleep_quality || '?';
    const soreness = latestWellness.soreness || '?';
    
    const todayWorkout = workouts.find(w => w.date === todayStr);
    const trained = todayWorkout ? (todayWorkout.completed ? '✅ Completada' : '❌ Pendiente') : 'Libre / Descanso';
    const workoutName = todayWorkout ? ` (${todayWorkout.title})` : '';
    
    // Extraemos el RPE si el entrenamiento está completado y tiene el dato
    let rpeText = '';
    if (todayWorkout?.completed && todayWorkout.completion_data?.rpe) {
      rpeText = `\n   - Esfuerzo Percibido (RPE): ${todayWorkout.completion_data.rpe}/10`;
    }

    const activeMicroText = activeMicro ? `${activeMicro.nombre} [${activeMicro.tipo}]` : 'Planificación Libre';
    
    const phaseText = phaseInfo ? phaseInfo.name : 'Sin registro';

    const discomfortsObj = latestWellness.discomforts || {};
    const discomfortsEntries = Object.entries(discomfortsObj);
    let discomfortsText = '';
    if (discomfortsEntries.length > 0) {
      discomfortsText = '\n🤕 *Molestias:*\n' + discomfortsEntries.map(([k, v]) => `   - ${k}: ${String(v).toUpperCase()}`).join('\n');
    }

    const message = `🏄‍♀️ *Status Diario de ${firstName}*\n` +
                    `📅 ${todayLabel}\n\n` +
                    `🔋 *Estado Físico:*\n` +
                    `   - Fatiga general: ${fatigue}/5\n` +
                    `   - Calidad del sueño: ${sleep}/5\n` +
                    `   - Dolor muscular/agujetas: ${soreness}/5\n` +
                    (isFemale ? `   - Fase del ciclo: ${phaseText}\n` : '') + 
                    discomfortsText + `\n\n` +
                    `🏋️‍♀️ *Entrenamiento:*\n` +
                    `   - Fase actual: ${activeMicroText}\n` +
                    `   - Sesión de hoy: ${trained}${workoutName}` + 
                    rpeText; // Añadimos la línea del RPE al final del bloque
    
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(message)}`);
  };
  const handleCloseMicroInfo = () => {
    setViewMicroInfo(null);
    setExpandedWorkoutId(null);
  };

  const microWorkouts = useMemo(() => {
    if (!viewMicroInfo) return [];
    return workouts.filter(w => String(w.microciclo_id || w.microcycle_id) === String(viewMicroInfo.id || viewMicroInfo._id)).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  }, [workouts, viewMicroInfo]);

  if (authLoading || (!user && !isTrainer)) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  // --- RENDERIZADO MEJORADO: Tarjetas Desplegables ---
  const renderWorkoutCard = (item: any) => {
    let hasSessionFeedback = false;
    if (item.completed && item.completion_data) {
      item.completion_data.exercise_results?.forEach((ex: any) => { if (ex.coach_note) hasSessionFeedback = true; });
      item.completion_data.hiit_results?.forEach((block: any) => { block.hiit_exercises?.forEach((ex: any) => { if (ex.coach_note) hasSessionFeedback = true; }); });
    }

    const isSkipped = item.observations?.includes('[NO COMPLETADA]');
    
    // Verificamos si esta tarjeta es la que está desplegada
    const isExpanded = expandedPreviewId === item.id;
    const toggleExpand = () => setExpandedPreviewId(isExpanded ? null : item.id);

    return (
      <View 
        key={item.id} 
        style={[
          styles.sessionCardWrapper, 
          { 
            backgroundColor: colors.surface, 
            opacity: item.completed ? 0.8 : 1,
            borderColor: isExpanded ? colors.primary : 'transparent',
            borderWidth: isExpanded ? 1 : 0
          }
        ]}
      >
        <View style={styles.sessionCardRow}>
          {/* Clicar en la cabecera expande la preview (o va directo si ya está completada) */}
          <TouchableOpacity 
            style={{flexDirection: 'row', alignItems: 'center', flex: 1}} 
            onPress={() => item.completed ? router.push(`/training-mode?workoutId=${item.id}`) : toggleExpand()}
            activeOpacity={0.7}
          >
            <View style={[styles.avatarCircle, { backgroundColor: item.completed ? (colors.success || '#10B981') + '15' : colors.primary + '15' }]}>
              <Ionicons name={item.completed ? "checkmark-done" : "calendar-outline"} size={20} color={item.completed ? (colors.success || '#10B981') : colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary, textDecorationLine: item.completed ? 'line-through' : 'none' }]}>{String(item.title || 'Sesión')}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.date || 'Sin fecha'}</Text>
              {hasSessionFeedback && <View style={{ backgroundColor: colors.warning || '#F59E0B', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 4, alignSelf: 'flex-start' }}><Text style={{ color: '#FFF', fontSize: 9, fontWeight: '900' }}>FEEDBACK COACH</Text></View>}
              {isSkipped && <Text style={{color: colors.error || '#EF4444', fontSize: 10, fontWeight: '800', marginTop: 4}}>SESIÓN SALTADA</Text>}
            </View>
          </TouchableOpacity>

          {!item.completed && !isTrainer && (
            <TouchableOpacity style={{ padding: 10, marginRight: 5 }} onPress={() => { setSkipWorkoutId(item.id); setShowSkipModal(true); }}>
              <Ionicons name="close-circle-outline" size={26} color={colors.error || '#EF4444'} />
            </TouchableOpacity>
          )}
          
          <TouchableOpacity onPress={() => item.completed ? router.push(`/training-mode?workoutId=${item.id}`) : toggleExpand()}>
            <Ionicons 
              name={item.completed ? "play" : (isExpanded ? "chevron-up" : "chevron-down")} 
              size={20} 
              color={item.completed ? colors.border : colors.primary} 
              style={{padding: 5}} 
            />
          </TouchableOpacity>
        </View>

        {/* --- CONTENIDO DESPLEGABLE (PREVIEW) --- */}
        {isExpanded && !item.completed && (
          <View style={{ marginTop: 15, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 15 }}>
            <Text style={{fontSize: 11, fontWeight: '800', color: colors.textSecondary, marginBottom: 10, letterSpacing: 0.5}}>VISTA PREVIA DE EJERCICIOS</Text>
            
            {item.exercises && item.exercises.length > 0 ? (
              item.exercises.slice(0, 4).map((ex: any, idx: number) => (
                <View key={idx} style={{flexDirection: 'row', alignItems: 'center', marginBottom: 6}}>
                  <Ionicons name="barbell-outline" size={14} color={colors.textSecondary} style={{marginRight: 6}} />
                  <Text style={{color: colors.textPrimary, fontSize: 13, flex: 1}} numberOfLines={1}>
                    {ex.is_hiit_block ? `⚡ Circuito HIIT: ${ex.name}` : `${ex.name}`}
                  </Text>
                  {!ex.is_hiit_block && <Text style={{color: colors.primary, fontSize: 12, fontWeight: '700'}}>{ex.sets}x{ex.reps}</Text>}
                </View>
              ))
            ) : (
              <Text style={{color: colors.textSecondary, fontStyle: 'italic', fontSize: 12}}>No hay ejercicios registrados en esta sesión.</Text>
            )}
            
            {item.exercises?.length > 4 && (
               <Text style={{color: colors.textSecondary, fontSize: 12, fontStyle: 'italic', marginTop: 4}}>+ {item.exercises.length - 4} ejercicios más...</Text>
            )}

            <TouchableOpacity
              style={{backgroundColor: colors.primary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderRadius: 14, marginTop: 15, gap: 8}}
              onPress={() => router.push(`/training-mode?workoutId=${item.id}`)}
              activeOpacity={0.8}
            >
              <Ionicons name="play" size={20} color="#FFF" />
              <Text style={{color: '#FFF', fontWeight: '800', fontSize: 15}}>INICIAR ENTRENAMIENTO</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderTrainerView = () => (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1 }}
      data={athletes}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.container}>
          <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{todayLabel}</Text>
          <View style={styles.headerRow}>
            <View><Text style={[styles.welcomeText, { color: colors.textPrimary }]}>Panel Coach</Text><Text style={{ color: colors.textSecondary, fontSize: 13 }}>Gestionando a {athletes.length} atletas</Text></View>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={openNewAthlete}><Ionicons name="person-add" size={20} color="#FFF" /></TouchableOpacity>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <View style={[styles.athleteCard, { backgroundColor: colors.surface }]}>
          <Link href={`/athlete-detail?id=${item.id}&name=${encodeURIComponent(item.name)}`} asChild>
            <TouchableOpacity style={styles.athleteInfoArea}>
              <View style={[styles.avatar, { backgroundColor: colors.primary + '15' }]}><Text style={{color: colors.primary, fontWeight: '800'}}>{String(item.name || 'A').charAt(0).toUpperCase()}</Text></View>
              <View style={{flex: 1}}><Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.name}</Text><Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>{item.sport || 'Deportista multidisciplinar'}</Text></View>
            </TouchableOpacity>
          </Link>
          <View style={styles.athleteActionsArea}>
            {!!item.phone && (
              <TouchableOpacity onPress={() => Linking.openURL(`https://wa.me/${item.phone.replace(/\D/g, '')}`)} style={styles.iconHitbox}>
                <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => openEditAthlete(item)} style={styles.iconHitbox}><Ionicons name="pencil-outline" size={20} color={colors.textSecondary} /></TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteAthlete(item.id, item.name)} style={styles.iconHitbox}><Ionicons name="trash-outline" size={20} color={colors.error || '#EF4444'} /></TouchableOpacity>
          </View>
        </View>
      )}
    />
  );

  const renderAthleteView = () => {
    const pendingWorkouts = workouts.filter(w => !w.completed).sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')));
    const completedWorkouts = workouts.filter(w => w.completed).sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')));
    
    return (
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
        data={pendingWorkouts}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={colors.primary} />}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: colors.textSecondary, marginBottom: 20, fontStyle: 'italic' }}>No tienes sesiones pendientes.</Text>}
        ListHeaderComponent={
          <View style={styles.container}>
            <View style={styles.headerRow}>
              <View><Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{todayLabel}</Text><Text style={[styles.welcomeText, { color: colors.textPrimary }]}>Hola, {firstName} 💪</Text></View>
              <TouchableOpacity onPress={handleManualUpdate} disabled={updating} style={styles.refreshBtn}>{updating ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="sync" size={24} color={colors.primary} />}</TouchableOpacity>
            </View>

            <View style={[styles.tipCard, { backgroundColor: colors.surfaceHighlight }]}><Ionicons name="bulb-outline" size={16} color={colors.primary} /><Text style={[styles.tipText, { color: colors.textPrimary }]}>{tip}</Text></View>

            {isFemale && phaseInfo && (
              <View style={{ marginBottom: 25 }}>
                <Text style={styles.sectionTitle}>BIOLOGÍA Y RENDIMIENTO (DÍA {phaseInfo.day})</Text>
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

            <TouchableOpacity disabled={!activeMicro} onPress={() => setViewMicroInfo(activeMicro)} style={[styles.phaseCard, { backgroundColor: activeMicro?.color || colors.primary }]}>
              <View style={styles.phaseInfo}><Text style={styles.phaseLabel}>PLANIFICACIÓN ACTUAL</Text><Text style={styles.phaseName}>{activeMicro ? activeMicro.nombre : 'Periodización libre'}</Text><Text style={styles.macroRef}>{activeMicro ? `Macro: ${activeMicro.macroNombre}` : 'Entrena con cabeza'}</Text></View>
              <View style={styles.phaseBadge}><Text style={styles.phaseBadgeText}>{activeMicro?.tipo || 'BASE'}</Text></View>
              {!!activeMicro && <Ionicons name="chevron-forward" size={20} color="#FFF" style={{ marginLeft: 10, opacity: 0.8 }} />}
            </TouchableOpacity>

            <View style={styles.metricsGrid}>
              <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
                <Ionicons name="flash-outline" size={22} color={colors.success || '#10B981'} />
                <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{summary?.latest_wellness?.fatigue || '-'}</Text>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>NIVEL FATIGA</Text>
              </View>
              <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
                <Ionicons name="ribbon-outline" size={22} color={colors.primary} />
                <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{summary?.completion_rate || '0'}%</Text>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>ADHERENCIA</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 25 }}>
              <TouchableOpacity style={[styles.fullBtn, { backgroundColor: colors.surface, flex: 1, marginBottom: 0 }]} onPress={() => setShowWellness(true)}>
                <Ionicons name="fitness-outline" size={20} color={colors.success || '#10B981'} />
                <Text style={[styles.actionText, { color: colors.textPrimary, fontSize: 13 }]}>Anotar Fatiga</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={[styles.fullBtn, { backgroundColor: '#25D366', flex: 1, marginBottom: 0 }]} onPress={handleShareStatus}>
                <Ionicons name="logo-whatsapp" size={20} color="#FFF" />
                <Text style={[styles.actionText, { color: '#FFF', fontSize: 13 }]}>Enviar Status</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.fullBtn, { backgroundColor: colors.primary, marginTop: -15, marginBottom: 30 }]} onPress={testNotification}>
              <Ionicons name="notifications-outline" size={20} color="#FFF" />
              <Text style={[styles.actionText, { color: '#FFF', fontSize: 13 }]}>Probar Notificación</Text>
            </TouchableOpacity>

            {hasUnreadFeedback && (
              <TouchableOpacity style={[styles.feedbackAlertCard, { backgroundColor: colors.warning || '#F59E0B' }]} onPress={handleFeedbackClick}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Ionicons name="chatbubbles" size={28} color="#FFF" /><View style={{ flex: 1 }}><Text style={{ color: '#FFF', fontWeight: '900', fontSize: 16 }}>¡TIENES FEEDBACK NUEVO!</Text><Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 2 }}>El coach ha comentado tu técnica.</Text></View><Ionicons name="chevron-forward" size={24} color="#FFF" /></View>
              </TouchableOpacity>
            )}

            <Text style={styles.sectionTitle}>SESIONES PROGRAMADAS</Text>
          </View>
        }
        renderItem={({ item }) => renderWorkoutCard(item)}
        ListFooterComponent={
          <View style={{ paddingBottom: 40 }}>
            {completedWorkouts.length > 0 && (
              <View style={{ marginHorizontal: 20, marginTop: 15 }}>
                <TouchableOpacity style={[styles.historyToggleBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={() => setShowHistory(!showHistory)}>
                  <Ionicons name="time-outline" size={22} color={colors.textPrimary} />
                  <Text style={[styles.historyToggleText, { color: colors.textPrimary }]}>HISTORIAL DE SESIONES ({completedWorkouts.length})</Text>
                  <Ionicons name={showHistory ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
                </TouchableOpacity>
                {showHistory && <View style={{ marginTop: 10 }}>{completedWorkouts.map(renderWorkoutCard)}</View>}
              </View>
            )}
          </View>
        }
      />
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {isTrainer ? renderTrainerView() : renderAthleteView()}
      <WellnessModal isVisible={showWellness} onClose={() => { setShowWellness(false); loadData(true); }} />
      
      {/* MODAL SALTAR SESIÓN */}
      <Modal visible={showSkipModal} transparent animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={[styles.modalContentInfo, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary, marginBottom: 10 }]}>Saltar Sesión</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 20, textAlign: 'center' }}>¿Por qué no has podido completar el entrenamiento hoy? El coach lo verá para poder ajustar cargas.</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, width: '100%', minHeight: 80, textAlignVertical: 'top' }]}
              placeholder="Ej. Falta de tiempo, enfermedad, lesión..."
              placeholderTextColor={colors.textSecondary}
              value={skipReason}
              onChangeText={setSkipReason}
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 20 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={() => { setShowSkipModal(false); setSkipReason(''); }}><Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.error || '#EF4444' }]} onPress={handleSkipSubmit}><Text style={{ color: '#FFF', fontWeight: '700' }}>Confirmar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showAthleteModal} animationType="slide" transparent><View style={styles.modalOverlay}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.modalContent, { backgroundColor: colors.surface }]}><Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editingAthleteId ? 'Editar Deportista' : 'Añadir Deportista'}</Text><TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Nombre Completo" placeholderTextColor="#888" value={athleteForm.name} onChangeText={t => setAthleteForm({...athleteForm, name: t})} /><TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Email" placeholderTextColor="#888" autoCapitalize="none" keyboardType="email-address" value={athleteForm.email} onChangeText={t => setAthleteForm({...athleteForm, email: t})} /><TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder={editingAthleteId ? "Nueva Contraseña (Opcional)" : "Contraseña"} placeholderTextColor="#888" secureTextEntry value={athleteForm.password} onChangeText={t => setAthleteForm({...athleteForm, password: t})} /><TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Deporte (Ej: Kitesurf freestyle)" placeholderTextColor="#888" value={athleteForm.sport} onChangeText={t => setAthleteForm({...athleteForm, sport: t})} /><TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Número de teléfono (Ej: +34 600...)" placeholderTextColor="#888" keyboardType="phone-pad" value={athleteForm.phone} onChangeText={t => setAthleteForm({...athleteForm, phone: t})} /><View style={styles.genderRow}>{['Masculino', 'Femenino'].map(g => (<TouchableOpacity key={g} style={[styles.genderBtn, { borderColor: colors.border }, athleteForm.gender === g && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setAthleteForm({...athleteForm, gender: g})}><Text style={{ color: athleteForm.gender === g ? '#FFF' : colors.textPrimary, fontWeight: '700' }}>{g}</Text></TouchableOpacity>))}</View><TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={handleSaveAthlete}><Text style={{ color: '#FFF', fontWeight: '800' }}>{editingAthleteId ? 'ACTUALIZAR PERFIL' : 'GUARDAR PERFIL'}</Text></TouchableOpacity><TouchableOpacity onPress={() => setShowAthleteModal(false)} style={{ marginTop: 20, alignItems: 'center' }}><Text style={{ color: colors.textSecondary }}>Cerrar</Text></TouchableOpacity></KeyboardAvoidingView></View></Modal>
      <Modal visible={!!viewMicroInfo} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlayCenter} onPress={handleCloseMicroInfo}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalContentInfo, { backgroundColor: colors.surface }]}>
            {!!viewMicroInfo && (
              <View style={{ alignItems: 'center', width: '100%', flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}><View style={[styles.phaseIconBadge, { backgroundColor: (viewMicroInfo.color || colors.primary) + '15' }]}><Ionicons name="flag" size={24} color={viewMicroInfo.color || colors.primary} /></View><TouchableOpacity onPress={handleCloseMicroInfo}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity></View>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>PERTENECE AL MACROCICLO:</Text><Text style={[styles.infoTitleMacro, { color: colors.textPrimary }]}>{viewMicroInfo.macroNombre}</Text>
                <View style={[styles.divider, { backgroundColor: colors.border }]} /><Text style={[styles.infoLabel, { color: colors.textSecondary }]}>FASE ACTUAL (MICROCICLO):</Text><Text style={[styles.infoTitleMicro, { color: colors.textPrimary }]}>{viewMicroInfo.nombre}</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}><View style={[styles.microTypeBadgeBig, { backgroundColor: (viewMicroInfo.color || colors.primary) }]}><Text style={{ color: '#FFF', fontSize: 12, fontWeight: '900', letterSpacing: 1 }}>{viewMicroInfo.tipo}</Text></View><View style={[styles.datesRow, { marginTop: 0 }]}><Ionicons name="calendar-outline" size={16} color={colors.textSecondary} /><Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginLeft: 6 }}>{(viewMicroInfo.fecha_inicio || '').split('-').reverse().join('/') || 'N/A'} - {(viewMicroInfo.fecha_fin || '').split('-').reverse().join('/') || 'N/A'}</Text></View></View>
                <View style={{ width: '100%', marginTop: 25, flexShrink: 1 }}><Text style={[styles.infoLabel, { color: colors.textSecondary, marginBottom: 10, textAlign: 'left' }]}>SESIONES PROGRAMADAS ({microWorkouts.length})</Text>
                  <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={true}>
                    {microWorkouts.map(wk => (
                      <View key={wk.id} style={[styles.microWorkoutCard, { borderColor: colors.border }]}><TouchableOpacity style={[styles.microWorkoutHeader, { backgroundColor: colors.surfaceHighlight }]} onPress={() => setExpandedWorkoutId(expandedWorkoutId === wk.id ? null : wk.id)}><Ionicons name="barbell-outline" size={18} color={viewMicroInfo.color || colors.primary} /><View style={{ flex: 1, marginLeft: 10 }}><Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>{wk.title}</Text><Text style={{ color: colors.textSecondary, fontSize: 11 }}>{(wk.date || '').split('-').reverse().join('/') || 'Sin fecha'}</Text></View><Ionicons name={expandedWorkoutId === wk.id ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} /></TouchableOpacity>
                        {expandedWorkoutId === wk.id && (<View style={[styles.microWorkoutExercises, { borderTopColor: colors.border }]}>{wk.exercises && wk.exercises.length > 0 ? (wk.exercises.map((ex: any, i: number) => { if (ex.is_hiit_block) { return (<View key={i} style={{ marginBottom: 8 }}><Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 12 }}>⚡ {ex.name}</Text>{ex.hiit_exercises?.map((he: any, j: number) => (<Text key={j} style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 15, marginTop: 2 }}>• {he.name} <Text style={{fontWeight: '600', color: colors.textPrimary}}>({he.duration_reps})</Text></Text>))}</View>); } else { return (<Text key={i} style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>• {ex.name} <Text style={{fontWeight: '600', color: viewMicroInfo.color || colors.primary}}>{ex.sets}x{ex.reps}</Text></Text>); } })) : (<Text style={{ color: colors.textSecondary, fontSize: 12, fontStyle: 'italic' }}>Sin ejercicios registrados.</Text>)}</View>)}
                      </View>
                    ))}
                    {microWorkouts.length === 0 && <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: 15 }}>No hay sesiones asignadas a esta fase todavía.</Text>}
                  </ScrollView>
                </View>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 }, headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 }, dateLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }, welcomeText: { fontSize: 26, fontWeight: '900', marginTop: 2 }, refreshBtn: { padding: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.02)' }, actionBtn: { width: 44, height: 44, borderRadius: 15, justifyContent: 'center', alignItems: 'center' }, athleteCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, marginHorizontal: 20, marginBottom: 12, overflow: 'hidden' }, athleteInfoArea: { flexDirection: 'row', alignItems: 'center', flex: 1, padding: 18 }, athleteActionsArea: { flexDirection: 'row', alignItems: 'center', paddingRight: 15, gap: 10 }, iconHitbox: { padding: 8 }, avatar: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 15 }, cardTitle: { fontSize: 16, fontWeight: '700' }, tipCard: { flexDirection: 'row', padding: 14, borderRadius: 16, marginBottom: 20, alignItems: 'center', gap: 10 }, tipText: { fontSize: 13, fontWeight: '600', flex: 1, fontStyle: 'italic' }, phaseCard: { flexDirection: 'row', padding: 20, borderRadius: 24, marginBottom: 25, alignItems: 'center' }, phaseInfo: { flex: 1 }, phaseLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, phaseName: { color: '#FFF', fontSize: 20, fontWeight: '900', marginTop: 2 }, macroRef: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4 }, phaseBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }, phaseBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' }, metricsGrid: { flexDirection: 'row', gap: 15, marginBottom: 20 }, metricCard: { flex: 1, padding: 18, borderRadius: 22, alignItems: 'center' }, metricValue: { fontSize: 22, fontWeight: '900', marginTop: 5 }, metricLabel: { fontSize: 9, fontWeight: '700', marginTop: 2 }, fullBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 20, marginBottom: 30, gap: 10 }, actionText: { fontWeight: '800', fontSize: 15 }, sectionTitle: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 15, letterSpacing: 1.5, textTransform: 'uppercase' }, 
  
  // Modificaciones para la tarjeta desplegable
  sessionCardWrapper: { padding: 12, paddingLeft: 18, borderRadius: 22, marginHorizontal: 20, marginBottom: 12 },
  sessionCardRow: { flexDirection: 'row', alignItems: 'center' },
  
  avatarCircle: { width: 46, height: 46, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 }, modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }, modalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, paddingBottom: 40 }, modalTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center' }, input: { borderWidth: 1, padding: 16, borderRadius: 15, fontSize: 16 }, genderRow: { flexDirection: 'row', gap: 10, marginBottom: 25 }, genderBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 }, submitBtn: { padding: 18, borderRadius: 18, alignItems: 'center', elevation: 2 }, cycleChipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, dashboardPhaseChip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 }, feedbackAlertCard: { padding: 18, borderRadius: 20, marginBottom: 25, elevation: 3 }, modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }, modalContentInfo: { width: '90%', maxHeight: '85%', margin: 20, padding: 25, borderRadius: 30, alignItems: 'center', elevation: 5 }, phaseIconBadge: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' }, infoLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 10, textAlign: 'center' }, infoTitleMacro: { fontSize: 18, fontWeight: '900', marginTop: 4, textAlign: 'center' }, divider: { height: 1, width: '80%', marginVertical: 15, opacity: 0.5 }, infoTitleMicro: { fontSize: 20, fontWeight: '900', marginTop: 4, textAlign: 'center' }, microTypeBadgeBig: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 }, datesRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.03)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }, microWorkoutCard: { borderWidth: 1, borderRadius: 14, marginBottom: 10, overflow: 'hidden' }, microWorkoutHeader: { flexDirection: 'row', alignItems: 'center', padding: 14 }, microWorkoutExercises: { padding: 14, borderTopWidth: 1 }, historyToggleBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 5 }, historyToggleText: { flex: 1, fontSize: 12, fontWeight: '800', marginLeft: 10, letterSpacing: 1 },
  modalBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  
  // ESTILOS DE LA TARJETA BIOLÓGICA
  insightCard: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  insightHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  insightTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  insightContent: { padding: 15, gap: 8 },
  insightText: { fontSize: 13, lineHeight: 18 },
});
